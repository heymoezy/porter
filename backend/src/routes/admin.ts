import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../db/schema';
import { eq, and } from 'drizzle-orm';
import si from 'systeminformation';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function adminRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  const sqlite = new Database('../porter.db');
  const db = drizzle(sqlite, { schema });

  const AUDIT_LOG = process.env.PORTER_AUDIT_LOG || path.join(__dirname, '../../../runtime/audit.jsonl');

  const getSession = async (request: any) => {
    const token = request.cookies.porter_session;
    if (!token) return null;
    return db.select().from(schema.sessions).where(eq(schema.sessions.token, token)).get();
  };

  const getUser = async (username: string) => {
    return db.select().from(schema.users).where(eq(schema.users.username, username)).get();
  };

  fastify.get('/api/admin/health', async (request, reply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    
    const user = await getUser(session.username);
    if (!user || user.role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const [cpu, mem, fsSize, time] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.time()
    ]);

    return {
      status: 'ok',
      version: '0.25.4',
      uptime: time.uptime,
      cpu_percent: Math.round(cpu.currentLoad),
      memory_used_mb: Math.round(mem.active / 1024 / 1024),
      disk_free_gb: Math.round((fsSize[0]?.available || 0) / 1024 / 1024 / 1024),
      services: [
        { name: 'fastify-backend', status: 'up', version: '1.0.0' },
        { name: 'porter-python', status: 'up', version: '0.25.4' }
      ]
    };
  });

  fastify.get('/api/admin/logs', async (request, reply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    
    const user = await getUser(session.username);
    if (!user || user.role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const { limit = 100 } = request.query as any;

    try {
      const data = await fs.readFile(AUDIT_LOG, 'utf-8');
      const lines = data.trim().split('
');
      const entries = lines.slice(-Number(limit)).reverse().map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      }).filter(Boolean);

      return { ok: true, entries };
    } catch (err: any) {
      return { ok: true, entries: [], message: 'Audit log not found or empty' };
    }
  });

  fastify.post('/api/admin/users', async (request, reply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    
    const user = await getUser(session.username);
    if (!user || user.role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const data = request.body as any;
    const action = data.action;

    if (action === 'list') {
      const users = await db.select({
        username: schema.users.username,
        displayName: schema.users.displayName,
        fullName: schema.users.fullName,
        email: schema.users.email,
        role: schema.users.role,
        createdAt: schema.users.createdAt,
      }).from(schema.users).all();
      return { ok: true, users };
    }

    if (action === 'update_role') {
      const { username, role } = data;
      if (username === user.username) {
        return reply.code(400).send({ ok: false, error: 'Cannot change your own role' });
      }
      await db.update(schema.users).set({ role }).where(eq(schema.users.username, username));
      return { ok: true };
    }

    if (action === 'delete') {
      const { username } = data;
      if (username === user.username) {
        return reply.code(400).send({ ok: false, error: 'Cannot delete yourself' });
      }
      await db.delete(schema.users).where(eq(schema.users.username, username));
      return { ok: true };
    }

    return reply.code(400).send({ ok: false, error: 'Unknown action' });
  });
}
