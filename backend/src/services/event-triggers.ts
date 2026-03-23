import { pool } from '../db/client.js';
import { featureFlags } from '../config.js';
import crypto from 'crypto';

interface EventSubscription {
  type: string;
  project_id: string | null;
}

const DEDUP_WINDOW_SEC = 60; // 60-second deduplication window

/**
 * Get agents subscribed to a specific event type for a project.
 * Reads event_subscriptions from persona config JSON.
 * Returns array of agent IDs.
 */
export async function getEventSubscribers(eventType: string, projectId: string | null): Promise<string[]> {
  const rows = (await pool.query(`
    SELECT id, config FROM personas
    WHERE status != 'retired'
  `)).rows as { id: string; config: string }[];

  const subscribers: string[] = [];
  for (const row of rows) {
    try {
      const cfg = typeof row.config === 'string' ? JSON.parse(row.config || '{}') : (row.config || {});
      const subs: EventSubscription[] = cfg.event_subscriptions ?? [];
      for (const sub of subs) {
        if (sub.type === eventType) {
          if (!sub.project_id || sub.project_id === projectId) {
            subscribers.push(row.id);
            break;
          }
        }
      }
    } catch {
      // Invalid JSON in config — skip silently
    }
  }
  return subscribers;
}

/**
 * Insert a trigger job with deduplication.
 * Skips insertion if a pending job with the same agent_id + trigger_type + project_id
 * exists within the dedup window.
 */
async function insertTriggerJob(
  triggerType: string,
  projectId: string | null,
  agentId: string,
  triggerData: Record<string, unknown>,
  prompt?: string
): Promise<boolean> {
  const existing = (await pool.query(`
    SELECT 1 FROM agent_jobs
    WHERE agent_id = $1
      AND trigger_type = $2
      AND (project_id = $3 OR ($3 IS NULL AND project_id IS NULL))
      AND status = 'pending'
      AND created_at > EXTRACT(EPOCH FROM NOW()) - $4
    LIMIT 1
  `, [
    agentId,
    triggerType,
    projectId ?? null,
    DEDUP_WINDOW_SEC,
  ])).rows[0];

  if (existing) return false;

  const id = crypto.randomUUID();
  await pool.query(`
    INSERT INTO agent_jobs (id, agent_id, project_id, trigger_type, trigger_data, prompt, status, scheduled_for)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending', EXTRACT(EPOCH FROM NOW()))
  `, [
    id,
    agentId,
    projectId ?? null,
    triggerType,
    JSON.stringify(triggerData),
    prompt ?? null,
  ]);

  return true;
}

/**
 * Called when a file is uploaded/created in a project.
 * Inserts pending jobs for all agents subscribed to file-created events.
 */
export async function onFileCreated(projectId: string, filename: string): Promise<number> {
  if (!featureFlags.eventTriggers) return 0;

  const subscribers = await getEventSubscribers('file-created', projectId);
  let inserted = 0;
  for (const agentId of subscribers) {
    const created = await insertTriggerJob('file-created', projectId, agentId,
      { filename, projectId },
      `New file uploaded: ${filename}. Review and process as needed.`
    );
    if (created) inserted++;
  }
  return inserted;
}

/**
 * Called when a new message is received in a project context.
 * Inserts pending jobs for agents subscribed to message-received events.
 */
export async function onMessageReceived(projectId: string, message: string, fromUser: string): Promise<number> {
  if (!featureFlags.eventTriggers) return 0;

  const subscribers = await getEventSubscribers('message-received', projectId);
  let inserted = 0;
  for (const agentId of subscribers) {
    const created = await insertTriggerJob('message-received', projectId, agentId,
      { message: message.slice(0, 500), fromUser, projectId },
      `New message from ${fromUser}: ${message.slice(0, 200)}`
    );
    if (created) inserted++;
  }
  return inserted;
}

/**
 * Scans for projects with deadlines within the next 24 hours.
 * Called from scheduler tick. Inserts deadline-approaching jobs.
 * Only fires once per 60-second window per project (dedup handles this).
 *
 * IMPORTANT: deadline is stored as TEXT (ISO date YYYY-MM-DD).
 * Use string BETWEEN comparison — do NOT use CAST(deadline AS REAL) or
 * CAST(deadline AS INTEGER). The RESEARCH.md example using CAST is INCORRECT
 * for ISO date strings and will produce wrong results.
 * Correct pattern: deadline BETWEEN '2026-03-20' AND '2026-03-21'
 */
export async function checkDeadlineTriggers(): Promise<number> {
  if (!featureFlags.eventTriggers) return 0;

  // deadline is TEXT 'YYYY-MM-DD' — use string BETWEEN for ISO date comparison.
  // PostgreSQL string comparison on ISO dates works correctly because the format is
  // lexicographically ordered (YYYY-MM-DD sorts the same as chronologically).
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  const todayStr = now.toISOString().slice(0, 10);         // e.g. '2026-03-20'
  const tomorrowStr = tomorrow.toISOString().slice(0, 10); // e.g. '2026-03-21'

  const approaching = (await pool.query(`
    SELECT id, name, deadline FROM projects
    WHERE status = 'active'
      AND deadline IS NOT NULL
      AND deadline BETWEEN $1 AND $2
  `, [todayStr, tomorrowStr])).rows as {
    id: string; name: string; deadline: string;
  }[];

  let inserted = 0;
  for (const proj of approaching) {
    const subscribers = await getEventSubscribers('deadline-approaching', proj.id);
    for (const agentId of subscribers) {
      const created = await insertTriggerJob('deadline-approaching', proj.id, agentId,
        { projectName: proj.name, deadline: proj.deadline, projectId: proj.id },
        `Project "${proj.name}" deadline approaching: ${proj.deadline}. Review status and take action.`
      );
      if (created) inserted++;
    }
  }
  return inserted;
}
