/**
 * Mail routes — user-facing mail endpoints.
 */

import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/envelope.js';
import { config } from '../../config.js';
import * as mailboxService from '../../services/mail/mailbox-service.js';
import * as threadService from '../../services/mail/thread-service.js';
import * as messageService from '../../services/mail/message-service.js';
import { sendMail, createDraft, replyToMessage } from '../../services/mail/send-service.js';
import { processInboundEmail, type InboundEmailPayload } from '../../services/mail/inbound-processor.js';
import { handleStalwartWebhook, type StalwartWebhookEvent } from '../../services/mail/stalwart-webhooks.js';

export default async function mailRoutes(fastify: FastifyInstance) {
  // GET /api/v1/mail — list agent identities for compose picker
  fastify.get('/', async (_request, reply) => {
    const identities = await mailboxService.getAgentIdentities();
    return reply.send(ok({ identities }));
  });

  // GET /api/v1/mail/mailboxes — list all active mailboxes
  fastify.get('/mailboxes', async (_request, reply) => {
    const mailboxes = await mailboxService.listMailboxes({ status: 'active' });
    return reply.send(ok({ mailboxes }));
  });

  // ── Mailbox folder counts ──────────────────────────────────────────────

  // GET /api/v1/mail/mailboxes/:id/folders — folder message counts
  fastify.get('/mailboxes/:id/folders', async (request, reply) => {
    const { id } = request.params as { id: string };
    const mailbox = await mailboxService.getMailboxById(id);
    if (!mailbox) {
      return reply.status(404).send(err('NOT_FOUND', `Mailbox not found: ${id}`));
    }
    const counts = await messageService.getMailboxFolderCounts(id);
    return reply.send(ok({ mailboxId: id, folders: counts }));
  });

  // ── Threads ────────────────────────────────────────────────────────────

  // GET /api/v1/mail/mailboxes/:id/threads — list threads for a mailbox
  fastify.get('/mailboxes/:id/threads', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { folder?: string; limit?: string; offset?: string };

    const mailbox = await mailboxService.getMailboxById(id);
    if (!mailbox) {
      return reply.status(404).send(err('NOT_FOUND', `Mailbox not found: ${id}`));
    }

    const result = await threadService.getThreadsByMailbox(id, {
      folder: query.folder,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    });
    return reply.send(ok(result));
  });

  // GET /api/v1/mail/threads/:id — get a single thread
  fastify.get('/threads/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const thread = await threadService.getThreadById(id);
    if (!thread) {
      return reply.status(404).send(err('NOT_FOUND', `Thread not found: ${id}`));
    }
    return reply.send(ok({ thread }));
  });

  // GET /api/v1/mail/threads/:id/messages — list messages in a thread
  fastify.get('/threads/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string };
    const thread = await threadService.getThreadById(id);
    if (!thread) {
      return reply.status(404).send(err('NOT_FOUND', `Thread not found: ${id}`));
    }
    const messages = await messageService.getMessagesByThread(id);
    return reply.send(ok({ messages }));
  });

  // ── Message actions ────────────────────────────────────────────────────

  // POST /api/v1/mail/messages/:id/archive — move to archive
  fastify.post('/messages/:id/archive', async (request, reply) => {
    const { id } = request.params as { id: string };
    const message = await messageService.getMessageById(id);
    if (!message) {
      return reply.status(404).send(err('NOT_FOUND', `Message not found: ${id}`));
    }
    await messageService.updateMessageFolder(id, 'archive');
    return reply.send(ok({ messageId: id, folder: 'archive' }));
  });

  // POST /api/v1/mail/messages/:id/trash — move to trash
  fastify.post('/messages/:id/trash', async (request, reply) => {
    const { id } = request.params as { id: string };
    const message = await messageService.getMessageById(id);
    if (!message) {
      return reply.status(404).send(err('NOT_FOUND', `Message not found: ${id}`));
    }
    await messageService.updateMessageFolder(id, 'trash');
    return reply.send(ok({ messageId: id, folder: 'trash' }));
  });

  // POST /api/v1/mail/messages/:id/read — mark as read
  fastify.post('/messages/:id/read', async (request, reply) => {
    const { id } = request.params as { id: string };
    const message = await messageService.getMessageById(id);
    if (!message) {
      return reply.status(404).send(err('NOT_FOUND', `Message not found: ${id}`));
    }
    await messageService.markMessageRead(id);
    return reply.send(ok({ messageId: id, read: true }));
  });

  // ── Send / Draft / Reply ──────────────────────────────────────────────

  // POST /api/v1/mail/messages/send — send an outbound message
  fastify.post('/messages/send', async (request, reply) => {
    const body = request.body as {
      mailboxId?: string;
      to?: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
      textBody?: string;
      htmlBody?: string;
      inReplyTo?: string;
      referencesHeader?: string;
    } | undefined;

    if (!body?.mailboxId || !body?.to?.length || !body?.subject || !body?.textBody) {
      return reply.status(400).send(
        err('MISSING_FIELDS', 'mailboxId, to, subject, and textBody are required'),
      );
    }

    try {
      const result = await sendMail({
        mailboxId: body.mailboxId,
        to: body.to,
        cc: body.cc,
        bcc: body.bcc,
        subject: body.subject,
        textBody: body.textBody,
        htmlBody: body.htmlBody,
        inReplyTo: body.inReplyTo,
        referencesHeader: body.referencesHeader,
      });
      return reply.status(201).send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) {
        return reply.status(404).send(err('NOT_FOUND', message));
      }
      return reply.status(500).send(err('SEND_FAILED', message));
    }
  });

  // POST /api/v1/mail/drafts — create a draft message
  fastify.post('/drafts', async (request, reply) => {
    const body = request.body as {
      mailboxId?: string;
      to?: string[];
      cc?: string[];
      subject?: string;
      textBody?: string;
      htmlBody?: string;
      inReplyTo?: string;
      referencesHeader?: string;
    } | undefined;

    if (!body?.mailboxId) {
      return reply.status(400).send(err('MISSING_FIELDS', 'mailboxId is required'));
    }

    try {
      const result = await createDraft({
        mailboxId: body.mailboxId,
        to: body.to,
        cc: body.cc,
        subject: body.subject,
        textBody: body.textBody,
        htmlBody: body.htmlBody,
        inReplyTo: body.inReplyTo,
        referencesHeader: body.referencesHeader,
      });
      return reply.status(201).send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) {
        return reply.status(404).send(err('NOT_FOUND', message));
      }
      return reply.status(500).send(err('DRAFT_FAILED', message));
    }
  });

  // POST /api/v1/mail/messages/:id/reply — reply to an existing message
  fastify.post('/messages/:id/reply', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      textBody?: string;
      htmlBody?: string;
      to?: string[];
      cc?: string[];
    } | undefined;

    if (!body?.textBody) {
      return reply.status(400).send(err('MISSING_FIELDS', 'textBody is required'));
    }

    try {
      const result = await replyToMessage(id, {
        textBody: body.textBody,
        htmlBody: body.htmlBody,
        to: body.to,
        cc: body.cc,
      });
      return reply.status(201).send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) {
        return reply.status(404).send(err('NOT_FOUND', message));
      }
      return reply.status(500).send(err('REPLY_FAILED', message));
    }
  });

  // ── Inbound ─────────────────────────────────────────────────────────────

  // POST /api/v1/mail/inbound — manually ingest an inbound email (requires auth)
  fastify.post('/inbound', async (request, reply) => {
    const body = request.body as InboundEmailPayload | undefined;

    if (!body?.from || !body?.to?.length || !body?.subject || !body?.textBody || !body?.internetMessageId) {
      return reply.status(400).send(
        err('MISSING_FIELDS', 'from, to, subject, textBody, and internetMessageId are required'),
      );
    }

    try {
      const result = await processInboundEmail(body);
      const status = result.isNew ? 201 : 200;
      return reply.status(status).send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('No mailbox found')) {
        return reply.status(404).send(err('NO_MAILBOX', message));
      }
      return reply.status(500).send(err('INBOUND_FAILED', message));
    }
  });

  // ── Webhooks ────────────────────────────────────────────────────────────

  // POST /api/v1/mail/webhooks/stalwart — Stalwart mail server webhook
  // No auth required (called by external service), but webhook secret checked
  fastify.post('/webhooks/stalwart', async (request, reply) => {
    // Verify webhook secret if configured
    const secret = config.mail.webhookSecret;
    if (secret) {
      const provided = request.headers['x-webhook-secret'] as string | undefined;
      if (provided !== secret) {
        return reply.status(401).send(err('UNAUTHORIZED', 'Invalid webhook secret'));
      }
    }

    const body = request.body as StalwartWebhookEvent | undefined;
    if (!body?.type || !body?.data) {
      return reply.status(400).send(err('INVALID_PAYLOAD', 'type and data are required'));
    }

    try {
      const result = await handleStalwartWebhook(body);
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[mail] Webhook processing error:', message);
      return reply.status(500).send(err('WEBHOOK_FAILED', message));
    }
  });
}
