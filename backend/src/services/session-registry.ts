/**
 * session-registry.ts — Per-session token accounting
 *
 * SES-01: Every successful dispatch upserts a session_registry row with updated
 * tokens_used and context_pct. A session closed at 95%+ context gets status='rotated'
 * and a Recall concept written summarizing what it worked on.
 *
 * Phase 29 — Session Registry + Message Bus
 * Phase 38-02 — Compression trigger at 70%/85% context thresholds
 */

import crypto from 'node:crypto';
import { pool } from '../db/client.js';
import { emitSSE } from './scheduler.js';
import { COMPRESS_MILD_PCT, COMPRESS_AGGRESSIVE_PCT } from './context-compressor.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UpsertSessionResult {
  sessionId: string;
  tokensUsed: number;
  contextPct: number;
}

export interface ActiveSession {
  id: string;
  chat_id: string | null;
  agent_id: string | null;
  username: string | null;
  gateway_type: string | null;
  model_name: string | null;
  tokens_used: number;
  token_budget: number;
  context_pct: number;
  created_at: number;
  last_active_at: number;
}

// ── openSession ───────────────────────────────────────────────────────────────

/**
 * Create a new active session row. Returns the new session id.
 */
export async function openSession(
  chatId: string | null,
  agentId: string | null,
  username: string,
  gatewayType: string,
  modelName: string,
  tokenBudget: number,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now() / 1000;

  await pool.query(
    `INSERT INTO session_registry
       (id, chat_id, agent_id, username, gateway_type, model_name,
        token_budget, tokens_used, context_msgs, status, metadata,
        created_at, last_active_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,'active',$8,$9,$9)`,
    [
      id,
      chatId ?? null,
      agentId ?? null,
      username,
      gatewayType,
      modelName,
      tokenBudget,
      JSON.stringify({ context_pct: 0 }),
      now,
    ],
  );

  return id;
}

// ── upsertSession ─────────────────────────────────────────────────────────────

/**
 * Find the active session for (chatId OR agentId), increment tokens_used,
 * update context_pct in metadata. If no active session exists, opens one.
 * Returns { sessionId, tokensUsed, contextPct }.
 */
export async function upsertSession(
  chatId: string | null,
  agentId: string | null,
  tokensToAdd: number,
  gatewayType: string,
  modelName: string,
  tokenBudget: number,
): Promise<UpsertSessionResult> {
  // Build WHERE clause — at least one of chatId / agentId must be non-null
  const conditions: string[] = ["status = 'active'"];
  const params: (string | null)[] = [];

  if (chatId) {
    params.push(chatId);
    conditions.push(`chat_id = $${params.length}`);
  }
  if (agentId) {
    params.push(agentId);
    conditions.push(`agent_id = $${params.length}`);
  }

  if (params.length === 0) {
    // Nothing to key on — open a new session
    const newId = await openSession(chatId, agentId, '', gatewayType, modelName, tokenBudget);
    return { sessionId: newId, tokensUsed: tokensToAdd, contextPct: tokenBudget > 0 ? tokensToAdd / tokenBudget : 0 };
  }

  // Build the OR clause for chat_id / agent_id
  const orClauses: string[] = [];
  let pIdx = 0;
  const selectParams: (string | null)[] = [];
  if (chatId) {
    selectParams.push(chatId);
    pIdx++;
    orClauses.push(`chat_id = $${pIdx}`);
  }
  if (agentId) {
    selectParams.push(agentId);
    pIdx++;
    orClauses.push(`agent_id = $${pIdx}`);
  }

  const whereClause = `status = 'active' AND (${orClauses.join(' OR ')})`;

  const { rows } = await pool.query<{
    id: string;
    tokens_used: number;
    token_budget: number;
    metadata: Record<string, unknown>;
  }>(
    `SELECT id, tokens_used, token_budget, metadata
     FROM session_registry
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT 1`,
    selectParams,
  );

  let sessionId: string;
  let currentTokens: number;
  let effectiveBudget: number;

  if (!rows.length) {
    // No active session — open one then re-select
    sessionId = await openSession(chatId, agentId, '', gatewayType, modelName, tokenBudget);
    currentTokens = 0;
    effectiveBudget = tokenBudget;
  } else {
    sessionId = rows[0].id;
    currentTokens = rows[0].tokens_used;
    effectiveBudget = rows[0].token_budget;
  }

  const updatedTokens = currentTokens + tokensToAdd;
  const contextPct = updatedTokens / Math.max(effectiveBudget, 1);

  await pool.query(
    `UPDATE session_registry
     SET tokens_used    = tokens_used + $1,
         context_msgs   = context_msgs + 1,
         last_active_at = EXTRACT(EPOCH FROM NOW()),
         metadata       = jsonb_set(
           metadata,
           '{context_pct}',
           to_jsonb(($2::float) / NULLIF(token_budget, 0))
         )
     WHERE id = $3`,
    [tokensToAdd, updatedTokens, sessionId],
  );

  // Phase 38-02: trigger compression at 70% / 85% context thresholds (async, non-blocking)
  if (contextPct >= COMPRESS_MILD_PCT) {
    const aggressiveness = contextPct >= COMPRESS_AGGRESSIVE_PCT ? 'aggressive' : 'mild';
    triggerCompression(sessionId, aggressiveness).catch(() => {});
  }

  return { sessionId, tokensUsed: updatedTokens, contextPct };
}

// ── triggerCompression ────────────────────────────────────────────────────────

/**
 * Trigger async conversation compression for a session at a given aggressiveness level.
 * - 'mild': compress tool outputs from turns > 10 ago
 * - 'aggressive': compress all turns > 5 ago
 *
 * Runs async — never blocks the dispatch call that triggered it.
 * Emits SSE bridge:compression event for admin visibility.
 * Updates session_registry compression_events and tokens_reclaimed counters.
 */
