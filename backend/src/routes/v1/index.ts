import { FastifyInstance } from 'fastify';
import authV1Routes from './auth.js';
import projectV1Routes from './projects.js';
import healthV1Routes from './health.js';
import chatV1Routes from './chat.js';
import filesV1Routes from './files.js';
import webhookWhatsAppRoutes from './webhooks-whatsapp.js';
import memoryV1Routes from './memory.js';
import bridgeV1Routes from './bridge.js';
import { dispatchOutcomeRoutes } from './dispatch-outcome.js';
import sessionsV1Routes from './sessions.js';
import intellectV1Routes from './intellect.js';
import recallV1Routes from './recall.js';
import agentsV1Routes from './agents.js';

export default async function v1Routes(fastify: FastifyInstance) {
  fastify.register(authV1Routes, { prefix: '/auth' });
  fastify.register(projectV1Routes, { prefix: '/projects' });
  fastify.register(healthV1Routes, { prefix: '/health' });
  fastify.register(chatV1Routes, { prefix: '/chat' });
  fastify.register(filesV1Routes, { prefix: '/files' });
  fastify.register(webhookWhatsAppRoutes, { prefix: '/webhooks/whatsapp' });
  fastify.register(memoryV1Routes, { prefix: '/memory' });
  fastify.register(bridgeV1Routes, { prefix: '/bridge' });
  fastify.register(dispatchOutcomeRoutes);
  fastify.register(sessionsV1Routes, { prefix: '/sessions' });
  fastify.register(intellectV1Routes, { prefix: '/intellect' });
  fastify.register(recallV1Routes, { prefix: '/recall' });
  fastify.register(agentsV1Routes, { prefix: '/agents' });
}
