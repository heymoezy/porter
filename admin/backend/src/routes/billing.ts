import { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';
import { db, sqlite } from '../db/client.js';
import * as schema from '../../../../backend/src/db/schema.js';
import { desc, sql } from 'drizzle-orm';

export default async function billingRoutes(fastify: FastifyInstance) {
  // All routes require platform_admin
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/billing/subscriptions — all subscriptions
  fastify.get('/subscriptions', async () => {
    try {
      const subscriptions = db.select().from(schema.subscriptions)
        .orderBy(desc(schema.subscriptions.updatedAt))
        .all();
      return ok({ subscriptions });
    } catch {
      return ok({ subscriptions: [] });
    }
  });

  // GET /api/admin/billing/events — webhook event log
  fastify.get('/events', async (request) => {
    const { limit = '50' } = request.query as Record<string, string>;
    try {
      const events = db.select().from(schema.billingEvents)
        .orderBy(desc(schema.billingEvents.createdAt))
        .limit(parseInt(limit))
        .all();
      return ok({ events });
    } catch {
      return ok({ events: [] });
    }
  });

  // GET /api/admin/billing/revenue — business flywheel metrics
  fastify.get('/revenue', async () => {
    try {
      // MRR from customer scores
      const mrrRow = sqlite.prepare(`
        SELECT COALESCE(SUM(json_extract(scores_json, '$.mrr')), 0) as mrr,
               COALESCE(SUM(json_extract(scores_json, '$.cost')), 0) as cost,
               COALESCE(SUM(json_extract(scores_json, '$.ltv')), 0) as ltv
        FROM customer_scores
      `).get() as { mrr: number; cost: number; ltv: number } | undefined;

      // Token usage by model (all time)
      const tokenUsage = sqlite.prepare(`
        SELECT model, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(request_count) as requests
        FROM token_usage_daily GROUP BY model ORDER BY (input_tokens + output_tokens) DESC
      `).all() as Array<{ model: string; input_tokens: number; output_tokens: number; requests: number }>;

      // Customer funnel
      const totalUsers = (sqlite.prepare('SELECT count(*) as c FROM users WHERE role NOT IN (\'platform_admin\', \'admin\')').get() as { c: number }).c;
      const activeUsers = (sqlite.prepare("SELECT count(DISTINCT username) as c FROM sessions WHERE last_seen_at > unixepoch('now') - 604800").get() as { c: number }).c;
      const payingUsers = (sqlite.prepare("SELECT count(*) as c FROM subscriptions WHERE status = 'active'").get() as { c: number }).c;

      // 10x markup on costs
      const costBase = mrrRow?.cost ?? 0;
      const markup = 10;

      return ok({
        mrr: mrrRow?.mrr ?? 0,
        costBase,
        costMarkup: costBase * markup,
        margin: (mrrRow?.mrr ?? 0) - costBase,
        ltv: mrrRow?.ltv ?? 0,
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
      const total = db.select({ count: sql<number>`count(*)` }).from(schema.subscriptions).get();
      const active = db.select({ count: sql<number>`count(*)` }).from(schema.subscriptions)
        .where(sql`status = 'active'`).get();
      const trialing = db.select({ count: sql<number>`count(*)` }).from(schema.subscriptions)
        .where(sql`status = 'trialing'`).get();
      return ok({
        total: total?.count ?? 0,
        active: active?.count ?? 0,
        trialing: trialing?.count ?? 0,
      });
    } catch {
      return ok({ total: 0, active: 0, trialing: 0 });
    }
  });
}
