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
 */

import fs from 'node:fs';
import path from 'node:path';
import type pg from 'pg';

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
