import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db, pool } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { ok, err } from '../../lib/envelope.js';
import { z } from 'zod';
import { emitSSE } from '../../services/scheduler.js';

const updateProfileSchema = z.object({
  display_name: z.string().min(1, 'Preferred name cannot be empty'),
  full_name: z.string().optional().default(''),
  email: z.string().optional().default(''),
  avatar_url: z.string().optional(), // JSON-encoded appearance spec
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

    const { display_name, full_name, email, avatar_url } = parsed.data;

    try {
      const updates: Record<string, string> = { displayName: display_name.trim() };
      if (full_name.trim()) updates.fullName = full_name.trim();

      // Only update email if non-empty AND different from current
      if (email.trim()) {
        const [current] = await db.select({ email: schema.users.email })
          .from(schema.users).where(eq(schema.users.username, user.username));
        if (current?.email !== email.trim()) {
          // Check uniqueness before updating
          const conflict = (await pool.query('SELECT 1 FROM users WHERE email = $1 AND username != $2',
            [email.trim(), user.username])).rows[0];
          if (conflict) {
            return reply.code(409).send(err('EMAIL_EXISTS', 'This email is already used by another account'));
          }
          updates.email = email.trim();
        }
      }

      // Persist avatar spec as JSON in avatar_url column
      if (avatar_url) {
        try { await pool.query('UPDATE users SET avatar_url = $1 WHERE username = $2', [avatar_url, user.username]); } catch {}
      }

      await db.update(schema.users).set(updates)
        .where(eq(schema.users.username, user.username));

      // Notify admin in real-time
      emitSSE('profile:updated', {
        username: user.username,
        display_name: display_name.trim(),
        full_name: full_name.trim() || undefined,
        email: email.trim() || undefined,
        updated_at: Date.now() / 1000,
      }).catch(() => {});

      return reply.send(ok({
        display_name: display_name.trim(),
        full_name: full_name.trim() || undefined,
        email: email.trim() || undefined,
      }));
    } catch (e: any) {
      return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to update profile'));
    }
  });
}
