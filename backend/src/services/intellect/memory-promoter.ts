/**
 * Intellect Memory Promoter
 *
 * Escalates candidate memory into active memory when reinforcement signals
 * pile up. Runs on a schedule (not per-event) so that bursts of activity
 * don't thrash.
 *
 * Promotion rules (Phase 2):
 *
 *   Directive candidates:
 *     - status='candidate' + priority >= 80  → promote to status='active'
 *       (The correction-detector bumps priority by +10 every reinforcement,
 *        starting from 60 — so this fires after 2 reinforcement events.)
 *     - status='candidate' + age > 14 days + priority < 80  → archive
 *       (A correction that was never reinforced is probably a one-off.)
 *
 *   Concepts:
 *     - Repeated high-quality dispatches for the same (project, intent) that
 *       the session_analyzer flagged as notable → concept candidate
 *       (Phase 3 — noted here for future wiring.)
 */

import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';

const PROMOTION_PRIORITY_THRESHOLD = 80;
const ARCHIVE_AGE_DAYS = 14;

export interface PromoterResult {
  promoted: number;
  archived: number;
  scanned: number;
}

/**
 * One pass of the promoter. Idempotent, safe to call from scheduler.
 */
export async function runMemoryPromotion(): Promise<PromoterResult> {
  const now = Date.now() / 1000;
  const archiveCutoff = now - ARCHIVE_AGE_DAYS * 86400;

  // ── Count candidates scanned ─────────────────────────────────────────
  const { rows: candCount } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM directives WHERE status = 'candidate'`
  );
  const scanned = parseInt(candCount[0]?.count ?? '0', 10);

  // ── Promote reinforced candidates ────────────────────────────────────
  const { rows: promoted } = await pool.query<{ id: string; content: string; scope: string }>(
    `UPDATE directives
     SET status = 'active',
         verified_at = EXTRACT(EPOCH FROM NOW()),
         updated_at = EXTRACT(EPOCH FROM NOW())
     WHERE status = 'candidate' AND priority >= $1
     RETURNING id, content, scope`,
    [PROMOTION_PRIORITY_THRESHOLD]
  );

  for (const row of promoted) {
    await logIntellectEvent('directive_promoted', 'memory_promoter', {
      directiveId: row.id,
      scope: row.scope,
      content: row.content.slice(0, 200),
      reason: `priority >= ${PROMOTION_PRIORITY_THRESHOLD}`,
    });
  }

  // ── Archive stale un-reinforced candidates ───────────────────────────
  const { rows: archived } = await pool.query<{ id: string; content: string }>(
    `UPDATE directives
     SET status = 'archived',
         updated_at = EXTRACT(EPOCH FROM NOW())
     WHERE status = 'candidate'
       AND priority < $1
       AND created_at < $2
     RETURNING id, content`,
    [PROMOTION_PRIORITY_THRESHOLD, archiveCutoff]
  );

  for (const row of archived) {
    await logIntellectEvent('directive_archived', 'memory_promoter', {
      directiveId: row.id,
      content: row.content.slice(0, 200),
      reason: `candidate unreinforced for ${ARCHIVE_AGE_DAYS}d`,
    });
  }

  const result: PromoterResult = {
    promoted: promoted.length,
    archived: archived.length,
    scanned,
  };

  if (result.promoted > 0 || result.archived > 0) {
    console.log(
      `[intellect:promoter] scanned ${result.scanned} candidates, promoted ${result.promoted}, archived ${result.archived}`
    );
  }

  return result;
}
