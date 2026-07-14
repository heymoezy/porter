import { pool } from '../db/client.js';
import { config, featureFlags } from '../config.js';
import { dispatch as aiRouterDispatch } from './ai-router.js';
import { reconcileReleases } from './release-reconciler.js';
import { checkDeadlineTriggers } from './event-triggers.js';
import { syncCalendarEvents, checkCalendarDeadlines } from './calendar.js';
import { dispatchExternalCall, checkConnectionHealth } from './external-dispatcher.js';
import { runHealthProbe } from './bridge/health-probe.js';
import { refreshAllGateways } from './bridge/model-catalog.js';
import { computeEmpiricalRates } from './bridge/rate-limit-tracker.js';
import { collectLocalUsage } from './bridge/usage-collector.js';
import { getActiveSessions, rotateSession } from './session-registry.js';
import { assignJob } from './job-assignment.js';
import { runMemoryValidation } from './intellect/memory-validator.js';
import { runScheduledWorkflows } from './intellect/workflow-engine.js';
import { runDispatchScoring } from './intellect/dispatch-scorer.js';
import { runDreamWorker } from './intellect/dream-worker.js';
import { runDistillerIfDue } from './intellect/distiller.js';
import crypto from 'crypto';

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 3;
const DEADLINE_CHECK_INTERVAL = 30; // Every 60 seconds (30 ticks * 2s)
const CALENDAR_SYNC_INTERVAL = 30; // Every 60 seconds (30 ticks * 2s)
const HEALTH_PROBE_INTERVAL = 15; // 15 × 2000ms = 30s
const MODEL_REFRESH_INTERVAL = 43200; // 43200 ticks x 2s = 24h
const MEMORY_VALIDATION_INTERVAL = 900;  // 900 ticks x 2s = 30 min — validate memory references
const DISPATCH_SCORING_INTERVAL = 10800; // 10800 ticks x 2s = 6h — auto-score recent dispatches
// NOTE: there is deliberately no INTELLECT_DAILY_INTERVAL / INTELLECT_WEEKLY_INTERVAL any more.
// Counting uptime ticks to decide whether a daily or weekly job is due only works if the process
// never restarts. Porter restarts on every deploy, so those counters never reached 24h/7d and the
// jobs never fired. Long cadences now ask the database what is due (see runScheduledWorkflows).
const SILO_CADENCE_CHECK_INTERVAL = 1800; // 1800 ticks × 2s = 1h. Per-silo cadence is day-scale; hourly granularity is plenty.
const RELEASE_RECONCILE_INTERVAL = 300;   // 300 ticks × 2s = 10 min — re-assert announce for every project's current version (self-heals a skipped announce ceremony, session-independent).
const CONTEXT_PRESSURE_THRESHOLD = 0.8;
const CONTEXT_ROTATION_THRESHOLD = 0.95;
const WORKER_ID = crypto.randomUUID();
const MAX_DRIP_COUNT = 20;
let intervalId: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;

// ── Drip Reminder Scheduling ──────────────────────────────────────────────────

/**
 * Schedule a drip reminder job for a collaborator invite.
 * Cadence: first 3 drips = daily, drips 3-7 = weekly, drip 7+ = monthly.
 */
export async function scheduleDripReminder(collaboratorId: string, dripCount: number): Promise<void> {
  if (dripCount >= MAX_DRIP_COUNT) return;
  const offsetDays = dripCount < 3 ? 1 : dripCount < 7 ? 7 : 30;
  const scheduledFor = Date.now() / 1000 + offsetDays * 86400;

  await pool.query(`
    INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, status, scheduled_for, created_at)
    VALUES ($1, 'system', 'invite_drip', $2, 'pending', $3, EXTRACT(EPOCH FROM NOW()))
  `, [
    crypto.randomUUID(),
    JSON.stringify({ collaborator_id: collaboratorId }),
    scheduledFor,
  ]);
}

interface JobRow {
  id: string;
  agent_id: string;
  project_id: string | null;
  parent_agent_id: string | null;
  trigger_type: string;
  trigger_data: string;
  prompt: string | null;
  status: string;
  scheduled_for: number;
  started_at: number | null;
  completed_at: number | null;
  worker_id: string | null;
  attempt_count: number;
  result: string | null;
  error: string | null;
  created_at: number;
  source: string;
  required_skill: string | null;
  required_capability: string | null;
  assigned_gateway: string | null;
}

