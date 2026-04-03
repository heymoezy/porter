/**
 * migrate-acx-v2.ts — Compression tracking columns for Phase 38 Plan 02
 *
 * Adds:
 *   bridge_dispatch_log.compression_stats JSONB — tool output compression metadata
 *   session_registry.compression_events INTEGER — count of compression events
 *   session_registry.tokens_reclaimed INTEGER — total tokens recovered via compression
 */

import pg from 'pg';

export async function migrateAcxV2(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'acx_v2'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── bridge_dispatch_log: compression_stats ────────────────────────────────
    // Shape: { tool_outputs_compressed: number, tokens_saved: number, compression_model: string }
    await client.query(`
      ALTER TABLE bridge_dispatch_log
        ADD COLUMN IF NOT EXISTS compression_stats JSONB
    `);

    // ── session_registry: compression tracking columns ───────────────────────
    await client.query(`
      ALTER TABLE session_registry
        ADD COLUMN IF NOT EXISTS compression_events INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tokens_reclaimed INTEGER DEFAULT 0
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('acx_v2')`);
    await client.query('COMMIT');
    console.log('[migrate-acx-v2] acx_v2 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
