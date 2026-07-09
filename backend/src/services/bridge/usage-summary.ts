/**
 * usage-summary.ts — per-gateway CONSUMPTION monitoring across ALL Bridge CLIs.
 *
 * Moe wanted Bridge to "monitor usage on all these CLIs to avoid hitting limits."
 * The honest, reliable way: the CLIs (codex, grok, antigravity) do NOT expose a
 * usage/quota command, and we call them as subprocesses, so we can't read
 * provider-side rate-limit headers (that path exists ONLY for Claude — see
 * usage-collector.ts, which probes Anthropic and writes gateway_rate_limits).
 *
 * So for every gateway we report what we ACTUALLY consumed, from the data we
 * already log on every dispatch (bridge_dispatch_log: tokens, cost, latency).
 * That is 100% reliable and provider-agnostic — the trend per gateway is the
 * early-warning signal for "are we hammering one backend". Not a fake quota
 * scraper (the old version that never worked); real consumption.
 */
import { pool } from '../../db/client.js';

export interface GatewayUsageWindow {
  gatewayType: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  avgLatencyMs: number | null;
  lastAt: number | null; // epoch seconds
}

/** Rolling windows mirror the Claude collector's 5h/7d, plus a 24h view. */
export const USAGE_WINDOWS: Record<string, number> = {
  '5h': 5 * 3600,
  '24h': 24 * 3600,
  '7d': 7 * 24 * 3600,
};

interface Row {
  gateway_type: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  avg_latency_ms: number | null;
  last_at: number | null;
}

/**
 * Per-gateway consumption for each rolling window, newest-activity first.
 * NOTE: input_tokens is only populated by the Claude adapter today; codex/grok/
 * antigravity log calls + output_tokens + latency but not input tokens (adapter
 * gap, surfaced honestly rather than shown as a false 0-cost).
 */
export async function gatewayUsageSummary(): Promise<Record<string, GatewayUsageWindow[]>> {
  const out: Record<string, GatewayUsageWindow[]> = {};
  for (const [label, secs] of Object.entries(USAGE_WINDOWS)) {
    const { rows } = await pool.query<Row>(
      `SELECT gateway_type,
              count(*)::int                              AS calls,
              COALESCE(sum(input_tokens), 0)::int        AS input_tokens,
              COALESCE(sum(output_tokens), 0)::int       AS output_tokens,
              COALESCE(sum(estimated_cost_usd), 0)::float AS cost_usd,
              round(avg(latency_ms))::int                AS avg_latency_ms,
              max(created_at)::float                     AS last_at
         FROM bridge_dispatch_log
        WHERE created_at > extract(epoch FROM now()) - $1
        GROUP BY gateway_type
        ORDER BY calls DESC`,
      [secs],
    );
    out[label] = rows.map((r) => ({
      gatewayType: r.gateway_type,
      calls: r.calls,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      costUsd: r.cost_usd,
      avgLatencyMs: r.avg_latency_ms,
      lastAt: r.last_at,
    }));
  }
  return out;
}
