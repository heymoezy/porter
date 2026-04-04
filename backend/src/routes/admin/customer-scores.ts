import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryAll, queryOne } from '../../db/pg-helpers.js';

export default async function customerScoresRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/customer-scores — list all customer scores joined with user info
  fastify.get('/', async () => {
    try {
      const rows = await queryAll(
        `SELECT
           cs.username,
           cs.health,
           cs.conversion_score,
           cs.churn_risk,
           cs.viral_score,
           cs.ltv_predicted,
           cs.next_action,
           cs.computed_at,
           u.email,
           u.display_name
         FROM customer_scores cs
         LEFT JOIN users u ON u.username = cs.username
         ORDER BY cs.health DESC`
      );
      return ok({ scores: rows });
    } catch (e) {
      fastify.log.error({ err: e }, 'customer-scores: failed to list scores');
      return ok({ scores: [] });
    }
  });

  // GET /api/admin/customer-scores/stats — aggregate stats
  fastify.get('/stats', async () => {
    try {
      const row = await queryOne<{
        avg_health: string;
        avg_churn: string;
        avg_ltv: string;
        total: string;
      }>(
        `SELECT
           ROUND(AVG(health))::text AS avg_health,
           ROUND(AVG(churn_risk))::text AS avg_churn,
           ROUND(AVG(ltv_predicted)::numeric, 2)::text AS avg_ltv,
           COUNT(*)::text AS total
         FROM customer_scores`
      );
      return ok({
        avg_health: parseInt(row?.avg_health || '0', 10),
        avg_churn: parseInt(row?.avg_churn || '0', 10),
        avg_ltv: parseFloat(row?.avg_ltv || '0'),
        total: parseInt(row?.total || '0', 10),
      });
    } catch (e) {
      fastify.log.error({ err: e }, 'customer-scores: failed to get stats');
      return ok({ avg_health: 0, avg_churn: 0, avg_ltv: 0, total: 0 });
    }
  });
}
