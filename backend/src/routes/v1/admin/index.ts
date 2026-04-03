import { FastifyInstance } from 'fastify';
import healthRoutes from './health.js';
import usersRoutes from './users.js';
import emailRoutes from './email.js';
import billingRoutes from './billing.js';
import agentsRoutes from './agents.js';
import diagnosticsRoutes from './diagnostics.js';
import templatesRoutes from './templates.js';
import modelsRoutes from './models.js';
import forgeRoutes from './forge.js';
import toolsRoutes from './tools.js';
import skillsRoutes from './skills.js';
import systemRoutes from './system.js';
import activityRoutes from './activity.js';
import settingsRoutes from './settings.js';
import chatRoutes from './chat.js';
import adminBridgeRoutes from './bridge.js';
import jobsRoutes from './jobs.js';
import watchersRoutes from './watchers.js';

export default async function adminV1Routes(fastify: FastifyInstance) {
  // Diagnostics /report is PUBLIC (clients send error reports without auth)
  // Register it BEFORE the auth hook so it's not gated
  fastify.register(diagnosticsRoutes, { prefix: '/diagnostics' });

  // All other admin routes require platform_admin role
  fastify.addHook('preHandler', async (request: any, reply) => {
    // Skip auth for diagnostics/report (public endpoint)
    if (request.url.includes('/diagnostics/report')) return;
    if (!request.sessionUser) {
      return reply.code(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    if (request.sessionUser.role !== 'platform_admin') {
      return reply.code(403).send({ ok: false, error: { code: 'FORBIDDEN', message: 'Platform admin required' } });
    }
  });

  fastify.register(healthRoutes, { prefix: '/health' });
  fastify.register(usersRoutes, { prefix: '/users' });
  fastify.register(emailRoutes, { prefix: '/email' });
  fastify.register(billingRoutes, { prefix: '/billing' });
  fastify.register(agentsRoutes, { prefix: '/agents' });
  fastify.register(templatesRoutes, { prefix: '/templates' });
  fastify.register(modelsRoutes, { prefix: '/models' });
  fastify.register(forgeRoutes, { prefix: '/forge' });
  fastify.register(toolsRoutes, { prefix: '/tools' });
  fastify.register(skillsRoutes, { prefix: '/skills' });
  fastify.register(systemRoutes, { prefix: '/system' });
  fastify.register(activityRoutes, { prefix: '/activity' });
  fastify.register(settingsRoutes, { prefix: '/settings' });
  fastify.register(chatRoutes, { prefix: '/porter' });
  fastify.register(adminBridgeRoutes, { prefix: '/bridge' });
  fastify.register(jobsRoutes, { prefix: '/jobs' });
  fastify.register(watchersRoutes, { prefix: '/watchers' });
}
