import pg from 'pg';

export async function migrateBridgeV7(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'bridge_v7'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── Convert flat capabilities arrays to structured JSONB objects ──────────
    // Only migrate rows that are still storing the old flat array format.
    // Rows already containing structured objects (from startup-detector writing
    // GATEWAY_CAPABILITY_REGISTRY on a prior boot) are untouched.
    await client.query(`
      UPDATE gateways
      SET capabilities = jsonb_build_object(
        'legacy_tags',    capabilities,
        'strengths',      CASE type
          WHEN 'claude_cli'    THEN '["reasoning","coding","analysis","writing"]'::jsonb
          WHEN 'codex_cli'     THEN '["coding"]'::jsonb
          WHEN 'gemini_cli'    THEN '["reasoning","coding","analysis","writing"]'::jsonb
          WHEN 'openclaw'      THEN '["reasoning","coding","analysis"]'::jsonb
          WHEN 'ollama'        THEN '["coding"]'::jsonb
          WHEN 'openai_compat' THEN '["coding","analysis"]'::jsonb
          ELSE                      '[]'::jsonb
        END,
        'cost_tier',      CASE type
          WHEN 'claude_cli'    THEN 'premium'
          WHEN 'codex_cli'     THEN 'premium'
          WHEN 'gemini_cli'    THEN 'standard'
          WHEN 'openclaw'      THEN 'premium'
          WHEN 'ollama'        THEN 'budget'
          WHEN 'openai_compat' THEN 'standard'
          ELSE                      'standard'
        END,
        'context_window', CASE type
          WHEN 'claude_cli'    THEN 200000
          WHEN 'codex_cli'     THEN 128000
          WHEN 'gemini_cli'    THEN 1000000
          WHEN 'openclaw'      THEN 128000
          WHEN 'ollama'        THEN 32768
          WHEN 'openai_compat' THEN 128000
          ELSE                      128000
        END,
        'tool_support',   CASE type
          WHEN 'claude_cli'    THEN 'full'
          WHEN 'codex_cli'     THEN 'full'
          WHEN 'gemini_cli'    THEN 'full'
          WHEN 'openclaw'      THEN 'full'
          WHEN 'ollama'        THEN 'limited'
          WHEN 'openai_compat' THEN 'full'
          ELSE                      'none'
        END,
        'agentic',        CASE type
          WHEN 'claude_cli'    THEN true
          WHEN 'codex_cli'     THEN true
          WHEN 'gemini_cli'    THEN true
          WHEN 'openclaw'      THEN true
          WHEN 'ollama'        THEN false
          WHEN 'openai_compat' THEN false
          ELSE                      false
        END
      )
      WHERE capabilities IS NULL OR jsonb_typeof(capabilities) = 'array'
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('bridge_v7')`);
    await client.query('COMMIT');
    console.log('[migrate-bridge] bridge_v7 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
