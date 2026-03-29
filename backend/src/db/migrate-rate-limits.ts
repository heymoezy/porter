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
    } else {
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
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // ── V2: Add model_name + period columns ──────────────────────────────
  const client2 = await pool.connect();
  try {
    await client2.query('BEGIN');

    const check2 = await client2.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'rate_limits_v2'`
    );
    if (check2.rowCount && check2.rowCount > 0) {
      await client2.query('COMMIT');
      return;
    }

    // Add model_name (NULL = gateway-level) and period columns
    await client2.query(`ALTER TABLE gateway_rate_limits ADD COLUMN IF NOT EXISTS model_name TEXT`);
    await client2.query(`ALTER TABLE gateway_rate_limits ADD COLUMN IF NOT EXISTS period TEXT NOT NULL DEFAULT 'minute'`);

    // Migrate existing limit_type values to new schema:
    // rpm -> requests/minute, tpm -> tokens/minute, daily_tokens -> tokens/daily
    await client2.query(`UPDATE gateway_rate_limits SET limit_type = 'requests', period = 'minute' WHERE limit_type = 'rpm'`);
    await client2.query(`UPDATE gateway_rate_limits SET limit_type = 'tokens', period = 'minute' WHERE limit_type = 'tpm'`);
    await client2.query(`UPDATE gateway_rate_limits SET limit_type = 'tokens', period = 'daily' WHERE limit_type = 'daily_tokens'`);
    await client2.query(`UPDATE gateway_rate_limits SET limit_type = 'tokens', period = 'daily' WHERE limit_type = 'daily_spend'`);
    await client2.query(`UPDATE gateway_rate_limits SET limit_type = 'requests', period = 'minute' WHERE limit_type = 'concurrency'`);

    // Drop old unique index and create new one
    await client2.query(`DROP INDEX IF EXISTS idx_grl_gateway_type`);
    await client2.query(`
      CREATE UNIQUE INDEX idx_grl_gateway_model_type_period
      ON gateway_rate_limits(gateway_id, COALESCE(model_name, ''), limit_type, period)
    `);

    await client2.query(`INSERT INTO schema_migrations (id) VALUES ('rate_limits_v2')`);
    await client2.query('COMMIT');
    console.log('[migrate-rate-limits] rate_limits_v2 applied (model_name + period columns)');
  } catch (err) {
    await client2.query('ROLLBACK');
    throw err;
  } finally {
    client2.release();
  }
}
