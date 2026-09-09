/**
 * concept-retrieval.ts — THE one place Porter ranks concepts for a query.
 *
 * EXTRACTED from tier 6 of `memory-injection.ts` (v6.161.0). Not a rewrite: the
 * SQL, the AND-then-OR fallback, the vault boost and the RRF fusion are the same
 * code that has always served dispatch. Two deliberate differences:
 *
 *   1. `limit` is a parameter (default 10 — the value that was hardcoded in all
 *      three places), so the benchmark can sweep k.
 *   2. A failing FTS query now returns [] instead of throwing. Previously the
 *      throw unwound to the builder's outer catch, which returns '' — so ONE
 *      malformed search query dropped the ENTIRE memory context, directives and
 *      identity included, not just the concept tier. Tier 6 is the least
 *      important of the six and was taking the other five down with it. Now it
 *      fails alone and the rest of the payload still reaches the model.
 *
 * WHY IT MOVED
 * ------------
 * `services/membench/` needs to score Porter's retrieval. A benchmark that
 * re-implements the query it is measuring drifts from the real path within one
 * change and then reports on a fixture — which is worse than no benchmark,
 * because it reads as evidence. So the injector and the benchmark now call the
 * SAME function, and any change to ranking is measured by construction.
 *
 * This does NOT create a second injection builder. `memory-injection.ts` is
 * still the only thing that renders a payload; this is the ranking step it
 * already contained, given a name so a second reader can reach it. The rule from
 * CLAUDE.md — consume the shared function, do not write a fourth builder — is
 * the reason this is a function and not a copy.
 */
import { pool } from '../db/client.js';
import { VAULT_RANK_BOOST } from './intellect/vault-indexer.js';
import { embed, toVectorLiteral } from './intellect/embeddings.js';

export interface ConceptRow {
  id: string;
  content: string;
  confidence_score: number | null;
  source_type: string;
  source_url: string | null;
}

/** Default slot count. Was hardcoded as `LIMIT 10` / `.slice(0, 10)` in tier 6. */
export const DEFAULT_CONCEPT_LIMIT = 10;

/**
 * Rank active concepts against a free-text query, best first.
 *
 * Returns [] rather than throwing on a malformed query or a missing table —
 * retrieval sits in front of a live reply and must never be the reason one
 * fails. Callers treat an empty result as "nothing on file".
 */
export async function searchConcepts(
  searchQuery: string,
  limit: number = DEFAULT_CONCEPT_LIMIT,
): Promise<ConceptRow[]> {
  // ⚠️ AND-THEN-OR. `websearch_to_tsquery` ANDs unquoted terms, so a natural
  // question required EVERY word to appear in the concept and one absent
  // stem returned nothing at all. Measured over the 147 live concepts for
  // agent:tom (scripts/measure-paraphrase-miss.ts): with AND, **3 of 8
  // probes could not find a concept using that concept's OWN WORDS**, and
  // every paraphrase missed. With the same terms OR-ed, the control misses
  // go to ZERO and the paraphrase miss rate halves.
  //
  // RELEASE-SCHEDULE.md:16 specified FTS "(R1, OR)"; the shipped code was
  // AND, so R1's OR either never landed or regressed — and the residual it
  // caused was being attributed to "we need embeddings" (R6).
  //
  // AND first, because when every term IS present that is the precise
  // answer and should rank; OR only when AND finds nothing, so precision is
  // preserved and recall stops failing on its own words.
  const FTS = (op: 'and' | 'or') => `
     SELECT id, content, confidence_score, source_type, source_url
       FROM concepts${op === 'or' ? `, websearch_to_tsquery('english', $1) AS raw,
            to_tsquery('english', array_to_string(ARRAY(
              SELECT unnest(string_to_array(replace(raw::text, '''', ''), ' & '))), ' | ')) AS q` : ''}
      WHERE search_vector @@ ${op === 'or' ? 'q' : `websearch_to_tsquery('english', $1)`}
        AND status = 'active'
      ORDER BY ts_rank(search_vector, ${op === 'or' ? 'q' : `websearch_to_tsquery('english', $1)`})
               * CASE WHEN source_type = 'vault' THEN ${VAULT_RANK_BOOST} ELSE 1.0 END DESC
      LIMIT ${limit}`;

  let rows: ConceptRow[];
  try {
    const res = await pool.query<ConceptRow>(FTS('and'), [searchQuery]);
    rows = res.rows;
  } catch {
    return [];
  }

  if (rows.length === 0) {
    // Malformed input can make the OR rewrite unparseable — fail back to the
    // AND result (empty) rather than losing the whole injection.
    rows = await pool
      .query<ConceptRow>(FTS('or'), [searchQuery])
      .then((r) => r.rows)
      .catch(() => rows);
  }

  // ── R6: fuse in semantic neighbours ────────────────────────────────────
  //
  // FTS cannot join "who should I ask about anti money laundering paperwork"
  // to a concept about compliance/KYC — the two share no token, so stemming
  // has nothing to work with. Re-measured 2026-08-02 over 151 concepts after
  // the AND-then-OR fix: still 4/8 paraphrase misses. That residual is what
  // this closes.
  //
  // ⚠️ ADDITIVE, NEVER GATING. If ollama is down or slow, `embed()` returns
  // null in ≤2s and this whole block is skipped — FTS results stand exactly
  // as they are. A concept with no embedding is likewise still found by FTS,
  // which is why the column is nullable and the index partial. Retrieval
  // sits in front of a live reply; it may improve an answer, never delay one.
  //
  // ⚠️ RECIPROCAL RANK FUSION, not score blending. A ts_rank and a cosine
  // distance are different units on different scales with no meaningful
  // conversion — any weighted sum of the two is a made-up number that looks
  // principled. RRF throws the scores away and uses only each ranker's
  // ORDERING, which is the part both agree on the meaning of. k=60 is the
  // standard constant: large enough that rank 1 does not dominate outright,
  // small enough that the tail still separates.
  const qVec = await embed(searchQuery);
  if (qVec) {
    const ann = await pool
      .query<ConceptRow>(
        `SELECT id, content, confidence_score, source_type, source_url
           FROM concepts
          WHERE status = 'active' AND embedding IS NOT NULL
          ORDER BY (embedding <=> $1::vector)
                   -- Same vault preference the FTS ranker applies, expressed
                   -- as distance: nearer is better, so vault rows are scaled
                   -- DOWN rather than up.
                   * CASE WHEN source_type = 'vault' THEN ${1 / VAULT_RANK_BOOST} ELSE 1.0 END
          LIMIT ${limit}`,
        [toVectorLiteral(qVec)],
      )
      .catch(() => null);

    if (ann && ann.rows.length > 0) {
      const K = 60;
      const scores = new Map<string, number>();
      const byId = new Map<string, ConceptRow>();
      for (const [rank, row] of rows.entries()) {
        scores.set(row.id, (scores.get(row.id) ?? 0) + 1 / (K + rank + 1));
        byId.set(row.id, row);
      }
      for (const [rank, row] of ann.rows.entries()) {
        scores.set(row.id, (scores.get(row.id) ?? 0) + 1 / (K + rank + 1));
        if (!byId.has(row.id)) byId.set(row.id, row);
      }
      // A row both rankers found accumulates from both and rises — which is
      // the whole point of fusing rather than concatenating.
      const fused = [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => byId.get(id)!)
        .filter(Boolean);
      if (fused.length > 0) rows = fused;
    }
  }

  return rows;
}
