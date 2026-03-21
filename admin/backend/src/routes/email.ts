import { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';

export default async function emailRoutes(fastify: FastifyInstance) {
  // All routes require platform_admin
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // Placeholder — Phase 2 will implement full email engine
  fastify.get('/config', async () => {
    return ok({ configured: false, message: 'Email engine not yet configured' });
  });

  fastify.get('/queue', async () => {
    return ok({ pending: 0, sent: 0, failed: 0, recent: [] });
  });
}
