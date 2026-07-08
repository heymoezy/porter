/**
 * migrate-vault-record-links-v1.ts — vault association layer for NON-node app records.
 *
 * Adds `vault_record_links` (see schema.ts `vaultRecordLinks`). Apps push links
 * from a transient app record (source_table + source_id, e.g. a `tom_tasks` row
 * that should NOT become a first-class vault_node) to the vault_node it concerns.
 * Completing/dropping the source record flips `status` here; it never mutates the
 * vault fact graph (nodes/edges). Kept separate from vault_edges (node↔node only).
 *
 * Idempotent: schema_migrations.id guard + CREATE TABLE/INDEX IF NOT EXISTS.
 * Additive only — creates one new table, touches nothing existing.
 */
import pg from 'pg';

export async function migrateVaultRecordLinksV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'vault_record_links_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS vault_record_links (
        id           text PRIMARY KEY,
        app_scope    text NOT NULL,
        source_table text NOT NULL,
        source_id    text NOT NULL,
        to_node_id   text NOT NULL,
        kind         text NOT NULL,
        status       text NOT NULL DEFAULT 'open',
        confidence   double precision,
        metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at   double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at   double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      );
      CREATE INDEX IF NOT EXISTS vault_record_links_scope_node_idx
        ON vault_record_links (app_scope, to_node_id);
      CREATE INDEX IF NOT EXISTS vault_record_links_scope_source_idx
        ON vault_record_links (app_scope, source_table, source_id);
      CREATE UNIQUE INDEX IF NOT EXISTS vault_record_links_unique_idx
        ON vault_record_links (app_scope, source_table, source_id, to_node_id, kind);
    `);
    console.log('[migrate-vault-record-links-v1] vault_record_links ready');

    await client.query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ('vault_record_links_v1', EXTRACT(EPOCH FROM NOW()))`,
    );
    await client.query('COMMIT');
    console.log('[migrate-vault-record-links-v1] complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
