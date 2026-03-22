import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { sqlite } from '../../db/client.js';
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

function logCollabEvent(opts: {
  projectId: string;
  collaboratorId: string;
  actorUsername: string;
  eventType: string;
  previousRole?: string | null;
  newRole?: string | null;
  detail?: string | null;
}) {
  sqlite.prepare(`
    INSERT INTO collaboration_events
      (project_id, collaborator_id, actor_username, event_type, previous_role, new_role, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch('now'))
  `).run(
    opts.projectId,
    opts.collaboratorId,
    opts.actorUsername,
    opts.eventType,
    opts.previousRole ?? null,
    opts.newRole ?? null,
    opts.detail ?? null,
  );
}

function cancelDripJobs(collaboratorId: string) {
  sqlite.prepare(`
    UPDATE agent_jobs
    SET status = 'cancelled', completed_at = unixepoch('now')
    WHERE trigger_type = 'invite_drip'
      AND json_extract(trigger_data, '$.collaborator_id') = ?
      AND status = 'pending'
  `).run(collaboratorId);
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

    const collaborators = sqlite.prepare(`
      SELECT
        pc.id, pc.project_id, pc.username, pc.email, pc.role, pc.status,
        pc.invited_by, pc.invited_at, pc.accepted_at, pc.revoked_at, pc.revoked_by,
        pc.drip_count, pc.last_drip_at, pc.created_at, pc.updated_at,
        u.display_name, u.full_name
      FROM project_collaborators pc
      LEFT JOIN users u ON u.username = pc.username
      WHERE pc.project_id = ?
      ORDER BY pc.created_at ASC
    `).all(projectId) as Array<Record<string, unknown>>;

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
    const project = sqlite.prepare(
      `SELECT name FROM projects WHERE id = ?`
    ).get(projectId) as { name: string } | undefined;

    if (!project) {
      return reply.code(404).send(err('PROJECT_NOT_FOUND', 'Project not found'));
    }

    const callerUser = sqlite.prepare(
      `SELECT display_name, full_name FROM users WHERE username = ?`
    ).get(callerUsername) as { display_name: string | null; full_name: string | null } | undefined;

    const inviterName = callerUser?.display_name || callerUser?.full_name || callerUsername;

    const succeeded: Array<{ email: string; role: string; collaborator_id: string; status: string }> = [];
    const failed: Array<{ email: string; reason: string }> = [];

    for (const invitation of parsed.data.invitations) {
      const { email, role } = invitation;

      try {
        // Wrap each invite individually for atomicity
        const result = sqlite.transaction(() => {
          // Check for existing collaborator record
          const existing = sqlite.prepare(
            `SELECT id, status, role, invite_token FROM project_collaborators WHERE project_id = ? AND email = ?`
          ).get(projectId, email) as { id: string; status: string; role: string; invite_token: string | null } | undefined;

          if (existing) {
            if (existing.status === 'active') {
              return { outcome: 'failed', reason: 'already_active' as string };
            }

            if (existing.status === 'pending') {
              // Optionally update role if changed
              if (existing.role !== role) {
                sqlite.prepare(`
                  UPDATE project_collaborators
                  SET role = ?, updated_at = unixepoch('now')
                  WHERE id = ?
                `).run(role, existing.id);
              }
              return { outcome: 'failed', reason: 'already_pending' as string };
            }

            if (existing.status === 'revoked') {
              // Re-invite: restore to pending with new role, clear revoke fields, clear token (will re-use existing record)
              const newToken = crypto.randomBytes(32).toString('hex');
              sqlite.prepare(`
                UPDATE project_collaborators
                SET status = 'pending', role = ?, invite_token = ?,
                    revoked_at = NULL, revoked_by = NULL,
                    invited_by = ?, invited_at = unixepoch('now'),
                    updated_at = unixepoch('now')
                WHERE id = ?
              `).run(role, newToken, callerUsername, existing.id);

              logCollabEvent({
                projectId,
                collaboratorId: existing.id,
                actorUsername: callerUsername,
                eventType: 'reinstated',
                newRole: role,
              });

              return {
                outcome: 'succeeded',
                collaboratorId: existing.id,
                role,
                status: 'pending',
                token: newToken,
              };
            }
          }

          // New invite: check if user exists by email
          const existingUser = sqlite.prepare(
            `SELECT username FROM users WHERE email = ?`
          ).get(email) as { username: string } | undefined;

          let username: string | null = existingUser?.username ?? null;

          if (!username) {
            // Create pending user account
            const localPart = email.split('@')[0]!
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '')
              .slice(0, 20);
            const suffix = crypto.randomBytes(2).toString('hex');
            const candidateUsername = `${localPart}${suffix}`;

            sqlite.prepare(`
              INSERT OR IGNORE INTO users
                (username, email, password_hash, salt, role, status, created_at)
              VALUES (?, ?, '', '', 'operator', 'pending', unixepoch('now'))
            `).run(candidateUsername, email);

            // Retrieve the actual username (may have been set by a race)
            const created = sqlite.prepare(
              `SELECT username FROM users WHERE email = ?`
            ).get(email) as { username: string } | undefined;
            username = created?.username ?? null;
          }

          const token = crypto.randomBytes(32).toString('hex');
          const collaboratorId = crypto.randomUUID();

          sqlite.prepare(`
            INSERT INTO project_collaborators
              (id, project_id, username, email, role, status, invite_token, invited_by, invited_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, unixepoch('now'), unixepoch('now'), unixepoch('now'))
          `).run(collaboratorId, projectId, username, email, role, token, callerUsername);

          logCollabEvent({
            projectId,
            collaboratorId,
            actorUsername: callerUsername,
            eventType: 'invited',
            newRole: role,
          });

          return { outcome: 'succeeded', collaboratorId, role, status: 'pending', token };
        })();

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

    const collab = sqlite.prepare(
      `SELECT id, role, status FROM project_collaborators WHERE id = ? AND project_id = ?`
    ).get(collabId, projectId) as { id: string; role: string; status: string } | undefined;

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

    sqlite.prepare(`
      UPDATE project_collaborators
      SET role = ?, updated_at = unixepoch('now')
      WHERE id = ?
    `).run(newRole, collabId);

    logCollabEvent({
      projectId,
      collaboratorId: collabId,
      actorUsername: callerUsername,
      eventType: 'role_changed',
      previousRole,
      newRole,
    });

    const updated = sqlite.prepare(
      `SELECT * FROM project_collaborators WHERE id = ?`
    ).get(collabId);

    return reply.send(ok({ collaborator: updated }));
  });

  // DELETE /:id/collaborators/:collab_id — revoke
  fastify.delete<{ Params: { id: string; collab_id: string } }>('/:id/collaborators/:collab_id', {
    preHandler: [fastify.requireAuth, fastify.requireProjectAccess('admin')],
  }, async (request, reply) => {
    const { id: projectId, collab_id: collabId } = request.params;
    const callerUsername = request.sessionUser!.username;
    const callerRole = request.projectRole;

    const collab = sqlite.prepare(
      `SELECT id, role, status FROM project_collaborators WHERE id = ? AND project_id = ?`
    ).get(collabId, projectId) as { id: string; role: string; status: string } | undefined;

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

    sqlite.prepare(`
      UPDATE project_collaborators
      SET status = 'revoked', revoked_at = unixepoch('now'), revoked_by = ?, updated_at = unixepoch('now')
      WHERE id = ?
    `).run(callerUsername, collabId);

    cancelDripJobs(collabId);

    logCollabEvent({
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
    const collab = sqlite.prepare(`
      SELECT id, project_id, email, role, username, status
      FROM project_collaborators
      WHERE invite_token = ? AND status = 'pending'
    `).get(token) as {
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

    const existingUser = sqlite.prepare(
      `SELECT username, status, password_hash FROM users WHERE email = ?`
    ).get(collab.email) as { username: string; status: string; password_hash: string } | undefined;

    if (existingUser) {
      username = existingUser.username;
      // Activate pending user and optionally set password
      if (existingUser.status === 'pending' && password) {
        const { hash, salt } = await hashPassword(password);
        sqlite.prepare(`
          UPDATE users
          SET password_hash = ?, salt = ?, status = 'active', email_verified = 1,
              display_name = COALESCE(NULLIF(?, ''), display_name)
          WHERE username = ?
        `).run(hash, salt, display_name ?? '', username);
      } else if (existingUser.status === 'pending') {
        sqlite.prepare(`
          UPDATE users SET status = 'active', email_verified = 1 WHERE username = ?
        `).run(username);
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

      sqlite.prepare(`
        INSERT INTO users
          (username, email, password_hash, salt, role, status, email_verified, display_name, created_at)
        VALUES (?, ?, ?, ?, 'operator', 'active', 1, ?, unixepoch('now'))
      `).run(username, collab.email, hash, salt, display_name ?? null);
    }

    // Activate the collaborator record
    sqlite.prepare(`
      UPDATE project_collaborators
      SET status = 'active', username = ?, accepted_at = unixepoch('now'),
          invite_token = NULL, updated_at = unixepoch('now')
      WHERE id = ?
    `).run(username, collab.id);

    cancelDripJobs(collab.id);

    logCollabEvent({
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
