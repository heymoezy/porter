import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import websocket from '@fastify/websocket';

export default async function eventRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  const clients = new Set<any>();

  fastify.get('/api/events', { websocket: true }, (connection, req) => {
    clients.add(connection);
    fastify.log.info('WebSocket client connected');

    connection.socket.on('message', (message: Buffer | string) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'ping') {
          connection.socket.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (e) {}
    });

    connection.socket.on('close', () => {
      clients.delete(connection);
      fastify.log.info('WebSocket client disconnected');
    });
  });

  // Decoration to allow other routes to broadcast events
  fastify.decorate('broadcast', (event: any) => {
    const message = JSON.stringify(event);
    for (const client of clients) {
      if (client.socket.readyState === 1) { // OPEN
        client.socket.send(message);
      }
    }
  });
}
