/**
 * migrate-multi-silo-v1.ts — Phase 50 Multi-Silo Foundation
 *
 * Idempotent migration for the multi-silo seed work. Single all-or-nothing
 * transaction. If any step fails, the entire migration rolls back.
 *
 * Plan 50-01 (this plan):
 *   - DELETE legacy workflow row 'Software dream — weekly consolidation'.
 *     The per-silo cadence tick in scheduler.ts (runSiloCadenceCheck) replaces
 *     it. Keeping both would race; the skip-recent guard would dedup but logs
 *     get noisy. Single source of truth = silos.cadence_seconds.
 *   - INSERT schema_migrations row 'multi_silo_v1' as the final statement.
 *
 * Plan 50-02 will add:
 *   - INSERT silos row id='admin'
 *   - INSERT 4 directives at scope='silo', scope_id='admin', source_type='moe-direct'
 *
 * Plan 50-03 will add:
 *   - INSERT silos row id='data-room'
 *   - INSERT 5 directives at scope='silo', scope_id='data-room', source_type='moe-direct'
 *
 * All silo + directive INSERTs use ON CONFLICT (id) DO NOTHING so partial
 * historical runs (smoke tests, ad-hoc inserts) are tolerated.
 *
 * Post-migration: backend/src/index.ts calls loadSiloCache(pool) AFTER this
 * migration, so the new silo rows are picked up by the silo-detector cache
 * without a service restart on the first boot after deployment.
 */

import pg from 'pg';

export async function migrateMultiSiloV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'multi_silo_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── PLAN 50-02: INSERT ADMIN SILO + DIRECTIVES HERE ──────────────────────
    // (Admin silos row INSERT ... ON CONFLICT DO NOTHING)
    // (Admin 4 directives INSERTs ... ON CONFLICT DO NOTHING)

    // ── PLAN 50-03: INSERT DATA-ROOM SILO + DIRECTIVES HERE ──────────────────
    // (Data-room silos row INSERT ... ON CONFLICT DO NOTHING)
    // (Data-room 5 directives INSERTs ... ON CONFLICT DO NOTHING)

    // ── DELETE legacy workflow row (per-silo cadence tick replaces it) ──────
    const deleteResult = await client.query(
      `DELETE FROM workflows WHERE name = 'Software dream — weekly consolidation'`,
    );
    console.log(
      `[migrate-multi-silo-v1] deleted ${deleteResult.rowCount ?? 0} legacy workflow row(s) (Software dream — weekly consolidation)`,
    );

    // ── Record migration ─────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ('multi_silo_v1', EXTRACT(EPOCH FROM NOW()))`,
    );

    await client.query('COMMIT');
    console.log('[migrate-multi-silo-v1] complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
