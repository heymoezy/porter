/**
 * recall-ingest.ts -- Porter Recall doc-Q&A Phase 2: pure ingest service.
 *
 * Stores pre-extracted document text into recall_doc_sources + recall_doc_chunks
 * (migration 050). Idempotent on (project, source_id): re-ingesting the same
 * canonical doc replaces all of its chunks atomically inside a single
 * transaction.
 *
 * Chunking strategy: ~3,200 chars per chunk (≈800 tokens), ~400 char overlap
 * (≈100 tokens). Sentence-aware packing first; pathological single-sentence
 * inputs hard-split at whitespace near the limit. All chunks are capped at
 * 4,000 chars as a final safety guard.
 *
 * Retrieval (FTS via tsvector + pg_trgm) and synthesis (codex CLI through the
 * Bridge) are handled in later phases. This module writes only.
 *
 * No embedding work here — the `embedding vector(1536)` column stays NULL
 * until a paid OpenAI key is wired in a later phase.
 */

import type pg from 'pg';

// -- Public types ------------------------------------------------------------

export interface IngestInput {
  project: string;
  source_id: string;
  title?: string;
  text: string;
  mime?: string;
  sha256?: string;
  metadata?: Record<string, unknown>;
}

export interface IngestResult {
  source_pk: number;
  chunks_written: number;
  replaced: boolean;
}

// -- Chunking tunables -------------------------------------------------------

const CHUNK_TARGET_CHARS = 3200; // ~800 tokens
const CHUNK_OVERLAP_CHARS = 400; // ~100 tokens
const CHUNK_HARD_CAP_CHARS = 4000; // safety against pathological inputs

// -- Helpers -----------------------------------------------------------------

/** Collapse runs of whitespace (incl. newlines) to single spaces, trim ends. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Split into sentence-ish pieces. Conservative regex: end-of-sentence
 * punctuation followed by whitespace. Keeps the punctuation glued to the
 * preceding sentence. Falls back to the whole string if no boundary is found.
 */
function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.filter((p) => p.length > 0);
}

/**
 * Hard-split an over-long sentence at the nearest whitespace boundary
 * <= CHUNK_TARGET_CHARS from the start. If no whitespace exists in that
 * window, slice at exactly CHUNK_TARGET_CHARS.
 */
