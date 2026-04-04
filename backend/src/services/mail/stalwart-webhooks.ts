/**
 * Stalwart webhook handler — processes webhook notifications from Stalwart mail server.
 * Handles new message ingestion and bounce/failure tracking.
 */

import { pool } from '../../db/client.js';
import { processInboundEmail, type InboundEmailPayload } from './inbound-processor.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface StalwartWebhookEvent {
  type: string; // 'message.new' | 'message.received' | 'message.bounced' | 'message.failed'
  data: {
    from?: string;
    fromName?: string;
    to?: string[];
    cc?: string[];
    subject?: string;
    messageId?: string;
    textBody?: string;
    htmlBody?: string;
    inReplyTo?: string;
    references?: string;
    headers?: Record<string, unknown>;
    receivedAt?: number;
  };
}

// ── Handler ──────────────────────────────────────────────────────────────

export async function handleStalwartWebhook(event: StalwartWebhookEvent): Promise<{
  handled: boolean;
  action: string;
  detail?: Record<string, unknown>;
}> {
  switch (event.type) {
    case 'message.new':
    case 'message.received': {
      const d = event.data;

      if (!d.from || !d.to?.length || !d.messageId) {
        return { handled: false, action: 'missing_required_fields' };
      }

      const payload: InboundEmailPayload = {
        from: d.from,
        fromName: d.fromName,
        to: d.to,
        cc: d.cc,
        subject: d.subject ?? '(no subject)',
        textBody: d.textBody ?? '',
        htmlBody: d.htmlBody,
        internetMessageId: d.messageId,
        inReplyTo: d.inReplyTo,
        referencesHeader: d.references,
        headers: d.headers,
        receivedAt: d.receivedAt,
      };

      const result = await processInboundEmail(payload);
      return {
        handled: true,
        action: result.isNew ? 'ingested' : 'duplicate',
        detail: {
          messageId: result.messageId,
          threadId: result.threadId,
          mailboxId: result.mailboxId,
          routed: result.routed,
        },
      };
    }

    case 'message.bounced':
    case 'message.failed': {
      const d = event.data;
      if (!d.messageId) {
        return { handled: false, action: 'missing_message_id' };
      }

      // Look up delivery record by provider_message_id or internet_message_id
      const newStatus = event.type === 'message.bounced' ? 'bounced' : 'failed';
      const now = Math.floor(Date.now() / 1000);

      // Try matching on the message's internet_message_id -> delivery record
      const { rowCount } = await pool.query(
        `UPDATE mail_deliveries d
         SET status = $1, completed_at = $2
         FROM mail_messages m
         WHERE m.internet_message_id = $3
           AND d.message_id = m.id
           AND d.status NOT IN ('bounced', 'failed')`,
        [newStatus, now, d.messageId],
      );

      return {
        handled: true,
        action: 'bounce_recorded',
        detail: { updatedDeliveries: rowCount ?? 0, status: newStatus },
      };
    }

    default:
      return { handled: false, action: 'unknown_event' };
  }
}
