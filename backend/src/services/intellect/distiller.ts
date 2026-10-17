// ── Memory distiller — raw EPISODES → durable CONCEPTS ──────────────────────
//
// Agents (Tom et al.) write episodes via /agent-memory; recall reads them back.
// But nothing distilled raw events into LESSONS — episodes just piled up and
// recall got noisier. This worker reads an agent's recent episode stream, asks
// the model to extract a few durable, generalizable lessons that AREN'T already
// on file, and writes them as agent-scoped CONCEPTS (source_type='distiller'),
// then dedups via consolidateAgentMemory. Distilled memory = sharper, less
// generic recall — the read/write loop that makes the brain actually LEARN, not
// just remember.
//
// Modeled on dream-worker's raw routingEngine dispatch (no Memory V3, no HTTP).
// Conservative by design: capped new-concept count + confidence floor, and it
// passes existing concepts in so it never re-distills the same lesson.
import { randomUUID } from 'crypto';
import fs from 'node:fs';
import { pool } from '../../db/client.js';
import { routingEngine } from '../bridge/routing-engine.js';
import type { BridgeDispatchRequest, RoutingContext } from '../bridge/types.js';
import { consolidateAgentMemory } from '../consolidation.js';

const LOOKBACK_DAYS = 14;
const MIN_EPISODES = 4;       // below this there's nothing worth distilling
const MAX_EPISODES = 120;     // cap the prompt size
const MAX_NEW_CONCEPTS = 5;   // per run — keep the concept store lean
const MAX_CURIOSITIES = 3;    // R5: ≤3 decaying open-question concepts
const CONFIDENCE_FLOOR = 60;  // drop weakly-supported lessons
const MODEL = 'opus';
const BRIDGE_TIMEOUT_MS = 120_000;

export interface DistillResult {
  agent: string;
  episodes: number;
  created: number;
  self_summary?: number;
  curiosities?: number;
  skipped?: string;
}

interface Lesson { lesson: string; confidence: number }
interface Consolidation { lessons: Lesson[]; selfSummary: string; curiosities: string[] }

/** YYYY-MM-DD in Singapore, the firm's clock. */
function sgtDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function buildPrompt(agent: string, episodes: string[], existing: string[], today: string): string {
  const epBlock = episodes.map((e, i) => `${i + 1}. ${e}`).join('\n');
  const exBlock = existing.length
    ? existing.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '(none yet)';
  return `You are consolidating the working memory of an AI agent named "${agent}" — its nightly "dream". Today is ${today}. Episodes are short records of what it did, each prefixed with the date it happened [YYYY-MM-DD] and [session] (the conversation/chat it belongs to), highest-salience first.

Produce THREE things:
1. LESSONS — a few DURABLE, GENERALIZABLE insights about how this agent's domain, people, and work behave ("when Y happens it usually means Z"). NOT one-off task logs. Skip anything already in EXISTING LESSONS or a paraphrase. Each ≤200 chars, specific, no hedging. Empty array is fine — fewer sharper beats padding. confidence 0-100 = how well episodes support it.
2. SELF_SUMMARY — 2-4 sentences in the agent's own first person: the live open threads. Concrete (real names, deals, numbers). ≤500 chars. It is shown to the agent every turn, so it must not turn old events into current ones:
   - Give every item the date of the episode it comes from, e.g. "(18 Aug)". Never write "this week", "today" or "recently".
   - Only call a thread open if an episode from the last 3 days shows it still open; older threads are named with their date as last seen.
   - When a later episode corrects, closes or contradicts an earlier one on the same subject, keep only the later one. A claim someone corrected is dropped, not repeated.
3. CURIOSITIES — 0 to ${MAX_CURIOSITIES} short open questions the agent should chase next (unresolved threads worth following up). One line each, with the date the thread was last seen.

EXISTING LESSONS (do not repeat):
${exBlock}

RECENT EPISODES (salience-ordered, [date] [session]-tagged):
${epBlock}

Return STRICT JSON only, no prose, no code fence:
{"lessons":[{"lesson":"...","confidence":0-100}],"self_summary":"...","curiosities":["...","..."]}`;
}

