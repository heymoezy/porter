/**
 * dream-sampler.ts — Phase 48.3 DRW-07
 *
 * Deterministic stratified sampling of silo-tagged transcript turns.
 *
 * Algorithm (5 passes):
 *   1. Read corpus from session_transcript_turns (silo + last 7 days, ordered by session+turn_index).
 *   2. Tag each turn with stratum (today / 1-2d / 3-7d) + imperative flag + frustration flag.
 *      Frustration tagging uses sanitizeForFrustrationCheck(content) — strips XML blobs, WhatsApp
 *      log pastes, fenced code, SQL-keyword lines — then matches against FRUSTRATION_REGEX.
 *   3. Compute budget: maxBytes capped at 200KB default, clamped to provided override.
 *   4. Pass A0 (LRN-01): force-include USER-role frustration-marker turns up to 10% of budget,
 *                       recency-first (most-recent rant beats older one).
 *      Pass A:  force-include imperative-phrased turns up to 10% of budget.
 *      Pass B:  within each stratum, include longest-first (40% today, 30% 1-2d, 20% 3-7d).
 *      Pass C:  backfill remaining budget with longest-first across unselected turns.
 *      Potential allocation sums to 110% but counters.total <= maxBytes clamp keeps actual <= 100%.
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
  is_frustration: boolean;       // LRN-01 (Phase 49) — frustration-marker tag (computed against sanitized content)
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
  frustration_forced: number;                 // LRN-01 (Phase 49) — count of user turns force-included via Pass A0
  frustration_forced_examples: number[];      // LRN-01 (Phase 49) — first 3 matched turn IDs (audit/debug)
}

const PER_TURN_CAP_BYTES = 8 * 1024;                 // 8 KB hard cap per turn (signal density at synthesis time)
const DEFAULT_BUDGET_BYTES = 200 * 1024;             // 200 KB default budget
// Outer absolute ceiling enforced by the sampler. Per-model clamping (e.g. Sonnet 800KB) is the
// POST /dream-run endpoint's responsibility (Plan 05): it rejects with 400 INVALID_SAMPLE_SIZE_FOR_MODEL
// when model_override is sonnet-class AND sample_size_override > 800000. The sampler stays model-agnostic.
const MAX_BUDGET_OPUS_BYTES = 2_500_000;             // 2.5 MB Opus ceiling — outer absolute cap

const IMPERATIVE_REGEX = /^(always|never|stop|do not|don'?t|it should|never use|always use|use only|don'?t use)\b/i;

// LRN-01 (Phase 49) — preprocessing guards calibrated against 49-FRUSTRATION-CALIBRATION.md.
// Each guard kills a specific false-positive class observed in the 223-turn 7-day corpus:
//   Guard 1: <task-notification>...</task-notification> XML blobs (system noise, not user speech)
//   Guard 2: WhatsApp chat-log pastes [H:MM, M/D/YYYY] — other people's words, not Moe's frustration
//   Guard 3: Fenced code blocks ```...``` and inline `backticks` — variable names create noise
// Plus SQL-keyword line exclusion applied for rant_caps (calibration killed FPs at turn ids 297, 364).
// Applied to each turn's content BEFORE regex matching. MUST be called from the per-turn loop;
// is_frustration tagging uses the sanitized result, not the raw content.
export function sanitizeForFrustrationCheck(content: string): string {
  if (!content) return '';
  let s = content;
  // Guard 1: strip task-notification XML blobs
  s = s.replace(/<task-notification>[\s\S]*?<\/task-notification>/gi, ' ');
  // Guard 2: drop WhatsApp-log paste blocks — lines starting with [H:MM, M/D/YYYY]
  s = s
    .split('\n')
    .filter((line) => !/^\s*\[\d{1,2}:\d{2},\s*\d{1,2}\/\d{1,2}\/\d{4}\]/.test(line))
    .join('\n');
  // Guard 3a: strip fenced code blocks ```...```
  s = s.replace(/```[\s\S]*?```/g, ' ');
  // Guard 3b: strip inline backtick spans
  s = s.replace(/`[^`\n]*`/g, ' ');
  // SQL-keyword line exclusion (applied to all lines — these are SQL-DDL noise, not user complaints)
  s = s
    .split('\n')
    .filter((line) => !/^\s*(ON DELETE|SET NULL|CASCADE|SELECT|INSERT|UPDATE|CREATE TABLE|FROM|WHERE)\b/.test(line))
    .join('\n');
  return s;
}

// LRN-01 (Phase 49) — frustration-marker regex set.
// CANONICAL source: 49-FRUSTRATION-CALIBRATION.md §2 (empirical, 223-turn 7-day corpus).
// 4.0% any-marker hit rate, 0.9% multi-marker. Reference turns 1604+1605 fire decisively.
// MUST be matched against sanitizeForFrustrationCheck(content), NOT raw content.
//
// Note on the global /i flag: with /i the [A-Z] ranges in rant_caps become effectively [A-Za-z],
// so rant_caps WILL fire on lowercase too — acceptable since rant_caps requires 3 word-sized
// tokens in a row (4+/2+/2+ minimum), and the SQL-keyword guard + per-pattern precision keep
// false positives low. If post-deployment audit (frustration_forced_examples) shows persistent
// lowercase rant_caps garbage, switch to per-pattern inline flags ((?i:...)) for the other 9
// markers and drop the global /i flag from rant_caps.
const FRUSTRATION_REGEX = new RegExp(
  [
    // rant_caps: 3+ all-caps words in a row. SQL-keyword lines stripped by sanitizer.
    '[A-Z]{4,} [A-Z]{2,} [A-Z]{2,}',
    // every_time: canonical recurring-failure marker (100% precision in calibration)
    '(?:every (?:single )?time (?:you|i))',
    // same_mistake: anaphoric recurrence reference (100% precision)
    '(?:same mistake)',
    // still_<broken>: recurrence-by-state (50% precision raw, net positive after WhatsApp guard)
    '(?:still (?:broken|not working|wrong|failing|missing|fucked))',
    // i_told_you: explicit repetition complaint (100% precision)
    '(?:i (?:just |already )?told you)',
    // direct_address: pattern-of-behavior complaint (100% precision)
    '(?:\\b(?:you keep|claude keeps|you ignored|you forgot)\\b)',
    // freehand: Moe-specific anti-pattern lexicon, 100% precision, 3 hits in calibration
    '(?:freehand)',
    // stop_doing: explicit stop-this-pattern (100% precision)
    '(?:stop (?:doing|guessing|making|freehand))',
    // profanity: low-volume, ~75% precision (calibration n=2, both real frustration)
    '(?:\\b(?:fuck|shit|damn|wtf)\\b)',
    // repeat_punct: zero cost, high precision when it fires
    '(?:!{3,}|\\?{3,})',
  ].join('|'),
  'i',
);

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
    // LRN-01 (Phase 49) — sanitize BEFORE frustration regex; guards strip XML blobs, WhatsApp logs,
    // code fences, and SQL-keyword lines so the regex only sees user prose.
    const sanitized = sanitizeForFrustrationCheck(content);
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
      is_frustration: FRUSTRATION_REGEX.test(sanitized),   // LRN-01 — uses sanitized content
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
        frustration_forced: 0,                 // LRN-01 — safe default for empty corpus
        frustration_forced_examples: [],       // LRN-01 — safe default for empty corpus
      },
    };
  }

  // ── 3. Budget allocation (40/30/20/10 + 10% frustration lane — LRN-01).
  // Total potential allocation is 110% but Pass B/C honor the counters.total <= maxBytes clamp so
  // the actual selection never exceeds maxBytes. Pass A0 (frustration) and Pass A (imperative) are
  // additive on top of the stratum budgets; B/C cede budget naturally as total approaches maxBytes.
  const budgetToday = Math.floor(maxBytes * 0.40);
  const budget12d = Math.floor(maxBytes * 0.30);
  const budget37d = Math.floor(maxBytes * 0.20);
  const budgetImp = Math.floor(maxBytes * 0.10);
  const budgetFrustration = Math.floor(maxBytes * 0.10);   // LRN-01 — 10% lane, recency-first, user-role only

  const selected = new Set<number>();           // turn id
  const counters = {
    today: 0,
    '1-2d': 0,
    '3-7d': 0,
    imperatives_forced: 0,
    frustration_forced: 0,                       // LRN-01
    total: 0,
  };

  // ── 4a-prime. Pass A0 (LRN-01 / Phase 49): frustration force-include @ 10% budget,
  //             user-role only, recency-first. Inserted BEFORE the imperative lane so a
  //             fresh frustration turn beats a long old "always X" imperative when budgets
  //             compete via the counters.total clamp below. Markers calibrated in
  //             49-FRUSTRATION-CALIBRATION.md (4% any-marker rate on 7-day software corpus).
  //             Reference: YMC turns 1604 (5 markers) + 1605 (3 markers) — both guaranteed force-include.
  const frustrations = all
    .filter(t => t.role === 'user' && t.is_frustration)
    .sort((a, b) => b.captured_at.getTime() - a.captured_at.getTime());
  const frustrationForcedExamples: number[] = [];
  for (const t of frustrations) {
    if (counters.frustration_forced + t.byte_size > budgetFrustration) continue;
    if (counters.total + t.byte_size > maxBytes) continue;
    if (selected.has(t.id)) continue;
    selected.add(t.id);
    counters.frustration_forced += t.byte_size;
    counters.total += t.byte_size;
    if (frustrationForcedExamples.length < 3) frustrationForcedExamples.push(t.id);
  }

  // ── 4a. Pass A: force-include imperatives up to 10% cap (longest-first within imperatives).
  //         Skips turns already selected by Pass A0 (frustration) to avoid double-budgeting.
  const imperatives = all
    .filter(t => t.is_imperative)
    .sort((a, b) => b.byte_size - a.byte_size);
  for (const t of imperatives) {
    if (selected.has(t.id)) continue;                                  // LRN-01 — skip if Pass A0 already grabbed it
    if (counters.imperatives_forced + t.byte_size > budgetImp) continue;
    if (counters.total + t.byte_size > maxBytes) continue;             // LRN-01 — honor global clamp too
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
    frustration_forced: finalTurns.filter(t => t.is_frustration).length,   // LRN-01 (Phase 49)
    frustration_forced_examples: frustrationForcedExamples,                // LRN-01 (Phase 49) — first 3 ids
  };

  return { turns: finalTurns, samplingLog };
}
