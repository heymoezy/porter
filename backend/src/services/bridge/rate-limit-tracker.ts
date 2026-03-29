/**
 * Rate Limit Tracker — DB-backed rate limit visibility for all gateways
 *
 * Tracks per-gateway and per-model rate limits with configurable periods
 * (minute, daily, weekly, monthly) from three sources:
 *   1. Provider response headers (x-ratelimit-*)
 *   2. Manual admin configuration
 *   3. Empirical inference from bridge_dispatch_log
 *
 * The routing engine calls hasCapacity() before selecting a gateway to
 * prefer gateways with headroom. The admin UI reads getCapacitySnapshot()
 * for the capacity dashboard.
 */

import { pool } from '../../db/client.js';
import { v4 as uuidv4 } from 'uuid';

// ── Types ───────────────────────────────────────────────────────────────────

export interface UsageLimit {
  limit_type: string;       // 'requests' | 'tokens' | 'input_tokens' | 'output_tokens'
  period: string;           // 'minute' | 'daily' | 'weekly' | 'monthly'
  current: number;
  limit: number | null;
  pct: number | null;       // 0-1
  reset_at: number | null;
  source: string;
}

export interface ModelLimits {
  model_name: string;       // actual model name or '_gateway_' for gateway-level
  limits: UsageLimit[];
}

export interface GatewayCapacity {
  gateway_id: string;
  models: ModelLimits[];    // gateway-level limits have model_name '_gateway_'
  last_429_at: number | null;
  total_429_count: number;
}

interface RateLimitRow {
  id: string;
  gateway_id: string;
  model_name: string | null;
  limit_type: string;
  period: string;
  limit_value: number | null;
  current_value: number;
  reset_at: number | null;
  source: string;
  last_429_at: number | null;
  total_429_count: number;
  updated_at: number | null;
}

// ── In-memory capacity cache ────────────────────────────────────────────────
// Populated by computeEmpiricalRates() every 30s, read by hasCapacity().
// Avoids DB round-trip on every routing decision.

interface CacheEntry {
  current: number;
  limit: number | null;
  source: string;
}

const capacityCache = new Map<string, CacheEntry[]>();
let cacheAge = 0;

// ── Header parsing ──────────────────────────────────────────────────────────

/**
 * Parse rate limit headers from an HTTP response and upsert into DB.
 * Case-insensitive header lookup.
 * Called after every dispatch/stream response from HTTP-based adapters.
 */
export function parseRateLimitHeaders(
  headers: Record<string, string>,
  gatewayId: string,
): void {
  // Normalize header keys to lowercase
  const h: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    h[key.toLowerCase()] = val;
  }

  const now = Date.now() / 1000;

  // Helper: check both x-ratelimit-* and anthropic-ratelimit-* prefixes
  const rl = (suffix: string): string | undefined =>
    h[`x-ratelimit-${suffix}`] ?? h[`anthropic-ratelimit-${suffix}`];

  // ── RPM (requests per minute) ─────────────────────────────────────────
  const rpmLimit = parseNum(rl('limit-requests') ?? rl('requests-limit') ?? h['x-ratelimit-limit']);
  const rpmRemaining = parseNum(rl('remaining-requests') ?? rl('requests-remaining'));
  if (rpmLimit !== null || rpmRemaining !== null) {
    const current = (rpmLimit !== null && rpmRemaining !== null)
      ? rpmLimit - rpmRemaining
      : null;
    const resetStr = rl('reset-requests') ?? rl('requests-reset') ?? rl('reset');
    const resetAt = parseResetTimestamp(resetStr, now);
    upsertLimit(gatewayId, null, 'requests', 'minute', rpmLimit, current, resetAt, 'provider').catch(() => {});
  }

  // ── TPM (tokens per minute) ─────────────────────────────────────────
  const tpmLimit = parseNum(rl('limit-tokens') ?? rl('tokens-limit'));
  const tpmRemaining = parseNum(rl('remaining-tokens') ?? rl('tokens-remaining'));
  if (tpmLimit !== null || tpmRemaining !== null) {
    const current = (tpmLimit !== null && tpmRemaining !== null)
      ? tpmLimit - tpmRemaining
      : null;
    const resetStr = rl('reset-tokens') ?? rl('tokens-reset') ?? rl('reset');
    const resetAt = parseResetTimestamp(resetStr, now);
    upsertLimit(gatewayId, null, 'tokens', 'minute', tpmLimit, current, resetAt, 'provider').catch(() => {});
  }

  // ── Daily token headers (if present) ──────────────────────────────────
  const dailyLimit = parseNum(rl('limit-tokens-day') ?? rl('limit-daily-tokens'));
  const dailyRemaining = parseNum(rl('remaining-tokens-day') ?? rl('remaining-daily-tokens'));
  if (dailyLimit !== null || dailyRemaining !== null) {
    const current = (dailyLimit !== null && dailyRemaining !== null)
      ? dailyLimit - dailyRemaining
      : null;
    const resetStr = h['x-ratelimit-reset-tokens-day'] ?? h['x-ratelimit-reset-daily-tokens'];
    const resetAt = parseResetTimestamp(resetStr, now);
    upsertLimit(gatewayId, null, 'tokens', 'daily', dailyLimit, current, resetAt, 'provider').catch(() => {});
  }

  // ── retry-after (informational — sets reset_at on requests/minute entry) ──
  const retryAfter = parseNum(h['retry-after']);
  if (retryAfter !== null && retryAfter > 0) {
    const resetAt = now + retryAfter;
    pool.query(
      `UPDATE gateway_rate_limits SET reset_at = $1, updated_at = $2
       WHERE gateway_id = $3 AND limit_type = 'requests' AND period = 'minute' AND model_name IS NULL`,
      [resetAt, now, gatewayId],
    ).catch(() => {});
  }
}

