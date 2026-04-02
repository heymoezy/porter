import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/admin-envelope.js';
import { config } from '../../config.js';
import { queryAll, queryOne } from '../../db/pg-helpers.js';
import fs from 'fs';
import path from 'path';

const TEMPLATE_FILES = ['SOUL.md', 'IDENTITY.md', 'ROLE_CARD.md', 'SKILLS.md', 'DELIVERABLES.md', 'MISSION.md'];

function templateDir(id: string) { return path.join(config.personasDir, '..', 'templates', id); }

function readTemplateFile(id: string, file: string): string | null {
  try { return fs.readFileSync(path.join(templateDir(id), file), 'utf-8'); }
  catch { return null; }
}

function writeTemplateFile(id: string, file: string, content: string) {
  const dir = templateDir(id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), content, 'utf-8');
}

function parseJson<T>(val: unknown, fallback: T): T {
  if (!val) return fallback;
  if (typeof val !== 'string') return val as T;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  description: string | null;
  tags: string | unknown;
  archetype: string | null;
  appearance_style: string | null;
  appearance_spec: string | unknown;
  communication_style: string | null;
  is_internal: number;
  sort_order: number | null;
}

function formatTemplate(row: TemplateRow) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description ?? '',
    tags: parseJson<string[]>(row.tags, []),
    archetype: row.archetype ?? 'navigator',
    appearance_style: row.appearance_style ?? 'minecraft',
    appearance_spec: parseJson<Record<string, unknown>>(row.appearance_spec, {}),
    communication_style: row.communication_style ?? '',
    is_internal: Boolean(row.is_internal),
  };
}

