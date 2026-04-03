/**
 * migrate-pmn-v1.ts -- Project Monitoring: Phase 46
 *
 * Creates project_watchers and watcher_findings tables for autonomous
 * project monitoring (web search, RSS, email, custom watchers).
 */

import pg from 'pg';

export async function migratePmnV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'pmn_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // -- project_watchers table ------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_watchers (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        watcher_type TEXT NOT NULL,
        schedule_cron TEXT NOT NULL,
        schedule_interval_sec INTEGER NOT NULL DEFAULT 21600,
        config JSONB NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'active',
        last_run_at DOUBLE PRECISION,
        next_run_at DOUBLE PRECISION,
        last_error TEXT,
        run_count INTEGER DEFAULT 0,
        finding_count INTEGER DEFAULT 0,
        notify_email TEXT,
        created_by TEXT NOT NULL,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    console.log('[migrate-pmn-v1] project_watchers table created');

    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_project_watchers_project ON project_watchers(project_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_project_watchers_status ON project_watchers(status) WHERE status = 'active'`,
    );
    console.log('[migrate-pmn-v1] project_watchers indexes created');

    // -- watcher_findings table ------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS watcher_findings (
        id TEXT PRIMARY KEY,
        watcher_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        detail JSONB NOT NULL DEFAULT '{}',
        importance TEXT NOT NULL DEFAULT 'normal',
        is_read INTEGER DEFAULT 0,
        job_id TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    console.log('[migrate-pmn-v1] watcher_findings table created');

    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_watcher_findings_project ON watcher_findings(project_id, created_at DESC)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_watcher_findings_watcher ON watcher_findings(watcher_id, created_at DESC)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_watcher_findings_importance ON watcher_findings(importance) WHERE importance != 'normal'`,
    );
    console.log('[migrate-pmn-v1] watcher_findings indexes created');

    // -- Mark migration complete -----------------------------------------------
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('pmn_v1')`);
    await client.query('COMMIT');
    console.log('[migrate-pmn-v1] migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate-pmn-v1] migration failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}
