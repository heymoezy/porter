import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

export default async function authRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  fastify.post('/login', async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string };
    if (!username || !password) {
      return reply.code(400).send({ ok: false, error: 'Username and password required' });
    }

    const user = db.select().from(schema.users).where(eq(schema.users.username, username)).get();
    if (!user) {
      return reply.code(401).send({ ok: false, error: 'Invalid credentials' });
    }

    const hash = (await scrypt(password, user.salt, 32)) as Buffer;
    if (hash.toString('hex') !== user.passwordHash) {
      return reply.code(401).send({ ok: false, error: 'Invalid credentials' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = (Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

    db.insert(schema.sessions).values({
      token,
      username,
      expires,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    }).run();

    reply.setCookie('porter_session', token, {
      path: '/',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60,
    });

    return { ok: true, token };
  });

  fastify.post('/logout', async (request, reply) => {
    const token = request.cookies.porter_session;
    if (token) {
      db.delete(schema.sessions).where(eq(schema.sessions.token, token)).run();
    }
    reply.clearCookie('porter_session', { path: '/' });
    return { ok: true };
  });

  fastify.get('/api/session', async (request, reply) => {
    const token = request.cookies.porter_session;
    if (!token) return { ok: false };

    const session = db.select().from(schema.sessions).where(eq(schema.sessions.token, token)).get();
    if (!session || session.expires < Date.now() / 1000) {
      return { ok: false };
    }

    const user = db.select().from(schema.users).where(eq(schema.users.username, session.username)).get();
    if (!user) return { ok: false };

    // Update last seen
    db.update(schema.sessions)
      .set({ lastSeenAt: Date.now() / 1000 })
      .where(eq(schema.sessions.token, token))
      .run();

    return {
      ok: true,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
    };
  });
}