function logFeatureFlagState() {
  console.log('[scheduler] Feature flags: scheduling=%s, triggers=%s, ephemeral=%s',
    featureFlags.agentScheduling, featureFlags.eventTriggers, featureFlags.ephemeralAgents);
}

// ── Context pressure check — SES-02 ──────────────────────────────────────────

async function runContextPressureCheck(): Promise<void> {
  try {
    const sessions = await getActiveSessions();
    for (const session of sessions) {
      const contextPct = session.context_pct;
      if (contextPct <= 0) continue;

      if (contextPct >= CONTEXT_ROTATION_THRESHOLD) {
        // SES-03: Auto-rotate at 95% — creates Recall concept, opens new session
        const newSessionId = await rotateSession(session.id).catch(() => null);
        emitSSE('bridge:context-pressure', {
          session_id: session.id,
          new_session_id: newSessionId,
          agent_id: session.agent_id,
          username: session.username,
          gateway_type: session.gateway_type,
          model_name: session.model_name,
          context_pct: contextPct,
          action: 'rotated',
        }).catch(() => {});
        console.log(`[scheduler:session] rotated session ${session.id.slice(0, 8)} (${Math.round(contextPct * 100)}% context)`);

      } else if (contextPct >= CONTEXT_PRESSURE_THRESHOLD) {
        // SES-02: Warn at 80%
        emitSSE('bridge:context-pressure', {
          session_id: session.id,
          agent_id: session.agent_id,
          username: session.username,
          gateway_type: session.gateway_type,
          model_name: session.model_name,
          context_pct: contextPct,
          action: 'warning',
        }).catch(() => {});
        console.log(`[scheduler:session] context pressure warning session ${session.id.slice(0, 8)} (${Math.round(contextPct * 100)}%)`);
      }
    }
  } catch (e) {
    console.error('[scheduler:session] context pressure check error:', e instanceof Error ? e.message : e);
  }
}

// ── System job self-scheduling (AJQ-03) ─────────────────────────────────────

/**
 * Enqueue a system job with deduplication guard.
 * Returns the job ID if created, null if a pending/running duplicate exists.
 */
export async function scheduleSystemJob(
  triggerType: string,
  triggerData: Record<string, unknown> = {},
  delaySeconds: number = 0,
): Promise<string | null> {
  // Deduplication guard: don't create if one already pending/running
  const existing = await pool.query(
    `SELECT 1 FROM agent_jobs WHERE trigger_type = $1 AND source = 'system' AND status IN ('pending', 'running') LIMIT 1`,
    [triggerType],
  );
  if (existing.rows.length > 0) return null;

  const id = crypto.randomUUID();
  await pool.query(`
    INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, source, status, scheduled_for, created_at)
    VALUES ($1, 'system', $2, $3, 'system', 'pending', EXTRACT(EPOCH FROM NOW()) + $4, EXTRACT(EPOCH FROM NOW()))
  `, [id, triggerType, JSON.stringify(triggerData), delaySeconds]);
  console.log('[scheduler:system] enqueued %s job %s (delay=%ds)', triggerType, id.slice(0, 8), delaySeconds);
  return id;
}

// ── Per-silo dream cadence tick (Phase 50 MSF-04) ──────────────────────────

/**
 * Phase 50 MSF-04 — Per-silo dream cadence tick.
 *
 * Reads silos.cadence_seconds per enabled silo, compares against the max
 * started_at from dream_runs for that silo (status IN completed/running),
 * and fires runDreamWorker({siloId, triggeredBy:'schedule'}) for any silo
 * whose cadence has elapsed. The dream-worker's own checkSkipRecent guard
 * then re-applies the same 95% floor as a defensive race check.
 *
 * Per-silo errors are caught — one failing silo never blocks the others.
 */
async function runSiloCadenceCheck(): Promise<void> {
  const { rows } = await pool.query<{
    id: string;
    cadence_seconds: number;
    last_started_at: string | null;
  }>(`
    SELECT s.id,
           s.cadence_seconds,
           (SELECT MAX(started_at)::text
              FROM dream_runs dr
             WHERE dr.silo_id = s.id
               AND dr.status IN ('completed','running')) AS last_started_at
      FROM silos s
     WHERE s.enabled = TRUE
  `);
  const nowEpoch = Date.now() / 1000;
  for (const row of rows) {
    const last = row.last_started_at ? Number(row.last_started_at) : 0;
    if (nowEpoch - last < row.cadence_seconds) continue;
    runDreamWorker({ siloId: row.id, triggeredBy: 'schedule' }).catch((err) =>
      console.error(`[scheduler:silo-cadence] dream run for ${row.id} failed:`, err),
    );
  }
}

