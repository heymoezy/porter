import { FastifyInstance } from 'fastify';
import authV1Routes from './auth.js';
import projectV1Routes from './projects.js';
import healthV1Routes from './health.js';
import chatV1Routes from './chat.js';
import filesV1Routes from './files.js';
import webhookWhatsAppRoutes from './webhooks-whatsapp.js';
import memoryV1Routes from './memory.js';
import bridgeV1Routes from './bridge.js';
import feedbackV1Routes from './feedback.js';
import { dispatchOutcomeRoutes } from './dispatch-outcome.js';
import sessionsV1Routes from './sessions.js';
import decompositionV1Routes from './decomposition.js';
import approvalV1Routes from './approvals.js';
import mailV1Routes from './mail.js';
import mailAdminV1Routes from './mail-admin.js';
import intellectV1Routes from './intellect.js';
import recallV1Routes from './recall.js';

export default async function v1Routes(fastify: FastifyInstance) {
  fastify.register(authV1Routes, { prefix: '/auth' });
  fastify.register(projectV1Routes, { prefix: '/projects' });
  fastify.register(healthV1Routes, { prefix: '/health' });
  fastify.register(chatV1Routes, { prefix: '/chat' });
  fastify.register(filesV1Routes, { prefix: '/files' });
  fastify.register(webhookWhatsAppRoutes, { prefix: '/webhooks/whatsapp' });
  fastify.register(memoryV1Routes, { prefix: '/memory' });
  fastify.register(bridgeV1Routes, { prefix: '/bridge' });
  fastify.register(feedbackV1Routes, { prefix: '/feedback' });
  fastify.register(dispatchOutcomeRoutes);
  fastify.register(sessionsV1Routes, { prefix: '/sessions' });
  fastify.register(decompositionV1Routes, { prefix: '/decomposition' });
  fastify.register(approvalV1Routes, { prefix: '/approvals' });
  fastify.register(mailV1Routes, { prefix: '/mail' });
  fastify.register(mailAdminV1Routes, { prefix: '/mail-admin' });
  fastify.register(intellectV1Routes, { prefix: '/intellect' });
  fastify.register(recallV1Routes, { prefix: '/recall' });
}