// Raw routingEngine dispatch — pinned to claude_cli, no Memory V3 wiring
// (omitting agentId/projectId/etc. is what keeps it raw). Mirrors dream-worker.
async function dispatch(prompt: string): Promise<string> {
  const mockPath = process.env.DISTILLER_MOCK_RESPONSE_PATH;
  if (mockPath) return fs.promises.readFile(mockPath, 'utf8');

  const ctx: RoutingContext = {
    message: prompt,
    forceGatewayType: 'claude_cli',
    forceModelName: MODEL,
    sourceAgent: 'distiller',
  };
  const req: BridgeDispatchRequest = {
    messages: [{ role: 'user', content: prompt }],
    model: MODEL,
    temperature: 0.2,
    maxTokens: 4000,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
  try {
    // Background distillation — must survive one gateway being down or out of
    // quota by moving to the next council model (2026-07-28).
    const { decision, result } = await routingEngine.dispatchWithFailover(ctx, req, {
      leadPreferred: true,
      budgetMs: BRIDGE_TIMEOUT_MS,
    });
    if (!result || typeof result !== 'object') {
      throw new Error(`Bridge returned no result for gateway ${decision.gatewayRow?.type ?? 'unknown'}`);
    }
    // Populate bridge_dispatch_log for observability (dispatchWithFailover skips it).
    await routingEngine.logDispatch(decision, ctx, result, undefined).catch(() => undefined);
    return result.response ?? '';
  } finally {
    clearTimeout(timer);
  }
}

function parseConsolidation(raw: string): Consolidation {
  const empty: Consolidation = { lessons: [], selfSummary: '', curiosities: [] };
  let text = raw.trim();
  // tolerate ```json fences or leading prose before the object
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return empty;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { lessons?: unknown; self_summary?: unknown; curiosities?: unknown };
    const lessons = Array.isArray(obj?.lessons)
      ? (obj.lessons as any[]).filter((x) => x && typeof x.lesson === 'string').map((x) => ({ lesson: String(x.lesson), confidence: Number(x.confidence) || 0 }))
      : [];
    const selfSummary = typeof obj?.self_summary === 'string' ? obj.self_summary : '';
    const curiosities = Array.isArray(obj?.curiosities)
      ? (obj.curiosities as any[]).filter((x) => typeof x === 'string' && x.trim()).map((x) => String(x))
      : [];
    return { lessons, selfSummary, curiosities };
  } catch {
    return empty;
  }
}

