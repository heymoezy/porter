import { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';
import { db } from '../db/client.js';
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
