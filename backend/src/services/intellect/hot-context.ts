/**
 * Porter universal memory R1 — HOT CONTEXT (the warm session-bootstrap cache).
 * Design: planning/porter-universal-memory-37.md (council-ratified: codex + grok).
 *
 * WHY: every session (claude, codex, grok, antigravity) currently re-derives the
 * same project state from scratch — burning tokens to rediscover what the last
 * session already knew. hot context is the cheap warm packet a session opens
 * with: "here is the project, here is where we got to, here is what's next."
 *
 * INVARIANTS (from the council design):
 *  - Porter DB is the SOURCE OF TRUTH. Any vault file is a generated mirror.
 *  - POINTERS, NOT PAYLOADS. Hard-capped (~900 tokens). We name CHECKPOINT.md,
 *    we do not inline it. Full depth is drill-on-demand (context_pack / recall).
 *  - FAIL-OPEN / EMPTY-HONEST. A fresh Porter with no data returns a COLD packet
 *    and never fabricates history. Cold → warm happens automatically after one
 *    real session ends.
 *  - The ONLY default write path is session-end (see routes/v1/intellect.ts), so
 *    memory can't be polluted by ad-hoc writes from every CLI.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pool } from '../../db/client.js';

const PROJECTS_ROOT = '/home/lobster/projects';
/** Hard cap. Bootstrap must stay cheap — that is the entire point. */
const MAX_CHARS = 3600; // ~900 tokens

/**
 * SECURITY — `project` arrives from an HTTP query/body, and we use it to build a
 * filesystem path. Unvalidated, `project=".."` (or any traversal) escapes
 * PROJECTS_ROOT and turns this into an arbitrary-file-read. Two guards, both
 * required:
 *   1. shape — a project is a single directory name: no separators, no traversal.
 *   2. containment — resolve the final path and prove it is still under the root.
 * Note a shape check ALONE is insufficient: ".." matches [A-Za-z0-9._-]+.
 * Returns the safe absolute dir, or null (caller must treat null as "reject").
 */
export function safeProjectDir(project: string): string | null {
  if (typeof project !== 'string' || project.length === 0 || project.length > 128) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(project)) return null; // no '/', no '\', no NUL
  if (project === '.' || project === '..') return null;
  const root = path.resolve(PROJECTS_ROOT);
  const resolved = path.resolve(root, project);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export interface HotContext {
  status: 'warm' | 'cold';
  project: string | null;
  body: string | null;
  approxTokens: number;
  updatedAt: string | null;
  sourceGateway: string | null;
  hints?: string[];
}

const approxTokens = (s: string) => Math.ceil(s.length / 4);

/** Last entry of a project's CHECKPOINT.md — the "where we got to" line. */
function readCheckpointHead(project: string, maxLines = 12): { line: string | null; exists: boolean } {
  const dir = safeProjectDir(project);
  if (!dir) return { line: null, exists: false }; // reject traversal — never read outside the root
  const p = path.join(dir, 'CHECKPOINT.md');
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0).slice(0, maxLines);
    // Heading + the first couple of bullets = the substance of the last entry.
    const head = lines.slice(0, 4).join('\n').trim();
    return { line: head || null, exists: true };
  } catch {
    return { line: null, exists: false };
  }
}

/**
 * Compose the warm packet. Deliberately small and boring: what project, where we
 * got to, what's open, and WHERE to look for more (never the contents).
 */
