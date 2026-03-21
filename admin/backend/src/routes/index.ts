import { FastifyInstance } from 'fastify';
import healthRoutes from './health.js';
import usersRoutes from './users.js';
import emailRoutes from './email.js';
import billingRoutes from './billing.js';
import agentsRoutes from './agents.js';
import diagnosticsRoutes from './diagnostics.js';
import templatesRoutes from './templates.js';
import modelsRoutes from './models.js';
import porterProfileRoutes from './porter-profile.js';
import toolsRoutes from './tools.js';
import skillsRoutes from './skills.js';
import systemRoutes from './system.js';
import activityRoutes from './activity.js';

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.register(healthRoutes, { prefix: '/health' });
  fastify.register(usersRoutes, { prefix: '/users' });
  fastify.register(emailRoutes, { prefix: '/email' });
  fastify.register(billingRoutes, { prefix: '/billing' });
  fastify.register(agentsRoutes, { prefix: '/agents' });
  fastify.register(diagnosticsRoutes, { prefix: '/diagnostics' });
  fastify.register(templatesRoutes, { prefix: '/templates' });
  fastify.register(modelsRoutes, { prefix: '/models' });
  fastify.register(porterProfileRoutes, { prefix: '/porter' });
  fastify.register(toolsRoutes, { prefix: '/tools' });
  fastify.register(skillsRoutes, { prefix: '/skills' });
  fastify.register(systemRoutes, { prefix: '/system' });
  fastify.register(activityRoutes, { prefix: '/activity' });
}
