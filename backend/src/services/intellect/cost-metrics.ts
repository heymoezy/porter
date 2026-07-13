/**
 * #49 — cost per ACCEPTED change.
 *
 * The loops-article metric: "the metric that matters is not tokens spent or tasks
 * attempted. It's cost per accepted change. Below 50% acceptance the loop costs
 * more than it saves." You cannot manage a loop you cannot measure — and until
 * now we were flying blind on exactly this.
 *
 * HONESTY RULES (this measures our own work, so it must not flatter us):
 *  - TOKENS ARE EXACT. They come from the CLI transcript's per-message usage.
 *  - COST IS APPROXIMATE. Derived from a rate table below — clearly labelled,
 *    never presented as a billing figure.
 *  - ACCEPTANCE IS OBSERVED, NOT ASSERTED. A release counts as accepted only if
 *    it survived in git (not reverted). We do not get to grade our own homework.
 */
import { pool } from '../../db/client.js';

/**
 * USD per 1M tokens. Approximate, and deliberately easy to correct — a wrong
 * rate must never be mistaken for a bill. Unknown models fall back to a mid rate
 * rather than silently costing zero (zero would flatter the metric).
 */
const RATES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-4-8':  { in: 5.00, out: 25.00, cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-fable-5':   { in: 3.00, out: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-sonnet-5':  { in: 3.00, out: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-haiku-4-5': { in: 1.00, out:  5.00, cacheRead: 0.10, cacheWrite: 1.25 },
  __default:          { in: 3.00, out: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
};

export interface SessionUsage {
  sessionId: string;
  project?: string | null;
  gateway?: string | null;
  models?: string[];
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  releases?: number;
  reverts?: number;
}

export function estimateCostUsd(u: Omit<SessionUsage, 'sessionId'>): number {
  // Blend rates across the models actually seen; unknown → mid rate (never free).
  const models = (u.models ?? []).filter((m) => m && m !== '<synthetic>');
  const rates = models.length
    ? models.map((m) => RATES[m] ?? RATES.__default)
    : [RATES.__default];
  const avg = (k: 'in' | 'out' | 'cacheRead' | 'cacheWrite') =>
    rates.reduce((s, r) => s + r[k], 0) / rates.length;
  const cost =
    (u.inputTokens / 1e6) * avg('in') +
    (u.outputTokens / 1e6) * avg('out') +
    (u.cacheRead / 1e6) * avg('cacheRead') +
    (u.cacheWrite / 1e6) * avg('cacheWrite');
  return Math.round(cost * 10000) / 10000;
}

/** Idempotent per session — a re-reported session updates, never double-counts. */
export async function recordSessionUsage(u: SessionUsage): Promise<{ costUsd: number }> {
  const costUsd = estimateCostUsd(u);
  await pool.query(
    `INSERT INTO session_usage
       (session_id, project_key, gateway, models, input_tokens, output_tokens, cache_read, cache_write, cost_usd, releases, reverts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (session_id) DO UPDATE SET
       project_key = EXCLUDED.project_key, gateway = EXCLUDED.gateway, models = EXCLUDED.models,
       input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens,
       cache_read = EXCLUDED.cache_read, cache_write = EXCLUDED.cache_write,
       cost_usd = EXCLUDED.cost_usd, releases = EXCLUDED.releases, reverts = EXCLUDED.reverts`,
    [
      u.sessionId, u.project ?? null, u.gateway ?? null, u.models ?? [],
      u.inputTokens, u.outputTokens, u.cacheRead, u.cacheWrite, costUsd,
      u.releases ?? 0, u.reverts ?? 0,
    ],
  );
  return { costUsd };
}

export interface CostPerChange {
  project: string | null;
  sessions: number;
  totalCostUsd: number;
  outputTokens: number;
  releasesShipped: number;
  releasesReverted: number;
  releasesAccepted: number;
  acceptanceRate: number | null;   // accepted / shipped
  costPerAcceptedChange: number | null;
  verdict: string;
  note: string;
}

/**
 * The number that decides whether the loop is worth running.
 * Deliberately blunt: if acceptance is under 50%, say so.
 */
export async function costPerAcceptedChange(project?: string | null): Promise<CostPerChange> {
  const rows = (await pool.query(
    `SELECT COUNT(*)::int AS sessions,
            COALESCE(SUM(cost_usd),0)::float AS cost,
            COALESCE(SUM(output_tokens),0)::bigint AS out_tokens,
            COALESCE(SUM(releases),0)::int AS shipped,
            COALESCE(SUM(reverts),0)::int AS reverted
       FROM session_usage
      WHERE ($1::text IS NULL OR project_key = $1)`,
    [project ?? null],
  )).rows[0] as { sessions: number; cost: number; out_tokens: string; shipped: number; reverted: number };

  const shipped = rows.shipped;
  const reverted = rows.reverted;
  const accepted = Math.max(0, shipped - reverted);
  const acceptanceRate = shipped > 0 ? accepted / shipped : null;
  const costPer = accepted > 0 ? Math.round((rows.cost / accepted) * 100) / 100 : null;

  let verdict: string;
  if (shipped === 0) verdict = 'No releases recorded yet — nothing to judge.';
  else if (acceptanceRate !== null && acceptanceRate < 0.5) {
    verdict = `ACCEPTANCE ${(acceptanceRate * 100).toFixed(0)}% — below 50%. The loop is costing more than it saves; you are doing the review work it was meant to save.`;
  } else {
    verdict = `Acceptance ${((acceptanceRate ?? 0) * 100).toFixed(0)}% — the loop is paying for itself.`;
  }

  return {
    project: project ?? null,
    sessions: rows.sessions,
    totalCostUsd: Math.round(rows.cost * 100) / 100,
    outputTokens: Number(rows.out_tokens),
    releasesShipped: shipped,
    releasesReverted: reverted,
    releasesAccepted: accepted,
    acceptanceRate: acceptanceRate === null ? null : Math.round(acceptanceRate * 100) / 100,
    costPerAcceptedChange: costPer,
    verdict,
    note: 'Tokens are exact (from the CLI transcript). Cost is an ESTIMATE from a rate table — not a bill. Acceptance is observed from git (a release survives = accepted); we do not grade our own work.',
  };
}
