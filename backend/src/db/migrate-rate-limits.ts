import pg from 'pg';

export async function migrateRateLimits(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'rate_limits_v1'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── gateway_rate_limits table ──────────────────────────────────────
    // Per-gateway rate limit tracking — supports provider headers, manual
    // configuration, and inferred empirical rates.
    await client.query(`
      CREATE TABLE IF NOT EXISTS gateway_rate_limits (
        id              TEXT PRIMARY KEY,
        gateway_id      TEXT NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
        limit_type      TEXT NOT NULL,
        limit_value     DOUBLE PRECISION,
        current_value   DOUBLE PRECISION NOT NULL DEFAULT 0,
        reset_at        DOUBLE PRECISION,
        source          TEXT NOT NULL DEFAULT 'inferred',
        last_429_at     DOUBLE PRECISION,
        total_429_count INTEGER NOT NULL DEFAULT 0,
        updated_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_grl_gateway ON gateway_rate_limits(gateway_id)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_grl_gateway_type ON gateway_rate_limits(gateway_id, limit_type)
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('rate_limits_v1')`);
    await client.query('COMMIT');
    console.log('[migrate-rate-limits] rate_limits_v1 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
