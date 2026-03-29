/**
 * Rate Limit Tracker — DB-backed rate limit visibility for all gateways
 *
 * Tracks RPM, TPM, daily tokens, daily spend, and concurrency limits
 * from three sources:
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

export type LimitType = 'rpm' | 'tpm' | 'daily_tokens' | 'daily_spend' | 'concurrency';

export interface RateLimitMetric {
  current: number;
  limit: number | null;
  pct: number | null;
  source: string;
}

export interface GatewayCapacity {
  gateway_id: string;
  rpm: RateLimitMetric;
  tpm: RateLimitMetric;
  daily_tokens: RateLimitMetric;
  concurrency: RateLimitMetric;
  last_429_at: number | null;
  total_429_count: number;
}

interface RateLimitRow {
  id: string;
  gateway_id: string;
  limit_type: string;
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

const capacityCache = new Map<string, Map<LimitType, { current: number; limit: number | null; source: string }>>();
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

  // ── RPM ─────────────────────────────────────────────────────────────────
  const rpmLimit = parseNum(h['x-ratelimit-limit-requests'] ?? h['x-ratelimit-limit']);
  const rpmRemaining = parseNum(h['x-ratelimit-remaining-requests']);
  if (rpmLimit !== null || rpmRemaining !== null) {
    const current = (rpmLimit !== null && rpmRemaining !== null)
      ? rpmLimit - rpmRemaining
      : null;
    const resetStr = h['x-ratelimit-reset-requests'] ?? h['x-ratelimit-reset'];
    const resetAt = parseResetTimestamp(resetStr, now);
    upsertLimit(gatewayId, 'rpm', rpmLimit, current, resetAt, 'provider').catch(() => {});
  }

  // ── TPM ─────────────────────────────────────────────────────────────────
  const tpmLimit = parseNum(h['x-ratelimit-limit-tokens']);
  const tpmRemaining = parseNum(h['x-ratelimit-remaining-tokens']);
  if (tpmLimit !== null || tpmRemaining !== null) {
    const current = (tpmLimit !== null && tpmRemaining !== null)
      ? tpmLimit - tpmRemaining
      : null;
    const resetStr = h['x-ratelimit-reset-tokens'] ?? h['x-ratelimit-reset'];
    const resetAt = parseResetTimestamp(resetStr, now);
    upsertLimit(gatewayId, 'tpm', tpmLimit, current, resetAt, 'provider').catch(() => {});
  }

  // ── retry-after (informational — sets reset_at on RPM entry) ───────────
  const retryAfter = parseNum(h['retry-after']);
  if (retryAfter !== null && retryAfter > 0) {
    const resetAt = now + retryAfter;
    // Best-effort: update RPM reset_at if present
    pool.query(
      `UPDATE gateway_rate_limits SET reset_at = $1, updated_at = $2
       WHERE gateway_id = $3 AND limit_type = 'rpm'`,
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

  // Upsert a rate limit row to track 429s (use 'rpm' as the primary type)
  // The total_429_count is incremented across all limit types for this gateway.
  (async () => {
    try {
      // Increment 429 count on all existing rows for this gateway
      await pool.query(
        `UPDATE gateway_rate_limits
         SET last_429_at = $1, total_429_count = total_429_count + 1, updated_at = $1
         WHERE gateway_id = $2`,
        [now, gatewayId],
      );

      // If no rows existed, create an RPM row to track the 429
      const { rowCount } = await pool.query(
        `SELECT 1 FROM gateway_rate_limits WHERE gateway_id = $1 LIMIT 1`,
        [gatewayId],
      );
      if (!rowCount || rowCount === 0) {
        await pool.query(
          `INSERT INTO gateway_rate_limits (id, gateway_id, limit_type, current_value, reset_at, source, last_429_at, total_429_count, updated_at)
           VALUES ($1, $2, 'rpm', 0, $3, 'inferred', $4, 1, $4)
           ON CONFLICT (gateway_id, limit_type) DO UPDATE SET
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
          `UPDATE gateway_rate_limits SET reset_at = $1 WHERE gateway_id = $2 AND limit_type = 'rpm'`,
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
      await upsertInferredLimit(gatewayId, 'rpm', rpm, now);
      await upsertInferredLimit(gatewayId, 'tpm', tpm, now);
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
 * Used by GET /api/admin/bridge/capacity.
 */
