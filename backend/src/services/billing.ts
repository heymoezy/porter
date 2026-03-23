import crypto from 'crypto';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq, sql, and, gte } from 'drizzle-orm';
import { config, featureFlags } from '../config.js';

// ── Plan definitions ─────────────────────────────────────────────────────────

export const PLANS = {
  free: { name: 'Self-Hosted', price: 0, interval: null },
  cloud: { name: 'Cloud', price: 500, interval: 'month' },          // $5/mo in cents
  cloud_team: { name: 'Cloud Team', price: 500, interval: 'month' }, // $5/user/mo
  enterprise: { name: 'Enterprise', price: 0, interval: null },      // custom
} as const;

export type PlanId = keyof typeof PLANS;
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired';

// ── Helpers ──────────────────────────────────────────────────────────────────

function now(): number {
  return Math.floor(Date.now() / 1000);
}

// ── Subscription CRUD ────────────────────────────────────────────────────────

export async function getSubscription(username: string) {
  const [row] = await db.select().from(schema.subscriptions)
    .where(eq(schema.subscriptions.username, username));
  return row ?? null;
}

export async function ensureSubscription(username: string): Promise<typeof schema.subscriptions.$inferSelect> {
  const existing = await getSubscription(username);
  if (existing) return existing;

  // Auto-create trial subscription for new users
  const id = crypto.randomUUID();
  const trialEnd = now() + (config.trialDays * 86400);

  await db.insert(schema.subscriptions).values({
    id,
    username,
    plan: 'free',
    status: 'trialing',
    trialEndsAt: trialEnd,
    createdAt: now(),
    updatedAt: now(),
  });

  return (await getSubscription(username))!;
}

export async function updateSubscription(
  username: string,
  updates: Partial<{
    plan: string;
    status: string;
    lsCustomerId: string;
    lsSubscriptionId: string;
    lsVariantId: string;
    trialEndsAt: number;
    currentPeriodStart: number;
    currentPeriodEnd: number;
    cancelAt: number | null;
    cancelledAt: number | null;
    pausedAt: number | null;
  }>
) {
  await db.update(schema.subscriptions)
    .set({ ...updates, updatedAt: now() })
    .where(eq(schema.subscriptions.username, username));
}

// ── Billing events ───────────────────────────────────────────────────────────

export async function logBillingEvent(
  username: string | null,
  eventType: string,
  lsEventId?: string,
  payload?: Record<string, unknown>
) {
  // Dedup by Lemon Squeezy event ID
  if (lsEventId) {
    const [existing] = await db.select().from(schema.billingEvents)
      .where(eq(schema.billingEvents.lsEventId, lsEventId));
    if (existing) return null; // Already processed
  }

  await db.insert(schema.billingEvents).values({
    username,
    eventType,
    lsEventId: lsEventId ?? null,
    payload: JSON.stringify(payload ?? {}),
  });

  return true;
}

// ── Plan resolution ──────────────────────────────────────────────────────────

export interface ResolvedPlan {
  plan: PlanId;
  planName: string;
  status: SubStatus;
  isActive: boolean;               // can use the platform
  isTrial: boolean;
  trialDaysLeft: number | null;
  currentPeriodEnd: number | null;
  cancelAt: number | null;
  price: number;                   // cents
}

export async function resolvePlan(username: string): Promise<ResolvedPlan> {
  const sub = await ensureSubscription(username);
  const t = now();

  let status = sub.status as SubStatus;
  let isTrial = status === 'trialing';

  // Check trial expiry
  if (isTrial && sub.trialEndsAt && sub.trialEndsAt < t) {
    status = 'expired';
    await updateSubscription(username, { status: 'expired' });
    isTrial = false;
  }

  const plan = (sub.plan || 'free') as PlanId;
  const planDef = PLANS[plan] ?? PLANS.free;

  const trialDaysLeft = isTrial && sub.trialEndsAt
    ? Math.max(0, Math.ceil((sub.trialEndsAt - t) / 86400))
    : null;

  const isActive = status === 'active' || status === 'trialing' || plan === 'free';

  return {
    plan,
    planName: planDef.name,
    status,
    isActive,
    isTrial,
    trialDaysLeft,
    currentPeriodEnd: sub.currentPeriodEnd ?? null,
    cancelAt: sub.cancelAt ?? null,
    price: planDef.price,
  };
}

// ── Usage aggregation ────────────────────────────────────────────────────────

export interface UsageSummary {
  totalTokens: number;
  totalRequests: number;
  byModel: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    requests: number;
  }>;
  periodStart: string;   // ISO date
  periodEnd: string;     // ISO date
}

export async function getUsageThisMonth(): Promise<UsageSummary> {
  const d = new Date();
  const periodStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const periodEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

  const rows = await db.select().from(schema.tokenUsageDaily)
    .where(gte(schema.tokenUsageDaily.date, periodStart));

  let totalTokens = 0;
  let totalRequests = 0;
  const modelMap = new Map<string, { inputTokens: number; outputTokens: number; requests: number }>();

  for (const row of rows) {
    const input = row.inputTokens ?? 0;
    const output = row.outputTokens ?? 0;
    const reqs = row.requestCount ?? 0;
    totalTokens += input + output;
    totalRequests += reqs;

    const existing = modelMap.get(row.model) ?? { inputTokens: 0, outputTokens: 0, requests: 0 };
    existing.inputTokens += input;
    existing.outputTokens += output;
    existing.requests += reqs;
    modelMap.set(row.model, existing);
  }

  return {
    totalTokens,
    totalRequests,
    byModel: Array.from(modelMap.entries()).map(([model, stats]) => ({ model, ...stats })),
    periodStart,
    periodEnd,
  };
}

// ── Lemon Squeezy webhook verification ───────────────────────────────────────

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  if (!config.lemonSqueezyWebhookSecret) return false;
  const hmac = crypto.createHmac('sha256', config.lemonSqueezyWebhookSecret);
  hmac.update(payload);
  const digest = hmac.digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

// ── Lemon Squeezy API helpers ────────────────────────────────────────────────

const LS_API = 'https://api.lemonsqueezy.com/v1';

async function lsApiFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  if (!config.lemonSqueezyApiKey) {
    throw new Error('Lemon Squeezy API key not configured');
  }

  const res = await fetch(`${LS_API}${path}`, {
    ...options,
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      'Authorization': `Bearer ${config.lemonSqueezyApiKey}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lemon Squeezy API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function createCheckout(username: string, email: string, variantId: string): Promise<string> {
  const data = await lsApiFetch('/checkouts', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email,
            custom: { username },
          },
          product_options: {
            redirect_url: `${config.publicUrl || 'http://localhost:3001'}/v2/mockup-settings?tab=billing&status=success`,
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: config.lemonSqueezyStoreId } },
          variant: { data: { type: 'variants', id: variantId } },
        },
      },
    }),
  }) as { data: { attributes: { url: string } } };

  return data.data.attributes.url;
}

export async function getCustomerPortalUrl(lsCustomerId: string): Promise<string> {
  const data = await lsApiFetch(`/customers/${lsCustomerId}`) as {
    data: { attributes: { urls: { customer_portal: string } } }
  };
  return data.data.attributes.urls.customer_portal;
}

// ── Billing feature check ────────────────────────────────────────────────────

export function isBillingEnabled(): boolean {
  return featureFlags.billing && !!config.lemonSqueezyApiKey;
}
