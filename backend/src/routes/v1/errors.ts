import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, err } from '../../lib/envelope.js';
import { pool } from '../../db/client.js';

const postErrorSchema = z.object({
  message: z.string().min(1).max(2000),
  component: z.string().max(100).optional(),
  stack: z.string().max(10000).optional(),
  severity: z.enum(['error', 'warning', 'info']).default('error'),
  user_id: z.union([z.string(), z.number()]).optional(),
  url: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export default async function errorV1Routes(fastify: FastifyInstance) {
  // POST /api/v1/errors — no auth required (errors fire during auth failures)
  fastify.post('/', async (request, reply) => {
    const parsed = postErrorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err(
        'INVALID_INPUT',
        parsed.error.issues[0]?.message ?? 'Invalid error report',
      ));
    }

    const { message, component, stack, severity, user_id, url, metadata } = parsed.data;

    try {
      const result = await pool.query(`
        INSERT INTO frontend_errors (message, stack, component, severity, user_id, url, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        message,
        stack ?? null,
        component ?? null,
        severity,
        user_id != null ? String(user_id) : null,
        url ?? null,
        metadata ? JSON.stringify(metadata) : '{}',
      ]);

      return reply.code(201).send(ok({ id: result.rows[0].id }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to store error report';
      return reply.code(500).send(err('STORAGE_ERROR', msg));
    }
  });

  // GET /api/v1/errors — requires auth, queryable by severity, component, time range
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const severity = query.severity;
    const component = query.component;
    const since = query.since;   // ISO 8601 string
    const until = query.until;   // ISO 8601 string
    const limit = Math.min(parseInt(query.limit || '50', 10), 200);
    const offset = parseInt(query.offset || '0', 10);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (severity) {
      conditions.push(`severity = $${paramIdx}`);
      params.push(severity);
      paramIdx++;
    }
    if (component) {
      conditions.push(`component = $${paramIdx}`);
      params.push(component);
      paramIdx++;
    }
    if (since) {
      // Convert ISO string to unix epoch for comparison with REAL column
      conditions.push(`created_at >= $${paramIdx}`);
      params.push(new Date(since).getTime() / 1000);
      paramIdx++;
    }
    if (until) {
      conditions.push(`created_at <= $${paramIdx}`);
      params.push(new Date(until).getTime() / 1000);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const rows = (await pool.query(
        `SELECT * FROM frontend_errors ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
      )).rows;

      // Parse metadata JSON for each row
      const errors = (rows as Record<string, unknown>[]).map((row) => ({
        ...row,
        metadata: typeof row.metadata === 'string'
          ? (() => { try { return JSON.parse(String(row.metadata || '{}')); } catch { return {}; } })()
          : (row.metadata || {}),
      }));

      // Count total matching
      const countResult = (await pool.query(
        `SELECT COUNT(*) as count FROM frontend_errors ${whereClause}`,
        params
      )).rows[0] as { count: number } | undefined;
      const total = countResult?.count ?? 0;

      return reply.send(ok({ errors, total, limit, offset }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to query error reports';
      return reply.code(500).send(err('QUERY_ERROR', msg));
    }
  });
}
