/**
 * migrate-transcripts-v1.ts -- Phase 48.2 Transcript Capture schema
 *
 * Creates:
 *   1. session_transcript_turns -- silo-tagged turn capture, PII-scrubbed content
 *   2. UNIQUE(session_id, turn_index)    -- idempotency guard for Stop hook re-fires
 *   3. INDEX (silo_id, captured_at DESC) -- serves Plan 48.3 read pattern
 *   4. INDEX (captured_at)               -- serves retention DELETE
 *
 * Seeds:
 *   workflows row 'Prune transcripts older than 30 days' (every_24h, action_type=transcript_retain).
 *
 * Idempotent: schema_migrations.id='transcripts_v1' guard.
 * Dependency: workflows table must exist (created in migrate-consolidated.ts).
 */

import pg from 'pg';

export async function migrateTranscriptsV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'transcripts_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS session_transcript_turns (
        id           SERIAL PRIMARY KEY,
        session_id   TEXT NOT NULL,
        turn_index   INTEGER NOT NULL,
        role         TEXT NOT NULL CHECK (role IN ('user','assistant')),
        silo_id      TEXT,
        cwd          TEXT,
        content      TEXT NOT NULL,
        captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[migrate-transcripts-v1] table session_transcript_turns ready');

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS transcript_turns_session_turn_uniq
        ON session_transcript_turns(session_id, turn_index)
    `);
    console.log('[migrate-transcripts-v1] unique index on (session_id, turn_index) ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS transcript_turns_silo_captured_idx
        ON session_transcript_turns(silo_id, captured_at DESC)
    `);
    console.log('[migrate-transcripts-v1] index on (silo_id, captured_at DESC) ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS transcript_turns_captured_idx
        ON session_transcript_turns(captured_at)
    `);
    console.log('[migrate-transcripts-v1] index on (captured_at) ready');

    await client.query(`
      INSERT INTO workflows (id, name, trigger_type, trigger_value, action_type, action_config, enabled)
      SELECT gen_random_uuid()::text,
             'Prune transcripts older than 30 days',
             'schedule', 'every_24h', 'transcript_retain', '{}'::jsonb, true
      WHERE NOT EXISTS (
        SELECT 1 FROM workflows WHERE name = 'Prune transcripts older than 30 days'
      )
    `);
    console.log('[migrate-transcripts-v1] retention workflow seeded (or already present)');

    await client.query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ('transcripts_v1', EXTRACT(EPOCH FROM NOW()))`,
    );

    await client.query('COMMIT');
    console.log('[migrate-transcripts-v1] complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
