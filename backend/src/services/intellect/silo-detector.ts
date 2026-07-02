/**
 * silo-detector.ts — Phase 48.1 Silo Foundation
 *
 * Server-side, deterministic silo detection. No model dispatch.
 *
 * Algorithm (per .planning/phases/48.1-silo-foundation/48.1-CONTEXT.md):
 *   1. If session has an override row in session_silo_overrides (≤24h old) → use it.
 *   2. Project-type lookup: SELECT type FROM projects WHERE fs_path matches cwd prefix.
 *      Match against each silo's detect_rules.project_types.
 *   3. cwd_markers fallback: filesystem-stat check for each marker in detect_rules.cwd_markers.
 *   4. Multi-silo: aggregate all matches (dedup by id).
 *   5. No match → return [].
 *
 * Cache: enabled silos are loaded into memory at startup via loadSiloCache().
 * Reload via reloadSiloCache() when silos table changes (admin-mediated).
 *
 * Phase 49 LRN-04 adds:
 *   - detectProject(cwd): pure function returning project slug from
 *     /home/lobster/projects/<X>/... or null otherwise. Mirrors the
 *     production hook regex at ~/.claude/hooks/porter-session-start.js:21-27.
 *     Operates on cwd as-supplied — no symlink resolution, by design.
 *   - detectContext(args, pool): convenience composite returning both
 *     silos + projectId in one call. Used by /context (intellect.ts) to
 *     layer project directives on top of silo directives.
 */

import fs from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { resolveActiveProject } from './active-project.js';

export interface DetectedSilo {
  id: string;
  displayName: string;
}

interface SiloCacheEntry {
  id: string;
  displayName: string;
  detectRules: {
    project_types?: string[];
    file_globs?: string[];
    cwd_markers?: string[];
  };
}

let cache: SiloCacheEntry[] = [];
let cacheLoaded = false;

export async function loadSiloCache(pool: pg.Pool): Promise<void> {
  const result = await pool.query<{ id: string; display_name: string; detect_rules: SiloCacheEntry['detectRules'] }>(
    `SELECT id, display_name, detect_rules FROM silos WHERE enabled = TRUE`,
  );
  cache = result.rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    detectRules: r.detect_rules || {},
  }));
  cacheLoaded = true;
  console.log(`[silo-detector] cache loaded — ${cache.length} enabled silo(s)`);
}

export async function reloadSiloCache(pool: pg.Pool): Promise<void> {
  await loadSiloCache(pool);
}

function ensureCacheLoaded(pool: pg.Pool): Promise<void> {
  if (cacheLoaded) return Promise.resolve();
  return loadSiloCache(pool);
}

export interface DetectArgs {
  cwd?: string | null;
  projectName?: string | null;
  sessionId?: string | null;
}

export async function detectSilos(args: DetectArgs, pool: pg.Pool): Promise<DetectedSilo[]> {
  await ensureCacheLoaded(pool);

  const cwd = args.cwd?.trim() || '';
  const sessionId = args.sessionId?.trim() || '';

  // 1. Override path -------------------------------------------------------
  if (sessionId) {
    const override = await pool.query<{ silo_id: string | null }>(
      `SELECT silo_id FROM session_silo_overrides
       WHERE session_id = $1 AND set_at > NOW() - INTERVAL '24 hours'`,
      [sessionId],
    );
    if (override.rowCount && override.rowCount > 0) {
      const row = override.rows[0];
      if (row.silo_id === null) return []; // explicit "none"
      const entry = cache.find((s) => s.id === row.silo_id);
      if (entry) return [{ id: entry.id, displayName: entry.displayName }];
      return [];
    }
  }

  if (!cwd) return [];

  const matches = new Map<string, DetectedSilo>();

  // 2. Project-type lookup -------------------------------------------------
  let projectType: string | null = null;
  try {
    const projRes = await pool.query<{ type: string }>(
      `SELECT type FROM projects WHERE fs_path IS NOT NULL AND $1 LIKE fs_path || '%' LIMIT 1`,
      [cwd],
    );
    if (projRes.rowCount && projRes.rowCount > 0) {
      projectType = projRes.rows[0].type;
    }
  } catch {
    projectType = null;
  }

  for (const silo of cache) {
    const types = silo.detectRules.project_types || [];
    if (projectType && types.includes(projectType)) {
      matches.set(silo.id, { id: silo.id, displayName: silo.displayName });
    }
  }

  // 3. cwd_markers fallback ------------------------------------------------
  for (const silo of cache) {
    if (matches.has(silo.id)) continue;
    const markers = silo.detectRules.cwd_markers || [];
    for (const marker of markers) {
      try {
        if (fs.existsSync(path.join(cwd, marker))) {
          matches.set(silo.id, { id: silo.id, displayName: silo.displayName });
          break;
        }
      } catch {
        // ignore — non-existent or permission denied paths just mean no match
      }
    }
  }

  return Array.from(matches.values());
}

