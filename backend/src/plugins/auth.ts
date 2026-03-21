import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { err } from '../lib/envelope.js';

declare module 'fastify' {
  interface FastifyRequest {
    sessionUser: { username: string; role: string; displayName: string | null } | null;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('sessionUser', null);

  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    // Try session cookie first
    const token = request.cookies?.porter_session;
    if (!token) return;

    const session = db.select().from(schema.sessions)
      .where(eq(schema.sessions.token, token)).get();
    if (!session || session.expires < Date.now() / 1000) return;

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

  fastify.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.sessionUser) {
      reply.code(401).send(err('UNAUTHORIZED', 'Authentication required', request.id));
    }
  });
}

export default fp(authPlugin, { name: 'porter-auth' });
