import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { execute, queryOne } from '../db/pg.js';
import {
  ensureSkillPack,
  getResearchNotes,
  getSkillDetail,
  getSkillLibrary,
  getSkillPackText,
  type SkillBuilderBlueprint,
} from '../services/skill-library.js';

function toIntFlag(value: unknown, fallback: number) {
  if (value == null) return fallback;
  return value ? 1 : 0;
}

export default async function skillsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  fastify.get('/', async () => {
    const { skills, summary } = await getSkillLibrary();
    return ok({ skills, ...summary });
  });

  fastify.get('/research', async () => {
    return ok({ notes: getResearchNotes() });
  });

  fastify.get('/:id/files/*', async (req, reply) => {
    const { id, '*': relativePath } = req.params as { id: string; '*': string };
    const text = getSkillPackText(id, relativePath);
    if (text == null) {
      reply.status(404);
      return err('NOT_FOUND', 'File not found');
    }
    return ok({ text });
  });

  fastify.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const skill = await getSkillDetail(id);
    if (!skill) {
      reply.status(404);
      return err('NOT_FOUND', 'Skill not found');
    }
    return ok({ skill });
  });

  fastify.put('/:personaId/:skillName/toggle', async (req, reply) => {
    const { personaId, skillName } = req.params as { personaId: string; skillName: string };
    const row = await queryOne<{ enabled: number }>('SELECT enabled FROM persona_skills WHERE persona_id = $1 AND skill_name = $2', [personaId, skillName]);
    if (!row) {
      reply.status(404);
      return err('NOT_FOUND', 'Assignment not found');
    }
    const newEnabled = row.enabled ? 0 : 1;
    await execute('UPDATE persona_skills SET enabled = $1 WHERE persona_id = $2 AND skill_name = $3', [newEnabled, personaId, skillName]);
    return ok({ personaId, skillName, enabled: !!newEnabled });
  });

  fastify.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;

    const exists = await queryOne<{ id: string }>('SELECT id FROM skills WHERE id = $1', [id]);
    if (!exists) {
      reply.status(404);
      return err('NOT_FOUND', 'Skill not found');
    }

    const next = {
      name: String(body.name ?? ''),
      description: String(body.description ?? ''),
      category: String(body.category ?? ''),
      source: String(body.source ?? 'porter-curated'),
      icon: String(body.icon ?? ''),
      color: String(body.color ?? ''),
      short_label: String(body.short_label ?? ''),
      enabled: toIntFlag(body.enabled, 1),
      visible: toIntFlag(body.visible, 1),
      featured: toIntFlag(body.featured, 0),
      sort_order: Number(body.sort_order ?? 50),
      featured_order: Number(body.featured_order ?? 0),
      config_schema: body.config_schema && typeof body.config_schema === 'object' ? body.config_schema : {},
    };

    await execute(`
      UPDATE skills
      SET name = $2,
          description = $3,
          category = $4,
          source = $5,
          icon = $6,
          color = $7,
          short_label = $8,
          enabled = $9,
          visible = $10,
          featured = $11,
          sort_order = $12,
          featured_order = $13,
          config_schema = $14,
          updated_at = EXTRACT(EPOCH FROM NOW())
      WHERE id = $1
    `, [
      id,
      next.name,
      next.description,
      next.category,
      next.source,
      next.icon,
      next.color,
      next.short_label,
      next.enabled,
      next.visible,
      next.featured,
      next.sort_order,
      next.featured_order,
      JSON.stringify(next.config_schema),
    ]);

    const skill = await getSkillDetail(id);
    return ok({ skill });
  });

  fastify.post('/builder/generate', async (req, reply) => {
    const body = (req.body ?? {}) as Partial<SkillBuilderBlueprint> & { upsertDb?: boolean };
    if (!body.id || !body.name || !body.description || !body.category) {
      reply.status(400);
      return err('INVALID_INPUT', 'id, name, description, and category are required');
    }

    const blueprint: SkillBuilderBlueprint = {
      id: body.id,
      name: body.name,
      description: body.description,
      category: body.category,
      source: body.source || 'porter-curated',
      prompt: body.prompt || `Operate as ${body.name}. Produce artifacts, not generic advice.`,
      triggers: body.triggers || [],
      inputs: body.inputs || [],
      outputs: body.outputs || [],
      checks: body.checks || [],
      examples: body.examples || [],
      tools: body.tools || [],
      related_repositories: body.related_repositories || [],
    };

    const pack = ensureSkillPack(blueprint);

    if (body.upsertDb !== false) {
      await execute(`
        INSERT INTO skills (id, name, description, category, source, enabled, visible, featured, icon, color, short_label, sort_order, featured_order, config_schema)
        VALUES ($1, $2, $3, $4, $5, 1, 1, 0, '', '', '', 50, 0, $6)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          source = EXCLUDED.source,
          config_schema = EXCLUDED.config_schema,
          updated_at = EXTRACT(EPOCH FROM NOW())
      `, [
        blueprint.id,
        blueprint.name,
        blueprint.description,
        blueprint.category,
        blueprint.source,
        JSON.stringify({
          prompt: blueprint.prompt,
          triggers: blueprint.triggers,
          inputs: blueprint.inputs,
          outputs: blueprint.outputs,
          checks: blueprint.checks,
          tools: blueprint.tools,
          related_repositories: blueprint.related_repositories,
        }),
      ]);
    }

    return ok({ generated: true, dir: pack.dir, files: pack.files });
  });
}
