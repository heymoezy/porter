/**
 * dream-sampler.ts — Phase 48.3 DRW-07
 *
 * Deterministic stratified sampling of silo-tagged transcript turns.
 *
 * TWO corpora live here, chosen per-silo by `silos.detect_rules.corpus`:
 *   - sampleSoftwareTurns  → session_transcript_turns (what Moe TYPED)
 *   - sampleYmcCorpus      → the ymc_capital CRM database (what the business
 *                            ACCUMULATED) — Wave 5 / Phase 48.5, bottom of file.
 * Both return the same { turns, samplingLog } shape so dream-worker's render →
 * dispatch → parse path is corpus-agnostic.
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

import pg from 'pg';
import { scrubPII } from './pii-scrub.js';

/**
 * Which body of evidence a silo dreams over.
 *
 * `transcripts` — session_transcript_turns (software / admin / data-room).
 * `ymc`         — the ymc_capital CRM database (Wave 5 / Phase 48.5): documents,
 *                 contact notes, operator audit trail. A SEPARATE Postgres
 *                 database, reached over its own pool.
 *
 * Declared per-silo in `silos.detect_rules.corpus`; absent ⇒ 'transcripts'.
 * Data, not a code branch keyed on silo id — enrolling the next corpus-backed
 * silo stays one INSERT plus a prompt file.
 */
export type CorpusKind = 'transcripts' | 'ymc';

export type YmcSource = 'document' | 'contact_note' | 'audit';

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
  /**
   * Provenance label for corpora that are NOT CLI transcripts (Wave 5 / ymc).
   * A transcript turn identifies itself by session + cwd; a CRM corpus item has
   * no cwd, so it carries the row it came from (`document:<uuid>`,
   * `contact_note:<uuid>`, `audit:<action>@<resource_type>`). The worker's
   * formatTurnsBlock prefers this over `cwd` when present. Undefined for the
   * transcript sampler — that path is unchanged.
   */
  source_ref?: string;
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

  // ── Wave 5 (ymc corpus) — optional, absent on the transcript path ──────────
  /** Which corpus produced this sample. Absent ⇒ 'transcripts' (the software/admin/data-room path). */
  corpus?: CorpusKind;
  /** Recency window in days. The transcript sampler is fixed at 7; the ymc corpus reaches back further. */
  window_days?: number;
  /** Per-source availability/selection, so a starved source is visible in dream_runs.action_config. */
  sources?: Record<string, { available: number; selected: number; selected_kb: number }>;
  /**
   * id → source row, for EVERY selected item. The model cites integer ids in
   * `source_evidence.sample_turn_ids`; those ids are assigned per run and mean
   * nothing on their own. Without this map a reviewer cannot trace a proposal
   * back to the document or note that produced it, and un-traceable evidence is
   * how an unjudged rule gets accepted.
   */
  corpus_index?: Array<{ id: number; source: YmcSource; ref: string; label: string }>;
}

const PER_TURN_CAP_BYTES = 8 * 1024;                 // 8 KB hard cap per turn (signal density at synthesis time)
/**
 * Default corpus budget.
 *
 * Was 200KB, which NO gateway could actually digest: on 2026-07-29 a 200KB run
 * failed across the whole chain (claude timeout, codex error, antigravity error,
 * grok empty) while the SAME silo at 40KB completed on codex with 4 proposals.
 * 655 historical failures sit behind that number.
 *
 * 40KB is the size that has been observed to work end-to-end, not a guess.
 * Raising it again is fine — but prove it with a completed run first, because
 * the failure mode is silent: an oversized corpus fails every gateway and looks
 * like the council being down.
 */
const DEFAULT_BUDGET_BYTES = 40 * 1024;
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

// ═══════════════════════════════════════════════════════════════════════════
// Wave 5 / Phase 48.5 — YMC CRM corpus reader
// ═══════════════════════════════════════════════════════════════════════════
//
// The software silo dreams over what Moe TYPED. The ymc silo dreams over what
// the business ACCUMULATED: the documents that came in, the notes the team
// wrote on contacts, and the actions admins actually took. Same output shape
// (SampledTurn[] + SamplingLog) so dream-worker's render/dispatch/parse path is
// untouched — only the reader differs.
//
// ⚠️ Porter and ymc are SEPARATE Postgres databases. This module opens a second
// pool (same pattern ymc's backend/scripts/vault-ingest.ts uses in reverse:
// documented local default + env override). It is created LAZILY, so a Porter
// that never runs a ymc dream never opens a connection to ymc_capital.
//
// ⚠️ WHAT NEVER LEAVES THE BOX. A dream is dispatched over Bridge and may be
// answered by an EXTERNAL gateway. Three guards, in the SQL and in code:
//   1. Identity documents are excluded outright — `kyc_category IS NOT NULL`
//      is the flag ymc puts on passports/ICs/photo ID. No sampling policy makes
//      a passport safe to ship to a third-party model.
//   2. Contact notes are read WITHOUT the contact. The note text carries the
//      operating signal ("chase the countersignature before filing"); the name
//      attached to it carries only risk, so user_id is never joined out.
//   3. scrubPII() runs over every item's rendered text — emails, @handles,
//      phone numbers — the same redaction the transcript-capture path uses.
// This is the belt. The braces are the SQL above it: what is not selected
// cannot be redacted wrongly.

