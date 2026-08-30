/**
 * recall-query.ts -- Porter Recall doc-Q&A Phase 3: retrieve + synthesise.
 *
 * Given a project-scoped question:
 *   1. Tries Postgres FTS (plainto_tsquery + ts_rank_cd + ts_headline).
 *   2. Falls back to pg_trgm similarity when the tsquery is empty or returns
 *      zero matches (handles typos, partial words, pure stop-words).
 *   3. Returns "Nothing on file." without calling the model when both
 *      retrieval paths produce zero chunks.
 *   4. Otherwise dispatches a synthesis prompt to codex_cli through Porter's
 *      in-process Bridge routing engine and returns {answer, citations}.
 *
 * Synthesis is grounded with active data-room silo directives so Tom's Dream
 * Silo enhances every Porter Recall answer. Citation list mirrors the chunks
 * the model saw, in retrieval order.
 */

import type pg from 'pg';
import { routingEngine } from './bridge/routing-engine.js';
import type { RoutingContext, BridgeDispatchRequest } from './bridge/types.js';

// -- Public types ------------------------------------------------------------

export interface QueryInput {
  project: string;
  question: string;
  filters?: {
    source_ids?: string[];
  };
  k?: number;
}

export interface Citation {
  source_id: string;
  title: string | null;
  chunk_idx: number;
  snippet: string;
  score: number;
}

export interface QueryResult {
  answer: string;
  citations: Citation[];
  chunks_considered: number;
  latencyMs: number;
  /**
   * Which retrieval step produced the chunks: 'fts' (all terms present),
   * 'fts_or' (any term), 'trgm' (fuzzy), or 'none'. Reported so the value of
   * the OR step is MEASURED rather than assumed — that number is the input to
   * the decision about whether this corpus ever needs embeddings.
   */
  retrieved_by: RetrievalStep;
}

export type RetrievalStep = 'fts' | 'fts_or' | 'trgm' | 'none';

// -- Internal row shapes -----------------------------------------------------

interface RetrievedChunk {
  source_id: string;
  title: string | null;
  chunk_idx: number;
  text: string;
  snippet: string;
  score: number;
}

// -- Tunables ----------------------------------------------------------------

const DEFAULT_K = 6;
const MIN_K = 1;
const MAX_K = 20;
const SNIPPET_FALLBACK_CHARS = 280;
const DIRECTIVE_LIMIT = 20;

// -- Retrieval ---------------------------------------------------------------

