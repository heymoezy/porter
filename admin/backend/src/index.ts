import crypto from 'crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { config } from './config.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import filesProxyRoutes from './routes/files.js';
import adminRoutes from './routes/index.js';
import { execute } from './db/pg.js';
import { probeAllGateways } from './services/gateway-versions.js';
import { addSSEClient } from './services/admin-sse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/build/client');

const fastify = Fastify({
  logger: { level: config.logLevel },
});

// Infrastructure plugins
fastify.register(cors, {
  origin: true,
  credentials: true,
});
fastify.register(cookie);

// Auth plugin (session resolution + platform_admin gate)
fastify.register(authPlugin);

// Auth routes (login/logout/me — same DB, same session cookie)
fastify.register(authRoutes, { prefix: '/api/v1/auth' });

// File API proxy — forwards to Porter Brain Fastify backend
fastify.register(filesProxyRoutes, { prefix: '/api/v1/files' });

// Admin API routes
fastify.register(adminRoutes, { prefix: '/api/admin' });

// Admin SSE endpoint — real-time updates for Admin-side changes
fastify.get('/api/admin/events', async (request, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
  addSSEClient(reply);
  // Keep connection alive — Fastify will clean up on close
  request.raw.on('close', () => {});
});

// Catch server errors and log to error_log table
fastify.setErrorHandler(async (error: any, request, reply) => {
  try {
    await execute(
      `INSERT INTO error_log (source, severity, message, stack, url, username, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'server_api',
        'error',
        error.message,
        error.stack ?? null,
        request.url,
        request.sessionUser?.username ?? null,
        request.ip,
        JSON.stringify({ method: request.method, statusCode: error.statusCode ?? 500 }),
      ]
    );
  } catch { /* don't fail on logging failure */ }
  reply.code(error.statusCode ?? 500).send({
    error: { code: 'INTERNAL_ERROR', message: error.message },
    meta: { request_id: crypto.randomUUID(), timestamp: Date.now() },
  });
});

// Serve admin frontend static files (production build)
if (fs.existsSync(frontendDist)) {
  fastify.register(staticFiles, {
    root: frontendDist,
    prefix: '/',
    wildcard: false,
  });

  // SPA catch-all — serve index.html for client-side routing
  fastify.setNotFoundHandler(async (_request, reply) => {
    const indexPath = path.join(frontendDist, 'index.html');
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, 'utf8');
      return reply.type('text/html').send(html);
    }
    return reply.code(404).send({ error: 'Not found' });
  });
}

const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`Porter running at http://${config.host}:${config.port}`);

    // Probe all gateways at startup (versions + health, like porter.py)
    probeAllGateways().then(results => {
      const detected = results.filter(r => r.version);
      const outdated = results.filter(r => r.is_latest === false);
      console.log(`Gateway probe: ${detected.length}/${results.length} versions detected${outdated.length ? `, ${outdated.length} outdated` : ''}`);
    }).catch(err => {
      console.error('Gateway probe failed:', err instanceof Error ? err.message : err);
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
