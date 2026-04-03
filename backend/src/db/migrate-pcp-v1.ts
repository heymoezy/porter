/**
 * migrate-pcp-v1.ts -- Porter Control Plane: Phase 45
 *
 * Adds dispatch_strategy column to bridge_dispatch_log for doctrine decision logging.
 * Creates partial index on msg_bus_events for depth_violation audit queries.
 */

import pg from 'pg';

export async function migratePcpV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'pcp_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // -- Add dispatch_strategy column to bridge_dispatch_log ----------------
    await client.query(
      `ALTER TABLE bridge_dispatch_log ADD COLUMN IF NOT EXISTS dispatch_strategy TEXT`,
    );
    console.log('[migrate-pcp-v1] dispatch_strategy column added to bridge_dispatch_log');

    // -- Partial index for depth_violation audit queries --------------------
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_msg_bus_events_depth_violations
         ON msg_bus_events(intent) WHERE intent = 'depth_violation'`,
    );
    console.log('[migrate-pcp-v1] depth_violation index created on msg_bus_events');

    // -- Mark migration complete -------------------------------------------
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('pcp_v1')`);
    await client.query('COMMIT');
    console.log('[migrate-pcp-v1] migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate-pcp-v1] migration failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}
