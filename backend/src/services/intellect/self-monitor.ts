/**
 * Intellect Self-Monitor
 *
 * Porter watching Porter. Tracks whether the autonomous loop is actually
 * working, so Moe (and Porter itself, eventually) can tell at a glance
 * whether Intellect is healthy or stagnating.
 *
 * Six health signals, computed on-demand from existing tables:
 *
 *   1. Corrections trend
 *      - Count of correction_detected events per day for the last 14 days.
 *      - If the count is decreasing, Porter is getting smarter (Moe is
 *        repeating himself less). If flat or rising, the rules being
 *        captured aren't sticking.
 *
 *   2. Memory hit rate
 *      - Active directives count vs concepts.use_count growth.
 *      - "Are the memories Porter stores actually being recalled?"
 *
 *   3. Validator accuracy
 *      - memory_auto_fixed events vs memory_stale events in last 7 days.
 *      - High auto_fixed:stale ratio = validator catching renames cleanly.
 *      - Lots of stale + few auto_fixed = validator surfacing real rot.
 *
 *   4. Workflow health
 *      - For each enabled workflow: last_run_at, run_count, recent failures.
 *      - Surfaces wedged workflows (run_count not advancing) or noisy ones
 *        (workflow_failed events accumulating).
 *
 *   5. Promotion velocity
 *      - directive_promoted events per week / total candidates created.
 *      - Tells you if the promoter threshold is too high (candidates
 *        accumulate) or too low (every correction becomes a directive).
 *
 *   6. Episode coverage
 *      - Episodes created in last 7 days / sessions seen in last 7 days.
 *      - Should be ~1.0; lower = sessions ending without analysis.
 *
 * The output is a flat snapshot dict — easy to render as cards in the UI.
 * No state is stored; this is a pure read.
 */

import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';

export interface SelfMonitorSnapshot {
  generatedAt: number;

  corrections: {
    daily: Array<{ day: string; count: number }>;
    last7d: number;
    prev7d: number;
    trend: 'improving' | 'flat' | 'rising' | 'unknown';
  };

  memoryHitRate: {
    activeDirectives: number;
    activeConcepts: number;
    conceptsRecalledLast7d: number;
    avgConceptUseCount: number;
  };

  validator: {
    autoFixed7d: number;
    stale7d: number;
    accuracyRatio: number; // autoFixed / (autoFixed + stale)
  };

  workflows: Array<{
    name: string;
    actionType: string;
    enabled: boolean;
    runCount: number;
    lastRunAt: number | null;
    lastRunAgoSeconds: number | null;
    failures7d: number;
    health: 'healthy' | 'idle' | 'failing' | 'unknown';
  }>;

  promotion: {
    candidates: number;
    promoted7d: number;
    rejected7d: number;
    archived7d: number;
    velocity: number; // promoted / (promoted + rejected + still-pending)
  };

  episodes: {
    created7d: number;
    uniqueSessions7d: number;
    coverageRatio: number;
  };
}

