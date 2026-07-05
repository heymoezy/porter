/**
 * Intellect Memory Pruner
 *
 * Daily cleanup so memory stays fresh, dedup'd, and small.
 *
 * What gets pruned (and why):
 *
 *   1. Unused concepts (use_count = 0, age > 30d)
 *      → Concepts that nothing has ever recalled are dead weight in /context.
 *      Move to status='archived', keep the row for auditability.
 *
 *   2. Duplicate active directives (same scope, similarity >= 0.85)
 *      → Two directives saying the same thing waste injection budget. The
 *      newer one wins; the older becomes status='superseded' with
 *      superseded_by_id pointing at the survivor.
 *
 *   3. Superseded memories older than 7 days
 *      → After 7 days the supersession is effectively permanent. Drop them
 *      to free index space.
 *
 *   4. Old episodes (> 30 days)
 *      → Compact: keep summary + duration_seconds, drop the bulky JSONB
 *      payloads (decisions/corrections/files_changed).
 *
 *   5. Stale-pattern fix (legacy /documents/ paths, etc.)
 *      → Catch any newly-introduced stale patterns Phase 1 missed.
 *
 *   6. Resolved broken references
 *      → A `memory_references` row marked broken whose source memory is
 *      now archived/superseded can be deleted.
 *
 * Idempotent. Safe to run repeatedly. All actions logged to intellect_events.
 */

import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';

const UNUSED_CONCEPT_AGE_DAYS = 30;
const SUPERSEDED_AGE_DAYS = 7;
const EPISODE_COMPACT_AGE_DAYS = 30;
const DIRECTIVE_DUP_SIMILARITY = 0.85;

