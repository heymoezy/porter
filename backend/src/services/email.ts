/**
 * DEPRECATED: Gmail-specific email service.
 * Use services/mail/* for the new hosted mail system (Stalwart backend).
 * This module remains only for the Gmail connector import path.
 *
 * - sendEmail(): Gmail OAuth2 outbound — use services/mail/send-service.ts instead
 * - routeInboundEmail(): Gmail-specific routing — use services/mail/inbound-processor.ts instead
 * - startImapIdle() / stopImapIdle(): DISABLED in Tranche 12 — no longer auto-started
 * - findOrCreateEmailContact/Conversation(): Still used by Gmail connector inbound path
 */

import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { decryptCredential } from '../lib/credential-crypto.js';
import { pool } from '../db/client.js';
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
    row = (await pool.query(
      `SELECT id, meta_json FROM workspace_connections
       WHERE id = $1 AND provider = 'email' AND status = 'connected' LIMIT 1`,
      [connectionId]
    )).rows[0] as ConnectionRow | undefined;
  } else {
    row = (await pool.query(
      `SELECT id, meta_json FROM workspace_connections
       WHERE provider = 'email' AND status = 'connected' LIMIT 1`
    )).rows[0] as ConnectionRow | undefined;
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
async function markNeedsReauth(reason: string): Promise<void> {
  await pool.query(`
    UPDATE workspace_connections
    SET status = 'needs_reauth', last_error = $1, updated_at = EXTRACT(EPOCH FROM NOW())
    WHERE provider = 'email' AND status = 'connected'
  `, [reason]);

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
      await markNeedsReauth(message);
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
export async function routeInboundEmail(
  from: string,
  subject: string,
  body: string,
  projectId?: string
): Promise<string | null> {
  // Get connection to read routing_rules from meta_json
  const row = (await pool.query(
    `SELECT id, meta_json FROM workspace_connections
     WHERE provider = 'email' AND status = 'connected' LIMIT 1`
  )).rows[0] as ConnectionRow | undefined;

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
        await insertEmailJob(rule.agent_id, projectId ?? null, from, subject, body);
        return rule.agent_id;
      }
    } catch {
      // Invalid regex pattern — skip rule
    }
  }

  // No rule matched — dispatch to Porter (master agent) for AI routing
  const porterAgent = (await pool.query(
    `SELECT id FROM personas WHERE name = 'Porter' AND status != 'retired' LIMIT 1`
  )).rows[0] as { id: string } | undefined;

  if (!porterAgent) return null;

  const prompt = `New email received:\nFrom: ${from}\nSubject: ${subject}\n\n${body}`;
  await insertEmailJob(porterAgent.id, projectId ?? null, from, subject, prompt);
  return porterAgent.id;
}

/**
 * Insert an agent_job for an inbound email with 60-second deduplication.
 */
async function insertEmailJob(
  agentId: string,
  projectId: string | null,
  from: string,
  subject: string,
  prompt: string
): Promise<void> {
  const existing = (await pool.query(`
    SELECT 1 FROM agent_jobs
    WHERE agent_id = $1
      AND trigger_type = 'email_received'
      AND status = 'pending'
      AND created_at > EXTRACT(EPOCH FROM NOW()) - 60
    LIMIT 1
  `, [agentId])).rows[0];

  if (existing) return;

  const id = crypto.randomUUID();
  await pool.query(`
    INSERT INTO agent_jobs
      (id, agent_id, project_id, trigger_type, trigger_data, prompt, status, scheduled_for)
    VALUES
      ($1, $2, $3, 'email_received', $4, $5, 'pending', EXTRACT(EPOCH FROM NOW()))
  `, [
    id,
    agentId,
    projectId,
    JSON.stringify({ from, subject }),
    prompt,
  ]);
}

// ── IMAP IDLE (DEPRECATED — no longer auto-started) ─────────────────────────
// Tranche 12: IMAP IDLE is disabled. Stalwart webhooks handle inbound mail.
// These functions remain exported for type compatibility but should not be called.

