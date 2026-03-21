import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';
import * as schema from '../../../../backend/src/db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

declare module 'fastify' {
  interface FastifyRequest {
    sessionUser: { username: string; role: string; displayName: string | null } | null;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePlatformAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('sessionUser', null);

  // Resolve session from cookie on every request
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    const token = request.cookies?.porter_session;
    if (!token) return;

    const session = db.select().from(schema.sessions)
      .where(eq(schema.sessions.token, token)).get();
    if (!session || session.expires! < Date.now() / 1000) return;

    const user = db.select().from(schema.users)
      .where(eq(schema.users.username, session.username)).get();
    if (user) {
      request.sessionUser = {
        username: user.username,
        role: user.role ?? 'operator',
        displayName: user.displayName,
      };
    }
  });

  // Basic auth guard
  fastify.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.sessionUser) {
      reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        meta: { request_id: crypto.randomUUID(), timestamp: Date.now() },
      });
    }
  });

  // Platform admin gate — every admin route uses this
  fastify.decorate('requirePlatformAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.sessionUser) {
      reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        meta: { request_id: crypto.randomUUID(), timestamp: Date.now() },
      });
      return;
    }
    if (request.sessionUser.role !== 'platform_admin') {
      reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Platform admin access required' },
        meta: { request_id: crypto.randomUUID(), timestamp: Date.now() },
      });
    }
  });
}

export default fp(authPlugin, { name: 'porter-admin-auth' });
