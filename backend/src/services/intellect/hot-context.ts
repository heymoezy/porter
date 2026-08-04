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
import { config } from '../../config.js';
import path from 'node:path';
import crypto from 'node:crypto';
import { pool } from '../../db/client.js';

const PROJECTS_ROOT = config.projectsDir;
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

/**
 * Two kinds of episode summary carry no information and must never occupy a
 * line of the warm packet:
 *
 *  1. The dispatch-counter template ("Session (3 dispatches, 16m)") that the
 *     workspace-scoped analyzer emits when it has nothing to say. 96% of all
 *     episodes on this box are at the salience floor and most are this string.
 *  2. The model declining to summarize ("I don't have a prior work session to
 *     summarize…"). That is a transcript artifact, not a memory — injecting it
 *     tells the next session that the last one accomplished nothing.
 *
 * Deliberately narrow: it anchors on how these two are PHRASED, so a real
 * summary that merely happens to be short or to contain "session" survives.
 */
/**
 * The session analyzer appends a machine-generated activity tag to summaries:
 *   "…coordination ledger closed. [Worked on **ymc.capital** (41 transcript turns, 187m)]"
 * and when it has nothing else to say, emits that tag as the WHOLE summary.
 *
 * So the tag is not itself a junk signal — it is a suffix. Strip it first, then
 * judge what is left. (Getting this backwards rejects every real summary that
 * carries the tag, which is most of them.) Stripping also saves the tokens: the
 * turn-count and duration tell a future session nothing it can act on.
 */
export function stripActivityTag(line: string): string {
  return line
    .replace(/\s*\[\s*Worked on\b[^\]]*\]\s*$/i, '')
    .replace(/\s*—\s*tools:[^—\]]*$/i, '')
    .trim();
}

