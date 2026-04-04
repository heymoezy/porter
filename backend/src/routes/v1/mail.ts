/**
 * Mail routes — user-facing mail endpoints.
 */

import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/envelope.js';
import * as mailboxService from '../../services/mail/mailbox-service.js';
import * as threadService from '../../services/mail/thread-service.js';
import * as messageService from '../../services/mail/message-service.js';

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
}
