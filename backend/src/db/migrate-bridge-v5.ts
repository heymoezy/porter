import pg from 'pg';

export async function migrateBridgeV5(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'bridge_v5'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── user_api_keys table ──────────────────────────────────────────────
    // Per-user API key storage for direct provider access (MT-01)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_api_keys (
        id              TEXT PRIMARY KEY,
        username        TEXT NOT NULL,
        gateway_type    TEXT NOT NULL,
        label           TEXT NOT NULL DEFAULT 'primary',
        encrypted_value TEXT NOT NULL,
        masked_display  TEXT NOT NULL DEFAULT '',
        created_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        rotated_at      DOUBLE PRECISION,
        UNIQUE(username, gateway_type, label)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_api_keys_username ON user_api_keys(username)
    `);

    // ── workspace_gateway_overrides table ────────────────────────────────
    // Per-workspace gateway availability control (MT-02)
    await client.query(`
      CREATE TABLE IF NOT EXISTS workspace_gateway_overrides (
        id          TEXT PRIMARY KEY,
        gateway_id  TEXT NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
        enabled     INTEGER NOT NULL DEFAULT 1,
        reason      TEXT,
        updated_by  TEXT,
        updated_at  DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        UNIQUE(gateway_id)
      )
    `);

    // ── username column on bridge_dispatch_log (MT-03) ───────────────────
    await client.query(`
      ALTER TABLE bridge_dispatch_log
        ADD COLUMN IF NOT EXISTS username TEXT
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bridge_dispatch_log_username
        ON bridge_dispatch_log(username)
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('bridge_v5')`);
    await client.query('COMMIT');
    console.log('[migrate-bridge] bridge_v5 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
