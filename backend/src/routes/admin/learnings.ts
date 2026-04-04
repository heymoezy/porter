import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryAll, queryOne } from '../../db/pg-helpers.js';

export default async function learningsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/learnings — list session learnings
  fastify.get('/', async (req) => {
    const { limit, source, backend } = req.query as {
      limit?: string; source?: string; backend?: string;
    };
    const maxRows = Math.min(parseInt(limit || '50', 10) || 50, 200);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (source) {
      conditions.push(`source = $${idx++}`);
      params.push(source);
    }
    if (backend) {
      conditions.push(`backend_used = $${idx++}`);
      params.push(backend);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(maxRows);

    const rows = await queryAll<{
      session_id: string;
      source: string;
      learnings: string;
      backend_used: string | null;
      extracted_at: number;
    }>(
      `SELECT session_id, source, learnings, backend_used, extracted_at
       FROM session_learnings
       ${where}
       ORDER BY extracted_at DESC
       LIMIT $${idx}`,
      params
    );

    return ok({ learnings: rows, count: rows.length });
  });

  // GET /api/admin/learnings/stats — aggregate stats
  fastify.get('/stats', async () => {
    const total = await queryOne<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM session_learnings'
    );

    const bySource = await queryAll<{ source: string; count: string }>(
      `SELECT COALESCE(NULLIF(source, ''), 'unknown') AS source, COUNT(*)::text AS count
       FROM session_learnings GROUP BY source ORDER BY COUNT(*) DESC`
    );

    const byBackend = await queryAll<{ backend: string; count: string }>(
      `SELECT COALESCE(NULLIF(backend_used, ''), 'unknown') AS backend, COUNT(*)::text AS count
       FROM session_learnings GROUP BY backend_used ORDER BY COUNT(*) DESC`
    );

    return ok({
      total: parseInt(total?.count || '0', 10),
      bySource: bySource.map(r => ({ source: r.source, count: parseInt(r.count, 10) })),
      byBackend: byBackend.map(r => ({ backend: r.backend, count: parseInt(r.count, 10) })),
    });
  });
}
