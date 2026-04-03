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
import { migrateConsolidated } from './db/migrate-consolidated.js';
import { migrateMemoryV3 } from './db/migrate-memv3.js';
import { migrateSkillsTools } from './db/migrate-15.js';
import { migrateTemplateColumns } from './db/migrate-templates.js';
import { migrateBridgeV1 } from './db/migrate-bridge-v1.js';
import { migrateBridgeV2 } from './db/migrate-bridge-v2.js';
import { migrateBridgeV3 } from './db/migrate-bridge-v3.js';
import { migrateBridgeV4 } from './db/migrate-bridge-v4.js';
import { migrateBridgeV5 } from './db/migrate-bridge-v5.js';
import { migrateBridgeV6 } from './db/migrate-bridge-v6.js';
import { migrateBridgeV7 } from './db/migrate-bridge-v7.js';
import { migrateRateLimits } from './db/migrate-rate-limits.js';
import { migrateRpgV1 } from './db/migrate-rpg-v1.js';
import { migrateSotV1 } from './db/migrate-sot-v1.js';
import { migrateRtsV1 } from './db/migrate-rts-v1.js';
import { migrateFbkV1 } from './db/migrate-fbk-v1.js';
import { migrateQltV1 } from './db/migrate-qlt-v1.js';
import { migrateEvoV1 } from './db/migrate-evo-v1.js';
import { migrateTuxV1 } from './db/migrate-tux-v1.js';
import { migrateAcxV2 } from './db/migrate-acx-v2.js';
import { migrateAcxV3 } from './db/migrate-acx-v3.js';
import { migrateSinV1 } from './db/migrate-sin-v1.js';
import { migrateTdeV1 } from './db/migrate-tde-v1.js';
import { migrateAjqV1 } from './db/migrate-ajq-v1.js';
import { migratePcpV1 } from './db/migrate-pcp-v1.js';
import { seedTemplates } from './db/seed-templates.js';
import { detectAndUpsertGateways } from './services/bridge/startup-detector.js';
import * as scheduler from './services/scheduler.js';
import { startImapIdle, stopImapIdle } from './services/email.js';
import { pool } from './db/client.js';
import adminAuthPlugin from './plugins/admin-auth.js';
import adminRoutes from './routes/admin/index.js';
import { addSSEClient } from './services/admin/admin-sse.js';
import { probeAllGateways } from './services/admin/gateway-versions.js';
import { initConfidenceCache } from './services/bridge/routing-confidence.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const adminFrontendDist = path.resolve(__dirname, '../../admin/frontend/build/client');

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
fastify.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB max

// OpenAPI spec generation — must register before routes for Zod schema compilation
fastify.register(openapiPlugin);

// Auth plugin (session resolution)
fastify.register(authPlugin);

// Root — served by SPA catch-all below

// V1 routes (Fastify-native, with response envelope)
fastify.register(v1Routes, { prefix: '/api/v1' });

// Admin auth plugin (adds requirePlatformAdmin, reads porter_admin_session cookie)
fastify.register(adminAuthPlugin);

// Admin API routes (absorbed from Porter Admin :5175)
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
  request.raw.on('close', () => {});
});

// SSE events proxy (still used by frontends)
fastify.register(eventRoutes);

// Brain dashboard UI — separate server on :5176
startBrainUI().catch(err => console.error('[brain-ui] Failed to start:', err));

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', engine: 'fastify', version: '5.2.0' };
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

// Serve admin frontend static files at root
if (fs.existsSync(adminFrontendDist)) {
  fastify.register(staticFiles, {
    root: adminFrontendDist,
    prefix: '/',
    wildcard: false,
    decorateReply: false, // already decorated by the first static registration
  });

  // SPA catch-all — serve index.html for client-side routing
  // API routes, /health, /v2/* are registered above and take priority
  fastify.setNotFoundHandler(async (request, reply) => {
    // Only serve SPA for non-API, non-asset GET requests
    if (request.method === 'GET' && !request.url.startsWith('/api/') && !request.url.startsWith('/v2/')) {
      const indexPath = path.join(adminFrontendDist, 'index.html');
      if (fs.existsSync(indexPath)) {
        const html = fs.readFileSync(indexPath, 'utf8');
        return reply.type('text/html').send(html);
      }
    }
    return reply.code(404).send({ error: 'Not found' });
  });
}

// Clean shutdown: stop IMAP IDLE when Fastify closes
fastify.addHook('onClose', async () => {
  stopImapIdle();
});

const start = async () => {
  try {
    await migrateConsolidated(pool);
    await migrateMemoryV3(pool);
    await migrateSkillsTools(pool);
    await migrateTemplateColumns(pool);
    await migrateBridgeV1(pool);
    await migrateBridgeV2(pool);
    await migrateBridgeV3(pool);
    await migrateBridgeV4(pool);
    await migrateBridgeV5(pool);
    await migrateBridgeV6(pool);
    await migrateBridgeV7(pool);
    await migrateRateLimits(pool);
    await migrateRpgV1(pool);
    await migrateSotV1(pool);
    await migrateRtsV1(pool);
    await migrateFbkV1(pool);
    await migrateQltV1(pool);
    await migrateEvoV1(pool);
    await migrateTuxV1(pool);
    await migrateAcxV2(pool);
    await migrateAcxV3(pool);
    await migrateSinV1(pool);
    await migrateTdeV1(pool);
    await migrateAjqV1(pool);
    await migratePcpV1(pool);
    await seedTemplates();
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`Fastify server running at http://${config.host}:${config.port}`);
    scheduler.start();

    // SIN-03: Warm routing confidence cache from historical outcome data
    await initConfidenceCache();

    // Auto-detect AI gateways and bootstrap from env vars
    await detectAndUpsertGateways(pool);

    // Probe all gateways at startup (versions + health, like admin server)
    probeAllGateways().then(results => {
      const detected = results.filter(r => r.version);
      const outdated = results.filter(r => r.is_latest === false);
      console.log(`Gateway probe: ${detected.length}/${results.length} versions detected${outdated.length ? `, ${outdated.length} outdated` : ''}`);
    }).catch(err => {
      console.error('Gateway probe failed:', err instanceof Error ? err.message : err);
    });

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
