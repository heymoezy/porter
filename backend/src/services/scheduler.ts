import { sqlite } from '../db/client.js';
import { featureFlags } from '../config.js';
import { dispatch as aiRouterDispatch } from './ai-router.js';
import { checkDeadlineTriggers } from './event-triggers.js';
import crypto from 'crypto';

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 3;
const DEADLINE_CHECK_INTERVAL = 30; // Every 60 seconds (30 ticks * 2s)
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

export function start() {
  if (intervalId) return;
  console.log('[scheduler] started — polling every %dms, worker=%s', POLL_INTERVAL_MS, WORKER_ID.slice(0, 8));
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
      WHERE aj.status = 'pending'
        AND aj.scheduled_for <= unixepoch('now')
        AND p.status != 'retired'
      ORDER BY aj.scheduled_for ASC LIMIT 1
    )
    RETURNING *
  `).get({ workerId: WORKER_ID }) as JobRow | undefined;
}

async function executeJob(job: JobRow): Promise<void> {
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
}
