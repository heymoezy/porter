/**
 * supersession.ts — semantic contradiction detection for directives.
 *
 * THE IDEA IS IMPORTED FROM supermemory (supermemoryai/supermemory, MIT). Its
 * central claim is that memory is not RAG: a store that only accumulates gets
 * worse over time, because "I live in NYC" and "I moved to SF" both keep
 * scoring. What makes it a memory is knowing the second RETIRES the first.
 * That is the piece Porter did not have.
 *
 * WHAT PORTER HAD INSTEAD
 * -----------------------
 * `memory-pruner.ts` retires duplicates at pg_trgm `similarity >= 0.85`, and
 * `consolidation.ts` merges agent notes at `> 0.6`. Both are LEXICAL. Two rules
 * that contradict each other in meaning while sharing almost no trigrams —
 *
 *     "Always deploy from main after CI passes"
 *     "Never ship without Moe's sign-off, regardless of CI"
 *
 * — are 0.1 on trigrams. Neither is retired. BOTH inject, into the same prompt,
 * and the model picks one. That is the failure this closes.
 *
 * ⚠️ WE DID NOT IMPORT THEIR RESOLUTION POLICY, AND MUST NOT.
 * supermemory resolves by recency: the newer statement wins, because a user's
 * later fact about themselves supersedes the earlier one. Porter's directives
 * are not user facts, they are RULES WITH A PRECEDENCE LATTICE. Moe's rules sit
 * at priority >= 90 and agent-written ones clamp to <= 89 precisely so an agent
 * can never outrank him. Recency-wins would let a directive an agent wrote this
 * morning retire a rule Moe set in June — silently, in a background job. So
 * PRECEDENCE OUTRANKS RECENCY here, and `gateSupersession()` below is where that
 * is enforced.
 *
 * ⚠️ PROPOSES, DOES NOT APPLY. Every finding lands in `memory_proposals`
 * (kind='supersede', status='pending') for review, the same queue the dream
 * worker writes to. A contradiction is a judgement call in a way a duplicate is
 * not, and the cost of being wrong is a rule silently leaving every prompt.
 * `applySupersession()` exists and is exercised by review, never by the scan.
 *
 * ⚠️ moe-direct ROWS ARE SEALED BY A DB TRIGGER. An UPDATE against one aborts
 * the transaction — this is what broke the nightly pruner from 2026-05-09 until
 * PR-1. They are excluded at the query, at the gate, and at apply.
 */
import { randomUUID } from 'node:crypto';
import { pool } from '../../db/client.js';
import { embed } from './embeddings.js';
import { logIntellectEvent } from './file-watcher.js';
import { routingEngine } from '../bridge/routing-engine.js';
import type { BridgeDispatchRequest, RoutingContext } from '../bridge/types.js';

/** Mirrors directive-scorer.ts. Rules at or above this are Moe's and bind. */
export const ALWAYS_INJECT_MIN_PRIORITY = 90;

/**
 * Cosine floor for "these two are about the same thing".
 * Deliberately high: the adjudicator costs a model call per pair, and a scan
 * that proposes a hundred maybes is one nobody reads.
 */
export const TOPIC_SIMILARITY_MIN = 0.72;

/**
 * Trigram ceiling. Above this the existing pruner already handles the pair as a
 * duplicate, so anything at or over it is skipped — this scan exists for what
 * lexical similarity CANNOT see, and double-handling would mean two jobs
 * retiring the same row for different stated reasons.
 */
export const LEXICAL_DUP_MAX = 0.85;

const MODEL = 'opus';
const BRIDGE_TIMEOUT_MS = 120_000;
/** A scan is a background job; a runaway pair count must not become a bill. */
const MAX_PAIRS_PER_SCAN = 40;

export interface DirectiveRow {
  id: string;
  content: string;
  priority: number;
  scope: string;
  scope_id: string | null;
  source_type: string;
  created_at: number;
}

export interface ContradictionPair {
  a: DirectiveRow;
  b: DirectiveRow;
  topicSimilarity: number;
  lexicalSimilarity: number;
}

