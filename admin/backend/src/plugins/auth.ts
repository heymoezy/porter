import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { queryOne } from '../db/pg.js';
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
    const token = request.cookies?.porter_admin_session;
    if (!token) return;

    const session = await queryOne<{ username: string; expires: number }>(
      'SELECT username, expires FROM sessions WHERE token = $1', [token]
    );
    if (!session || session.expires < Date.now() / 1000) return;

    const user = await queryOne<{ username: string; role: string; display_name: string | null }>(
      'SELECT username, role, display_name FROM users WHERE username = $1', [session.username]
    );
    if (user) {
      request.sessionUser = {
        username: user.username,
        role: user.role ?? 'operator',
        displayName: user.display_name,
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
