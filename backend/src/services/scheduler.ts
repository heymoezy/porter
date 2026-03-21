import { sqlite } from '../db/client.js';
import { config, featureFlags } from '../config.js';
import { dispatch as aiRouterDispatch } from './ai-router.js';
import { checkDeadlineTriggers } from './event-triggers.js';
import { syncCalendarEvents, checkCalendarDeadlines } from './calendar.js';
import { dispatchExternalCall, checkConnectionHealth } from './external-dispatcher.js';
import crypto from 'crypto';

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 3;
const DEADLINE_CHECK_INTERVAL = 30; // Every 60 seconds (30 ticks * 2s)
const CALENDAR_SYNC_INTERVAL = 30; // Every 60 seconds (30 ticks * 2s)
const WORKER_ID = crypto.randomUUID();
let intervalId: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;

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
}

function logFeatureFlagState() {
  console.log('[scheduler] Feature flags: scheduling=%s, triggers=%s, ephemeral=%s',
    featureFlags.agentScheduling, featureFlags.eventTriggers, featureFlags.ephemeralAgents);
}

export function start() {
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
  if (!featureFlags.agentScheduling) return;
  try {
    const job = claimNextJob();
    if (job) {
      logActivity(job.agent_id, job.id, job.project_id, 'job_started',
        `Job ${job.id.slice(0, 8)} started (trigger: ${job.trigger_type})`, '{}');
      await executeJob(job);
    }

    // Check deadline triggers periodically (every 60s, not every 2s)
    tickCount++;
    if (tickCount % DEADLINE_CHECK_INTERVAL === 0) {
      checkDeadlineTriggers();
    }

    // Calendar sync -- every 60 seconds
    if (featureFlags.externalConnections && tickCount % CALENDAR_SYNC_INTERVAL === 0) {
      try {
        // Only sync if a calendar connection exists
        const hasCalendar = sqlite.prepare(
          `SELECT 1 FROM workspace_connections WHERE provider = 'google_calendar' AND status = 'connected' LIMIT 1`
        ).get();
        if (hasCalendar) {
          await syncCalendarEvents();
          checkCalendarDeadlines();
        }
      } catch (e) {
        console.error('[scheduler] calendar sync error', e);
      }
    }

    // Unblock jobs whose connections have been restored -- every 30 seconds
    if (featureFlags.externalConnections && tickCount % 15 === 0) {
      const blockedJobs = sqlite.prepare(
        `SELECT id, trigger_data FROM agent_jobs WHERE status = 'blocked' AND trigger_type = 'external_call'`
      ).all() as { id: string; trigger_data: string }[];
      for (const bj of blockedJobs) {
        try {
          const td = JSON.parse(bj.trigger_data) as { service: string };
          if (checkConnectionHealth(td.service) === 'ok') {
            sqlite.prepare(`UPDATE agent_jobs SET status = 'pending' WHERE id = ?`).run(bj.id);
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

function claimNextJob(): JobRow | undefined {
  return sqlite.prepare(`
    UPDATE agent_jobs
    SET status = 'running', started_at = unixepoch('now'), worker_id = @workerId,
        attempt_count = attempt_count + 1
    WHERE id = (
      SELECT aj.id FROM agent_jobs aj
      JOIN personas p ON p.id = aj.agent_id
      LEFT JOIN projects pr ON pr.id = aj.project_id
      WHERE aj.status = 'pending'
        AND aj.scheduled_for <= unixepoch('now')
        AND p.status != 'retired'
        AND (p.is_temporary = 0 OR pr.status IS NULL OR pr.status NOT IN ('complete', 'archived'))
      ORDER BY aj.scheduled_for ASC LIMIT 1
    )
    RETURNING *
  `).get({ workerId: WORKER_ID }) as JobRow | undefined;
}

async function executeJob(job: JobRow): Promise<void> {
  // CONN-05 locked decision: external_call jobs bypass the AI router and go
  // directly to the appropriate service module. Jobs targeting broken connections
  // get 'blocked' status — they are not failed and are auto-unblocked when the
  // connection is restored.
  if (job.trigger_type === 'external_call') {
    const triggerData = JSON.parse(job.trigger_data) as { service: string };
    const healthStatus = checkConnectionHealth(triggerData.service);

    if (healthStatus === 'blocked') {
      // Set job to 'blocked' — it will be retried when the connection is restored
      sqlite.prepare(
        `UPDATE agent_jobs SET status = 'blocked', result = ? WHERE id = ?`
      ).run(`Connection ${triggerData.service} is not available — waiting for reauth`, job.id);
      logActivity(job.agent_id, job.id, job.project_id, 'job_blocked',
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
      const result = await dispatchExternalCall(job.trigger_data);
      markJobComplete(job.id, result);
      logActivity(job.agent_id, job.id, job.project_id, 'job_complete',
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
        sqlite.prepare(`
          UPDATE agent_jobs SET status = 'pending',
            scheduled_for = unixepoch('now') + @backoff
          WHERE id = @id
        `).run({ id: job.id, backoff: backoffSec });
      } else {
        markJobFailed(job.id, errMsg);
        logActivity(job.agent_id, job.id, job.project_id, 'job_failed',
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

    markJobComplete(job.id, JSON.stringify({
      response: result.response.slice(0, 2000), // Cap stored result size
      model: result.model,
      routingReason: result.routingReason,
    }));
    logActivity(job.agent_id, job.id, job.project_id, 'job_complete',
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
      sqlite.prepare(`
        UPDATE agent_jobs SET status = 'pending',
          scheduled_for = unixepoch('now') + @backoff
        WHERE id = @id
      `).run({ id: job.id, backoff: backoffSec });
      console.log('[scheduler] job %s retry in %ds (attempt %d/%d)',
        job.id.slice(0, 8), backoffSec, job.attempt_count, MAX_ATTEMPTS);
    } else {
      markJobFailed(job.id, errMsg);
      logActivity(job.agent_id, job.id, job.project_id, 'job_failed',
        `Job ${job.id.slice(0, 8)} failed after ${MAX_ATTEMPTS} attempts: ${errMsg}`, '{}');
    }
  }
}

function markJobComplete(jobId: string, result: string) {
  sqlite.prepare(`
    UPDATE agent_jobs SET status = 'complete', completed_at = unixepoch('now'), result = @result
    WHERE id = @id
  `).run({ id: jobId, result });
}

function markJobFailed(jobId: string, error: string) {
  sqlite.prepare(`
    UPDATE agent_jobs SET status = 'failed', completed_at = unixepoch('now'), error = @error
    WHERE id = @id
  `).run({ id: jobId, error });
}

export async function emitSSE(eventType: string, data: Record<string, unknown>): Promise<void> {
  try {
    const url = `${config.porterPyUrl}/api/events/emit`;
    const body = JSON.stringify({ event: eventType, data });
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(2000), // 2s timeout — never block scheduler
    });
    if (!resp.ok) {
      console.debug('[scheduler] SSE emit %s: HTTP %d', eventType, resp.status);
    }
  } catch {
    // SSE emission is best-effort — never block the scheduler
  }
}

function logActivity(
  agentId: string,
  jobId: string | null,
  projectId: string | null,
  eventType: string,
  summary: string,
  detail: string,
) {
  sqlite.prepare(`
    INSERT INTO agent_activity (agent_id, job_id, project_id, event_type, summary, detail)
    VALUES (@agentId, @jobId, @projectId, @eventType, @summary, @detail)
  `).run({ agentId, jobId, projectId, eventType, summary, detail });

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
