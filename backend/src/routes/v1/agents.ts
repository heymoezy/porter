import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db, sqlite } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { eq, ne } from 'drizzle-orm';
import { ok, err } from '../../lib/envelope.js';
import { z } from 'zod';
import crypto from 'crypto';

function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

type PersonaRow = typeof schema.personas.$inferSelect;
type ConfigBlob = {
  description?: string;
  skills?: string[];
  tools?: string[];
  awareness_mode?: string;
  [key: string]: unknown;
};

function formatAgent(row: PersonaRow) {
  const config = parseJsonField<ConfigBlob>(row.config, {});
  const appearance_spec = parseJsonField<Record<string, unknown>>(row.appearanceSpec, {});

  return {
    id: row.id,
    name: row.name,
    role: row.role,
    avatar: row.avatar,
    status: row.status,
    agent_group: row.agentGroup,
    preferred_backend: row.preferredBackend,
    fallback_backends: parseJsonField<string[]>(row.fallbackBackends, []),
    soul_hash: row.soulHash,
    owner: row.owner,
    is_system: Boolean(row.isSystem),
    is_public: Boolean(row.isPublic),
    is_locked: Boolean(row.isLocked),
    is_master: Boolean(row.isMaster),
    orchestrator_only: Boolean(row.orchestratorOnly),
    is_temporary: Boolean(row.isTemporary),
    managed_by_porter: Boolean(row.managedByPorter),
    appearance_style: row.appearanceStyle,
    appearance_spec,
    skin_asset_path: row.skinAssetPath,
    portrait_asset_path: row.portraitAssetPath,
    sort_order: row.sortOrder,
    created_at: row.createdAt,
    last_active: row.lastActive,
    heartbeat_enabled: Boolean(row.heartbeatEnabled),
    heartbeat_cron: row.heartbeatCron,
    last_heartbeat: row.lastHeartbeat,
    // Merged config fields
    config,
    description: config.description ?? '',
    skills: config.skills ?? [],
    tools: config.tools ?? [],
    awareness_mode: config.awareness_mode ?? 'aware',
  };
}

interface ActivityRow {
  id: number;
  agent_id: string;
  job_id: string | null;
  project_id: string | null;
  event_type: string;
  summary: string | null;
  detail: string | null;
  created_at: number;
  trigger_type?: string;
  job_status?: string;
}

function formatActivity(row: ActivityRow) {
  return {
    id: row.id,
    agent_id: row.agent_id,
    job_id: row.job_id,
    project_id: row.project_id,
    event_type: row.event_type,
    summary: row.summary,
    detail: row.detail ? parseJsonField(row.detail, {}) : null,
    created_at: row.created_at,
    trigger_type: row.trigger_type ?? null,
    job_status: row.job_status ?? null,
  };
}

const createAgentSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.string().optional(),
  agent_group: z.string().optional(),
  description: z.string().optional(),
});

const updateAgentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  agent_group: z.string().optional(),
});

