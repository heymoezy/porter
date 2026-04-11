import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryOne, queryAll } from '../../db/pg-helpers.js';

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

  // GET /api/admin/billing/usage — per-user usage for current period
  fastify.get('/usage', async () => {
    try {
      // Dispatches per user in last 30 days
      const usage = await queryAll<{
        username: string;
        dispatches: number;
        input_tokens: number;
        output_tokens: number;
        gateways: number;
      }>(
        `SELECT
           COALESCE(username, 'anonymous') AS username,
           COUNT(*)::int AS dispatches,
           COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
           COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
           COUNT(DISTINCT gateway_type)::int AS gateways
         FROM bridge_dispatch_log
         WHERE created_at > EXTRACT(epoch FROM now()) - 2592000
         GROUP BY username
         ORDER BY dispatches DESC`
      );

      // Total usage across all users
      const total = usage.reduce(
        (acc, u) => ({
          dispatches: acc.dispatches + u.dispatches,
          inputTokens: acc.inputTokens + u.input_tokens,
          outputTokens: acc.outputTokens + u.output_tokens,
        }),
        { dispatches: 0, inputTokens: 0, outputTokens: 0 }
      );

      return ok({ period: '30d', usage, total });
    } catch {
      return ok({ period: '30d', usage: [], total: { dispatches: 0, inputTokens: 0, outputTokens: 0 } });
    }
  });

  // GET /api/admin/billing/plans — available plans
  fastify.get('/plans', async () => {
    return ok({
      plans: [
        { id: 'free', name: 'Free', price: 0, dispatches: 100, projects: 3, agents: 5, features: ['Basic memory', 'Single gateway', 'Community support'] },
        { id: 'pro', name: 'Pro', price: 29, dispatches: -1, projects: -1, agents: -1, features: ['Unlimited dispatches', 'All 5 gateways', 'Team memory', 'Skill evolution', 'Priority support'] },
        { id: 'enterprise', name: 'Enterprise', price: 99, dispatches: -1, projects: -1, agents: -1, features: ['Everything in Pro', 'SSO/SAML', 'Audit trail', 'Custom agents', 'Dedicated support', 'On-prem option'] },
      ],
    });
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
