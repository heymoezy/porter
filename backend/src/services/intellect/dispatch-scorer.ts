/**
 * Intellect Dispatch Scorer
 *
 * Computes automatic outcome scores for unscored dispatches in
 * bridge_dispatch_log so that the existing routing-confidence module has
 * data to work with.
 *
 * Heuristic scoring (1.0 - 5.0 scale — matches the manual feedback scale):
 *
 *   Base: 3.0 (neutral)
 *
 *   Latency signal (adjustable per gateway type):
 *     +1.0  latency_ms  <   800
 *     +0.5  latency_ms  <  2000
 *     -0.5  latency_ms  > 10000
 *     -1.0  latency_ms  > 30000
 *
 *   Token efficiency: very high output for very low input is suspicious
 *   (probably an error message or empty response), so -0.5.
 *
 *   Correction proximity: if a correction_detected intellect event fired
 *   within 90 seconds AFTER this dispatch for the same session, -1.0
 *   (the user corrected the assistant's behavior right after the dispatch).
 *
 *   Scores are clamped to [1, 5] and written as smallint.
 *
 * This is a deliberately crude scoring pass. The goal is to seed the
 * routing-confidence cache with data so routing can start adapting, not
 * to replace explicit human feedback.
 */

import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';

const BATCH_SIZE = 500;
const CORRECTION_PROXIMITY_SECONDS = 90;

interface UnscoredDispatch {
  id: string;
  gateway_type: string;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  chat_id: string | null;
  created_at: number;
  intent: string | null;
}

interface ScoringStats {
  scanned: number;
  scored: number;
  positive: number;
  neutral: number;
  negative: number;
}

function heuristicScore(d: UnscoredDispatch, correctionNearby: boolean): number {
  let score = 3.0;

  if (d.latency_ms != null) {
    if (d.latency_ms > 0 && d.latency_ms < 800) score += 1.0;
    else if (d.latency_ms < 2000) score += 0.5;
    else if (d.latency_ms > 30000) score -= 1.0;
    else if (d.latency_ms > 10000) score -= 0.5;
  }

  // Suspicious token ratio: huge output with tiny input often = error dump
  if (d.input_tokens != null && d.output_tokens != null) {
    if (d.input_tokens < 20 && d.output_tokens > 500) score -= 0.5;
  }

  if (correctionNearby) score -= 1.0;

  // Clamp to the 1..5 smallint range
  if (score < 1) score = 1;
  if (score > 5) score = 5;
  return Math.round(score);
}

/**
 * Score a batch of unscored dispatches. Returns stats.
 */
export async function runDispatchScoring(): Promise<ScoringStats> {
  // Only score dispatches from the last 14 days — older ones are unlikely
  // to help routing decisions and reading the whole table would be wasteful.
  const cutoff = Date.now() / 1000 - 14 * 86400;

  const { rows } = await pool.query<UnscoredDispatch>(
    `SELECT id, gateway_type, latency_ms, input_tokens, output_tokens,
            chat_id, created_at, intent
     FROM bridge_dispatch_log
     WHERE outcome_score IS NULL
       AND created_at > $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [cutoff, BATCH_SIZE]
  );

  if (rows.length === 0) {
    return { scanned: 0, scored: 0, positive: 0, neutral: 0, negative: 0 };
  }

  // Bulk lookup: correction events per session within scored-dispatch windows.
  const sessionIds = Array.from(new Set(rows.map(r => r.chat_id).filter(Boolean))) as string[];

  interface CorrEv { session_id: string; created_at: number }
  let correctionEvents: CorrEv[] = [];
  if (sessionIds.length > 0) {
    const { rows: cev } = await pool.query<CorrEv>(
      `SELECT (details_json->>'sessionId') AS session_id, created_at
       FROM intellect_events
       WHERE event_type IN ('correction_detected', 'correction_reinforced')
         AND (details_json->>'sessionId') = ANY($1::text[])
         AND created_at > $2`,
      [sessionIds, cutoff]
    );
    correctionEvents = cev;
  }

  // Fast lookup by session id
  const correctionsBySession = new Map<string, number[]>();
  for (const ev of correctionEvents) {
    if (!ev.session_id) continue;
    const arr = correctionsBySession.get(ev.session_id) ?? [];
    arr.push(Number(ev.created_at));
    correctionsBySession.set(ev.session_id, arr);
  }

  let positive = 0;
  let neutral = 0;
  let negative = 0;

  // Score and update in a single transaction per batch
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const d of rows) {
      let nearby = false;
      if (d.chat_id) {
        const corrTimes = correctionsBySession.get(d.chat_id) ?? [];
        for (const ct of corrTimes) {
          if (ct > d.created_at && ct - d.created_at <= CORRECTION_PROXIMITY_SECONDS) {
            nearby = true;
            break;
          }
        }
      }

      const score = heuristicScore(d, nearby);
      if (score > 3) positive++;
      else if (score < 3) negative++;
      else neutral++;

      const note = nearby ? 'auto:heuristic:correction-nearby' : 'auto:heuristic';
      await client.query(
        `UPDATE bridge_dispatch_log
         SET outcome_score = $1, outcome_note = $2
         WHERE id = $3`,
        [score, note, d.id]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const stats: ScoringStats = {
    scanned: rows.length,
    scored: rows.length,
    positive,
    neutral,
    negative,
  };

  await logIntellectEvent('dispatch_scored', 'dispatch_scorer', { ...stats });

  return stats;
}
