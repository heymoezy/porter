/**
 * migrate-active-project-v1.ts — Porter Backbone Identity (v6.22.0)
 *
 * Porter is the infrastructure backbone, not a project. It serves N peer
 * projects (ymc.capital, Porter-the-repo, Deals/Stablekey, etc.). The
 * "active project" is which peer the human is currently working on. This
 * is distinct from Porter-the-backbone, which is always-on.
 *
 * Creates:
 *   active_project — single table holding the pin. One row per scope.
 *                    scope='_global' is the system default (set by deploy
 *                    scripts, /silo-style commands, manual API calls).
 *                    scope=<session_id> is per-session override.
 *
 * Resolution at hook time:
 *   1. cwd matches /home/lobster/projects/<name> → that's the active project
 *   2. session_id row in active_project → that
 *   3. '_global' row → that
 *   4. null → ASK MOE
 *
 * Idempotent: schema_migrations.id='active_project_v1' guard.
 */

import pg from 'pg';

export async function migrateActiveProjectV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'active_project_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS active_project (
        scope       TEXT PRIMARY KEY,
        project     TEXT NOT NULL,
        subproject  TEXT,
        set_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        set_by      TEXT
      )
    `);
    console.log('[migrate-active-project-v1] table active_project ready');

    // schema_migrations.applied_at is `double precision` (Unix epoch).
    // Let the column DEFAULT fire — don't pass NOW() (timestamptz).
    await client.query(
      `INSERT INTO schema_migrations (id) VALUES ('active_project_v1')`,
    );
    await client.query('COMMIT');
    console.log('[migrate-active-project-v1] complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
