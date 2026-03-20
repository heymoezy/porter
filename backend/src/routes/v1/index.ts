import { FastifyInstance } from 'fastify';
import authV1Routes from './auth.js';

export default async function v1Routes(fastify: FastifyInstance) {
  fastify.register(authV1Routes, { prefix: '/auth' });
  // Future: agentRoutes, projectRoutes added here
}
