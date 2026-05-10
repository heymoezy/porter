import pg from 'pg';

// bridge_v8 — separate CLI tool observability from real model dispatches.
//
// Background: a Claude Code PostToolUse hook was firing into bridge_dispatch_log
// for every tool call, with hardcoded model/latency/tokens. By 2026-05-10 these
// rows accounted for >99% of "dispatches", drowning real router activity in
// fake metadata and breaking cost analytics.
//
// Fix:
//  1. New table cli_activity_log — purpose-built for tool observability.
//  2. Purge legacy external_cli rows from bridge_dispatch_log.
//  3. Activate the models we actually run on (Opus 4.7, Haiku 4.5) with
//     correct pricing; deactivate the older Opus 4.6.

export async function migrateBridgeV8(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(`SELECT 1 FROM schema_migrations WHERE id = 'bridge_v8'`);
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS cli_activity_log (
        id            UUID PRIMARY KEY,
        gateway_type  TEXT NOT NULL,
        model_name    TEXT,
        tool_name     TEXT,
        intent        TEXT,
        chat_id       TEXT,
        username      TEXT,
        source_agent  TEXT,
        input_bytes   INTEGER,
        output_bytes  INTEGER,
        created_at    DOUBLE PRECISION NOT NULL
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cli_activity_created ON cli_activity_log(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cli_activity_chat    ON cli_activity_log(chat_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cli_activity_tool    ON cli_activity_log(tool_name)`);

    const purge = await client.query(`DELETE FROM bridge_dispatch_log WHERE chosen_reason = 'external_cli'`);
    console.log(`[migrate-bridge-v8] purged ${purge.rowCount ?? 0} external_cli rows from bridge_dispatch_log`);

    // Models in use as of 2026-05-10: Opus 4.7 + Haiku 4.5.
    // Pricing per Anthropic public rate card (Opus tier $15/$75; Haiku 4.5 $1/$5).
    await client.query(`
      UPDATE models
         SET is_active = 1,
             pricing_input_per_m  = 15,
             pricing_output_per_m = 75,
             context_window = 200000,
             updated_at = EXTRACT(EPOCH FROM NOW())
       WHERE model_name = 'claude-opus-4-7'
    `);
    await client.query(`
      UPDATE models
         SET is_active = 1,
             pricing_input_per_m  = 1,
             pricing_output_per_m = 5,
             context_window = 200000,
             updated_at = EXTRACT(EPOCH FROM NOW())
       WHERE model_name = 'claude-haiku-4-5'
    `);
    await client.query(`UPDATE models SET is_active = 0, updated_at = EXTRACT(EPOCH FROM NOW()) WHERE model_name = 'claude-opus-4-6'`);

    await client.query(`INSERT INTO schema_migrations (id, applied_at) VALUES ('bridge_v8', EXTRACT(EPOCH FROM NOW()))`);
    await client.query('COMMIT');
    console.log('[migrate-bridge-v8] applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