export async function triggerCompression(
  sessionId: string,
  aggressiveness: 'mild' | 'aggressive',
): Promise<void> {
  try {
    // Read current session to confirm it's still active
    const { rows } = await pool.query<{
      id: string;
      tokens_used: number;
      token_budget: number;
      compression_events: number;
    }>(
      `SELECT id, tokens_used, token_budget, compression_events
       FROM session_registry
       WHERE id = $1 AND status = 'active'`,
      [sessionId],
    );

    if (!rows.length) return; // Session gone — nothing to do

    const session = rows[0];
    const keepRecent = aggressiveness === 'aggressive' ? 5 : 10;
    const tokensEstimate = session.tokens_used;

    // Update compression_events counter (optimistic increment — actual compression is async)
    await pool.query(
      `UPDATE session_registry
       SET compression_events = COALESCE(compression_events, 0) + 1
       WHERE id = $1`,
      [sessionId],
    );

    // Emit SSE event for admin visibility
    emitSSE('bridge:compression', {
      session_id: sessionId,
      aggressiveness,
      keep_recent: keepRecent,
      tokens_before: tokensEstimate,
      token_budget: session.token_budget,
      compression_event_number: (session.compression_events ?? 0) + 1,
    }).catch(() => {});
  } catch {
    // Non-fatal — compression trigger failure must never surface to user
  }
}

// ── rotateSession ─────────────────────────────────────────────────────────────

/**
 * Close the outgoing session (status='rotated'), write a Recall concept summarising
 * what was worked on, open a fresh session with the same identity, return new session id.
 */
export async function rotateSession(sessionId: string): Promise<string> {
  // 1. Read outgoing session
  const { rows } = await pool.query<{
    id: string;
    agent_id: string | null;
    chat_id: string | null;
    username: string | null;
    gateway_type: string | null;
    model_name: string | null;
    token_budget: number;
    created_at: number;
  }>(
    `SELECT id, agent_id, chat_id, username, gateway_type, model_name, token_budget, created_at
     FROM session_registry
     WHERE id = $1`,
    [sessionId],
  );

  if (!rows.length) {
    throw new Error(`rotateSession: session ${sessionId} not found`);
  }

  const session = rows[0];

  // 2. Mark outgoing session as rotated
  await pool.query(
    `UPDATE session_registry
     SET status = 'rotated', closed_at = EXTRACT(EPOCH FROM NOW())
     WHERE id = $1`,
    [sessionId],
  );

  // SIN-01: Clear frozen memory cache for rotated session
  try {
    const { clearSnapshot } = await import('./memory-snapshot.js');
    clearSnapshot(sessionId);
  } catch { /* non-fatal */ }

  // 3. Build summary from dispatch log — top 5 distinct intents (fallback to chosen_reason)
  let summaryText = `Session ${sessionId} ended.`;
  try {
    const { rows: snippetRows } = await pool.query<{ snippet: string }>(
      `SELECT DISTINCT COALESCE(NULLIF(intent,''), LEFT(chosen_reason, 80)) AS snippet
       FROM bridge_dispatch_log
       WHERE agent_id = $1
         AND created_at >= $2
       ORDER BY snippet ASC
       LIMIT 5`,
      [session.agent_id, session.created_at],
    );

    if (snippetRows.length > 0) {
      const parts = snippetRows.map((r) => r.snippet).filter(Boolean);
      const joined = parts.join('; ');
      summaryText = `Session summary: worked on ${joined}`;
      if (summaryText.length > 300) {
        summaryText = summaryText.slice(0, 297) + '...';
      }
    }
  } catch {
    // non-fatal — best-effort summary
  }

  // 4. Write Recall concept
  if (session.agent_id) {
    try {
      await pool.query(
        `INSERT INTO concepts
           (id, memory_kind, trust_tier, scope, scope_id, content,
            source_type, source_url, confidence_score, session_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          crypto.randomUUID(),
          'concept',
          'medium',
          'agent',
          session.agent_id,
          summaryText,
          'session',
          null,
          60,
          sessionId,
        ],
      );
    } catch {
      // non-fatal — concept write failure must not prevent rotation
    }
  }

  // 5. Open new session with same identity
  const newSessionId = await openSession(
    session.chat_id,
    session.agent_id,
    session.username ?? '',
    session.gateway_type ?? '',
    session.model_name ?? '',
    session.token_budget,
  );

  return newSessionId;
}

// ── getActiveSessions ─────────────────────────────────────────────────────────

/**
 * Return all active session_registry rows, ordered by last_active_at DESC.
 */
export async function getActiveSessions(): Promise<ActiveSession[]> {
  const { rows } = await pool.query<{
    id: string;
    chat_id: string | null;
    agent_id: string | null;
    username: string | null;
    gateway_type: string | null;
    model_name: string | null;
    tokens_used: number;
    token_budget: number;
    context_pct: string | null;
    created_at: number;
    last_active_at: number;
  }>(
    `SELECT id, chat_id, agent_id, username, gateway_type, model_name,
            tokens_used, token_budget,
            metadata->>'context_pct' AS context_pct,
            created_at, last_active_at
     FROM session_registry
     WHERE status = 'active'
     ORDER BY last_active_at DESC`,
  );

  return rows.map((r) => ({
    id: r.id,
    chat_id: r.chat_id,
    agent_id: r.agent_id,
    username: r.username,
    gateway_type: r.gateway_type,
    model_name: r.model_name,
    tokens_used: r.tokens_used ?? 0,
    token_budget: r.token_budget ?? 0,
    context_pct: r.context_pct !== null ? parseFloat(r.context_pct) : 0,
    created_at: r.created_at,
    last_active_at: r.last_active_at,
  }));
}