/**
 * Recency window for the ymc corpus, in days.
 *
 * NOT 7 like the transcript sampler. A CRM's week is mostly empty — 209 contact
 * notes and 601 extracted documents accumulated over years, not days. A 7-day
 * window would return an empty corpus most weeks and the run would score as a
 * "legitimate quiet week" while the archive it is supposed to learn from sat
 * unread.
 */
const YMC_WINDOW_DAYS = 90;

/** Audit trail looks back less far — an operator habit from 3 months ago is not a habit. */
const YMC_AUDIT_WINDOW_DAYS = 30;

/**
 * Per-item byte caps, per source.
 *
 * Documents are capped HARD (2KB, i.e. the head of the extracted text). What a
 * document teaches about how YMC works — its kind, who it belongs to, how it is
 * described, how it opens — is in the first page. Its twentieth page is
 * boilerplate that would eat the whole budget: 40% of a 40KB budget at the
 * transcript sampler's 8KB cap is TWO documents.
 */
const YMC_ITEM_CAPS: Record<YmcSource, number> = {
  document: 2 * 1024,
  contact_note: 4 * 1024,
  audit: 512,
};

/**
 * Budget split across sources. Documents and notes carry the operating signal;
 * the audit trail is corroboration (what got redone, and how often), so it gets
 * the smallest lane. Unspent budget in any lane is reclaimed by the backfill
 * pass, so a quiet source never wastes the run.
 */
const YMC_SOURCE_SHARE: Record<YmcSource, number> = {
  document: 0.4,
  contact_note: 0.4,
  audit: 0.2,
};

let ymcPoolSingleton: pg.Pool | null = null;

/**
 * Lazily open the pool to ymc_capital.
 *
 * Local default matches ymc's own backend/.env; YMC_DATABASE_URL overrides it.
 * ⚠️ NO HARDCODED FALLBACK. The first cut carried a default connection string
 * WITH A PASSWORD in it, on the reasoning that a trust-auth box makes it
 * harmless. **heymoezy/porter is a PUBLIC repository** — anything committed
 * there is world-readable immediately and permanently, and rotating afterwards
 * does not un-publish it. The pre-commit secret scan caught it; it should never
 * have been written. Configuration lives in ~/.config/porter/porter.env (600).
 *
 * Absent config, this throws rather than silently connecting somewhere: a dream
 * that cannot read the corpus must fail loudly, not quietly sample nothing.
 */
export function getYmcPool(): pg.Pool {
  if (!ymcPoolSingleton) {
    const url = process.env.YMC_DATABASE_URL;
    if (!url) {
      throw new Error(
        'YMC_DATABASE_URL is not set — the ymc dream silo cannot read its corpus. ' +
        'Set it in ~/.config/porter/porter.env (mode 600), never in the repo.',
      );
    }
    ymcPoolSingleton = new pg.Pool({ connectionString: url, max: 2 });
    ymcPoolSingleton.on('error', (err) =>
      console.error('[dream-sampler:ymc] idle client error', err.message),
    );
  }
  return ymcPoolSingleton;
}

/** Read the corpus a silo dreams over from its detect_rules. Unknown/absent ⇒ transcripts. */
export function corpusKindFromDetectRules(detectRules: unknown): CorpusKind {
  const c = (detectRules as { corpus?: unknown } | null)?.corpus;
  return c === 'ymc' ? 'ymc' : 'transcripts';
}

interface YmcRawItem {
  source: YmcSource;
  ref: string;
  label: string;
  createdAt: Date;
  text: string;
}

