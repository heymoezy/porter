import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import taskRoutes from './routes/tasks.js';
import chatRoutes from './routes/chat.js';
import fileRoutes from './routes/files.js';
import adminRoutes from './routes/admin.js';
import aiRoutes from './routes/ai.js';
import eventRoutes from './routes/events.js';
import authPlugin from './plugins/auth.js';
import v1Routes from './routes/v1/index.js';
import proxyPlugin from './plugins/proxy.js';

const fastify = Fastify({
  logger: {
    level: config.logLevel,
  },
});

// Plugins
fastify.register(cors, {
  origin: true,
  credentials: true,
});
fastify.register(cookie);
fastify.register(websocket);
fastify.register(authPlugin);

// V1 routes (Fastify-native, with response envelope)
fastify.register(v1Routes, { prefix: '/api/v1' });

// Legacy routes (proxied to porter.py as fallback)
fastify.register(authRoutes);
fastify.register(taskRoutes);
fastify.register(chatRoutes);
fastify.register(fileRoutes);
fastify.register(adminRoutes);
fastify.register(aiRoutes);
fastify.register(eventRoutes);

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', engine: 'fastify', version: '1.0.0' };
});

// LAST: Proxy unknown routes to porter.py
fastify.register(proxyPlugin);

const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`Fastify server running at http://${config.host}:${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
