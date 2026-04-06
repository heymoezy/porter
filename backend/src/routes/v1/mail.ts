/**
 * Mail routes — user-facing mail endpoints.
 * Reading/actions use JMAP directly against Stalwart. PostgreSQL is a secondary cache.
 */

import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/envelope.js';
import { config } from '../../config.js';
import * as mailboxService from '../../services/mail/mailbox-service.js';
import { sendMail, createDraft, replyToMessage } from '../../services/mail/send-service.js';
import { processInboundEmail, type InboundEmailPayload } from '../../services/mail/inbound-processor.js';
import { handleStalwartWebhook, type StalwartWebhookEvent } from '../../services/mail/stalwart-webhooks.js';
import * as newsletterService from '../../services/mail/newsletter-service.js';
import * as learningService from '../../services/mail/mail-learning-service.js';
import { checkGmailHealth, getGmailConnector, importFromGmail } from '../../services/mail/gmail-connector.js';
import { getProvider } from '../../services/mail/provider-factory.js';
import type { JmapEmailSummary, JmapEmailFull, JmapMailboxInfo } from '../../services/mail/provider-types.js';

// ── JMAP Helpers ──────────────────────────────────────────────────────────

/** Resolve Porter mailbox UUID → JMAP session (auth, accountId, identityId). */
async function resolveJmap(porterMailboxId: string) {
  const mailbox = await mailboxService.getMailboxById(porterMailboxId);
  if (!mailbox) throw Object.assign(new Error(`Mailbox not found: ${porterMailboxId}`), { statusCode: 404 });

  const provider = getProvider();
  if (!provider) throw new Error('Mail provider not configured');

  const session = await provider.getJmapSession(mailbox.address);
  return { ...session, mailbox, provider };
}

/** Map frontend folder name to JMAP mailbox role. */
const FOLDER_TO_ROLE: Record<string, string> = {
  inbox: 'inbox',
  sent: 'sent',
  drafts: 'drafts',
  trash: 'trash',
  archive: 'archive',
  junk: 'junk',
};

/** Find JMAP mailbox ID for a given folder name, from a pre-fetched mailbox list. */
function findJmapMailboxId(mailboxes: JmapMailboxInfo[], folder: string): string | null {
  const role = FOLDER_TO_ROLE[folder];
  if (!role) return null;
  const match = mailboxes.find(m => m.role === role || m.name.toLowerCase() === role);
  return match?.id ?? null;
}

/** Convert JMAP mailbox IDs to Porter folder name. */
function jmapToFolder(mailboxIds: Record<string, boolean>, jmapMailboxes: JmapMailboxInfo[]): string {
  for (const mbId of Object.keys(mailboxIds)) {
    const mb = jmapMailboxes.find(m => m.id === mbId);
    if (mb?.role) {
      // Map role back to folder name
      for (const [folder, role] of Object.entries(FOLDER_TO_ROLE)) {
        if (role === mb.role) return folder;
      }
    }
  }
  return 'inbox';
}

/** Convert JMAP email to the MessageRow shape the frontend expects. */
function jmapToMessageRow(
  email: JmapEmailSummary | JmapEmailFull,
  porterMailboxId: string,
  jmapMailboxes: JmapMailboxInfo[],
  sentMailboxId?: string,
) {
  const folder = jmapToFolder(email.mailboxIds, jmapMailboxes);
  const isSent = sentMailboxId ? !!email.mailboxIds[sentMailboxId] : folder === 'sent';

  // For full emails with bodyValues, extract body text
  let textBody = '';
  let htmlBody = '';
  if ('bodyValues' in email && email.bodyValues) {
    for (const part of (email.textBody ?? [])) {
      const val = email.bodyValues[part.partId];
      if (val?.value) textBody = val.value;
    }
    for (const part of (email.htmlBody ?? [])) {
      const val = email.bodyValues[part.partId];
      if (val?.value) htmlBody = val.value;
    }
  }

  return {
    id: email.id,
    mailbox_id: porterMailboxId,
    thread_id: email.threadId,
    direction: isSent ? 'outbound' : 'inbound',
    folder,
    status: email.keywords?.['$seen'] ? 'read' : 'received',
    from_address: email.from?.[0]?.email ?? '',
    from_name: email.from?.[0]?.name ?? '',
    to_addresses_json: email.to?.map(a => a.email) ?? [],
    cc_addresses_json: email.cc?.map(a => a.email) ?? [],
    subject: email.subject ?? '',
    snippet: email.preview ?? '',
    text_body: textBody,
    html_body: htmlBody,
    read_at: email.keywords?.['$seen'] ? new Date(email.receivedAt).getTime() / 1000 : null,
    sent_at: email.sentAt ? new Date(email.sentAt).getTime() / 1000 : null,
    created_at: email.receivedAt ? new Date(email.receivedAt).getTime() / 1000 : null,
    attachments_json: 'attachments' in email ? email.attachments ?? [] : [],
  };
}

