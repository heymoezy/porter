/**
 * active-project.ts — Porter Backbone Identity
 *
 * Porter is the infrastructure backbone serving N peer projects. The
 * "active project" is which peer the human is currently working on —
 * distinct from Porter-the-repo. This service owns the read/write logic
 * for the active_project DB pin.
 *
 * Resolution order at hook time:
 *   1. cwd matches /home/lobster/projects/<name>[/<subname>] → that's it
 *      (most reliable signal: user actually cd'd into the project)
 *   2. session_id row in active_project → per-session override
 *   3. '_global' row → system-wide default (set by deploy scripts)
 *   4. null → ASK MOE (with recent-by-mtime hint)
 *
 * Tables consumed:
 *   - active_project (this service writes here)
 *
 * No filesystem flat-files. No ~/.claude/* state files. Porter Brain is
 * the single source of truth for which project the user is working on.
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const PROJECTS_ROOT = '/home/lobster/projects';

export type ActiveProject = {
  project: string;            // e.g. 'ymc.capital' (case-sensitive directory name)
  subproject: string | null;  // e.g. 'tom' or 'Stablekey' (nested directory) or null
  source: 'cwd' | 'session' | 'global' | 'none';
  checkpoint_path: string | null;
  checkpoint_excerpt: string | null;
  git_log: string | null;
};

export type ProjectHint = {
  project: string;
  subproject: string | null;
  checkpoint_mtime: number;
};

function safeName(s: string): string | null {
  // Project / subproject names are filesystem directory names.
  // Allow alphanumerics, dot, dash, underscore, space. Reject .. or slash.
  if (!s) return null;
  if (s.includes('/') || s.includes('..') || s.length > 64) return null;
  if (!/^[A-Za-z0-9._\- ]+$/.test(s)) return null;
  return s;
}

function projectDir(project: string, subproject: string | null): string | null {
  const p = safeName(project);
  if (!p) return null;
  const base = path.join(PROJECTS_ROOT, p);
  if (!fs.existsSync(base)) return null;
  if (!subproject) return base;
  const s = safeName(subproject);
  if (!s) return base;
  const sub = path.join(base, s);
  return fs.existsSync(sub) ? sub : base;
}

function readCheckpoint(dir: string): { path: string; excerpt: string } | null {
  const candidates = [
    path.join(dir, 'CHECKPOINT.md'),
    path.join(dir, 'tasks', 'checkpoint.md'),
  ];
  for (const p of candidates) {
    try {
      const text = fs.readFileSync(p, 'utf8');
      return { path: p, excerpt: text.slice(0, 1800) };
    } catch {}
  }
  return null;
}

function readGitLog(dir: string): string | null {
  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    return execSync('git log --oneline -5 --format="%h %s (%ar)"', {
      cwd: dir,
      encoding: 'utf8',
      timeout: 3000,
    }).trim();
  } catch {
    return null;
  }
}

/** Parse a cwd into (project, subproject) — null if outside /home/lobster/projects */
export function parseCwd(cwd: string | null | undefined): { project: string; subproject: string | null } | null {
  if (!cwd) return null;
  const m = cwd.match(/^\/home\/lobster\/projects\/([^/]+)(?:\/([^/]+))?(?:\/|$)/);
  if (!m) return null;
  const project = m[1];
  const subproject = m[2] || null;
  // Reject 'subprojects' / 'src' / 'node_modules' / etc as false sub-projects
  const directoryNoise = new Set(['src', 'node_modules', 'dist', 'build', 'public', 'admin', 'backend', 'site', 'tests', 'scripts', 'tasks', '.git', '.coordination', 'docs', 'planning', '.planning', 'tom', 'research', 'subprojects']);
  if (subproject && directoryNoise.has(subproject)) return { project, subproject: null };
  return { project, subproject };
}

