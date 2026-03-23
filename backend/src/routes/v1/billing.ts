import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ok, err } from '../../lib/envelope.js';
import {
  resolvePlan,
  getUsageThisMonth,
  isBillingEnabled,
  logBillingEvent,
  updateSubscription,
  getSubscription,
  ensureSubscription,
  verifyWebhookSignature,
  createCheckout,
  getCustomerPortalUrl,
} from '../../services/billing.js';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';

// Variant IDs — set via env or config. Maps plan → Lemon Squeezy variant ID.
const VARIANT_IDS: Record<string, string> = {
  cloud: process.env.LS_VARIANT_CLOUD || '',
  cloud_team: process.env.LS_VARIANT_CLOUD_TEAM || '',
};

export default async function billingV1Routes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // ── GET /api/v1/billing — current plan, usage, billing state ─────────────

  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const user = request.sessionUser!;
    const plan = await resolvePlan(user.username);
    const usage = await getUsageThisMonth();
    const billingEnabled = isBillingEnabled();

    // Count projects and agents for usage display
    const projectCount = (await db.select().from(schema.projects)).length;
    const agentCount = (await db.select().from(schema.personas)).length;

    return reply.send(ok({
      billing_enabled: billingEnabled,
      plan,
      usage: {
        ...usage,
        projects: projectCount,
        agents: agentCount,
      },
    }));
  });

  // ── GET /api/v1/billing/events — recent billing events ───────────────────

  fastify.get('/events', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const user = request.sessionUser!;
    const limit = Math.min(Number((request.query as Record<string, string>).limit) || 20, 100);

    const events = await db.select().from(schema.billingEvents)
      .where(eq(schema.billingEvents.username, user.username))
      .orderBy(desc(schema.billingEvents.createdAt))
      .limit(limit);

    return reply.send(ok({
      events: events.map(e => ({
        id: e.id,
        event_type: e.eventType,
        created_at: e.createdAt,
      })),
    }));
  });

  // ── POST /api/v1/billing/checkout — create Lemon Squeezy checkout ────────

  fastify.post('/checkout', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (!isBillingEnabled()) {
      return reply.code(503).send(err('BILLING_DISABLED', 'Billing is not configured'));
    }

    const user = request.sessionUser!;
    const body = request.body as { plan?: string } | undefined;
    const planId = body?.plan || 'cloud';

    const variantId = VARIANT_IDS[planId];
    if (!variantId) {
      return reply.code(400).send(err('INVALID_PLAN', `Unknown plan: ${planId}`));
    }

    // Fetch email from users table
    const [userRow] = await db.select().from(schema.users)
      .where(eq(schema.users.username, user.username));
    const email = userRow?.email || '';

    try {
      const checkoutUrl = await createCheckout(user.username, email, variantId);
      await logBillingEvent(user.username, 'checkout_created', undefined, { plan: planId });
      return reply.send(ok({ checkout_url: checkoutUrl }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Checkout creation failed';
      return reply.code(502).send(err('CHECKOUT_FAILED', message));
    }
  });

  // ── POST /api/v1/billing/portal — get customer portal URL ────────────────

  fastify.post('/portal', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (!isBillingEnabled()) {
      return reply.code(503).send(err('BILLING_DISABLED', 'Billing is not configured'));
    }

    const user = request.sessionUser!;
    const sub = await getSubscription(user.username);

    if (!sub?.lsCustomerId) {
      return reply.code(404).send(err('NO_SUBSCRIPTION', 'No active subscription found'));
    }

    try {
      const portalUrl = await getCustomerPortalUrl(sub.lsCustomerId);
      return reply.send(ok({ portal_url: portalUrl }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Portal URL fetch failed';
      return reply.code(502).send(err('PORTAL_FAILED', message));
    }
  });

  // ── POST /api/v1/billing/webhook — Lemon Squeezy webhook handler ─────────
  // This endpoint does NOT require auth — it's called by Lemon Squeezy servers.
  // It verifies the HMAC signature instead.

  fastify.post('/webhook', async (request, reply) => {
    const signature = (request.headers['x-signature'] as string) || '';
    const rawBody = JSON.stringify(request.body);

    if (!verifyWebhookSignature(rawBody, signature)) {
      return reply.code(401).send(err('INVALID_SIGNATURE', 'Webhook signature verification failed'));
    }

    const payload = request.body as {
      meta: { event_name: string; custom_data?: { username?: string } };
      data: {
        id: string;
        attributes: {
          customer_id: number;
          variant_id: number;
          status: string;
          trial_ends_at: string | null;
          renews_at: string | null;
          ends_at: string | null;
          created_at: string;
          updated_at: string;
          pause: { mode: string; resumes_at: string | null } | null;
        };
      };
    };

    const eventName = payload.meta.event_name;
    const username = payload.meta.custom_data?.username;
    const attrs = payload.data.attributes;
    const lsSubId = String(payload.data.id);
    const lsCustomerId = String(attrs.customer_id);
    const lsVariantId = String(attrs.variant_id);

    // Log every webhook event
    const eventId = `${eventName}_${lsSubId}_${Date.now()}`;
    const logged = await logBillingEvent(username ?? null, eventName, eventId, payload as unknown as Record<string, unknown>);
    if (!logged) {
      // Duplicate event — already processed
      return reply.code(200).send({ ok: true, duplicate: true });
    }

    if (!username) {
      console.warn(`[billing-webhook] No username in custom_data for event ${eventName}`);
      return reply.code(200).send({ ok: true, warning: 'no username' });
    }

    // Ensure subscription row exists
    await ensureSubscription(username);

    // Map Lemon Squeezy status → Porter status
    const statusMap: Record<string, string> = {
      'active': 'active',
      'past_due': 'past_due',
      'paused': 'paused',
      'cancelled': 'cancelled',
      'expired': 'expired',
      'on_trial': 'trialing',
      'unpaid': 'past_due',
    };

    const porterStatus = statusMap[attrs.status] || attrs.status;

    // Determine plan from variant ID
    let plan: string = 'cloud';
    for (const [p, v] of Object.entries(VARIANT_IDS)) {
      if (v === lsVariantId) { plan = p; break; }
    }

    const updates: Record<string, unknown> = {
      plan,
      status: porterStatus,
      lsCustomerId,
      lsSubscriptionId: lsSubId,
      lsVariantId,
    };

    if (attrs.trial_ends_at) {
      updates.trialEndsAt = new Date(attrs.trial_ends_at).getTime() / 1000;
    }
    if (attrs.renews_at) {
      updates.currentPeriodEnd = new Date(attrs.renews_at).getTime() / 1000;
    }
    if (attrs.ends_at) {
      updates.cancelAt = new Date(attrs.ends_at).getTime() / 1000;
    }
    if (porterStatus === 'cancelled') {
      updates.cancelledAt = Math.floor(Date.now() / 1000);
    }
    if (attrs.pause) {
      updates.pausedAt = Math.floor(Date.now() / 1000);
    }

    await updateSubscription(username, updates);

    console.log(`[billing-webhook] ${eventName} for ${username}: ${porterStatus} (${plan})`);
    return reply.code(200).send({ ok: true });
  });
}
