/**
 * migrate-recall-doc-chunks-v1.ts — Recall Q&A schema (P1 of doc-QA build)
 *
 * Reads backend/src/db/migrations/050-recall-doc-chunks.sql and executes it
 * inside the standard schema_migrations guard. The SQL creates two tables:
 *
 *   recall_doc_sources — one row per ingested document, keyed by
 *                        UNIQUE (project, source_id). Idempotent re-ingest.
 *   recall_doc_chunks  — chunked text with tsvector + trigram GIN indexes for
 *                        FTS retrieval. nullable vector(1536) reserved for
 *                        future OpenAI text-embedding-3-small backfill.
 *
 * Why a TS shim around a .sql file: same convention as
 * migrate-directives-scope-idx-v1.ts (Phase 49 LRN-03). Single source of
 * truth on disk, guard + stamp here.
 *
 * Idempotent: schema_migrations.id='recall_doc_chunks_v1' guard +
 * CREATE TABLE/INDEX IF NOT EXISTS in the SQL = double-safe on re-run.
 *
 * Dependency order: runs after migrateMultiSiloV1 (no relationship, but
 * keeps migration timeline monotonic). No FK to existing tables.
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function migrateRecallDocChunksV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'recall_doc_chunks_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    const sqlPath = path.join(__dirname, 'migrations', '050-recall-doc-chunks.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await client.query(sql);
    console.log('[migrate-recall-doc-chunks-v1] recall_doc_sources + recall_doc_chunks ready');

    await client.query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ('recall_doc_chunks_v1', EXTRACT(EPOCH FROM NOW()))`,
    );

    await client.query('COMMIT');
    console.log('[migrate-recall-doc-chunks-v1] complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
