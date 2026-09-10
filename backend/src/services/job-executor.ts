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
 * captured for the Bridge dashboard.
 */

import crypto from 'node:crypto';
import { pool } from '../db/client.js';
import { createWorkspace, removeWorkspace, workspaceDiff, commitWorkspace, WORKSPACE_RULES, type Workspace } from './bridge/workspace.js';
import { config } from '../config.js';
// The SERVER's ceilings. Imported so every client budget below is DERIVED from
// one of them and the two can never drift apart again. TIMEOUT_MS covers every
// non-workspace dispatch — chat turn, delegation, heartbeat tick.
import { WORKSPACE_TIMEOUT_MS, TIMEOUT_MS as CHAT_TIMEOUT_MS } from './bridge/adapters/claude-cli.js';

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
 * A workspace dispatch is the adapter's long path (WORKSPACE_TIMEOUT_MS)
 * because a code-changing session is not a chat turn.
 *
 * ⚠️ EVERY budget here is IMPORTED from the adapter, never re-declared. Three
 * times now these numbers have been set independently and disagreed, and every
 * time the shorter one won silently: v6.141.0 raised the client to 1,800s while
 * the adapter still killed at 300s; v6.159.0 found the client at 240s against
 * the adapter's 300s; and v6.160.2 found HEARTBEAT still a bare 120s against
 * the same 300s — the one path that fires on every agent, every few minutes.
 *
 * The first two fixes derived the workspace constant and hand-set the other two.
 * That is why the bug came back: a constant copied into the caller is a constant
 * that will drift, and "we fixed the one we were looking at" is not a mechanism.
 * All three are now derived, so "the client must never be shorter than the
 * server" is true by construction instead of by vigilance.
 *
 * The +60s margin is the client's, not the server's: the server kills its own
 * subprocess at its ceiling, and the client must still be listening when that
 * happens to record WHY. A client that gives up first turns a clean server-side
 * kill into an orphaned child it can no longer see or reap.
 */
const WORKSPACE_JOB_TIMEOUT_MS = WORKSPACE_TIMEOUT_MS + 60_000;
const DELEGATION_JOB_TIMEOUT_MS = CHAT_TIMEOUT_MS + 60_000;
const HEARTBEAT_JOB_TIMEOUT_MS = CHAT_TIMEOUT_MS + 60_000;
const SERVICE_TOKEN = process.env.PORTER_SERVICE_TOKEN ?? ''; // no fallback: the old default leaked (public repo)

/**
 * How many jobs may be in flight at once (dev #109/#110).
 *
 * ⚠️ THE OLD LOOP WAS SERIAL AND THAT IS WHY A LONG JOB WAS A PROBLEM. Jobs were
 * claimed in batches of 4 and then `await`ed one after another, with the whole
 * cycle re-entrancy-guarded — so a single 30-minute workspace job blocked the
 * three jobs claimed beside it AND every heartbeat for the next half hour. The
 * only thing that made that survivable was the short ceiling, which is exactly
 * the thing dev #109 asks us to remove. Lifting the ceiling on a serial queue
 * would have converted "dev sessions get killed" into "one dev session freezes
 * Porter for twelve hours" — a worse bug wearing the fix's clothes.
 *
 * So the ceiling and the concurrency had to move together. Jobs now run
 * independently and the loop keeps claiming while they run; a long session
 * occupies ONE slot and nothing else waits on it. That is what makes
 * "duration is irrelevant" a true statement rather than an aspiration.
 *
 * 4 concurrent CLI sessions on a 4-vCPU box: these are overwhelmingly waiting on
 * a remote API rather than burning CPU, and this is the same number the claim
 * query already used per cycle.
 */
const MAX_CONCURRENT_JOBS = Number(process.env.PORTER_MAX_CONCURRENT_JOBS || 4);

let scanIntervalId: ReturnType<typeof setInterval> | null = null;
let runIntervalId: ReturnType<typeof setInterval> | null = null;
let wedgedIntervalId: ReturnType<typeof setInterval> | null = null;
let scanInProgress = false;
let runInProgress = false;
/** Jobs currently executing. Bounds concurrency and keeps a long job from being re-claimed. */
const inFlight = new Set<string>();

interface DueAgent {
  agent_id: string;
  template_id: string | null;
  heartbeat_interval: number | null;
  heartbeat_cron: string | null;
  last_heartbeat_epoch: number | null;
  preferred_backend: string | null;
}