// ── LRN-04 (Phase 49): server-side project-id derivation ─────────────────────
//
// Mirrors the production hook regex AND raw-cwd semantics at
// ~/.claude/hooks/porter-session-start.js:21-27. Identical pattern; deliberate
// duplication so the hook stays independent of backend availability. Phase 50
// may extract a shared helper if cross-process sharing becomes practical, but
// cross-runtime (bash/node hook vs node server) makes that non-trivial today.
// See 49-RESEARCH.md Risk 6 + Open Question 6.
//
// SYMLINK BEHAVIOR — INTENTIONAL:
//   detectProject operates on cwd AS-SUPPLIED. No fs.realpathSync, no symlink
//   resolution. This matches the porter-session-start.js hook precedent which
//   uses raw process.cwd(). Consequence: if a session's cwd is a symlink target
//   that resolves outside /home/lobster/projects/ (e.g. /home/websites/ymc.capital
//   even when reachable via /home/lobster/projects/ymc.capital → /home/websites/...),
//   this function returns null. Callers responsible for symlink resolution if
//   needed — call fs.realpathSync BEFORE invoking detectProject.
//
// NOTE on /i flag: NOT used here. The hook regex is case-sensitive on the
// `/home/lobster/projects/` prefix (it is a Linux path, case-sensitive by file
// system). Project slugs preserve case (`ymc.capital` lowercase, `Baan Yin Dee`
// title case) because the regex captures `[^/]+` verbatim — case is preserved
// by JavaScript's match group, not normalized.

const PROJECT_CWD_REGEX = /^\/home\/lobster\/projects\/([^/]+)/;

/**
 * Derive a project slug from cwd. Pure function — no I/O, no async.
 *
 * Operates on cwd AS-SUPPLIED. Does NOT call fs.realpathSync; does NOT resolve
 * symlinks. This is deliberate: mirrors the porter-session-start.js hook
 * precedent (which uses raw process.cwd()) so backend and hook stay in lockstep
 * on what counts as "the project for this session".
 *
 * If you need symlink resolution, call fs.realpathSync(cwd) BEFORE this function.
 *
 * @returns project slug (everything between /home/lobster/projects/ and the next /),
 *          or null for any cwd outside that hardcoded prefix.
 */
export function detectProject(cwd: string | null | undefined): string | null {
  if (!cwd || typeof cwd !== 'string') return null;
  const trimmed = cwd.trim();
  if (!trimmed) return null;
  const m = trimmed.match(PROJECT_CWD_REGEX);
  return m ? m[1] : null;
}

export interface DetectedContext {
  silos: DetectedSilo[];
  projectId: string | null;
}

export async function detectContext(
  args: DetectArgs,
  pool: pg.Pool,
): Promise<DetectedContext> {
  const silos = await detectSilos(args, pool);
  let projectId = detectProject(args.cwd);
  // R8: when cwd doesn't resolve a project (e.g. a session pinned from /home/lobster),
  // fall back to the active-project pin (session-row → _global-row). cwd stays authoritative.
  if (!projectId) {
    try {
      const active = await resolveActiveProject(pool, { cwd: args.cwd, sessionId: args.sessionId });
      if (active && active.source !== 'none') projectId = active.project;
    } catch {
      /* fail-open: never break context detection on a pin-resolution error */
    }
  }
  return { silos, projectId };
}
