/**
 * concept-usage.ts — record that a concept actually reached a model.
 *
 * WHY THIS EXISTS
 * ---------------
 * `concepts.use_count` and `concepts.last_used_at` have existed since the
 * Memory V3 schema and NOTHING has ever written to them. Every one of the 1,053
 * concepts on this box reads use_count = 0, last_used_at = NULL.
 *
 * That is not a cosmetic gap, because the pruner acts on it:
 *
 *   archiveUnusedConcepts()  →  WHERE use_count = 0
 *                                 AND created_at < now - 30d
 *                                 AND source_type <> 'vault'
 *
 * With use_count permanently 0 that predicate reduces to "archive every
 * non-vault concept older than 30 days" — a blanket expiry wearing the name of
 * a usage-based pruner. It has fired 621 times. 877 of 879 non-vault concepts
 * are archived; the only durable knowledge that survives is vault-sourced,
 * because vault rows are explicitly exempt. The system learned, then deleted
 * what it learned on a timer, and could never compound.
 *
 * WHAT COUNTS AS "USED"
 * ---------------------
 * Only concepts that were actually RENDERED into a payload a model receives —
 * never merely selected. `/context` fetches 20 and renders 8; tier 6 of the
 * dispatch builder fetches 10 and appends until the token budget runs out.
 * Counting the fetched set would make use_count another number that means
 * nothing, which is the exact failure this file exists to fix.
 *
 * "Reached the model" is a proxy for "was useful" — but it is a real signal,
 * and it makes the pruner's stated rule true instead of decorative.
 */

import { pool } from '../../db/client.js';

/** Defensive cap — a payload should never carry more than a few dozen concepts. */
const MAX_IDS = 100;

/**
 * Record usage for concepts that were rendered into a prompt.
 *
 * Fire-and-forget by contract: this runs on the SessionStart hot path and on
 * every dispatch, so it must never block a response and never throw. A failure
 * to count is a lost signal, not a failed session — but it is logged, because a
 * counter that silently stops writing is how this bug started.
 */
export function recordConceptUsage(ids: Array<string | null | undefined>): void {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    .slice(0, MAX_IDS);
  if (unique.length === 0) return;

  void pool
    .query(
      `UPDATE concepts
          SET use_count = COALESCE(use_count, 0) + 1,
              last_used_at = EXTRACT(EPOCH FROM NOW())
        WHERE id = ANY($1::text[])`,
      [unique],
    )
    .catch((e) => {
      console.error('[concept-usage] failed to record usage (non-fatal):', e instanceof Error ? e.message : e);
    });
}
