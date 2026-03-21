import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { decryptCredential } from '../lib/credential-crypto.js';
import { sqlite } from '../db/client.js';
import { emitSSE } from './scheduler.js';
import crypto from 'crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailCredentials {
  access_token: string;
  refresh_token: string;
  email: string;
  expires_at?: number;
}

interface RoutingRule {
  pattern: string;
  agent_id: string;
}

interface ConnectionRow {
  id: string;
  meta_json: string;
}

// ── Module state ──────────────────────────────────────────────────────────────

let imapClient: ImapFlow | null = null;
let imapRunning = false;

// ── Credential helpers ────────────────────────────────────────────────────────

/**
 * Read and decrypt email OAuth2 credentials from workspace_connections.
 * Throws if no connected email connection exists.
 */
async function getEmailCredentials(connectionId?: string): Promise<EmailCredentials> {
  let row: ConnectionRow | undefined;

  if (connectionId) {
    row = sqlite.prepare(
      `SELECT id, meta_json FROM workspace_connections
       WHERE id = ? AND provider = 'email' AND status = 'connected' LIMIT 1`
    ).get(connectionId) as ConnectionRow | undefined;
  } else {
    row = sqlite.prepare(
      `SELECT id, meta_json FROM workspace_connections
       WHERE provider = 'email' AND status = 'connected' LIMIT 1`
    ).get() as ConnectionRow | undefined;
  }

  if (!row) {
    throw new Error('No connected email connection found');
  }

  const plaintext = decryptCredential(row.meta_json);
  return JSON.parse(plaintext) as EmailCredentials;
}

/**
 * Mark an email connection as needing re-authentication and emit SSE.
 */
function markNeedsReauth(reason: string): void {
  sqlite.prepare(`
    UPDATE workspace_connections
    SET status = 'needs_reauth', last_error = @reason, updated_at = unixepoch('now')
    WHERE provider = 'email' AND status = 'connected'
  `).run({ reason });

  emitSSE('connection:status', {
    provider: 'email',
    status: 'needs_reauth',
    error: reason,
  }).catch(() => {});
}

// ── Outbound email ────────────────────────────────────────────────────────────

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  agentName?: string;
  connectionId?: string;
}

/**
 * Send an email via Gmail using OAuth2.
 * Returns the sent message ID.
 */
export async function sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
  const { to, subject, body, agentName, connectionId } = params;

  const creds = await getEmailCredentials(connectionId);

  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: creds.email,
      accessToken: creds.access_token,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: creds.refresh_token,
    },
  });

  const from = agentName
    ? `"${agentName} via Porter" <${creds.email}>`
    : `"Porter" <${creds.email}>`;

  try {
    const info = await transport.sendMail({ from, to, subject, html: body });
    return { messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Auth errors signal expired tokens
    if (message.includes('invalid_grant') || message.includes('Token has been expired')) {
      markNeedsReauth(message);
    }
    throw err;
  }
}

// ── Inbound routing ───────────────────────────────────────────────────────────

/**
 * Route an inbound email to an agent based on configured routing rules.
 * Falls back to Porter (master agent) for AI-based routing if no rule matches.
 * Returns the agent_id dispatched to, or null if no connection.
 */
export function routeInboundEmail(
  from: string,
  subject: string,
  body: string,
  projectId?: string
): string | null {
  // Get connection to read routing_rules from meta_json
  const row = sqlite.prepare(
    `SELECT id, meta_json FROM workspace_connections
     WHERE provider = 'email' AND status = 'connected' LIMIT 1`
  ).get() as ConnectionRow | undefined;

  if (!row) return null;

  let routingRules: RoutingRule[] = [];
  try {
    const meta = JSON.parse(decryptCredential(row.meta_json));
    routingRules = (meta.routing_rules as RoutingRule[]) ?? [];
  } catch {
    // Ignore decrypt failures — treat as no routing rules
  }

  // Try to match against routing rules
  for (const rule of routingRules) {
    try {
      if (from.includes(rule.pattern) || new RegExp(rule.pattern, 'i').test(from)) {
        insertEmailJob(rule.agent_id, projectId ?? null, from, subject, body);
        return rule.agent_id;
      }
    } catch {
      // Invalid regex pattern — skip rule
    }
  }

  // No rule matched — dispatch to Porter (master agent) for AI routing
  const porterAgent = sqlite.prepare(
    `SELECT id FROM personas WHERE name = 'Porter' AND status != 'retired' LIMIT 1`
  ).get() as { id: string } | undefined;

  if (!porterAgent) return null;

  const prompt = `New email received:\nFrom: ${from}\nSubject: ${subject}\n\n${body}`;
  insertEmailJob(porterAgent.id, projectId ?? null, from, subject, prompt);
  return porterAgent.id;
}

