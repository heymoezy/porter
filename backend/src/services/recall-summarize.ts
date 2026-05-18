/**
 * recall-summarize.ts -- Porter Recall doc-summary (P7).
 *
 * Given a project-scoped source, returns a structured LLM extraction:
 *
 *   {
 *     summary, doc_type,
 *     entities: { people[], organizations[], dates[], amounts[{value,currency,context}] },
 *     key_facts[]
 *   }
 *
 * Cached on recall_doc_sources.summary so repeat asks against the same
 * document are free. Pass force_refresh=true to bust the cache (e.g. when
 * a better model lands, or after a re-ingest of better-parsed text).
 *
 * Synthesis routes through Porter's in-process Bridge to codex_cli — same
 * pattern as recall-query.ts. Output is forced to a single JSON object via
 * the system prompt + parsed defensively. One re-prompt retry on parse
 * failure; second failure surfaces as a thrown error to the caller.
 */

import type pg from 'pg';
import { routingEngine } from './bridge/routing-engine.js';
import type { RoutingContext, BridgeDispatchRequest } from './bridge/types.js';

// -- Public types ------------------------------------------------------------

export interface SummarizeInput {
  project: string;
  source_id: string;
  force_refresh?: boolean;
}

export interface ExtractedAmount {
  value: number | null;
  currency: string | null;
  context: string | null;
}

export interface ExtractedEntities {
  people: string[];
  organizations: string[];
  dates: string[];
  amounts: ExtractedAmount[];
}

export interface DocSummary {
  summary: string;
  doc_type: string | null;
  entities: ExtractedEntities;
  key_facts: string[];
}

export interface SummarizeResult {
  source_id: string;
  title: string | null;
  data: DocSummary;
  cached: boolean;
  generated_at: string;       // ISO timestamp
  model: string | null;
  latencyMs: number;
}

// -- Tunables ----------------------------------------------------------------

const MAX_CHUNKS_FOR_SUMMARY = 24;   // first N chunks (~76k chars at 3200/chunk) — codex can handle, cost is fine
const MAX_CHARS_FOR_SUMMARY = 60_000;
const REPROMPT_ON_PARSE_FAILURE = true;

// -- Cache lookup ------------------------------------------------------------

interface SourceRow {
  id: number;
  title: string | null;
  summary: DocSummary | null;
  summary_at: Date | null;
  summary_model: string | null;
}

async function loadSource(
  pool: pg.Pool,
  project: string,
  sourceId: string,
): Promise<SourceRow | null> {
  const res = await pool.query<SourceRow>(
    `SELECT id, title, summary, summary_at, summary_model
       FROM recall_doc_sources
      WHERE project = $1 AND source_id = $2
      LIMIT 1`,
    [project, sourceId],
  );
  return res.rows[0] ?? null;
}

// -- Source-text assembly ----------------------------------------------------

