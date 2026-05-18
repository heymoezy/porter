-- Migration 050: Recall document-Q&A storage (chunks + sources)
-- Porter Recall pillar — cross-project document retrieval, first consumer is Tom (YMC).
--
-- Design notes:
--   * `recall_doc_sources` keeps one row per ingested document, keyed by the
--     caller's canonical id pair (project, source_id). YMC passes
--     documents.id (UUID) as source_id; future consumers use whatever
--     they hold. The unique (project, source_id) makes re-ingest idempotent
--     (P2 replaces chunks transactionally on a second call).
--   * `recall_doc_chunks` holds the searchable text. Retrieval = Postgres
--     full-text search (`tsv` GIN) plus trigram fallback (`text_trgm` GIN)
--     for typo / partial-word queries. pg_trgm is already enabled (verified
--     pg_extension at migration time, version 1.6).
--   * `embedding vector(1536)` is reserved for OpenAI text-embedding-3-small
--     once a paid key is wired. Today it stays NULL; retrieval works without
--     it via FTS. Adding the column up front avoids a follow-up ALTER on a
--     potentially large table later. pgvector 0.6.0 is already installed.
--   * No HNSW index on embedding yet — only matters once we backfill. Add
--     in a later migration when the embedding column has data.
--   * `page` is nullable: YMC's existing `documents.extracted_text` is a
--     flat blob without page boundaries, so v1 ingest passes NULL. A future
--     re-parse pass can populate it for citation precision.
--
-- Companion TS runner: backend/src/db/migrate-recall-doc-chunks-v1.ts
-- (registered in backend/src/index.ts after migrateMultiSiloV1).
--
-- Rollback (manual):
--   DROP TABLE IF EXISTS recall_doc_chunks;
--   DROP TABLE IF EXISTS recall_doc_sources;
--   DELETE FROM schema_migrations WHERE id = 'recall_doc_chunks_v1';

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS recall_doc_sources (
  id          BIGSERIAL PRIMARY KEY,
  project     TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  title       TEXT,
  mime        TEXT,
  sha256      TEXT,
  text_chars  INTEGER NOT NULL DEFAULT 0,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project, source_id)
);

CREATE INDEX IF NOT EXISTS idx_recall_doc_sources_project
  ON recall_doc_sources (project);

CREATE TABLE IF NOT EXISTS recall_doc_chunks (
  id          BIGSERIAL PRIMARY KEY,
  source_pk   BIGINT NOT NULL REFERENCES recall_doc_sources(id) ON DELETE CASCADE,
  chunk_idx   INTEGER NOT NULL,
  text        TEXT NOT NULL,
  tsv         TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
  page        INTEGER,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding   vector(1536),
  UNIQUE (source_pk, chunk_idx)
);

CREATE INDEX IF NOT EXISTS idx_recall_doc_chunks_source_pk
  ON recall_doc_chunks (source_pk);

CREATE INDEX IF NOT EXISTS idx_recall_doc_chunks_tsv
  ON recall_doc_chunks USING gin (tsv);

CREATE INDEX IF NOT EXISTS idx_recall_doc_chunks_text_trgm
  ON recall_doc_chunks USING gin (text gin_trgm_ops);
