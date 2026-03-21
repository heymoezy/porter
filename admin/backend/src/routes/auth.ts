import { FastifyInstance } from 'fastify';
import { db, sqlite } from '../db/client.js';
import * as schema from '../../../../backend/src/db/schema.js';
import { eq } from 'drizzle-orm';
import { ok, err } from '../lib/envelope.js';
import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /api/v1/auth/login
  fastify.post('/login', async (request, reply) => {
    const { username, password } = request.body as { username?: string; password?: string };
    if (!username || !password) {
      return reply.code(400).send(err('INVALID_INPUT', 'Username and password are required'));
    }

    const user = db.select().from(schema.users)
      .where(eq(schema.users.username, username)).get();
    if (!user) {
      return reply.code(401).send(err('INVALID_CREDENTIALS', 'Invalid username or password'));
    }

    const hash = (await scrypt(password, user.salt, 32)) as Buffer;
    if (hash.toString('hex') !== user.passwordHash) {
      return reply.code(401).send(err('INVALID_CREDENTIALS', 'Invalid username or password'));
    }

    // Reuse existing valid session if cookie present
    const existingToken = request.cookies?.porter_session;
    if (existingToken) {
      const existing = db.select().from(schema.sessions)
        .where(eq(schema.sessions.token, existingToken)).get();
      if (existing && existing.expires! > Date.now() / 1000 && existing.username === username) {
        return reply.send(ok({ username, displayName: user.displayName ?? username }));
      }
    }

    // Clean up expired sessions for this user (prevent leak)
    sqlite.prepare("DELETE FROM sessions WHERE username = ? AND expires <= unixepoch('now')").run(username);

    const token = crypto.randomBytes(32).toString('hex');
    const expires = (Date.now() / 1000) + (30 * 24 * 60 * 60);

    db.insert(schema.sessions).values({
      token, username, expires,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    }).run();

    // Track login event
    try {
      sqlite.prepare(`
        INSERT INTO customer_events (username, event_type, ip_address, created_at)
        VALUES (?, 'login', ?, unixepoch('now'))
      `).run(username, request.ip);
    } catch { /* table may not exist */ }

    reply.setCookie('porter_session', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60,
    });

    return reply.send(ok({ username, displayName: user.displayName ?? username }));
  });

  // POST /api/v1/auth/logout
  fastify.post('/logout', async (request, reply) => {
    const token = request.cookies?.porter_session;
    if (token) {
      db.delete(schema.sessions).where(eq(schema.sessions.token, token)).run();
    }
    reply.clearCookie('porter_session', { path: '/' });
    return reply.send(ok({ loggedOut: true }));
  });

  // GET /api/v1/auth/me
  fastify.get('/me', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const sessionUser = request.sessionUser!;
    const user = db.select().from(schema.users)
      .where(eq(schema.users.username, sessionUser.username)).get();

    return reply.send(ok({
      username: sessionUser.username,
      displayName: sessionUser.displayName ?? sessionUser.username,
      role: sessionUser.role,
      email: user?.email ?? null,
    }));
  });
}
