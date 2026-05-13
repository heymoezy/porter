/**
 * migrate-dreams-v1.ts — Phase 48.3 Software Dream Worker schema
 *
 * Creates:
 *   1. dream_runs        — parent table, one row per worker invocation
 *   2. memory_proposals  — child rows, one per proposal extracted from a run
 *   3. 5 indexes serving DRW-12 (Phase 48.4 read contract) + dream_runs lifecycle queries
 *   4. CHECK constraints on status and proposal_kind / triggered_by
 *
 * Seeds:
 *   - 'Software dream — weekly consolidation' workflow row (every_week, action_type=dream_run, action_config={silo_id:software})
 *   - 'Sweep stuck dream runs (>30 min)' workflow row (every_30m, action_type=dream_runs_stuck_sweep)
 *
 * Idempotent: schema_migrations.id='dreams_v1' guard.
 * Dependency order: silos (48.1) → session_transcript_turns (48.2) → dreams (48.3).
 */

import pg from 'pg';

export async function migrateDreamsV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'dreams_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── dream_runs (parent) ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS dream_runs (
        id                       TEXT PRIMARY KEY,
        silo_id                  TEXT NOT NULL,
        status                   TEXT NOT NULL DEFAULT 'running',
        model_used               TEXT NOT NULL,
        triggered_by             TEXT NOT NULL,
        triggered_by_user        TEXT,
        action_config            JSONB NOT NULL DEFAULT '{}'::jsonb,
        prompt_token_estimate    INTEGER,
        response_token_estimate  INTEGER,
        turns_sampled            INTEGER,
        sessions_sampled         INTEGER,
        proposals_extracted      INTEGER DEFAULT 0,
        duration_ms              INTEGER,
        error_message            TEXT,
        dispatch_id              TEXT,
        started_at               DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        completed_at             DOUBLE PRECISION,
        CHECK (status IN ('running','completed','failed')),
        CHECK (triggered_by IN ('schedule','manual'))
      )
    `);
    console.log('[migrate-dreams-v1] table dream_runs ready');

    await client.query(`CREATE INDEX IF NOT EXISTS dream_runs_silo_started_idx ON dream_runs(silo_id, started_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS dream_runs_status_idx ON dream_runs(status)`);

    // ── memory_proposals (child) ────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS memory_proposals (
        id                   TEXT PRIMARY KEY,
        dream_run_id         TEXT NOT NULL,
        silo_id              TEXT NOT NULL,
        proposal_kind        TEXT NOT NULL,
        target_directive_ids TEXT[] NOT NULL DEFAULT '{}',
        proposed_content     TEXT NOT NULL,
        proposed_metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
        source_evidence      JSONB NOT NULL DEFAULT '{}'::jsonb,
        sort_order           INTEGER NOT NULL DEFAULT 0,
        status               TEXT NOT NULL DEFAULT 'pending',
        created_at           DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        expires_at           DOUBLE PRECISION,
        reviewed_at          DOUBLE PRECISION,
        reviewed_by          TEXT,
        CHECK (proposal_kind IN ('merge','supersede','delete','new_directive')),
        CHECK (status IN ('pending','accepted','rejected','expired'))
      )
    `);
    console.log('[migrate-dreams-v1] table memory_proposals ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS memory_proposals_silo_status_created_idx
        ON memory_proposals(silo_id, status, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS memory_proposals_run_sort_idx
        ON memory_proposals(dream_run_id, sort_order ASC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS memory_proposals_expiry_idx
        ON memory_proposals(status, expires_at)
        WHERE status = 'pending'
    `);
    console.log('[migrate-dreams-v1] 3 memory_proposals indexes ready');

    // ── Seed: weekly software dream workflow (idempotent by name) ──────
    await client.query(`
      INSERT INTO workflows (id, name, trigger_type, trigger_value, action_type, action_config, enabled)
      SELECT gen_random_uuid()::text,
             'Software dream — weekly consolidation',
             'schedule', 'every_week', 'dream_run',
             '{"silo_id":"software"}'::jsonb, true
      WHERE NOT EXISTS (SELECT 1 FROM workflows WHERE name = 'Software dream — weekly consolidation')
    `);

    // ── Seed: stuck-run sweep workflow (idempotent by name) ────────────
    await client.query(`
      INSERT INTO workflows (id, name, trigger_type, trigger_value, action_type, action_config, enabled)
      SELECT gen_random_uuid()::text,
             'Sweep stuck dream runs (>30 min)',
             'schedule', 'every_30m', 'dream_runs_stuck_sweep',
             '{}'::jsonb, true
      WHERE NOT EXISTS (SELECT 1 FROM workflows WHERE name = 'Sweep stuck dream runs (>30 min)')
    `);
    console.log('[migrate-dreams-v1] 2 workflow rows seeded (or already present)');

    await client.query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ('dreams_v1', EXTRACT(EPOCH FROM NOW()))`,
    );

    await client.query('COMMIT');
    console.log('[migrate-dreams-v1] complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
