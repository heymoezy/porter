/**
 * Vault v2 — the DERIVATIVE LOOP (R4, 2026-07-07).
 *
 * "Markdown = DERIVATIVES" (plan decision 1): every `vault_artifacts` row of
 * kind='raw_file' should eventually have a generated kind='markdown_derivative'
 * sibling on the SAME node. The raw artifact is NEVER altered — this module
 * only ever INSERTS new artifact rows and updates `vault_derivative_jobs`.
 *
 * `vault_derivative_jobs` is the stale-aware tracker (replaces a bare
 * has_derivative bool):
 *   missing  — a raw artifact has no job yet (or none was ever generated)
 *   queued   — picked up by this sweep, generation in flight
 *   generated— derivative exists, source_hash matches the raw artifact's
 *              current content_hash
 *   stale    — the raw artifact's content_hash has since changed
 *   failed   — the last generation attempt errored (see `error`)
 *
 * Generic engine, zero app concepts — works identically for any app_scope.
 *
 * Sweep, three steps, each independently safe to re-run:
 *   1. seedMissingJobs   — raw_file artifacts with no job row yet → 'missing'
 *   2. flagStaleJobs     — 'generated' jobs whose raw content_hash drifted
 *                          from job.source_hash → 'stale'
 *   3. processJobs       — every 'missing'/'stale' (+ stuck 'queued') job:
 *                          generate a markdown derivative via Bridge
 *                          (dispatchWithFailover — the SAME chain-failover
 *                          path used by agent-message dispatch, cheap gateway
 *                          preferred), insert it as a NEW artifact, and flip
 *                          the job to 'generated' (or 'failed' — never throws).
 *
 * Raw content resolution (honest, not hand-waved):
 *   a) artifact.metadata.content (string)  — inline text an app supplied at
 *      ingest time — used verbatim.
 *   b) artifact.path                        — read from local disk when the
 *      path exists and is a regular file (bounded read, MAX_RAW_CHARS cap).
 *   c) neither                              — no raw bytes are available yet;
 *      the model is told so explicitly and asked to produce an honest
 *      PLACEHOLDER page from metadata only (title/type/path/source), never to
 *      invent file contents. metadata.placeholder=true marks these so the
 *      loop can regenerate once real content lands (same node, next ingest
 *      that sets metadata.content/path will flip content_hash → stale).
 */

import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pool } from '../db/client.js';

const execFileP = promisify(execFile);

/** Extract text from a binary document (PDF / office) using local tools so the
 *  derivative is built from REAL content, not garbage. Most vault files are PDFs
 *  (legal docs, statements) — reading them as utf8 yields binary noise, which is
 *  why coverage was ~0. Returns null if extraction isn't possible (falls back to
 *  the honest placeholder path). Read-only on the source; bounded runtime. */
