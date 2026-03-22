/**
 * External Call Dispatcher
 *
 * Routes 'external_call' agent_jobs to the correct service module.
 * Provides queueExternalCall utility for creating external_call jobs
 * and checkConnectionHealth for pre-dispatch connection gating.
 *
 * Exported functions:
 *   queueExternalCall      — create an external_call agent_job (non-blocking)
 *   dispatchExternalCall   — execute an external_call job by routing to correct service
 *   checkConnectionHealth  — check if a service connection is operational
 */

import { listRepos, readFile, createBranch, createPullRequest } from './github.js';
import { sendEmail } from './email.js';
import { pushMilestoneToCalendar } from './calendar.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { sqlite } from '../db/client.js';
import crypto from 'crypto';

// ── Queue utility ─────────────────────────────────────────────────────────────

/**
 * Create an agent_job with trigger_type='external_call' without blocking the caller.
 * This is the canonical way to schedule an external API call from any route handler or service.
 *
 * @param agentId    Agent that owns the job
 * @param projectId  Optional project context
 * @param service    Target external service
 * @param action     Service-specific action name
 * @param params     Action parameters (merged into trigger_data alongside service + action)
 * @returns          The new job ID
 */
export function queueExternalCall(
  agentId: string,
  projectId: string | null,
  service: 'github' | 'email' | 'calendar' | 'whatsapp',
  action: string,
  params: Record<string, unknown>,
): string {
  const jobId = crypto.randomUUID();
  sqlite.prepare(`
    INSERT INTO agent_jobs
      (id, agent_id, project_id, trigger_type, trigger_data, status, scheduled_for)
    VALUES (?, ?, ?, 'external_call', ?, 'pending', unixepoch('now'))
  `).run(jobId, agentId, projectId, JSON.stringify({ service, action, ...params }));
  return jobId;
}

// ── Connection health check ────────────────────────────────────────────────────

/**
 * Check whether a connection for the given service is operational.
 * Returns 'blocked' when the connection is missing, needs reauth, or in error state.
 * Returns 'ok' when the connection status is 'connected'.
 */
export function checkConnectionHealth(service: string): 'ok' | 'blocked' {
  // Map service name to provider column value in workspace_connections
  const providerMap: Record<string, string> = {
    github: 'github',
    email: 'email',
    calendar: 'google_calendar',
    whatsapp: 'whatsapp',
  };

  const provider = providerMap[service];
  if (!provider) return 'blocked';

  const row = sqlite.prepare(
    `SELECT status FROM workspace_connections WHERE provider = ? LIMIT 1`
  ).get(provider) as { status: string } | undefined;

  if (!row) return 'blocked'; // No connection configured
  if (row.status === 'connected') return 'ok';
  // needs_reauth, error, degraded, etc.
  return 'blocked';
}

// ── Unified table helper (Phase 11) ───────────────────────────────────────────

/**
 * Archive an outbound message in the unified messages table before dispatching.
 * Finds or creates the conversation by external_id, records the agent's outbound message.
 * Per locked decision: "All outbound through unified table."
 */