export function isLowSignalSummary(line: string): boolean {
  const s = stripActivityTag(line);

  // (1) Nothing left once the machine-generated tag is removed — i.e. the tag
  //     WAS the summary — or too short to carry a fact.
  if (s.length < 25) return true;

  // (2) The counter template standing alone, in every observed shape:
  //     "Session (3 dispatches, 16m)", "Worked on **Porter** (4 dispatches, 4m)",
  //     "Worked on **Baan Yin Dee** (2 transcript turns, 1m)". Anchored at the
  //     START so it can never fire on a real summary that merely contains a
  //     parenthetical like "(2 classes, 100m)".
  if (/^(Session\s*)?\(\d+\s+[a-z ]+,\s*\d+\s*[smhd]\)/i.test(s)) return true;
  if (/^Worked on \*\*/i.test(s)) return true;

  // (3) FIRST-PERSON OPENER — the structural tell, and the big one.
  //     The analyzer's contract is a third-person description of what happened
  //     ("Fixed the signing link…", "Shipped six releases…"). When the summary
  //     opens with "I", the model has dropped out of summariser mode and is
  //     talking TO the user: refusing, asking for clarification, or answering
  //     the prompt it was handed. 566 of 758 project episodes open this way and
  //     a hand review found no genuine work summary among them.
  //     Filtering is the guard. The analyzer being handed sessions it cannot
  //     see is the ROOT CAUSE and is not fixed here.
  if (/^I['’\s]/i.test(s)) return true;

  // (4) Third-person statements that explicitly record that nothing happened,
  //     and second-person replies to the user about a malformed prompt
  //     ("Your message appears to be incomplete or cut off…"). Same failure as
  //     (3), just aimed outward instead of inward.
  if (/^(No (work|substantive|prior|completed)|There (is|was|are) no|Nothing (was|to))\b/i.test(s)) return true;
  if (/^Your (message|request|prompt|task|instruction)\b/i.test(s)) return true;
  if (/^(this )?appears to be (the )?(first|start|beginning)\b/i.test(s)) return true;

  // (5) Provider/quota error text captured as if it were a session summary
  //     ("Your organization has disabled Claude subscription access…"). This is
  //     the gateway failing, stored as memory.
  if (/\b(your organization has disabled|subscription access|usage limit|rate limit|quota exceeded|api (key|error)|authentication (failed|error))\b/i.test(s)) {
    return true;
  }

  return false;
}

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

/** The warm packet's CONTENT, before anyone decides how to render it. */
export interface HotParts {
  project: string;
  /** Head of the project's CHECKPOINT.md, or null. */
  checkpointLine: string | null;
  /** Real project-session summaries, junk already filtered. */
  recentSessions: string[];
  /** Notes/handoffs a previous session deliberately left behind. */
  handoffs: Array<{ kind: string; body: string; gateway: string | null }>;
}

/**
 * Gather the warm packet's parts ONCE.
 *
 * This exists because there are two mouths that must never drift: the MCP pull
 * path (porter_bootstrap → composeHotBody) and the SessionStart push path
 * (/api/v1/intellect/context). Both now read THIS. Rendering is a pure function
 * of the returned object, so a mouth can choose its own layout — what it can
 * never do is run its own queries and quietly diverge.
 *
 * Every lookup fails open (a fresh install must still bootstrap) but none of
 * them fails silent.
 */
export async function getHotParts(project: string): Promise<HotParts> {
  const parts: HotParts = {
    project,
    checkpointLine: readCheckpointHead(project).line,
    recentSessions: [],
    handoffs: [],
  };

  // `episodes` is keyed (scope, scope_id) — there has never been a `project`
  // column. The old query named one, so it threw on EVERY call and a bare
  // `catch {}` swallowed it: this section never rendered once since #37 R1
  // shipped. A fail-open catch is for "the table isn't there yet", not for
  // hiding a query that can never succeed — so the catch now says what broke.
  try {
    const eps = (await pool.query(
      `SELECT summary FROM episodes
        WHERE scope = 'project' AND scope_id = $1
        ORDER BY created_at DESC LIMIT 12`,
      [project],
    )).rows as Array<{ summary: string | null }>;
    parts.recentSessions = eps
      .map((e) => (e.summary ?? '').split('\n')[0].trim())
      .filter((l) => l.length > 0 && !isLowSignalSummary(l))
      .map((l) => stripActivityTag(l).slice(0, 160))
      .slice(0, 3);
  } catch (e) {
    console.error('[hot-context] recent-episodes lookup failed:', e instanceof Error ? e.message : e);
  }

  // Handoffs/notes a session explicitly left for the next one. The
  // highest-signal lines in the packet: someone CHOSE to write them.
  try {
    parts.handoffs = (await pool.query(
      `SELECT kind, body, gateway FROM hot_notes
        WHERE project_key = $1 ORDER BY created_at DESC LIMIT 3`,
      [project],
    )).rows as HotParts['handoffs'];
  } catch (e) {
    console.error('[hot-context] handoff lookup failed:', e instanceof Error ? e.message : e);
  }

  return parts;
}

/**
 * Compose the warm packet. Deliberately small and boring: what project, where we
 * got to, what's open, and WHERE to look for more (never the contents).
 */
export async function composeHotBody(project: string, sourceGateway?: string | null): Promise<string> {
  const hot = await getHotParts(project);
  const parts: string[] = [];
  parts.push(`# Hot context — ${project}`);

  if (hot.checkpointLine) {
    parts.push('', '## Where we got to (CHECKPOINT.md, latest)', hot.checkpointLine);
  }

  if (hot.recentSessions.length) {
    parts.push('', '## Recent sessions', ...hot.recentSessions.map((l) => `- ${l}`));
  }

  if (hot.handoffs.length) {
    parts.push('', '## Handoff from the last session');
    for (const n of hot.handoffs) {
      parts.push(`- ${n.kind === 'handoff' ? '**handoff**' : 'note'}${n.gateway ? ` (${n.gateway})` : ''}: ${n.body.slice(0, 240)}`);
    }
  }

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

/**
 * Render the continuity block for the SessionStart PUSH path.
 *
 * Deliberately NOT composeHotBody: the session-start hook chain already prints
 * the active project's CHECKPOINT.md excerpt (session-hook.cjs), so repeating
 * the checkpoint head here would bill the same bytes twice. What that hook
 * cannot know is what the last session deliberately handed off, or which real
 * work sessions preceded this one. That is what this adds — and nothing else.
 *
 * Returns null when there is genuinely nothing to say, so a cold project costs
 * zero tokens instead of an empty heading.
 */
export function renderContinuitySection(hot: HotParts): string | null {
  const lines: string[] = [];

  if (hot.handoffs.length) {
    lines.push('### Handoff from the last session');
    for (const n of hot.handoffs) {
      const who = n.gateway ? ` (${n.gateway})` : '';
      lines.push(`- ${n.kind === 'handoff' ? '**handoff**' : 'note'}${who}: ${n.body.slice(0, 240)}`);
    }
  }

  if (hot.recentSessions.length) {
    if (lines.length) lines.push('');
    lines.push('### Recent work on this project');
    for (const s of hot.recentSessions) lines.push(`- ${s}`);
  }

  return lines.length ? lines.join('\n') : null;
}

/**
 * R2 — vault MIRROR. The DB is the source of truth; this is a generated,
 * lag-tolerant, human-readable view (Obsidian). Never read back as truth, never
 * hand-edited. Best-effort: a mirror failure must never fail a session-end.
 * This is also #48's "hot.md" — built ONCE here, not a second time in the vault.
 */
const VAULT_HOT_DIR = '/home/lobster/vault/mirrors/hot';
function writeVaultMirror(project: string, body: string): void {
  try {
    fs.mkdirSync(VAULT_HOT_DIR, { recursive: true });
    const safe = safeProjectDir(project); // reuse the traversal guard for the filename
    if (!safe) return;
    const file = path.join(VAULT_HOT_DIR, `${project}.md`);
    const header = `---\ngenerated: true\nsource: porter (hot_contexts)\nupdated: ${new Date().toISOString()}\n---\n\n> Generated mirror — do NOT edit. Truth lives in Porter (\`GET /api/v1/intellect/hot?project=${project}\`).\n\n`;
    fs.writeFileSync(file, header + body + '\n', 'utf8');
  } catch { /* mirror is best-effort; DB remains the truth */ }
}

/**
 * R2 — porter_write_memory. A session leaves a note/handoff for the next one.
 * Runtime memory ONLY: durable meaning still reaches the vault through the
 * existing dream/promote path, so no CLI writes the knowledge graph directly.
 */
export async function appendHandoff(opts: {
  project: string;
  scope?: string;
  kind: string;
  body: string;
  gateway?: string | null;
  sessionId?: string | null;
}): Promise<void> {
  if (!safeProjectDir(opts.project)) throw new Error('invalid project');
  await pool.query(
    `INSERT INTO hot_notes (scope, project_key, kind, body, gateway, session_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [opts.scope ?? 'default', opts.project, opts.kind, opts.body, opts.gateway ?? null, opts.sessionId ?? null],
  );
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

  // Generated view for humans/Obsidian. DB already won; this can lag safely.
  writeVaultMirror(opts.project, body);

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
