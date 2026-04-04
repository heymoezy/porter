/**
 * Mail admin routes — platform admin mail management.
 */

import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/envelope.js';
import { config } from '../../config.js';

export default async function mailAdminRoutes(fastify: FastifyInstance) {
  // GET /api/v1/mail-admin/config — mail subsystem config summary
  fastify.get('/config', async (_request, reply) => {
    return reply.send(ok({
      provider: config.mail.provider,
      defaultDomain: config.mail.defaultDomain,
    }));
  });

  // GET /api/v1/mail-admin/domains — list managed domains
  fastify.get('/domains', async (_request, reply) => {
    return reply.send(ok({ domains: [] }));
  });

  // GET /api/v1/mail-admin/mailboxes — list all mailboxes (admin view)
  fastify.get('/mailboxes', async (_request, reply) => {
    return reply.send(ok({ mailboxes: [] }));
  });
}
