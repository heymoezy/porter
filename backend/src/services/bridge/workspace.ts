/**
 * workspace.ts — throwaway git worktrees for code-changing dispatches.
 *
 * Moe, 2026-07-31: *"is tom handing off jobs to porter or is he controlling a
 * claude code cli session? porter is the harness."* It was both, and that was
 * the problem. The `claude_cli` adapter pins `cwd` to a /tmp sandbox with no
 * repo, so a job that needs to EDIT CODE cannot run through Porter at all —
 * which is precisely why ymc.capital grew its own runner spawning `claude`
 * directly, outside the router. Two harnesses, because the sandbox left no
 * third option. This closes that gap so there is one.
 *
 * ⚠️ THE ISOLATION IS THE POINT, NOT AN OBSTACLE TO IT.
 * Every guard below is ported from `ymc.capital/backend/scripts/tom-dev-runner.ts`,
 * where each one was learned the hard way:
 *   · NEVER the live tree. A worktree on its own branch, always. Other sessions
 *     and the post-commit deploy hook are using the primary checkout.
 *   · The session may NOT deploy, commit, push, or restart services. It writes
 *     files; a human decides what becomes of them.
 *   · The subprocess gets a SANITISED env — no DATABASE_URL, no tokens, no
 *     provider keys. `claude` authenticates through its own file-based OAuth
 *     under HOME, so an allowlist of operational vars is sufficient.
 *   · node_modules is symlinked in, because a fresh worktree has none and a
 *     session that cannot run a typecheck cannot verify its own work.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import path from 'node:path';

/** Worktrees live OUTSIDE any projects/ tree — a scratch checkout parked under
 *  ~/projects would be scanned as if it were real source (Porter's rules mirror
 *  reads every CLAUDE.md under there and would mint directives from it). */
const WT_BASE = process.env.PORTER_WORKTREE_BASE || `${process.env.HOME}/.worktrees/porter`;

export interface Workspace {
  /** Absolute path to the worktree — what DispatchRequest.workspace carries. */
  dir: string;
  /** The branch created for it. Survives cleanup so the work is recoverable. */
  branch: string;
  /** Directories whose node_modules were linked in. */
  linked: string[];
}

