import pg from 'pg';

export async function migrateBridgeV6(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'bridge_v6'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── Agent-message observability columns on bridge_dispatch_log ───────────
    // Enables correlation of Bridge hub/spoke dispatches initiated by
    // POST /api/v1/bridge/agent-message back to the originating AgentMessage.
    await client.query(`
      ALTER TABLE bridge_dispatch_log
        ADD COLUMN IF NOT EXISTS correlation_id   TEXT,
        ADD COLUMN IF NOT EXISTS source_agent     TEXT,
        ADD COLUMN IF NOT EXISTS source_gateway   TEXT,
        ADD COLUMN IF NOT EXISTS target_agent     TEXT,
        ADD COLUMN IF NOT EXISTS target_gateway   TEXT,
        ADD COLUMN IF NOT EXISTS intent           TEXT,
        ADD COLUMN IF NOT EXISTS reply_to         TEXT,
        ADD COLUMN IF NOT EXISTS is_agent_message INTEGER
    `);

    // Indexes for agent-message query patterns
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bridge_dispatch_log_correlation_id
        ON bridge_dispatch_log(correlation_id)
        WHERE correlation_id IS NOT NULL
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bridge_dispatch_log_is_agent_message
        ON bridge_dispatch_log(is_agent_message)
        WHERE is_agent_message IS NOT NULL
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('bridge_v6')`);
    await client.query('COMMIT');
    console.log('[migrate-bridge] bridge_v6 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
