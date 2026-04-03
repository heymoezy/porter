/**
 * migrate-tde-v1.ts — Task Decomposition Engine: Phase 42
 *
 * Creates:
 *   task_nodes table — execution graph for decomposed multi-step requests
 *   Indexes: idx_task_nodes_root, idx_task_nodes_parent, idx_task_nodes_status (partial)
 *   CHECK constraint: depth <= 3
 */

import pg from 'pg';

export async function migrateTdeV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'tde_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── task_nodes table ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_nodes (
        id                TEXT PRIMARY KEY,
        root_id           TEXT NOT NULL,
        parent_id         TEXT,
        project_id        TEXT,
        chat_id           TEXT,

        description       TEXT NOT NULL,
        task_type         TEXT DEFAULT 'general',
        assigned_agent_id TEXT,

        depth             INTEGER DEFAULT 0,
        dependencies      JSONB DEFAULT '[]',

        status            TEXT NOT NULL DEFAULT 'pending',
        attempt           INTEGER DEFAULT 0,
        max_attempts      INTEGER DEFAULT 3,

        context           JSONB DEFAULT '{}',
        result            JSONB,
        error             TEXT,

        token_budget      INTEGER,
        tokens_used       INTEGER DEFAULT 0,

        created_at        DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        started_at        DOUBLE PRECISION,
        completed_at      DOUBLE PRECISION,

        CONSTRAINT task_nodes_max_depth CHECK (depth <= 3)
      )
    `);
    console.log('[migrate-tde-v1] task_nodes table created');

    // ── Indexes ───────────────────────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_task_nodes_root
        ON task_nodes (root_id)
    `);
    console.log('[migrate-tde-v1] index idx_task_nodes_root created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_task_nodes_parent
        ON task_nodes (parent_id)
    `);
    console.log('[migrate-tde-v1] index idx_task_nodes_parent created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_task_nodes_status
        ON task_nodes (status)
        WHERE status IN ('pending', 'ready', 'running')
    `);
    console.log('[migrate-tde-v1] partial index idx_task_nodes_status created');

    // ── Mark migration complete ───────────────────────────────────────────────
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('tde_v1')`);
    await client.query('COMMIT');
    console.log('[migrate-tde-v1] migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate-tde-v1] migration failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}