export async function runDistiller(opts: { agent?: string } = {}): Promise<DistillResult> {
  const agent = opts.agent ?? 'tom';

  // R5: prioritise HIGH-salience episodes (the surprising/correction turns) and
  // carry session_id so the model can group a thread. salience NULLS LAST so
  // pre-R3 episodes still participate.
  const eps = (await pool.query(
    `SELECT summary, session_id, to_char(to_timestamp(created_at) AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS day FROM episodes
      WHERE scope = 'agent' AND scope_id = $1
        -- ⚠️ PRIVATE EPISODES NEVER REACH THE DISTILLER. A concept is durable,
        -- firm-level and gets recited wherever the agent speaks, and the model
        -- is handed every episode in ONE prompt with no mapping from a lesson
        -- back to the episodes that produced it — so once private material is
        -- in the input there is no way to attribute or withhold the output.
        -- Excluding at the source is the only point where it can still be done.
        AND private = false
        AND created_at > EXTRACT(EPOCH FROM NOW()) - ($2::int * 86400)
      ORDER BY salience DESC NULLS LAST, created_at DESC
      LIMIT $3`,
    [agent, LOOKBACK_DAYS, MAX_EPISODES],
  )).rows as { summary: string; session_id: string | null; day: string }[];
  if (eps.length < MIN_EPISODES) {
    logDistillRun(agent, eps.length, 0, 0, 0, 'too few episodes');
    return { agent, episodes: eps.length, created: 0, skipped: 'too few episodes' };
  }

  const existing = (await pool.query(
    `SELECT content FROM concepts
      WHERE scope = 'agent' AND scope_id = $1 AND status = 'active'
        AND source_type NOT IN ('self_summary','curiosity')`,
    [agent],
  )).rows as { content: string }[];

  // ⚠️ EVERY EPISODE CARRIES ITS DATE (2026-09-26). Undated, a fortnight of episodes read as one
  // present: Tom's summary called August proposal verdicts and a service provider "gone dark" in
  // July things that happened this week, and a corrected claim came back because nothing said
  // which statement was the later one.
  const epLines = eps.map((e) => `[${e.day}] ` + (e.session_id ? `[${e.session_id}] ` : '') + e.summary);
  const today = sgtDay(new Date());
  const response = await dispatch(buildPrompt(agent, epLines, existing.map((c) => c.content), today));
  const { lessons, selfSummary, curiosities } = parseConsolidation(response);

  // (1) durable concepts — genuinely new, confident lessons.
  let created = 0;
  for (const l of lessons.slice(0, MAX_NEW_CONCEPTS)) {
    const content = l.lesson.trim();
    if (!content || l.confidence < CONFIDENCE_FLOOR) continue;
    await pool.query(
      `INSERT INTO concepts
         (id, memory_kind, trust_tier, scope, scope_id, content, source_type,
          confidence_score, status, review_state, created_at, updated_at)
       VALUES ($1, 'concept', 'medium', 'agent', $2, $3, 'distiller', $4, 'active', 'accepted',
               EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
      [randomUUID(), agent, content.slice(0, 600), Math.min(100, Math.max(0, Math.round(l.confidence)))],
    );
    created++;
  }

  // (2) ONE self_summary — "where I am right now", replaces yesterday's (injected
  // every turn → exactly one active, dated). (3) ≤3 decaying curiosity concepts.
  let summarised = 0;
  if (selfSummary.trim()) {
    // A recap, labelled as one: read every turn, it must say when it was written and what it covers.
    const days = eps.map((e) => e.day).sort();
    const dated = `RECAP WRITTEN ${today} FROM EPISODES DATED ${days[0]} TO ${days[days.length - 1]}: ${selfSummary.trim()}`;
    await replaceConcepts(agent, 'self_summary', [dated], 70);
    summarised = 1;
  }
  const curios = curiosities.map((c) => c.trim()).filter(Boolean).slice(0, MAX_CURIOSITIES);
  if (curios.length) await replaceConcepts(agent, 'curiosity', curios, 55);

  // Dedup near-identical durable concepts (skips self_summary/curiosity by design).
  if (created > 0) {
    try { await consolidateAgentMemory(agent); } catch { /* never fail the run on dedup */ }
  }

  logDistillRun(agent, eps.length, created, summarised, curios.length, null);
  return { agent, episodes: eps.length, created, self_summary: summarised, curiosities: curios.length };
}

// Replace-on-write a singleton/small concept set for an agent (R5). Archives the
// prior active rows of this source_type (reversible) and inserts the new ones —
// so the self_summary stays a single dated row and curiosities decay each night.
async function replaceConcepts(agent: string, sourceType: string, contents: string[], confidence: number): Promise<void> {
  await pool.query(
    `UPDATE concepts SET status='archived', updated_at=EXTRACT(EPOCH FROM NOW())
      WHERE scope='agent' AND scope_id=$1 AND source_type=$2 AND status='active'`,
    [agent, sourceType],
  );
  for (const content of contents) {
    const c = content.trim();
    if (!c) continue;
    await pool.query(
      `INSERT INTO concepts
         (id, memory_kind, trust_tier, scope, scope_id, content, source_type,
          confidence_score, status, review_state, created_at, updated_at)
       VALUES ($1, 'concept', 'medium', 'agent', $2, $3, $4, $5, 'active', 'accepted',
               EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
      [randomUUID(), agent, c.slice(0, 700), sourceType, confidence],
    );
  }
}

// Emit a memory_distilled event on EVERY exit path (run, skip, no-lessons) so an
// audit can tell "ran, nothing to do" from "never scheduled" — and so the
// restart-durable cadence gate below has a persisted last-run marker to read.
function logDistillRun(agent: string, episodes: number, created: number, selfSummary: number, curiosities: number, skipped: string | null): void {
  pool.query(
    `INSERT INTO intellect_events (id, event_type, source_type, details_json) VALUES ($1,$2,$3,$4::jsonb)`,
    [randomUUID(), 'memory_distilled', 'distiller', JSON.stringify({ agent, episodes, created, self_summary: selfSummary, curiosities, skipped })],
  ).catch(() => undefined);
}

const DISTILL_MIN_GAP_HOURS = 20;

/**
 * Restart-durable distiller cadence. The old scheduler gated runDistiller on
 * `tickCount % 24h`, which resets to 0 on every Porter restart — so the daily
 * boundary stopped landing and Tom's learning loop silently froze (2026-06-20).
 * This gates on the last PERSISTED memory_distilled event instead, so cadence
 * survives restarts. Call it from a frequent, restart-proof cadence (every_30m).
 */
export async function runDistillerIfDue(opts: { agent?: string; minGapHours?: number } = {}): Promise<DistillResult | { agent: string; skipped: string }> {
  const agent = opts.agent ?? 'tom';
  const minGap = opts.minGapHours ?? DISTILL_MIN_GAP_HOURS;
  const last = (await pool.query(
    `SELECT created_at FROM intellect_events
      WHERE event_type='memory_distilled' AND details_json->>'agent'=$1
        AND created_at > EXTRACT(EPOCH FROM NOW()) - ($2::int * 3600)
      ORDER BY created_at DESC LIMIT 1`,
    [agent, minGap],
  )).rows[0];
  if (last) return { agent, skipped: 'within cadence gap' };
  return runDistiller({ agent });
}