/** Read the active project pin (per-session first, then global). */
async function readPin(pool: pg.Pool, sessionId: string | null): Promise<{ project: string; subproject: string | null; source: 'session' | 'global' } | null> {
  if (sessionId) {
    try {
      const r = await pool.query(
        `SELECT project, subproject FROM active_project WHERE scope = $1`,
        [sessionId],
      );
      if (r.rowCount && r.rows[0]) {
        return { project: r.rows[0].project, subproject: r.rows[0].subproject, source: 'session' };
      }
    } catch {}
  }
  try {
    const r = await pool.query(
      `SELECT project, subproject FROM active_project WHERE scope = '_global'`,
    );
    if (r.rowCount && r.rows[0]) {
      return { project: r.rows[0].project, subproject: r.rows[0].subproject, source: 'global' };
    }
  } catch {}
  return null;
}

/** Top-3 projects by CHECKPOINT.md mtime — fallback when no pin and no cwd hint. */
export function recentProjects(): ProjectHint[] {
  try {
    const dirs = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory());
    const hits: ProjectHint[] = [];
    for (const d of dirs) {
      const ckpt = path.join(PROJECTS_ROOT, d.name, 'CHECKPOINT.md');
      try {
        const stat = fs.statSync(ckpt);
        hits.push({ project: d.name, subproject: null, checkpoint_mtime: stat.mtimeMs });
      } catch {}
    }
    return hits.sort((a, b) => b.checkpoint_mtime - a.checkpoint_mtime).slice(0, 3);
  } catch {
    return [];
  }
}

/** Resolve active project for a session. Priority: cwd → session pin → global pin → null. */
export async function resolveActiveProject(
  pool: pg.Pool,
  opts: { cwd?: string | null; sessionId?: string | null } = {},
): Promise<ActiveProject> {
  // 1) cwd takes priority — user has cd'd into a project, that's authoritative
  const fromCwd = parseCwd(opts.cwd);
  if (fromCwd) {
    const dir = projectDir(fromCwd.project, fromCwd.subproject);
    if (dir) {
      const ckpt = readCheckpoint(dir);
      return {
        project: fromCwd.project,
        subproject: fromCwd.subproject,
        source: 'cwd',
        checkpoint_path: ckpt?.path ?? null,
        checkpoint_excerpt: ckpt?.excerpt ?? null,
        git_log: readGitLog(dir),
      };
    }
  }

  // 2 + 3) DB pin
  const pinned = await readPin(pool, opts.sessionId ?? null);
  if (pinned) {
    const dir = projectDir(pinned.project, pinned.subproject);
    if (dir) {
      const ckpt = readCheckpoint(dir);
      return {
        project: pinned.project,
        subproject: pinned.subproject,
        source: pinned.source,
        checkpoint_path: ckpt?.path ?? null,
        checkpoint_excerpt: ckpt?.excerpt ?? null,
        git_log: readGitLog(dir),
      };
    }
  }

  // 4) unresolved
  return {
    project: '',
    subproject: null,
    source: 'none',
    checkpoint_path: null,
    checkpoint_excerpt: null,
    git_log: null,
  };
}

/** UPSERT pin. scope='_global' or session_id. */
export async function setActiveProject(
  pool: pg.Pool,
  args: { project: string; subproject?: string | null; sessionId?: string | null; setBy?: string | null },
): Promise<{ scope: string; project: string; subproject: string | null }> {
  const project = safeName(args.project);
  if (!project) throw new Error('Invalid project name');
  const subproject = args.subproject ? safeName(args.subproject) : null;
  // Verify the directory exists. We don't allow pinning to a non-existent peer.
  if (!projectDir(project, subproject)) throw new Error(`Project not found at ${PROJECTS_ROOT}/${project}${subproject ? '/' + subproject : ''}`);

  const scope = args.sessionId || '_global';
  await pool.query(
    `INSERT INTO active_project (scope, project, subproject, set_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (scope) DO UPDATE SET project = EXCLUDED.project, subproject = EXCLUDED.subproject, set_by = EXCLUDED.set_by, set_at = NOW()`,
    [scope, project, subproject, args.setBy ?? null],
  );
  return { scope, project, subproject };
}

/** Clear pin (per-session or global). */
export async function clearActiveProject(pool: pg.Pool, sessionId?: string | null): Promise<void> {
  const scope = sessionId || '_global';
  await pool.query(`DELETE FROM active_project WHERE scope = $1`, [scope]);
}
