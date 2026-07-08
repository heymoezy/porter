/**
 * migrate-vault-artifact-locations-v1.ts — physical locations of deduped docs.
 *
 * Adds `vault_artifact_locations` (see schema.ts `vaultArtifactLocations`) for
 * the Porter Files directory (Moe 2026-07-08: "all documents ... visible in
 * porter files directory ... perfect sync completely deduped"). ONE
 * vault_nodes(type=document) per (app_scope, content_hash); the same content in
 * N filesystem places is N rows here. `present`/`missing_since` let a reconcile
 * pass deactivate vanished paths without deleting the content node.
 *
 * Idempotent: schema_migrations.id guard + CREATE TABLE/INDEX IF NOT EXISTS.
 * Additive only — creates one new table, touches nothing existing.
 */
import pg from 'pg';

export async function migrateVaultArtifactLocationsV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'vault_artifact_locations_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS vault_artifact_locations (
        id                     text PRIMARY KEY,
        app_scope              text NOT NULL,
        document_node_id       text NOT NULL,
        artifact_id            text,
        content_hash           text NOT NULL,
        absolute_path          text NOT NULL,
        relative_path          text,
        basename               text,
        project_node_id        text,
        documents_root_node_id text,
        folder_node_id         text,
        size_bytes             double precision,
        mtime_ns               text,
        dev                    text,
        inode                  text,
        present                boolean NOT NULL DEFAULT true,
        missing_since          double precision,
        scan_id                text,
        first_seen_at          double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        last_seen_at           double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      );
      CREATE INDEX IF NOT EXISTS vault_artifact_locations_scope_hash_idx
        ON vault_artifact_locations (app_scope, content_hash);
      CREATE INDEX IF NOT EXISTS vault_artifact_locations_scope_node_idx
        ON vault_artifact_locations (app_scope, document_node_id);
      CREATE UNIQUE INDEX IF NOT EXISTS vault_artifact_locations_unique_path_idx
        ON vault_artifact_locations (app_scope, absolute_path);
    `);
    console.log('[migrate-vault-artifact-locations-v1] vault_artifact_locations ready');

    await client.query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ('vault_artifact_locations_v1', EXTRACT(EPOCH FROM NOW()))`,
    );
    await client.query('COMMIT');
    console.log('[migrate-vault-artifact-locations-v1] complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
