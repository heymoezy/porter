import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import staticFiles from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
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
import { migrate04AgentAutonomy } from './db/migrate-04.js';
import * as scheduler from './services/scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');

const fastify = Fastify({
  logger: {
    level: config.logLevel,
  },
});

// Infrastructure plugins
fastify.register(cors, {
  origin: true,
  credentials: true,
});
fastify.register(cookie);
fastify.register(websocket);

// Auth plugin (session resolution)
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

// Serve React SPA static files at /v2/
// wildcard: false prevents @fastify/static from registering its own /v2/* catch-all
// (we handle that ourselves below)
fastify.register(staticFiles, {
  root: frontendDist,
  prefix: '/v2/',
  wildcard: false, // disable auto-wildcard so we control the SPA fallback
});

// SPA catch-all for /v2/* routes (React Router handles client-side routing)
// Reads index.html directly — sendFile is scoped to plugin and not available here
fastify.get('/v2/*', async (_request, reply) => {
  const indexPath = path.join(frontendDist, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  return reply.type('text/html').send(html);
});

// LAST: Proxy unknown routes to porter.py
fastify.register(proxyPlugin);

const start = async () => {
  try {
    migrate04AgentAutonomy();
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`Fastify server running at http://${config.host}:${config.port}`);
    scheduler.start();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

process.on('SIGINT', () => { scheduler.stop(); process.exit(0); });
process.on('SIGTERM', () => { scheduler.stop(); process.exit(0); });

start();
