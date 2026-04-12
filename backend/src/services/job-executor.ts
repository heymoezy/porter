/**
 * job-executor.ts
 *
 * Generic heartbeat executor for autonomous Porter agents. Polls the personas
 * table for rows with heartbeat_enabled=1, computes whether each agent is due
 * (now - last_heartbeat >= heartbeat_interval), and dispatches a tick message
 * through Porter Bridge with the agent's own credentials and prompts.
 *
 * Concurrency safety: claims jobs via SELECT ... FOR UPDATE SKIP LOCKED so
 * multiple workers in the same process (or scaled out later) never duplicate.
 *
 * Failure backoff: 3 attempts max per scheduled tick, exponential delay
 * between attempts. Permanent failure marks the job 'failed' with the error
 * captured for the Forge tab and Bridge dashboard.
 */

import crypto from 'node:crypto';
import { pool } from '../db/client.js';
import { config } from '../config.js';

const POLL_INTERVAL_MS = 5_000;
const MAX_ATTEMPTS = 3;
const SERVICE_TOKEN = process.env.PORTER_SERVICE_TOKEN || 'porter-local-service-2026';

let scanIntervalId: ReturnType<typeof setInterval> | null = null;
let runIntervalId: ReturnType<typeof setInterval> | null = null;
let scanInProgress = false;
let runInProgress = false;

interface DueAgent {
  agent_id: string;
  template_id: string | null;
  heartbeat_interval: number | null;
  heartbeat_cron: string | null;
  last_heartbeat_epoch: number | null;
  preferred_backend: string | null;
}

// Compute the heartbeat interval (seconds) for an agent. Prefers the
// agent_template's heartbeat_interval column. Falls back to parsing the
// persona's heartbeat_cron for the two formats Porter actually uses:
//   "every-30s with seconds field" → 30
//   "0 * * * *" hourly             → 3600
// Anything else returns null and the agent is skipped.
function intervalFromCron(cron: string): number | null {
  const trimmed = cron.trim();
  if (trimmed === '*/30 * * * * *') return 30;
  if (trimmed === '0 * * * *') return 3600;
  // Generic */N first-position parser for second/minute granularity
  const m = /^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*(?:\s+\*)?$/.exec(trimmed);
  if (m) return Number(m[1]);
  return null;
}

function isDue(agent: DueAgent): boolean {
  const intervalSec =
    (agent.heartbeat_interval && agent.heartbeat_interval > 0
      ? agent.heartbeat_interval
      : agent.heartbeat_cron
        ? intervalFromCron(agent.heartbeat_cron)
        : null) ?? null;
  if (!intervalSec) return false;
  const now = Date.now() / 1000;
  if (!agent.last_heartbeat_epoch) return true;
  return now - agent.last_heartbeat_epoch >= intervalSec;
}

/**
 * Scan loop — finds personas due for a tick and inserts agent_jobs rows.
 */
