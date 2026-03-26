/**
 * Native SSE Hub — in-process event broadcaster.
 * In-process SSE broadcaster for real-time event delivery.
 */

import type { ServerResponse } from 'http';

const clients = new Set<ServerResponse>();

/** Add an SSE client connection. Sets up cleanup on close. */
export function addClient(res: ServerResponse): void {
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

/** Remove an SSE client connection. */
export function removeClient(res: ServerResponse): void {
  clients.delete(res);
}

/** Broadcast an event to all connected SSE clients. */
export function broadcast(event: string, data: Record<string, unknown>): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      // Client disconnected — remove on next tick
      clients.delete(client);
    }
  }
}

/** Get the number of connected clients. */
export function clientCount(): number {
  return clients.size;
}
