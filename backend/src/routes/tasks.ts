import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../db/schema';
import { eq, and, or, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export default async function taskRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  const sqlite = new Database('../porter.db');
  const db = drizzle(sqlite, { schema });

  // Middleware-like check for session
  const getSession = async (request: any) => {
    const token = request.cookies.porter_session;
    if (!token) return null;
    return db.select().from(schema.sessions).where(eq(schema.sessions.token, token)).get();
  };

  const getUser = async (username: string) => {
    return db.select().from(schema.users).where(eq(schema.users.username, username)).get();
  };

  fastify.get('/api/task-registry', async (request, reply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    
    const user = await getUser(session.username);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    let query = db.select().from(schema.tasks);
    
    // RBAC: Non-admins only see their own tasks
    if (user.role !== 'admin') {
      const results = await db.select().from(schema.tasks)
        .where(or(eq(schema.tasks.username, user.username), isNull(schema.tasks.username)))
        .all();
      return { ok: true, tasks: results };
    }

    const allTasks = await db.select().from(schema.tasks).all();
    return { ok: true, tasks: allTasks };
  });

  fastify.post('/api/task-registry', async (request, reply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    
    const user = await getUser(session.username);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const data = request.body as any;
    const action = data.action;

    if (action === 'create') {
      const tid = uuidv4();
      const newTask = {
        id: tid,
        title: data.title,
        description: data.description || '',
        status: 'pending',
        priority: data.priority || 'normal',
        projectId: data.project_id,
        username: user.username,
        tags: JSON.stringify(data.tags || []),
        createdAt: Date.now() / 1000,
        updatedAt: Date.now() / 1000,
      };
      await db.insert(schema.tasks).values(newTask as any);
      return { ok: true, task: newTask };
    }

    if (action === 'update_status') {
      const { id, status, result } = data;
      const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
      if (!task) return reply.code(404).send({ error: 'not found' });
      
      if (user.role !== 'admin' && task.username !== user.username) {
        return reply.code(403).send({ error: 'forbidden' });
      }

      await db.update(schema.tasks)
        .set({ status, result, updatedAt: Date.now() / 1000 })
        .where(eq(schema.tasks.id, id));
      
      return { ok: true };
    }

    return reply.code(400).send({ error: 'unknown action' });
  });
}
