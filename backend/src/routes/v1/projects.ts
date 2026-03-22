import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db, sqlite } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { ok, err } from '../../lib/envelope.js';
import { featureFlags } from '../../config.js';
import { z } from 'zod';
import crypto from 'crypto';
import type { ProjectRole } from '../../lib/roles.js';

function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function formatProject(row: typeof schema.projects.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    status: row.status,
    description: row.description,
    owner_id: row.ownerId,
    milestones: parseJsonField(row.milestones, [] as unknown[]),
    artifacts: parseJsonField(row.artifacts, [] as unknown[]),
    links: parseJsonField(row.links, [] as unknown[]),
    metadata: parseJsonField(row.metadata, {} as Record<string, unknown>),
    deadline: row.deadline,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string().optional(),
  description: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  deadline: z.string().optional(),
});

export default async function projectV1Routes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  // GET /api/v1/projects — list all active projects
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const projects = db.select().from(schema.projects)
      .where(eq(schema.projects.status, 'active'))
      .all();

    return reply.send(ok({
      projects: projects.map(formatProject),
      count: projects.length,
    }));
  });

  // POST /api/v1/projects — create a new project
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { name, type, description } = parsed.data;
    const id = crypto.randomUUID();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    const ownerId = request.sessionUser!.username;
    const now = Date.now() / 1000;

    db.insert(schema.projects).values({
      id,
      name,
      slug,
      type: type ?? 'custom',
      status: 'active',
      description: description ?? null,
      ownerId,
      createdAt: now,
      updatedAt: now,
    }).run();

    // Auto-create owner collaborator record so requireProjectAccess finds the creator
    const ownerUser = sqlite.prepare('SELECT email FROM users WHERE username = ?').get(ownerId) as { email: string | null } | undefined;
    sqlite.prepare(`
      INSERT INTO project_collaborators (id, project_id, username, email, role, status, invited_by, accepted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'owner', 'active', ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      id,
      ownerId,
      ownerUser?.email ?? ownerId + '@placeholder.porter',
      ownerId,
      now,
      now,
      now,
    );

    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.id, id)).get();

    return reply.code(201).send(ok({ project: project ? formatProject(project) : null }));
  });

  // GET /api/v1/projects/:id — get single project
  fastify.get('/:id', {
    preHandler: [fastify.requireAuth, fastify.requireProjectAccess('view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.id, id)).get();

    if (!project) {
      return reply.code(404).send(err('PROJECT_NOT_FOUND', 'Project not found'));
    }

    return reply.send(ok({ project: formatProject(project) }));
  });

  // PUT /api/v1/projects/:id — update a project
  fastify.put('/:id', {
    preHandler: [fastify.requireAuth, fastify.requireProjectAccess('edit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = db.select().from(schema.projects)
      .where(eq(schema.projects.id, id)).get();

    if (!existing) {
      return reply.code(404).send(err('PROJECT_NOT_FOUND', 'Project not found'));
    }

    const parsed = updateProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const updates: Partial<typeof schema.projects.$inferInsert> = {
      updatedAt: Date.now() / 1000,
    };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.type !== undefined) updates.type = parsed.data.type;
    if (parsed.data.deadline !== undefined) updates.deadline = parsed.data.deadline;

    db.update(schema.projects).set(updates)
      .where(eq(schema.projects.id, id)).run();

    // Auto-retire ephemeral agents when project is completed/archived
    if (featureFlags.ephemeralAgents &&
        (parsed.data.status === 'complete' || parsed.data.status === 'archived')) {
      // Find ephemeral agents for this project
      const ephemeralAgents = sqlite.prepare(`
        SELECT id FROM personas
        WHERE is_temporary = 1 AND status != 'retired'
          AND json_extract(config, '$.project_id') = @projectId
      `).all({ projectId: id }) as { id: string }[];

      for (const agent of ephemeralAgents) {
        // Retire the agent
        sqlite.prepare(`
          UPDATE personas SET status = 'retired' WHERE id = @agentId
        `).run({ agentId: agent.id });

        // Cancel their pending jobs
        sqlite.prepare(`
          UPDATE agent_jobs SET status = 'cancelled', completed_at = unixepoch('now')
          WHERE agent_id = @agentId AND status = 'pending'
        `).run({ agentId: agent.id });

        // Log activity — 'agent_retired' event with 'Auto-retired' summary
        const retireStatus = parsed.data.status as string;
        sqlite.prepare(
          `INSERT INTO agent_activity (agent_id, project_id, event_type, summary) VALUES (@agentId, @projectId, 'agent_retired', 'Auto-retired: project marked ' || @retireStatus)`
        ).run({ agentId: agent.id, projectId: id, retireStatus });
      }

      if (ephemeralAgents.length > 0) {
        console.log('[projects] Auto-retired %d ephemeral agent(s) for project %s',
          ephemeralAgents.length, id);
      }
    }

    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.id, id)).get();

    return reply.send(ok({ project: project ? formatProject(project) : null }));
  });

  // DELETE /api/v1/projects/:id — delete a project
  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth, fastify.requireProjectAccess('owner')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = db.select().from(schema.projects)
      .where(eq(schema.projects.id, id)).get();

    if (!existing) {
      return reply.code(404).send(err('PROJECT_NOT_FOUND', 'Project not found'));
    }

    db.delete(schema.projects).where(eq(schema.projects.id, id)).run();

    // Clean up collaboration data on project deletion
    sqlite.prepare('DELETE FROM project_collaborators WHERE project_id = ?').run(id);
    sqlite.prepare('DELETE FROM collaboration_events WHERE project_id = ?').run(id);

    return reply.send(ok({ deleted: true }));
  });

  // GET /api/v1/projects/:id/activity — activity feed for project dashboard
  fastify.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    '/:id/activity',
    { preHandler: [fastify.requireAuth, fastify.requireProjectAccess('view')] },
    async (req, reply) => {
      const { id } = req.params;
      const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
      const offset = parseInt(req.query.offset || '0', 10);

      // Verify project exists
      const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
      if (!project) {
        return reply.code(404).send(err('NOT_FOUND', 'Project not found'));
      }

      // Fetch activity with agent name via LEFT JOIN
      const rows = sqlite.prepare(`
        SELECT
          aa.id,
          aa.agent_id,
          aa.job_id,
          aa.project_id,
          aa.event_type,
          aa.summary,
          aa.detail,
          aa.created_at,
          p.name AS agent_name,
          p.role AS agent_role,
          p.avatar AS agent_avatar
        FROM agent_activity aa
        LEFT JOIN personas p ON p.id = aa.agent_id
        WHERE aa.project_id = @projectId
        ORDER BY aa.created_at DESC
        LIMIT @limit OFFSET @offset
      `).all({ projectId: id, limit, offset }) as Array<{
        id: number; agent_id: string; job_id: string | null;
        project_id: string; event_type: string; summary: string;
        detail: string; created_at: number;
        agent_name: string | null; agent_role: string | null; agent_avatar: string | null;
      }>;

      // Get total count for pagination
      const countRow = sqlite.prepare(
        'SELECT COUNT(*) as total FROM agent_activity WHERE project_id = @projectId'
      ).get({ projectId: id }) as { total: number };

      const events = rows.map(r => ({
        id: r.id,
        agent_id: r.agent_id,
        agent_name: r.agent_name || 'Unknown Agent',
        agent_role: r.agent_role || '',
        agent_avatar: r.agent_avatar || '',
        job_id: r.job_id,
        event_type: r.event_type,
        summary: r.summary,
        detail: r.detail ? JSON.parse(r.detail) : null,
        created_at: r.created_at,
      }));

      return reply.send(ok({ events, total: countRow.total, limit, offset }));
    },
  );
}
