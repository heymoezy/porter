/**
 * routing-confidence.ts — Gateway outcome-based confidence scoring
 *
 * SIN-03: Aggregates outcome_score from bridge_dispatch_log per gateway,
 * computes a confidence score and trend, caches in memory with 5-minute TTL.
 *
 * Confidence is a GENTLE nudge — priority still dominates routing, but
 * repeated poor outcomes will progressively degrade a gateway's selection weight.
 *
 * Phase 41, Plan 03
 */

import { pool } from '../../db/client.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GatewayConfidence {
  gatewayType: string;
  avgScore: number;         // weighted average outcome_score (1.0 - 5.0)
  totalRated: number;       // count of scored dispatches
  confidence: number;       // 0.0 - 1.0: how much to trust avgScore (grows with sample size)
  recentTrend: 'improving' | 'declining' | 'stable' | 'unknown';
  lastUpdated: number;      // epoch seconds
}

// ── In-memory cache ──────────────────────────────────────────────────────────

const cache = new Map<string, GatewayConfidence>();
let cacheBuiltAt = 0;
const CACHE_TTL_SECONDS = 300; // 5 minutes

// ── Refresh ──────────────────────────────────────────────────────────────────

/**
 * Recompute confidence from bridge_dispatch_log and update in-memory cache.
 * Called on startup, after outcome scoring, and automatically when cache is stale.
 */
export async function refreshConfidence(): Promise<void> {
  const { rows } = await pool.query<{
    gateway_type: string;
    avg_score: string;
    total_rated: string;
    recent_avg: string | null;
    older_avg: string | null;
  }>(`
    SELECT
      gateway_type,
      AVG(outcome_score)::text                                                       AS avg_score,
      COUNT(*)::text                                                                 AS total_rated,
      AVG(CASE WHEN created_at > EXTRACT(EPOCH FROM NOW()) - 86400
               THEN outcome_score END)::text                                        AS recent_avg,
      AVG(CASE WHEN created_at <= EXTRACT(EPOCH FROM NOW()) - 86400
               THEN outcome_score END)::text                                        AS older_avg
    FROM bridge_dispatch_log
    WHERE outcome_score IS NOT NULL
    GROUP BY gateway_type
  `);

  const now = Math.floor(Date.now() / 1000);

  cache.clear();

  for (const row of rows) {
    const avgScore = parseFloat(row.avg_score);
    const totalRated = parseInt(row.total_rated, 10);
    const recentAvg = row.recent_avg != null ? parseFloat(row.recent_avg) : null;
    const olderAvg = row.older_avg != null ? parseFloat(row.older_avg) : null;

    // confidence grows linearly to 1.0 after 50 rated dispatches
    const confidence = Math.min(1.0, totalRated / 50);

    // trend: compare recent (last 24h) vs older data; need both to compute
    let recentTrend: GatewayConfidence['recentTrend'];
    if (recentAvg == null || olderAvg == null) {
      recentTrend = 'unknown';
    } else if (recentAvg > olderAvg + 0.3) {
      recentTrend = 'improving';
    } else if (recentAvg < olderAvg - 0.3) {
      recentTrend = 'declining';
    } else {
      recentTrend = 'stable';
    }

    cache.set(row.gateway_type, {
      gatewayType: row.gateway_type,
      avgScore,
      totalRated,
      confidence,
      recentTrend,
      lastUpdated: now,
    });
  }

  cacheBuiltAt = now;
}

// ── Async accessors ──────────────────────────────────────────────────────────

function isCacheStale(): boolean {
  return Math.floor(Date.now() / 1000) - cacheBuiltAt > CACHE_TTL_SECONDS;
}

/**
 * Return confidence data for a specific gateway, refreshing cache if stale.
 * Async — safe for use in async route handlers.
 */
export async function getGatewayConfidence(
  gatewayType: string,
): Promise<GatewayConfidence | null> {
  if (isCacheStale()) {
    await refreshConfidence();
  }
  return cache.get(gatewayType) ?? null;
}

/**
 * Return all cached gateway confidence scores, refreshing cache if stale.
 */
export async function getAllConfidenceScores(): Promise<GatewayConfidence[]> {
  if (isCacheStale()) {
    await refreshConfidence();
  }
  return Array.from(cache.values());
}

// ── Sync accessor (for use inside selectByHeuristic) ─────────────────────────

/**
 * Synchronous cache read — returns null on miss or stale cache without triggering refresh.
 * Safe to call from synchronous routing code (selectByHeuristic).
 * Cache is pre-populated by initConfidenceCache() on startup and refreshed
 * asynchronously after each outcome submission.
 */
export function getGatewayConfidenceSync(gatewayType: string): GatewayConfidence | null {
  return cache.get(gatewayType) ?? null;
}

// ── Startup initialiser ──────────────────────────────────────────────────────

/**
 * Call once on startup (after migrations) to warm the confidence cache.
 * Exported for index.ts startup sequence.
 */
export async function initConfidenceCache(): Promise<void> {
  try {
    await refreshConfidence();
    console.log(`[routing-confidence] Cache warmed: ${cache.size} gateway(s) with outcome data`);
  } catch (err) {
    // Non-fatal — no outcome data yet is a valid state on first startup
    console.warn('[routing-confidence] Cache warm failed (may be first startup):', err instanceof Error ? err.message : err);
  }
}