const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * @deprecated IMAP IDLE is no longer auto-started. Stalwart handles inbound mail.
 * Kept for connector-only use case (manual Gmail import). Not called at boot.
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

            // Phase 11: Archive inbound email in unified table BEFORE routing
            const contactId = await findOrCreateEmailContact(fromAddr);
            const conversationId = await findOrCreateEmailConversation(fromAddr, contactId);

            await pool.query(
              `INSERT INTO messages (conversation_id, sender_type, sender_id, sender_name, content, channel_type, channel_metadata, created_at)
               VALUES ($1, 'external', $2, $3, $4, 'email', $5, EXTRACT(EPOCH FROM NOW()))`,
              [
                conversationId,
                fromAddr,
                fromAddr,
                `Subject: ${subject}\n\n${body}`,
                JSON.stringify({ from: fromAddr, subject }),
              ]
            );

            await pool.query(
              `UPDATE conversations SET updated_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $1`,
              [conversationId]
            );

            console.log('[email] Archived inbound email from %s in conversation %s', fromAddr, conversationId);

            const agentId = await routeInboundEmail(fromAddr, subject, body);

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
        await pool.query(`
          UPDATE workspace_connections
          SET status = 'degraded', last_error = $1, updated_at = EXTRACT(EPOCH FROM NOW())
          WHERE provider = 'email'
        `, [message]);

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
 * @deprecated IMAP IDLE shutdown hook removed in Tranche 12.
 * Kept for API compatibility.
 */
export function stopImapIdle(): void {
  if (imapClient) {
    imapClient.logout().catch(() => {});
    imapClient = null;
    imapRunning = false;
    console.log('[email] IMAP IDLE stopped');
  }
}

// ── Unified table helpers (Phase 11) ──────────────────────────────────────────

/**
 * Find an existing contact by email address, or create one.
 * Returns the contact ID.
 */
export async function findOrCreateEmailContact(
  emailAddress: string,
  displayName?: string
): Promise<string> {
  const normalized = emailAddress.trim().toLowerCase();

  // Look up by email value in contact_emails
  const existing = (await pool.query(
    `SELECT ce.contact_id FROM contact_emails ce WHERE ce.value = $1`,
    [normalized]
  )).rows[0] as { contact_id: string } | undefined;

  if (existing) return existing.contact_id;

  // Create new contact
  const contactId = crypto.randomUUID();
  const name = displayName || normalized;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO contacts (id, display_name, created_by, created_at, updated_at)
       VALUES ($1, $2, 'system', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
      [contactId, name]
    );
    await client.query(
      `INSERT INTO contact_emails (contact_id, value, label, is_primary)
       VALUES ($1, $2, 'work', 1)`,
      [contactId, normalized]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return contactId;
}

/**
 * Find an existing conversation by email address external_id, or create one.
 * Links the conversation to the contact.
 * Returns the conversation ID.
 */
export async function findOrCreateEmailConversation(
  emailAddress: string,
  contactId: string
): Promise<string> {
  const normalized = emailAddress.trim().toLowerCase();

  const existing = (await pool.query(
    `SELECT id FROM conversations WHERE external_id = $1`,
    [normalized]
  )).rows[0] as { id: string } | undefined;

  if (existing) {
    // Ensure contact link exists
    await pool.query(
      `INSERT INTO contact_conversations (contact_id, conversation_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [contactId, existing.id]
    );
    return existing.id;
  }

  const convId = crypto.randomUUID();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO conversations
         (id, scope_type, scope_id, external_id, channel_type, created_at, updated_at)
       VALUES ($1, 'contact', $2, $3, 'email', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
       ON CONFLICT DO NOTHING`,
      [convId, contactId, normalized]
    );
    await client.query(
      `INSERT INTO contact_conversations (contact_id, conversation_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [contactId, convId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Handle race: if INSERT was a no-op, another request created it first
  const check = (await pool.query(
    `SELECT id FROM conversations WHERE external_id = $1`,
    [normalized]
  )).rows[0] as { id: string };

  return check.id;
}