export interface Adjudication {
  contradicts: boolean;
  /** Which row should be retired, in the model's view. */
  retire: 'a' | 'b' | 'neither';
  confidence: number;
  reason: string;
}

export type GateOutcome =
  | { action: 'propose'; retireId: string; keepId: string; reason: string }
  | { action: 'skip'; reason: string };

/** Cosine similarity of two equal-length vectors. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

/**
 * THE SAFETY GATE. Pure — every rule that decides whether a contradiction may
 * retire a rule lives here and is tested without a database.
 *
 * Order matters: the cheapest, most absolute refusals come first, so a bug in a
 * later clause cannot reach a sealed or higher-priority row.
 */
export function gateSupersession(
  pair: ContradictionPair,
  verdict: Adjudication,
  opts: { minConfidence?: number } = {},
): GateOutcome {
  const minConfidence = opts.minConfidence ?? 70;

  if (!verdict.contradicts) return { action: 'skip', reason: 'no contradiction found' };
  if (verdict.retire === 'neither') return { action: 'skip', reason: 'adjudicator retired neither' };

  const retire = verdict.retire === 'a' ? pair.a : pair.b;
  const keep = verdict.retire === 'a' ? pair.b : pair.a;

  // 1. Sealed rows. A write against one aborts the transaction (PR-1).
  //    Checked before the tunables below so the reported reason always names the
  //    absolute blocker: a sealed row is not a near miss that a lower confidence
  //    floor would let through, and it must never be reported as one.
  if (retire.source_type === 'moe-direct') {
    return { action: 'skip', reason: 'target is moe-direct (sealed by DB trigger)' };
  }

  if (verdict.confidence < minConfidence) {
    return { action: 'skip', reason: `confidence ${verdict.confidence} below ${minConfidence}` };
  }

  // 2. PRECEDENCE OUTRANKS RECENCY — the rule we did not import from
  //    supermemory. A binding rule is never retired in favour of a weaker one,
  //    however much newer or better-phrased the weaker one is.
  if (retire.priority >= ALWAYS_INJECT_MIN_PRIORITY && keep.priority < retire.priority) {
    return {
      action: 'skip',
      reason: `would retire a binding rule (p${retire.priority}) in favour of a weaker one (p${keep.priority})`,
    };
  }

  // 3. Nothing below the binding threshold may retire anything at or above it,
  //    even at equal priority — that is the agent-vs-Moe boundary itself.
  if (retire.priority >= ALWAYS_INJECT_MIN_PRIORITY && keep.priority < ALWAYS_INJECT_MIN_PRIORITY) {
    return { action: 'skip', reason: 'agent-tier rule cannot retire a Moe-tier rule' };
  }

  // 4. Scope. A workspace rule and a project rule addressing the same subject
  //    are usually a general case and its local exception, not a contradiction —
  //    and workspace reaches EVERY session, so retiring across that boundary is
  //    the highest-blast-radius write this job could make.
  if (pair.a.scope !== pair.b.scope || pair.a.scope_id !== pair.b.scope_id) {
    return { action: 'skip', reason: 'cross-scope pair — likely a general rule and its exception' };
  }

  return {
    action: 'propose',
    retireId: retire.id,
    keepId: keep.id,
    reason: verdict.reason,
  };
}

/**
 * Find pairs that are semantically close but lexically distinct.
 *
 * Embeddings are computed per scan rather than stored: `directives` has no
 * embedding column, and the active set is small (tens of rows), so a column plus
 * a backfill plus an index would be cost without benefit. If the active set ever
 * runs to thousands, add the column — the shape here does not change.
 *
 * Returns [] when the embedder is unavailable. Failing open is the same posture
 * as retrieval (embeddings.ts): a background scan that cannot run is a scan that
 * produced nothing, never an error that wakes someone.
 */
