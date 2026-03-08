import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function fileRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  const sqlite = new Database('../porter.db');
  const db = drizzle(sqlite, { schema });

  // Root directory for file access — should be configurable
  const DATA_DIR = process.env.PORTER_DATA_DIR || path.join(__dirname, '../../../');

  const getSession = async (request: any) => {
    const token = request.cookies.porter_session;
    if (!token) return null;
    return db.select().from(schema.sessions).where(eq(schema.sessions.token, token)).get();
  };

  const getUser = async (username: string) => {
    return db.select().from(schema.users).where(eq(schema.users.username, username)).get();
  };

  fastify.get('/api/files', async (request, reply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    
    const user = await getUser(session.username);
    if (!user || (user.role !== 'admin' && user.role !== 'operator')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { path: relPath = '/' } = request.query as any;
    const absPath = path.join(DATA_DIR, relPath);

    // Security: Prevent directory traversal
    if (!absPath.startsWith(path.resolve(DATA_DIR))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const stats = await fs.stat(absPath);
      if (!stats.isDirectory()) {
        return reply.code(400).send({ error: 'not a directory' });
      }

      const entries = await fs.readdir(absPath, { withFileTypes: true });
      const files = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(absPath, entry.name);
        const relEntryPath = path.join(relPath, entry.name);
        try {
          const s = await fs.stat(entryPath);
          return {
            name: entry.name,
            path: relEntryPath,
            is_dir: entry.isDirectory(),
            size: s.size,
            mtime: s.mtimeMs / 1000,
            type: entry.isDirectory() ? 'dir' : path.extname(entry.name).slice(1) || 'file'
          };
        } catch (e) {
          return null;
        }
      }));

      return { ok: true, files: files.filter(Boolean) };
    } catch (err: any) {
      return reply.code(500).send({ ok: false, error: err.message });
    }
  });

  fastify.get('/api/files/download', async (request, reply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    
    const { path: relPath } = request.query as any;
    if (!relPath) return reply.code(400).send({ error: 'path required' });

    const absPath = path.join(DATA_DIR, relPath);
    if (!absPath.startsWith(path.resolve(DATA_DIR))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const stats = await fs.stat(absPath);
      if (stats.isDirectory()) return reply.code(400).send({ error: 'cannot download directory' });
      
      const stream = await fs.readFile(absPath);
      reply.header('Content-Disposition', `attachment; filename="${path.basename(absPath)}"`);
      return reply.send(stream);
    } catch (err: any) {
      return reply.code(404).send({ error: 'file not found' });
    }
  });

  fastify.post('/api/files', async (request, reply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    
    const user = await getUser(session.username);
    if (!user || (user.role !== 'admin' && user.role !== 'operator')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { action, path: relPath } = request.body as any;
    if (!relPath) return reply.code(400).send({ error: 'path required' });

    const absPath = path.join(DATA_DIR, relPath);
    if (!absPath.startsWith(path.resolve(DATA_DIR))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    if (action === 'delete') {
      try {
        const stats = await fs.stat(absPath);
        if (stats.isDirectory()) {
          await fs.rm(absPath, { recursive: true });
        } else {
          await fs.unlink(absPath);
        }
        return { ok: true };
      } catch (err: any) {
        return reply.code(500).send({ ok: false, error: err.message });
      }
    }

    return reply.code(400).send({ error: 'unknown action' });
  });
}
