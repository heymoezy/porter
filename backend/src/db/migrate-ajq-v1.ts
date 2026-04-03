/**
 * migrate-ajq-v1.ts — Autonomous Job Queue: Phase 44
 *
 * Adds 4 columns to agent_jobs:
 *   source         TEXT NOT NULL DEFAULT 'system'
 *   required_skill TEXT
 *   required_capability TEXT
 *   assigned_gateway    TEXT
 *
 * Indexes:
 *   idx_agent_jobs_source        — filter by source
 *   idx_agent_jobs_status_source — partial index for pending/running system jobs
 */

import pg from 'pg';

export async function migrateAjqV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'ajq_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── Add columns ──────────────────────────────────────────────────────────
    await client.query(`ALTER TABLE agent_jobs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'system'`);
    await client.query(`ALTER TABLE agent_jobs ADD COLUMN IF NOT EXISTS required_skill TEXT`);
    await client.query(`ALTER TABLE agent_jobs ADD COLUMN IF NOT EXISTS required_capability TEXT`);
    await client.query(`ALTER TABLE agent_jobs ADD COLUMN IF NOT EXISTS assigned_gateway TEXT`);
    console.log('[migrate-ajq-v1] 4 columns added to agent_jobs');

    // ── Indexes ──────────────────────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_jobs_source ON agent_jobs(source)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_jobs_status_source ON agent_jobs(status, source) WHERE status IN ('pending', 'running')`);
    console.log('[migrate-ajq-v1] indexes created');

    // ── Mark migration complete ──────────────────────────────────────────────
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('ajq_v1')`);
    await client.query('COMMIT');
    console.log('[migrate-ajq-v1] migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate-ajq-v1] migration failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}
