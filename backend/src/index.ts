import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import authRoutes from './routes/auth';
import taskRoutes from './routes/tasks';
import chatRoutes from './routes/chat';
import fileRoutes from './routes/files';
import adminRoutes from './routes/admin';
import aiRoutes from './routes/ai';
import eventRoutes from './routes/events';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({
  logger: true
});

// Plugins
fastify.register(cors, {
  origin: true,
  credentials: true
});
fastify.register(cookie);
fastify.register(websocket);

// Routes
fastify.register(authRoutes);
fastify.register(taskRoutes);
fastify.register(chatRoutes);
fastify.register(fileRoutes);
fastify.register(adminRoutes);
fastify.register(aiRoutes);
fastify.register(eventRoutes);

fastify.get('/health', async () => {
  return { status: 'ok', engine: 'fastify', version: '0.25.4' };
});

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log(`Fastify server running at http://localhost:3001`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
