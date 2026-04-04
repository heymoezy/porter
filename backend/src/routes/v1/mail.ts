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
import * as newsletterService from '../../services/mail/newsletter-service.js';
import * as learningService from '../../services/mail/mail-learning-service.js';
import { checkGmailHealth, getGmailConnector, importFromGmail } from '../../services/mail/gmail-connector.js';

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

  // DELETE /api/v1/mail/messages/:id — permanently delete (from trash only)
  fastify.delete('/messages/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const message = await messageService.getMessageById(id);
    if (!message) {
      return reply.status(404).send(err('NOT_FOUND', `Message not found: ${id}`));
    }
    if (message.folder !== 'trash') {
      return reply.status(400).send(err('NOT_IN_TRASH', 'Only trashed messages can be permanently deleted'));
    }
    await messageService.deleteMessagePermanently(id);
    return reply.send(ok({ messageId: id, deleted: true }));
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

  // ── Newsletter Sources ──────────────────────────────────────────────────

  // GET /api/v1/mail/newsletters/sources — list all newsletter sources
  fastify.get('/newsletters/sources', async (request, reply) => {
    const query = request.query as { mailboxId?: string; active?: string };
    const sources = await newsletterService.listSources({
      mailboxId: query.mailboxId,
      active: query.active !== undefined ? query.active === 'true' : undefined,
    });
    return reply.send(ok({ sources }));
  });

  // POST /api/v1/mail/newsletters/sources — create a newsletter source
  fastify.post('/newsletters/sources', async (request, reply) => {
    const body = request.body as {
      sourceType?: string;
      sourceKey?: string;
      displayName?: string;
      mailboxId?: string;
      senderPattern?: string;
      trustLevel?: string;
      topicTags?: string[];
    } | undefined;

    if (!body?.sourceType || !body?.sourceKey || !body?.displayName) {
      return reply.status(400).send(
        err('MISSING_FIELDS', 'sourceType, sourceKey, and displayName are required'),
      );
    }

    const result = await newsletterService.createSource({
      sourceType: body.sourceType,
      sourceKey: body.sourceKey,
      displayName: body.displayName,
      mailboxId: body.mailboxId,
      senderPattern: body.senderPattern,
      trustLevel: body.trustLevel,
      topicTags: body.topicTags,
    });
    return reply.status(201).send(ok(result));
  });

  // PATCH /api/v1/mail/newsletters/sources/:id — update a newsletter source
  fastify.patch('/newsletters/sources/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      displayName?: string;
      trustLevel?: string;
      topicTags?: string[];
      active?: boolean;
    } | undefined;

    const existing = await newsletterService.getSourceById(id);
    if (!existing) {
      return reply.status(404).send(err('NOT_FOUND', `Newsletter source not found: ${id}`));
    }

    await newsletterService.updateSource(id, body ?? {});
    return reply.send(ok({ id, updated: true }));
  });

  // DELETE /api/v1/mail/newsletters/sources/:id — delete a newsletter source
  fastify.delete('/newsletters/sources/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await newsletterService.getSourceById(id);
    if (!existing) {
      return reply.status(404).send(err('NOT_FOUND', `Newsletter source not found: ${id}`));
    }

    await newsletterService.deleteSource(id);
    return reply.send(ok({ id, deleted: true }));
  });

  // ── Newsletter Subscriptions ────────────────────────────────────────────

  // POST /api/v1/mail/newsletters/subscribe — create a subscription
  fastify.post('/newsletters/subscribe', async (request, reply) => {
    const body = request.body as {
      agentId?: string;
      mailboxId?: string;
      sourceId?: string;
      deliveryMode?: string;
    } | undefined;

    if (!body?.agentId || !body?.mailboxId || !body?.sourceId) {
      return reply.status(400).send(
        err('MISSING_FIELDS', 'agentId, mailboxId, and sourceId are required'),
      );
    }

    const result = await newsletterService.subscribe({
      agentId: body.agentId,
      mailboxId: body.mailboxId,
      sourceId: body.sourceId,
      deliveryMode: body.deliveryMode,
    });
    return reply.status(201).send(ok(result));
  });

  // POST /api/v1/mail/newsletters/unsubscribe — cancel a subscription
  fastify.post('/newsletters/unsubscribe', async (request, reply) => {
    const body = request.body as { subscriptionId?: string } | undefined;
    if (!body?.subscriptionId) {
      return reply.status(400).send(err('MISSING_FIELDS', 'subscriptionId is required'));
    }

    await newsletterService.unsubscribe(body.subscriptionId);
    return reply.send(ok({ subscriptionId: body.subscriptionId, status: 'cancelled' }));
  });

  // GET /api/v1/mail/agents/:agentId/subscriptions — get agent subscriptions
  fastify.get('/agents/:agentId/subscriptions', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const subscriptions = await newsletterService.getAgentSubscriptions(agentId);
    return reply.send(ok({ subscriptions }));
  });

  // ── Learning Events ─────────────────────────────────────────────────────

  // GET /api/v1/mail/newsletters/learning-events — query learning audit trail
  fastify.get('/newsletters/learning-events', async (request, reply) => {
    const query = request.query as {
      agentId?: string;
      messageId?: string;
      eventType?: string;
      limit?: string;
    };
    const events = await learningService.getLearningEvents({
      agentId: query.agentId,
      messageId: query.messageId,
      eventType: query.eventType,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return reply.send(ok({ events }));
  });

  // ── Gmail Connector ────────────────────────────────────────────────────
  // Gmail is an optional external connector, NOT the primary mail backend.
  // These endpoints allow importing from Gmail into Porter's hosted mail system.

  // GET /api/v1/mail/connectors/gmail/status — check Gmail connector health
  fastify.get('/connectors/gmail/status', async (_request, reply) => {
    const status = await checkGmailHealth();
    return reply.send(ok(status));
  });

  // POST /api/v1/mail/import/gmail — import messages from Gmail
  fastify.post('/import/gmail', async (request, reply) => {
    const body = request.body as {
      mailboxId?: string;
      since?: number;
      maxResults?: number;
    } | undefined;

    if (!body?.mailboxId) {
      return reply.status(400).send(err('MISSING_FIELDS', 'mailboxId is required'));
    }

    const connector = await getGmailConnector();
    if (!connector) {
      return reply.status(404).send(
        err('NO_CONNECTOR', 'No Gmail connector configured — connect via Google OAuth first'),
      );
    }

    try {
      const result = await importFromGmail({
        connector,
        mailboxId: body.mailboxId,
        since: body.since,
        maxResults: body.maxResults,
      });
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('IMPORT_FAILED', message));
    }
  });
}