export async function composeHotBody(project: string, sourceGateway?: string | null): Promise<string> {
  const parts: string[] = [];
  parts.push(`# Hot context — ${project}`);

  const ckpt = readCheckpointHead(project);
  if (ckpt.line) {
    parts.push('', '## Where we got to (CHECKPOINT.md, latest)', ckpt.line);
  }

  // Open signals / recent episodes — titles only, capped. Fail-open: a fresh
  // install has none of these tables populated and must still bootstrap.
  try {
    const eps = (await pool.query(
      `SELECT summary FROM episodes WHERE project = $1 ORDER BY created_at DESC LIMIT 3`,
      [project],
    )).rows as Array<{ summary: string | null }>;
    const lines = eps.map((e) => (e.summary ?? '').split('\n')[0].trim()).filter(Boolean).slice(0, 3);
    if (lines.length) parts.push('', '## Recent sessions', ...lines.map((l) => `- ${l.slice(0, 160)}`));
  } catch { /* fail-open: no episodes table / empty install */ }

  // POINTERS ONLY — the drill-down targets. Never inline these.
  parts.push(
    '',
    '## Where to look (do not pre-read — drill on demand)',
    `- ${PROJECTS_ROOT}/${project}/CHECKPOINT.md — full history`,
    `- ${PROJECTS_ROOT}/${project}/CLAUDE.md — project rules`,
    '- porter_context_pack / porter_search_vault — vault depth by topic',
  );

  if (sourceGateway) parts.push('', `_Last touched by: ${sourceGateway}_`);

  let body = parts.join('\n');
  if (body.length > MAX_CHARS) body = body.slice(0, MAX_CHARS) + '\n…(capped)';
  return body;
}

/** Recompute + persist. Called by session-end (the ONE default write path). */
export async function recomputeHot(opts: {
  project: string;
  scope?: string;
  sessionId?: string | null;
  gateway?: string | null;
}): Promise<HotContext> {
  // Reject traversal/garbage BEFORE it reaches the filesystem or the DB key.
  if (!safeProjectDir(opts.project)) throw new Error('invalid project');
  const scope = opts.scope ?? 'default';
  const body = await composeHotBody(opts.project, opts.gateway);
  const hash = crypto.createHash('sha256').update(body).digest('hex');

  const row = (await pool.query(
    `INSERT INTO hot_contexts (scope, project_key, body, approx_tokens, hash, source_session, source_gateway, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (scope, project_key) DO UPDATE
       SET body = EXCLUDED.body, approx_tokens = EXCLUDED.approx_tokens, hash = EXCLUDED.hash,
           source_session = EXCLUDED.source_session, source_gateway = EXCLUDED.source_gateway,
           updated_at = now()
     RETURNING body, approx_tokens, updated_at, source_gateway`,
    [scope, opts.project, body, approxTokens(body), hash, opts.sessionId ?? null, opts.gateway ?? null],
  )).rows[0];

  return {
    status: 'warm',
    project: opts.project,
    body: row.body,
    approxTokens: row.approx_tokens,
    updatedAt: row.updated_at,
    sourceGateway: row.source_gateway,
  };
}

/**
 * Read the warm packet. FRESH-INSTALL RULE: no row → a COLD-but-valid response.
 * Never fabricate history; the caller still boots fine and works from repo files.
 */
export async function getHot(project: string, scope = 'default'): Promise<HotContext> {
  if (!safeProjectDir(project)) {
    return {
      status: 'cold', project: null, body: null, approxTokens: 0, updatedAt: null, sourceGateway: null,
      hints: ['Invalid project name.'],
    };
  }
  try {
    const row = (await pool.query(
      `SELECT body, approx_tokens, updated_at, source_gateway
         FROM hot_contexts WHERE scope = $1 AND project_key = $2`,
      [scope, project],
    )).rows[0];
    if (!row) {
      return {
        status: 'cold', project, body: null, approxTokens: 0, updatedAt: null, sourceGateway: null,
        hints: ['No hot context yet — work from the repo (CHECKPOINT.md / CLAUDE.md). It warms after one session ends.'],
      };
    }
    return {
      status: 'warm', project,
      body: row.body,
      approxTokens: row.approx_tokens,
      updatedAt: row.updated_at,
      sourceGateway: row.source_gateway,
    };
  } catch {
    // Porter DB unreachable → still never block a CLI.
    return {
      status: 'cold', project, body: null, approxTokens: 0, updatedAt: null, sourceGateway: null,
      hints: ['Porter unavailable — run without memory.'],
    };
  }
}
