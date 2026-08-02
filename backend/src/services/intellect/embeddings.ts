/**
 * embeddings.ts — THE one place Porter turns text into a vector.
 *
 * R6. `scripts/measure-paraphrase-miss.ts`, re-measured 2026-08-02 over the 151
 * active concepts for agent:tom, AFTER the FTS AND-then-OR fix and after the
 * dream pipeline repair (v6.149.0) — because measuring recall against a corpus
 * produced by a 97%-failing pipeline would have measured the pipeline:
 *
 *     paraphrase misses, OR semantics:  4 / 8
 *     control misses (own words):       3 / 8
 *
 * "who should I ask about anti money laundering paperwork" returns nothing while
 * a concept about Clement and compliance/KYC sits in the table. Those strings
 * share no token, so no amount of stemming will ever join them. That is the
 * residual embeddings exist for, and it is why the gate reads open.
 *
 * ⚠️ LOCAL ONLY. nomic-embed-text on the ollama already running on this box.
 * Nothing embedded here leaves the machine — the same reasoning as Kokoro for
 * TTS, and the reason this is not a provider SDK call. There is no API key, no
 * vendor, and no egress. If ollama is down, this returns null and every caller
 * falls back to FTS.
 *
 * ⚠️ FAILING OPEN IS THE DESIGN, NOT A CONCESSION. Retrieval feeds a live reply
 * path. An embedding call that hangs must never hold up an answer, and a
 * concept with no embedding must still be findable — which is exactly why the
 * column is nullable and the index is partial. Semantic search is ADDITIVE to
 * FTS here; it never gates it.
 */
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.PORTER_EMBED_MODEL || 'nomic-embed-text';

/** 768 for nomic-embed-text. Pinned so a model swap fails loudly, not silently. */
export const EMBED_DIMS = 768;

/**
 * Budget for ONE embedding call.
 *
 * A query embedding sits directly in front of a reply. Nothing about being
 * slightly more relevant is worth making Tom look hung, so this is deliberately
 * tight: past it, we take FTS-only results and move on. Local CPU inference on
 * a short query is ~50-150ms, so this is many times headroom, not a squeeze.
 */
const TIMEOUT_MS = Number(process.env.PORTER_EMBED_TIMEOUT_MS || 2_000);

/** Backfill runs offline and can afford to wait for a long document. */
const BATCH_TIMEOUT_MS = 30_000;

async function call(input: string | string[], timeoutMs: number): Promise<number[][] | null> {
  try {
    const res = await fetch(`${OLLAMA}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = await res.json() as { embeddings?: number[][]; embedding?: number[] };
    // /api/embed returns `embeddings`; older /api/embeddings returned a bare
    // `embedding`. Accept both so a version bump does not silently return null.
    const out = body.embeddings ?? (body.embedding ? [body.embedding] : null);
    if (!out?.length) return null;
    // A wrong-width vector would be rejected by Postgres anyway, but as a
    // confusing insert error far from here rather than as "the model changed".
    if (out[0].length !== EMBED_DIMS) {
      console.warn(`[embeddings] ${MODEL} returned ${out[0].length} dims, expected ${EMBED_DIMS} — ignoring`);
      return null;
    }
    return out;
  } catch {
    return null; // down, slow, or unparseable — the caller uses FTS
  }
}

/** Embed one string. Returns null on any failure; callers must handle null. */
export async function embed(text: string): Promise<number[] | null> {
  const t = (text || '').trim();
  if (!t) return null;
  const out = await call(t, TIMEOUT_MS);
  return out?.[0] ?? null;
}

/** Embed many at once, for backfill. Same null-on-failure contract. */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const clean = texts.map((t) => (t || '').trim());
  if (!clean.some(Boolean)) return texts.map(() => null);
  const out = await call(clean, BATCH_TIMEOUT_MS);
  return out ? clean.map((_, i) => out[i] ?? null) : texts.map(() => null);
}

/** pgvector literal. Postgres wants '[1,2,3]', not a JS array or a JSON blob. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}