export async function runSelfMonitor(): Promise<SelfMonitorSnapshot> {
  const now = Date.now() / 1000;
  const day = 86400;

  // ── 1. Corrections trend (daily for last 14 days) ──────────────────
  const { rows: dailyCorr } = await pool.query<{ day: string; count: string }>(
    `SELECT TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD') AS day,
            COUNT(*)::text AS count
     FROM intellect_events
     WHERE event_type IN ('correction_detected', 'correction_reinforced')
       AND created_at > $1
     GROUP BY day
     ORDER BY day ASC`,
    [now - 14 * day]
  );
  const dailyMap = new Map(dailyCorr.map(r => [r.day, parseInt(r.count, 10)]));
  // Backfill empty days for stable charting
  const daily: Array<{ day: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const ts = new Date((now - i * day) * 1000);
    const key = ts.toISOString().slice(0, 10);
    daily.push({ day: key, count: dailyMap.get(key) ?? 0 });
  }
  const last7d = daily.slice(-7).reduce((s, d) => s + d.count, 0);
  const prev7d = daily.slice(-14, -7).reduce((s, d) => s + d.count, 0);
  let trend: SelfMonitorSnapshot['corrections']['trend'] = 'unknown';
  if (prev7d === 0 && last7d === 0) trend = 'unknown';
  else if (prev7d === 0) trend = 'rising';
  else if (last7d < prev7d * 0.8) trend = 'improving';
  else if (last7d > prev7d * 1.2) trend = 'rising';
  else trend = 'flat';

  // ── 2. Memory hit rate ─────────────────────────────────────────────
  const { rows: memCounts } = await pool.query<{ ad: string; ac: string; recalled: string; avg_use: string | null }>(
    `SELECT
       (SELECT COUNT(*)::text FROM directives WHERE status = 'active') AS ad,
       (SELECT COUNT(*)::text FROM concepts WHERE status = 'active') AS ac,
       (SELECT COUNT(*)::text FROM concepts WHERE status = 'active' AND last_used_at > $1) AS recalled,
       (SELECT AVG(use_count)::text FROM concepts WHERE status = 'active') AS avg_use`,
    [now - 7 * day]
  );
  const memRow = memCounts[0] ?? { ad: '0', ac: '0', recalled: '0', avg_use: '0' };

  // ── 3. Validator accuracy ──────────────────────────────────────────
  const { rows: vRows } = await pool.query<{ event_type: string; count: string }>(
    `SELECT event_type, COUNT(*)::text AS count
     FROM intellect_events
     WHERE event_type IN ('memory_auto_fixed', 'memory_stale')
       AND created_at > $1
     GROUP BY event_type`,
    [now - 7 * day]
  );
  const vMap = new Map(vRows.map(r => [r.event_type, parseInt(r.count, 10)]));
  const autoFixed7d = vMap.get('memory_auto_fixed') ?? 0;
  const stale7d = vMap.get('memory_stale') ?? 0;
  const accuracyRatio = autoFixed7d + stale7d > 0
    ? autoFixed7d / (autoFixed7d + stale7d)
    : 0;

  // ── 4. Workflow health ─────────────────────────────────────────────
  const { rows: wfRows } = await pool.query<{
    id: string;
    name: string;
    action_type: string;
    enabled: boolean;
    run_count: number;
    last_run_at: number | null;
  }>(
    `SELECT id, name, action_type, enabled, run_count, last_run_at FROM workflows ORDER BY name`
  );

  // Failures per workflow id in last 7 days
  const { rows: wfFailRows } = await pool.query<{ wf_id: string; count: string }>(
    `SELECT (details_json->>'workflowId') AS wf_id, COUNT(*)::text AS count
     FROM intellect_events
     WHERE event_type = 'workflow_failed'
       AND created_at > $1
       AND details_json ? 'workflowId'
     GROUP BY wf_id`,
    [now - 7 * day]
  );
  const failByWf = new Map(wfFailRows.map(r => [r.wf_id, parseInt(r.count, 10)]));

  const workflows = wfRows.map(w => {
    const failures7d = failByWf.get(w.id) ?? 0;
    const lastRunAgoSeconds = w.last_run_at != null ? Math.round(now - w.last_run_at) : null;
    let health: SelfMonitorSnapshot['workflows'][number]['health'] = 'unknown';
    if (!w.enabled) health = 'idle';
    else if (failures7d > 5) health = 'failing';
    else if (w.last_run_at == null) health = 'idle';
    else if (lastRunAgoSeconds != null && lastRunAgoSeconds < 7 * day) health = 'healthy';
    else health = 'idle';
    return {
      name: w.name,
      actionType: w.action_type,
      enabled: w.enabled,
      runCount: w.run_count,
      lastRunAt: w.last_run_at,
      lastRunAgoSeconds,
      failures7d,
      health,
    };
  });

  // ── 5. Promotion velocity ──────────────────────────────────────────
  const { rows: promotionRows } = await pool.query<{
    candidates: string;
    promoted: string;
    archived: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM directives WHERE status = 'candidate') AS candidates,
       (SELECT COUNT(*)::text FROM intellect_events
          WHERE event_type = 'directive_promoted' AND created_at > $1) AS promoted,
       (SELECT COUNT(*)::text FROM intellect_events
          WHERE event_type = 'directive_archived' AND created_at > $1) AS archived`,
    [now - 7 * day]
  );
  const pRow = promotionRows[0] ?? { candidates: '0', promoted: '0', archived: '0' };
  const candidates = parseInt(pRow.candidates, 10);
  const promoted7d = parseInt(pRow.promoted, 10);
  const archived7d = parseInt(pRow.archived, 10);
  const totalDecisions = promoted7d + archived7d + candidates;
  const velocity = totalDecisions > 0 ? promoted7d / totalDecisions : 0;

  // ── 6. Episode coverage ────────────────────────────────────────────
  const { rows: epRows } = await pool.query<{ created: string; sessions: string }>(
    `SELECT
       (SELECT COUNT(*)::text FROM episodes WHERE created_at > $1) AS created,
       (SELECT COUNT(DISTINCT chat_id)::text FROM bridge_dispatch_log
          WHERE chat_id IS NOT NULL AND chat_id != 'unknown' AND created_at > $1) AS sessions`,
    [now - 7 * day]
  );
  const epRow = epRows[0] ?? { created: '0', sessions: '0' };
  const created7d = parseInt(epRow.created, 10);
  const uniqueSessions7d = parseInt(epRow.sessions, 10);
  const coverageRatio = uniqueSessions7d > 0 ? Math.min(1, created7d / uniqueSessions7d) : 0;

  const snapshot: SelfMonitorSnapshot = {
    generatedAt: now,
    corrections: { daily, last7d, prev7d, trend },
    memoryHitRate: {
      activeDirectives: parseInt(memRow.ad, 10),
      activeConcepts: parseInt(memRow.ac, 10),
      conceptsRecalledLast7d: parseInt(memRow.recalled, 10),
      avgConceptUseCount: parseFloat(memRow.avg_use ?? '0') || 0,
    },
    validator: { autoFixed7d, stale7d, accuracyRatio },
    workflows,
    promotion: {
      candidates,
      promoted7d,
      rejected7d: archived7d, // archived = rejected (manual or aged-out)
      archived7d,
      velocity,
    },
    episodes: { created7d, uniqueSessions7d, coverageRatio },
  };

  await logIntellectEvent('self_monitor_snapshot', 'self_monitor', {
    correctionTrend: trend,
    activeDirectives: snapshot.memoryHitRate.activeDirectives,
    validatorAccuracy: Number(accuracyRatio.toFixed(3)),
    promotionVelocity: Number(velocity.toFixed(3)),
    episodeCoverage: Number(coverageRatio.toFixed(3)),
    failingWorkflows: workflows.filter(w => w.health === 'failing').length,
  });

  return snapshot;
}
