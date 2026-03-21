import { sqlite } from '../db/client.js';
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
export function getEventSubscribers(eventType: string, projectId: string | null): string[] {
  const rows = sqlite.prepare(`
    SELECT id, config FROM personas
    WHERE status != 'retired'
  `).all() as { id: string; config: string }[];

  const subscribers: string[] = [];
  for (const row of rows) {
    try {
      const cfg = JSON.parse(row.config || '{}');
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
function insertTriggerJob(
  triggerType: string,
  projectId: string | null,
  agentId: string,
  triggerData: Record<string, unknown>,
  prompt?: string
): boolean {
  const existing = sqlite.prepare(`
    SELECT 1 FROM agent_jobs
    WHERE agent_id = @agentId
      AND trigger_type = @triggerType
      AND (project_id = @projectId OR (@projectId IS NULL AND project_id IS NULL))
      AND status = 'pending'
      AND created_at > unixepoch('now') - @dedupWindow
    LIMIT 1
  `).get({
    agentId,
    triggerType,
    projectId: projectId ?? null,
    dedupWindow: DEDUP_WINDOW_SEC,
  });

  if (existing) return false;

  const id = crypto.randomUUID();
  sqlite.prepare(`
    INSERT INTO agent_jobs (id, agent_id, project_id, trigger_type, trigger_data, prompt, status, scheduled_for)
    VALUES (@id, @agentId, @projectId, @triggerType, @triggerData, @prompt, 'pending', unixepoch('now'))
  `).run({
    id,
    agentId,
    projectId: projectId ?? null,
    triggerType,
    triggerData: JSON.stringify(triggerData),
    prompt: prompt ?? null,
  });

  return true;
}

/**
 * Called when a file is uploaded/created in a project.
 * Inserts pending jobs for all agents subscribed to file-created events.
 */
export function onFileCreated(projectId: string, filename: string): number {
  if (!featureFlags.eventTriggers) return 0;

  const subscribers = getEventSubscribers('file-created', projectId);
  let inserted = 0;
  for (const agentId of subscribers) {
    const created = insertTriggerJob('file-created', projectId, agentId,
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
export function onMessageReceived(projectId: string, message: string, fromUser: string): number {
  if (!featureFlags.eventTriggers) return 0;

  const subscribers = getEventSubscribers('message-received', projectId);
  let inserted = 0;
  for (const agentId of subscribers) {
    const created = insertTriggerJob('message-received', projectId, agentId,
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
export function checkDeadlineTriggers(): number {
  if (!featureFlags.eventTriggers) return 0;

  // deadline is TEXT 'YYYY-MM-DD' — use string BETWEEN for ISO date comparison.
  // SQLite string comparison on ISO dates works correctly because the format is
  // lexicographically ordered (YYYY-MM-DD sorts the same as chronologically).
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  const todayStr = now.toISOString().slice(0, 10);         // e.g. '2026-03-20'
  const tomorrowStr = tomorrow.toISOString().slice(0, 10); // e.g. '2026-03-21'

  const approaching = sqlite.prepare(`
    SELECT id, name, deadline FROM projects
    WHERE status = 'active'
      AND deadline IS NOT NULL
      AND deadline BETWEEN @today AND @tomorrow
  `).all({ today: todayStr, tomorrow: tomorrowStr }) as {
    id: string; name: string; deadline: string;
  }[];

  let inserted = 0;
  for (const proj of approaching) {
    const subscribers = getEventSubscribers('deadline-approaching', proj.id);
    for (const agentId of subscribers) {
      const created = insertTriggerJob('deadline-approaching', proj.id, agentId,
        { projectName: proj.name, deadline: proj.deadline, projectId: proj.id },
        `Project "${proj.name}" deadline approaching: ${proj.deadline}. Review status and take action.`
      );
      if (created) inserted++;
    }
  }
  return inserted;
}