// ── 429 recording ───────────────────────────────────────────────────────────

/**
 * Record a 429 Too Many Requests event for a gateway.
 * Called when any adapter receives a 429 response.
 */
export function record429(gatewayId: string, retryAfter?: number): void {
  const now = Date.now() / 1000;
  const resetAt = retryAfter ? now + retryAfter : null;

  (async () => {
    try {
      // Increment 429 count on all existing rows for this gateway
      await pool.query(
        `UPDATE gateway_rate_limits
         SET last_429_at = $1, total_429_count = total_429_count + 1, updated_at = $1
         WHERE gateway_id = $2`,
        [now, gatewayId],
      );

      // If no rows existed, create a requests/minute row to track the 429
      const { rowCount } = await pool.query(
        `SELECT 1 FROM gateway_rate_limits WHERE gateway_id = $1 LIMIT 1`,
        [gatewayId],
      );
      if (!rowCount || rowCount === 0) {
        await pool.query(
          `INSERT INTO gateway_rate_limits (id, gateway_id, model_name, limit_type, period, current_value, reset_at, source, last_429_at, total_429_count, updated_at)
           VALUES ($1, $2, NULL, 'requests', 'minute', 0, $3, 'inferred', $4, 1, $4)
           ON CONFLICT (gateway_id, COALESCE(model_name, ''), limit_type, period) DO UPDATE SET
             last_429_at = EXCLUDED.last_429_at,
             total_429_count = gateway_rate_limits.total_429_count + 1,
             reset_at = COALESCE(EXCLUDED.reset_at, gateway_rate_limits.reset_at),
             updated_at = EXCLUDED.updated_at`,
          [uuidv4(), gatewayId, resetAt, now],
        );
      }

      // If retryAfter was provided, also set reset_at
      if (resetAt) {
        await pool.query(
          `UPDATE gateway_rate_limits SET reset_at = $1
           WHERE gateway_id = $2 AND limit_type = 'requests' AND period = 'minute' AND model_name IS NULL`,
          [resetAt, gatewayId],
        );
      }
    } catch {
      // Non-critical — never block dispatch
    }
  })();
}

// ── Empirical rate computation ──────────────────────────────────────────────

/**
 * Compute empirical RPM and TPM from bridge_dispatch_log over the last 60s.
 * Upserts as 'inferred' source — does NOT overwrite 'provider' or 'configured' data.
 * Called every 30 seconds by the scheduler.
 * Inserts with model_name=NULL (gateway-level) and period='minute'.
 */
export async function computeEmpiricalRates(): Promise<void> {
  const now = Date.now() / 1000;
  const windowStart = now - 60; // last 60 seconds

  try {
    const { rows } = await pool.query<{
      gateway_id: string;
      dispatch_count: string;
      total_tokens: string;
    }>(`
      SELECT gateway_id,
             COUNT(*)::text AS dispatch_count,
             COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0)::text AS total_tokens
      FROM bridge_dispatch_log
      WHERE created_at >= $1 AND gateway_id IS NOT NULL
      GROUP BY gateway_id
    `, [windowStart]);

    for (const row of rows) {
      const gatewayId = row.gateway_id;
      const rpm = parseInt(row.dispatch_count, 10);
      const tpm = parseInt(row.total_tokens, 10);

      // Upsert RPM (inferred) — only if no 'provider' or 'configured' row exists
      await upsertInferredLimit(gatewayId, null, 'requests', 'minute', rpm, now);
      await upsertInferredLimit(gatewayId, null, 'tokens', 'minute', tpm, now);
    }

    // Update in-memory cache
    await refreshCapacityCache();
  } catch (err) {
    console.error('[rate-limit-tracker] computeEmpiricalRates error:', err instanceof Error ? err.message : err);
  }
}

