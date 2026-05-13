/**
 * dream-sampler.ts — Phase 48.3 DRW-07
 *
 * Deterministic stratified sampling of silo-tagged transcript turns.
 *
 * Algorithm (5 passes):
 *   1. Read corpus from session_transcript_turns (silo + last 7 days, ordered by session+turn_index).
 *   2. Tag each turn with stratum (today / 1-2d / 3-7d) + imperative flag.
 *   3. Compute budget: maxBytes capped at 200KB default, clamped to provided override.
 *   4. Pass A: force-include imperative-phrased turns up to 10% of budget.
 *      Pass B: within each stratum, include longest-first (40% today, 30% 1-2d, 20% 3-7d).
 *      Pass C: backfill remaining budget with longest-first across unselected turns.
 *   5. Sort final selection by (session_id, turn_index) ASC so the model sees conversational flow.
 *
 * All sampling decisions are returned in samplingLog (written to dream_runs.action_config.sampling).
 * No Math.random() — same DB state + same override yields the same selection.
 *
 * Model-aware sample-size policy is enforced by the CALLER (POST /dream-run endpoint in Plan 05).
 * The sampler accepts the override as-is and clamps only to the outer MAX_BUDGET_OPUS_BYTES (2.5MB)
 * ceiling. Routing Sonnet-class requests with Opus-class budgets is rejected at the endpoint, not here.
 */

import type pg from 'pg';

export interface SampledTurn {
  id: number;
  session_id: string;
  turn_index: number;
  role: 'user' | 'assistant';
  cwd: string | null;
  content: string;
  captured_at: Date;
  byte_size: number;
  stratum: 'today' | '1-2d' | '3-7d';
  is_imperative: boolean;
}

export interface SamplingLog {
  total_corpus_kb: number;
  total_turns: number;
  selected_turns: number;
  selected_kb: number;
  max_bytes_cap: number;
  strata: {
    today: { available: number; selected: number };
    '1-2d': { available: number; selected: number };
    '3-7d': { available: number; selected: number };
  };
  imperatives_forced: number;
  truncated_turns: number;
}

const PER_TURN_CAP_BYTES = 8 * 1024;                 // 8 KB hard cap per turn (signal density at synthesis time)
const DEFAULT_BUDGET_BYTES = 200 * 1024;             // 200 KB default budget
// Outer absolute ceiling enforced by the sampler. Per-model clamping (e.g. Sonnet 800KB) is the
// POST /dream-run endpoint's responsibility (Plan 05): it rejects with 400 INVALID_SAMPLE_SIZE_FOR_MODEL
// when model_override is sonnet-class AND sample_size_override > 800000. The sampler stays model-agnostic.
const MAX_BUDGET_OPUS_BYTES = 2_500_000;             // 2.5 MB Opus ceiling — outer absolute cap

const IMPERATIVE_REGEX = /^(always|never|stop|do not|don'?t|it should|never use|always use|use only|don'?t use)\b/i;

export interface SampleArgs {
  siloId: string;
  sampleSizeOverride?: number;  // bytes; clamped to MAX_BUDGET_OPUS_BYTES outer ceiling
}

