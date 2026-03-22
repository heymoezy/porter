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
const MAX_DRIP_COUNT = 20;
let intervalId: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;

// ── Drip Reminder Scheduling ──────────────────────────────────────────────────

/**
 * Schedule a drip reminder job for a collaborator invite.
 * Cadence: first 3 drips = daily, drips 3-7 = weekly, drip 7+ = monthly.
 */
export function scheduleDripReminder(collaboratorId: string, dripCount: number): void {
  if (dripCount >= MAX_DRIP_COUNT) return;
  const offsetDays = dripCount < 3 ? 1 : dripCount < 7 ? 7 : 30;
  const scheduledFor = Date.now() / 1000 + offsetDays * 86400;

  sqlite.prepare(`
    INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, status, scheduled_for, created_at)
    VALUES (?, 'system', 'invite_drip', ?, 'pending', ?, unixepoch('now'))
  `).run(
    crypto.randomUUID(),
    JSON.stringify({ collaborator_id: collaboratorId }),
    scheduledFor,
  );
}

/**
 * Schedule the next autonomous contact analysis sweep for a contact.
 * Self-adjusting frequency based on engagement_score:
 *   - High engagement (70-100): re-analyze every 4 hours (active relationships change fast)
 *   - Medium engagement (30-69): re-analyze every 12 hours
 *   - Low engagement (0-29): re-analyze every 24 hours
 *   - Error/unknown (-1): retry in 6 hours
 */
export function scheduleNextContactAnalysis(contactId: string, engagementScore: number): void {
  let intervalSec: number;
  if (engagementScore < 0) {
    intervalSec = 6 * 3600;       // 6 hours (error backoff)
  } else if (engagementScore >= 70) {
    intervalSec = 4 * 3600;       // 4 hours (high engagement)
  } else if (engagementScore >= 30) {
    intervalSec = 12 * 3600;      // 12 hours (medium engagement)
  } else {
    intervalSec = 24 * 3600;      // 24 hours (low engagement)
  }

  const scheduledFor = Date.now() / 1000 + intervalSec;
  sqlite.prepare(`
    INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, status, scheduled_for, created_at)
    VALUES (?, 'system', 'contact_analysis', ?, 'pending', ?, unixepoch('now'))
  `).run(
    crypto.randomUUID(),
    JSON.stringify({ contact_id: contactId }),
    scheduledFor,
  );
}

/**
 * Schedule the next autonomous learning session for an agent template.
 * Self-adjusting cadence based on domain_activity score:
 *   - Error/unknown (-1): retry in 12 hours
 *   - High activity (70-100): re-learn every 24 hours (fast-moving domains: AI, JS frameworks)
 *   - Medium activity (30-69): re-learn every 48 hours
 *   - Low activity (0-29): re-learn every 7 days (stable domains: accounting, law basics)
 */
export function scheduleNextLearningSession(templateId: string, domainActivity: number): void {
  let intervalSec: number;
  if (domainActivity < 0) {
    intervalSec = 12 * 3600;       // 12 hours (error backoff)
  } else if (domainActivity >= 70) {
    intervalSec = 24 * 3600;       // 24 hours (fast-moving domain: AI, JS frameworks)
  } else if (domainActivity >= 30) {
    intervalSec = 48 * 3600;       // 48 hours (medium-velocity domain)
  } else {
    intervalSec = 7 * 24 * 3600;   // 7 days (stable domain: accounting, law basics)
  }

  const scheduledFor = Date.now() / 1000 + intervalSec;
  sqlite.prepare(`
    INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, status, scheduled_for, created_at)
    VALUES (?, 'system', 'learning_session', ?, 'pending', ?, unixepoch('now'))
  `).run(
    crypto.randomUUID(),
    JSON.stringify({ template_id: templateId }),
    scheduledFor,
  );
}

// ── Bootstrap helpers ─────────────────────────────────────────────────────────

/**
 * On scheduler startup, seed a pending contact_analysis job for every contact
 * that has at least one linked conversation but no existing pending analysis job.
 * This ensures the 24/7 autonomous sweep starts without manual intervention.
 */
function bootstrapContactAnalysis(): void {
  const contactsNeedingJobs = sqlite.prepare(`
    SELECT DISTINCT cc.contact_id
    FROM contact_conversations cc
    JOIN contacts c ON c.id = cc.contact_id
    WHERE NOT EXISTS (
      SELECT 1 FROM agent_jobs
      WHERE trigger_type = 'contact_analysis'
        AND status = 'pending'
        AND json_extract(trigger_data, '$.contact_id') = cc.contact_id
    )
  `).all() as { contact_id: string }[];

  if (contactsNeedingJobs.length > 0) {
    console.log('[scheduler] bootstrapping contact analysis for %d contacts', contactsNeedingJobs.length);
    // Stagger jobs so they don't all fire at once — spread over first 5 minutes
    const staggerSec = contactsNeedingJobs.length > 1
      ? 300 / contactsNeedingJobs.length   // 300 seconds / N contacts
      : 0;
    for (let i = 0; i < contactsNeedingJobs.length; i++) {
      const scheduledFor = Date.now() / 1000 + (i * staggerSec);
      sqlite.prepare(`
        INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, status, scheduled_for, created_at)
        VALUES (?, 'system', 'contact_analysis', ?, 'pending', ?, unixepoch('now'))
      `).run(
        crypto.randomUUID(),
        JSON.stringify({ contact_id: contactsNeedingJobs[i].contact_id }),
        scheduledFor,
      );
    }
  }
}