function git(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

/**
 * Roots under which a workspace repository may live.
 *
 * `repo` arrives in an API request body. The endpoint is service-token gated and
 * loopback-only, but "internal" is not a security boundary — it is the thing
 * every SSRF write-up starts by assuming. Without this check the caller chooses
 * any directory on the box that happens to contain a `.git`, and Porter then
 * runs a WRITE-ENABLED Claude session in it.
 */
const ALLOWED_ROOTS = (process.env.PORTER_WORKSPACE_ALLOWED_ROOTS
  || `${process.env.HOME}/projects`).split(':').map(r => r.trim()).filter(Boolean);

/**
 * Resolve `repo` and prove it sits under an allowed root.
 *
 * Checked on the REALPATH, because the string form proves nothing: `projects/x/../../../etc`
 * and a symlink pointing out of the tree both look fine until resolved. A leading
 * `-` is refused outright — `git -C` would read it as an option, not a path.
 */
function assertAllowedRepo(repo: string): string {
  if (!repo || repo.startsWith('-')) throw new Error(`invalid repo path: ${repo}`);
  let real: string;
  try { real = realpathSync(repo); }
  catch { throw new Error(`repo does not exist: ${repo}`); }
  const ok = ALLOWED_ROOTS.some((root) => {
    let r: string;
    try { r = realpathSync(root); } catch { return false; }
    return real === r || real.startsWith(r + path.sep);
  });
  if (!ok) throw new Error(`repo is outside the permitted roots (${ALLOWED_ROOTS.join(', ')}): ${real}`);
  return real;
}

/** Exposed so the API can reject a bad repo with a 400 instead of failing at claim time. */
export function isAllowedRepo(repo: string): boolean {
  try { assertAllowedRepo(repo); return true; } catch { return false; }
}

/**
 * Create a worktree for `repo` on a fresh branch.
 *
 * `stamp` must be unique per job (the job id is ideal) — it names both the
 * branch and the directory, so a collision would put two sessions in one tree.
 */
export function createWorkspace(repo: string, stamp: string, subdirs: string[] = ['', 'backend', 'site']): Workspace {
  const safeRepo = assertAllowedRepo(repo);
  if (!existsSync(path.join(safeRepo, '.git'))) {
    throw new Error(`not a git repository: ${safeRepo}`);
  }
  repo = safeRepo;
  const safe = stamp.replace(/[^A-Za-z0-9._-]/g, '-');
  const branch = `porter-dev/${safe}`;
  const dir = path.join(WT_BASE, safe);

  mkdirSync(WT_BASE, { recursive: true });
  git(repo, ['worktree', 'add', '-b', branch, dir, 'HEAD']);

  // A worktree does not share node_modules with its repo. Without these the
  // session cannot install, build, or typecheck — it can only guess.
  const linked: string[] = [];
  for (const sub of subdirs) {
    const src = path.join(repo, sub, 'node_modules');
    const dst = path.join(dir, sub, 'node_modules');
    try {
      if (existsSync(src) && !existsSync(dst)) { symlinkSync(src, dst, 'dir'); linked.push(sub || '.'); }
    } catch { /* best-effort — a missing link degrades the session, it doesn't break it */ }
  }
  return { dir, branch, linked };
}

/**
 * What the session actually changed.
 *
 * ⚠️ The node_modules symlinks this module creates are OURS, not the session's
 * work, and git reports them as untracked. The first workspace job came back
 * claiming "3 file(s) changed" when the session had created exactly one. A
 * report that inflates its own numbers is worse than no report, so they are
 * filtered here.
 *
 * (They cannot be excluded via the worktree's `info/exclude`: git reads that
 * from the COMMON git dir, so writing it would alter the shared repository for
 * every worktree and every other session using it.)
 */
export function workspaceDiff(dir: string): { files: string[]; diffstat: string } {
  const isOurs = (f: string) => f === 'node_modules' || f.endsWith('/node_modules') || f.includes('node_modules/');
  try {
    const files = git(dir, ['status', '--porcelain'])
      .split('\n').map(l => l.slice(3).trim()).filter(Boolean).filter(f => !isOurs(f));
    const diffstat = git(dir, ['diff', '--stat', 'HEAD']);
    return { files, diffstat };
  } catch {
    return { files: [], diffstat: '' };
  }
}

/**
 * Remove the worktree directory.
 *
 * ⚠️ THE BRANCH IS DELIBERATELY KEPT. Removing it would destroy the only copy of
 * work a session just did, and the failure mode is silent — the caller sees a
 * clean exit and no output. A stale branch is cheap; a lost afternoon is not.
 */
export function removeWorkspace(repo: string, ws: Workspace): void {
  try { git(repo, ['worktree', 'remove', '--force', ws.dir]); }
  catch { try { rmSync(ws.dir, { recursive: true, force: true }); } catch { /* gone already */ } }
}

/**
 * Environment for a workspace session — an ALLOWLIST, never the parent's env.
 *
 * A dev session with the parent's environment would hold DATABASE_URL, service
 * tokens and provider keys. It needs none of them: `claude` authenticates via
 * its own OAuth under HOME.
 */
export function workspaceEnv(): NodeJS.ProcessEnv {
  const ALLOW = [
    'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE',
    'TERM', 'TZ', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR',
    'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
  ];
  const e: NodeJS.ProcessEnv = {};
  for (const k of ALLOW) if (process.env[k] !== undefined) e[k] = process.env[k];
  return e;
}

/**
 * The standing rules every workspace session is given, verbatim.
 *
 * Kept here rather than in a prompt template so that "the session must not
 * deploy" is one string with one owner, not a sentence each caller rewrites.
 */
export const WORKSPACE_RULES = [
  'You are working inside an isolated git worktree. Work ONLY within it.',
  'Do NOT run deploy scripts, do NOT git commit, do NOT git push, do NOT restart services.',
  'The harness handles branching, review and delivery — your job is to make the change and verify it.',
  'Verify your work before finishing (typecheck / build / run) and say plainly what you could not verify.',
].join('\n');
