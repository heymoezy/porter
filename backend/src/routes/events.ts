import { FastifyInstance } from 'fastify';
import { addClient, broadcast, clientCount } from '../services/sse-hub.js';

export default async function eventRoutes(fastify: FastifyInstance) {
  // SSE endpoint — clients connect here to receive real-time events
  fastify.get('/api/events', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send initial heartbeat so client knows connection is alive
    reply.raw.write(': connected\n\n');

    addClient(reply.raw);

    // Keep connection open — Fastify won't auto-close raw responses
    // The sse-hub removeClient handles cleanup on 'close'
    request.raw.on('close', () => {
      reply.raw.end();
    });
  });

  // Emit endpoint — internal services POST here to broadcast events
  fastify.post('/api/events/emit', async (request, reply) => {
    const body = request.body as { event: string; data: Record<string, unknown> };
    if (!body?.event) {
      return reply.code(400).send({ error: 'Missing event field' });
    }
    broadcast(body.event, body.data ?? {});
    return { ok: true, clients: clientCount() };
  });
}
