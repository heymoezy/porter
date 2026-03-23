import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db, pool } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { eq, ne } from 'drizzle-orm';
import { ok, err } from '../../lib/envelope.js';
import { featureFlags } from '../../config.js';
import { z } from 'zod';
import crypto from 'crypto';

const CHILD_BLOCKED_TOOLS = ['delegate_task', 'send_message', 'memory', 'execute_code'];
const MAX_DEPTH = 2;
const MAX_CONCURRENT_CHILDREN = 3;

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
  project_id?: string;
  parent_agent_id?: string | null;
  depth?: number;
  blocked_tools?: string[];
  [key: string]: unknown;
};

function formatAgent(row: PersonaRow) {
  const config = parseJsonField<ConfigBlob>(row.config as string | null | undefined, {});
  const appearance_spec = parseJsonField<Record<string, unknown>>(row.appearanceSpec as string | null | undefined, {});

  return {
    id: row.id,
    name: row.name,
    role: row.role,
    avatar: row.avatar,
    status: row.status,
    agent_group: row.agentGroup,
    preferred_backend: row.preferredBackend,
    fallback_backends: parseJsonField<string[]>(row.fallbackBackends as string | null | undefined, []),
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
  // Ephemeral agent fields
  is_temporary: z.boolean().optional(),
  project_id: z.string().optional(),
  parent_agent_id: z.string().optional(),
  depth: z.number().int().min(0).max(MAX_DEPTH).optional(),
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
    const agents = await db.select().from(schema.personas)
      .where(ne(schema.personas.status, 'retired'));

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

    // Ephemeral agent validation
    if (parsed.data.is_temporary) {
      if (!featureFlags.ephemeralAgents) {
        return reply.code(403).send(err('FEATURE_DISABLED', 'Ephemeral agents are disabled'));
      }

      if (!parsed.data.project_id) {
        return reply.code(400).send(err('INVALID_INPUT', 'Ephemeral agents require a project_id'));
      }

      const depth = parsed.data.depth ?? 0;
      if (depth >= MAX_DEPTH) {
        return reply.code(400).send(err('DEPTH_LIMIT', `Cannot create agent at depth ${depth + 1}. Max depth is ${MAX_DEPTH}.`));
      }

      // Check concurrent children limit for parent
      if (parsed.data.parent_agent_id) {
        const runningChildren = (await pool.query(`
          SELECT COUNT(*) as n FROM agent_jobs
          WHERE parent_agent_id = $1 AND status = 'running'
        `, [parsed.data.parent_agent_id])).rows[0] as { n: number };

        if (runningChildren.n >= MAX_CONCURRENT_CHILDREN) {
          return reply.code(429).send(err('CHILDREN_LIMIT',
            `Parent agent has ${MAX_CONCURRENT_CHILDREN} concurrent children. Wait for one to complete.`));
        }
      }
    }

    const id = 'agent_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const now = new Date().toISOString();
    const config: ConfigBlob = {};
    if (description) config.description = description;

    if (parsed.data.is_temporary) {
      config.project_id = parsed.data.project_id;
      config.parent_agent_id = parsed.data.parent_agent_id ?? null;
      config.depth = (parsed.data.depth ?? 0) + 1; // Child is one level deeper
      config.blocked_tools = CHILD_BLOCKED_TOOLS;
    }

    await db.insert(schema.personas).values({
      id,
      name,
      role: role ?? '',
      agentGroup: agent_group ?? '',
      config: JSON.stringify(config),
      createdAt: now,
      status: 'idle',
      owner: request.sessionUser!.username,
      isTemporary: parsed.data.is_temporary ? 1 : 0,
    });

    const [agent] = await db.select().from(schema.personas)
      .where(eq(schema.personas.id, id));

    return reply.code(201).send(ok({ agent: agent ? formatAgent(agent) : null }));
  });

  // GET /api/v1/agents/:id — get single agent with full detail
  fastify.get('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [agent] = await db.select().from(schema.personas)
      .where(eq(schema.personas.id, id));

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

    const [existing] = await db.select().from(schema.personas)
      .where(eq(schema.personas.id, id));

    if (!existing) {
      return reply.code(404).send(err('AGENT_NOT_FOUND', 'Agent not found'));
    }

    const parsed = updateAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    // Read-modify-write for config (to preserve existing fields)
    const existingConfig = parseJsonField<ConfigBlob>(existing.config as string | null | undefined, {});
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

    await db.update(schema.personas).set(updates)
      .where(eq(schema.personas.id, id));

    const [agent] = await db.select().from(schema.personas)
      .where(eq(schema.personas.id, id));

    return reply.send(ok({ agent: agent ? formatAgent(agent) : null }));
  });

  // DELETE /api/v1/agents/:id — soft delete (retire)
  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [existing] = await db.select().from(schema.personas)
      .where(eq(schema.personas.id, id));

    if (!existing) {
      return reply.code(404).send(err('AGENT_NOT_FOUND', 'Agent not found'));
    }

    await db.update(schema.personas).set({ status: 'retired' })
      .where(eq(schema.personas.id, id));

    // Cancel pending jobs for retired agent (prevent orphaned jobs)
    await pool.query(`
      UPDATE agent_jobs SET status = 'cancelled', completed_at = EXTRACT(EPOCH FROM NOW())
      WHERE agent_id = $1 AND status = 'pending'
    `, [id]);

    // Log the retirement
    await pool.query(`
      INSERT INTO agent_activity (agent_id, event_type, summary)
      VALUES ($1, 'agent_retired', 'Agent retired — pending jobs cancelled')
    `, [id]);

    return reply.send(ok({ retired: true }));
  });

  // GET /api/v1/agents/:id/activity — chronological activity feed with pagination
  fastify.get('/:id/activity', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit, offset } = request.query as { limit?: string; offset?: string };

    const [agent] = await db.select().from(schema.personas)
      .where(eq(schema.personas.id, id));

    if (!agent) {
      return reply.code(404).send(err('AGENT_NOT_FOUND', 'Agent not found'));
    }

    const maxLimit = Math.min(parseInt(limit ?? '50', 10), 200);
    const skip = parseInt(offset ?? '0', 10);

    const rows = (await pool.query(`
      SELECT a.*, j.trigger_type, j.status as job_status
      FROM agent_activity a
      LEFT JOIN agent_jobs j ON j.id = a.job_id
      WHERE a.agent_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2 OFFSET $3
    `, [id, maxLimit, skip])).rows as ActivityRow[];

    const total = (await pool.query(`
      SELECT COUNT(*) as count FROM agent_activity WHERE agent_id = $1
    `, [id])).rows[0] as { count: number };

    return reply.send(ok({
      activity: rows.map(formatActivity),
      agent_id: id,
      total: total.count,
      limit: maxLimit,
      offset: skip,
    }));
  });

  // GET /api/v1/agents/:id/learning-sessions — learning session history for a template
  fastify.get('/:id/learning-sessions', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit: limitStr, offset: offsetStr } = request.query as { limit?: string; offset?: string };

    const limit = Math.min(parseInt(limitStr ?? '20', 10), 100);
    const offset = parseInt(offsetStr ?? '0', 10);

    interface LearningSessionRow {
      id: string;
      template_id: string;
      job_id: string | null;
      sources_visited: string;
      concepts_retained: number;
      confidence_distribution: string;
      capped: number;
      duration_ms: number;
      error: string | null;
      created_at: string;
    }

    const rows = (await pool.query(`
      SELECT * FROM learning_sessions
      WHERE template_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [id, limit, offset])).rows as LearningSessionRow[];

    const parsedRows = rows.map(row => ({
      id: row.id,
      template_id: row.template_id,
      job_id: row.job_id,
      sources_visited: (() => {
        try { return JSON.parse(row.sources_visited); } catch { return []; }
      })(),
      concepts_retained: row.concepts_retained,
      confidence_distribution: (() => {
        try { return JSON.parse(row.confidence_distribution); } catch { return { high: 0, medium: 0, low: 0 }; }
      })(),
      capped: Boolean(row.capped),
      duration_ms: row.duration_ms,
      error: row.error,
      created_at: row.created_at,
    }));

    return reply.send(ok({ sessions: parsedRows, count: parsedRows.length }));
  });

  // GET /api/v1/agents/:id/jobs — agent's job queue
  fastify.get('/:id/jobs', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.query as { status?: string };

    const params: unknown[] = [id];
    let sql = 'SELECT * FROM agent_jobs WHERE agent_id = $1';
    if (status) { sql += ` AND status = $${params.length + 1}`; params.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT 50';

    const rows = (await pool.query(sql, params)).rows;
    return reply.send(ok({ jobs: rows, agent_id: id, count: rows.length }));
  });
}