// ── Capacity snapshot (for admin UI) ────────────────────────────────────────

/**
 * Returns current rate limit state for all gateways.
 * Groups by gateway_id -> model_name -> limit entries.
 * Gateway-level limits (model_name IS NULL) get model_name '_gateway_'.
 * Used by GET /api/admin/bridge/capacity.
 */
export async function getCapacitySnapshot(): Promise<GatewayCapacity[]> {
  const { rows: gatewayRows } = await pool.query<{ id: string }>(
    `SELECT id FROM gateways WHERE enabled = 1 ORDER BY priority ASC`,
  );

  const { rows: limitRows } = await pool.query<RateLimitRow>(`
    SELECT id, gateway_id, model_name, limit_type, period, limit_value, current_value,
           reset_at, source, last_429_at, total_429_count, updated_at
    FROM gateway_rate_limits
    ORDER BY gateway_id, model_name NULLS FIRST, limit_type, period
  `);

  // Group rows by gateway_id
  const byGateway = new Map<string, RateLimitRow[]>();
  for (const row of limitRows) {
    const arr = byGateway.get(row.gateway_id) ?? [];
    arr.push(row);
    byGateway.set(row.gateway_id, arr);
  }

  const results: GatewayCapacity[] = [];

  for (const gw of gatewayRows) {
    const rows = byGateway.get(gw.id) ?? [];

    // Aggregate 429 counts
    const total429 = rows.reduce((sum, r) => Math.max(sum, r.total_429_count), 0);
    const last429 = rows.reduce((latest: number | null, r) => {
      if (r.last_429_at === null) return latest;
      return latest === null ? r.last_429_at : Math.max(latest, r.last_429_at);
    }, null);

    // Group by model_name -> limit entries
    const byModel = new Map<string, RateLimitRow[]>();
    for (const row of rows) {
      const key = row.model_name ?? '_gateway_';
      const arr = byModel.get(key) ?? [];
      arr.push(row);
      byModel.set(key, arr);
    }

    const models: ModelLimits[] = [];
    for (const [modelName, modelRows] of byModel) {
      // For each (limit_type, period) combo, pick best source
      const limitMap = new Map<string, RateLimitRow>();
      for (const row of modelRows) {
        const key = `${row.limit_type}:${row.period}`;
        const existing = limitMap.get(key);
        if (!existing || sourceRank(row.source) > sourceRank(existing.source)) {
          limitMap.set(key, row);
        }
      }

      const limits: UsageLimit[] = [];
      for (const row of limitMap.values()) {
        const pct = (row.limit_value !== null && row.limit_value > 0)
          ? Math.round((row.current_value / row.limit_value) * 100) / 100
          : null;
        limits.push({
          limit_type: row.limit_type,
          period: row.period,
          current: row.current_value,
          limit: row.limit_value,
          pct,
          reset_at: row.reset_at ?? null,
          source: row.source,
        });
      }

      if (limits.length > 0) {
        models.push({ model_name: modelName, limits });
      }
    }

    results.push({
      gateway_id: gw.id,
      models,
      last_429_at: last429,
      total_429_count: total429,
    });
  }

  return results;
}

// ── Capacity check (for routing engine) ──────────────────────────────────────

/**
 * Returns false if any rate limit for this gateway is at 90%+ utilization.
 * Uses in-memory cache for speed — no DB round-trip.
 * The routing engine calls this as a soft preference (not a hard gate).
 */
export function hasCapacity(gatewayId: string): boolean {
  const entries = capacityCache.get(gatewayId);
  if (!entries) return true; // No data = assume capacity

  for (const entry of entries) {
    if (entry.limit !== null && entry.limit > 0) {
      const pct = entry.current / entry.limit;
      if (pct >= 0.9) return false;
    }
  }

  return true;
}

// ── Private helpers ─────────────────────────────────────────────────────────

