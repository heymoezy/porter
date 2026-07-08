/**
 * memory-snapshot.ts — Session Intelligence: Phase 41 (SIN-01)
 *
 * Frozen memory cache: compute memory context once per session (at first dispatch),
 * then serve the same snapshot for every subsequent dispatch in that session.
 *
 * This ensures the system prompt memory section is byte-identical from turn 1 to turn N,
 * preventing mid-session memory mutations from destabilising ongoing conversations.
 *
 * Two-layer cache:
 *   1. In-memory LRU Map (fast, no DB round-trip)
 *   2. DB column session_registry.memory_snapshot (survives process restart)
 */

import { pool } from '../db/client.js';
import { resolveInjectedMemoryContext } from './memory-injection-v2.js';

// ── LRU In-Memory Cache ───────────────────────────────────────────────────────

const MAX_CACHE_SIZE = 200;
// Map preserves insertion order — oldest entry is first
const snapshotCache = new Map<string, string>();

/**
 * Evict oldest entries when cache exceeds MAX_CACHE_SIZE.
 */
function evictIfNeeded(): void {
  while (snapshotCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = snapshotCache.keys().next().value;
    if (oldestKey !== undefined) {
      snapshotCache.delete(oldestKey);
    } else {
      break;
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SnapshotOpts {
  agentId?: string;
  projectId?: string;
  searchQuery?: string;
  taskText?: string;
  skillTags?: string[];
}

export interface SnapshotResult {
  text: string;
  wasCached: boolean;
}

/**
 * Return frozen memory snapshot for a session.
 *
 * Priority:
 *   1. In-memory cache hit → return immediately (wasCached: true)
 *   2. DB hit (session_registry.memory_snapshot) → populate cache, return (wasCached: true)
 *   3. Miss → call buildMemoryContext once, persist to DB, populate cache (wasCached: false)
 */
export async function getOrBuildSnapshot(
  sessionId: string,
  opts: SnapshotOpts,
): Promise<SnapshotResult> {
  // Layer 1: in-memory cache
  const cached = snapshotCache.get(sessionId);
  if (cached !== undefined) {
    // Refresh LRU position by deleting and re-inserting
    snapshotCache.delete(sessionId);
    snapshotCache.set(sessionId, cached);
    return { text: cached, wasCached: true };
  }

  // Layer 2: DB — check if already frozen from a prior process lifetime
  try {
    const { rows } = await pool.query<{ memory_snapshot: string }>(
      `SELECT memory_snapshot FROM session_registry WHERE id = $1 AND memory_snapshot IS NOT NULL`,
      [sessionId],
    );
    if (rows.length > 0 && rows[0].memory_snapshot) {
      evictIfNeeded();
      snapshotCache.set(sessionId, rows[0].memory_snapshot);
      return { text: rows[0].memory_snapshot, wasCached: true };
    }
  } catch (err) {
    // DB lookup failure is non-fatal — fall through to build
    console.error('[memory-snapshot] DB lookup failed, building fresh:', err instanceof Error ? err.message : err);
  }

  // Layer 3: cache miss — build once and freeze.
  // R4.1: drop-in wrapper; both injection flags OFF (default) → byte-identical
  // to buildMemoryContext(...). Shadow/canary only activate when flagged.
  const fresh = await resolveInjectedMemoryContext({
    agentId: opts.agentId,
    projectId: opts.projectId,
    searchQuery: opts.searchQuery,
    taskText: opts.taskText,
    skillTags: opts.skillTags,
  });

  // Persist to DB (non-fatal if it fails — in-memory cache will still serve it)
  try {
    await pool.query(
      `UPDATE session_registry
         SET memory_snapshot = $1,
             frozen_at = EXTRACT(EPOCH FROM NOW())
       WHERE id = $2`,
      [fresh, sessionId],
    );
  } catch (err) {
    console.error('[memory-snapshot] failed to persist snapshot to DB:', err instanceof Error ? err.message : err);
  }

  evictIfNeeded();
  snapshotCache.set(sessionId, fresh);
  return { text: fresh, wasCached: false };
}

/**
 * Remove a session's snapshot from the in-memory cache.
 * Called when a session is rotated so the new session gets fresh memory.
 */
export function clearSnapshot(sessionId: string): void {
  snapshotCache.delete(sessionId);
}