async function retrieveChunks(
  pool: pg.Pool,
  project: string,
  question: string,
  k: number,
  sourceIds: string[] | undefined,
): Promise<{ rows: RetrievedChunk[]; retrievedBy: RetrievalStep }> {
  const hasFilter = Array.isArray(sourceIds) && sourceIds.length > 0;

  // 1) Check tsquery non-empty — pure stop-words yield ''::tsquery
  const tsqCheck = await pool.query<{ empty: boolean }>(
    `SELECT plainto_tsquery('english', $1)::text = '' AS empty`,
    [question],
  );
  const tsqEmpty = tsqCheck.rows[0]?.empty === true;

  let rows: RetrievedChunk[] = [];
  let retrievedBy: RetrievalStep = 'none';

  if (!tsqEmpty) {
    // Primary: FTS rank
    const params: unknown[] = [question, project, k];
    let filterClause = '';
    if (hasFilter) {
      params.push(sourceIds);
      filterClause = `AND s.source_id = ANY($4::text[])`;
    }

    const sql = `
      WITH q AS (SELECT plainto_tsquery('english', $1) AS tsq)
      SELECT
        s.source_id          AS source_id,
        s.title              AS title,
        c.chunk_idx          AS chunk_idx,
        c.text               AS text,
        ts_rank_cd(c.tsv, q.tsq) AS score,
        ts_headline('english', c.text, q.tsq,
          'StartSel=«,StopSel=»,MaxFragments=2,MaxWords=24,MinWords=8') AS snippet
      FROM recall_doc_chunks c
      JOIN recall_doc_sources s ON s.id = c.source_pk
      CROSS JOIN q
      WHERE s.project = $2
        AND c.tsv @@ q.tsq
        ${filterClause}
      ORDER BY score DESC
      LIMIT $3
    `;

    const res = await pool.query<RetrievedChunk>(sql, params);
    rows = res.rows.map((r) => ({
      ...r,
      score: Number(r.score),
    }));
    if (rows.length > 0) retrievedBy = 'fts';
  }

  if (rows.length === 0) {
    // ── ANY term, not EVERY term ──────────────────────────────────────────
    //
    // ⚠️ `plainto_tsquery` ANDs every content word, so a natural question had
    // to have ALL of its terms inside ONE 3,200-char chunk or it matched
    // nothing — and the trigram fallback below cannot save it, because it
    // compares a 3,200-char chunk against a short question at the default
    // similarity threshold of 0.3 and effectively never fires. So Tom was
    // being told "Nothing on file." about documents this corpus answers well.
    //
    // Measured on the live ymc.capital store (941 sources, 5,965 chunks):
    //   plainto_tsquery('what is the current status of the share transfer
    //   dispute')                                            →     0 chunks
    //   the same question as OR-of-lexemes                    → 3,426 chunks
    // and the top 6 by ts_rank_cd were the three Registers of Members. So
    // breadth in the candidate set does not become noise in the result:
    // ts_rank_cd rewards chunks covering MORE of the query's lexemes, which is
    // exactly the ranking this needs.
    //
    // AND stays first because it is the precise answer when it works — this
    // only runs when it returned nothing at all.
    //
    // Lexemes come back from to_tsvector already normalised and are
    // quote_literal'd before being joined, so no part of the user's question
    // reaches to_tsquery as syntax. A question of pure stop-words yields NULL
    // here, and `tsv @@ NULL` is NULL, so it simply matches nothing.
    const params: unknown[] = [question, project, k];
    let filterClause = '';
    if (hasFilter) {
      params.push(sourceIds);
      filterClause = `AND s.source_id = ANY($4::text[])`;
    }

    const sql = `
      WITH q AS (
        SELECT to_tsquery('english', (
          SELECT string_agg(quote_literal(lexeme), ' | ')
            FROM (SELECT DISTINCT lexeme FROM unnest(to_tsvector('english', $1))) w
        )) AS tsq
      )
      SELECT
        s.source_id          AS source_id,
        s.title              AS title,
        c.chunk_idx          AS chunk_idx,
        c.text               AS text,
        ts_rank_cd(c.tsv, q.tsq) AS score,
        ts_headline('english', c.text, q.tsq,
          'StartSel=«,StopSel=»,MaxFragments=2,MaxWords=24,MinWords=8') AS snippet
      FROM recall_doc_chunks c
      JOIN recall_doc_sources s ON s.id = c.source_pk
      CROSS JOIN q
      WHERE s.project = $2
        AND q.tsq IS NOT NULL
        AND c.tsv @@ q.tsq
        ${filterClause}
      ORDER BY score DESC
      LIMIT $3
    `;
    const res = await pool.query<RetrievedChunk>(sql, params);
    rows = res.rows.map((r) => ({ ...r, score: Number(r.score) }));
    if (rows.length > 0) retrievedBy = 'fts_or';
  }

  if (rows.length === 0) {
    // Fallback: pg_trgm similarity
    const params: unknown[] = [question, project, k];
    let filterClause = '';
    if (hasFilter) {
      params.push(sourceIds);
      filterClause = `AND s.source_id = ANY($4::text[])`;
    }

    const sql = `
      SELECT
        s.source_id          AS source_id,
        s.title              AS title,
        c.chunk_idx          AS chunk_idx,
        c.text               AS text,
        similarity(c.text, $1) AS score,
        ''::text             AS snippet
      FROM recall_doc_chunks c
      JOIN recall_doc_sources s ON s.id = c.source_pk
      WHERE s.project = $2
        AND c.text % $1
        ${filterClause}
      ORDER BY score DESC
      LIMIT $3
    `;
    const res = await pool.query<RetrievedChunk>(sql, params);
    rows = res.rows.map((r) => ({
      ...r,
      score: Number(r.score),
      snippet: r.text.slice(0, SNIPPET_FALLBACK_CHARS),
    }));
    if (rows.length > 0) retrievedBy = 'trgm';
  }

  // Ensure snippet always populated (ts_headline can return '' for short text)
  for (const r of rows) {
    if (!r.snippet || r.snippet.length === 0) {
      r.snippet = r.text.slice(0, SNIPPET_FALLBACK_CHARS);
    }
  }

  return { rows, retrievedBy };
}

// -- Directives (Tom's data-room silo) ---------------------------------------