/**
 * On scheduler startup, seed one pending learning_session job per non-internal
 * agent template that doesn't already have a pending job.
 * Staggered over 10 minutes to prevent thundering herd on startup.
 */
function bootstrapLearning(): void {
  const templatesNeedingJobs = sqlite.prepare(`
    SELECT id FROM agent_templates
    WHERE is_internal = 0
    AND NOT EXISTS (
      SELECT 1 FROM agent_jobs
      WHERE trigger_type = 'learning_session'
        AND status = 'pending'
        AND json_extract(trigger_data, '$.template_id') = agent_templates.id
    )
  `).all() as { id: string }[];

  if (templatesNeedingJobs.length > 0) {
    console.log('[scheduler] bootstrapping learning sessions for %d templates', templatesNeedingJobs.length);
    const staggerSec = templatesNeedingJobs.length > 1
      ? 600 / templatesNeedingJobs.length
      : 0;
    for (let i = 0; i < templatesNeedingJobs.length; i++) {
      const scheduledFor = Date.now() / 1000 + (i * staggerSec);
      sqlite.prepare(`
        INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, status, scheduled_for, created_at)
        VALUES (?, 'system', 'learning_session', ?, 'pending', ?, unixepoch('now'))
      `).run(
        crypto.randomUUID(),
        JSON.stringify({ template_id: templatesNeedingJobs[i].id }),
        scheduledFor,
      );
    }
  }
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
}

function logFeatureFlagState() {
  console.log('[scheduler] Feature flags: scheduling=%s, triggers=%s, ephemeral=%s',
    featureFlags.agentScheduling, featureFlags.eventTriggers, featureFlags.ephemeralAgents);
}

export function start() {
  if (intervalId) return;
  console.log('[scheduler] started — polling every %dms, worker=%s', POLL_INTERVAL_MS, WORKER_ID.slice(0, 8));
  logFeatureFlagState();
  bootstrapContactAnalysis();
  bootstrapLearning();
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
  // Use LEFT JOIN on personas to allow system jobs (agent_id='system') to be claimed.
  // For non-system agents, the original constraints apply (not retired, not ephemeral on finished project).
  return sqlite.prepare(`
    UPDATE agent_jobs
    SET status = 'running', started_at = unixepoch('now'), worker_id = @workerId,
        attempt_count = attempt_count + 1
    WHERE id = (
      SELECT aj.id FROM agent_jobs aj
      LEFT JOIN personas p ON p.id = aj.agent_id
      LEFT JOIN projects pr ON pr.id = aj.project_id
      WHERE aj.status = 'pending'
        AND aj.scheduled_for <= unixepoch('now')
        AND (aj.agent_id = 'system' OR (
          p.status != 'retired'
          AND (p.is_temporary = 0 OR pr.status IS NULL OR pr.status NOT IN ('complete', 'archived'))
        ))
      ORDER BY aj.scheduled_for ASC LIMIT 1
    )
    RETURNING *
  `).get({ workerId: WORKER_ID }) as JobRow | undefined;
}

