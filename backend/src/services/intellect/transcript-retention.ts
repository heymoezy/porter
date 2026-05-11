/**
 * transcript-retention.ts -- Phase 48.2 TRC-06
 *
 * Hard-deletes session_transcript_turns rows older than 30 days.
 * Invoked daily by the workflow engine via the 'transcript_retain' action handler.
 * No archive, no soft-delete (locked decision per research User Constraints section).
 */

import type pg from 'pg';

export async function runTranscriptRetention(pool: pg.Pool): Promise<{ deleted: number }> {
  const result = await pool.query(
    `DELETE FROM session_transcript_turns WHERE captured_at < NOW() - INTERVAL '30 days'`,
  );
  const deleted = result.rowCount ?? 0;
  console.log(`[transcript-retention] hard-deleted ${deleted} rows older than 30 days`);
  return { deleted };
}
