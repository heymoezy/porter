/**
 * Mail routes — user-facing mail endpoints.
 */

import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/envelope.js';

export default async function mailRoutes(fastify: FastifyInstance) {
  // GET /api/v1/mail — list identities for current user
  fastify.get('/', async (_request, reply) => {
    return reply.send(ok({ identities: [] }));
  });

  // GET /api/v1/mail/mailboxes — list mailboxes visible to current user
  fastify.get('/mailboxes', async (_request, reply) => {
    return reply.send(ok({ mailboxes: [] }));
  });
}
