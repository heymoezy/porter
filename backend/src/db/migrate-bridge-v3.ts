import pg from 'pg';

export async function migrateBridgeV3(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'bridge_v3'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── circuit_state column on gateways ──────────────────────────────────────
    // Admin observability only — not used for routing decisions.
    // Valid values: 'closed' | 'open' | 'half_open'
    await client.query(`
      ALTER TABLE gateways
        ADD COLUMN IF NOT EXISTS circuit_state TEXT DEFAULT 'closed'
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('bridge_v3')`);
    await client.query('COMMIT');
    console.log('[migrate-bridge] bridge_v3 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