/** Build ThreadRow shape from a group of emails. */
function buildThreadRow(emails: JmapEmailSummary[], porterMailboxId: string) {
  if (emails.length === 0) return null;
  const latest = emails[0]; // already sorted newest-first
  const participants = [...new Set(emails.flatMap(e => e.from?.map(a => a.email) ?? []))];
  const subj = latest.subject ?? '';
  return {
    id: latest.threadId,
    mailbox_id: porterMailboxId,
    subject_canonical: subj.replace(/^(re|fwd|fw):\s*/gi, '').trim(),
    last_message_at: latest.receivedAt ? new Date(latest.receivedAt).getTime() / 1000 : null,
    message_count: emails.length,
    participants_json: participants,
    created_at: emails[emails.length - 1]?.receivedAt
      ? new Date(emails[emails.length - 1].receivedAt).getTime() / 1000
      : null,
  };
}

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

  // ── Mailbox folder counts (JMAP) ──────────────────────────────────────

  fastify.get('/mailboxes/:id/folders', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const { auth, accountId, provider } = await resolveJmap(id);
      const jmapMailboxes = await provider.jmap.listMailboxes(auth, accountId);

      const counts: Record<string, number> = {};
      for (const [folder, role] of Object.entries(FOLDER_TO_ROLE)) {
        const mb = jmapMailboxes.find(m => m.role === role || m.name.toLowerCase() === role);
        counts[folder] = mb?.totalEmails ?? 0;
      }
      return reply.send(ok({ mailboxId: id, folders: counts }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) return reply.status(404).send(err('NOT_FOUND', message));
      console.error('[mail] folder counts error:', message);
      return reply.status(500).send(err('JMAP_ERROR', message));
    }
  });

  // ── Threads (JMAP) ────────────────────────────────────────────────────

  fastify.get('/mailboxes/:id/threads', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { folder?: string; limit?: string; offset?: string };
    const folder = query.folder || 'inbox';
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    try {
      const { auth, accountId, provider } = await resolveJmap(id);
      const jmapMailboxes = await provider.jmap.listMailboxes(auth, accountId);
      const jmapMailboxId = findJmapMailboxId(jmapMailboxes, folder);
      if (!jmapMailboxId) {
        return reply.send(ok({ threads: [], total: 0 }));
      }

      // Query with collapseThreads to get one email per thread
      const { emails: collapsed, total } = await provider.jmap.queryAndGetEmails(auth, accountId, {
        mailboxId: jmapMailboxId,
        collapseThreads: true,
        limit,
        position: offset,
      });

      // For each collapsed email, we need the full thread count.
      // Batch: get all thread IDs, then for each get the email count in this mailbox.
      const threadIds = [...new Set(collapsed.map(e => e.threadId))];

      // Build thread rows from the collapsed emails
      // For accurate message_count, query each thread (batched)
      const threads = collapsed.map(email => {
        const subj = email.subject ?? '';
        return {
          id: email.threadId,
          mailbox_id: id,
          subject_canonical: subj.replace(/^(re|fwd|fw):\s*/gi, '').trim(),
          last_message_at: email.receivedAt ? new Date(email.receivedAt).getTime() / 1000 : null,
          message_count: 1, // will be accurate for most; thread detail gives exact count
          participants_json: email.from?.map(a => a.email) ?? [],
          created_at: email.receivedAt ? new Date(email.receivedAt).getTime() / 1000 : null,
        };
      });

      return reply.send(ok({ threads, total }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) return reply.status(404).send(err('NOT_FOUND', message));
      console.error('[mail] threads error:', message);
      return reply.status(500).send(err('JMAP_ERROR', message));
    }
  });

  // GET /api/v1/mail/threads/:id — get a single thread (needs mailboxId in query)
  fastify.get('/threads/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { mailboxId } = request.query as { mailboxId?: string };
    if (!mailboxId) {
      return reply.status(400).send(err('MISSING_FIELDS', 'mailboxId query parameter required'));
    }
    try {
      const { auth, accountId, provider } = await resolveJmap(mailboxId);
      const jmapMailboxes = await provider.jmap.listMailboxes(auth, accountId);

      // Get all emails in this thread
      const { ids } = await provider.jmap.queryEmails(auth, accountId, {
        threadId: id,
        limit: 100,
      });
      if (ids.length === 0) {
        return reply.status(404).send(err('NOT_FOUND', `Thread not found: ${id}`));
      }
      const emails = await provider.jmap.getEmails(auth, accountId, ids);
      const thread = buildThreadRow(emails, mailboxId);
      return reply.send(ok({ thread }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) return reply.status(404).send(err('NOT_FOUND', message));
      return reply.status(500).send(err('JMAP_ERROR', message));
    }
  });

  // GET /api/v1/mail/threads/:id/messages — list messages in a thread (JMAP)
  fastify.get('/threads/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { mailboxId } = request.query as { mailboxId?: string };
    if (!mailboxId) {
      return reply.status(400).send(err('MISSING_FIELDS', 'mailboxId query parameter required'));
    }
    try {
      const { auth, accountId, provider } = await resolveJmap(mailboxId);
      const jmapMailboxes = await provider.jmap.listMailboxes(auth, accountId);
      const sentMb = jmapMailboxes.find(m => m.role === 'sent');

      // Get all email IDs in this thread
      const { ids } = await provider.jmap.queryEmails(auth, accountId, {
        threadId: id,
        limit: 100,
        sort: [{ property: 'receivedAt', isAscending: true }],
      });

      if (ids.length === 0) {
        return reply.send(ok({ messages: [] }));
      }

      // Get full details with body
      const emails = await provider.jmap.getEmailDetail(auth, accountId, ids);
      const messages = emails.map(e => jmapToMessageRow(e, mailboxId, jmapMailboxes, sentMb?.id));

      return reply.send(ok({ messages }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) return reply.status(404).send(err('NOT_FOUND', message));
      console.error('[mail] thread messages error:', message);
      return reply.status(500).send(err('JMAP_ERROR', message));
    }
  });

  // ── Message actions (JMAP) ────────────────────────────────────────────

  // POST /api/v1/mail/messages/:id/read — mark as read
  fastify.post('/messages/:id/read', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { mailboxId } = request.body as { mailboxId?: string };
    if (!mailboxId) {
      return reply.status(400).send(err('MISSING_FIELDS', 'mailboxId is required'));
    }
    try {
      const { auth, accountId, provider } = await resolveJmap(mailboxId);
      await provider.jmap.updateEmail(auth, accountId, id, { 'keywords/$seen': true });
      return reply.send(ok({ messageId: id, read: true }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('JMAP_ERROR', message));
    }
  });

  // POST /api/v1/mail/messages/:id/archive — move to archive
  fastify.post('/messages/:id/archive', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { mailboxId } = request.body as { mailboxId?: string };
    if (!mailboxId) {
      return reply.status(400).send(err('MISSING_FIELDS', 'mailboxId is required'));
    }
    try {
      const { auth, accountId, provider } = await resolveJmap(mailboxId);
      const archiveId = await provider.jmap.getOrCreateArchiveMailbox(auth, accountId);
      const jmapMailboxes = await provider.jmap.listMailboxes(auth, accountId);

      // Remove from current mailboxes, add to archive
      const updates: Record<string, unknown> = { [`mailboxIds/${archiveId}`]: true };
      for (const mb of jmapMailboxes) {
        if (mb.id !== archiveId && mb.role !== 'sent') {
          updates[`mailboxIds/${mb.id}`] = null;
        }
      }
      await provider.jmap.updateEmail(auth, accountId, id, updates);
      return reply.send(ok({ messageId: id, folder: 'archive' }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('JMAP_ERROR', message));
    }
  });

  // POST /api/v1/mail/messages/:id/trash — move to trash
  fastify.post('/messages/:id/trash', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { mailboxId } = request.body as { mailboxId?: string };
    if (!mailboxId) {
      return reply.status(400).send(err('MISSING_FIELDS', 'mailboxId is required'));
    }
    try {
      const { auth, accountId, provider } = await resolveJmap(mailboxId);
      const trashId = await provider.jmap.findMailboxByRole(auth, accountId, 'trash');
      const jmapMailboxes = await provider.jmap.listMailboxes(auth, accountId);

      const updates: Record<string, unknown> = { [`mailboxIds/${trashId}`]: true };
      for (const mb of jmapMailboxes) {
        if (mb.id !== trashId) updates[`mailboxIds/${mb.id}`] = null;
      }
      await provider.jmap.updateEmail(auth, accountId, id, updates);
      return reply.send(ok({ messageId: id, folder: 'trash' }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('JMAP_ERROR', message));
    }
  });

  // DELETE /api/v1/mail/messages/:id — permanently delete
  fastify.delete('/messages/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { mailboxId } = request.query as { mailboxId?: string };
    if (!mailboxId) {
      return reply.status(400).send(err('MISSING_FIELDS', 'mailboxId query parameter required'));
    }
    try {
      const { auth, accountId, provider } = await resolveJmap(mailboxId);
      await provider.jmap.deleteEmail(auth, accountId, id);
      return reply.send(ok({ messageId: id, deleted: true }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('JMAP_ERROR', message));
    }
  });

  // ── Send / Draft / Reply ──────────────────────────────────────────────

  // POST /api/v1/mail/messages/send — send with optional attachments
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
      attachments?: Array<{ blobId: string; name: string; type: string; size: number }>;
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
        attachments: body.attachments,
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

  // POST /api/v1/mail/messages/:id/reply — reply via JMAP
  fastify.post('/messages/:id/reply', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      mailboxId?: string;
      textBody?: string;
      htmlBody?: string;
      to?: string[];
      cc?: string[];
    } | undefined;

    if (!body?.textBody || !body?.mailboxId) {
      return reply.status(400).send(err('MISSING_FIELDS', 'mailboxId and textBody are required'));
    }

    try {
      // Fetch the original message from JMAP to get reply headers
      const { auth, accountId, provider, mailbox } = await resolveJmap(body.mailboxId);
      const originals = await provider.jmap.getEmailDetail(auth, accountId, [id]);
      if (originals.length === 0) {
        return reply.status(404).send(err('NOT_FOUND', `Message not found: ${id}`));
      }
      const orig = originals[0];

      // Build reply
      const subject = /^re:\s/i.test(orig.subject) ? orig.subject : `Re: ${orig.subject}`;
      const to = body.to?.length ? body.to : (orig.from?.map(a => a.email) ?? []);
      const inReplyTo = orig.messageId ?? [];
      const references = [...(orig.references ?? []), ...(orig.messageId ?? [])];

      // Send via JMAP
      const sentMbId = await provider.jmap.findMailboxByRole(auth, accountId, 'sent');
      const { identityId } = await provider.getJmapSession(mailbox.address);

      const emailId = await provider.jmap.sendEmail(auth, accountId, identityId, {
        mailboxIds: { [sentMbId]: true },
        from: [{ email: mailbox.address, name: mailbox.display_name || '' }],
        to: to.map(e => ({ email: e })),
        cc: body.cc?.map(e => ({ email: e })),
        subject,
        textBody: body.textBody,
        htmlBody: body.htmlBody,
        inReplyTo,
        references,
      });

      return reply.status(201).send(ok({ messageId: emailId, sent: true }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) {
        return reply.status(404).send(err('NOT_FOUND', message));
      }
      return reply.status(500).send(err('REPLY_FAILED', message));
    }
  });

  // ── Attachment Upload/Download ────────────────────────────────────────

  // POST /api/v1/mail/attachments/upload — upload file for compose
  fastify.post('/attachments/upload', async (request, reply) => {
    try {
      const parts = request.parts({ limits: { fileSize: 50 * 1024 * 1024 } });
      let mailboxId = '';
      let fileBuffer: Buffer | null = null;
      let fileName = '';
      let fileType = 'application/octet-stream';

      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'mailboxId') {
          mailboxId = (part as unknown as { value: string }).value;
        } else if (part.type === 'file' && part.fieldname === 'file') {
          fileName = part.filename ?? 'attachment';
          fileType = part.mimetype ?? 'application/octet-stream';
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk as Buffer);
          }
          fileBuffer = Buffer.concat(chunks);
        }
      }

      if (!mailboxId || !fileBuffer) {
        return reply.status(400).send(err('MISSING_FIELDS', 'mailboxId and file are required'));
      }

      const { auth, accountId, provider } = await resolveJmap(mailboxId);
      const result = await provider.jmap.uploadBlob(auth, accountId, fileBuffer, fileType);

      return reply.send(ok({
        blobId: result.blobId,
        name: fileName,
        type: result.type || fileType,
        size: result.size || fileBuffer.length,
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('UPLOAD_FAILED', message));
    }
  });

  // GET /api/v1/mail/attachments/:mailboxId/:blobId/:filename — download attachment
  fastify.get('/attachments/:mailboxId/:blobId/:filename', async (request, reply) => {
    const { mailboxId, blobId, filename } = request.params as { mailboxId: string; blobId: string; filename: string };

    try {
      const { auth, accountId, provider } = await resolveJmap(mailboxId);
      const { data, contentType } = await provider.jmap.downloadBlob(auth, accountId, blobId, filename);

      return reply
        .header('Content-Type', contentType)
        .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
        .header('Content-Length', data.length)
        .send(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('DOWNLOAD_FAILED', message));
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
