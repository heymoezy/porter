import { FastifyInstance } from 'fastify';
import { pool } from '../../db/client.js';
import { ok } from '../../lib/envelope.js';

export default async function decisionV1Routes(fastify: FastifyInstance) {
  // GET /api/v1/decisions — paginated decision log
  fastify.get('/', async (request, reply) => {
    const query = request.query as {
      limit?: string;
      offset?: string;
      type?: string; // filter by decision_type
    };
    const limit = Math.min(parseInt(query.limit || '50', 10), 200);
    const offset = parseInt(query.offset || '0', 10);
    const decisionType = query.type || null;

    let sql = 'SELECT * FROM decision_log';
    const params: unknown[] = [];
    let paramIdx = 1;

    if (decisionType) {
      sql += ` WHERE decision_type = $${paramIdx}`;
      params.push(decisionType);
      paramIdx++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(limit, offset);

    let decisions: unknown[] = [];
    let total = 0;
    try {
      const result = await pool.query(sql, params);
      decisions = result.rows;

      // Parse alternatives JSON for each decision
      decisions = (decisions as Record<string, unknown>[]).map((d) => ({
        ...d,
        alternatives: typeof d.alternatives === 'string'
          ? (() => { try { return JSON.parse(String(d.alternatives || '[]')); } catch { return []; } })()
          : (d.alternatives || []),
      }));

      // Count total
      let countSql = 'SELECT COUNT(*) as count FROM decision_log';
      const countParams: unknown[] = [];
      if (decisionType) {
        countSql += ' WHERE decision_type = $1';
        countParams.push(decisionType);
      }
      const countResult = (await pool.query(countSql, countParams)).rows[0] as { count: number } | undefined;
      total = countResult?.count || 0;
    } catch {
      // Table may not exist yet
    }

    return reply.send(ok({
      decisions,
      total,
      limit,
      offset,
    }));
  });
}
