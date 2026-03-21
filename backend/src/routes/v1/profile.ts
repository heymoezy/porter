import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db, sqlite } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { ok, err } from '../../lib/envelope.js';
import { z } from 'zod';

const updateProfileSchema = z.object({
  display_name: z.string().min(1, 'Preferred name cannot be empty'),
  full_name: z.string().optional().default(''),
  email: z.string().optional().default(''),
});

export default async function profileV1Routes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // POST /api/v1/profile — update display name, email, full name
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const user = request.sessionUser!;

    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { display_name, full_name, email } = parsed.data;

    try {
      db.update(schema.users).set({
        displayName: display_name.trim(),
        fullName: full_name.trim(),
        email: email.trim(),
      }).where(eq(schema.users.username, user.username)).run();

      return reply.send(ok({
        display_name: display_name.trim(),
        full_name: full_name.trim(),
        email: email.trim(),
      }));
    } catch (e: any) {
      return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to update profile'));
    }
  });
}
