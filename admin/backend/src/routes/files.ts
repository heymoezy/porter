import { FastifyInstance } from 'fastify';
import { config } from '../config.js';

/**
 * Proxy /api/v1/files requests to Porter Brain Fastify backend.
 * The Brain owns the file system API — admin just passes through.
 *
 * Upload (multipart) requests forward the raw body buffer.
 * JSON POST requests (delete, rename, mkdir) forward JSON-stringified body.
 * GET requests (list, content) forward query params.
 */
export default async function filesProxyRoutes(fastify: FastifyInstance) {
  const brainBase = config.fastifyUrl; // http://127.0.0.1:3001

  // Register raw body parser for multipart within this plugin scope
  // so Fastify doesn't reject or try to JSON-parse uploads
  fastify.addContentTypeParser('multipart/form-data', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  async function proxyToBrain(request: any, reply: any, subPath: string) {
    const url = new URL(`/api/v1/files${subPath ? '/' + subPath : ''}`, brainBase);

    // Forward query string
    const qs = request.url.split('?')[1];
    if (qs) url.search = `?${qs}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const headers: Record<string, string> = {};
      if (request.headers['content-type']) {
        headers['content-type'] = request.headers['content-type'];
      }
      if (request.headers['cookie']) {
        headers['cookie'] = request.headers['cookie'];
      }

      let body: any = undefined;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const ct = (request.headers['content-type'] || '') as string;
        if (ct.includes('multipart/form-data')) {
          // Body is already a raw Buffer from our content type parser
          body = request.body;
        } else {
          // JSON body (delete, rename, mkdir)
          body = JSON.stringify(request.body);
        }
      }

      const res = await fetch(url.toString(), {
        method: request.method as string,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const contentType = res.headers.get('content-type') || 'application/json';
      reply.code(res.status).header('content-type', contentType);

      const resBody = await res.arrayBuffer();
      return reply.send(Buffer.from(resBody));
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
