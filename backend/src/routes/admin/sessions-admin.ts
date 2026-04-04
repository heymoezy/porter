import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryAll, queryOne } from '../../db/pg-helpers.js';

export default async function sessionsAdminRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/sessions — list sessions with filtering
  fastify.get('/', async (req) => {
    const { limit = '50', status, agent } = req.query as Record<string, string>;
    const lim = Math.min(parseInt(limit) || 50, 200);

    try {
      let query = `
        SELECT s.id, s.chat_id, s.agent_id, s.username, s.gateway_type,
               s.model_name, s.token_budget, s.tokens_used, s.context_msgs,
               s.status, s.metadata, s.created_at, s.last_active_at, s.closed_at,
               s.compression_events, s.tokens_reclaimed,
               p.name as agent_name
        FROM session_registry s
        LEFT JOIN personas p ON p.id = s.agent_id
      `;
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (status) {
        conditions.push(`s.status = $${idx}`);
        params.push(status);
        idx++;
      }
      if (agent) {
        conditions.push(`s.agent_id = $${idx}`);
        params.push(agent);
        idx++;
      }

      if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
      query += ` ORDER BY s.last_active_at DESC NULLS LAST LIMIT $${idx}`;
      params.push(lim);

      const sessions = await queryAll(query, params);

      return ok({ sessions });
    } catch {
      return ok({ sessions: [] });
    }
  });

  // GET /api/admin/sessions/stats — aggregate session stats
  fastify.get('/stats', async () => {
    try {
      const active = await queryOne<{ cnt: number }>(
        "SELECT count(*)::int as cnt FROM session_registry WHERE status = 'active'"
      );
      const paused = await queryOne<{ cnt: number }>(
        "SELECT count(*)::int as cnt FROM session_registry WHERE status = 'paused'"
      );
      const total = await queryOne<{ cnt: number }>(
        'SELECT count(*)::int as cnt FROM session_registry'
      );
      const tokenAgg = await queryOne<{ total_tokens: number; avg_context: number }>(`
        SELECT coalesce(sum(tokens_used), 0)::bigint as total_tokens,
               coalesce(avg(context_msgs), 0)::int as avg_context
        FROM session_registry
      `);

      const byStatus = await queryAll<{ status: string; cnt: number }>(
        'SELECT status, count(*)::int as cnt FROM session_registry GROUP BY status ORDER BY cnt DESC'
      );

      return ok({
        active: active?.cnt ?? 0,
        paused: paused?.cnt ?? 0,
        total: total?.cnt ?? 0,
        totalTokens: Number(tokenAgg?.total_tokens ?? 0),
        avgContext: tokenAgg?.avg_context ?? 0,
        byStatus,
      });
    } catch {
      return ok({ active: 0, paused: 0, total: 0, totalTokens: 0, avgContext: 0, byStatus: [] });
    }
  });
}
