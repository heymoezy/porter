import { FastifyInstance } from 'fastify';
import { config } from '../config.js';

/**
 * Proxy /api/v1/files requests to Porter Brain Fastify backend.
 * The Brain owns the file system API — admin just passes through.
 */
export default async function filesProxyRoutes(fastify: FastifyInstance) {
  const brainBase = config.fastifyUrl; // http://127.0.0.1:3001

  async function proxyToBrain(request: any, reply: any, subPath: string) {
    const url = new URL(`/api/v1/files${subPath ? '/' + subPath : ''}`, brainBase);

    // Forward query string
    const qs = request.url.split('?')[1];
    if (qs) url.search = `?${qs}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const headers: Record<string, string> = {
        'accept': 'application/json',
      };
      if (request.headers['content-type']) {
        headers['content-type'] = request.headers['content-type'];
      }
      if (request.headers['cookie']) {
        headers['cookie'] = request.headers['cookie'];
      }

      const res = await fetch(url.toString(), {
        method: request.method as string,
        headers,
        body: request.method !== 'GET' && request.method !== 'HEAD'
          ? JSON.stringify(request.body)
          : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const contentType = res.headers.get('content-type') || 'application/json';
      reply.code(res.status).header('content-type', contentType);

      const body = await res.arrayBuffer();
      return reply.send(Buffer.from(body));
    } catch (e: any) {
      if (e.name === 'AbortError') {
        return reply.code(504).send({
          error: { code: 'BRAIN_TIMEOUT', message: 'Porter Brain did not respond in time' },
        });
      }
      return reply.code(502).send({
        error: { code: 'BRAIN_UNREACHABLE', message: 'Cannot reach Porter Brain file API' },
      });
    }
  }

  // GET /api/v1/files — list roots or directory
  fastify.get('/', async (request, reply) => proxyToBrain(request, reply, ''));

  // GET/POST /api/v1/files/* — all sub-routes (content, upload, mkdir, etc.)
  fastify.all('/*', async (request, reply) => {
    const subPath = (request.params as Record<string, string>)['*'] || '';
    return proxyToBrain(request, reply, subPath);
  });
}
