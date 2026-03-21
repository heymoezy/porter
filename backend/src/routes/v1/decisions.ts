import { FastifyInstance } from 'fastify';
import { sqlite } from '../../db/client.js';

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
    const params: Record<string, unknown> = { limit, offset };

    if (decisionType) {
      sql += ' WHERE decision_type = @decisionType';
      params.decisionType = decisionType;
    }

    sql += ' ORDER BY created_at DESC LIMIT @limit OFFSET @offset';

    let decisions: unknown[] = [];
    let total = 0;
    try {
      decisions = sqlite.prepare(sql).all(params);

      // Parse alternatives JSON for each decision
      decisions = (decisions as Record<string, unknown>[]).map((d) => ({
        ...d,
        alternatives: (() => {
          try { return JSON.parse(String(d.alternatives || '[]')); } catch { return []; }
        })(),
      }));

      // Count total
      let countSql = 'SELECT COUNT(*) as count FROM decision_log';
      if (decisionType) countSql += ' WHERE decision_type = @decisionType';
      const countResult = sqlite.prepare(countSql).get(
        decisionType ? { decisionType } : {}
      ) as { count: number } | undefined;
      total = countResult?.count || 0;
    } catch {
      // Table may not exist yet
    }

    return reply.send({
      data: {
        decisions,
        total,
        limit,
        offset,
      },
    });
  });
}