export async function findContradictionCandidates(
  rows: DirectiveRow[],
): Promise<ContradictionPair[]> {
  if (rows.length < 2) return [];

  const vectors = new Map<string, number[]>();
  for (const row of rows) {
    const v = await embed(row.content);
    if (v) vectors.set(row.id, v);
  }
  if (vectors.size < 2) return [];

  // pg_trgm is the authority on lexical similarity here, because it is what the
  // pruner uses — computing it a second way in JS could disagree with the job
  // whose territory we are staying out of.
  const lexical = async (a: string, b: string): Promise<number> => {
    const res = await pool
      .query<{ sim: number }>('SELECT similarity($1, $2) AS sim', [a, b])
      .catch(() => null);
    return res?.rows[0]?.sim ?? 0;
  };

  const pairs: ContradictionPair[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      const va = vectors.get(a.id);
      const vb = vectors.get(b.id);
      if (!va || !vb) continue;

      const topic = cosine(va, vb);
      if (topic < TOPIC_SIMILARITY_MIN) continue;

      const lex = await lexical(a.content, b.content);
      if (lex >= LEXICAL_DUP_MAX) continue; // the pruner's job, not ours

      pairs.push({ a, b, topicSimilarity: topic, lexicalSimilarity: lex });
    }
  }

  // Most topically-entangled first, so a capped scan spends its budget on the
  // pairs most likely to actually conflict.
  return pairs.sort((x, y) => y.topicSimilarity - x.topicSimilarity).slice(0, MAX_PAIRS_PER_SCAN);
}

const ADJUDICATION_PROMPT = (a: string, b: string) => `You are auditing two operating rules that a system injects into the same prompt.

RULE A: ${a}

RULE B: ${b}

Do these two rules CONTRADICT — that is, would an agent following both be unable to satisfy one without violating the other?

Two rules are NOT contradictory merely because they cover the same topic, or because one is more specific than the other. A general rule and a narrower exception to it are compatible. Only answer true if following both is genuinely impossible.

If they do contradict, say which one should be RETIRED — the one that is more specific, more current, or more clearly a superset of the other's intent.

Respond with ONLY a JSON object:
{"contradicts": true|false, "retire": "a"|"b"|"neither", "confidence": 0-100, "reason": "one sentence"}`;

/** Ask a model whether a pair genuinely conflicts. Raw dispatch, as distiller does. */
export async function adjudicate(pair: ContradictionPair): Promise<Adjudication> {
  const ctx: RoutingContext = {
    message: ADJUDICATION_PROMPT(pair.a.content, pair.b.content),
    forceModelName: MODEL,
    sourceAgent: 'supersession',
  };
  const req: BridgeDispatchRequest = {
    messages: [{ role: 'user', content: ADJUDICATION_PROMPT(pair.a.content, pair.b.content) }],
    model: MODEL,
    temperature: 0.1,
    maxTokens: 500,
  };

  try {
    const { result } = await routingEngine.dispatchWithFailover(ctx, req, {
      leadPreferred: true,
      budgetMs: BRIDGE_TIMEOUT_MS,
    });
    return parseAdjudication(result?.response ?? '');
  } catch {
    // An unreachable adjudicator means we know nothing about this pair. Saying
    // "no contradiction" is the safe direction: it proposes nothing.
    return { contradicts: false, retire: 'neither', confidence: 0, reason: 'adjudicator unavailable' };
  }
}

/**
 * Parse the adjudicator's JSON. Tolerates prose around the object, which CLI
 * gateways add; refuses to guess when the shape is wrong.
 */
export function parseAdjudication(text: string): Adjudication {
  const miss: Adjudication = {
    contradicts: false,
    retire: 'neither',
    confidence: 0,
    reason: 'unparseable adjudication',
  };
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return miss;
  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const retire = raw.retire;
    if (retire !== 'a' && retire !== 'b' && retire !== 'neither') return miss;
    const confidence = Number(raw.confidence);
    return {
      contradicts: raw.contradicts === true,
      retire,
      // A missing or non-numeric confidence must not read as certainty.
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0,
      reason: typeof raw.reason === 'string' ? raw.reason : '',
    };
  } catch {
    return miss;
  }
}

export interface ScanResult {
  scanned: number;
  candidates: number;
  proposed: number;
  skipped: Array<{ pair: string; reason: string }>;
}