export async function start() {
  if (intervalId) return;
  console.log('[scheduler] started — polling every %dms, worker=%s', POLL_INTERVAL_MS, WORKER_ID.slice(0, 8));
  logFeatureFlagState();
  intervalId = setInterval(tick, POLL_INTERVAL_MS);
}

export function stop() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  console.log('[scheduler] stopped');
}

async function tick() {
  try {
    tickCount++;

    // ── Infrastructure probes — run regardless of agentScheduling flag ──────
    // Bridge health probe — every 30s (skip first interval to avoid startup thundering herd)
    if (tickCount > HEALTH_PROBE_INTERVAL && tickCount % HEALTH_PROBE_INTERVAL === 0) {
      runHealthProbe().catch(err => console.error('[scheduler] health probe error', err));
      computeEmpiricalRates().catch(err => console.error('[scheduler] rate limit compute error', err));
      collectLocalUsage().catch(err => console.error('[scheduler] usage collector error', err));
      runContextPressureCheck().catch(err => console.error('[scheduler] context pressure error', err));
    }

    // Model catalog refresh -- every 24h
    if (tickCount > 0 && tickCount % MODEL_REFRESH_INTERVAL === 0) {
      refreshAllGateways(pool).catch(err => console.error('[scheduler] model refresh error', err));
    }

    // Intellect memory validation — every 30 min
    if (tickCount > 0 && tickCount % MEMORY_VALIDATION_INTERVAL === 0) {
      runMemoryValidation().catch(err =>
        console.error('[scheduler:intellect] memory validation error', err));
      // Memory distiller — turn the agent's raw episodes into durable concepts.
      // Driven from the restart-proof every_30m cadence and self-gated on the
      // last persisted run (was on a tickCount%24h tick that reset on every
      // restart → Tom's learning loop silently froze 2026-06-20).
      runDistillerIfDue({ agent: 'tom' })
        .then(r => { if (!('skipped' in r)) console.log('[scheduler:distiller] tom →', JSON.stringify(r)); })
        .catch(err => console.error('[scheduler:distiller] error', err));
      // Fire any workflow registered under `every_30m` (memory_promote,
      // sweep_stale_sessions, etc.).
      runScheduledWorkflows('every_30m').catch(err =>
        console.error('[scheduler:intellect] every_30m workflows error', err));
    }

    // Intellect dispatch scoring — every 6h
    if (tickCount > 0 && tickCount % DISPATCH_SCORING_INTERVAL === 0) {
      runDispatchScoring().catch(err =>
        console.error('[scheduler:intellect] dispatch scoring error', err));
    }

    // ── Long-cadence workflows: ASK, don't count ────────────────────────────
    // These are polled on the same 30-min tick as every_30m, and runScheduledWorkflows() decides
    // what is actually DUE from each workflow's PERSISTED last_run_at.
    //
    // They used to be gated on tickCount — an in-process counter that resets to 0 on every restart.
    // every_24h needed 24 unbroken hours of uptime and every_week needed 7 unbroken DAYS, so on a
    // box where Porter restarts on every deploy they simply never fired. Twelve workflows had
    // quietly stopped, all still reporting `success` from the last time they DID run.
    //
    // Polling frequently and letting the database answer "is it due?" is restart-proof and
    // idempotent: after any restart, anything overdue fires within one tick.
    if (tickCount > 0 && tickCount % MEMORY_VALIDATION_INTERVAL === 0) {
      for (const cadence of ['every_6h', 'every_24h', 'every_week'] as const) {
        runScheduledWorkflows(cadence).catch(err =>
          console.error(`[scheduler:intellect] ${cadence} workflows error`, err));
      }
    }

    // Release ceremony enforcement — every 10 min. Re-asserts the group announce
    // for every project's CURRENT shipped version (idempotent: no-op if already
    // announced). Makes the announce ceremony STRUCTURAL/session-independent — a
    // release shipped without running the announce self-heals here. (Moe: "hard
    // code it into the process, it keeps getting skipped".)
    if (tickCount > 0 && tickCount % RELEASE_RECONCILE_INTERVAL === 0) {
      reconcileReleases()
        .then(rs => { const filled = rs.filter(r => r.announced); if (filled.length) console.log('[scheduler:release] announce gaps filled:', JSON.stringify(filled)); })
        .catch(err => console.error('[scheduler:release] reconcile error', err));
    }

    // Phase 50 MSF-04 — per-silo dream cadence check (1h granularity).
    if (tickCount > 0 && tickCount % SILO_CADENCE_CHECK_INTERVAL === 0) {
      runSiloCadenceCheck().catch((err) =>
        console.error('[scheduler:silo-cadence] check error', err));
    }

    // ── Agent jobs — require agentScheduling flag ──────────────────────────
    if (!featureFlags.agentScheduling) return;

    const job = await claimNextJob();
    if (job) {
      await logActivity(job.agent_id, job.id, job.project_id, 'job_started',
        `Job ${job.id.slice(0, 8)} started (trigger: ${job.trigger_type})`, '{}');

      // AJQ: After claiming a job, try to assign agent + gateway based on constraints
      if (job.required_skill || job.required_capability) {
        const assignment = await assignJob(job.required_skill, job.required_capability);
        if (assignment) {
          if (assignment.gatewayType) {
            await pool.query('UPDATE agent_jobs SET assigned_gateway = $1 WHERE id = $2', [assignment.gatewayType, job.id]);
            job.assigned_gateway = assignment.gatewayType;
          }
          if (assignment.agentId !== 'system' && job.agent_id === 'system') {
            await pool.query('UPDATE agent_jobs SET agent_id = $1 WHERE id = $2', [assignment.agentId, job.id]);
            job.agent_id = assignment.agentId;
          }
        }
      }

      await executeJob(job);
    }

    if (tickCount % DEADLINE_CHECK_INTERVAL === 0) {
      await checkDeadlineTriggers();
    }

    // Calendar sync -- every 60 seconds
    if (featureFlags.externalConnections && tickCount % CALENDAR_SYNC_INTERVAL === 0) {
      try {
        // Only sync if a calendar connection exists
        const hasCalendar = (await pool.query(
          `SELECT 1 FROM workspace_connections WHERE provider = 'google_calendar' AND status = 'connected' LIMIT 1`
        )).rows[0];
        if (hasCalendar) {
          await syncCalendarEvents();
          await checkCalendarDeadlines();
        }
      } catch (e) {
        console.error('[scheduler] calendar sync error', e);
      }
    }

    // Unblock jobs whose connections have been restored -- every 30 seconds
    if (featureFlags.externalConnections && tickCount % 15 === 0) {
      const blockedJobs = (await pool.query(
        `SELECT id, trigger_data FROM agent_jobs WHERE status = 'blocked' AND trigger_type = 'external_call'`
      )).rows as { id: string; trigger_data: string }[];
      for (const bj of blockedJobs) {
        try {
          const td = (typeof bj.trigger_data === 'string' ? JSON.parse(bj.trigger_data) : bj.trigger_data) as { service: string };
          if (await checkConnectionHealth(td.service) === 'ok') {
            await pool.query(`UPDATE agent_jobs SET status = 'pending' WHERE id = $1`, [bj.id]);
          }
        } catch {
          // Ignore malformed trigger_data
        }
      }
    }
  } catch (e) {
    console.error('[scheduler] tick error', e);
  }
}