async function extractBinaryText(path: string, maxChars: number): Promise<string | null> {
  const ext = (path.split('.').pop() || '').toLowerCase();
  try {
    if (ext === 'pdf') {
      // pdftotext -q -eol unix <path> -  → text on stdout. -layout keeps tables readable.
      const { stdout } = await execFileP('pdftotext', ['-q', '-layout', '-eol', 'unix', path, '-'],
        { maxBuffer: 24 * 1024 * 1024, timeout: 60_000 });
      const t = stdout.trim();
      return t ? t.slice(0, maxChars) : null;
    }
    if (['docx', 'doc', 'odt', 'rtf', 'pptx', 'ppt', 'xlsx', 'xls', 'ods'].includes(ext)) {
      // soffice → plain text into a temp dir, then read it back.
      const outDir = `/tmp/vault-deriv-${randomUUID()}`;
      await fs.mkdir(outDir, { recursive: true });
      try {
        await execFileP('soffice', ['--headless', '--convert-to', 'txt:Text', '--outdir', outDir, path],
          { timeout: 120_000 });
        const base = (path.split('/').pop() || '').replace(/\.[^.]+$/, '') + '.txt';
        const t = (await fs.readFile(`${outDir}/${base}`, 'utf8')).trim();
        return t ? t.slice(0, maxChars) : null;
      } finally {
        await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch {
    // extraction failed (encrypted PDF, scanned image, tool error) — placeholder.
  }
  return null;
}
import { routingEngine } from './bridge/routing-engine.js';
import type { BridgeDispatchRequest, RoutingContext } from './bridge/types.js';
import { CHEAP_GATEWAY, CHEAP_MODEL } from './intellect/worker-knowledge.js';
import { logIntellectEvent } from './intellect/file-watcher.js';

const MAX_RAW_CHARS = 20_000; // bounds the prompt regardless of source size
const MAX_RAW_FILE_BYTES = 2_000_000; // don't even attempt to read huge files
const STUCK_QUEUED_SECONDS = 600; // a 'queued' job older than this is treated as abandoned
const DEFAULT_BATCH_LIMIT = 25; // cap model calls per sweep invocation

export interface VaultDerivativeSweepResult {
  scope: string | null;
  seeded: number;
  staleFlagged: number;
  attempted: number;
  generated: number;
  failed: number;
  triggeredBy: 'schedule' | 'manual';
}

interface SourceArtifactRow {
  job_id: string;
  app_scope: string;
  source_artifact_id: string;
  node_id: string;
  path: string | null;
  artifact_content_hash: string | null;
  artifact_metadata: Record<string, unknown>;
  source_system: string | null;
  source_id: string | null;
  title: string;
  type: string;
  layer: string;
}

// ── Step 1 — seed a 'missing' job for every raw_file artifact that has none ──

async function seedMissingJobs(scope?: string): Promise<number> {
  const params: unknown[] = [];
  let where = `a.kind = 'raw_file' AND NOT EXISTS (
    SELECT 1 FROM vault_derivative_jobs j WHERE j.source_artifact_id = a.id
  )`;
  if (scope) {
    params.push(scope);
    where += ` AND a.app_scope = $${params.length}`;
  }
  const rows = (await pool.query(
    `SELECT a.id, a.app_scope, a.content_hash FROM vault_artifacts a WHERE ${where}`,
    params
  )).rows as Array<{ id: string; app_scope: string; content_hash: string | null }>;

  const now = Date.now() / 1000;
  for (const r of rows) {
    await pool.query(
      `INSERT INTO vault_derivative_jobs (id, app_scope, source_artifact_id, status, source_hash, created_at)
       VALUES ($1,$2,$3,'missing',$4,$5)`,
      [randomUUID(), r.app_scope, r.id, r.content_hash, now]
    );
  }
  return rows.length;
}

// ── Step 2 — flip 'generated' jobs whose raw content_hash has drifted ───────

async function flagStaleJobs(scope?: string): Promise<number> {
  const params: unknown[] = [];
  let where = `j.status = 'generated' AND a.kind = 'raw_file'
    AND COALESCE(a.content_hash,'') <> COALESCE(j.source_hash,'')`;
  if (scope) {
    params.push(scope);
    where += ` AND j.app_scope = $${params.length}`;
  }
  const result = await pool.query(
    `UPDATE vault_derivative_jobs j
     SET status = 'stale'
     FROM vault_artifacts a
     WHERE j.source_artifact_id = a.id AND ${where}`,
    params
  );
  return result.rowCount ?? 0;
}

// ── Step 3 — generate derivatives for missing/stale (+ stuck queued) jobs ───

async function selectJobsToProcess(scope: string | undefined, limit: number): Promise<SourceArtifactRow[]> {
  const params: unknown[] = [Date.now() / 1000 - STUCK_QUEUED_SECONDS];
  let where = `(j.status IN ('missing','stale') OR (j.status = 'queued' AND j.created_at < $1))`;
  if (scope) {
    params.push(scope);
    where += ` AND j.app_scope = $${params.length}`;
  }
  params.push(limit);
  const rows = (await pool.query(
    `SELECT j.id AS job_id, j.app_scope, j.source_artifact_id,
            a.node_id, a.path, a.content_hash AS artifact_content_hash, a.metadata AS artifact_metadata,
            a.source_system, a.source_id,
            n.title, n.type, n.layer
     FROM vault_derivative_jobs j
     JOIN vault_artifacts a ON a.id = j.source_artifact_id
     JOIN vault_nodes n ON n.id = a.node_id
     WHERE ${where}
     ORDER BY j.created_at ASC
     LIMIT $${params.length}`,
    params
  )).rows as SourceArtifactRow[];
  return rows;
}

/** Resolve the raw content of a source artifact. Honest about what's real vs placeholder. */
async function resolveRawContent(
  row: SourceArtifactRow
): Promise<{ content: string | null; truncated: boolean }> {
  const meta = row.artifact_metadata ?? {};
  if (typeof meta.content === 'string' && meta.content.trim()) {
    const raw = meta.content;
    return { content: raw.slice(0, MAX_RAW_CHARS), truncated: raw.length > MAX_RAW_CHARS };
  }
  if (row.path) {
    try {
      const stat = await fs.stat(row.path);
      if (stat.isFile() && stat.size <= MAX_RAW_FILE_BYTES) {
        const ext = (row.path.split('.').pop() || '').toLowerCase();
        // Binary docs (PDF / office) → extract real text first (pdftotext / soffice).
        if (['pdf', 'docx', 'doc', 'odt', 'rtf', 'pptx', 'ppt', 'xlsx', 'xls', 'ods'].includes(ext)) {
          const extracted = await extractBinaryText(row.path, MAX_RAW_CHARS);
          if (extracted) return { content: extracted, truncated: false };
          // extraction failed → placeholder (do NOT feed binary noise to the model).
          return { content: null, truncated: false };
        }
        const raw = await fs.readFile(row.path, 'utf8');
        return { content: raw.slice(0, MAX_RAW_CHARS), truncated: raw.length > MAX_RAW_CHARS };
      }
    } catch {
      // Not locally readable (remote path, permissions, gone) — fall through to placeholder.
    }
  }
  return { content: null, truncated: false };
}

function buildPrompt(row: SourceArtifactRow, resolved: { content: string | null; truncated: boolean }): string {
  const meta = row.artifact_metadata ?? {};
  const header = [
    'You are generating a MARKDOWN DERIVATIVE for a knowledge-vault raw source artifact.',
    'Output ONLY the markdown body — no commentary before or after, no wrapping code fence.',
    'Start with a level-1 heading using the node title.',
    '',
    `Node title: ${row.title}`,
    `Node type: ${row.type} (layer: ${row.layer})`,
    row.path ? `Source path: ${row.path}` : null,
    row.source_system ? `Source system: ${row.source_system}` : null,
    row.source_id ? `Source id: ${row.source_id}` : null,
    Object.keys(meta).length ? `Source metadata: ${JSON.stringify(meta)}` : null,
  ].filter((l): l is string => l != null);

  if (resolved.content) {
    return [
      ...header,
      '',
      'Summarize and reformat the RAW CONTENT below into clean, well-structured markdown',
      '(headings/bullets as appropriate). Preserve the facts present; do not invent facts',
      'that are not in the source.' + (resolved.truncated ? ' The content was truncated to fit — note that if relevant.' : ''),
      '',
      '--- RAW CONTENT ---',
      resolved.content,
    ].join('\n');
  }

  return [
    ...header,
    '',
    'NO RAW CONTENT BYTES are available for this source yet (only the metadata above).',
    'Produce a short PLACEHOLDER markdown page that clearly states, in its own words, that',
    'this is a placeholder pending real content ingestion. List only the known metadata',
    '(title, type, path, source system/id) — do NOT invent or guess file contents.',
  ].join('\n');
}

async function generateOne(row: SourceArtifactRow): Promise<void> {
  await pool.query(`UPDATE vault_derivative_jobs SET status = 'queued' WHERE id = $1`, [row.job_id]);

  try {
    const resolved = await resolveRawContent(row);
    const prompt = buildPrompt(row, resolved);

    const ctx: RoutingContext = {
      message: prompt,
      forceGatewayType: CHEAP_GATEWAY, // cheap gateway preferred; failover chain covers the rest
      forceModelName: CHEAP_MODEL,
      sourceAgent: 'vault-derivatives',
    };
    const req: BridgeDispatchRequest = {
      messages: [{ role: 'user', content: prompt }],
      model: CHEAP_MODEL,
      temperature: 0.2,
      maxTokens: 4000,
    };

    const { decision, result, failover } = await routingEngine.dispatchWithFailover(ctx, req);
    await routingEngine.logDispatch(decision, ctx, result, undefined, null, failover);

    const markdown = (result.response ?? '').trim();
    if (!markdown) throw new Error('Bridge returned an empty response');

    const generatedHash = createHash('sha256').update(markdown).digest('hex');
    const now = Date.now() / 1000;
    const derivativeArtifactId = randomUUID();

    await pool.query(
      `INSERT INTO vault_artifacts
         (id, app_scope, node_id, kind, source_system, source_id, path, content_hash, metadata, created_at)
       VALUES ($1,$2,$3,'markdown_derivative',$4,$5,NULL,$6,$7::jsonb,$8)`,
      [
        derivativeArtifactId,
        row.app_scope,
        row.node_id,
        'vault_derivative_loop',
        row.source_artifact_id,
        generatedHash,
        JSON.stringify({
          content: markdown,
          generatedFromArtifactId: row.source_artifact_id,
          gateway: decision.gatewayRow.type,
          model: decision.modelName,
          placeholder: !resolved.content,
        }),
        now,
      ]
    );

    await pool.query(
      `UPDATE vault_derivative_jobs
       SET status = 'generated', derivative_artifact_id = $1, generated_hash = $2,
           generated_at = $3, source_hash = $4, error = NULL
       WHERE id = $5`,
      [derivativeArtifactId, generatedHash, now, row.artifact_content_hash, row.job_id]
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await pool.query(
      `UPDATE vault_derivative_jobs SET status = 'failed', error = $1 WHERE id = $2`,
      [message.slice(0, 2000), row.job_id]
    );
  }
}

// ── Entry point — the `vault_derivative_sweep` workflow action, also callable

async function processJobs(scope: string | undefined, limit: number): Promise<{ attempted: number; generated: number; failed: number }> {
  const rows = await selectJobsToProcess(scope, limit);
  let generated = 0;
  let failed = 0;
  for (const row of rows) {
    await generateOne(row);
    const check = (await pool.query(`SELECT status FROM vault_derivative_jobs WHERE id = $1`, [row.job_id]))
      .rows[0] as { status: string } | undefined;
    if (check?.status === 'generated') generated++;
    else failed++;
  }
  return { attempted: rows.length, generated, failed };
}

/**
 * Run the full derivative sweep: seed missing jobs, flag stale ones, then
 * generate derivatives for a bounded batch of missing/stale/stuck-queued jobs.
 * Never throws — per-job failures are recorded on the job row (status='failed').
 * Safe to call on demand (POST /api/v1/vault/derivatives/sweep) or from the
 * every_24h workflow tick.
 */
export async function runVaultDerivativeSweep(opts: {
  scope?: string;
  triggeredBy: 'schedule' | 'manual';
  limit?: number;
}): Promise<VaultDerivativeSweepResult> {
  const scope = opts.scope?.trim() || undefined;
  const limit = opts.limit ?? DEFAULT_BATCH_LIMIT;

  const seeded = await seedMissingJobs(scope);
  const staleFlagged = await flagStaleJobs(scope);
  const { attempted, generated, failed } = await processJobs(scope, limit);

  if (seeded > 0 || staleFlagged > 0 || attempted > 0) {
    await logIntellectEvent('vault_derivative_sweep', 'vault-derivatives', {
      scope: scope ?? null,
      seeded,
      staleFlagged,
      attempted,
      generated,
      failed,
      triggeredBy: opts.triggeredBy,
    });
  }

  return { scope: scope ?? null, seeded, staleFlagged, attempted, generated, failed, triggeredBy: opts.triggeredBy };
}

// ── Coverage read — GET /api/v1/vault/derivatives?scope= ────────────────────

const ALL_STATUSES = ['missing', 'queued', 'generated', 'failed', 'stale'] as const;

export interface DerivativeCoverageJob {
  id: string;
  sourceArtifactId: string;
  derivativeArtifactId: string | null;
  status: string;
  sourceHash: string | null;
  generatedHash: string | null;
  error: string | null;
  createdAt: number;
  generatedAt: number | null;
  nodeId: string;
  nodeTitle: string;
  nodeType: string;
  sourcePath: string | null;
}

export async function getDerivativeCoverage(scope: string): Promise<{
  appScope: string;
  counts: Record<(typeof ALL_STATUSES)[number], number>;
  total: number;
  jobs: DerivativeCoverageJob[];
}> {
  const countRows = (await pool.query(
    `SELECT status, COUNT(*)::int AS count FROM vault_derivative_jobs WHERE app_scope = $1 GROUP BY status`,
    [scope]
  )).rows as Array<{ status: string; count: number }>;

  const counts = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<(typeof ALL_STATUSES)[number], number>;
  let total = 0;
  for (const r of countRows) {
    if ((ALL_STATUSES as readonly string[]).includes(r.status)) {
      counts[r.status as (typeof ALL_STATUSES)[number]] = r.count;
    }
    total += r.count;
  }

  const jobRows = (await pool.query(
    `SELECT j.id, j.source_artifact_id, j.derivative_artifact_id, j.status, j.source_hash,
            j.generated_hash, j.error, j.created_at, j.generated_at,
            a.node_id, a.path AS source_path, n.title AS node_title, n.type AS node_type
     FROM vault_derivative_jobs j
     JOIN vault_artifacts a ON a.id = j.source_artifact_id
     JOIN vault_nodes n ON n.id = a.node_id
     WHERE j.app_scope = $1
     ORDER BY j.created_at DESC
     LIMIT 500`,
    [scope]
  )).rows as Array<{
    id: string; source_artifact_id: string; derivative_artifact_id: string | null; status: string;
    source_hash: string | null; generated_hash: string | null; error: string | null;
    created_at: number; generated_at: number | null;
    node_id: string; source_path: string | null; node_title: string; node_type: string;
  }>;

  const jobs: DerivativeCoverageJob[] = jobRows.map((r) => ({
    id: r.id,
    sourceArtifactId: r.source_artifact_id,
    derivativeArtifactId: r.derivative_artifact_id,
    status: r.status,
    sourceHash: r.source_hash,
    generatedHash: r.generated_hash,
    error: r.error,
    createdAt: r.created_at,
    generatedAt: r.generated_at,
    nodeId: r.node_id,
    nodeTitle: r.node_title,
    nodeType: r.node_type,
    sourcePath: r.source_path,
  }));

  return { appScope: scope, counts, total, jobs };
}
