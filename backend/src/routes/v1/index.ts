import { FastifyInstance } from 'fastify';
import authV1Routes from './auth.js';
import projectV1Routes from './projects.js';
import agentV1Routes from './agents.js';
import jobV1Routes from './jobs.js';

export default async function v1Routes(fastify: FastifyInstance) {
  fastify.register(authV1Routes, { prefix: '/auth' });
  fastify.register(projectV1Routes, { prefix: '/projects' });
  fastify.register(agentV1Routes, { prefix: '/agents' });
  fastify.register(jobV1Routes, { prefix: '/jobs' });
}