export async function sampleSoftwareTurns(
  args: SampleArgs,
  pool: pg.Pool,
): Promise<{ turns: SampledTurn[]; samplingLog: SamplingLog }> {
  // ── 1. Read corpus
  const rows = (await pool.query(
    `SELECT id, session_id, turn_index, role, cwd, content, captured_at
       FROM session_transcript_turns
      WHERE silo_id = $1 AND captured_at >= NOW() - INTERVAL '7 days'
   ORDER BY session_id ASC, turn_index ASC`,
    [args.siloId],
  )).rows as Array<{
    id: number;
    session_id: string;
    turn_index: number;
    role: string;
    cwd: string | null;
    content: string;
    captured_at: Date;
  }>;

  // Outer-cap clamp: sampler accepts any caller-provided budget up to the Opus ceiling.
  // Model-specific clamping (e.g. Sonnet's 800KB) is the endpoint's responsibility (Plan 05).
  const maxBytes = Math.min(args.sampleSizeOverride ?? DEFAULT_BUDGET_BYTES, MAX_BUDGET_OPUS_BYTES);

  // ── 2. Tag stratum + imperative + truncate per-turn
  const nowMs = Date.now();
  const ONE_DAY = 86400 * 1000;
  const all: SampledTurn[] = [];
  let truncatedCount = 0;
  let totalCorpusBytes = 0;

  for (const r of rows) {
    let content = r.content;
    if (Buffer.byteLength(content, 'utf8') > PER_TURN_CAP_BYTES) {
      content = content.slice(0, PER_TURN_CAP_BYTES - 32) + '\n... [truncated]';
      truncatedCount++;
    }
    const byteSize = Buffer.byteLength(content, 'utf8');
    totalCorpusBytes += byteSize;
    const ageMs = nowMs - r.captured_at.getTime();
    const stratum: SampledTurn['stratum'] =
      ageMs < ONE_DAY ? 'today' : ageMs < 2 * ONE_DAY ? '1-2d' : '3-7d';
    all.push({
      id: r.id,
      session_id: r.session_id,
      turn_index: r.turn_index,
      role: r.role as 'user' | 'assistant',
      cwd: r.cwd,
      content,
      captured_at: r.captured_at,
      byte_size: byteSize,
      stratum,
      is_imperative: IMPERATIVE_REGEX.test(content),
    });
  }

  if (all.length === 0) {
    return {
      turns: [],
      samplingLog: {
        total_corpus_kb: 0,
        total_turns: 0,
        selected_turns: 0,
        selected_kb: 0,
        max_bytes_cap: maxBytes,
        strata: {
          today: { available: 0, selected: 0 },
          '1-2d': { available: 0, selected: 0 },
          '3-7d': { available: 0, selected: 0 },
        },
        imperatives_forced: 0,
        truncated_turns: 0,
      },
    };
  }

  // ── 3. Budget allocation (40/30/20/10)
  const budgetToday = Math.floor(maxBytes * 0.40);
  const budget12d = Math.floor(maxBytes * 0.30);
  const budget37d = Math.floor(maxBytes * 0.20);
  const budgetImp = Math.floor(maxBytes * 0.10);

  const selected = new Set<number>();           // turn id
  const counters = {
    today: 0,
    '1-2d': 0,
    '3-7d': 0,
    imperatives_forced: 0,
    total: 0,
  };

  // ── 4a. Pass A: force-include imperatives up to 10% cap (longest-first within imperatives)
  const imperatives = all
    .filter(t => t.is_imperative)
    .sort((a, b) => b.byte_size - a.byte_size);
  for (const t of imperatives) {
    if (counters.imperatives_forced + t.byte_size > budgetImp) continue;
    selected.add(t.id);
    counters.imperatives_forced += t.byte_size;
    counters.total += t.byte_size;
  }

  // ── 4b. Pass B: per-stratum longest-first within budget
  const stratumBudgets: Record<'today' | '1-2d' | '3-7d', number> = {
    today: budgetToday,
    '1-2d': budget12d,
    '3-7d': budget37d,
  };
  const stratumUsed: Record<'today' | '1-2d' | '3-7d', number> = {
    today: 0,
    '1-2d': 0,
    '3-7d': 0,
  };

  for (const stratum of ['today', '1-2d', '3-7d'] as const) {
    const candidates = all
      .filter(t => t.stratum === stratum && !selected.has(t.id))
      .sort((a, b) => b.byte_size - a.byte_size);
    for (const t of candidates) {
      if (stratumUsed[stratum] + t.byte_size > stratumBudgets[stratum]) continue;
      if (counters.total + t.byte_size > maxBytes) continue;
      selected.add(t.id);
      stratumUsed[stratum] += t.byte_size;
      counters[stratum] += t.byte_size;
      counters.total += t.byte_size;
    }
  }

  // ── 4c. Pass C: backfill any remaining budget with longest-first across all unselected
  if (counters.total < maxBytes) {
    const remaining = all
      .filter(t => !selected.has(t.id))
      .sort((a, b) => b.byte_size - a.byte_size);
    for (const t of remaining) {
      if (counters.total + t.byte_size > maxBytes) continue;
      selected.add(t.id);
      counters.total += t.byte_size;
    }
  }

  // ── 5. Final sort by (session_id, turn_index) for conversational flow
  const finalTurns = all
    .filter(t => selected.has(t.id))
    .sort((a, b) => a.session_id.localeCompare(b.session_id) || a.turn_index - b.turn_index);

  const samplingLog: SamplingLog = {
    total_corpus_kb: Math.round(totalCorpusBytes / 1024),
    total_turns: all.length,
    selected_turns: finalTurns.length,
    selected_kb: Math.round(counters.total / 1024),
    max_bytes_cap: maxBytes,
    strata: {
      today: {
        available: all.filter(t => t.stratum === 'today').length,
        selected: finalTurns.filter(t => t.stratum === 'today').length,
      },
      '1-2d': {
        available: all.filter(t => t.stratum === '1-2d').length,
        selected: finalTurns.filter(t => t.stratum === '1-2d').length,
      },
      '3-7d': {
        available: all.filter(t => t.stratum === '3-7d').length,
        selected: finalTurns.filter(t => t.stratum === '3-7d').length,
      },
    },
    imperatives_forced: finalTurns.filter(t => t.is_imperative).length,
    truncated_turns: truncatedCount,
  };

  return { turns: finalTurns, samplingLog };
}
