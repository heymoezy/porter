/**
 * Intellect Session Analyzer
 *
 * When a CLI session ends (explicit SessionEnd hook, or detected via new
 * SessionStart after timeout), synthesize an episode row summarizing what
 * happened:
 *   - Project worked on
 *   - Dispatch activity (tools, model usage, rough duration)
 *   - Corrections detected during the session (directive candidate IDs)
 *   - Files touched (Edit/Write/MultiEdit tool invocations)
 *
 * Episodes are the medium-trust "diary" tier of memory — they get injected
 * into the next session's context so Porter remembers what was worked on.
 *
 * Summary synthesis (v6.29.0): episodes used to be tool-count stats
 * ("Session (570 dispatches) — tools: Bash×358") — zero meaning, useless for
 * recall, and they poisoned every consumer of the episode tier (Moe
 * 2026-06-10: "the brain is a mess and nothing is helping"). Now, when the
 * session has captured transcript turns, we make ONE raw Bridge call
 * (claude_cli — Max OAuth, zero token cost; same raw-by-omission contract as
 * dream-worker) to write a 2-3 sentence summary of what was actually done and
 * decided. The structural stats line remains as suffix + the fallback when
 * there's no transcript or the dispatch fails — episode creation NEVER blocks
 * on the LLM.
 */

import { randomUUID } from 'node:crypto';
import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';
import { routingEngine } from '../bridge/routing-engine.js';
import type { BridgeDispatchRequest, RoutingContext } from '../bridge/types.js';

// ── Types ───────────────────────────────────────────────────────────────

export interface SessionEndInput {
  sessionId: string;
  project?: string | null;
  gateway?: string | null;
  /** Optional override — if omitted, we query bridge_dispatch_log by chat_id. */
  startedAt?: number;
  endedAt?: number;
}