function hardSplit(sentence: string): string[] {
  const out: string[] = [];
  let rest = sentence;
  while (rest.length > CHUNK_TARGET_CHARS) {
    const window = rest.slice(0, CHUNK_TARGET_CHARS);
    const lastWs = window.lastIndexOf(' ');
    const cut = lastWs > CHUNK_TARGET_CHARS * 0.5 ? lastWs : CHUNK_TARGET_CHARS;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

/**
 * Pack sentences into chunks of up to CHUNK_TARGET_CHARS. Each new chunk
 * is prefixed with the last CHUNK_OVERLAP_CHARS of the previous chunk so
 * context survives boundary cuts. Final hard cap at CHUNK_HARD_CAP_CHARS.
 */
export function chunkText(rawText: string): string[] {
  const normalized = normalizeWhitespace(rawText);
  if (normalized.length === 0) return [];

  // Expand any monstrous single-sentence inputs first.
  const sentences: string[] = [];
  for (const s of splitSentences(normalized)) {
    if (s.length > CHUNK_TARGET_CHARS) {
      sentences.push(...hardSplit(s));
    } else {
      sentences.push(s);
    }
  }

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    // Would adding this sentence exceed the target? Flush first.
    const separator = current.length > 0 ? ' ' : '';
    if (current.length + separator.length + sentence.length > CHUNK_TARGET_CHARS && current.length > 0) {
      chunks.push(current);
      // Seed next chunk with overlap tail of the one we just flushed.
      const overlap = current.slice(-CHUNK_OVERLAP_CHARS);
      current = overlap + ' ' + sentence;
    } else {
      current = current + separator + sentence;
    }
  }

  if (current.length > 0) chunks.push(current);

  // Final safety cap — slice anything still over the hard limit.
  const safe: string[] = [];
  for (const c of chunks) {
    if (c.length <= CHUNK_HARD_CAP_CHARS) {
      safe.push(c);
    } else {
      // Defensive: split at hard cap with no overlap (already exceeded budget).
      let rest = c;
      while (rest.length > CHUNK_HARD_CAP_CHARS) {
        const window = rest.slice(0, CHUNK_HARD_CAP_CHARS);
        const lastWs = window.lastIndexOf(' ');
        const cut = lastWs > CHUNK_HARD_CAP_CHARS * 0.5 ? lastWs : CHUNK_HARD_CAP_CHARS;
        safe.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest.length > 0) safe.push(rest);
    }
  }

  return safe;
}

// -- Main entry point --------------------------------------------------------

export async function ingestDoc(
  pool: pg.Pool,
  input: IngestInput,
): Promise<IngestResult> {
  if (!input || typeof input.text !== 'string' || input.text.trim().length === 0) {
    throw new Error('recall-ingest: empty text');
  }
  if (!input.project || !input.source_id) {
    throw new Error('recall-ingest: project and source_id are required');
  }

  const chunks = chunkText(input.text);
  if (chunks.length === 0) {
    // After normalization the text vanished (e.g. only whitespace). Treat as empty.
    throw new Error('recall-ingest: empty text');
  }

  const textChars = input.text.length;
  const metadataJson = JSON.stringify(input.metadata ?? {});

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert the source row. Detect replacement by checking if the row existed
    // before the upsert (xmax != 0 trick is fragile across PG versions, so use
    // an explicit SELECT-then-INSERT-OR-UPDATE).
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM recall_doc_sources WHERE project = $1 AND source_id = $2`,
      [input.project, input.source_id],
    );

    let sourcePk: number;
    let replaced: boolean;

    if (existing.rowCount && existing.rowCount > 0) {
      replaced = true;
      sourcePk = Number(existing.rows[0].id);
      await client.query(
        `UPDATE recall_doc_sources
            SET title = $1,
                mime = $2,
                sha256 = $3,
                text_chars = $4,
                metadata = $5::jsonb,
                updated_at = NOW()
          WHERE id = $6`,
        [
          input.title ?? null,
          input.mime ?? null,
          input.sha256 ?? null,
          textChars,
          metadataJson,
          sourcePk,
        ],
      );
      // Explicit delete (spec calls for it — CASCADE only fires on parent DELETE,
      // not UPDATE).
      await client.query(
        `DELETE FROM recall_doc_chunks WHERE source_pk = $1`,
        [sourcePk],
      );
    } else {
      replaced = false;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO recall_doc_sources
           (project, source_id, title, mime, sha256, text_chars, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING id`,
        [
          input.project,
          input.source_id,
          input.title ?? null,
          input.mime ?? null,
          input.sha256 ?? null,
          textChars,
          metadataJson,
        ],
      );
      sourcePk = Number(inserted.rows[0].id);
    }

    // Bulk insert chunks in a single statement.
    // Each row contributes 4 params: source_pk, chunk_idx, text, metadata.
    const values: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (let i = 0; i < chunks.length; i++) {
      values.push(`($${p}, $${p + 1}, $${p + 2}, $${p + 3}::jsonb)`);
      params.push(sourcePk, i, chunks[i], '{}');
      p += 4;
    }
    await client.query(
      `INSERT INTO recall_doc_chunks (source_pk, chunk_idx, text, metadata)
       VALUES ${values.join(', ')}`,
      params,
    );

    await client.query('COMMIT');

    return {
      source_pk: sourcePk,
      chunks_written: chunks.length,
      replaced,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Swallow rollback errors — original error is what matters.
    }
    throw err;
  } finally {
    client.release();
  }
}
