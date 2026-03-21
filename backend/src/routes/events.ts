import { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export default async function eventRoutes(fastify: FastifyInstance) {
  // SSE proxy -- forwards porter.py's /api/events stream to v1 consumers
  // This keeps porter.py as the single source of truth for SSE events
  fastify.get('/api/events', async (request, reply) => {
    const upstream = await fetch(`${config.porterPyUrl}/api/events`, {
      headers: { cookie: request.headers.cookie || '' },
    });

    if (!upstream.ok || !upstream.body) {
      return reply.code(502).send({ error: 'SSE upstream unavailable' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const reader = upstream.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(value);
        }
      } catch {
        // upstream closed or client disconnected
      } finally {
        reply.raw.end();
      }
    };

    request.raw.on('close', () => { reader.cancel().catch(() => {}); });
    pump();
  });

  // Emit endpoint -- Fastify services POST here to push events through porter.py SSE hub
  // This is what scheduler.ts emitSSE() calls
  fastify.post('/api/events/emit', async (request, reply) => {
    const body = request.body as { event: string; data: Record<string, unknown> };
    if (!body?.event) {
      return reply.code(400).send({ error: 'Missing event field' });
    }
    try {
      const resp = await fetch(`${config.porterPyUrl}/api/events/emit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: request.headers.cookie || '',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      });
      if (!resp.ok) {
        return reply.code(resp.status).send({ error: 'Upstream emit failed' });
      }
      return { ok: true };
    } catch {
      return reply.code(502).send({ error: 'SSE emit upstream unavailable' });
    }
  });
}
