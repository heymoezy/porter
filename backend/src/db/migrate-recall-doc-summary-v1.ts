/**
 * migrate-recall-doc-summary-v1.ts — Recall doc-summary cache columns
 *
 * Adds summary/summary_at/summary_model to recall_doc_sources so the
 * /v1/recall/docs/summarize endpoint can cache structured LLM extraction
 * per source and avoid re-spending codex tokens on repeat asks.
 *
 * Idempotent: schema_migrations.id='recall_doc_summary_v1' guard +
 * ALTER TABLE ADD COLUMN IF NOT EXISTS in the SQL.
 *
 * Dependency: runs after migrateRecallDocChunksV1 (needs the table).
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function migrateRecallDocSummaryV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'recall_doc_summary_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    const sqlPath = path.join(__dirname, 'migrations', '051-recall-doc-summary.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await client.query(sql);
    console.log('[migrate-recall-doc-summary-v1] summary columns ready on recall_doc_sources');

    await client.query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ('recall_doc_summary_v1', EXTRACT(EPOCH FROM NOW()))`,
    );

    await client.query('COMMIT');
    console.log('[migrate-recall-doc-summary-v1] complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
