import pg from 'pg';

export async function migrateBridgeV4(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'bridge_v4'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── models table ──────────────────────────────────────────────────────────
    // Central catalog of every AI model discovered across all gateways.
    // gateway_id FK cascades deletes so removing a gateway purges its models.
    await client.query(`
      CREATE TABLE IF NOT EXISTS models (
        id                   TEXT PRIMARY KEY,
        gateway_id           TEXT NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
        model_name           TEXT NOT NULL,
        capabilities         JSONB DEFAULT '[]'::jsonb,
        context_window       INTEGER,
        pricing_input_per_m  DOUBLE PRECISION,
        pricing_output_per_m DOUBLE PRECISION,
        benchmark_scores     JSONB DEFAULT '{}'::jsonb,
        is_active            INTEGER NOT NULL DEFAULT 1,
        created_at           DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at           DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        UNIQUE(gateway_id, model_name)
      )
    `);

    // ── model_versions table ──────────────────────────────────────────────────
    // Append-only version history. A row is inserted on first discovery and on
    // any capability/context change detected by refreshModelsForGateway().
    await client.query(`
      CREATE TABLE IF NOT EXISTS model_versions (
        id           TEXT PRIMARY KEY,
        model_id     TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
        version_label TEXT NOT NULL,
        snapshot     JSONB DEFAULT '{}'::jsonb,
        detected_at  DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── indexes ───────────────────────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_models_gateway ON models(gateway_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_models_active ON models(is_active)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_model_versions_model ON model_versions(model_id)`);

    // ── bridge_dispatch_log extensions ───────────────────────────────────────
    // cached_tokens: prompt cache hit token count (billed at 10% of input price)
    // model_version_id: FK to model_versions for cost attribution and audit
    await client.query(`
      ALTER TABLE bridge_dispatch_log
        ADD COLUMN IF NOT EXISTS cached_tokens INTEGER,
        ADD COLUMN IF NOT EXISTS model_version_id TEXT
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('bridge_v4')`);
    await client.query('COMMIT');
    console.log('[migrate-bridge] bridge_v4 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