function parseNum(val: string | undefined): number | null {
  if (!val) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

/**
 * Parse a reset timestamp from rate limit headers.
 * Handles:
 *   - Unix epoch seconds (large number)
 *   - Relative seconds (small number, like retry-after)
 *   - ISO 8601 date strings
 *   - Duration strings like "6m0s" or "2s"
 */
function parseResetTimestamp(val: string | undefined, now: number): number | null {
  if (!val) return null;

  // Duration strings like "6m0s", "30s", "1h2m3s"
  const durationMatch = val.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (durationMatch && (durationMatch[1] || durationMatch[2] || durationMatch[3])) {
    const hours = parseInt(durationMatch[1] || '0', 10);
    const minutes = parseInt(durationMatch[2] || '0', 10);
    const seconds = parseFloat(durationMatch[3] || '0');
    return now + hours * 3600 + minutes * 60 + seconds;
  }

  const n = Number(val);
  if (!isNaN(n)) {
    // If it looks like an epoch (> year 2020 in seconds), use as-is
    if (n > 1_577_836_800) return n;
    // Otherwise treat as relative seconds
    return now + n;
  }

  // Try ISO date
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.getTime() / 1000;

  return null;
}

async function upsertLimit(
  gatewayId: string,
  modelName: string | null,
  limitType: string,
  period: string,
  limitValue: number | null,
  currentValue: number | null,
  resetAt: number | null,
  source: string,
): Promise<void> {
  const now = Date.now() / 1000;
  await pool.query(
    `INSERT INTO gateway_rate_limits (id, gateway_id, model_name, limit_type, period, limit_value, current_value, reset_at, source, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (gateway_id, COALESCE(model_name, ''), limit_type, period) DO UPDATE SET
       limit_value = COALESCE(EXCLUDED.limit_value, gateway_rate_limits.limit_value),
       current_value = COALESCE(EXCLUDED.current_value, gateway_rate_limits.current_value),
       reset_at = COALESCE(EXCLUDED.reset_at, gateway_rate_limits.reset_at),
       source = EXCLUDED.source,
       updated_at = EXCLUDED.updated_at`,
    [uuidv4(), gatewayId, modelName, limitType, period, limitValue, currentValue ?? 0, resetAt, source, now],
  );
}

/**
 * Upsert an inferred limit — only if no higher-priority source exists.
 * 'provider' and 'configured' sources take precedence.
 */
async function upsertInferredLimit(
  gatewayId: string,
  modelName: string | null,
  limitType: string,
  period: string,
  currentValue: number,
  now: number,
): Promise<void> {
  // Check if a provider or configured row exists
  const { rows } = await pool.query<{ source: string }>(
    `SELECT source FROM gateway_rate_limits
     WHERE gateway_id = $1 AND limit_type = $2 AND period = $3
       AND (model_name IS NOT DISTINCT FROM $4)`,
    [gatewayId, limitType, period, modelName],
  );

  if (rows.length > 0 && (rows[0].source === 'provider' || rows[0].source === 'configured')) {
    // Only update current_value — don't overwrite limit_value or source
    await pool.query(
      `UPDATE gateway_rate_limits SET current_value = $1, updated_at = $2
       WHERE gateway_id = $3 AND limit_type = $4 AND period = $5
         AND (model_name IS NOT DISTINCT FROM $6)`,
      [currentValue, now, gatewayId, limitType, period, modelName],
    );
  } else {
    // Upsert as inferred
    await pool.query(
      `INSERT INTO gateway_rate_limits (id, gateway_id, model_name, limit_type, period, current_value, source, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'inferred', $7)
       ON CONFLICT (gateway_id, COALESCE(model_name, ''), limit_type, period) DO UPDATE SET
         current_value = EXCLUDED.current_value,
         updated_at = EXCLUDED.updated_at`,
      [uuidv4(), gatewayId, modelName, limitType, period, currentValue, now],
    );
  }
}

async function refreshCapacityCache(): Promise<void> {
  try {
    const { rows } = await pool.query<RateLimitRow>(`
      SELECT id, gateway_id, model_name, limit_type, period, limit_value, current_value,
             reset_at, source, last_429_at, total_429_count, updated_at
      FROM gateway_rate_limits
    `);

    const newCache = new Map<string, CacheEntry[]>();

    for (const row of rows) {
      if (!newCache.has(row.gateway_id)) {
        newCache.set(row.gateway_id, []);
      }
      newCache.get(row.gateway_id)!.push({
        current: row.current_value,
        limit: row.limit_value,
        source: row.source,
      });
    }

    capacityCache.clear();
    for (const [k, v] of newCache) {
      capacityCache.set(k, v);
    }
    cacheAge = Date.now();
  } catch {
    // Cache refresh is best-effort
  }
}

function sourceRank(source: string): number {
  if (source === 'provider') return 3;
  if (source === 'configured') return 2;
  return 1; // inferred
}

// ── CLI output rate limit detection ─────────────────────────────────────────

const RATE_LIMIT_PATTERNS = [
  /usage limit/i,
  /rate limit/i,
  /quota limit/i,
  /limit reached/i,
  /5-hour/i,
  /weekly limit/i,
  /daily.*quota/i,
  /too many requests/i,
  /try again later/i,
  /API rate limit reached/i,
];

/**
 * Check if CLI output contains rate limit signals.
 * Call this after subprocess dispatch/stream to detect soft limits.
 */
export function detectRateLimitInOutput(output: string): boolean {
  return RATE_LIMIT_PATTERNS.some(p => p.test(output));
}