async function loadDataRoomDirectives(pool: pg.Pool): Promise<string[]> {
  try {
    const res = await pool.query<{ content: string }>(
      `SELECT content FROM directives
       WHERE scope = 'silo' AND scope_id = 'data-room' AND status = 'active'
       ORDER BY priority DESC NULLS LAST
       LIMIT $1`,
      [DIRECTIVE_LIMIT],
    );
    return res.rows.map((r) => r.content).filter((c) => typeof c === 'string' && c.trim().length > 0);
  } catch (e) {
    // Cold / missing table — proceed without.
    // eslint-disable-next-line no-console
    console.warn('[recall-query] data-room directives unavailable:', (e as Error)?.message);
    return [];
  }
}

// -- Prompt builders ---------------------------------------------------------

function buildSystemPrompt(directives: string[]): string {
  const head =
    'You answer questions about documents stored in Porter Recall. ' +
    'Be concise — 1–3 sentences. Cite by document title (or source_id when title missing). ' +
    "If the chunks don't contain the answer, say \"The retrieved chunks don't say.\"";

  const tail =
    'Hard rule: Never invent facts. Only use information from the chunks below.';

  if (directives.length === 0) return `${head}\n\n${tail}`;

  const rules = directives.map((d) => `- ${d.trim()}`).join('\n');
  return `${head}\n\n# Operating rules\n${rules}\n\n${tail}`;
}

function buildUserPrompt(question: string, chunks: RetrievedChunk[]): string {
  const blocks = chunks
    .map((c, i) => {
      const label = c.title && c.title.trim().length > 0 ? c.title : c.source_id;
      return `[${i + 1}] ${label} (chunk #${c.chunk_idx}):\n${c.text}`;
    })
    .join('\n\n');

  return (
    `QUESTION: ${question}\n\n` +
    `CHUNKS (most relevant first):\n${blocks}\n\n` +
    `Answer the question using ONLY the chunks above. Cite the chunks you used by their bracketed number.`
  );
}

// -- Main entry point --------------------------------------------------------

export async function queryDocs(
  pool: pg.Pool,
  input: QueryInput,
): Promise<QueryResult> {
  const started = Date.now();

  if (!input || typeof input.question !== 'string' || input.question.trim().length === 0) {
    throw new Error('recall-query: question is required');
  }
  if (!input.project || typeof input.project !== 'string' || input.project.trim().length === 0) {
    throw new Error('recall-query: project is required');
  }

  const question = input.question.trim();
  const project = input.project.trim();

  let k = typeof input.k === 'number' && Number.isFinite(input.k) ? Math.floor(input.k) : DEFAULT_K;
  if (k < MIN_K) k = MIN_K;
  if (k > MAX_K) k = MAX_K;

  const sourceIds = input.filters?.source_ids;

  // 1) Retrieve
  const { rows: chunks, retrievedBy } = await retrieveChunks(pool, project, question, k, sourceIds);

  if (chunks.length === 0) {
    return {
      answer: 'Nothing on file.',
      citations: [],
      chunks_considered: 0,
      latencyMs: Date.now() - started,
      retrieved_by: 'none',
    };
  }

  // 2) Build prompts
  const directives = await loadDataRoomDirectives(pool);
  const systemPrompt = buildSystemPrompt(directives);
  const userPrompt = buildUserPrompt(question, chunks);

  // 3) Dispatch to codex_cli via Porter Bridge
  const ctx: RoutingContext = {
    message: question,
    username: 'system',
    forceGatewayType: 'codex_cli',
  };

  const dispatchReq: BridgeDispatchRequest = {
    messages: [{ role: 'user', content: userPrompt }],
    systemPrompt,
  };

  const decision = await routingEngine.select(ctx);
  const result = await routingEngine.dispatchWithQueue(decision, dispatchReq);

  const answer = (result.response ?? '').trim() || "The retrieved chunks don't say.";

  // 4) Build citations from retrieved chunks (in retrieval order)
  const citations: Citation[] = chunks.map((c) => ({
    source_id: c.source_id,
    title: c.title,
    chunk_idx: c.chunk_idx,
    snippet: (c.snippet || c.text).slice(0, SNIPPET_FALLBACK_CHARS),
    score: c.score,
  }));

  return {
    answer,
    citations,
    chunks_considered: chunks.length,
    latencyMs: Date.now() - started,
    retrieved_by: retrievedBy,
  };
}
