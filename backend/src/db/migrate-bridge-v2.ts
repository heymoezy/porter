import pg from 'pg';

export async function migrateBridgeV2(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'bridge_v2'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── Table 1: routing_rules ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS routing_rules (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL DEFAULT 'global',
        scope_id TEXT,
        action TEXT NOT NULL,
        action_value TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 50,
        description TEXT,
        created_by TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_routing_rules_scope ON routing_rules(scope, scope_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_routing_rules_enabled ON routing_rules(enabled)`);

    // ── Table 2: bridge_dispatch_log ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS bridge_dispatch_log (
        id TEXT PRIMARY KEY,
        gateway_id TEXT,
        gateway_type TEXT NOT NULL,
        model_name TEXT NOT NULL,
        chosen_reason TEXT NOT NULL,
        alternatives JSONB DEFAULT '[]'::jsonb,
        estimated_cost_usd DOUBLE PRECISION,
        input_tokens INTEGER,
        output_tokens INTEGER,
        latency_ms INTEGER,
        agent_id TEXT,
        project_id TEXT,
        chat_id TEXT,
        rule_id TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bridge_dispatch_log_agent ON bridge_dispatch_log(agent_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bridge_dispatch_log_chat ON bridge_dispatch_log(chat_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bridge_dispatch_log_created ON bridge_dispatch_log(created_at DESC)`);

    // ── Table 3: session_routing_context ──────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_routing_context (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        message_sequence INTEGER NOT NULL,
        gateway_id TEXT,
        gateway_type TEXT NOT NULL,
        model_name TEXT NOT NULL,
        dispatch_log_id TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_session_routing_chat ON session_routing_context(chat_id, message_sequence)`);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('bridge_v2')`);
    await client.query('COMMIT');
    console.log('[migrate-bridge] bridge_v2 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
