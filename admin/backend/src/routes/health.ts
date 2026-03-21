import { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';
import { sqlite } from '../db/client.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let ADMIN_VERSION = '0.1.0';
try {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));
  ADMIN_VERSION = pkg.version || ADMIN_VERSION;
} catch {}

export default async function healthRoutes(fastify: FastifyInstance) {
  // Public health check — no auth required
  fastify.get('/', async () => {
    let dbOk = false;
    try {
      sqlite.prepare('SELECT 1').get();
      dbOk = true;
    } catch { /* db unreachable */ }

    return ok({
      status: dbOk ? 'healthy' : 'degraded',
      service: 'porter-admin',
      version: ADMIN_VERSION,
      db: dbOk ? 'connected' : 'unreachable',
      timestamp: Date.now(),
    });
  });

  // GET /api/admin/health/version — version endpoint
  fastify.get('/version', async () => {
    return ok({ version: ADMIN_VERSION, service: 'porter-admin' });
  });
}