/**
 * One pass. Reads active directives, finds contradictions, writes proposals.
 *
 * Idempotent in effect: a pair already carrying a pending proposal is skipped,
 * so a nightly scan does not re-propose the same conflict every night.
 */
export async function runSupersessionScan(opts: { dryRun?: boolean } = {}): Promise<ScanResult> {
  const { rows } = await pool.query<DirectiveRow>(
    `SELECT id, content, priority, scope, scope_id, source_type, created_at
       FROM directives
      WHERE status = 'active'
        AND source_type <> 'moe-direct'`,
  );

  const candidates = await findContradictionCandidates(rows);
  const result: ScanResult = {
    scanned: rows.length,
    candidates: candidates.length,
    proposed: 0,
    skipped: [],
  };

  for (const pair of candidates) {
    const key = `${pair.a.id}↔${pair.b.id}`;

    const existing = await pool.query(
      `SELECT 1 FROM memory_proposals
        WHERE proposal_kind = 'supersede'
          AND status = 'pending'
          AND target_directive_ids @> ARRAY[$1, $2]::TEXT[]`,
      [pair.a.id, pair.b.id],
    );
    if (existing.rowCount) {
      result.skipped.push({ pair: key, reason: 'proposal already pending' });
      continue;
    }

    const verdict = await adjudicate(pair);
    const gate = gateSupersession(pair, verdict);
    if (gate.action === 'skip') {
      result.skipped.push({ pair: key, reason: gate.reason });
      continue;
    }

    if (opts.dryRun) {
      result.proposed++;
      continue;
    }

    await pool.query(
      `INSERT INTO memory_proposals
         (id, dream_run_id, silo_id, proposal_kind, target_directive_ids,
          proposed_content, proposed_metadata, source_evidence, status)
       VALUES ($1, $2, $3, 'supersede', $4, $5, $6, $7, 'pending')`,
      [
        randomUUID(),
        // Not a dream run, but the column is NOT NULL and carries no FK. Tagged
        // so the review UI can tell where a proposal came from.
        `supersession:${randomUUID().slice(0, 8)}`,
        'supersession',
        [gate.retireId, gate.keepId],
        gate.reason,
        JSON.stringify({
          retire_id: gate.retireId,
          keep_id: gate.keepId,
          topic_similarity: Number(pair.topicSimilarity.toFixed(3)),
          lexical_similarity: Number(pair.lexicalSimilarity.toFixed(3)),
          confidence: verdict.confidence,
        }),
        JSON.stringify({
          retire_preview: (gate.retireId === pair.a.id ? pair.a : pair.b).content.slice(0, 200),
          keep_preview: (gate.keepId === pair.a.id ? pair.a : pair.b).content.slice(0, 200),
        }),
      ],
    );
    result.proposed++;
  }

  await logIntellectEvent('memory_pruned', 'supersession', {
    action: 'supersession_scan',
    scanned: result.scanned,
    candidates: result.candidates,
    proposed: result.proposed,
  }).catch(() => undefined);

  return result;
}

/**
 * Apply an accepted proposal. Called from review, never from the scan.
 *
 * Re-checks the seal at write time: a row's source_type can change between the
 * scan and the review, and the trigger would abort the transaction.
 */
export async function applySupersession(retireId: string, keepId: string): Promise<boolean> {
  const { rows } = await pool.query<{ source_type: string }>(
    `SELECT source_type FROM directives WHERE id = $1 AND status = 'active'`,
    [retireId],
  );
  if (rows.length === 0) return false;
  if (rows[0].source_type === 'moe-direct') return false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE directives
          SET status = 'superseded', updated_at = EXTRACT(EPOCH FROM NOW())
        WHERE id = $1`,
      [retireId],
    );
    await client.query(
      `UPDATE directives
          SET supersedes_id = $1, updated_at = EXTRACT(EPOCH FROM NOW())
        WHERE id = $2`,
      [retireId, keepId],
    );
    await client.query('COMMIT');
    await logIntellectEvent('memory_pruned', 'supersession', {
      action: 'supersession_applied',
      retiredId: retireId,
      keptId: keepId,
    }).catch(() => undefined);
    return true;
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return false;
  } finally {
    client.release();
  }
}
