import { FastifyInstance } from 'fastify';
import { selectStreamBackend } from '../../../services/stream-service.js';

/**
 * Admin chat endpoint — native streaming via AI router.
 * Uses the same streaming infrastructure as the user-facing /api/v1/chat/stream.
 */
export default async function chatRoutes(fastify: FastifyInstance) {

  // POST /api/admin/porter/chat — SSE streaming chat
  fastify.post('/chat', async (request, reply) => {
    const body = request.body as {
      message?: string;
      chat_id?: string;
      system_context?: string;
      backend?: 'ollama' | 'openclaw' | 'auto';
      [key: string]: unknown;
    } | null;

    const message = body?.message?.trim();
    if (!message) {
      return reply.code(400).send({ error: 'message is required' });
    }

    // Prepend system context if provided
    const systemCtx = body?.system_context;
    const fullMessage = systemCtx
      ? `[System context: ${systemCtx}]\n\n${message}`
      : message;

    const ac = new AbortController();
    request.raw.on('close', () => ac.abort());

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const backend = selectStreamBackend(fullMessage, body?.backend ?? 'auto');
    let fullResponse = '';

    try {
      for await (const token of backend.stream(fullMessage, ac.signal)) {
        if (ac.signal.aborted) break;
        fullResponse += token;
        reply.raw.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    } catch (e: unknown) {
      if (!ac.signal.aborted) {
        const msg = e instanceof Error ? e.message : 'Unknown streaming error';
        reply.raw.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      }
    } finally {
      const modelLabel = backend.name === 'ollama' ? 'ollama' : 'openclaw';
      reply.raw.write(`data: ${JSON.stringify({ done: true, backend: modelLabel, full_response: fullResponse })}\n\n`);
      reply.raw.end();
    }
  });
}