export interface EpisodeSummary {
  episodeId: string;
  summary: string;
  filesChanged: string[];
  toolCounts: Record<string, number>;
  correctionIds: string[];
  durationSeconds: number;
  dispatchCount: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

interface DispatchRow {
  intent: string | null;
  model_name: string;
  gateway_type: string;
  created_at: number;
  input_tokens: number | null;
  output_tokens: number | null;
}

interface IntellectEventRow {
  event_type: string;
  details_json: Record<string, unknown>;
  created_at: number;
}

/** Extract files from tool_input of an Edit/Write/MultiEdit intent log entry. */
function extractFilePathFromIntent(intent: string | null): string | null {
  if (!intent) return null;
  // intent format from porter-activity-log.js: `tool:Edit`, `tool:Write`, etc.
  // We'd need the tool_input payload for the file path — that isn't stored.
  // Instead, we pull file paths from intellect_events (correction_detected,
  // memory_auto_fixed, etc.) which capture filesystem references.
  return null;
}

// ── Transcript-based meaning synthesis ──────────────────────────────────

const SUMMARY_MODEL = 'claude-haiku-4-5-20251001'; // fast tier — a 3-sentence digest needs no more
const SUMMARY_TIMEOUT_MS = 60_000;
const SUMMARY_TURN_CAP = 30;       // turns fed to the digest
const SUMMARY_USER_CHAR_CAP = 300; // per user turn
const SUMMARY_ASST_CHAR_CAP = 200; // per assistant turn

async function synthesizeMeaningfulSummary(sessionId: string, project: string | null): Promise<string | null> {
  try {
    const { rows: turns } = await pool.query<{ role: string; content: string }>(
      `SELECT role, content FROM session_transcript_turns
        WHERE session_id = $1 ORDER BY turn_index ASC`,
      [sessionId],
    );
    const userTurns = turns.filter((t) => t.role === 'user');
    if (userTurns.length === 0) return null;

    // Compact digest: every user turn (the asks/corrections), thin assistant
    // slices for outcome context. Newest-biased when over the cap.
    const slice = turns.length > SUMMARY_TURN_CAP ? turns.slice(-SUMMARY_TURN_CAP) : turns;
    const digest = slice
      .map((t) => {
        const cap = t.role === 'user' ? SUMMARY_USER_CHAR_CAP : SUMMARY_ASST_CHAR_CAP;
        const body = String(t.content || '').replace(/\s+/g, ' ').trim().slice(0, cap);
        return body ? `${t.role === 'user' ? 'USER' : 'ASSISTANT'}: ${body}` : null;
      })
      .filter(Boolean)
      .join('\n');
    if (digest.length < 80) return null;

    const promptBody = [
      `Summarize this work session${project ? ` on project "${project}"` : ''} in 2-3 plain sentences.`,
      'State WHAT was done/decided/fixed and any explicit user corrections or open threads.',
      'No preamble, no markdown, no "the session" framing — just the facts, past tense.',
      '',
      digest,
    ].join('\n');

    const ctx: RoutingContext = {
      message: promptBody,
      forceGatewayType: 'claude_cli',
      forceModelName: SUMMARY_MODEL,
    };
    const req: BridgeDispatchRequest = {
      messages: [{ role: 'user', content: promptBody }],
      model: SUMMARY_MODEL,
      temperature: 0.2,
      maxTokens: 400,
    };
    const timer = new Promise<null>((resolve) => setTimeout(() => resolve(null), SUMMARY_TIMEOUT_MS));
    const dispatch = (async () => {
      const { result } = await routingEngine.selectWithFallback(ctx, req);
      const text = result?.response?.replace(/\s+/g, ' ').trim();
      return text && text.length > 20 ? text.slice(0, 700) : null;
    })();
    return await Promise.race([dispatch, timer]);
  } catch {
    return null; // fallback to structural summary — never block the episode
  }
}

// ── Main ────────────────────────────────────────────────────────────────

/**
 * Build and persist an episode for a session. Safe to call multiple times per
 * session — idempotent on (session_id) via ON CONFLICT DO NOTHING.
 */
export async function analyzeAndStoreSession(input: SessionEndInput): Promise<EpisodeSummary | null> {
  const { sessionId } = input;
  if (!sessionId) return null;

  // ── Collect dispatch activity for this session ───────────────────────
  const { rows: dispatches } = await pool.query<DispatchRow>(
    `SELECT intent, model_name, gateway_type, created_at, input_tokens, output_tokens
     FROM bridge_dispatch_log
     WHERE chat_id = $1
     ORDER BY created_at ASC`,
    [sessionId]
  );

  // Transcript turns are a SEPARATE activity signal from dispatches — CLI
  // sessions write transcripts (Phase 48.2) but their session ids never match
  // bridge_dispatch_log.chat_id (verified 2026-06-10: zero overlap). The old
  // `dispatches.length === 0 → null` early-return meant NO transcript-bearing
  // session ever got an episode — the meaningful tier was structurally empty.
  // Now: bail only when there's neither dispatch activity NOR a transcript.
  const { rows: turnStats } = await pool.query<{ n: string; started: number | null; ended: number | null }>(
    `SELECT count(*) AS n,
            EXTRACT(epoch FROM min(captured_at)) AS started,
            EXTRACT(epoch FROM max(captured_at)) AS ended
       FROM session_transcript_turns WHERE session_id = $1`,
    [sessionId],
  );
  const turnCount = Number(turnStats[0]?.n ?? 0);
  if (dispatches.length === 0 && turnCount === 0) {
    return null;
  }

  // ── Tool usage histogram ─────────────────────────────────────────────
  const toolCounts: Record<string, number> = {};
  for (const d of dispatches) {
    if (!d.intent) continue;
    const match = d.intent.match(/^tool:(.+)$/);
    if (match) {
      const tool = match[1];
      toolCounts[tool] = (toolCounts[tool] ?? 0) + 1;
    }
  }

  // ── Duration ── dispatch timestamps when present, else transcript span ──
  const nowEpoch = Date.now() / 1000;
  const startedAt = input.startedAt
    ?? dispatches[0]?.created_at
    ?? turnStats[0]?.started
    ?? nowEpoch;
  const endedAt = input.endedAt
    ?? dispatches[dispatches.length - 1]?.created_at
    ?? turnStats[0]?.ended
    ?? nowEpoch;
  const durationSeconds = Math.max(0, Math.round(endedAt - startedAt));

  // ── Intellect events during this session ────────────────────────────
  const { rows: events } = await pool.query<IntellectEventRow>(
    `SELECT event_type, details_json, created_at
     FROM intellect_events
     WHERE created_at BETWEEN $1 AND $2
       AND (details_json->>'sessionId' = $3
            OR details_json->>'session_id' = $3)
     ORDER BY created_at ASC`,
    [startedAt - 5, endedAt + 5, sessionId]
  );

  const correctionIds: string[] = [];
  const filesChanged = new Set<string>();
  for (const ev of events) {
    const details = ev.details_json ?? {};
    if (ev.event_type === 'correction_detected' || ev.event_type === 'correction_reinforced') {
      const id = (details as { directiveId?: string }).directiveId;
      if (id) correctionIds.push(id);
    }
    if (ev.event_type === 'memory_auto_fixed') {
      const p = (details as { newPath?: string }).newPath;
      if (p) filesChanged.add(p);
    }
    const filePath = (details as { filePath?: string }).filePath;
    if (filePath) filesChanged.add(filePath);
  }

  // ── Synthesize summary ───────────────────────────────────────────────
  const topTools = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([t, c]) => `${t}×${c}`)
    .join(', ');

