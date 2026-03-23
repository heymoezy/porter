import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { z } from 'zod';
import crypto from 'crypto';
import { promisify } from 'util';
import { sendInviteEmail } from '../../services/transactional-email.js';
import { scheduleDripReminder } from '../../services/scheduler.js';

const scrypt = promisify(crypto.scrypt);

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const invitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(['view', 'chat', 'edit', 'admin']), // NOT 'owner' — owner cannot be assigned
});

const batchInviteSchema = z.object({
  invitations: z.array(invitationSchema).min(1).max(50),
});

const changeRoleSchema = z.object({
  role: z.enum(['view', 'chat', 'edit', 'admin']),
});

const acceptInviteSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8).optional(),
  display_name: z.string().min(1).max(100).optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 32)) as Buffer;
  return { hash: derived.toString('hex'), salt };
}

async function logCollabEvent(opts: {
  projectId: string;
  collaboratorId: string;
  actorUsername: string;
  eventType: string;
  previousRole?: string | null;
  newRole?: string | null;
  detail?: string | null;
}) {
  await pool.query(`
    INSERT INTO collaboration_events
      (project_id, collaborator_id, actor_username, event_type, previous_role, new_role, detail, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, EXTRACT(EPOCH FROM NOW()))
  `, [
    opts.projectId,
    opts.collaboratorId,
    opts.actorUsername,
    opts.eventType,
    opts.previousRole ?? null,
    opts.newRole ?? null,
    opts.detail ?? null,
  ]);
}

async function cancelDripJobs(collaboratorId: string) {
  await pool.query(`
    UPDATE agent_jobs
    SET status = 'cancelled', completed_at = EXTRACT(EPOCH FROM NOW())
    WHERE trigger_type = 'invite_drip'
      AND trigger_data->>'collaborator_id' = $1
      AND status = 'pending'
  `, [collaboratorId]);
}

// ── Project-scoped collaborator routes (/api/v1/projects/:id/collaborators) ──