// Compute the heartbeat interval (seconds) for an agent. The persona's own
// heartbeat_cron WINS — it is the per-agent specification. agent_templates
// .heartbeat_interval is only a template default and applies when the persona
// has no readable cron of its own. (Reversed 2026-08-12: the template default
// used to win, so Compass and Ledger — both specified `0 * * * *` — inherited
// their template's 60s and ticked ~49x/hour, 85% of all claude_cli traffic.)
// Formats Porter actually uses:
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
  const fromCron = agent.heartbeat_cron ? intervalFromCron(agent.heartbeat_cron) : null;
  const fromTemplate =
    agent.heartbeat_interval && agent.heartbeat_interval > 0 ? agent.heartbeat_interval : null;
  const intervalSec = fromCron ?? fromTemplate;
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
    // Claim only what there is room to RUN. Claiming marks the row 'running', so
    // taking more than the in-flight cap allows would park jobs in a state that
    // says they are being worked on while nothing is working on them — and the
    // stuck-job sweep would eventually treat that as a failure it invented.
    const capacity = MAX_CONCURRENT_JOBS - inFlight.size;
    if (capacity <= 0) return;
    // SKIP LOCKED keeps concurrent workers safe.
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
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE agent_jobs
      SET status = 'running',
          started_at = EXTRACT(EPOCH FROM NOW()),
          worker_id = $1,
          attempt_count = attempt_count + 1
      WHERE id IN (SELECT id FROM next_jobs)
      RETURNING id, agent_id, attempt_count, assigned_gateway, prompt, source, trigger_data
    `, [`job-executor:${process.pid}`, capacity]);

    for (const job of claimed) {
      // ⚠️ LAUNCHED, NOT AWAITED (dev #109). The body below is unchanged; only the
      // control flow around it moved. `await`ing here made every job wait for the
      // one before it, so a long workspace session stalled the heartbeats claimed
      // beside it. Each job now settles on its own and the claim loop carries on.
      inFlight.add(job.id);
      void (async () => {
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
      })()
        // The body handles its own failures; this only catches a throw from the
        // cleanup path itself. The slot MUST be released either way — a leaked
        // entry here permanently shrinks how much work Porter can take on.
        .catch(err => console.error(`[job-executor] ${job.id} crashed outside its handler:`, err instanceof Error ? err.message : err))
        .finally(() => { inFlight.delete(job.id); });
    }
  } catch (err) {
    console.error('[job-executor] run error:', err instanceof Error ? err.message : err);
  } finally {
    runInProgress = false;
  }
}

/**
 * Resolve jobs left `running` by a process that is no longer alive.
 *
 * ⚠️ 60 ROWS SAT IN `running` SINCE APRIL AND NOTHING EVER LOOKED AT THEM. A job
 * is moved to `running` by the claim query and moved out of it by the code that
 * finishes it — so if the process dies in between, the row is stranded forever.
 * There was no sweep of any kind. Four months of that is the evidence.
 *
 * ⚠️ THE TEST IS "IS ANYONE WORKING IT", NEVER "HAS IT BEEN A WHILE". Elapsed
 * time was always a poor proxy and dev #109 made it an actively wrong one: a
 * legitimate workspace session may now run for twelve hours, so any sweep keyed
 * on age would kill exactly the long dev sessions that release exists to
 * protect. Startup is the one moment when the answer is knowable without
 * guessing — this process has just begun, it holds no jobs, and it is the only
 * executor, so anything still marked `running` is by definition abandoned.
 * `inFlight` is in memory, which is why a live long job can never be caught by
 * this: it does not survive the restart that triggers the sweep.
 *
 * ⚠️ FAILED, NOT RETRIED. We cannot know how long a row has been orphaned, and
 * re-dispatching a heartbeat tick from four months ago is noise, not recovery. A
 * heartbeat is re-scheduled by the scan loop within seconds anyway. A delegation
 * matters more: its delegator (Tom) polls the row, so a terminal state is how he
 * learns the work died with the process instead of waiting on it forever.
 */
async function reclaimOrphanedJobs(): Promise<void> {
  const { rows } = await pool.query<{ id: string; source: string | null; trigger_type: string }>(
    `UPDATE agent_jobs
        SET status = 'failed',
            completed_at = EXTRACT(EPOCH FROM NOW()),
            error = left(coalesce(error || ' | ', '') || $1, 500)
      WHERE status = 'running'
      RETURNING id, source, trigger_type`,
    ['abandoned: the executor process that claimed this job exited before finishing it, and was not the process that found the row on the next start'],
  );
  if (!rows.length) return;
  const bySource = rows.reduce<Record<string, number>>((acc, r) => {
    const k = `${r.source ?? 'null'}/${r.trigger_type}`;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.warn(
    `[job-executor] reclaimed ${rows.length} orphaned job(s) left running by a dead process:`,
    Object.entries(bySource).map(([k, n]) => `${k}=${n}`).join(' '),
  );
}

/**
 * Reclaim jobs that have outlived every legitimate ceiling — the periodic
 * counterpart to the startup sweep above.
 *
 * ⚠️ WHY NOT JUST RUN reclaimOrphanedJobs() ON A TIMER. Its predicate is bare
 * `status = 'running'` with no owner and no age. That is correct exactly once,
 * at startup, when this process has claimed nothing yet and every running row is
 * therefore someone else's corpse. On a timer it would fail every job THIS
 * process is currently running, seconds after claiming it.
 *
 * ⚠️ AND NOT `worker_id <> me` EITHER. Jobs are claimed with FOR UPDATE SKIP
 * LOCKED, which is a design that tolerates more than one executor. Under two
 * instances an owner-based sweep has each one killing the other's live work.
 *
 * Age is the predicate that is safe in both cases. A job still running past the
 * longest ceiling the system can legitimately produce — WORKSPACE_JOB_TIMEOUT_MS,
 * itself derived from the adapter's own WORKSPACE_TIMEOUT_MS — is wedged no
 * matter who owns it or how many executors are live. The margin below is
 * deliberately generous: this is a backstop for a job nothing else will ever
 * finish, not a second timeout competing with the real ones.
 *
 * The gap this closes: reclaim ran ONLY at startup, so a wedged session held one
 * of MAX_CONCURRENT_JOBS slots until the next restart — up to 12 hours — and
 * nothing said so (TOM-SLOWDOWN-2026-09-01.md, still-open item 3).
 */
const WEDGED_JOB_GRACE_MS = 15 * 60_000;
const WEDGED_SWEEP_INTERVAL_MS = 5 * 60_000;

async function reclaimWedgedJobs(): Promise<void> {
  const cutoffSeconds = (Date.now() - (WORKSPACE_JOB_TIMEOUT_MS + WEDGED_JOB_GRACE_MS)) / 1000;
  const { rows } = await pool.query<{ id: string; source: string | null; trigger_type: string }>(
    `UPDATE agent_jobs
        SET status = 'failed',
            completed_at = EXTRACT(EPOCH FROM NOW()),
            error = left(coalesce(error || ' | ', '') || $1, 500)
      WHERE status = 'running'
        AND started_at IS NOT NULL
        AND started_at < $2
      RETURNING id, source, trigger_type`,
    [
      'wedged: still running past every ceiling this system can produce, so nothing was ever going to finish it',
      cutoffSeconds,
    ],
  );
  if (!rows.length) return;
  console.warn(
    `[job-executor] reclaimed ${rows.length} wedged job(s) past the ${Math.round(WORKSPACE_JOB_TIMEOUT_MS / 60_000)}min ceiling:`,
    rows.map(r => `${r.source ?? 'null'}/${r.trigger_type}`).join(' '),
  );
}

export function start(): void {
  if (scanIntervalId || runIntervalId) return;
  // Before claiming anything new, settle what a previous incarnation abandoned.
  reclaimOrphanedJobs().catch(err =>
    console.error('[job-executor] orphan reclaim failed:', err instanceof Error ? err.message : err));
  scanIntervalId = setInterval(() => {
    scanForDueAgents().catch(err => console.error('[job-executor] scan crash:', err));
  }, POLL_INTERVAL_MS);
  runIntervalId = setInterval(() => {
    runDueJobs().catch(err => console.error('[job-executor] run crash:', err));
  }, POLL_INTERVAL_MS);
  // Backstop, not a hot loop: a wedged job is by definition hours old, so
  // checking every 5 minutes finds it just as surely as checking every 5 seconds
  // and does not put a write query on the poll interval.
  wedgedIntervalId = setInterval(() => {
    reclaimWedgedJobs().catch(err => console.error('[job-executor] wedged reclaim crash:', err));
  }, WEDGED_SWEEP_INTERVAL_MS);
  console.log(`[job-executor] started — scan + run every ${POLL_INTERVAL_MS}ms, wedged sweep every ${WEDGED_SWEEP_INTERVAL_MS / 60_000}min`);
}

export function stop(): void {
  if (scanIntervalId) { clearInterval(scanIntervalId); scanIntervalId = null; }
  if (runIntervalId) { clearInterval(runIntervalId); runIntervalId = null; }
  if (wedgedIntervalId) { clearInterval(wedgedIntervalId); wedgedIntervalId = null; }
  console.log('[job-executor] stopped');
}
