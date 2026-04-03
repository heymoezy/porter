/**
 * migrate-acx-v3.ts — Context pressure observability columns (Phase 38 Plan 03)
 *
 * Adds:
 *   bridge_dispatch_log.context_stats JSONB — unified context pressure blob per dispatch
 *
 * Also applies acx_v2 if not already applied (compression tracking columns).
 *
 * context_stats shape:
 * {
 *   memory:      { tiers_used, total_memory_tokens, budget_tokens }
 *   directives:  { total_active, injected, skipped, scoring_mode }
 *   skills:      { candidates, selected, prompt_tokens }
 *   compression: { tool_outputs_compressed, conversation_turns_compressed, tokens_saved }
 *   session:     { turn_number, context_pct, compression_events, tokens_reclaimed }
 * }
 */

import pg from 'pg';

export async function migrateAcxV3(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Apply acx_v2 if not already present ──────────────────────────────────
    const v2Check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'acx_v2'`
    );
    if (!v2Check.rowCount || v2Check.rowCount === 0) {
      await client.query(`
        ALTER TABLE bridge_dispatch_log
          ADD COLUMN IF NOT EXISTS compression_stats JSONB
      `);
      await client.query(`
        ALTER TABLE session_registry
          ADD COLUMN IF NOT EXISTS compression_events INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS tokens_reclaimed INTEGER DEFAULT 0
      `);
      await client.query(`INSERT INTO schema_migrations (id) VALUES ('acx_v2')`);
      console.log('[migrate-acx-v3] acx_v2 applied inline');
    }

    // ── Idempotency check for acx_v3 ─────────────────────────────────────────
    const v3Check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'acx_v3'`
    );
    if (v3Check.rowCount && v3Check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── bridge_dispatch_log: context_stats ────────────────────────────────────
    await client.query(`
      ALTER TABLE bridge_dispatch_log
        ADD COLUMN IF NOT EXISTS context_stats JSONB
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('acx_v3')`);
    await client.query('COMMIT');
    console.log('[migrate-acx-v3] acx_v3 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