export default async function templatesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/templates — list all templates from Brain PostgreSQL
  fastify.get('/', async (req) => {
    const cat = (req.query as Record<string, string>).category;

    let sql = 'SELECT id, name, category, description, tags, archetype, appearance_style, appearance_spec, communication_style, is_internal, sort_order FROM agent_templates WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    if (cat) {
      sql += ` AND category = $${idx}`;
      params.push(cat);
      idx++;
    }

    sql += ' ORDER BY sort_order ASC, name ASC';

    const rows = await queryAll<TemplateRow>(sql, params);
    const templates = rows.map(formatTemplate);

    const catCounts: Record<string, number> = {};
    const archetypeCounts: Record<string, number> = {};
    for (const t of templates) {
      catCounts[t.category] = (catCounts[t.category] || 0) + 1;
      archetypeCounts[t.archetype] = (archetypeCounts[t.archetype] || 0) + 1;
    }

    return ok({
      templates,
      count: templates.length,
      categories: catCounts,
      archetypes: archetypeCounts,
    });
  });

  // GET /api/admin/templates/stats — category/archetype distribution
  fastify.get('/stats', async () => {
    const rows = await queryAll<{ category: string; archetype: string; count: number }>(`
      SELECT category, archetype, COUNT(*)::int as count
      FROM agent_templates
      GROUP BY category, archetype
      ORDER BY category, archetype
    `);

    const catCounts: Record<string, number> = {};
    const archetypeCounts: Record<string, number> = {};
    let total = 0;

    for (const row of rows) {
      const n = row.count;
      total += n;
      catCounts[row.category] = (catCounts[row.category] || 0) + n;
      archetypeCounts[row.archetype] = (archetypeCounts[row.archetype] || 0) + n;
    }

    return ok({ total, categories: catCounts, archetypes: archetypeCounts });
  });

  // GET /api/admin/templates/:id/workshop — RPG build data for the Workshop tab
  interface SupportEntry { id: string; target_skill?: string; prompt_diff?: string; measured_impact?: string }
  interface TemplateSkillRow { skill_id: string; sort_order: number | null; success_rate_30d: number | null; total_uses: number | null; last_used: number | null }
  interface WorkshopTemplateRow { id: string; name: string; star_level: number | null; level: number | null; xp: number | null; rarity: string | null; shell: string | null; elo_rating: number | null; intelligence: unknown; supports: unknown; equipment_slots: unknown; passive_tree: unknown }
  fastify.get('/:id/workshop', async (req, reply) => {
    const { id } = req.params as { id: string };

    const row = await queryOne<WorkshopTemplateRow>(
      `SELECT id, name, star_level, level, xp, rarity, shell, elo_rating, intelligence, supports, equipment_slots, passive_tree
       FROM agent_templates WHERE id = $1`,
      [id]
    );

    if (!row) {
      reply.status(404);
      return err('NOT_FOUND', `Template ${id} not found`);
    }

    const skills = await queryAll<TemplateSkillRow>(
      `SELECT ts.skill_id, ts.sort_order, ts.success_rate_30d, ts.total_uses, ts.last_used
       FROM template_skills ts
       WHERE ts.template_id = $1
       ORDER BY ts.sort_order ASC, ts.skill_id ASC`,
      [id]
    );

    const starLevel = row.star_level ?? 1;

    return ok({
      id: row.id,
      name: row.name,
      star_level: starLevel,
      level: row.level ?? 1,
      xp: row.xp ?? 0,
      rarity: row.rarity ?? 'common',
      shell: row.shell ?? 'builder',
      elo_rating: row.elo_rating ?? 1200,
      intelligence: parseJson(row.intelligence, {}),
      supports: parseJson<SupportEntry[]>(row.supports, []),
      equipment_slots: parseJson(row.equipment_slots, []),
      passive_tree: parseJson(row.passive_tree, []),
      skill_slots: Math.max(4, 4 + (starLevel - 1)),
      skills: skills.map(s => ({
        skill_id: s.skill_id,
        sort_order: s.sort_order ?? 0,
        success_rate_30d: s.success_rate_30d ?? 0,
        total_uses: s.total_uses ?? 0,
        last_used: s.last_used ?? null,
      })),
    });
  });

  // GET /api/admin/templates/:id/instances — personas created from this template
  fastify.get('/:id/instances', async (req) => {
    const { id } = req.params as { id: string };
    const rows = await queryAll<{
      id: string; name: string; role: string; status: string;
      created_at: string; last_active: string | null; avatar: string | null;
      appearance_spec: unknown; soul_hash: string | null;
    }>(
      `SELECT id, name, role, status, created_at, last_active, avatar, appearance_spec, soul_hash
       FROM personas WHERE template_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    return ok({ instances: rows });
  });

  // GET /api/admin/templates/:id — single template with .md files
  fastify.get('/:id', async (req) => {
    const { id } = req.params as { id: string };

    const row = await queryOne<TemplateRow & Record<string, unknown>>(
      'SELECT * FROM agent_templates WHERE id = $1',
      [id]
    );

    if (!row) {
      return err('NOT_FOUND', `Template ${id} not found`);
    }
    const template = formatTemplate(row);

    const files: Record<string, string | null> = {};
    for (const file of TEMPLATE_FILES) {
      files[file] = readTemplateFile(id, file);
    }

    return ok({ ...template, files });
  });

  // PUT /api/admin/templates/:id/files/:filename — edit template .md file
  fastify.put('/:id/files/:filename', async (req, reply) => {
    const { id, filename } = req.params as { id: string; filename: string };
    if (!TEMPLATE_FILES.includes(filename)) {
      reply.status(400);
      return err('INVALID_FILE', `Allowed: ${TEMPLATE_FILES.join(', ')}`);
    }
    const { content } = req.body as { content: string };
    if (typeof content !== 'string') {
      reply.status(400);
      return err('INVALID_BODY', 'Body must contain { content: string }');
    }
    try {
      writeTemplateFile(id, filename, content);
      return ok({ id, file: filename, size: content.length });
    } catch (e) {
      reply.status(500);
      return err('WRITE_FAILED', (e as Error).message);
    }
  });
}
