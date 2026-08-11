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
import { createWorkspace, removeWorkspace, workspaceDiff, commitWorkspace, WORKSPACE_RULES, type Workspace } from './bridge/workspace.js';
import { config } from '../config.js';

const POLL_INTERVAL_MS = 5_000;
const MAX_ATTEMPTS = 3;

/**
 * Client-side wall-clock for a dispatched job, by kind.
 *
 * These MUST NOT be shorter than the server's own ceiling for the same
 * dispatch, or the client aborts work the server would have completed. That is
 * exactly what happened: delegation waited 240s while the claude adapter allows
 * TIMEOUT_MS = 300s for a non-workspace dispatch, so the final 60s of every
 * delegated job was unreachable and the job reported a bare "aborted due to
 * timeout" with no indication that the ceiling was ours, not the model's.
 *
 * A workspace dispatch is the adapter's long path (WORKSPACE_TIMEOUT_MS,
 * 30 min) because a code-changing session is not a chat turn.
 */
const WORKSPACE_JOB_TIMEOUT_MS = 1_800_000;
const DELEGATION_JOB_TIMEOUT_MS = 300_000;
const HEARTBEAT_JOB_TIMEOUT_MS = 120_000;
const SERVICE_TOKEN = process.env.PORTER_SERVICE_TOKEN ?? ''; // no fallback: the old default leaked (public repo)

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
      source: string | null;
      trigger_data: Record<string, unknown> | null;
    }>(`
      WITH next_jobs AS (
        SELECT id
        FROM agent_jobs
        WHERE status = 'pending'
          AND scheduled_for <= EXTRACT(EPOCH FROM NOW())
          AND source IN ('job-executor', 'delegation')
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
      RETURNING id, agent_id, attempt_count, assigned_gateway, prompt, source, trigger_data
    `, [`job-executor:${process.pid}`]);

    for (const job of claimed) {
      // Delegation jobs (Tom → worker) carry a bounded tool allow-list + a
      // callback URL in trigger_data; heartbeat jobs carry neither.
      // Declared OUTSIDE the try so `finally` can clean the worktree up: a
      // worktree that outlives a failed job is a full checkout left on disk.
      const td = (job.trigger_data ?? {}) as { allowed_tools?: string[]; callback_url?: string; task?: string; repo?: string };
      let ws: Workspace | null = null;
      try {
        const isDelegation = job.source === 'delegation';
        const tickMessage = job.prompt ?? td.task ?? 'tick';

        // A job carrying `repo` needs somewhere to write. Create a throwaway
        // worktree on its own branch — never the live tree — and hand the
        // session the standing rules with the task.
        if (td.repo) {
          try {
            ws = createWorkspace(td.repo, job.id);
            console.log(`[job-executor] ${job.id} workspace ${ws.dir} on ${ws.branch}`);
          } catch (e) {
            // No workspace means the session would silently run in /tmp and
            // report success having changed nothing. Fail the job instead.
            throw new Error(`workspace setup failed for ${td.repo}: ${e instanceof Error ? e.message : e}`);
          }
        }
        const dispatchResp = await fetch(`http://${config.host}:${config.port}/api/v1/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Porter-Service-Token': SERVICE_TOKEN,
          },
          body: JSON.stringify({
            message: ws ? `${tickMessage}\n\n---\n${WORKSPACE_RULES}` : tickMessage,
            agent_id: job.agent_id,
            chat_id: `${isDelegation ? 'delegation' : 'heartbeat'}-${job.id}`,
            ...(job.assigned_gateway ? { backend: job.assigned_gateway } : {}),
            // Enforced read-only worker sandbox → claude_cli --allowedTools.
            // A workspace job overrides this at the adapter: editing code with a
            // read-only tool set is not a sandbox, it is a job that cannot work.
            ...(Array.isArray(td.allowed_tools) && td.allowed_tools.length ? { tools: td.allowed_tools } : {}),
            ...(ws ? { workspace: ws.dir } : {}),
          }),
          // A code-changing session is not a chat turn. 240s is a sensible
          // ceiling for a research worker and far too short for real work.
          //
          // ⚠️ 240s was also SHORTER THAN THE SERVER'S OWN CEILING. The claude
          // adapter allows TIMEOUT_MS = 300s for a non-workspace dispatch, so
          // this client aborted work the server would have finished, and the
          // last 60s of every delegated job was unreachable by construction.
          // Matching the two removes a race we could only ever lose.
          signal: AbortSignal.timeout(ws ? WORKSPACE_JOB_TIMEOUT_MS : (isDelegation ? DELEGATION_JOB_TIMEOUT_MS : HEARTBEAT_JOB_TIMEOUT_MS)),
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

        // Delegated synthesis output is the whole point — don't truncate it to
        // 500 chars like a heartbeat tick. Keep a generous cap for a WhatsApp-
        // bound summary.
        let resultText = lastFull.slice(0, isDelegation ? 16_000 : 500);

        // What the session actually changed, read from the worktree rather than
        // from what it claims. A session reporting success having written
        // nothing is the failure mode worth catching, and only the diff shows it.
        if (ws) {
          const { files, diffstat } = workspaceDiff(ws.dir);
          resultText += files.length
            ? `\n\n---\nBranch \`${ws.branch}\` — ${files.length} file(s) changed:\n${diffstat || files.join('\n')}`
            : `\n\n---\nBranch \`${ws.branch}\` — NO FILES CHANGED. The session finished without editing anything.`;
        }

        await pool.query(
          `UPDATE agent_jobs
           SET status = 'completed',
               completed_at = EXTRACT(EPOCH FROM NOW()),
               result = $2
           WHERE id = $1`,
          [job.id, resultText],
        );

        await pool.query(
          `UPDATE personas SET last_heartbeat = EXTRACT(EPOCH FROM NOW())::text WHERE id = $1`,
          [job.agent_id],
        );

        // Completion callback — lets the delegator (Tom) report back to chat
        // without polling. Fire-and-forget; a dead callback never fails the job.
        if (isDelegation && typeof td.callback_url === 'string' && td.callback_url) {
          fetch(td.callback_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              job_id: job.id, agent_id: job.agent_id, status: 'completed',
              task: td.task ?? tickMessage, result: resultText,
            }),
            signal: AbortSignal.timeout(15_000),
          }).catch(err => console.warn(`[job-executor] callback failed for ${job.id}:`, err instanceof Error ? err.message : err));
        }
      } catch (err) {
        let errMsg = err instanceof Error ? err.message : String(err);
        // "The operation was aborted due to timeout" says nothing about WHICH
        // ceiling was hit or why it was that low. Every delegation failure in
        // the last fortnight carried exactly that string, and diagnosing it
        // meant reading three files to discover that a build task dispatched
        // WITHOUT a repo gets the 5-minute chat ceiling rather than the 30-min
        // workspace one. Say so in the error, where whoever reads it next will
        // actually see it.
        if (err instanceof Error && (err.name === 'TimeoutError' || /aborted due to timeout/i.test(err.message))) {
          const budgetMs = ws
            ? WORKSPACE_JOB_TIMEOUT_MS
            : (job.source === 'delegation' ? DELEGATION_JOB_TIMEOUT_MS : HEARTBEAT_JOB_TIMEOUT_MS);
          errMsg = ws
            ? `timed out after ${Math.round(budgetMs / 1000)}s in workspace ${ws.dir}`
            : `timed out after ${Math.round(budgetMs / 1000)}s with NO WORKSPACE — a code-changing job must be dispatched with a \`repo\`, which gives it the ${Math.round(WORKSPACE_JOB_TIMEOUT_MS / 1000)}s workspace budget instead of this one`;
        }
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
          // Tell the delegator (Tom) it failed so it doesn't wait forever.
          const ftd = (job.trigger_data ?? {}) as { callback_url?: string; task?: string };
          if (job.source === 'delegation' && typeof ftd.callback_url === 'string' && ftd.callback_url) {
            fetch(ftd.callback_url, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ job_id: job.id, agent_id: job.agent_id, status: 'failed', task: ftd.task ?? null, error: errMsg.slice(0, 500) }),
              signal: AbortSignal.timeout(15_000),
            }).catch(() => undefined);
          }
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
      } finally {
        // Always remove the worktree DIRECTORY — success, failure or retry.
        // Leaving them accumulates checkouts of the whole repo on disk.
        // ⚠️ The BRANCH survives: it holds the only copy of whatever the session
        // wrote, and destroying it on a failed run would silently discard real
        // work. Cheap to keep, expensive to lose.
        if (ws && td.repo) {
          // ⚠️ COMMIT BEFORE REMOVING, or the branch is empty and the work is gone.
          //
          // v6.141.0 said "the BRANCH survives: it holds the only copy of whatever
          // the session wrote". That was FALSE and I shipped it. WORKSPACE_RULES
          // forbid the session to commit, and this `finally` force-removes the
          // worktree — so the uncommitted changes were destroyed and the branch
          // held nothing. Proof: both porter-dev/* branches left by that release
          // are 0 commits ahead of main. A comment describing a protection that
          // does not exist is worse than no protection, because it stops anyone
          // looking.
          try { commitWorkspace(ws, `porter job ${job.id}`); }
          catch (e) { console.warn(`[job-executor] could not preserve work for ${job.id}:`, e); }
          try { removeWorkspace(td.repo, ws); }
          catch (e) { console.warn(`[job-executor] worktree cleanup failed for ${job.id}:`, e); }
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