async function loadSourceText(
  pool: pg.Pool,
  sourcePk: number,
): Promise<{ text: string; chunks_used: number; truncated: boolean }> {
  const res = await pool.query<{ chunk_idx: number; text: string }>(
    `SELECT chunk_idx, text
       FROM recall_doc_chunks
      WHERE source_pk = $1
      ORDER BY chunk_idx ASC
      LIMIT $2`,
    [sourcePk, MAX_CHUNKS_FOR_SUMMARY],
  );

  if (res.rows.length === 0) {
    return { text: '', chunks_used: 0, truncated: false };
  }

  let combined = '';
  let used = 0;
  let truncated = false;
  for (const row of res.rows) {
    if (combined.length + row.text.length + 2 > MAX_CHARS_FOR_SUMMARY) {
      truncated = true;
      break;
    }
    if (combined.length > 0) combined += '\n\n';
    combined += row.text;
    used += 1;
  }

  // If the loop ate the whole batch, check whether even more chunks exist past
  // MAX_CHUNKS_FOR_SUMMARY (we LIMITed). Surface truncation honestly.
  if (!truncated && res.rows.length === MAX_CHUNKS_FOR_SUMMARY) {
    const more = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM recall_doc_chunks WHERE source_pk = $1 AND chunk_idx >= $2) AS exists`,
      [sourcePk, MAX_CHUNKS_FOR_SUMMARY],
    );
    if (more.rows[0]?.exists) truncated = true;
  }

  return { text: combined, chunks_used: used, truncated };
}

// -- Prompts ----------------------------------------------------------------

function buildSystemPrompt(): string {
  return [
    'You are a document analyst. Given the full text of a single document, you return a structured JSON extraction.',
    '',
    'Output rules:',
    '- Return ONE single JSON object. No prose before or after. No markdown fence.',
    '- Schema (every key required, arrays may be empty but never null):',
    '  {',
    '    "summary": string,                 // 1–3 plain-language sentences. What is this document?',
    '    "doc_type": string,                // short snake_case label, e.g. "subscription_agreement",',
    '                                        // "registered_agent_agreement", "kyc_passport",',
    '                                        // "financial_statement", "engagement_letter",',
    '                                        // "fee_note", "memorandum_articles", "certificate".',
    '    "entities": {',
    '      "people":        string[],       // full names of natural persons mentioned',
    '      "organizations": string[],       // legal entity names mentioned',
    '      "dates":         string[],       // ISO-ish, e.g. "2025-03-11"',
    '      "amounts": [ { "value": number, "currency": string, "context": string } ]',
    '    },',
    '    "key_facts": string[]              // bullet-tier statements grounded in the doc',
    '  }',
    '',
    'Hard rules:',
    '- Never invent facts. Only emit data that is supported by the document text.',
    '- Prefer canonical legal entity names (e.g. "Stablekey Holdings Limited", not "Stablekey").',
    '- Dates: best-effort ISO. If only a month/year is given, use YYYY-MM. If only year, YYYY.',
    '- Amounts: extract currency code from symbol or text ("USD", "SGD", "GBP", "EUR", "BVI$").',
    '- key_facts should be the 3–8 most decision-relevant points. Skip boilerplate.',
    '- If the document text is truncated (you will be told), say so explicitly in summary.',
  ].join('\n');
}

function buildUserPrompt(opts: {
  title: string | null;
  docText: string;
  truncated: boolean;
}): string {
  const head = `DOCUMENT: ${opts.title ? opts.title : '(untitled)'}`;
  const note = opts.truncated ? '\n\nNOTE: The document body below is TRUNCATED — only the leading portion is provided.' : '';
  return `${head}${note}\n\nBODY:\n${opts.docText}\n\nReturn the JSON object now.`;
}

// -- Parsing -----------------------------------------------------------------

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();

  // Quick path: whole response is JSON
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch { /* fall through */ }
  }

  // Strip leading fences / "Here is the JSON:" / markdown
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch { /* fall through */ }
  }

  // Greedy: first { ... matching last }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(slice);
    } catch { /* fall through */ }
  }

  throw new Error('recall-summarize: model output did not contain valid JSON');
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function normalizeSummary(raw: unknown): DocSummary {
  if (!raw || typeof raw !== 'object') {
    throw new Error('recall-summarize: parsed JSON is not an object');
  }
  const r = raw as Record<string, unknown>;

  const summary = typeof r.summary === 'string' ? r.summary.trim() : '';
  if (!summary) {
    throw new Error('recall-summarize: summary field missing or empty');
  }

  const doc_type = typeof r.doc_type === 'string' && r.doc_type.trim().length > 0 ? r.doc_type.trim() : null;

  const entRaw = (r.entities && typeof r.entities === 'object') ? r.entities as Record<string, unknown> : {};
  const people = isStringArray(entRaw.people) ? entRaw.people : [];
  const organizations = isStringArray(entRaw.organizations) ? entRaw.organizations : [];
  const dates = isStringArray(entRaw.dates) ? entRaw.dates : [];
  const amountsRaw = Array.isArray(entRaw.amounts) ? entRaw.amounts : [];

  const amounts: ExtractedAmount[] = amountsRaw
    .filter((a): a is Record<string, unknown> => a !== null && typeof a === 'object')
    .map((a) => ({
      value: typeof a.value === 'number' && Number.isFinite(a.value) ? a.value : null,
      currency: typeof a.currency === 'string' ? a.currency : null,
      context: typeof a.context === 'string' ? a.context : null,
    }));

  const key_facts = isStringArray(r.key_facts) ? r.key_facts : [];

  return {
    summary,
    doc_type,
    entities: { people, organizations, dates, amounts },
    key_facts,
  };
}

// -- LLM dispatch -----------------------------------------------------------

async function dispatchSummary(
  title: string | null,
  docText: string,
  truncated: boolean,
): Promise<{ raw: string; model: string }> {
  const ctx: RoutingContext = {
    message: `summarize:${title ?? 'untitled'}`,
    username: 'system',
    forceGatewayType: 'codex_cli',
  };

  const dispatchReq: BridgeDispatchRequest = {
    messages: [{ role: 'user', content: buildUserPrompt({ title, docText, truncated }) }],
    systemPrompt: buildSystemPrompt(),
  };

  const decision = await routingEngine.select(ctx);
  const result = await routingEngine.dispatchWithQueue(decision, dispatchReq);

  return {
    raw: (result.response ?? '').trim(),
    model: result.model ?? 'codex_cli',
  };
}

// -- Persistence ------------------------------------------------------------

async function saveSummary(
  pool: pg.Pool,
  sourcePk: number,
  data: DocSummary,
  model: string,
): Promise<Date> {
  const res = await pool.query<{ summary_at: Date }>(
    `UPDATE recall_doc_sources
        SET summary       = $2::jsonb,
            summary_at    = NOW(),
            summary_model = $3,
            updated_at    = NOW()
      WHERE id = $1
      RETURNING summary_at`,
    [sourcePk, JSON.stringify(data), model],
  );
  return res.rows[0]?.summary_at ?? new Date();
}

// -- Main entry point -------------------------------------------------------

export async function summarizeDoc(
  pool: pg.Pool,
  input: SummarizeInput,
): Promise<SummarizeResult> {
  const started = Date.now();

  if (!input || typeof input.project !== 'string' || input.project.trim().length === 0) {
    throw new Error('recall-summarize: project is required');
  }
  if (typeof input.source_id !== 'string' || input.source_id.trim().length === 0) {
    throw new Error('recall-summarize: source_id is required');
  }
  const project = input.project.trim();
  const sourceId = input.source_id.trim();
  const forceRefresh = input.force_refresh === true;

  const source = await loadSource(pool, project, sourceId);
  if (!source) {
    const e = new Error('recall-summarize: source not found');
    (e as any).code = 'NOT_FOUND';
    throw e;
  }

  // Cache hit
  if (!forceRefresh && source.summary && source.summary_at) {
    return {
      source_id: sourceId,
      title: source.title,
      data: source.summary,
      cached: true,
      generated_at: source.summary_at.toISOString(),
      model: source.summary_model,
      latencyMs: Date.now() - started,
    };
  }

  // Cache miss — fetch text and ask the model
  const { text, chunks_used, truncated } = await loadSourceText(pool, source.id);
  if (chunks_used === 0 || text.trim().length === 0) {
    const e = new Error('recall-summarize: source has no chunked text');
    (e as any).code = 'NO_TEXT';
    throw e;
  }

  let raw: string;
  let model: string;
  ({ raw, model } = await dispatchSummary(source.title, text, truncated));

  let parsed: DocSummary;
  try {
    parsed = normalizeSummary(extractJsonObject(raw));
  } catch (err) {
    if (!REPROMPT_ON_PARSE_FAILURE) throw err;

    // One retry with a stricter nudge
    const retry = await routingEngine.dispatchWithQueue(
      await routingEngine.select({
        message: `summarize-retry:${sourceId}`,
        username: 'system',
        forceGatewayType: 'codex_cli',
      }),
      {
        messages: [
          { role: 'user', content: buildUserPrompt({ title: source.title, docText: text, truncated }) },
          { role: 'assistant', content: raw },
          { role: 'user', content: 'Your previous reply was not valid JSON. Reply with ONE JSON object only — no prose, no markdown fence. Same schema.' },
        ],
        systemPrompt: buildSystemPrompt(),
      },
    );

    raw = (retry.response ?? '').trim();
    model = retry.model ?? model;
    parsed = normalizeSummary(extractJsonObject(raw));
  }

  const generatedAt = await saveSummary(pool, source.id, parsed, model);

  return {
    source_id: sourceId,
    title: source.title,
    data: parsed,
    cached: false,
    generated_at: generatedAt.toISOString(),
    model,
    latencyMs: Date.now() - started,
  };
}