function archiveOutboundMessage(opts: {
  channelType: 'email' | 'whatsapp';
  externalId: string;       // recipient phone or email (conversation external_id)
  agentId: string;
  agentName: string;
  content: string;
  rawPayload: Record<string, unknown>;
}): void {
  // Find conversation by external_id (should exist if we received inbound first)
  let conv = sqlite.prepare(
    `SELECT id FROM conversations WHERE external_id = ?`
  ).get(opts.externalId) as { id: string } | undefined;

  if (!conv) {
    // Create conversation for outbound-first scenario (agent initiates contact)
    const convId = crypto.randomUUID();
    sqlite.prepare(
      `INSERT OR IGNORE INTO conversations
         (id, scope_type, scope_id, external_id, channel_type, created_at, updated_at)
       VALUES (?, 'global', NULL, ?, ?, unixepoch('now'), unixepoch('now'))`
    ).run(convId, opts.externalId, opts.channelType);

    conv = sqlite.prepare(
      `SELECT id FROM conversations WHERE external_id = ?`
    ).get(opts.externalId) as { id: string };
  }

  // Archive the outbound message
  sqlite.prepare(
    `INSERT INTO messages (conversation_id, sender_type, sender_id, sender_name, content, channel_type, channel_metadata, created_at)
     VALUES (?, 'agent', ?, ?, ?, ?, ?, unixepoch('now'))`
  ).run(
    conv.id,
    opts.agentId,
    opts.agentName,
    opts.content,
    opts.channelType,
    JSON.stringify(opts.rawPayload)
  );

  // Update conversation timestamp
  sqlite.prepare(
    `UPDATE conversations SET updated_at = unixepoch('now') WHERE id = ?`
  ).run(conv.id);
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

/**
 * Execute an external_call job by routing its trigger_data to the correct service module.
 * Returns a string result that is stored in agent_jobs.result on success.
 */
export async function dispatchExternalCall(triggerData: string): Promise<string> {
  const data = JSON.parse(triggerData) as Record<string, unknown>;

  switch (data.service) {
    case 'github':
      return await dispatchGitHub(data);
    case 'email':
      return await dispatchEmail(data);
    case 'calendar':
      return await dispatchCalendar(data);
    case 'whatsapp':
      return await dispatchWhatsApp(data);
    default:
      throw new Error(`Unknown external service: ${String(data.service)}`);
  }
}

// ── Service-specific dispatchers ──────────────────────────────────────────────

async function dispatchGitHub(data: Record<string, unknown>): Promise<string> {
  switch (data.action) {
    case 'list_repos': {
      const repos = await listRepos();
      return JSON.stringify(repos);
    }
    case 'read_file': {
      const result = await readFile(
        data.owner as string,
        data.repo as string,
        data.path as string,
        data.ref as string | undefined,
      );
      return result.content;
    }
    case 'create_branch': {
      const branch = await createBranch(
        data.owner as string,
        data.repo as string,
        data.branch_name as string,
        data.from_ref as string | undefined,
      );
      return branch;
    }
    case 'create_pr': {
      const pr = await createPullRequest(
        data.owner as string,
        data.repo as string,
        {
          title: data.title as string,
          body: data.body as string,
          head: data.head as string,
          base: data.base as string | undefined,
        },
      );
      return JSON.stringify({ number: pr.number, html_url: pr.html_url });
    }
    default:
      throw new Error(`Unknown GitHub action: ${String(data.action)}`);
  }
}

async function dispatchEmail(data: Record<string, unknown>): Promise<string> {
  switch (data.action) {
    case 'send': {
      // Phase 11: Archive outbound email in unified table before sending
      archiveOutboundMessage({
        channelType: 'email',
        externalId: (data.to as string).trim().toLowerCase(),
        agentId: (data.agent_id as string) || 'unknown',
        agentName: (data.agent_name as string) || 'Porter',
        content: `Subject: ${data.subject as string}\n\n${data.body as string}`,
        rawPayload: { to: data.to, subject: data.subject },
      });

      const result = await sendEmail({
        to: data.to as string,
        subject: data.subject as string,
        body: data.body as string,
        agentName: data.agent_name as string | undefined,
      });
      return `Email sent: ${result.messageId}`;
    }
    default:
      throw new Error(`Unknown email action: ${String(data.action)}`);
  }
}

async function dispatchCalendar(data: Record<string, unknown>): Promise<string> {
  switch (data.action) {
    case 'push_milestone': {
      const eventId = await pushMilestoneToCalendar({
        title: data.title as string,
        date: data.date as string,
        projectName: data.project_name as string,
        projectId: data.project_id as string | undefined,
      });
      return eventId;
    }
    default:
      throw new Error(`Unknown calendar action: ${String(data.action)}`);
  }
}

async function dispatchWhatsApp(data: Record<string, unknown>): Promise<string> {
  switch (data.action) {
    case 'send': {
      // Phase 11: Archive outbound WhatsApp in unified table before sending
      const toPhone = (data.to as string).startsWith('+')
        ? (data.to as string)
        : '+' + (data.to as string).replace(/^0+/, '');

      archiveOutboundMessage({
        channelType: 'whatsapp',
        externalId: toPhone,
        agentId: (data.agent_id as string) || 'unknown',
        agentName: (data.agent_name as string) || 'Porter',
        content: data.text as string,
        rawPayload: { to: data.to, text: data.text },
      });

      const result = await sendWhatsAppMessage({
        to: data.to as string,
        text: data.text as string,
        agentName: data.agent_name as string | undefined,
        agentEmoji: data.agent_emoji as string | undefined,
      });
      return `Message sent: ${result.messageId}`;
    }
    default:
      throw new Error(`Unknown WhatsApp action: ${String(data.action)}`);
  }
}
