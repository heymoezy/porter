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
import adminRoutes from './routes/index.js';
import { migrateAdmin01 } from './db/migrate-admin-01.js';
import { migrateAdmin02 } from './db/migrate-admin-02.js';
import { migrateAdmin03 } from './db/migrate-admin-03.js';
import { migrateAdmin04 } from './db/migrate-admin-04.js';
import { sqlite } from './db/client.js';

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

// Admin API routes
fastify.register(adminRoutes, { prefix: '/api/admin' });

// Catch server errors and log to error_log table
fastify.setErrorHandler(async (error, request, reply) => {
  try {
    sqlite.prepare(`
      INSERT INTO error_log (source, severity, message, stack, url, username, ip_address, metadata)
      VALUES ('server_api', 'error', ?, ?, ?, ?, ?, ?)
    `).run(
      error.message,
      error.stack ?? null,
      request.url,
      request.sessionUser?.username ?? null,
      request.ip,
      JSON.stringify({ method: request.method, statusCode: error.statusCode ?? 500 }),
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
    migrateAdmin01();
    migrateAdmin02();
    migrateAdmin03();
    migrateAdmin04();
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`Porter Admin running at http://${config.host}:${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