export async function getCapacitySnapshot(): Promise<GatewayCapacity[]> {
  const { rows: gatewayRows } = await pool.query<{ id: string }>(
    `SELECT id FROM gateways WHERE enabled = 1 ORDER BY priority ASC`,
  );

  const { rows: limitRows } = await pool.query<RateLimitRow>(`
    SELECT id, gateway_id, limit_type, limit_value, current_value,
           reset_at, source, last_429_at, total_429_count, updated_at
    FROM gateway_rate_limits
    ORDER BY gateway_id, limit_type
  `);

  // Group rows by gateway_id
  const byGateway = new Map<string, RateLimitRow[]>();
  for (const row of limitRows) {
    const arr = byGateway.get(row.gateway_id) ?? [];
    arr.push(row);
    byGateway.set(row.gateway_id, arr);
  }

  const now = Date.now() / 1000;
  const results: GatewayCapacity[] = [];

  for (const gw of gatewayRows) {
    const rows = byGateway.get(gw.id) ?? [];

    // Find the highest-priority row for each limit type.
    // Priority: 'provider' > 'configured' > 'inferred'
    const rpmRow = pickBestRow(rows, 'rpm', now);
    const tpmRow = pickBestRow(rows, 'tpm', now);
    const dailyRow = pickBestRow(rows, 'daily_tokens', now);
    const concRow = pickBestRow(rows, 'concurrency', now);

    // Aggregate 429 counts
    const total429 = rows.reduce((sum, r) => Math.max(sum, r.total_429_count), 0);
    const last429 = rows.reduce((latest: number | null, r) => {
      if (r.last_429_at === null) return latest;
      return latest === null ? r.last_429_at : Math.max(latest, r.last_429_at);
    }, null);

    results.push({
      gateway_id: gw.id,
      rpm: buildMetric(rpmRow),
      tpm: buildMetric(tpmRow),
      daily_tokens: buildMetric(dailyRow),
      concurrency: buildMetric(concRow),
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
  const limits = capacityCache.get(gatewayId);
  if (!limits) return true; // No data = assume capacity

  for (const [, entry] of limits) {
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
  limitType: LimitType,
  limitValue: number | null,
  currentValue: number | null,
  resetAt: number | null,
  source: string,
): Promise<void> {
  const now = Date.now() / 1000;
  await pool.query(
    `INSERT INTO gateway_rate_limits (id, gateway_id, limit_type, limit_value, current_value, reset_at, source, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (gateway_id, limit_type) DO UPDATE SET
       limit_value = COALESCE(EXCLUDED.limit_value, gateway_rate_limits.limit_value),
       current_value = COALESCE(EXCLUDED.current_value, gateway_rate_limits.current_value),
       reset_at = COALESCE(EXCLUDED.reset_at, gateway_rate_limits.reset_at),
       source = EXCLUDED.source,
       updated_at = EXCLUDED.updated_at`,
    [uuidv4(), gatewayId, limitType, limitValue, currentValue ?? 0, resetAt, source, now],
  );
}

/**
 * Upsert an inferred limit — only if no higher-priority source exists.
 * 'provider' and 'configured' sources take precedence.
 */
async function upsertInferredLimit(
  gatewayId: string,
  limitType: LimitType,
  currentValue: number,
  now: number,
): Promise<void> {
  // Check if a provider or configured row exists
  const { rows } = await pool.query<{ source: string }>(
    `SELECT source FROM gateway_rate_limits WHERE gateway_id = $1 AND limit_type = $2`,
    [gatewayId, limitType],
  );

  if (rows.length > 0 && (rows[0].source === 'provider' || rows[0].source === 'configured')) {
    // Only update current_value — don't overwrite limit_value or source
    await pool.query(
      `UPDATE gateway_rate_limits SET current_value = $1, updated_at = $2
       WHERE gateway_id = $3 AND limit_type = $4`,
      [currentValue, now, gatewayId, limitType],
    );
  } else {
    // Upsert as inferred
    await pool.query(
      `INSERT INTO gateway_rate_limits (id, gateway_id, limit_type, current_value, source, updated_at)
       VALUES ($1, $2, $3, $4, 'inferred', $5)
       ON CONFLICT (gateway_id, limit_type) DO UPDATE SET
         current_value = EXCLUDED.current_value,
         updated_at = EXCLUDED.updated_at`,
      [uuidv4(), gatewayId, limitType, currentValue, now],
    );
  }
}

async function refreshCapacityCache(): Promise<void> {
  try {
    const { rows } = await pool.query<RateLimitRow>(`
      SELECT id, gateway_id, limit_type, limit_value, current_value,
             reset_at, source, last_429_at, total_429_count, updated_at
      FROM gateway_rate_limits
    `);

    const newCache = new Map<string, Map<LimitType, { current: number; limit: number | null; source: string }>>();

    for (const row of rows) {
      if (!newCache.has(row.gateway_id)) {
        newCache.set(row.gateway_id, new Map());
      }
      const gwMap = newCache.get(row.gateway_id)!;

      const existing = gwMap.get(row.limit_type as LimitType);
      const sourcePriority = sourceRank(row.source);
      if (!existing || sourcePriority > sourceRank(existing.source)) {
        gwMap.set(row.limit_type as LimitType, {
          current: row.current_value,
          limit: row.limit_value,
          source: row.source,
        });
      }
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

function pickBestRow(rows: RateLimitRow[], limitType: string, _now: number): RateLimitRow | null {
  const matching = rows.filter(r => r.limit_type === limitType);
  if (matching.length === 0) return null;

  // Pick highest-priority source
  matching.sort((a, b) => sourceRank(b.source) - sourceRank(a.source));
  return matching[0];
}

function buildMetric(row: RateLimitRow | null): RateLimitMetric {
  if (!row) {
    return { current: 0, limit: null, pct: null, source: 'none' };
  }
  const pct = (row.limit_value !== null && row.limit_value > 0)
    ? Math.round((row.current_value / row.limit_value) * 100) / 100
    : null;
  return {
    current: row.current_value,
    limit: row.limit_value,
    pct,
    source: row.source,
  };
}
