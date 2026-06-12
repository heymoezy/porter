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
const CONFIDENCE_FLOOR = 60;  // drop weakly-supported lessons
const MODEL = 'opus';
const BRIDGE_TIMEOUT_MS = 120_000;

export interface DistillResult {
  agent: string;
  episodes: number;
  created: number;
  skipped?: string;
}

interface Lesson { lesson: string; confidence: number }

function buildPrompt(agent: string, episodes: string[], existing: string[]): string {
  const epBlock = episodes.map((e, i) => `${i + 1}. ${e}`).join('\n');
  const exBlock = existing.length
    ? existing.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '(none yet)';
  return `You are distilling the working memory of an AI agent named "${agent}".

Below are recent EPISODES — short records of tasks the agent did. Your job: extract a few DURABLE, GENERALIZABLE LESSONS (concepts) about how this agent's domain, users, and work actually behave — the kind of insight that should make the agent sharper next time. Think second-order: not "did X", but the pattern underneath ("when Y happens, it usually means Z").

RULES:
- Output ONLY lessons that are genuinely durable and reusable — not one-off facts, not task logs, not anything tied to a single record that won't recur.
- Do NOT repeat anything already in EXISTING LESSONS (or a paraphrase of it). Only NEW insight.
- Each lesson: one crisp sentence, specific, ≤ 200 chars. No fluff, no hedging.
- If the episodes contain no genuinely new durable lesson, return an empty array. Fewer, sharper lessons beat padding.
- confidence 0-100 = how well the episodes actually support the lesson.

EXISTING LESSONS (do not repeat):
${exBlock}

RECENT EPISODES:
${epBlock}

Return STRICT JSON only, no prose, no code fence:
[{"lesson": "...", "confidence": 0-100}]`;
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
    const { decision, result } = await routingEngine.selectWithFallback(ctx, req);
    if (!result || typeof result !== 'object') {
      throw new Error(`Bridge returned no result for gateway ${decision.gatewayRow?.type ?? 'unknown'}`);
    }
    // Populate bridge_dispatch_log for observability (selectWithFallback skips it).
    await routingEngine.logDispatch(decision, ctx, result, undefined).catch(() => undefined);
    return result.response ?? '';
  } finally {
    clearTimeout(timer);
  }
}

function parseLessons(raw: string): Lesson[] {
  let text = raw.trim();
  // tolerate ```json fences or leading prose before the array
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x: any) => x && typeof x.lesson === 'string')
      .map((x: any) => ({ lesson: String(x.lesson), confidence: Number(x.confidence) || 0 }));
  } catch {
    return [];
  }
}

export async function runDistiller(opts: { agent?: string } = {}): Promise<DistillResult> {
  const agent = opts.agent ?? 'tom';

  const eps = (await pool.query(
    `SELECT summary FROM episodes
      WHERE scope = 'agent' AND scope_id = $1
        AND created_at > EXTRACT(EPOCH FROM NOW()) - ($2::int * 86400)
      ORDER BY created_at DESC
      LIMIT $3`,
    [agent, LOOKBACK_DAYS, MAX_EPISODES],
  )).rows as { summary: string }[];
  if (eps.length < MIN_EPISODES) {
    return { agent, episodes: eps.length, created: 0, skipped: 'too few episodes' };
  }

  const existing = (await pool.query(
    `SELECT content FROM concepts WHERE scope = 'agent' AND scope_id = $1 AND status = 'active'`,
    [agent],
  )).rows as { content: string }[];

  const response = await dispatch(buildPrompt(agent, eps.map((e) => e.summary), existing.map((c) => c.content)));
  const lessons = parseLessons(response);
  if (!lessons.length) return { agent, episodes: eps.length, created: 0, skipped: 'no new lessons' };

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

  // Dedup near-identical concepts (reuses the existing pg_trgm consolidator).
  if (created > 0) {
    try { await consolidateAgentMemory(agent); } catch { /* never fail the run on dedup */ }
  }

  // Brain-screen telemetry (fire-and-forget).
  pool.query(
    `INSERT INTO intellect_events (id, event_type, source_type, details_json) VALUES ($1,$2,$3,$4::jsonb)`,
    [randomUUID(), 'memory_distilled', 'distiller', JSON.stringify({ agent, episodes: eps.length, created })],
  ).catch(() => undefined);

  return { agent, episodes: eps.length, created };
}