async function executeJob(job: JobRow): Promise<void> {
  // ── Invite drip reminders ─────────────────────────────────────────────────
  if (job.trigger_type === 'invite_drip') {
    const data = JSON.parse(job.trigger_data || '{}') as { collaborator_id?: string };
    const collaboratorId = data.collaborator_id;
    if (!collaboratorId) {
      markJobFailed(job.id, 'Missing collaborator_id in invite_drip trigger_data');
      return;
    }

    const collab = sqlite.prepare(`
      SELECT pc.id, pc.project_id, pc.email, pc.role, pc.status, pc.invite_token,
             pc.invited_by, pc.drip_count,
             p.name AS project_name,
             u2.display_name AS inviter_display_name, u2.full_name AS inviter_full_name
      FROM project_collaborators pc
      LEFT JOIN projects p ON p.id = pc.project_id
      LEFT JOIN users u2 ON u2.username = pc.invited_by
      WHERE pc.id = ?
    `).get(collaboratorId) as {
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
      markJobComplete(job.id, JSON.stringify({ skipped: true, reason: collab ? collab.status : 'not_found' }));
      return;
    }

    if (collab.drip_count >= MAX_DRIP_COUNT) {
      markJobComplete(job.id, JSON.stringify({ skipped: true, reason: 'max_drips_reached' }));
      return;
    }

    if (!collab.invite_token) {
      markJobComplete(job.id, JSON.stringify({ skipped: true, reason: 'no_invite_token' }));
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
    sqlite.prepare(
      `UPDATE project_collaborators SET drip_count = drip_count + 1, last_drip_at = unixepoch('now') WHERE id = ?`
    ).run(collaboratorId);

    // Log drip event to collaboration_events
    sqlite.prepare(`
      INSERT INTO collaboration_events
        (project_id, collaborator_id, actor_username, event_type, detail, created_at)
      VALUES (?, ?, 'system', 'drip_sent', ?, unixepoch('now'))
    `).run(
      collab.project_id,
      collaboratorId,
      JSON.stringify({ drip_count: collab.drip_count + 1 }),
    );

    // Schedule next drip if under max
    if (collab.drip_count + 1 < MAX_DRIP_COUNT) {
      scheduleDripReminder(collaboratorId, collab.drip_count + 1);
    }

    markJobComplete(job.id, JSON.stringify({ drip_count: collab.drip_count + 1 }));
    return;
  }

  // ── Contact analysis (CRM-03) ──────────────────────────────────────────────
  if (job.trigger_type === 'contact_analysis') {
    const data = JSON.parse(job.trigger_data || '{}') as { contact_id?: string };
    const contactId = data.contact_id;
    if (!contactId) {
      markJobFailed(job.id, 'Missing contact_id in contact_analysis trigger_data');
      return;
    }

    // Verify contact still exists
    const contact = sqlite.prepare('SELECT id FROM contacts WHERE id = ?').get(contactId);
    if (!contact) {
      markJobComplete(job.id, JSON.stringify({ skipped: true, reason: 'contact_deleted' }));
      // Contact deleted — do NOT re-enqueue
      return;
    }

    try {
      const { analyzeContact } = await import('./contact-analyzer.js');
      const analysis = await analyzeContact(contactId);

      // Write to contact_analyses table
      const analysisId = crypto.randomUUID();
      sqlite.prepare(`
        INSERT INTO contact_analyses (id, contact_id, sentiment, engagement_score, churn_risk, relationship_stage, key_topics, last_interaction_summary, communication_style, raw_json, job_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch('now'))
      `).run(
        analysisId,
        contactId,
        analysis.sentiment,
        analysis.engagement_score,
        analysis.churn_risk,
        analysis.relationship_stage,
        JSON.stringify(analysis.key_topics),
        analysis.last_interaction_summary,
        analysis.communication_style,
        JSON.stringify(analysis),
        job.id,
      );

      markJobComplete(job.id, JSON.stringify({ analysis_id: analysisId, contact_id: contactId }));
      logActivity('system', job.id, null, 'contact_analysis_complete',
        `Analyzed contact ${contactId}`, JSON.stringify({ analysis_id: analysisId }));

      // ── Re-enqueue: autonomous 24/7 sweep with self-adjusting frequency ──
      scheduleNextContactAnalysis(contactId, analysis.engagement_score);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      markJobFailed(job.id, errMsg);
      logActivity('system', job.id, null, 'contact_analysis_failed',
        `Analysis failed for contact ${contactId}: ${errMsg}`, '{}');

      // Re-enqueue even on failure — use a longer backoff (6 hours)
      // so the sweep doesn't stop permanently on transient errors.
      scheduleNextContactAnalysis(contactId, -1);
    }
    return;
  }

  // ── Autonomous learning session (LEARN-01/02/03) ──────────────────────────
  if (job.trigger_type === 'learning_session') {
    const data = JSON.parse(job.trigger_data || '{}') as { template_id?: string };
    const templateId = data.template_id;
    if (!templateId) {
      markJobFailed(job.id, 'Missing template_id in learning_session trigger_data');
      return;
    }

    // Verify template still exists
    const template = sqlite.prepare('SELECT id FROM agent_templates WHERE id = ?').get(templateId);
    if (!template) {
      markJobComplete(job.id, JSON.stringify({ skipped: true, reason: 'template_deleted' }));
      // Template deleted — do NOT re-enqueue
      return;
    }

    try {
      const { runLearningSession } = await import('./learner.js');
      const result = await runLearningSession(templateId);

      markJobComplete(job.id, JSON.stringify({
        session_id: result.session_id,
        concepts_retained: result.concepts_retained,
        capped: result.capped,
      }));
      logActivity('system', job.id, null, 'learning_session_complete',
        `Learning session for template ${templateId}: ${result.concepts_retained} concepts`,
        JSON.stringify({ session_id: result.session_id, template_id: templateId }));

      // Re-enqueue: autonomous 24/7 sweep with self-adjusting cadence
      scheduleNextLearningSession(templateId, result.domain_activity);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      markJobFailed(job.id, errMsg);
      logActivity('system', job.id, null, 'learning_session_failed',
        `Learning session failed for template ${templateId}: ${errMsg}`, '{}');

      // Re-enqueue even on failure — 12h error backoff
      scheduleNextLearningSession(templateId, -1);
    }
    return;
  }

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
