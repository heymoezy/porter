import pg from 'pg';

export async function migrateBridgeV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'bridge_v1'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── Table 1: gateways ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS gateways (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        url TEXT,
        auth_method TEXT NOT NULL DEFAULT 'none',
        status TEXT NOT NULL DEFAULT 'active',
        source TEXT NOT NULL DEFAULT 'manual',
        priority INTEGER NOT NULL DEFAULT 10,
        capabilities JSONB DEFAULT '[]'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        enabled INTEGER NOT NULL DEFAULT 1,
        masked_display TEXT DEFAULT '',
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        last_health_at DOUBLE PRECISION
      )
    `);

    // ── Table 2: gateway_credentials ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS gateway_credentials (
        id TEXT PRIMARY KEY,
        gateway_id TEXT NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT 'primary',
        encrypted_value TEXT NOT NULL,
        masked_display TEXT NOT NULL DEFAULT '',
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        rotated_at DOUBLE PRECISION
      )
    `);

    // ── Indexes ───────────────────────────────────────────────────────────────
    // Partial unique: only one auto/env row per type (manual can have multiples)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_gateways_type_source
        ON gateways(type, source)
        WHERE source IN ('auto_detected', 'env_bootstrap')
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gateways_status ON gateways(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gateways_type ON gateways(type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gateway_creds_gateway ON gateway_credentials(gateway_id)`);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('bridge_v1')`);
    await client.query('COMMIT');
    console.log('[migrate-bridge] bridge_v1 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
