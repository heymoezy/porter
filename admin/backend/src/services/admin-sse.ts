/**
 * Admin SSE Hub — lightweight event emitter for Admin-side changes
 *
 * Brain has its own SSE at /api/events. This is Admin's own channel
 * for changes that happen through Admin API (gateway config, restarts, etc).
 * Frontend subscribes to both.
 */

import type { FastifyReply } from 'fastify';

const clients = new Set<FastifyReply>();

export function addSSEClient(reply: FastifyReply) {
  clients.add(reply);
  reply.raw.on('close', () => clients.delete(reply));
}

export function emitAdminEvent(event: string, data: Record<string, unknown> = {}) {
  const payload = JSON.stringify({ type: event, data, ts: Date.now() });
  for (const client of clients) {
    try {
      client.raw.write(`data: ${payload}\n\n`);
    } catch {
      clients.delete(client);
    }
  }
}

export function clientCount() {
  return clients.size;
}
