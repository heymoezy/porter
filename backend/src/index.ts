import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { config } from './config.js';
import eventRoutes from './routes/events.js';
import { startBrainUI } from './routes/brain-ui.js';
import authPlugin from './plugins/auth.js';
import openapiPlugin from './plugins/openapi.js';
import v1Routes from './routes/v1/index.js';
import proxyPlugin from './plugins/proxy.js';
import { migrateConsolidated } from './db/migrate-consolidated.js';
import * as scheduler from './services/scheduler.js';
import { startImapIdle, stopImapIdle } from './services/email.js';
import { pool } from './db/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');

const fastify = Fastify({
  logger: {
    level: config.logLevel,
  },
  genReqId: () => crypto.randomUUID(),
  requestIdHeader: 'x-request-id',
});

// Global hook: set X-Request-ID header and sync trace_id in JSON response bodies
fastify.addHook('onSend', async (request, reply, payload) => {
  reply.header('X-Request-ID', request.id);
  // Sync trace_id in JSON responses to match request.id
  if (typeof payload === 'string') {
    const ct = reply.getHeader('content-type');
    if (ct && typeof ct === 'string' && ct.includes('application/json')) {
      try {
        const body = JSON.parse(payload);
        if (body && typeof body === 'object') {
          if (body.meta && typeof body.meta.trace_id === 'string') {
            body.meta.trace_id = request.id;
          }
          if (body.error && typeof body.error.trace_id === 'string') {
            body.error.trace_id = request.id;
          }
          return JSON.stringify(body);
        }
      } catch {
        // Not valid JSON, pass through unchanged
      }
    }
  }
  return payload;
});

// Infrastructure plugins
fastify.register(cors, {
  origin: true,
  credentials: true,
});
fastify.register(cookie);
fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// OpenAPI spec generation — must register before routes for Zod schema compilation
fastify.register(openapiPlugin);

// Auth plugin (session resolution)
fastify.register(authPlugin);

// V1 routes (Fastify-native, with response envelope)
fastify.register(v1Routes, { prefix: '/api/v1' });

// SSE events proxy (still used by frontends)
fastify.register(eventRoutes);

// Brain dashboard UI — separate server on :5176
startBrainUI().catch(err => console.error('[brain-ui] Failed to start:', err));

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', engine: 'fastify', version: '2.0.0' };
});

// Serve OpenAPI spec — public, no auth
fastify.get('/api/v1/openapi.json', async () => {
  return fastify.swagger();
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

// Clean shutdown: stop IMAP IDLE when Fastify closes
fastify.addHook('onClose', async () => {
  stopImapIdle();
});

const start = async () => {
  try {
    await migrateConsolidated(pool);
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`Fastify server running at http://${config.host}:${config.port}`);
    scheduler.start();

    // Auto-start IMAP IDLE if a connected email connection exists
    try {
      const { rows } = await pool.query(
        "SELECT id FROM workspace_connections WHERE provider = 'email' AND status = 'connected' LIMIT 1"
      );
      if (rows[0]) {
        startImapIdle(rows[0].id).catch((err: unknown) => {
          console.error('[email] IMAP IDLE auto-start failed:', err instanceof Error ? err.message : err);
        });
        console.log('[email] IMAP IDLE auto-started for existing connection');
      }
    } catch (err) {
      console.error('[email] Failed to check email connection on startup:', err);
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

process.on('SIGINT', () => { scheduler.stop(); process.exit(0); });
process.on('SIGTERM', () => { scheduler.stop(); process.exit(0); });

start();
