import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { ok, err } from '../../lib/envelope.js';
import { z } from 'zod';
import crypto from 'crypto';

function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function formatProject(row: typeof schema.projects.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    status: row.status,
    description: row.description,
    owner_id: row.ownerId,
    milestones: parseJsonField(row.milestones, [] as unknown[]),
    artifacts: parseJsonField(row.artifacts, [] as unknown[]),
    links: parseJsonField(row.links, [] as unknown[]),
    metadata: parseJsonField(row.metadata, {} as Record<string, unknown>),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string().optional(),
  description: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
});

export default async function projectV1Routes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  // GET /api/v1/projects — list all active projects
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const projects = db.select().from(schema.projects)
      .where(eq(schema.projects.status, 'active'))
      .all();

    return reply.send(ok({
      projects: projects.map(formatProject),
      count: projects.length,
    }));
  });

  // POST /api/v1/projects — create a new project
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { name, type, description } = parsed.data;
    const id = crypto.randomUUID();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    const ownerId = request.sessionUser!.username;
    const now = Date.now() / 1000;

    db.insert(schema.projects).values({
      id,
      name,
      slug,
      type: type ?? 'custom',
      status: 'active',
      description: description ?? null,
      ownerId,
      createdAt: now,
      updatedAt: now,
    }).run();

    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.id, id)).get();

    return reply.code(201).send(ok({ project: project ? formatProject(project) : null }));
  });

  // GET /api/v1/projects/:id — get single project
  fastify.get('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.id, id)).get();

    if (!project) {
      return reply.code(404).send(err('PROJECT_NOT_FOUND', 'Project not found'));
    }

    return reply.send(ok({ project: formatProject(project) }));
  });

  // PUT /api/v1/projects/:id — update a project
  fastify.put('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = db.select().from(schema.projects)
      .where(eq(schema.projects.id, id)).get();

    if (!existing) {
      return reply.code(404).send(err('PROJECT_NOT_FOUND', 'Project not found'));
    }

    const parsed = updateProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const updates: Partial<typeof schema.projects.$inferInsert> = {
      updatedAt: Date.now() / 1000,
    };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.type !== undefined) updates.type = parsed.data.type;

    db.update(schema.projects).set(updates)
      .where(eq(schema.projects.id, id)).run();

    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.id, id)).get();

    return reply.send(ok({ project: project ? formatProject(project) : null }));
  });

  // DELETE /api/v1/projects/:id — delete a project
  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = db.select().from(schema.projects)
      .where(eq(schema.projects.id, id)).get();

    if (!existing) {
      return reply.code(404).send(err('PROJECT_NOT_FOUND', 'Project not found'));
    }

    db.delete(schema.projects).where(eq(schema.projects.id, id)).run();

    return reply.send(ok({ deleted: true }));
  });
}