async function claimNextJob(): Promise<JobRow | undefined> {
  // Use LEFT JOIN on personas to allow system jobs (agent_id='system') to be claimed.
  // For non-system agents, the original constraints apply (not retired, not ephemeral on finished project).
  // job-executor jobs AND delegation jobs are owned by services/job-executor.ts
  // (it carries the bounded-tool dispatch + completion callback) and must not be
  // claimed here.
  const result = await pool.query(`
    UPDATE agent_jobs
    SET status = 'running', started_at = EXTRACT(EPOCH FROM NOW()), worker_id = $1,
        attempt_count = attempt_count + 1
    WHERE id = (
      SELECT aj.id FROM agent_jobs aj
      LEFT JOIN personas p ON p.id = aj.agent_id
      LEFT JOIN projects pr ON pr.id = aj.project_id
      WHERE aj.status = 'pending'
        AND aj.source NOT IN ('job-executor', 'delegation')
        AND aj.scheduled_for <= EXTRACT(EPOCH FROM NOW())
        AND (aj.agent_id = 'system' OR (
          p.status != 'retired'
          AND (p.is_temporary = 0 OR pr.status IS NULL OR pr.status NOT IN ('complete', 'archived'))
        ))
      ORDER BY aj.scheduled_for ASC LIMIT 1
    )
    RETURNING *
  `, [WORKER_ID]);
  return result.rows[0] as JobRow | undefined;
}

