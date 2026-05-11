/**
 * transcript-capture.ts — Phase 48.2 TRC-04 + TRC-05 + TRC-07
 *
 * Single-writer orchestrator for session_transcript_turns. All hook-driven
 * captures (Stop hook for assistant turns, UserPromptSubmit hook for user
 * turns) POST to /api/v1/intellect/transcript/turn, which calls insertTurn().
 *
 * Pipeline:
 *   1. Pre-flight kill switch: /silo none override -> skip (TRC-07)
 *   2. Silo detection (detectSilos from silo-detector.ts; TRC-04)
 *   3. PII scrub (scrubPII from pii-scrub.ts; TRC-05)
 *   4. 32KB cap with truncation suffix (research Pitfall 4)
 *   5. Server-assigned turn_index (MAX(turn_index)+1 scoped by session_id)
 *   6. INSERT ... ON CONFLICT DO NOTHING (research idempotency design)
 *   7. SINGLE RETRY on race: if ON CONFLICT fires, recompute next_index once
 *      inside the same tx and retry. If still conflict, drop the turn
 *      (accepted tradeoff per must_haves: duplicates worse than drops).
 */

import type pg from 'pg';
import { detectSilos } from './silo-detector.js';
import { scrubPII } from './pii-scrub.js';

const MAX_CONTENT_BYTES = 32 * 1024; // 32KB cap per research Pitfall 4

export interface InsertTurnArgs {
  session_id: string;
  cwd?: string | null;
  role: 'user' | 'assistant';
  content: string;
  captured_at?: string | null; // ISO timestamp; null means use NOW()
}

export interface InsertTurnResult {
  ok: boolean;
  inserted: boolean;
  silo: string | null;
  turn_index: number;
  skipped?: 'silo_none' | 'disabled' | 'empty';
  reason?: 'concurrent_race';
}

function capContent(text: string): string {
  if (!text) return text;
  if (text.length <= MAX_CONTENT_BYTES) return text;
  const head = text.slice(0, MAX_CONTENT_BYTES);
  const trimmed = text.length - MAX_CONTENT_BYTES;
  return `${head}\n... [truncated: ${trimmed} chars]`;
}

export async function insertTurn(args: InsertTurnArgs, pool: pg.Pool): Promise<InsertTurnResult> {
  const sessionId = (args.session_id || '').trim();
  const role = args.role;
  const rawContent = args.content ?? '';

  if (!sessionId) {
    return { ok: false, inserted: false, silo: null, turn_index: -1, skipped: 'empty' };
  }
  if (role !== 'user' && role !== 'assistant') {
    throw new Error(`insertTurn: invalid role '${role}' (must be 'user' or 'assistant')`);
  }
  if (!rawContent || !rawContent.trim()) {
    return { ok: true, inserted: false, silo: null, turn_index: -1, skipped: 'empty' };
  }

  // 1. Kill-switch: /silo none override active (TRC-07)
  //    Query session_silo_overrides directly so we can distinguish
  //    "explicit none" (silo_id IS NULL) from "no silo detected" (no row).
  //    detectSilos returns [] in both cases — only the direct query
  //    disambiguates. See plan Interfaces note.
  const overrideRes = await pool.query<{ silo_id: string | null }>(
    `SELECT silo_id FROM session_silo_overrides
     WHERE session_id = $1 AND set_at > NOW() - INTERVAL '24 hours'`,
    [sessionId],
  );
  if (overrideRes.rowCount && overrideRes.rowCount > 0 && overrideRes.rows[0].silo_id === null) {
    return { ok: true, inserted: false, silo: null, turn_index: -1, skipped: 'silo_none' };
  }

  // 2. Silo detection (TRC-04). detectSilos already honors override/cwd/project_type.
  //    Multi-silo: take silos[0].id for v1 single-silo tagging. Future: silo_ids[].
  const silos = await detectSilos({ cwd: args.cwd ?? null, sessionId }, pool);
  const siloId = silos.length > 0 ? silos[0].id : null;

  // 3. PII scrub (TRC-05) + 4. cap
  const clean = capContent(scrubPII(rawContent));

  // 5. Server-assigned turn_index + 6. INSERT ON CONFLICT DO NOTHING + 7. single retry on race.
  // We use one transaction so MAX-read and INSERT see a consistent state.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // First attempt
    let nextRes = await client.query<{ next_index: number }>(
      `SELECT COALESCE(MAX(turn_index), -1) + 1 AS next_index
         FROM session_transcript_turns
        WHERE session_id = $1`,
      [sessionId],
    );
    let turnIndex = nextRes.rows[0]?.next_index ?? 0;

    let insertRes = await client.query(
      `INSERT INTO session_transcript_turns
         (session_id, turn_index, role, silo_id, cwd, content, captured_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
       ON CONFLICT (session_id, turn_index) DO NOTHING`,
      [sessionId, turnIndex, role, siloId, args.cwd ?? null, clean, args.captured_at ?? null],
    );

    let inserted = (insertRes.rowCount ?? 0) > 0;

    // 7. Single retry on race (drop-on-race tradeoff per must_haves)
    if (!inserted) {
      nextRes = await client.query<{ next_index: number }>(
        `SELECT COALESCE(MAX(turn_index), -1) + 1 AS next_index
           FROM session_transcript_turns
          WHERE session_id = $1`,
        [sessionId],
      );
      turnIndex = nextRes.rows[0]?.next_index ?? 0;

      insertRes = await client.query(
        `INSERT INTO session_transcript_turns
           (session_id, turn_index, role, silo_id, cwd, content, captured_at)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
         ON CONFLICT (session_id, turn_index) DO NOTHING`,
        [sessionId, turnIndex, role, siloId, args.cwd ?? null, clean, args.captured_at ?? null],
      );
      inserted = (insertRes.rowCount ?? 0) > 0;

      if (!inserted) {
        // Still racing after retry. Drop the turn (accepted tradeoff: duplicates
        // are worse than drops for the Dream Worker). Log a warning.
        console.warn(
          `[transcript-capture] concurrent_race drop: session=${sessionId} role=${role} turn_index=${turnIndex} (retry exhausted)`,
        );
        await client.query('COMMIT');
        return {
          ok: true,
          inserted: false,
          silo: siloId,
          turn_index: turnIndex,
          reason: 'concurrent_race',
        };
      }
    }

    await client.query('COMMIT');

    return {
      ok: true,
      inserted: true,
      silo: siloId,
      turn_index: turnIndex,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
