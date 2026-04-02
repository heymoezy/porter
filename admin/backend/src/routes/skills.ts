import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { execute, queryOne, queryAll } from '../db/pg.js';
import {
  ensureSkillPack,
  getResearchNotes,
  getSkillDetail,
  getSkillLibrary,
  getSkillPackText,
  writeSkillPackFile,
  computePackDiagnostics,
  type SkillBuilderBlueprint,
} from '../services/skill-library.js';
import {
  scanRepo,
  importCandidates,
  cleanupTemp,
  type ImportCandidate,
} from '../services/skill-importer.js';

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

  // PUT /:id/files/* — write a skill pack file back to disk
  fastify.put('/:id/files/*', async (req, reply) => {
    const { id, '*': relativePath } = req.params as { id: string; '*': string };
    const { content } = (req.body ?? {}) as { content?: string };

    if (typeof content !== 'string') {
      reply.status(400);
      return err('INVALID_INPUT', 'content must be a string');
    }

    if (!relativePath) {
      reply.status(400);
      return err('INVALID_INPUT', 'file path is required');
    }

    const wrote = writeSkillPackFile(id, relativePath, content);
    if (!wrote) {
      reply.status(403);
      return err('FORBIDDEN', 'Path traversal rejected');
    }

    return ok({ saved: true, path: relativePath });
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

  // POST /api/admin/skills — create a new skill
  fastify.post('/', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const id = String(body.id ?? '').trim();
    const name = String(body.name ?? '').trim();
    if (!id || !name) {
      reply.status(400);
      return err('INVALID_INPUT', 'id and name are required');
    }

    const existing = await queryOne<{ id: string }>('SELECT id FROM skills WHERE id = $1', [id]);
    if (existing) {
      reply.status(409);
      return err('DUPLICATE', `Skill "${id}" already exists`);
    }

    await execute(`
      INSERT INTO skills (id, name, description, category, source, enabled, visible, featured, icon, color, short_label, sort_order, featured_order, config_schema)
      VALUES ($1, $2, $3, $4, $5, 1, 1, 0, '', '', '', 50, 0, '{}')
    `, [
      id,
      name,
      String(body.description ?? ''),
      String(body.category ?? 'Unknown'),
      String(body.source ?? 'porter-curated'),
    ]);

    const skill = await getSkillDetail(id);
    return ok({ skill });
  });

  // DELETE /api/admin/skills/:id — delete a skill
  fastify.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await queryOne<{ id: string }>('SELECT id FROM skills WHERE id = $1', [id]);
    if (!existing) {
      reply.status(404);
      return err('NOT_FOUND', 'Skill not found');
    }

    await execute('DELETE FROM persona_skills WHERE skill_name = $1', [id]);
    await execute('DELETE FROM template_skills WHERE skill_id = $1', [id]);
    await execute('DELETE FROM skills WHERE id = $1', [id]);
    return ok({ deleted: id });
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

  // ── Import from external repos ────────────────────────────

  // POST /api/admin/skills/import/scan — clone + scan a repo for SKILL.md files
  fastify.post('/import/scan', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const repoUrl = String(body.repoUrl ?? '').trim();
    if (!repoUrl) {
      reply.status(400);
      return err('INVALID_INPUT', 'repoUrl is required');
    }

    try {
      const candidates = await scanRepo(repoUrl);
      return ok({ candidates, repoUrl });
    } catch (e) {
      reply.status(422);
      return err('SCAN_FAILED', (e as Error).message);
    }
  });

  // POST /api/admin/skills/import/execute — import selected candidates
  fastify.post('/import/execute', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const candidates = body.candidates as ImportCandidate[] | undefined;
    const overwrite = !!body.overwrite;

    if (!Array.isArray(candidates) || candidates.length === 0) {
      reply.status(400);
      return err('INVALID_INPUT', 'candidates array is required');
    }

    try {
      const result = await importCandidates(candidates, overwrite);
      // Clean up temp clone dirs after import
      cleanupTemp();
      return ok(result);
    } catch (e) {
      reply.status(500);
      return err('IMPORT_FAILED', (e as Error).message);
    }
  });

  // POST /api/admin/skills/builder/generate-all — generate packs for all skills missing packs
  fastify.post('/builder/generate-all', async () => {
    const rows = await queryAll<{ id: string; name: string; description: string; category: string; source: string; config_schema: Record<string, unknown> | null }>(
      `SELECT id, name, description, category, source, config_schema FROM skills WHERE pack_status = 'missing' OR pack_status IS NULL`
    );

    let generated = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const cfg = row.config_schema || {};
        const blueprint: SkillBuilderBlueprint = {
          id: row.id,
          name: row.name,
          description: row.description || '',
          category: row.category || 'Unknown',
          source: row.source || 'porter-curated',
          prompt: (cfg as any).prompt || `Operate as ${row.name}. ${row.description || ''}`,
          triggers: (cfg as any).triggers || [],
          inputs: (cfg as any).inputs || [],
          outputs: (cfg as any).outputs || [],
          checks: (cfg as any).checks || [],
          examples: (cfg as any).examples || [],
          tools: (cfg as any).tools || [],
          related_repositories: (cfg as any).related_repositories || [],
        };
        ensureSkillPack(blueprint);
        await execute(`UPDATE skills SET pack_status = 'ready' WHERE id = $1`, [row.id]);
        generated++;
      } catch (e) {
        errors.push(`${row.id}: ${(e as Error).message}`);
      }
    }

    return ok({ generated, skipped: 0, total: rows.length, errors });
  });
}
