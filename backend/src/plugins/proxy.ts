import fp from 'fastify-plugin';
import httpProxy from '@fastify/http-proxy';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

async function proxyPlugin(fastify: FastifyInstance) {
  // Registered LAST so all other routes take priority.
  // Unknown routes fall through to porter.py.
  fastify.register(httpProxy, {
    upstream: config.porterPyUrl,
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  });
}

export default fp(proxyPlugin, {
  name: 'porter-proxy',
  dependencies: [],
});
