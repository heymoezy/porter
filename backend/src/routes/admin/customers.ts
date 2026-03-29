import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/admin-envelope.js';
import { queryAll, queryOne, execute } from '../../db/pg-helpers.js';
import { pool as brain } from '../../db/client.js';

export default async function customersRoutes(fastify: FastifyInstance) {
  // Create tables on startup
  try {
    await brain.query(`
      CREATE TABLE IF NOT EXISTS customer_notes (
        id          TEXT PRIMARY KEY,
        username    TEXT NOT NULL,
        content     TEXT NOT NULL,
        created_by  TEXT NOT NULL DEFAULT 'admin',
        created_at  DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at  DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    await brain.query(`
      CREATE TABLE IF NOT EXISTS customer_tasks (
        id          TEXT PRIMARY KEY,
        username    TEXT NOT NULL,
        title       TEXT NOT NULL,
        assignee    TEXT,
        due_date    TEXT,
        status      TEXT NOT NULL DEFAULT 'open',
        created_by  TEXT NOT NULL DEFAULT 'admin',
        created_at  DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at  DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    await brain.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'acquired'`);
    await brain.query(`
      CREATE TABLE IF NOT EXISTS customer_tags (
        id          TEXT PRIMARY KEY,
        username    TEXT NOT NULL,
        tag         TEXT NOT NULL,
        created_by  TEXT NOT NULL DEFAULT 'admin',
        created_at  DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        UNIQUE(username, tag)
      )
    `);
    await brain.query(`
      CREATE TABLE IF NOT EXISTS admin_segments (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        filters     JSONB NOT NULL DEFAULT '{}',
        created_by  TEXT NOT NULL DEFAULT 'admin',
        created_at  DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at  DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
  } catch (e) {
    fastify.log.error({ err: e }, 'customers: failed to create annotation tables');
  }

  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // ── Notes ─────────────────────────────────────────────────────────────────

  // GET /:username/notes
  fastify.get<{ Params: { username: string } }>('/:username/notes', async (request) => {
    const { username } = request.params;
    const notes = await queryAll(
      'SELECT * FROM customer_notes WHERE username = $1 ORDER BY created_at DESC',
      [username]
    );
    return ok({ notes });
  });

  // POST /:username/notes
  fastify.post<{ Params: { username: string }; Body: { content?: string } }>(
    '/:username/notes',
    async (request, reply) => {
      const { username } = request.params;
      const { content } = (request.body ?? {}) as { content?: string };

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return reply.code(400).send(err('INVALID_CONTENT', 'content must be a non-empty string'));
      }
      if (content.length > 10000) {
        return reply.code(400).send(err('CONTENT_TOO_LONG', 'content must be 10000 chars or fewer'));
      }

      const id = crypto.randomUUID();
      const now = Date.now() / 1000;

      await execute(
        'INSERT INTO customer_notes (id, username, content, created_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, username, content.trim(), 'admin', now, now]
      );

      const note = await queryOne('SELECT * FROM customer_notes WHERE id = $1', [id]);
      return reply.code(201).send(ok({ note }));
    }
  );

  // DELETE /:username/notes/:id
  fastify.delete<{ Params: { username: string; id: string } }>(
    '/:username/notes/:id',
    async (request, reply) => {
      const { username, id } = request.params;
      const result = await execute(
        'DELETE FROM customer_notes WHERE id = $1 AND username = $2',
        [id, username]
      );
      if (result.rowCount === 0) {
        return reply.code(404).send(err('NOT_FOUND', 'Note not found'));
      }
      return ok({ deleted: true });
    }
  );

  // ── Tasks ──────────────────────────────────────────────────────────────────

  // GET /:username/tasks
  fastify.get<{ Params: { username: string } }>('/:username/tasks', async (request) => {
    const { username } = request.params;
    const tasks = await queryAll(
      'SELECT * FROM customer_tasks WHERE username = $1 ORDER BY created_at DESC',
      [username]
    );
    return ok({ tasks });
  });

  // POST /:username/tasks
  fastify.post<{ Params: { username: string }; Body: { title?: string; assignee?: string; due_date?: string } }>(
    '/:username/tasks',
    async (request, reply) => {
      const { username } = request.params;
      const { title, assignee, due_date } = (request.body ?? {}) as {
        title?: string;
        assignee?: string;
        due_date?: string;
      };

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return reply.code(400).send(err('INVALID_TITLE', 'title must be a non-empty string'));
      }
      if (title.length > 255) {
        return reply.code(400).send(err('TITLE_TOO_LONG', 'title must be 255 chars or fewer'));
      }

      const id = crypto.randomUUID();
      const now = Date.now() / 1000;

      await execute(
        'INSERT INTO customer_tasks (id, username, title, assignee, due_date, status, created_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [id, username, title.trim(), assignee ?? null, due_date ?? null, 'open', 'admin', now, now]
      );

      const task = await queryOne('SELECT * FROM customer_tasks WHERE id = $1', [id]);
      return reply.code(201).send(ok({ task }));
    }
  );

  // PATCH /:username/tasks/:id
  const VALID_STATUSES = ['open', 'done', 'cancelled'] as const;

  fastify.patch<{ Params: { username: string; id: string }; Body: { status?: string } }>(
    '/:username/tasks/:id',
    async (request, reply) => {
      const { username, id } = request.params;
      const { status } = (request.body ?? {}) as { status?: string };

      if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
        return reply.code(400).send(err('INVALID_STATUS', `status must be one of: ${VALID_STATUSES.join(', ')}`));
      }

      const now = Date.now() / 1000;
      const result = await execute(
        'UPDATE customer_tasks SET status = $1, updated_at = $2 WHERE id = $3 AND username = $4',
        [status, now, id, username]
      );

      if (result.rowCount === 0) {
        return reply.code(404).send(err('NOT_FOUND', 'Task not found'));
      }

      const task = await queryOne('SELECT * FROM customer_tasks WHERE id = $1', [id]);
      return ok({ task });
    }
  );

  // DELETE /:username/tasks/:id
  fastify.delete<{ Params: { username: string; id: string } }>(
    '/:username/tasks/:id',
    async (request, reply) => {
      const { username, id } = request.params;
      const result = await execute(
        'DELETE FROM customer_tasks WHERE id = $1 AND username = $2',
        [id, username]
      );
      if (result.rowCount === 0) {
        return reply.code(404).send(err('NOT_FOUND', 'Task not found'));
      }
      return ok({ deleted: true });
    }
  );

  // ── Domain Peers ───────────────────────────────────────────────────────────

  // GET /domain-peers/:domain — count other users sharing the same email domain
  fastify.get<{ Params: { domain: string } }>('/domain-peers/:domain', async (request) => {
    const { domain } = request.params;
    // Sanitise: domain must look like "foo.com" — reject if contains @ or spaces
    if (!domain || domain.includes('@') || domain.includes(' ') || !domain.includes('.')) {
      return ok({ count: 0, peers: [] });
    }
    const rows = await brain.query(
      `SELECT username, display_name FROM users
       WHERE email ILIKE $1 AND username != 'system'
       ORDER BY created_at DESC LIMIT 10`,
      [`%@${domain}`]
    );
    return ok({ count: rows.rowCount ?? rows.rows.length, peers: rows.rows });
  });

  // ── Profile PATCH ──────────────────────────────────────────────────────────

  const PROFILE_FIELDS = ['phone', 'company', 'job_title', 'bio', 'social_x', 'social_linkedin', 'social_github'] as const;

  // PATCH /:username/profile — partial update of contact/profile fields
  fastify.patch<{ Params: { username: string }; Body: Partial<Record<string, string | null>> }>(
    '/:username/profile',
    async (request, reply) => {
      const { username } = request.params;
      const body = (request.body ?? {}) as Record<string, string | null>;
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      for (const field of PROFILE_FIELDS) {
        if (field in body) {
          sets.push(`${field} = $${idx++}`);
          params.push(body[field] ?? null);
        }
      }
      if (sets.length === 0) return reply.code(400).send(err('NO_FIELDS', 'No valid fields to update'));
      params.push(username);
      const result = await brain.query(
        `UPDATE users SET ${sets.join(', ')} WHERE username = $${idx} RETURNING username`,
        params
      );
      if (result.rowCount === 0) return reply.code(404).send(err('NOT_FOUND', 'User not found'));
      return ok({ updated: true });
    }
  );

  // ── Pipeline Stage ─────────────────────────────────────────────────────────

  const VALID_STAGES = ['acquired', 'activated', 'revenue', 'churned'] as const;

  // PATCH /:username/stage — update a customer's pipeline stage
  fastify.patch<{ Params: { username: string }; Body: { stage?: string } }>(
    '/:username/stage',
    async (request, reply) => {
      const { username } = request.params;
      const { stage } = (request.body ?? {}) as { stage?: string };

      if (!stage || !(VALID_STAGES as readonly string[]).includes(stage)) {
        return reply.code(400).send(err('INVALID_STAGE', 'stage must be one of: acquired, activated, revenue, churned'));
      }

      const user = await queryOne('SELECT username FROM users WHERE username = $1', [username]);
      if (!user) {
        return reply.code(404).send(err('NOT_FOUND', 'User not found'));
      }

      await execute('UPDATE users SET pipeline_stage = $1 WHERE username = $2', [stage, username]);
      return ok({ username, pipeline_stage: stage });
    }
  );

  // ── Segments ───────────────────────────────────────────────────────────────
  // NOTE: /segments routes registered before /:username/* to avoid param collision

  // GET /segments — list all saved segments
  fastify.get('/segments', async () => {
    const segments = await queryAll('SELECT * FROM admin_segments ORDER BY created_at ASC');
    return ok({ segments });
  });

  // POST /segments — create a named segment
  fastify.post<{ Body: { name?: string; filters?: unknown } }>(
    '/segments',
    async (request, reply) => {
      const { name, filters } = (request.body ?? {}) as { name?: string; filters?: unknown };

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return reply.code(400).send(err('INVALID_NAME', 'name must be a non-empty string'));
      }
      if (name.length > 100) {
        return reply.code(400).send(err('NAME_TOO_LONG', 'name must be 100 chars or fewer'));
      }
      if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
        return reply.code(400).send(err('INVALID_FILTERS', 'filters must be an object'));
      }

      const id = crypto.randomUUID();
      const now = Date.now() / 1000;

      await execute(
        'INSERT INTO admin_segments (id, name, filters, created_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, name.trim(), JSON.stringify(filters), 'admin', now, now]
      );

      const segment = await queryOne('SELECT * FROM admin_segments WHERE id = $1', [id]);
      return reply.code(201).send(ok({ segment }));
    }
  );

  // DELETE /segments/:id — remove a segment
  fastify.delete<{ Params: { id: string } }>(
    '/segments/:id',
    async (request, reply) => {
      const { id } = request.params;
      const result = await execute('DELETE FROM admin_segments WHERE id = $1', [id]);
      if (result.rowCount === 0) {
        return reply.code(404).send(err('NOT_FOUND', 'Segment not found'));
      }
      return ok({ deleted: true });
    }
  );

  // ── Tags ───────────────────────────────────────────────────────────────────

  // GET /:username/tags — list tags for a customer
  fastify.get<{ Params: { username: string } }>('/:username/tags', async (request) => {
    const { username } = request.params;
    const rows = await queryAll<{ tag: string }>(
      'SELECT tag FROM customer_tags WHERE username = $1 ORDER BY tag ASC',
      [username]
    );
    return ok({ tags: rows.map(r => r.tag) });
  });

  // POST /:username/tags/:tag — add a tag to a customer
  fastify.post<{ Params: { username: string; tag: string } }>(
    '/:username/tags/:tag',
    async (request, reply) => {
      const { username, tag } = request.params;

      if (!tag || tag.trim().length === 0) {
        return reply.code(400).send(err('INVALID_TAG', 'tag must be a non-empty string'));
      }
      if (tag.length > 50) {
        return reply.code(400).send(err('TAG_TOO_LONG', 'tag must be 50 chars or fewer'));
      }
      if (!/^[a-zA-Z0-9\- ]+$/.test(tag)) {
        return reply.code(400).send(err('INVALID_TAG_FORMAT', 'tag may only contain letters, numbers, hyphens, and spaces'));
      }

      const id = crypto.randomUUID();
      const now = Date.now() / 1000;

      await execute(
        'INSERT INTO customer_tags (id, username, tag, created_by, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username, tag) DO NOTHING',
        [id, username, tag.trim(), 'admin', now]
      );

      const rows = await queryAll<{ tag: string }>(
        'SELECT tag FROM customer_tags WHERE username = $1 ORDER BY tag ASC',
        [username]
      );
      return reply.code(201).send(ok({ tags: rows.map(r => r.tag) }));
    }
  );

  // DELETE /:username/tags/:tag — remove a tag from a customer
  fastify.delete<{ Params: { username: string; tag: string } }>(
    '/:username/tags/:tag',
    async (request, reply) => {
      const { username, tag } = request.params;
      const result = await execute(
        'DELETE FROM customer_tags WHERE username = $1 AND tag = $2',
        [username, tag]
      );
      if (result.rowCount === 0) {
        return reply.code(404).send(err('NOT_FOUND', 'Tag not found on this customer'));
      }
      return ok({ deleted: true });
    }
  );

  // ── Timeline ───────────────────────────────────────────────────────────────

  interface TimelineEvent {
    id: string;
    source_type: 'note' | 'task' | 'login' | 'chat' | 'agent';
    source_label: string;
    ts: number;
    content: string;
    meta: Record<string, unknown>;
  }

  // GET /:username/timeline
  fastify.get<{ Params: { username: string } }>('/:username/timeline', async (request) => {
    const { username } = request.params;
    const events: TimelineEvent[] = [];

    // Notes
    try {
      const rows = await queryAll<{ id: string; content: string; created_by: string; created_at: number }>(
        'SELECT id, content, created_by, created_at FROM customer_notes WHERE username = $1 ORDER BY created_at DESC LIMIT 50',
        [username]
      );
      for (const row of rows) {
        events.push({
          id: 'note-' + row.id,
          source_type: 'note',
          source_label: 'Admin note',
          ts: row.created_at,
          content: row.content.slice(0, 280),
          meta: { created_by: row.created_by },
        });
      }
    } catch {}

    // Tasks
    try {
      const rows = await queryAll<{ id: string; title: string; status: string; assignee: string | null; due_date: string | null; updated_at: number }>(
        'SELECT id, title, status, assignee, due_date, updated_at FROM customer_tasks WHERE username = $1 ORDER BY updated_at DESC LIMIT 50',
        [username]
      );
      for (const row of rows) {
        events.push({
          id: 'task-' + row.id,
          source_type: 'task',
          source_label: 'Task: ' + row.title,
          ts: row.updated_at,
          content: row.title + ' [' + row.status + ']',
          meta: { status: row.status, assignee: row.assignee, due_date: row.due_date },
        });
      }
    } catch {}

    // Login events (customer_events first, fall back to sessions)
    let loginCount = 0;
    try {
      const rows = await queryAll<{ id: string; ip_address: string | null; country: string | null; created_at: number }>(
        "SELECT CONCAT('evt-', created_at::text) as id, ip_address, country, created_at FROM customer_events WHERE username = $1 AND event_type = 'login' ORDER BY created_at DESC LIMIT 20",
        [username]
      );
      loginCount = rows.length;
      for (const row of rows) {
        const loc = [row.country ? 'from ' + row.country : null, row.ip_address ? '· ' + row.ip_address : null].filter(Boolean).join(' ');
        events.push({
          id: row.id,
          source_type: 'login',
          source_label: 'Login',
          ts: row.created_at,
          content: 'Logged in' + (loc ? ' ' + loc : ''),
          meta: { ip: row.ip_address, country: row.country },
        });
      }
    } catch {}

    if (loginCount === 0) {
      try {
        const rows = await queryAll<{ id: string; ip_address: string | null; created_at: number }>(
          "SELECT CONCAT('sess-', created_at::text) as id, ip_address, created_at FROM sessions WHERE username = $1 ORDER BY created_at DESC LIMIT 20",
          [username]
        );
        for (const row of rows) {
          events.push({
            id: row.id,
            source_type: 'login',
            source_label: 'Login',
            ts: row.created_at,
            content: 'Logged in' + (row.ip_address ? ' · ' + row.ip_address : ''),
            meta: { ip: row.ip_address, country: null },
          });
        }
      } catch {}
    }

    // Chat sessions
    try {
      const rows = await queryAll<{ id: string; title: string | null; created_at: number }>(
        "SELECT CONCAT('chat-', created_at::text) as id, title, created_at FROM chats WHERE username = $1 ORDER BY created_at DESC LIMIT 20",
        [username]
      );
      for (const row of rows) {
        events.push({
          id: row.id,
          source_type: 'chat',
          source_label: 'Chat session',
          ts: row.created_at,
          content: row.title || 'Chat session',
          meta: {},
        });
      }
    } catch {}

    // Agent creation
    try {
      const rows = await queryAll<{ id: string; name: string; status: string; created_at: number }>(
        "SELECT CONCAT('agent-', created_at::text) as id, name, status, created_at FROM personas WHERE owner = $1 AND COALESCE(is_system, 0) = 0 ORDER BY created_at DESC LIMIT 20",
        [username]
      );
      for (const row of rows) {
        events.push({
          id: row.id,
          source_type: 'agent',
          source_label: 'Agent created',
          ts: row.created_at,
          content: 'Agent "' + row.name + '" created',
          meta: { status: row.status },
        });
      }
    } catch {}

    // Sort newest-first, cap at 100
    events.sort((a, b) => b.ts - a.ts);
    return ok({ events: events.slice(0, 100) });
  });

  // ── Agent Conversations ────────────────────────────────────────────────────

  interface ConversationStep {
    chain_id: string;
    run_id: string;
    from_agent: string;
    to_agent: string;
    message: string;
    response: string | null;
    status: string;
    step_num: number;
    created_at: number;
    error: string | null;
    model: string | null;
  }

  interface ConversationThread {
    chain_id: string;
    started_at: number;
    last_activity_at: number;
    step_count: number;
    agents_involved: string[];
    steps: ConversationStep[];
  }

  // GET /:username/conversations — agent-to-agent conversation threads for a customer
  fastify.get<{ Params: { username: string } }>('/:username/conversations', async (request) => {
    const { username } = request.params;

    try {
      let rows: ConversationStep[] = [];

      // Approach 1: via project_id linkage (preferred)
      try {
        const result = await brain.query<ConversationStep>(
          `SELECT
             am.chain_id,
             am.run_id,
             am.from_agent,
             am.to_agent,
             am.message,
             am.response,
             am.status,
             am.step_num,
             am.created_at,
             am.error,
             am.model
           FROM agent_messages am
           WHERE am.project_id IN (
             SELECT id FROM projects WHERE owner_id = $1
           )
           AND am.chain_id IS NOT NULL
           ORDER BY am.chain_id, am.step_num ASC, am.created_at ASC
           LIMIT 200`,
          [username]
        );
        rows = result.rows;
      } catch (e) {
        fastify.log.warn({ err: e }, 'conversations: project_id approach failed, trying fallback');
      }

      // Approach 2: direct username mention in message (fallback when no rows found)
      if (rows.length === 0) {
        try {
          const result = await brain.query<ConversationStep>(
            `SELECT
               am.chain_id,
               am.run_id,
               am.from_agent,
               am.to_agent,
               am.message,
               am.response,
               am.status,
               am.step_num,
               am.created_at,
               am.error,
               am.model
             FROM agent_messages am
             WHERE (am.message ILIKE $2 OR am.response ILIKE $2)
             AND am.chain_id IS NOT NULL
             ORDER BY am.created_at DESC
             LIMIT 100`,
            [username, `%${username}%`]
          );
          rows = result.rows;
        } catch (e) {
          fastify.log.warn({ err: e }, 'conversations: fallback approach also failed');
        }
      }

      if (rows.length === 0) {
        return ok({ conversations: [] });
      }

      // Group rows by chain_id
      const threadMap = new Map<string, ConversationStep[]>();
      for (const row of rows) {
        const chain = row.chain_id;
        if (!threadMap.has(chain)) threadMap.set(chain, []);
        threadMap.get(chain)!.push(row);
      }

      const threads: ConversationThread[] = [];
      for (const [chain_id, steps] of threadMap) {
        const sortedSteps = steps.sort((a, b) => a.step_num - b.step_num || a.created_at - b.created_at);
        const timestamps = sortedSteps.map(s => Number(s.created_at));
        const agentNames = new Set<string>();
        for (const s of sortedSteps) {
          if (s.from_agent) agentNames.add(s.from_agent);
          if (s.to_agent) agentNames.add(s.to_agent);
        }
        threads.push({
          chain_id,
          started_at: Math.min(...timestamps),
          last_activity_at: Math.max(...timestamps),
          step_count: sortedSteps.length,
          agents_involved: Array.from(agentNames),
          steps: sortedSteps,
        });
      }

      // Sort threads by last_activity_at DESC, cap at 20
      threads.sort((a, b) => b.last_activity_at - a.last_activity_at);
      return ok({ conversations: threads.slice(0, 20) });

    } catch (e) {
      fastify.log.error({ err: e }, 'conversations: unexpected error');
      return ok({ conversations: [] });
    }
  });
}
