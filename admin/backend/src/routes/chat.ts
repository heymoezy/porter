import { FastifyInstance } from 'fastify';
import { config } from '../config.js';

/**
 * Chat proxy — forwards to Porter Brain's Fastify /api/v1/chat/stream SSE endpoint.
 */
export default async function chatRoutes(fastify: FastifyInstance) {
  const brainBase = config.fastifyUrl; // http://127.0.0.1:3001

  // POST /api/admin/porter/chat — SSE streaming proxy to Brain
  fastify.post('/chat', async (request, reply) => {
    const body = request.body as {
      message?: string;
      chat_id?: string;
      system_context?: string;
      backend?: string;
      [key: string]: unknown;
    } | null;

    const message = body?.message?.trim();
    if (!message) {
      return reply.code(400).send({ error: 'message is required' });
    }

    // Prepend system context
    const systemCtx = body?.system_context;
    const fullMessage = systemCtx
      ? `[System context: ${systemCtx}]\n\n${message}`
      : message;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      // Detect client disconnect
      request.raw.on('close', () => controller.abort());

      // POST to Brain's native chat stream endpoint
      const res = await fetch(`${brainBase}/api/v1/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': request.headers.cookie || '',
        },
        body: JSON.stringify({
          message: fullMessage,
          backend: body?.backend || 'auto',
          chat_id: body?.chat_id,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok || !res.body) {
        return reply.code(res.status).send({
          error: `Brain returned ${res.status}`,
        });
      }

      // Stream SSE response back to client
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const reader = res.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (controller.signal.aborted) break;
          reply.raw.write(value);
        }
      } catch {
        // Client disconnected or stream error
      } finally {
        reply.raw.end();
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        if (!reply.raw.headersSent) {
          return reply.code(504).send({ error: 'Brain timeout or client disconnected' });
        }
        reply.raw.end();
        return;
      }
      if (!reply.raw.headersSent) {
        return reply.code(502).send({ error: 'Cannot reach Porter Brain' });
      }
      reply.raw.end();
    }
  });
}
