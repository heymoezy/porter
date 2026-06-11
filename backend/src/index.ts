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
import { migrateBridgeV8 } from './db/migrate-bridge-v8.js';
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
import { migratePcpV2 } from './db/migrate-pcp-v2.js';
import { migratePmnV1 } from './db/migrate-pmn-v1.js';
import { migratePsbV1 } from './db/migrate-psb-v1.js';
import { migrateMailV1 } from './db/migrate-mail-v1.js';
import { migrateIntellectV1 } from './db/migrate-intellect-v1.js';
import { migrateBornCheckV1 } from './db/migrate-born-check-v1.js';
import { migrateSilosV1 } from './db/migrate-silos-v1.js';
import { migrateActiveProjectV1 } from './db/migrate-active-project-v1.js';
import { migrateTranscriptsV1 } from './db/migrate-transcripts-v1.js';
import { migrateDreamsV1 } from './db/migrate-dreams-v1.js';
import { migrateDirectivesScopeIdxV1 } from './db/migrate-directives-scope-idx-v1.js';
import { migrateMultiSiloV1 } from './db/migrate-multi-silo-v1.js';
import { migrateRecallDocChunksV1 } from './db/migrate-recall-doc-chunks-v1.js';
import { migrateRecallDocSummaryV1 } from './db/migrate-recall-doc-summary-v1.js';
import { startFileWatcher } from './services/intellect/file-watcher.js';
import { loadSiloCache } from './services/intellect/silo-detector.js';
import { seedBuiltinWorkflows } from './services/intellect/workflow-engine.js';
import { ensureSubscriptionsTable, seedDefaultSubscriptions } from './services/intellect/subscription-manager.js';
import { seedTemplates } from './db/seed-templates.js';
import { detectAndUpsertGateways } from './services/bridge/startup-detector.js';
import * as scheduler from './services/scheduler.js';
import * as jobExecutor from './services/job-executor.js';
// DEPRECATED: IMAP IDLE auto-start removed in Tranche 12. Gmail is a connector, not the primary mail system.
// import { startImapIdle, stopImapIdle } from './services/email.js';
import { pool } from './db/client.js';
import adminAuthPlugin from './plugins/admin-auth.js';
import adminRoutes from './routes/admin/index.js';
import { addSSEClient } from './services/admin/admin-sse.js';
import { probeAllGateways } from './services/admin/gateway-versions.js';



const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

// Landing page: intercept root request before @fastify/static serves the SPA
fastify.addHook('onRequest', async (request, reply) => {
  if (request.url !== '/' || request.method !== 'GET') return;
  const cookies = request.cookies as Record<string, string> | undefined;
  const hasSession = cookies?.porter_session || cookies?.porter_admin_session;
  if (hasSession) return; // let SPA handle authenticated users
  const landingPath = path.join(adminFrontendDist, 'landing.html');
  if (fs.existsSync(landingPath)) {
    reply.type('text/html').send(fs.readFileSync(landingPath, 'utf8'));
  }
});

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
  // Mail system status — lightweight count query
  let mailboxCount = 0;
  try {
    const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM mailboxes WHERE status = \'active\'');
    mailboxCount = parseInt(rows[0]?.count ?? '0', 10);
  } catch { /* table may not exist yet */ }

  return {
    status: 'ok',
    engine: 'fastify',
    version: '6.31.1',
    mail: {
      provider: config.mail.provider,
      domain: config.mail.defaultDomain,
      mailboxes: mailboxCount,
      stalwartConfigured: !!config.mail.stalwartApiKey,
    },
  };
});

// Serve OpenAPI spec — public, no auth
fastify.get('/api/v1/openapi.json', async () => {
  return fastify.swagger();
});

// Serve admin frontend static files at root
if (fs.existsSync(adminFrontendDist)) {
  fastify.register(staticFiles, {
    root: adminFrontendDist,
    prefix: '/',
    wildcard: false,
  });

  // SPA catch-all — serve index.html for client-side routing
  // API routes and /health are registered above and take priority
  fastify.setNotFoundHandler(async (request, reply) => {
    // Only serve SPA for non-API, non-asset GET requests
    if (request.method === 'GET' && !request.url.startsWith('/api/')) {
      // Landing page: serve landing.html for unauthenticated visitors at root
      if (request.url === '/' || request.url === '') {
        const cookies = request.cookies as Record<string, string> | undefined;
        const hasSession = cookies?.porter_session || cookies?.porter_admin_session;
        if (!hasSession) {
          const landingPath = path.join(adminFrontendDist, 'landing.html');
          if (fs.existsSync(landingPath)) {
            return reply.type('text/html').send(fs.readFileSync(landingPath, 'utf8'));
          }
        }
      }
      const indexPath = path.join(adminFrontendDist, 'index.html');
      if (fs.existsSync(indexPath)) {
        const html = fs.readFileSync(indexPath, 'utf8');
        return reply.type('text/html').send(html);
      }
    }
    return reply.code(404).send({ error: 'Not found' });
  });
}

// DEPRECATED: IMAP IDLE shutdown hook removed in Tranche 12 (no longer auto-started)

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
    await migrateBridgeV8(pool);
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
    await migratePcpV2(pool);
    await migratePmnV1(pool);
    await migratePsbV1(pool);
    await migrateMailV1(pool);
    await migrateIntellectV1(pool);
    await migrateBornCheckV1(pool);
    await migrateSilosV1(pool);
    await migrateTranscriptsV1(pool);
    await migrateDreamsV1(pool);
    await migrateDirectivesScopeIdxV1(pool);
    // Phase 50: multi-silo seed (admin + data-room) + legacy workflow row delete.
    // Runs BEFORE loadSiloCache so the cache picks up new silos on first boot.
    await migrateMultiSiloV1(pool);
    // Recall doc-QA: chunk + source tables for cross-project document Q&A.
    // No dependencies on prior migrations; ordered last for monotonic timeline.
    await migrateRecallDocChunksV1(pool);
    await migrateRecallDocSummaryV1(pool);
    // v6.22.0 — Porter backbone identity: active_project pin (which peer
    // project is the human currently working on?). Separate from Porter-the-repo.
    await migrateActiveProjectV1(pool);
    // Phase 48.1: warm the silo-detector cache after silos migration.
    // Lazy-load fallback exists in the detector so cold-start works; this is
    // just a perf optimization. Never crash boot if it fails.
    await loadSiloCache(pool).catch((err) => {
      console.warn('[silo-cache] load failed:', err && err.message ? err.message : err);
    });
    await seedTemplates();
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`Fastify server running at http://${config.host}:${config.port}`);
    scheduler.start();
    jobExecutor.start();

    // Start Intellect file watcher on project directories
    const projectDirs = ['/home/lobster/projects'];
    startFileWatcher(projectDirs);

    // Seed Intellect built-in workflows + subscriptions (idempotent)
    try {
      await seedBuiltinWorkflows();
      await ensureSubscriptionsTable();
      await seedDefaultSubscriptions();
    } catch (err) {
      console.error('[intellect] seed failed:', err instanceof Error ? err.message : err);
    }

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

    // DEPRECATED: IMAP IDLE auto-start removed in Tranche 12.
    // Gmail is now an optional connector; Stalwart is the primary mail backend.
    // See services/mail/* for the new hosted mail system.
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

process.on('SIGINT', () => { scheduler.stop(); jobExecutor.stop(); process.exit(0); });
process.on('SIGTERM', () => { scheduler.stop(); jobExecutor.stop(); process.exit(0); });

start();
