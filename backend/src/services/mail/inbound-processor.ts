/**
 * Inbound processor — processes raw inbound email payloads into Porter's mail system.
 * Handles mailbox resolution, deduplication, message creation, SSE broadcast,
 * and optional agent job routing.
 */

import crypto from 'node:crypto';
import { pool } from '../../db/client.js';
import { createMessage } from './message-service.js';
import { getMailboxByAddress } from './mailbox-service.js';
import { broadcast } from '../sse-hub.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface InboundEmailPayload {
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  internetMessageId: string;
  inReplyTo?: string;
  referencesHeader?: string;
  headers?: Record<string, unknown>;
  attachments?: unknown[];
  receivedAt?: number;
}

export interface InboundResult {
  messageId: string;
  threadId: string;
  mailboxId: string;
  isNew: boolean;
  routed: boolean;
}

// ── Process Single Inbound Email ─────────────────────────────────────────

export async function processInboundEmail(payload: InboundEmailPayload): Promise<InboundResult> {
  // 1. Resolve recipient mailbox — try each 'to' address, then 'cc'
  let mailbox = null;
  const allRecipients = [...payload.to, ...(payload.cc ?? [])];

  for (const addr of allRecipients) {
    const normalized = addr.toLowerCase().trim();
    mailbox = await getMailboxByAddress(normalized);
    if (mailbox) break;

    // Also check aliases
    const { rows: aliasRows } = await pool.query<{ mailbox_id: string }>(
      `SELECT mailbox_id FROM mail_aliases WHERE alias_address = $1 AND receive_enabled = 1`,
      [normalized],
    );
    if (aliasRows.length > 0) {
      const { rows: mbRows } = await pool.query<{ id: string; address: string; domain_id: string; display_name: string }>(
        `SELECT * FROM mailboxes WHERE id = $1`,
        [aliasRows[0].mailbox_id],
      );
      if (mbRows.length > 0) {
        mailbox = mbRows[0];
        break;
      }
    }
  }

  if (!mailbox) {
    throw new Error(`No mailbox found for recipients: ${allRecipients.join(', ')}`);
  }

  const mailboxId = mailbox.id;

  // 2. Deduplicate: check if internet_message_id already exists for this mailbox
  if (payload.internetMessageId) {
    const { rows: dupes } = await pool.query<{ id: string; thread_id: string }>(
      `SELECT id, thread_id FROM mail_messages WHERE internet_message_id = $1 AND mailbox_id = $2 LIMIT 1`,
      [payload.internetMessageId, mailboxId],
    );
    if (dupes.length > 0) {
      return {
        messageId: dupes[0].id,
        threadId: dupes[0].thread_id,
        mailboxId,
        isNew: false,
        routed: false,
      };
    }
  }

  // 3. Create message
  const { id: messageId, threadId } = await createMessage({
    mailboxId,
    direction: 'inbound',
    folder: 'inbox',
    status: 'received',
    fromAddress: payload.from,
    fromName: payload.fromName,
    toAddresses: payload.to,
    ccAddresses: payload.cc,
    subject: payload.subject,
    textBody: payload.textBody,
    htmlBody: payload.htmlBody,
    internetMessageId: payload.internetMessageId,
    inReplyTo: payload.inReplyTo,
    referencesHeader: payload.referencesHeader,
    headers: payload.headers,
    attachments: payload.attachments,
    receivedAt: payload.receivedAt ?? Math.floor(Date.now() / 1000),
  });

  // 4. Broadcast SSE event
  broadcast('mail:inbound', {
    mailboxId,
    threadId,
    messageId,
    subject: payload.subject,
    from: payload.from,
  });

  // 5. Route to agent if mailbox has an agent binding
  let routed = false;
  const { rows: agentBindings } = await pool.query<{ agent_id: string }>(
    `SELECT agent_id FROM agent_mailboxes WHERE mailbox_id = $1 LIMIT 1`,
    [mailboxId],
  );

  if (agentBindings.length > 0) {
    const agentId = agentBindings[0].agent_id;
    const jobId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    await pool.query(
      `INSERT INTO agent_jobs (id, agent_id, trigger_type, status, trigger_data, source, created_at, scheduled_for)
       VALUES ($1, $2, 'inbound_email', 'pending', $3::jsonb, 'mail', $4, $4)`,
      [
        jobId,
        agentId,
        JSON.stringify({ messageId, threadId, from: payload.from, subject: payload.subject }),
        now,
      ],
    );

    routed = true;
  }

  // 6. Return result
  return { messageId, threadId, mailboxId, isNew: true, routed };
}

// ── Process Batch ────────────────────────────────────────────────────────

export async function processInboundBatch(payloads: InboundEmailPayload[]): Promise<{
  processed: number;
  duplicates: number;
  errors: number;
}> {
  let processed = 0;
  let duplicates = 0;
  let errors = 0;

  for (const payload of payloads) {
    try {
      const result = await processInboundEmail(payload);
      if (result.isNew) {
        processed++;
      } else {
        duplicates++;
      }
    } catch (err) {
      console.error('[inbound-processor] Failed to process email:', err);
      errors++;
    }
  }

  return { processed, duplicates, errors };
}