export default async function agentV1Routes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  // GET /api/v1/agents — list all active agents
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const agents = db.select().from(schema.personas)
      .where(ne(schema.personas.status, 'retired'))
      .all();

    // Sort by sort_order ascending (drizzle orderBy not available without import, sort in JS)
    agents.sort((a, b) => (a.sortOrder ?? 50) - (b.sortOrder ?? 50));

    return reply.send(ok({
      agents: agents.map(formatAgent),
      count: agents.length,
    }));
  });

  // POST /api/v1/agents — create a new agent
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const parsed = createAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { name, role, agent_group, description } = parsed.data;
    const id = 'agent_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const now = new Date().toISOString();
    const config: ConfigBlob = {};
    if (description) config.description = description;

    db.insert(schema.personas).values({
      id,
      name,
      role: role ?? '',
      agentGroup: agent_group ?? '',
      config: JSON.stringify(config),
      createdAt: now,
      status: 'idle',
      owner: request.sessionUser!.username,
    }).run();

    const agent = db.select().from(schema.personas)
      .where(eq(schema.personas.id, id)).get();

    return reply.code(201).send(ok({ agent: agent ? formatAgent(agent) : null }));
  });

  // GET /api/v1/agents/:id — get single agent with full detail
  fastify.get('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const agent = db.select().from(schema.personas)
      .where(eq(schema.personas.id, id)).get();

    if (!agent) {
      return reply.code(404).send(err('AGENT_NOT_FOUND', 'Agent not found'));
    }

    return reply.send(ok({ agent: formatAgent(agent) }));
  });

  // PUT /api/v1/agents/:id — update agent
  fastify.put('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = db.select().from(schema.personas)
      .where(eq(schema.personas.id, id)).get();

    if (!existing) {
      return reply.code(404).send(err('AGENT_NOT_FOUND', 'Agent not found'));
    }

    const parsed = updateAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    // Read-modify-write for config (to preserve existing fields)
    const existingConfig = parseJsonField<ConfigBlob>(existing.config, {});
    if (parsed.data.description !== undefined) {
      existingConfig.description = parsed.data.description;
    }

    const updates: Partial<typeof schema.personas.$inferInsert> = {
      config: JSON.stringify(existingConfig),
    };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.role !== undefined) updates.role = parsed.data.role;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.agent_group !== undefined) updates.agentGroup = parsed.data.agent_group;

    db.update(schema.personas).set(updates)
      .where(eq(schema.personas.id, id)).run();

    const agent = db.select().from(schema.personas)
      .where(eq(schema.personas.id, id)).get();

    return reply.send(ok({ agent: agent ? formatAgent(agent) : null }));
  });

  // DELETE /api/v1/agents/:id — soft delete (retire)
  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = db.select().from(schema.personas)
      .where(eq(schema.personas.id, id)).get();

    if (!existing) {
      return reply.code(404).send(err('AGENT_NOT_FOUND', 'Agent not found'));
    }

    db.update(schema.personas).set({ status: 'retired' })
      .where(eq(schema.personas.id, id)).run();

    return reply.send(ok({ retired: true }));
  });

  // GET /api/v1/agents/:id/activity — chronological activity feed with pagination
  fastify.get('/:id/activity', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit, offset } = request.query as { limit?: string; offset?: string };

    const agent = db.select().from(schema.personas)
      .where(eq(schema.personas.id, id)).get();

    if (!agent) {
      return reply.code(404).send(err('AGENT_NOT_FOUND', 'Agent not found'));
    }

    const maxLimit = Math.min(parseInt(limit ?? '50', 10), 200);
    const skip = parseInt(offset ?? '0', 10);

    const rows = sqlite.prepare(`
      SELECT a.*, j.trigger_type, j.status as job_status
      FROM agent_activity a
      LEFT JOIN agent_jobs j ON j.id = a.job_id
      WHERE a.agent_id = @agentId
      ORDER BY a.created_at DESC
      LIMIT @limit OFFSET @offset
    `).all({ agentId: id, limit: maxLimit, offset: skip }) as ActivityRow[];

    const total = sqlite.prepare(`
      SELECT COUNT(*) as count FROM agent_activity WHERE agent_id = ?
    `).get(id) as { count: number };

    return reply.send(ok({
      activity: rows.map(formatActivity),
      agent_id: id,
      total: total.count,
      limit: maxLimit,
      offset: skip,
    }));
  });

  // GET /api/v1/agents/:id/jobs — agent's job queue
  fastify.get('/:id/jobs', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.query as { status?: string };

    let sql = 'SELECT * FROM agent_jobs WHERE agent_id = @agentId';
    const params: Record<string, unknown> = { agentId: id };
    if (status) { sql += ' AND status = @status'; params.status = status; }
    sql += ' ORDER BY created_at DESC LIMIT 50';

    const rows = sqlite.prepare(sql).all(params);
    return reply.send(ok({ jobs: rows, agent_id: id, count: rows.length }));
  });
}