export interface PrunerStats {
  conceptsArchived: number;
  directivesDeduped: number;
  supersededDeleted: number;
  episodesCompacted: number;
  staleFixed: number;
  brokenRefsCleaned: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Cheap word-set similarity, same approach as correction-detector.
 * Returns the fraction of the shorter set that overlaps with the longer.
 */
function similarity(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 4)
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

// ── Pruning steps ───────────────────────────────────────────────────────

async function archiveUnusedConcepts(): Promise<number> {
  const cutoff = Date.now() / 1000 - UNUSED_CONCEPT_AGE_DAYS * 86400;
  // Memory-unification U2 (2026-07-05): vault-sourced concepts are EXEMPT from
  // unused/use_count pruning — their truth lives in the vault, not in use_count.
  // The vault-indexer archives them when the vault node is deleted.
  const { rows } = await pool.query<{ id: string; content: string }>(
    `UPDATE concepts
     SET status = 'archived', updated_at = EXTRACT(EPOCH FROM NOW())
     WHERE status = 'active'
       AND use_count = 0
       AND created_at < $1
       AND source_type <> 'vault'
     RETURNING id, content`,
    [cutoff]
  );
  for (const row of rows) {
    await logIntellectEvent('memory_pruned', 'memory_pruner', {
      action: 'concept_archived',
      reason: 'unused_30d',
      conceptId: row.id,
      preview: row.content.slice(0, 120),
    });
  }
  return rows.length;
}

async function dedupeActiveDirectives(): Promise<number> {
  const { rows: directives } = await pool.query<{
    id: string;
    scope: string;
    scope_id: string | null;
    content: string;
    created_at: number;
    priority: number;
    source_type: string;
  }>(
    `SELECT id, scope, scope_id, content, created_at, priority, source_type
     FROM directives
     WHERE status = 'active'
     ORDER BY scope, scope_id NULLS FIRST, created_at ASC`
  );

  // Group by (scope, scope_id) for cheaper N² inside each bucket
  const buckets = new Map<string, typeof directives>();
  for (const d of directives) {
    const key = `${d.scope}|${d.scope_id ?? ''}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(d);
    buckets.set(key, bucket);
  }

  let deduped = 0;
  for (const bucket of buckets.values()) {
    // Compare each pair within the bucket. The newer one (higher created_at)
    // is the survivor — Moe's most recent phrasing of the rule.
    for (let i = 0; i < bucket.length; i++) {
      const a = bucket[i];
      // Skip if a was already retired in this pass
      if ((a as any)._retired) continue;
      // PR-1 (2026-07-04): moe-direct rows are SEALED by trigger — a dedup
      // UPDATE against one aborts the whole nightly run (failing since 05-09
      // on test debris). Never auto-dedup Moe's own rules; only agent/dream
      // output is fair game.
      if (a.source_type === 'moe-direct') continue;
      for (let j = i + 1; j < bucket.length; j++) {
        const b = bucket[j];
        if ((b as any)._retired) continue;
        if (b.source_type === 'moe-direct') continue;
        const sim = similarity(a.content, b.content);
        if (sim >= DIRECTIVE_DUP_SIMILARITY) {
          try { // PR-1: one sealed/failed pair must never abort the run
          // Newer wins. Mark the older one superseded.
          const older = a.created_at < b.created_at ? a : b;
          const newer = older === a ? b : a;
          await pool.query(
            `UPDATE directives
             SET status = 'superseded',
                 supersedes_id = NULL,
                 updated_at = EXTRACT(EPOCH FROM NOW())
             WHERE id = $1`,
            [older.id]
          );
          // Update the survivor to point at what it replaced (audit trail)
          await pool.query(
            `UPDATE directives
             SET supersedes_id = $1,
                 priority = GREATEST(priority, $2),
                 updated_at = EXTRACT(EPOCH FROM NOW())
             WHERE id = $3`,
            [older.id, older.priority, newer.id]
          );
          await logIntellectEvent('memory_pruned', 'memory_pruner', {
            action: 'directive_deduped',
            keptId: newer.id,
            retiredId: older.id,
            similarity: Number(sim.toFixed(3)),
            preview: newer.content.slice(0, 120),
          });
          (older as any)._retired = true;
          deduped++;
          if (older === a) break; // a is gone, move to next i
          } catch (e) {
            // PR-1: log and keep pruning — a single bad pair (sealed row,
            // trigger, constraint) must not kill the nightly run.
            console.warn('[memory-pruner] dedup pair failed, continuing:', e instanceof Error ? e.message : e);
          }
        }
      }
    }
  }

  return deduped;
}

async function deleteOldSupersededMemories(): Promise<number> {
  const cutoff = Date.now() / 1000 - SUPERSEDED_AGE_DAYS * 86400;
  let total = 0;

  // Directives
  const dr = await pool.query<{ id: string }>(
    `DELETE FROM directives WHERE status = 'superseded' AND updated_at < $1 RETURNING id`,
    [cutoff]
  );
  total += dr.rowCount ?? 0;

  // Concepts
  const cr = await pool.query<{ id: string }>(
    `DELETE FROM concepts WHERE status = 'superseded' AND updated_at < $1 RETURNING id`,
    [cutoff]
  );
  total += cr.rowCount ?? 0;

  if (total > 0) {
    await logIntellectEvent('memory_pruned', 'memory_pruner', {
      action: 'superseded_deleted',
      directives: dr.rowCount ?? 0,
      concepts: cr.rowCount ?? 0,
    });
  }

  return total;
}

async function compactOldEpisodes(): Promise<number> {
  const cutoff = Date.now() / 1000 - EPISODE_COMPACT_AGE_DAYS * 86400;
  const { rowCount } = await pool.query(
    `UPDATE episodes
     SET decisions_json = '[]'::jsonb,
         corrections_json = '[]'::jsonb,
         files_changed_json = '[]'::jsonb
     WHERE created_at < $1
       AND (jsonb_array_length(decisions_json) > 0
            OR jsonb_array_length(corrections_json) > 0
            OR jsonb_array_length(files_changed_json) > 0)`,
    [cutoff]
  );
  if (rowCount && rowCount > 0) {
    await logIntellectEvent('memory_pruned', 'memory_pruner', {
      action: 'episodes_compacted',
      count: rowCount,
    });
  }
  return rowCount ?? 0;
}

async function fixKnownStalePatterns(): Promise<number> {
  let total = 0;
  // Catch /documents/ → /projects/ regressions in any active memory
  for (const table of ['directives', 'concepts', 'project_notes', 'agent_notes']) {
    const { rowCount } = await pool.query(
      `UPDATE ${table}
       SET content = REPLACE(content, '/documents/', '/projects/'),
           updated_at = EXTRACT(EPOCH FROM NOW())
       WHERE content LIKE '%/documents/%' AND status = 'active'`
    );
    total += rowCount ?? 0;
  }
  if (total > 0) {
    await logIntellectEvent('memory_pruned', 'memory_pruner', {
      action: 'stale_pattern_fixed',
      pattern: '/documents/ → /projects/',
      count: total,
    });
  }
  return total;
}

async function cleanupDeadReferences(): Promise<number> {
  // memory_references whose source memory no longer exists or is archived/superseded
  const { rowCount } = await pool.query(
    `DELETE FROM memory_references mr
     WHERE NOT EXISTS (
       SELECT 1 FROM directives d WHERE d.id = mr.memory_id AND d.status = 'active' AND mr.memory_table = 'directives'
     ) AND mr.memory_table = 'directives'
     OR NOT EXISTS (
       SELECT 1 FROM concepts c WHERE c.id = mr.memory_id AND c.status = 'active' AND mr.memory_table = 'concepts'
     ) AND mr.memory_table = 'concepts'`
  );
  return rowCount ?? 0;
}

// ── Main entry point ────────────────────────────────────────────────────

export async function runMemoryPruning(): Promise<PrunerStats> {
  const conceptsArchived = await archiveUnusedConcepts();
  const directivesDeduped = await dedupeActiveDirectives();
  const supersededDeleted = await deleteOldSupersededMemories();
  const episodesCompacted = await compactOldEpisodes();
  const staleFixed = await fixKnownStalePatterns();
  const brokenRefsCleaned = await cleanupDeadReferences();

  const stats: PrunerStats = {
    conceptsArchived,
    directivesDeduped,
    supersededDeleted,
    episodesCompacted,
    staleFixed,
    brokenRefsCleaned,
  };

  if (Object.values(stats).some(v => v > 0)) {
    console.log(
      `[intellect:pruner] sweep complete: ${conceptsArchived} concepts archived, ${directivesDeduped} directives deduped, ${supersededDeleted} superseded deleted, ${episodesCompacted} episodes compacted, ${staleFixed} stale fixed, ${brokenRefsCleaned} dead refs cleaned`
    );
    await logIntellectEvent('pruner_swept', 'memory_pruner', { ...stats });
  }

  return stats;
}
