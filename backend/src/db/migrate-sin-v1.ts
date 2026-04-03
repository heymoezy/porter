/**
 * migrate-sin-v1.ts — Session Intelligence: Phase 41
 *
 * Adds:
 *   session_registry.memory_snapshot TEXT  — frozen memory context text for this session
 *   session_registry.frozen_at DOUBLE PRECISION  — epoch when snapshot was frozen
 *   bridge_dispatch_log.outcome_score SMALLINT  — 1-5 outcome rating (null = unrated)
 *   bridge_dispatch_log.outcome_note TEXT  — optional freeform outcome note
 *   agent_messages.search_vector tsvector  — FTS vector for message/response search
 *   GIN index on agent_messages.search_vector
 *   Trigger to auto-update search_vector on INSERT/UPDATE
 *   Backfill of existing agent_messages rows
 */

import pg from 'pg';

export async function migrateSinV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'sin_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── session_registry: memory snapshot columns ─────────────────────────────
    await client.query(`
      ALTER TABLE session_registry
        ADD COLUMN IF NOT EXISTS memory_snapshot TEXT,
        ADD COLUMN IF NOT EXISTS frozen_at DOUBLE PRECISION
    `);
    console.log('[migrate-sin-v1] session_registry: memory_snapshot + frozen_at added');

    // ── bridge_dispatch_log: outcome columns ──────────────────────────────────
    await client.query(`
      ALTER TABLE bridge_dispatch_log
        ADD COLUMN IF NOT EXISTS outcome_score SMALLINT,
        ADD COLUMN IF NOT EXISTS outcome_note TEXT
    `);
    console.log('[migrate-sin-v1] bridge_dispatch_log: outcome_score + outcome_note added');

    // ── agent_messages: FTS search_vector column ──────────────────────────────
    await client.query(`
      ALTER TABLE agent_messages
        ADD COLUMN IF NOT EXISTS search_vector tsvector
    `);
    console.log('[migrate-sin-v1] agent_messages: search_vector column added');

    // ── GIN index on search_vector ─────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_messages_fts
        ON agent_messages USING GIN(search_vector)
    `);
    console.log('[migrate-sin-v1] GIN index idx_agent_messages_fts created');

    // ── Trigger function to auto-update search_vector ─────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION agent_messages_search_update()
        RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.search_vector := to_tsvector(
          'english',
          COALESCE(NEW.message, '') || ' ' || COALESCE(NEW.response, '')
        );
        RETURN NEW;
      END;
      $$
    `);
    console.log('[migrate-sin-v1] trigger function agent_messages_search_update created');

    // Drop and recreate trigger (CREATE OR REPLACE not available for triggers in PG < 14)
    await client.query(`
      DROP TRIGGER IF EXISTS trig_agent_messages_search_update ON agent_messages
    `);
    await client.query(`
      CREATE TRIGGER trig_agent_messages_search_update
        BEFORE INSERT OR UPDATE ON agent_messages
        FOR EACH ROW
        EXECUTE FUNCTION agent_messages_search_update()
    `);
    console.log('[migrate-sin-v1] trigger trig_agent_messages_search_update applied');

    // ── Backfill existing rows ─────────────────────────────────────────────────
    const backfill = await client.query(`
      UPDATE agent_messages
        SET search_vector = to_tsvector(
          'english',
          COALESCE(message, '') || ' ' || COALESCE(response, '')
        )
      WHERE search_vector IS NULL
    `);
    console.log(`[migrate-sin-v1] backfilled ${backfill.rowCount} agent_messages rows`);

    // ── Mark migration complete ───────────────────────────────────────────────
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('sin_v1')`);
    await client.query('COMMIT');
    console.log('[migrate-sin-v1] migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate-sin-v1] migration failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}