async function scanForDueAgents(): Promise<void> {
  if (scanInProgress) return;
  scanInProgress = true;
  try {
    const { rows } = await pool.query<DueAgent>(`
      SELECT
        p.id AS agent_id,
        p.template_id,
        at.heartbeat_interval,
        p.heartbeat_cron,
        CASE WHEN p.last_heartbeat ~ '^[0-9]+(\\.[0-9]+)?$'
             THEN p.last_heartbeat::double precision
             WHEN p.last_heartbeat IS NOT NULL AND p.last_heartbeat != ''
             THEN EXTRACT(EPOCH FROM p.last_heartbeat::timestamptz)
             ELSE NULL
        END AS last_heartbeat_epoch,
        p.preferred_backend
      FROM personas p
      LEFT JOIN agent_templates at ON at.id = p.template_id
      WHERE p.heartbeat_enabled = 1
    `);

    for (const agent of rows) {
      if (!isDue(agent)) continue;

      // Skip if a job is already pending or running for this agent
      const { rows: pending } = await pool.query<{ id: string }>(
        `SELECT id FROM agent_jobs
         WHERE agent_id = $1 AND status IN ('pending', 'running')
         LIMIT 1`,
        [agent.agent_id],
      );
      if (pending.length > 0) continue;

      const jobId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO agent_jobs (
          id, agent_id, trigger_type, trigger_data, prompt,
          status, scheduled_for, attempt_count, source,
          assigned_gateway
        ) VALUES ($1,$2,'scheduled','{"reason":"heartbeat"}'::jsonb,$3,'pending',
                  EXTRACT(EPOCH FROM NOW()), 0, 'job-executor', $4)`,
        [
          jobId,
          agent.agent_id,
          'tick',
          agent.preferred_backend ?? null,
        ],
      );
    }
  } catch (err) {
    console.error('[job-executor] scan error:', err instanceof Error ? err.message : err);
  } finally {
    scanInProgress = false;
  }
}

/**
 * Execution loop — claims pending jobs, dispatches them through Porter Bridge,
 * marks completed/failed.
 */
async function runDueJobs(): Promise<void> {
  if (runInProgress) return;
  runInProgress = true;
  try {
    // Claim up to 4 jobs per cycle. SKIP LOCKED keeps concurrent workers safe.
    const { rows: claimed } = await pool.query<{
      id: string;
      agent_id: string;
      attempt_count: number;
      assigned_gateway: string | null;
      prompt: string | null;
    }>(`
      WITH next_jobs AS (
        SELECT id
        FROM agent_jobs
        WHERE status = 'pending'
          AND scheduled_for <= EXTRACT(EPOCH FROM NOW())
          AND source = 'job-executor'
        ORDER BY scheduled_for ASC
        LIMIT 4
        FOR UPDATE SKIP LOCKED
      )
      UPDATE agent_jobs
      SET status = 'running',
          started_at = EXTRACT(EPOCH FROM NOW()),
          worker_id = $1,
          attempt_count = attempt_count + 1
      WHERE id IN (SELECT id FROM next_jobs)
      RETURNING id, agent_id, attempt_count, assigned_gateway, prompt
    `, [`job-executor:${process.pid}`]);

    for (const job of claimed) {
      try {
        const tickMessage = job.prompt ?? 'tick';
        const dispatchResp = await fetch(`http://${config.host}:${config.port}/api/v1/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Porter-Service-Token': SERVICE_TOKEN,
          },
          body: JSON.stringify({
            message: tickMessage,
            agent_id: job.agent_id,
            chat_id: `heartbeat-${job.id}`,
            ...(job.assigned_gateway ? { backend: job.assigned_gateway } : {}),
          }),
          signal: AbortSignal.timeout(120_000),
        });

        if (!dispatchResp.ok) {
          throw new Error(`Bridge dispatch HTTP ${dispatchResp.status}`);
        }
        // Drain SSE so the connection closes cleanly
        const reader = dispatchResp.body?.getReader();
        let lastFull = '';
        if (reader) {
          const decoder = new TextDecoder();
          let buf = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const events = buf.split('\n\n');
            buf = events.pop() ?? '';
            for (const evt of events) {
              const dataLine = evt.split('\n').find(l => l.startsWith('data: '));
              if (!dataLine) continue;
              try {
                const payload = JSON.parse(dataLine.slice(6));
                if (payload.done && typeof payload.full_response === 'string') {
                  lastFull = payload.full_response;
                }
              } catch { /* skip */ }
            }
          }
        }

        await pool.query(
          `UPDATE agent_jobs
           SET status = 'completed',
               completed_at = EXTRACT(EPOCH FROM NOW()),
               result = $2
           WHERE id = $1`,
          [job.id, lastFull.slice(0, 500)],
        );

        await pool.query(
          `UPDATE personas SET last_heartbeat = EXTRACT(EPOCH FROM NOW())::text WHERE id = $1`,
          [job.agent_id],
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const final = job.attempt_count >= MAX_ATTEMPTS;
        if (final) {
          await pool.query(
            `UPDATE agent_jobs
             SET status = 'failed',
                 completed_at = EXTRACT(EPOCH FROM NOW()),
                 error = $2
             WHERE id = $1`,
            [job.id, errMsg.slice(0, 500)],
          );
          console.error(`[job-executor] ${job.agent_id} job ${job.id} failed permanently: ${errMsg}`);
        } else {
          // Exponential backoff in seconds: 30, 90, 270
          const backoffSec = 30 * Math.pow(3, job.attempt_count - 1);
          await pool.query(
            `UPDATE agent_jobs
             SET status = 'pending',
                 scheduled_for = EXTRACT(EPOCH FROM NOW()) + $2,
                 error = $3
             WHERE id = $1`,
            [job.id, backoffSec, errMsg.slice(0, 500)],
          );
          console.warn(`[job-executor] ${job.agent_id} job ${job.id} attempt ${job.attempt_count} failed (backing off ${backoffSec}s): ${errMsg}`);
        }
      }
    }
  } catch (err) {
    console.error('[job-executor] run error:', err instanceof Error ? err.message : err);
  } finally {
    runInProgress = false;
  }
}

export function start(): void {
  if (scanIntervalId || runIntervalId) return;
  scanIntervalId = setInterval(() => {
    scanForDueAgents().catch(err => console.error('[job-executor] scan crash:', err));
  }, POLL_INTERVAL_MS);
  runIntervalId = setInterval(() => {
    runDueJobs().catch(err => console.error('[job-executor] run crash:', err));
  }, POLL_INTERVAL_MS);
  console.log(`[job-executor] started — scan + run every ${POLL_INTERVAL_MS}ms`);
}

export function stop(): void {
  if (scanIntervalId) { clearInterval(scanIntervalId); scanIntervalId = null; }
  if (runIntervalId) { clearInterval(runIntervalId); runIntervalId = null; }
  console.log('[job-executor] stopped');
}
