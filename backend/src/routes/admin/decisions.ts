import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryAll, queryOne } from '../../db/pg-helpers.js';

export default async function decisionsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/decisions — list decisions with filtering
  fastify.get('/', async (req) => {
    const { limit = '50', offset = '0', type, agent } = req.query as Record<string, string>;
    const lim = Math.min(parseInt(limit) || 50, 200);
    const off = parseInt(offset) || 0;

    try {
      let query = `
        SELECT d.id, d.decision_type, d.chosen, d.reasoning, d.alternatives,
               d.project_id, d.agent_id, d.job_id, d.created_at,
               p.name as agent_name
        FROM decision_log d
        LEFT JOIN personas p ON p.id = d.agent_id
      `;
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (type) {
        conditions.push(`d.decision_type = $${idx}`);
        params.push(type);
        idx++;
      }
      if (agent) {
        conditions.push(`d.agent_id = $${idx}`);
        params.push(agent);
        idx++;
      }

      if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
      query += ` ORDER BY d.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
      params.push(lim, off);

      const decisions = await queryAll(query, params);

      // Total count
      let countQuery = 'SELECT count(*)::int as total FROM decision_log';
      const countParams: unknown[] = [];
      const countConditions: string[] = [];
      let ci = 1;
      if (type) { countConditions.push(`decision_type = $${ci}`); countParams.push(type); ci++; }
      if (agent) { countConditions.push(`agent_id = $${ci}`); countParams.push(agent); ci++; }
      if (countConditions.length) countQuery += ' WHERE ' + countConditions.join(' AND ');

      const countRow = await queryOne<{ total: number }>(countQuery, countParams);

      return ok({ decisions, total: countRow?.total ?? 0 });
    } catch {
      return ok({ decisions: [], total: 0 });
    }
  });

  // GET /api/admin/decisions/stats — counts by type and agent
  fastify.get('/stats', async () => {
    try {
      const byType = await queryAll<{ decision_type: string; cnt: number }>(
        'SELECT decision_type, count(*)::int as cnt FROM decision_log GROUP BY decision_type ORDER BY cnt DESC'
      );

      const byAgent = await queryAll<{ agent_id: string; agent_name: string; cnt: number }>(`
        SELECT d.agent_id, p.name as agent_name, count(*)::int as cnt
        FROM decision_log d
        LEFT JOIN personas p ON p.id = d.agent_id
        GROUP BY d.agent_id, p.name
        ORDER BY cnt DESC
      `);

      return ok({ byType, byAgent });
    } catch {
      return ok({ byType: [], byAgent: [] });
    }
  });
}
