import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryAll } from '../../db/pg-helpers.js';

export default async function routingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/routing — recent routing decisions
  fastify.get('/', async () => {
    try {
      const decisions = await queryAll(
        `SELECT src.id, src.session_id, src.chat_id, src.message_sequence,
                src.gateway_type, src.model_name, src.dispatch_log_id,
                src.created_at,
                g.name as gateway_name
         FROM session_routing_context src
         LEFT JOIN gateways g ON g.id = src.gateway_type
         ORDER BY src.created_at DESC
         LIMIT 100`
      );

      return ok({ decisions, total: decisions.length });
    } catch {
      return ok({ decisions: [], total: 0 });
    }
  });

  // GET /api/admin/routing/feedback — dispatches with outcome scores
  fastify.get('/feedback', async () => {
    try {
      const feedback = await queryAll(
        `SELECT id, gateway_id, model_name, outcome_score,
                latency_ms, created_at, source_agent, intent
         FROM bridge_dispatch_log
         WHERE outcome_score IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 50`
      );

      return ok({ feedback, total: feedback.length });
    } catch {
      return ok({ feedback: [], total: 0 });
    }
  });

  // GET /api/admin/routing/confidence — aggregate outcome scores by gateway
  fastify.get('/confidence', async () => {
    try {
      const confidence = await queryAll<{
        gateway_id: string;
        gateway_name: string | null;
        avg_score: number;
        total_scored: number;
        recent_avg: number;
      }>(
        `SELECT bdl.gateway_id,
                g.name as gateway_name,
                round(avg(bdl.outcome_score)::numeric, 2)::float as avg_score,
                count(*)::int as total_scored,
                round(avg(CASE WHEN bdl.created_at > extract(epoch from now()) - 86400 * 7
                          THEN bdl.outcome_score END)::numeric, 2)::float as recent_avg
         FROM bridge_dispatch_log bdl
         LEFT JOIN gateways g ON g.id = bdl.gateway_id
         WHERE bdl.outcome_score IS NOT NULL
         GROUP BY bdl.gateway_id, g.name
         ORDER BY avg_score DESC`
      );

      return ok({ confidence });
    } catch {
      return ok({ confidence: [] });
    }
  });
}