/**
 * PII redaction for CRM text — scrubPII with DATES held back.
 *
 * ⚠️ scrubPII's phone pattern is `\b\+?[\d][\d\s\-().]{7,}\d\b`, and `2026-07-31`
 * satisfies it exactly: leading digit, eight characters drawn from digits and
 * hyphens, trailing digit. On CLI transcripts that costs nothing. On this corpus
 * it is fatal — a dated certificate superseding an undated one, an expiry that
 * outranks a filing date, a fee due in thirty days: every rule this silo exists
 * to learn is a rule ABOUT dates, and the first sampler run redacted every one of
 * them ("last [REDACTED]").
 *
 * So dates are masked to an inert token, scrubPII runs, and the dates are put
 * back. The redaction itself is unchanged — this only stops it from eating what
 * it was never aimed at. Deliberately narrow: ISO `YYYY-MM-DD` and
 * `D/M/YYYY`-style dates only. A nine-digit run that is NOT date-shaped is still
 * treated as a phone number and still redacted.
 */
function scrubYmcText(text: string): string {
  const dates: string[] = [];
  // Token shape matters: the brackets are NOT in scrubPII's phone character
  // class, so a run of masked dates can never re-form into something that looks
  // like a phone number, and the mask carries no spaces of its own — restoring it
  // cannot eat the whitespace around a date at a string boundary.
  const masked = text.replace(
    /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/g,
    (m) => {
      dates.push(m);
      return `[[D${dates.length - 1}]]`;
    },
  );
  const scrubbed = scrubPII(masked);
  return scrubbed.replace(/\[\[D(\d+)\]\]/g, (_m, i) => dates[Number(i)] ?? '');
}

function truncateTo(text: string, cap: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, 'utf8') <= cap) return { text, truncated: false };
  return { text: text.slice(0, cap - 32) + '\n... [truncated]', truncated: true };
}

/**
 * Sample the ymc_capital CRM corpus.
 *
 * Ordering is deterministic — sources in a fixed order, each by created_at DESC
 * — so ids are stable within a run and the same DB state yields the same
 * selection. No Math.random(), same contract as sampleSoftwareTurns.
 *
 * Strata are REUSED, not re-derived, so SamplingLog stays one shape. Their
 * meaning is rebased to the 90-day window and recorded in samplingLog.window_days:
 *   today  = 0-7 days    1-2d = 8-30 days    3-7d = 31-90 days
 */
