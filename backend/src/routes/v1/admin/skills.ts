import { FastifyInstance } from 'fastify';
import { ok, err } from '../../../lib/envelope.js';
import { pool } from '../../../db/client.js';
import { z } from 'zod';
import crypto from 'crypto';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createSkillSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  category: z.string().min(1).max(50),
  source: z.string().max(50).default('porter-curated'),
  enabled: z.number().int().min(0).max(1).default(1),
  visible: z.number().int().min(0).max(1).default(1),
  featured: z.number().int().min(0).max(1).default(0),
  icon: z.string().max(100).default(''),
  color: z.string().max(20).default(''),
  cover_image: z.string().max(500).default(''),
  short_label: z.string().max(50).default(''),
  sort_order: z.number().int().default(50),
  featured_order: z.number().int().default(0),
  config_schema: z.record(z.string(), z.unknown()).default({}),
});

const updateSkillSchema = createSkillSchema.partial();

// ── Route handler ─────────────────────────────────────────────────────────────

export default async function skillsRoutes(fastify: FastifyInstance) {

  // GET /api/admin/skills — all skills from DB with agent + template assignment counts
  fastify.get('/', async () => {
    try {
      const rows = (await pool.query(`
        SELECT s.*,
          (SELECT COUNT(*) FROM template_skills ts WHERE ts.skill_id = s.id) AS template_count,
          (SELECT COUNT(*) FROM persona_skills ps WHERE ps.skill_name = s.id AND ps.enabled = 1) AS agent_count
        FROM skills s
        ORDER BY s.sort_order, s.name
      `)).rows;

      return ok({ skills: rows, total: rows.length });
    } catch {
      return ok({ skills: [], total: 0 });
    }
  });

  // GET /api/admin/skills/categories — category list with counts
  // MUST be registered BEFORE /:id to avoid Fastify param conflict
  fastify.get('/categories', async () => {
    try {
      const rows = (await pool.query(`
        SELECT category, COUNT(*) as count FROM skills GROUP BY category ORDER BY category
      `)).rows;
      return ok({ categories: rows });
    } catch {
      return ok({ categories: [] });
    }
  });

  // GET /api/admin/skills/featured — featured skills ordered by featured_order
  // MUST be registered BEFORE /:id to avoid Fastify param conflict
  fastify.get('/featured', async () => {
    try {
      const rows = (await pool.query(`
        SELECT * FROM skills WHERE featured = 1 ORDER BY featured_order, sort_order, name
      `)).rows;
      return ok({ skills: rows });
    } catch {
      return ok({ skills: [] });
    }
  });

  // GET /api/admin/skills/:id — single skill with full agent + template details
  fastify.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const skillResult = await pool.query('SELECT * FROM skills WHERE id = $1', [id]);
      if (!skillResult.rows.length) {
        return reply.code(404).send(err('NOT_FOUND', 'Skill not found'));
      }
      const skill = skillResult.rows[0];

      const templates = (await pool.query(`
        SELECT ts.template_id, at.name, at.category
        FROM template_skills ts
        JOIN agent_templates at ON at.id = ts.template_id
        WHERE ts.skill_id = $1
        ORDER BY at.name
      `, [id])).rows;

      const agents = (await pool.query(`
        SELECT ps.persona_id, p.name, p.role, ps.enabled
        FROM persona_skills ps
        LEFT JOIN personas p ON p.id = ps.persona_id
        WHERE ps.skill_name = $1
        ORDER BY p.name
      `, [id])).rows;

      return ok({ skill: { ...skill, templates, agents } });
    } catch {
      return reply.code(404).send(err('NOT_FOUND', 'Skill not found'));
    }
  });

  // POST /api/admin/skills — create a new skill
  fastify.post('/', async (req, reply) => {
    const parsed = createSkillSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.message));
    }
    const d = parsed.data;
    const id = d.id || crypto.randomUUID();

    try {
      await pool.query(`
        INSERT INTO skills (
          id, name, description, category, source,
          enabled, visible, featured,
          icon, color, cover_image, short_label,
          sort_order, featured_order, config_schema
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15
        )
      `, [
        id, d.name, d.description, d.category, d.source,
        d.enabled, d.visible, d.featured,
        d.icon, d.color, d.cover_image, d.short_label,
        d.sort_order, d.featured_order, JSON.stringify(d.config_schema),
      ]);

      return reply.code(201).send(ok({ skill: { id, ...d } }));
    } catch (e: any) {
      if (e.code === '23505') {
        return reply.code(409).send(err('CONFLICT', `Skill with id '${id}' already exists`));
      }
      throw e;
    }
  });

  // PUT /api/admin/skills/:id — update an existing skill (partial)
  fastify.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateSkillSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.message));
    }

    const fields = parsed.data;
    const keys = Object.keys(fields).filter(k => k !== 'id');
    if (keys.length === 0) {
      return reply.code(400).send(err('INVALID_INPUT', 'No fields to update'));
    }

    const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`);
    setClauses.push(`updated_at = EXTRACT(EPOCH FROM NOW())`);

    const values = keys.map(k => {
      const v = (fields as any)[k];
      if (k === 'config_schema') return JSON.stringify(v);
      return v;
    });

    const result = await pool.query(
      `UPDATE skills SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );

    if (!result.rows.length) {
      return reply.code(404).send(err('NOT_FOUND', 'Skill not found'));
    }

    return ok({ skill: result.rows[0] });
  });

  // DELETE /api/admin/skills/:id — remove a skill
  fastify.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await pool.query('DELETE FROM skills WHERE id = $1', [id]);
    if (!result.rowCount || result.rowCount === 0) {
      return reply.code(404).send(err('NOT_FOUND', 'Skill not found'));
    }
    return ok({ deleted: true });
  });

  // PUT /api/admin/skills/:id/toggle — toggle enabled state (backward compatibility)
  fastify.put('/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = (await pool.query('SELECT enabled FROM skills WHERE id = $1', [id])).rows[0] as { enabled: number } | undefined;
    if (!row) {
      return reply.code(404).send(err('NOT_FOUND', 'Skill not found'));
    }
    const newEnabled = row.enabled ? 0 : 1;
    await pool.query('UPDATE skills SET enabled = $1, updated_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $2', [newEnabled, id]);
    return ok({ id, enabled: newEnabled });
  });
}
