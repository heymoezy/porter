import pg from 'pg';

/**
 * R8 Tools-Registry v1 — extend environment_tools into a canonical tools
 * registry so every session/agent can find a tool (and its exact path/version)
 * instead of `which`-ing its own PATH, missing it, and reinstalling elsewhere.
 *
 * Additive only: new nullable columns with defaults. Existing rows keep working.
 *
 *   kind           binary | npm | browser | service
 *   canonical_path absolute path to the primary executable/dir (real, detected)
 *   alt_paths      JSON array (string) of other real locations found (drift)
 *   how_detected   which | cache-scan | npx | probe
 *   install_recipe how to install if missing (no-sudo aware)
 *   status         present | missing | drift  (richer than health)
 */
export async function migrateTrgV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = '051_tools_registry_v1'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      ALTER TABLE environment_tools
        ADD COLUMN IF NOT EXISTS kind           TEXT DEFAULT 'binary',
        ADD COLUMN IF NOT EXISTS canonical_path TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS alt_paths      TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS how_detected   TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS install_recipe TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS status         TEXT DEFAULT ''
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('051_tools_registry_v1')`);
    await client.query('COMMIT');
    console.log('[migrate-trg] tools_registry_v1 applied: environment_tools kind/canonical_path/alt_paths/how_detected/install_recipe/status columns added');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