export default async function collaboratorV1Routes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions,
) {
  // GET /:id/collaborators — list all collaborators for a project
  fastify.get<{ Params: { id: string } }>('/:id/collaborators', {
    preHandler: [fastify.requireAuth, fastify.requireProjectAccess('view')],
  }, async (request, reply) => {
    const { id: projectId } = request.params;

    const collaborators = (await pool.query(`
      SELECT
        pc.id, pc.project_id, pc.username, pc.email, pc.role, pc.status,
        pc.invited_by, pc.invited_at, pc.accepted_at, pc.revoked_at, pc.revoked_by,
        pc.drip_count, pc.last_drip_at, pc.created_at, pc.updated_at,
        u.display_name, u.full_name
      FROM project_collaborators pc
      LEFT JOIN users u ON u.username = pc.username
      WHERE pc.project_id = $1
      ORDER BY pc.created_at ASC
    `, [projectId])).rows as Array<Record<string, unknown>>;

    return reply.send(ok({ collaborators, count: collaborators.length }));
  });

  // POST /:id/collaborators — batch invite
  fastify.post<{ Params: { id: string } }>('/:id/collaborators', {
    preHandler: [fastify.requireAuth, fastify.requireProjectAccess('edit')],
  }, async (request, reply) => {
    const { id: projectId } = request.params;
    const callerUsername = request.sessionUser!.username;

    // Validate body
    const parsed = batchInviteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    // Load project name for email
    const project = (await pool.query(
      `SELECT name FROM projects WHERE id = $1`, [projectId]
    )).rows[0] as { name: string } | undefined;

    if (!project) {
      return reply.code(404).send(err('PROJECT_NOT_FOUND', 'Project not found'));
    }

    const callerUser = (await pool.query(
      `SELECT display_name, full_name FROM users WHERE username = $1`, [callerUsername]
    )).rows[0] as { display_name: string | null; full_name: string | null } | undefined;

    const inviterName = callerUser?.display_name || callerUser?.full_name || callerUsername;

    const succeeded: Array<{ email: string; role: string; collaborator_id: string; status: string }> = [];
    const failed: Array<{ email: string; reason: string }> = [];

    for (const invitation of parsed.data.invitations) {
      const { email, role } = invitation;

      try {
        // Wrap each invite in its own transaction
        const client = await pool.connect();
        let result: { outcome: string; reason?: string; collaboratorId?: string; role?: string; status?: string; token?: string };
        try {
          await client.query('BEGIN');

          // Check for existing collaborator record
          const existingRow = (await client.query(
            `SELECT id, status, role, invite_token FROM project_collaborators WHERE project_id = $1 AND email = $2`,
            [projectId, email]
          )).rows[0] as { id: string; status: string; role: string; invite_token: string | null } | undefined;

          if (existingRow) {
            if (existingRow.status === 'active') {
              result = { outcome: 'failed', reason: 'already_active' };
            } else if (existingRow.status === 'pending') {
              // Optionally update role if changed
              if (existingRow.role !== role) {
                await client.query(`
                  UPDATE project_collaborators
                  SET role = $1, updated_at = EXTRACT(EPOCH FROM NOW())
                  WHERE id = $2
                `, [role, existingRow.id]);
              }
              result = { outcome: 'failed', reason: 'already_pending' };
            } else if (existingRow.status === 'revoked') {
              // Re-invite: restore to pending with new role
              const newToken = crypto.randomBytes(32).toString('hex');
              await client.query(`
                UPDATE project_collaborators
                SET status = 'pending', role = $1, invite_token = $2,
                    revoked_at = NULL, revoked_by = NULL,
                    invited_by = $3, invited_at = EXTRACT(EPOCH FROM NOW()),
                    updated_at = EXTRACT(EPOCH FROM NOW())
                WHERE id = $4
              `, [role, newToken, callerUsername, existingRow.id]);

              await logCollabEvent({
                projectId,
                collaboratorId: existingRow.id,
                actorUsername: callerUsername,
                eventType: 'reinstated',
                newRole: role,
              });

              result = {
                outcome: 'succeeded',
                collaboratorId: existingRow.id,
                role,
                status: 'pending',
                token: newToken,
              };
            } else {
              result = { outcome: 'failed', reason: 'unknown_status' };
            }
          } else {
            // New invite: check if user exists by email
            const existingUser = (await client.query(
              `SELECT username FROM users WHERE email = $1`, [email]
            )).rows[0] as { username: string } | undefined;

            let username: string | null = existingUser?.username ?? null;

            if (!username) {
              // Create pending user account
              const localPart = email.split('@')[0]!
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '')
                .slice(0, 20);
              const suffix = crypto.randomBytes(2).toString('hex');
              const candidateUsername = `${localPart}${suffix}`;

              await client.query(`
                INSERT INTO users
                  (username, email, password_hash, salt, role, status, created_at)
                VALUES ($1, $2, '', '', 'operator', 'pending', EXTRACT(EPOCH FROM NOW()))
                ON CONFLICT DO NOTHING
              `, [candidateUsername, email]);

              // Retrieve the actual username (may have been set by a race)
              const created = (await client.query(
                `SELECT username FROM users WHERE email = $1`, [email]
              )).rows[0] as { username: string } | undefined;
              username = created?.username ?? null;
            }

            const token = crypto.randomBytes(32).toString('hex');
            const collaboratorId = crypto.randomUUID();

            await client.query(`
              INSERT INTO project_collaborators
                (id, project_id, username, email, role, status, invite_token, invited_by, invited_at, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
            `, [collaboratorId, projectId, username, email, role, token, callerUsername]);

            await logCollabEvent({
              projectId,
              collaboratorId,
              actorUsername: callerUsername,
              eventType: 'invited',
              newRole: role,
            });

            result = { outcome: 'succeeded', collaboratorId, role, status: 'pending', token };
          }

          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }

        if (result.outcome === 'failed') {
          failed.push({ email, reason: result.reason! });
          continue;
        }

        // Send invite email and schedule drip (outside transaction — these are best-effort)
        sendInviteEmail({
          to: email,
          projectName: project.name,
          inviterName,
          role,
          token: result.token!,
        }).catch((e: unknown) => {
          console.error('[collaborators] sendInviteEmail failed for %s: %s', email, e instanceof Error ? e.message : e);
        });

        scheduleDripReminder(result.collaboratorId!, 0);

        succeeded.push({
          email,
          role,
          collaborator_id: result.collaboratorId!,
          status: 'pending',
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[collaborators] invite error for %s: %s', email, msg);
        failed.push({ email, reason: 'internal_error' });
      }
    }

    return reply.code(207).send(ok({
      succeeded,
      failed,
      total: parsed.data.invitations.length,
    }));
  });

  // PATCH /:id/collaborators/:collab_id — change role
  fastify.patch<{ Params: { id: string; collab_id: string } }>('/:id/collaborators/:collab_id', {
    preHandler: [fastify.requireAuth, fastify.requireProjectAccess('admin')],
  }, async (request, reply) => {
    const { id: projectId, collab_id: collabId } = request.params;
    const callerUsername = request.sessionUser!.username;
    const callerRole = request.projectRole;

    const parsed = changeRoleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { role: newRole } = parsed.data;

    const collab = (await pool.query(
      `SELECT id, role, status FROM project_collaborators WHERE id = $1 AND project_id = $2`,
      [collabId, projectId]
    )).rows[0] as { id: string; role: string; status: string } | undefined;

    if (!collab) {
      return reply.code(404).send(err('COLLABORATOR_NOT_FOUND', 'Collaborator not found'));
    }

    // Owner role is immutable — cannot modify the owner collaborator record
    if (collab.role === 'owner') {
      return reply.code(400).send(err('CANNOT_MODIFY_OWNER', 'Cannot modify owner role'));
    }

    // Admin cannot modify peer admins — only owner can
    if (callerRole !== 'owner' && collab.role === 'admin') {
      return reply.code(403).send(err('FORBIDDEN', 'Only owner can modify admin roles'));
    }

    const previousRole = collab.role;

    await pool.query(`
      UPDATE project_collaborators
      SET role = $1, updated_at = EXTRACT(EPOCH FROM NOW())
      WHERE id = $2
    `, [newRole, collabId]);

    await logCollabEvent({
      projectId,
      collaboratorId: collabId,
      actorUsername: callerUsername,
      eventType: 'role_changed',
      previousRole,
      newRole,
    });

    const updated = (await pool.query(
      `SELECT * FROM project_collaborators WHERE id = $1`, [collabId]
    )).rows[0];

    return reply.send(ok({ collaborator: updated }));
  });

  // DELETE /:id/collaborators/:collab_id — revoke
  fastify.delete<{ Params: { id: string; collab_id: string } }>('/:id/collaborators/:collab_id', {
    preHandler: [fastify.requireAuth, fastify.requireProjectAccess('admin')],
  }, async (request, reply) => {
    const { id: projectId, collab_id: collabId } = request.params;
    const callerUsername = request.sessionUser!.username;
    const callerRole = request.projectRole;

    const collab = (await pool.query(
      `SELECT id, role, status FROM project_collaborators WHERE id = $1 AND project_id = $2`,
      [collabId, projectId]
    )).rows[0] as { id: string; role: string; status: string } | undefined;

    if (!collab) {
      return reply.code(404).send(err('COLLABORATOR_NOT_FOUND', 'Collaborator not found'));
    }

    if (collab.role === 'owner') {
      return reply.code(400).send(err('CANNOT_REVOKE_OWNER', 'Cannot revoke the project owner'));
    }

    // Admin cannot revoke peer admins — only owner can
    if (callerRole !== 'owner' && collab.role === 'admin') {
      return reply.code(403).send(err('FORBIDDEN', 'Only owner can revoke admin collaborators'));
    }

    await pool.query(`
      UPDATE project_collaborators
      SET status = 'revoked', revoked_at = EXTRACT(EPOCH FROM NOW()), revoked_by = $1, updated_at = EXTRACT(EPOCH FROM NOW())
      WHERE id = $2
    `, [callerUsername, collabId]);

    await cancelDripJobs(collabId);

    await logCollabEvent({
      projectId,
      collaboratorId: collabId,
      actorUsername: callerUsername,
      eventType: 'revoked',
    });

    return reply.send(ok({ revoked: true }));
  });
}

// ── Accept invite route (/api/v1/collaborators/accept) — NO auth ──────────────

export async function collaboratorAcceptRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions,
) {
  // POST /accept — accept an invite via token
  fastify.post('/accept', async (request, reply) => {
    const parsed = acceptInviteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { token, password, display_name } = parsed.data;

    // Look up pending collaborator by token
    const collab = (await pool.query(`
      SELECT id, project_id, email, role, username, status
      FROM project_collaborators
      WHERE invite_token = $1 AND status = 'pending'
    `, [token])).rows[0] as {
      id: string;
      project_id: string;
      email: string;
      role: string;
      username: string | null;
      status: string;
    } | undefined;

    if (!collab) {
      return reply.code(404).send(err('INVALID_INVITE_TOKEN', 'Invalid or expired invite token'));
    }

    // Resolve or create user account
    let username = collab.username;

    const existingUser = (await pool.query(
      `SELECT username, status, password_hash FROM users WHERE email = $1`, [collab.email]
    )).rows[0] as { username: string; status: string; password_hash: string } | undefined;

    if (existingUser) {
      username = existingUser.username;
      // Activate pending user and optionally set password
      if (existingUser.status === 'pending' && password) {
        const { hash, salt } = await hashPassword(password);
        await pool.query(`
          UPDATE users
          SET password_hash = $1, salt = $2, status = 'active', email_verified = 1,
              display_name = COALESCE(NULLIF($3, ''), display_name)
          WHERE username = $4
        `, [hash, salt, display_name ?? '', username]);
      } else if (existingUser.status === 'pending') {
        await pool.query(`
          UPDATE users SET status = 'active', email_verified = 1 WHERE username = $1
        `, [username]);
      }
    } else {
      // Create new user from scratch
      const localPart = collab.email.split('@')[0]!
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 20);
      const suffix = crypto.randomBytes(2).toString('hex');
      username = `${localPart}${suffix}`;

      let hash = '';
      let salt = '';
      if (password) {
        const derived = await hashPassword(password);
        hash = derived.hash;
        salt = derived.salt;
      }

      await pool.query(`
        INSERT INTO users
          (username, email, password_hash, salt, role, status, email_verified, display_name, created_at)
        VALUES ($1, $2, $3, $4, 'operator', 'active', 1, $5, EXTRACT(EPOCH FROM NOW()))
      `, [username, collab.email, hash, salt, display_name ?? null]);
    }

    // Activate the collaborator record
    await pool.query(`
      UPDATE project_collaborators
      SET status = 'active', username = $1, accepted_at = EXTRACT(EPOCH FROM NOW()),
          invite_token = NULL, updated_at = EXTRACT(EPOCH FROM NOW())
      WHERE id = $2
    `, [username, collab.id]);

    await cancelDripJobs(collab.id);

    await logCollabEvent({
      projectId: collab.project_id,
      collaboratorId: collab.id,
      actorUsername: username!,
      eventType: 'accepted',
      newRole: collab.role,
    });

    return reply.send(ok({
      project_id: collab.project_id,
      role: collab.role,
      username,
    }));
  });
}