async function executeJob(job: JobRow): Promise<void> {
  // ── Invite drip reminders ─────────────────────────────────────────────────
  if (job.trigger_type === 'invite_drip') {
    const data = (typeof job.trigger_data === 'string' ? JSON.parse(job.trigger_data) : job.trigger_data) as { collaborator_id?: string };
    const collaboratorId = data.collaborator_id;
    if (!collaboratorId) {
      await markJobFailed(job.id, 'Missing collaborator_id in invite_drip trigger_data');
      return;
    }

    const collab = (await pool.query(`
      SELECT pc.id, pc.project_id, pc.email, pc.role, pc.status, pc.invite_token,
             pc.invited_by, pc.drip_count,
             p.name AS project_name,
             u2.display_name AS inviter_display_name, u2.full_name AS inviter_full_name
      FROM project_collaborators pc
      LEFT JOIN projects p ON p.id = pc.project_id
      LEFT JOIN users u2 ON u2.username = pc.invited_by
      WHERE pc.id = $1
    `, [collaboratorId])).rows[0] as {
      id: string;
      project_id: string;
      email: string;
      role: string;
      status: string;
      invite_token: string | null;
      invited_by: string;
      drip_count: number;
      project_name: string | null;
      inviter_display_name: string | null;
      inviter_full_name: string | null;
    } | undefined;

    if (!collab || collab.status !== 'pending') {
      // Already accepted or revoked — mark job complete, no more drips
      await markJobComplete(job.id, JSON.stringify({ skipped: true, reason: collab ? collab.status : 'not_found' }));
      return;
    }

    if (collab.drip_count >= MAX_DRIP_COUNT) {
      await markJobComplete(job.id, JSON.stringify({ skipped: true, reason: 'max_drips_reached' }));
      return;
    }

    if (!collab.invite_token) {
      await markJobComplete(job.id, JSON.stringify({ skipped: true, reason: 'no_invite_token' }));
      return;
    }

    // Send drip email
    const { sendDripReminder: sendDrip } = await import('./transactional-email.js');
    const inviterName = collab.inviter_display_name || collab.inviter_full_name || collab.invited_by;

    await sendDrip({
      to: collab.email,
      projectName: collab.project_name || 'a project',
      inviterName,
      role: collab.role,
      token: collab.invite_token,
      dripCount: collab.drip_count,
    });

    // Update drip tracking
    await pool.query(
      `UPDATE project_collaborators SET drip_count = drip_count + 1, last_drip_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $1`,
      [collaboratorId]
    );

    // Log drip event to collaboration_events
    await pool.query(`
      INSERT INTO collaboration_events
        (project_id, collaborator_id, actor_username, event_type, detail, created_at)
      VALUES ($1, $2, 'system', 'drip_sent', $3, EXTRACT(EPOCH FROM NOW()))
    `, [
      collab.project_id,
      collaboratorId,
      JSON.stringify({ drip_count: collab.drip_count + 1 }),
    ]);

    // Schedule next drip if under max
    if (collab.drip_count + 1 < MAX_DRIP_COUNT) {
      await scheduleDripReminder(collaboratorId, collab.drip_count + 1);
    }

    await markJobComplete(job.id, JSON.stringify({ drip_count: collab.drip_count + 1 }));
    return;
  }

  // CONN-05 locked decision: external_call jobs bypass the AI router and go
  // directly to the appropriate service module. Jobs targeting broken connections
  // get 'blocked' status — they are not failed and are auto-unblocked when the
  // connection is restored.
  if (job.trigger_type === 'external_call') {
    const triggerData = (typeof job.trigger_data === 'string' ? JSON.parse(job.trigger_data) : job.trigger_data) as { service: string };
    const healthStatus = await checkConnectionHealth(triggerData.service);

    if (healthStatus === 'blocked') {
      // Set job to 'blocked' — it will be retried when the connection is restored
      await pool.query(
        `UPDATE agent_jobs SET status = 'blocked', result = $1 WHERE id = $2`,
        [`Connection ${triggerData.service} is not available — waiting for reauth`, job.id]
      );
      await logActivity(job.agent_id, job.id, job.project_id, 'job_blocked',
        `Blocked: ${triggerData.service} connection needs reauth`,
        JSON.stringify({ service: triggerData.service, reason: 'connection_unavailable' }));
      emitSSE('agent:activity', {
        agent_id: job.agent_id,
        project_id: job.project_id,
        event_type: 'job_blocked',
        summary: `Waiting for ${triggerData.service} reconnection`,
      }).catch(() => {});
      return;
    }

    try {
      const result = await dispatchExternalCall(typeof job.trigger_data === 'string' ? job.trigger_data : JSON.stringify(job.trigger_data));
      await markJobComplete(job.id, result);
      await logActivity(job.agent_id, job.id, job.project_id, 'job_complete',
        `External call completed (${triggerData.service})`,
        JSON.stringify({ service: triggerData.service }));
      emitSSE('agent:activity', {
        agent_id: job.agent_id,
        project_id: job.project_id,
        event_type: 'job_complete',
        summary: `External call completed`,
      }).catch(() => {});
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (job.attempt_count < MAX_ATTEMPTS) {
        const backoffSec = job.attempt_count * 30;
        await pool.query(`
          UPDATE agent_jobs SET status = 'pending',
            scheduled_for = EXTRACT(EPOCH FROM NOW()) + $1
          WHERE id = $2
        `, [backoffSec, job.id]);
      } else {
        await markJobFailed(job.id, errMsg);
        await logActivity(job.agent_id, job.id, job.project_id, 'job_failed',
          `External call failed after ${MAX_ATTEMPTS} attempts: ${errMsg}`, '{}');
      }
    }
    return;
  }

  try {
    const result = await aiRouterDispatch({
      agentId: job.agent_id,
      message: job.prompt ?? `Execute scheduled task (trigger: ${job.trigger_type})`,
      projectId: job.project_id,
    });

    await markJobComplete(job.id, JSON.stringify({
      response: result.response.slice(0, 2000), // Cap stored result size
      model: result.model,
      routingReason: result.routingReason,
    }));
    await logActivity(job.agent_id, job.id, job.project_id, 'job_complete',
      `Job ${job.id.slice(0, 8)} completed via ${result.model}`,
      JSON.stringify({ model: result.model, routingReason: result.routingReason }));
    emitSSE('agent:activity', {
      agent_id: job.agent_id,
      project_id: job.project_id,
      event_type: 'job_complete',
      summary: `Job completed via ${result.model}`,
    }).catch(() => {});
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (job.attempt_count < MAX_ATTEMPTS) {
      const backoffSec = job.attempt_count * 30;
      await pool.query(`
        UPDATE agent_jobs SET status = 'pending',
          scheduled_for = EXTRACT(EPOCH FROM NOW()) + $1
        WHERE id = $2
      `, [backoffSec, job.id]);
      console.log('[scheduler] job %s retry in %ds (attempt %d/%d)',
        job.id.slice(0, 8), backoffSec, job.attempt_count, MAX_ATTEMPTS);
    } else {
      await markJobFailed(job.id, errMsg);
      await logActivity(job.agent_id, job.id, job.project_id, 'job_failed',
        `Job ${job.id.slice(0, 8)} failed after ${MAX_ATTEMPTS} attempts: ${errMsg}`, '{}');
    }
  }
}