  const parts: string[] = [];
  if (input.project) parts.push(`Worked on **${input.project}**`);
  else parts.push('Session');
  parts.push(dispatches.length > 0
    ? `(${dispatches.length} dispatches, ${Math.round(durationSeconds / 60)}m)`
    : `(${turnCount} transcript turns, ${Math.round(durationSeconds / 60)}m)`);
  if (topTools) parts.push(`— tools: ${topTools}`);
  if (correctionIds.length > 0) parts.push(`— ${correctionIds.length} correction(s) captured`);
  if (filesChanged.size > 0) parts.push(`— ${filesChanged.size} file(s) touched`);
  const structural = parts.join(' ');

  // Meaning first, stats as suffix; structural-only when no transcript/LLM.
  const meaningful = await synthesizeMeaningfulSummary(sessionId, input.project ?? null);
  const summary = meaningful ? `${meaningful} [${structural}]` : structural;

  // ── Persist episode ──────────────────────────────────────────────────
  const episodeId = randomUUID();
  const scope = input.project ? 'project' : 'workspace';
  const scopeId = input.project ?? null;

  // Idempotency: if an episode already exists for this session, skip.
  const { rowCount: existing } = await pool.query(
    `SELECT 1 FROM episodes WHERE session_id = $1 LIMIT 1`,
    [sessionId]
  );
  if (existing && existing > 0) {
    return null;
  }

  await pool.query(
    `INSERT INTO episodes
      (id, scope, scope_id, session_id, gateway, summary,
       decisions_json, corrections_json, files_changed_json, duration_seconds, created_at)
     VALUES ($1, $2, $3, $4, $5, $6,
             $7::jsonb, $8::jsonb, $9::jsonb, $10, EXTRACT(EPOCH FROM NOW()))`,
    [
      episodeId,
      scope,
      scopeId,
      sessionId,
      input.gateway ?? null,
      summary,
      JSON.stringify([]),
      JSON.stringify(correctionIds),
      JSON.stringify(Array.from(filesChanged)),
      durationSeconds,
    ]
  );

  await logIntellectEvent('episode_created', 'session_analyzer', {
    episodeId,
    sessionId,
    project: input.project ?? null,
    dispatchCount: dispatches.length,
    corrections: correctionIds.length,
    filesChanged: filesChanged.size,
    durationSeconds,
  });

  return {
    episodeId,
    summary,
    filesChanged: Array.from(filesChanged),
    toolCounts,
    correctionIds,
    durationSeconds,
    dispatchCount: dispatches.length,
  };
}

/**
 * Sweep for stale sessions: sessions with dispatches but no episode, and
 * whose last dispatch was more than `stalenessSeconds` ago. Analyzes and
 * stores episodes for each. Called periodically by the scheduler to catch
 * sessions that ended without a SessionEnd hook firing.
 */
export async function sweepStaleSessions(stalenessSeconds = 1800): Promise<number> {
  const cutoff = Date.now() / 1000 - stalenessSeconds;
  const { rows } = await pool.query<{
    chat_id: string;
    last_seen: number;
    project_id: string | null;
    gateway_type: string;
  }>(
    `SELECT bdl.chat_id,
            MAX(bdl.created_at) AS last_seen,
            (ARRAY_AGG(bdl.project_id ORDER BY bdl.created_at DESC))[1] AS project_id,
            (ARRAY_AGG(bdl.gateway_type ORDER BY bdl.created_at DESC))[1] AS gateway_type
     FROM bridge_dispatch_log bdl
     WHERE bdl.chat_id IS NOT NULL
       AND bdl.chat_id != 'unknown'
       AND NOT EXISTS (SELECT 1 FROM episodes e WHERE e.session_id = bdl.chat_id)
     GROUP BY bdl.chat_id
     HAVING MAX(bdl.created_at) < $1
     LIMIT 20`,
    [cutoff]
  );

  let created = 0;
  for (const row of rows) {
    try {
      const result = await analyzeAndStoreSession({
        sessionId: row.chat_id,
        project: row.project_id,
        gateway: row.gateway_type,
      });
      if (result) created++;
    } catch (err) {
      console.error(`[intellect:session-analyzer] failed for ${row.chat_id}:`, (err as Error).message);
    }
  }

  if (created > 0) {
    console.log(`[intellect:session-analyzer] swept ${created} stale session(s) into episodes`);
  }
  return created;
}
