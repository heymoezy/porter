/**
 * migrate-directives-scope-idx-v1.ts — Phase 49 LRN-03 partial-index forward-investment
 *
 * Reads backend/src/db/migrations/049-directives-scope-index.sql (single SQL
 * artifact named per the 49-03 plan must_haves) and executes it. The SQL adds
 *
 *   CREATE INDEX IF NOT EXISTS idx_directives_scope_scope_id_status
 *     ON directives (scope, scope_id, status)
 *     WHERE status = 'active';
 *
 * Why a TS shim around a .sql file:
 *   - Porter's migration convention is TS modules registered in index.ts
 *     (migrateSilosV1, migrateDreamsV1, etc.) — there's no autoloading
 *     filename-prefix runner.
 *   - The 49-03 plan locks the .sql file location + verbatim contents for
 *     audit/rollback clarity. This shim is the bridge: it reads the .sql
 *     once at boot and executes it inside the usual schema_migrations guard.
 *
 * Idempotent: schema_migrations.id='directives_scope_idx_v1' guard plus
 * CREATE INDEX IF NOT EXISTS inside the SQL itself = double-safe on re-run.
 *
 * Dependency order: runs after migrateDreamsV1 (which itself runs after
 * migrateSilosV1 + migrateTranscriptsV1). The directives table predates all
 * of these; this migration only adds an index, no schema changes.
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function migrateDirectivesScopeIdxV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'directives_scope_idx_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // Read the canonical SQL artifact. The .sql file is the single source of
    // truth (committed alongside this TS shim per the 49-03 plan). __dirname
    // points at backend/src/db (compiled output preserves the relative path).
    const sqlPath = path.join(__dirname, 'migrations', '049-directives-scope-index.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await client.query(sql);
    console.log('[migrate-directives-scope-idx-v1] partial index idx_directives_scope_scope_id_status ready');

    await client.query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ('directives_scope_idx_v1', EXTRACT(EPOCH FROM NOW()))`,
    );

    await client.query('COMMIT');
    console.log('[migrate-directives-scope-idx-v1] complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