async function markJobComplete(jobId: string, result: string) {
  await pool.query(`
    UPDATE agent_jobs SET status = 'complete', completed_at = EXTRACT(EPOCH FROM NOW()), result = $1
    WHERE id = $2
  `, [result, jobId]);
}

async function markJobFailed(jobId: string, error: string) {
  await pool.query(`
    UPDATE agent_jobs SET status = 'failed', completed_at = EXTRACT(EPOCH FROM NOW()), error = $1
    WHERE id = $2
  `, [error, jobId]);
}

export async function emitSSE(eventType: string, data: Record<string, unknown>): Promise<void> {
  try {
    const { broadcast } = await import('./sse-hub.js');
    broadcast(eventType, data);
  } catch {
    // SSE emission is best-effort — never block the scheduler
  }
}

async function logActivity(
  agentId: string,
  jobId: string | null,
  projectId: string | null,
  eventType: string,
  summary: string,
  detail: string,
) {
  await pool.query(`
    INSERT INTO agent_activity (agent_id, job_id, project_id, event_type, summary, detail)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [agentId, jobId, projectId, eventType, summary, detail]);

  // Best-effort SSE push for real-time dashboard updates
  emitSSE('project:activity', {
    agent_id: agentId,
    job_id: jobId,
    project_id: projectId,
    event_type: eventType,
    summary,
    detail,
    created_at: Date.now() / 1000,
  }).catch(() => { /* swallow — SSE is non-critical */ });
}
