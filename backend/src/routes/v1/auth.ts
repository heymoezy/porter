import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { ok, err } from '../../lib/envelope.js';
import { z } from 'zod';
import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

const loginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export default async function authV1Routes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  // POST /api/v1/auth/login
  fastify.post('/login', async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', 'Username and password are required'));
    }

    const { username, password } = parsed.data;

    const user = db.select().from(schema.users)
      .where(eq(schema.users.username, username)).get();

    if (!user) {
      return reply.code(401).send(err('INVALID_CREDENTIALS', 'Invalid username or password'));
    }

    const hash = (await scrypt(password, user.salt, 32)) as Buffer;
    if (hash.toString('hex') !== user.passwordHash) {
      return reply.code(401).send(err('INVALID_CREDENTIALS', 'Invalid username or password'));
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

    // Fetch email from users table (sessionUser doesn't carry it)
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
