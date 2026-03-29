import { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';
import { queryOne, queryAll } from '../db/pg.js';

export default async function billingRoutes(fastify: FastifyInstance) {
  // All routes require platform_admin
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/billing/subscriptions — all subscriptions
  fastify.get('/subscriptions', async () => {
    try {
      const subscriptions = await queryAll(
        'SELECT * FROM subscriptions ORDER BY updated_at DESC'
      );
      return ok({ subscriptions });
    } catch {
      return ok({ subscriptions: [] });
    }
  });

  // GET /api/admin/billing/events — webhook event log
  fastify.get('/events', async (request) => {
    const { limit = '50' } = request.query as Record<string, string>;
    try {
      const events = await queryAll(
        'SELECT * FROM billing_events ORDER BY created_at DESC LIMIT $1',
        [parseInt(limit) || 50]
      );
      return ok({ events });
    } catch {
      return ok({ events: [] });
    }
  });

  // GET /api/admin/billing/revenue — business flywheel metrics
  fastify.get('/revenue', async () => {
    try {
      // customer_scores PG table has NO scores_json column -- mrr/cost/ltv unavailable
      // Return 0 for these values (SQLite-only artifact, no data in PG)
      const mrr = 0;
      const costBase = 0;
      const ltv = 0;

      // Token usage by model (all time)
      const tokenUsage = await queryAll<{ model: string; input_tokens: number; output_tokens: number; requests: number }>(
        `SELECT model,
                SUM(input_tokens)::int as input_tokens,
                SUM(output_tokens)::int as output_tokens,
                SUM(request_count)::int as requests
         FROM token_usage_daily
         GROUP BY model
         ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC`
      );

      // Customer funnel
      const totalUsers = ((await queryOne<{ c: number }>(
        "SELECT count(*)::int as c FROM users WHERE role NOT IN ('platform_admin', 'admin')"
      )) ?? { c: 0 }).c;

      const activeUsers = ((await queryOne<{ c: number }>(
        "SELECT count(DISTINCT username)::int as c FROM sessions WHERE last_seen_at > EXTRACT(epoch FROM now()) - 604800"
      )) ?? { c: 0 }).c;

      const payingUsers = ((await queryOne<{ c: number }>(
        "SELECT count(*)::int as c FROM subscriptions WHERE status = 'active'"
      )) ?? { c: 0 }).c;

      const markup = 10;

      return ok({
        mrr,
        costBase,
        costMarkup: costBase * markup,
        margin: mrr - costBase,
        ltv,
        markup,
        funnel: { total: totalUsers, active: activeUsers, paying: payingUsers },
        tokenUsage,
      });
    } catch {
      return ok({ mrr: 0, costBase: 0, costMarkup: 0, margin: 0, ltv: 0, markup: 10, funnel: { total: 0, active: 0, paying: 0 }, tokenUsage: [] });
    }
  });

  // GET /api/admin/billing/stats — summary stats
  fastify.get('/stats', async () => {
    try {
      const total = ((await queryOne<{ count: number }>(
        'SELECT count(*)::int as count FROM subscriptions'
      )) ?? { count: 0 }).count;

      const active = ((await queryOne<{ count: number }>(
        "SELECT count(*)::int as count FROM subscriptions WHERE status = 'active'"
      )) ?? { count: 0 }).count;

      const trialing = ((await queryOne<{ count: number }>(
        "SELECT count(*)::int as count FROM subscriptions WHERE status = 'trialing'"
      )) ?? { count: 0 }).count;

      return ok({ total, active, trialing });
    } catch {
      return ok({ total: 0, active: 0, trialing: 0 });
    }
  });
}
