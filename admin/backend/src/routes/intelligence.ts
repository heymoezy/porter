import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { queryAll, execute } from '../db/pg.js';

export default async function intelligenceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // Ensure table exists on first load
  await execute(`
    CREATE TABLE IF NOT EXISTS intelligence_feed (
      id TEXT PRIMARY KEY,
      source_agent TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      metadata JSONB DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'new',
      created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
      updated_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
      reviewed_at DOUBLE PRECISION,
      reviewed_by TEXT
    )
  `).catch(() => {});
  await execute(`CREATE INDEX IF NOT EXISTS idx_intel_status_created ON intelligence_feed(status, created_at DESC)`).catch(() => {});
  await execute(`CREATE INDEX IF NOT EXISTS idx_intel_type ON intelligence_feed(entry_type)`).catch(() => {});
  await execute(`CREATE INDEX IF NOT EXISTS idx_intel_agent ON intelligence_feed(source_agent)`).catch(() => {});

  // GET /api/admin/intelligence — list with filters + counts
  fastify.get('/', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const type = q.type || '';
    const status = q.status || '';
    const agent = q.agent || '';
    const search = q.search || '';
    const limit = Math.min(parseInt(q.limit || '50', 10), 200);
    const offset = parseInt(q.offset || '0', 10);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (type) { params.push(type); conditions.push(`entry_type = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    if (agent) { params.push(agent); conditions.push(`source_agent = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`(title ILIKE $${params.length} OR body ILIKE $${params.length})`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const entries = await queryAll<{
      id: string; source_agent: string; entry_type: string;
      title: string; body: string; metadata: Record<string, unknown>;
      status: string; created_at: number; updated_at: number;
      reviewed_at: number | null; reviewed_by: string | null;
    }>(`SELECT * FROM intelligence_feed ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);

    const countRows = await queryAll<{ status: string; entry_type: string; source_agent: string; cnt: string }>(
      `SELECT status, entry_type, source_agent, COUNT(*)::text AS cnt FROM intelligence_feed GROUP BY status, entry_type, source_agent`
    );

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    let total = 0;
    for (const r of countRows) {
      const c = parseInt(r.cnt, 10);
      byStatus[r.status] = (byStatus[r.status] || 0) + c;
      byType[r.entry_type] = (byType[r.entry_type] || 0) + c;
      byAgent[r.source_agent] = (byAgent[r.source_agent] || 0) + c;
      total += c;
    }
    // Deduplicate total (each row counted 3x in the group by)
    total = Object.values(byStatus).reduce((s, n) => s + n, 0);

    return reply.send(ok({ entries, counts: { total, byStatus, byType, byAgent } }));
  });

  // POST /api/admin/intelligence — create entry
  fastify.post('/', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const entryType = body.entry_type as string || body.entryType as string;
    const title = body.title as string;
    const bodyText = body.body as string;
    if (!entryType || !title || !bodyText) {
      return reply.send(err('MISSING_FIELDS', 'entry_type, title, and body are required'));
    }

    const validTypes = new Set(['capability', 'blocker', 'idea', 'gap', 'learning']);
    if (!validTypes.has(entryType)) {
      return reply.send(err('INVALID_TYPE', `entry_type must be one of: ${[...validTypes].join(', ')}`));
    }

    const { randomUUID } = await import('node:crypto');
    const id = randomUUID();
    const sourceAgent = (body.source_agent as string) || (body.sourceAgent as string) || 'admin';
    const metadata = body.metadata || {};

    await execute(
      `INSERT INTO intelligence_feed (id, source_agent, entry_type, title, body, metadata, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'new', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
      [id, sourceAgent, entryType, title, bodyText, JSON.stringify(metadata)]
    );

    return reply.send(ok({ id, source_agent: sourceAgent, entry_type: entryType, title, status: 'new' }));
  });

  // POST /api/admin/intelligence/batch — bulk insert from agents
  fastify.post('/batch', async (request, reply) => {
    const body = request.body as { entries: Array<Record<string, unknown>> };
    if (!body.entries || !Array.isArray(body.entries)) {
      return reply.send(err('MISSING_ENTRIES', 'entries array is required'));
    }

    const { randomUUID } = await import('node:crypto');
    const created: string[] = [];

    for (const entry of body.entries) {
      const id = randomUUID();
      const entryType = (entry.entry_type || entry.entryType) as string;
      const title = entry.title as string;
      const bodyText = entry.body as string;
      const sourceAgent = (entry.source_agent || entry.sourceAgent || 'system') as string;
      if (!entryType || !title || !bodyText) continue;

      await execute(
        `INSERT INTO intelligence_feed (id, source_agent, entry_type, title, body, metadata, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'new', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
        [id, sourceAgent, entryType, title, bodyText, JSON.stringify(entry.metadata || {})]
      );
      created.push(id);
    }

    return reply.send(ok({ created: created.length, ids: created }));
  });

  // PUT /api/admin/intelligence/:id/status — transition status
  fastify.put('/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const status = body.status as string;

    const valid = new Set(['new', 'reviewed', 'acted', 'dismissed']);
    if (!valid.has(status)) {
      return reply.send(err('INVALID_STATUS', `status must be one of: ${[...valid].join(', ')}`));
    }

    const username = request.sessionUser?.username || 'admin';

    await execute(
      `UPDATE intelligence_feed SET status = $1, updated_at = EXTRACT(EPOCH FROM NOW()),
       reviewed_at = CASE WHEN $1 != 'new' AND reviewed_at IS NULL THEN EXTRACT(EPOCH FROM NOW()) ELSE reviewed_at END,
       reviewed_by = CASE WHEN $1 != 'new' AND reviewed_by IS NULL THEN $2 ELSE reviewed_by END
       WHERE id = $3`,
      [status, username, id]
    );

    return reply.send(ok({ id, status }));
  });

  // DELETE /api/admin/intelligence/:id
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await execute('DELETE FROM intelligence_feed WHERE id = $1', [id]);
    return reply.send(ok({ deleted: true, id }));
  });
}