export async function sampleYmcCorpus(
  args: SampleArgs,
  ymcPool: pg.Pool,
): Promise<{ turns: SampledTurn[]; samplingLog: SamplingLog }> {
  const maxBytes = Math.min(args.sampleSizeOverride ?? DEFAULT_BUDGET_BYTES, MAX_BUDGET_OPUS_BYTES);
  const raw: YmcRawItem[] = [];

  // ── 1. Documents. Identity documents excluded in the WHERE clause, not later.
  const docs = (await ymcPool.query(
    `SELECT id::text            AS ref,
            created_at,
            COALESCE(title, filename) AS label,
            type,
            category,
            requirement_slug,
            extracted_text
       FROM documents
      WHERE extracted_text IS NOT NULL
        AND length(extracted_text) >= 200
        AND kyc_category IS NULL
        AND created_at >= NOW() - ($1 || ' days')::interval
   ORDER BY created_at DESC
      LIMIT 400`,
    [YMC_WINDOW_DAYS],
  )).rows as Array<{
    ref: string; created_at: Date; label: string; type: string;
    category: string | null; requirement_slug: string | null; extracted_text: string;
  }>;
  for (const d of docs) {
    const meta = [
      `type=${d.type}`,
      d.category ? `category=${d.category}` : null,
      d.requirement_slug ? `requirement=${d.requirement_slug}` : null,
    ].filter(Boolean).join(' ');
    raw.push({
      source: 'document',
      ref: `document:${d.ref}`,
      label: d.label,
      createdAt: d.created_at,
      text: `[document] ${d.label} (${meta})\n${d.extracted_text}`,
    });
  }

  // ── 2. Contact notes — the note, never the contact (see header guard 2).
  const notes = (await ymcPool.query(
    `SELECT id::text AS ref, created_at, content, is_pinned
       FROM contact_notes
      WHERE created_at >= NOW() - ($1 || ' days')::interval
   ORDER BY created_at DESC
      LIMIT 400`,
    [YMC_WINDOW_DAYS],
  )).rows as Array<{ ref: string; created_at: Date; content: string; is_pinned: boolean }>;
  for (const n of notes) {
    raw.push({
      source: 'contact_note',
      ref: `contact_note:${n.ref}`,
      label: n.is_pinned ? 'pinned note' : 'note',
      createdAt: n.created_at,
      text: `[contact note${n.is_pinned ? ' — PINNED' : ''}] ${n.content}`,
    });
  }

  // ── 3. Audit trail, AGGREGATED. Never raw rows.
  //
  // ⚠️ audit_events records edits WE made — it is not evidence that anything was
  // read, agreed, or engaged with. Aggregated it answers exactly one honest
  // question: what does this team keep doing, and what does it keep REDOING?
  // A resource touched by the same action 3+ times in a month is rework, and
  // rework is where an operating rule is missing.
  const actions = (await ymcPool.query(
    `SELECT action, resource_type, COUNT(*)::int AS n, MAX(created_at) AS last_at
       FROM audit_events
      WHERE created_at >= NOW() - ($1 || ' days')::interval
   GROUP BY action, resource_type
     HAVING COUNT(*) >= 2
   ORDER BY n DESC
      LIMIT 60`,
    [YMC_AUDIT_WINDOW_DAYS],
  )).rows as Array<{ action: string; resource_type: string; n: number; last_at: Date }>;
  for (const a of actions) {
    raw.push({
      source: 'audit',
      ref: `audit:${a.action}@${a.resource_type}`,
      label: `${a.action} on ${a.resource_type}`,
      createdAt: a.last_at,
      text: `[audit — volume] ${a.action} on ${a.resource_type}: ${a.n} times in the last ${YMC_AUDIT_WINDOW_DAYS} days (last ${a.last_at.toISOString().slice(0, 10)})`,
    });
  }
  const rework = (await ymcPool.query(
    `SELECT action, resource_type, resource_id, COUNT(*)::int AS n, MAX(created_at) AS last_at
       FROM audit_events
      WHERE created_at >= NOW() - ($1 || ' days')::interval
        AND resource_id IS NOT NULL
   GROUP BY action, resource_type, resource_id
     HAVING COUNT(*) >= 3
   ORDER BY n DESC
      LIMIT 40`,
    [YMC_AUDIT_WINDOW_DAYS],
  )).rows as Array<{ action: string; resource_type: string; resource_id: string; n: number; last_at: Date }>;
  for (const r of rework) {
    raw.push({
      source: 'audit',
      ref: `audit:rework:${r.action}@${r.resource_type}:${r.resource_id}`,
      label: `rework — ${r.action} on ${r.resource_type}`,
      createdAt: r.last_at,
      text: `[audit — rework] the SAME ${r.resource_type} was hit by ${r.action} ${r.n} times in ${YMC_AUDIT_WINDOW_DAYS} days (last ${r.last_at.toISOString().slice(0, 10)}). One record being redone repeatedly is a missing rule, not a busy week.`,
    });
  }

  // ── 4. Normalize into SampledTurn shape ─────────────────────────────────
  const nowMs = Date.now();
  const ONE_DAY = 86400 * 1000;
  const all: SampledTurn[] = [];
  const indexById = new Map<number, { source: YmcSource; ref: string; label: string }>();
  const perSourceOrdinal: Record<string, number> = {};
  let truncatedCount = 0;
  let totalCorpusBytes = 0;
  let nextId = 1;

  for (const item of raw) {
    const capped = truncateTo(item.text, YMC_ITEM_CAPS[item.source]);
    if (capped.truncated) truncatedCount++;
    // PII redaction runs AFTER truncation so the cap is applied to real text and
    // the redaction token count can't push an item back over the cap.
    const content = scrubYmcText(capped.text);
    const byteSize = Buffer.byteLength(content, 'utf8');
    totalCorpusBytes += byteSize;
    const ageMs = nowMs - item.createdAt.getTime();
    const stratum: SampledTurn['stratum'] =
      ageMs < 7 * ONE_DAY ? 'today' : ageMs < 30 * ONE_DAY ? '1-2d' : '3-7d';
    const sessionId = `ymc:${item.source}`;
    perSourceOrdinal[sessionId] = (perSourceOrdinal[sessionId] ?? 0) + 1;
    const id = nextId++;
    indexById.set(id, { source: item.source, ref: item.ref, label: item.label });
    all.push({
      id,
      session_id: sessionId,
      turn_index: perSourceOrdinal[sessionId],
      // A contact note was typed by a person; a document's extracted text and an
      // audit aggregate were produced by machinery. The role field only has two
      // values, so human-authored maps to 'user' and derived maps to 'assistant'.
      role: item.source === 'contact_note' ? 'user' : 'assistant',
      cwd: null,
      source_ref: item.ref,
      content,
      captured_at: item.createdAt,
      byte_size: byteSize,
      stratum,
      is_imperative: IMPERATIVE_REGEX.test(content),
      // ALWAYS false on this corpus, and that is the honest value.
      //
      // FRUSTRATION_REGEX is calibrated for a person typing at a CLI, and its
      // rant_caps arm (`[A-Z]{4,} [A-Z]{2,} [A-Z]{2,}` under a global /i)
      // degenerates to "any three words" on ordinary prose: on the first real
      // run it tagged 106 of 107 selected items. Nothing here consumes the flag
      // either — the ymc reader has no frustration lane, because a document
      // cannot be annoyed. A number that is 99% false positives in a log a
      // reviewer trusts is worse than no number.
      is_frustration: false,
    });
  }

  const emptyLog = (): SamplingLog => ({
    total_corpus_kb: Math.round(totalCorpusBytes / 1024),
    total_turns: all.length,
    selected_turns: 0,
    selected_kb: 0,
    max_bytes_cap: maxBytes,
    strata: {
      today: { available: all.filter(t => t.stratum === 'today').length, selected: 0 },
      '1-2d': { available: all.filter(t => t.stratum === '1-2d').length, selected: 0 },
      '3-7d': { available: all.filter(t => t.stratum === '3-7d').length, selected: 0 },
    },
    imperatives_forced: 0,
    truncated_turns: truncatedCount,
    frustration_forced: 0,
    frustration_forced_examples: [],
    corpus: 'ymc',
    window_days: YMC_WINDOW_DAYS,
    sources: {},
    corpus_index: [],
  });

  if (all.length === 0) return { turns: [], samplingLog: emptyLog() };

  // ── 5. Selection: per-source lane, recency-first, then a global backfill ──
  //
  // Recency-first (NOT longest-first like the transcript sampler): a long
  // document is not a more important document, and longest-first would let one
  // 40-page scan crowd out ten notes written this week.
  const selected = new Set<number>();
  const sourceUsed: Record<string, number> = { document: 0, contact_note: 0, audit: 0 };
  let totalUsed = 0;

  for (const source of ['contact_note', 'document', 'audit'] as const) {
    const lane = Math.floor(maxBytes * YMC_SOURCE_SHARE[source]);
    const candidates = all
      .filter(t => t.session_id === `ymc:${source}`)
      .sort((a, b) => b.captured_at.getTime() - a.captured_at.getTime());
    for (const t of candidates) {
      if (sourceUsed[source] + t.byte_size > lane) continue;
      if (totalUsed + t.byte_size > maxBytes) continue;
      selected.add(t.id);
      sourceUsed[source] += t.byte_size;
      totalUsed += t.byte_size;
    }
  }

  // Backfill: a quiet source hands its unspent lane back rather than shrinking the run.
  if (totalUsed < maxBytes) {
    const remaining = all
      .filter(t => !selected.has(t.id))
      .sort((a, b) => b.captured_at.getTime() - a.captured_at.getTime());
    for (const t of remaining) {
      if (totalUsed + t.byte_size > maxBytes) continue;
      selected.add(t.id);
      const src = t.session_id.slice('ymc:'.length);
      sourceUsed[src] = (sourceUsed[src] ?? 0) + t.byte_size;
      totalUsed += t.byte_size;
    }
  }

  const finalTurns = all
    .filter(t => selected.has(t.id))
    .sort((a, b) => a.session_id.localeCompare(b.session_id) || a.turn_index - b.turn_index);

  const sources: NonNullable<SamplingLog['sources']> = {};
  for (const source of ['contact_note', 'document', 'audit'] as const) {
    sources[source] = {
      available: all.filter(t => t.session_id === `ymc:${source}`).length,
      selected: finalTurns.filter(t => t.session_id === `ymc:${source}`).length,
      selected_kb: Math.round((sourceUsed[source] ?? 0) / 1024),
    };
  }

  const samplingLog: SamplingLog = {
    total_corpus_kb: Math.round(totalCorpusBytes / 1024),
    total_turns: all.length,
    selected_turns: finalTurns.length,
    selected_kb: Math.round(totalUsed / 1024),
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
    frustration_forced: finalTurns.filter(t => t.is_frustration).length,
    frustration_forced_examples: [],
    corpus: 'ymc',
    window_days: YMC_WINDOW_DAYS,
    sources,
    corpus_index: finalTurns.map(t => {
      const e = indexById.get(t.id)!;
      return { id: t.id, source: e.source, ref: e.ref, label: e.label };
    }),
  };

  return { turns: finalTurns, samplingLog };
}
