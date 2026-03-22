import { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';
import { sqlite } from '../db/client.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let ADMIN_VERSION = '0.1.8';
try {
  for (const p of [resolve(__dirname, '../../package.json'), resolve(process.cwd(), 'package.json')]) {
    try {
      const pkg = JSON.parse(readFileSync(p, 'utf-8'));
      if (pkg.version) { ADMIN_VERSION = pkg.version; break; }
    } catch {}
  }
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