/**
 * Insert an agent_job for an inbound email with 60-second deduplication.
 */
function insertEmailJob(
  agentId: string,
  projectId: string | null,
  from: string,
  subject: string,
  prompt: string
): void {
  const existing = sqlite.prepare(`
    SELECT 1 FROM agent_jobs
    WHERE agent_id = @agentId
      AND trigger_type = 'email_received'
      AND status = 'pending'
      AND created_at > unixepoch('now') - 60
    LIMIT 1
  `).get({ agentId });

  if (existing) return;

  const id = crypto.randomUUID();
  sqlite.prepare(`
    INSERT INTO agent_jobs
      (id, agent_id, project_id, trigger_type, trigger_data, prompt, status, scheduled_for)
    VALUES
      (@id, @agentId, @projectId, 'email_received', @triggerData, @prompt, 'pending', unixepoch('now'))
  `).run({
    id,
    agentId,
    projectId,
    triggerData: JSON.stringify({ from, subject }),
    prompt,
  });
}

// ── IMAP IDLE ─────────────────────────────────────────────────────────────────

const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Start listening for inbound emails via IMAP IDLE.
 * Automatically reconnects on disconnect (up to MAX_CONSECUTIVE_FAILURES).
 * Fire-and-forget — caller should not await this indefinitely.
 */
export async function startImapIdle(connectionId?: string): Promise<void> {
  if (imapRunning) {
    console.log('[email] IMAP IDLE already running — skipping duplicate start');
    return;
  }

  let consecutiveFailures = 0;

  const connect = async (): Promise<void> => {
    try {
      const creds = await getEmailCredentials(connectionId);

      const client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
          user: creds.email,
          accessToken: creds.access_token,
        },
        logger: false,
      });

      imapClient = client;
      imapRunning = true;
      consecutiveFailures = 0;

      await client.connect();
      console.log('[email] IMAP IDLE connected to imap.gmail.com for %s', creds.email);

      const lock = await client.getMailboxLock('INBOX');

      try {
        // Listen for new messages (EXISTS event fires when new mail arrives)
        client.on('exists', async () => {
          try {
            const msg = await client.fetchOne('*', {
              source: true,
              envelope: true,
            });

            if (!msg) return;

            const fromAddr = msg.envelope?.from?.[0]?.address ?? 'unknown';
            const subject = msg.envelope?.subject ?? '(no subject)';
            // Extract body text from raw source (basic extraction)
            const sourceText = msg.source?.toString('utf8') ?? '';
            const body = sourceText.length > 2000 ? sourceText.slice(-2000) : sourceText;

            console.log('[email] Inbound email from %s: %s', fromAddr, subject);
            const agentId = routeInboundEmail(fromAddr, subject, body);

            emitSSE('agent:activity', {
              event_type: 'email_received',
              summary: `Inbound email from ${fromAddr}: "${subject}"`,
              dispatched_to: agentId,
            }).catch(() => {});
          } catch (err) {
            console.error('[email] Error processing inbound message:', err);
          }
        });

        // IDLE blocks until the server sends a change notification
        await client.idle();
      } finally {
        lock.release();
      }
    } catch (err) {
      imapRunning = false;
      imapClient = null;
      consecutiveFailures++;

      const message = err instanceof Error ? err.message : String(err);
      console.error(
        '[email] IMAP IDLE error (failure %d/%d): %s',
        consecutiveFailures,
        MAX_CONSECUTIVE_FAILURES,
        message
      );

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error('[email] IMAP IDLE: max consecutive failures — marking connection degraded');
        sqlite.prepare(`
          UPDATE workspace_connections
          SET status = 'degraded', last_error = @error, updated_at = unixepoch('now')
          WHERE provider = 'email'
        `).run({ error: message });

        emitSSE('connection:status', {
          provider: 'email',
          status: 'degraded',
          error: message,
        }).catch(() => {});

        return; // Stop reconnect loop
      }

      // Reconnect after 5 seconds
      console.log('[email] IMAP IDLE: reconnecting in 5s...');
      await new Promise<void>(resolve => setTimeout(resolve, 5000));
      return connect();
    }
  };

  // Fire-and-forget connection loop
  connect().catch(err => {
    console.error('[email] IMAP IDLE fatal error:', err);
    imapRunning = false;
  });
}

/**
 * Cleanly stop the IMAP IDLE connection.
 * Called during server shutdown via Fastify onClose hook.
 */
export function stopImapIdle(): void {
  if (imapClient) {
    imapClient.logout().catch(() => {});
    imapClient = null;
    imapRunning = false;
    console.log('[email] IMAP IDLE stopped');
  }
}
