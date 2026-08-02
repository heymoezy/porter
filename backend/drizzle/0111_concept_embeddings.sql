-- 0111_concept_embeddings.sql — R6: semantic recall for concepts.
--
-- WHY. `scripts/measure-paraphrase-miss.ts`, re-run on 2026-08-02 against the
-- 151 active concepts for agent:tom AFTER the FTS AND-then-OR fix and after the
-- dream pipeline was repaired (v6.149.0):
--
--     control misses (a concept cannot be found by its OWN WORDS):  3 / 8
--     paraphrase misses (AND semantics):                            5 / 5 testable
--     paraphrase misses (OR semantics):                             4 / 8
--
-- The cheap fix took paraphrase misses from 8/8 to 4/8 and was worth doing
-- first. The residual is still half, and it is the half that matters: "who
-- should I ask about anti money laundering paperwork" returns NOTHING while a
-- concept about Clement and KYC sits in the table. No amount of stemming
-- connects "anti money laundering paperwork" to "compliance/KYC" — they share
-- no token. That is what an embedding is for.
--
-- nomic-embed-text, 768 dims, served by the LOCAL ollama already on this box.
-- Nothing leaves the machine — same reasoning as Kokoro for TTS.
--
-- HNSW, not IVFFlat: IVFFlat needs a representative sample to build its lists
-- and degrades badly when the table is small or grows a lot after the build.
-- 151 rows is small and this table grows nightly. HNSW has no such training
-- step. vector_cosine_ops because nomic embeddings are direction-normalised —
-- magnitude carries no meaning here.
--
-- NULLABLE and no backfill in this migration: a concept without an embedding
-- must still be retrievable by FTS, which is the whole fail-open design. The
-- backfill is a separate, re-runnable script.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE concepts ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Partial index: only rows that HAVE an embedding. Keeps the index off the
-- un-embedded tail during backfill and after every nightly insert.
CREATE INDEX IF NOT EXISTS idx_concepts_embedding_hnsw
  ON concepts USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN concepts.embedding IS
  'nomic-embed-text 768-dim, local ollama. NULL = not embedded yet; such a row is still found by FTS. Written by scripts/backfill-concept-embeddings.ts and on insert.';
