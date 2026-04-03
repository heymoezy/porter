/**
 * migrate-psb-v1.ts -- Project Substrate: Phase 47
 *
 * Adds fs_path column to projects table for filesystem provisioning.
 */

import pg from 'pg';

export async function migratePsbV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'psb_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // Add fs_path column to projects table
    await client.query(`
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS fs_path TEXT
    `);
    console.log('[migrate-psb-v1] fs_path column added to projects');

    // Mark migration complete
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('psb_v1')`);
    await client.query('COMMIT');
    console.log('[migrate-psb-v1] migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate-psb-v1] migration failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}
