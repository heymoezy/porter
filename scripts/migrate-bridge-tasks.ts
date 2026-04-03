/**
 * Migration: bridge_tasks table (Phase 39)
 *
 * Creates the bridge_tasks table for task dispatch persistence.
 * Safe to re-run — idempotency enforced via schema_migrations check.
 *
 * Usage: npx tsx scripts/migrate-bridge-tasks.ts
 */

import { pool } from '../backend/src/db/client.js';

async function main() {
  console.log('=== Migration: bridge_tasks (Phase 39) ===\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'bridge_tasks_v1'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      console.log('[migrate-bridge-tasks] Already applied — skipping.');
      return;
    }

    // Create bridge_tasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS bridge_tasks (
        id               TEXT PRIMARY KEY,
        gateway_type     TEXT NOT NULL,
        model_name       TEXT NOT NULL DEFAULT '',
        prompt           TEXT NOT NULL,
        cwd              TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'queued',
        output           TEXT,
        error            TEXT,
        exit_code        INTEGER,
        started_at       DOUBLE PRECISION,
        completed_at     DOUBLE PRECISION,
        duration_ms      INTEGER,
        agent_id         TEXT,
        project_id       TEXT,
        username         TEXT,
        dispatch_log_id  TEXT,
        created_at       DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // Index on status (queue draining queries)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bridge_tasks_status
        ON bridge_tasks(status)
    `);

    // Index on created_at DESC (admin list queries)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bridge_tasks_created_at
        ON bridge_tasks(created_at DESC)
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('bridge_tasks_v1')`);
    await client.query('COMMIT');
    console.log('[migrate-bridge-tasks] bridge_tasks_v1 applied: table + 2 indexes created');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
