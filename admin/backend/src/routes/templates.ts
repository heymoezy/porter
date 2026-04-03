import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { config } from '../config.js';
import { queryAll, queryOne, execute } from '../db/pg.js';
import fs from 'fs';
import path from 'path';

const TEMPLATE_FILES = ['SOUL.md', 'IDENTITY.md', 'ROLE_CARD.md', 'SKILLS.md', 'TOOLS.md', 'HEARTBEAT.md'];

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
  lifecycle: string | null;
  heartbeat_interval: number | null;
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
    lifecycle: row.lifecycle ?? 'one-shot',
    heartbeat_interval: row.heartbeat_interval ?? null,
  };
}

// ── Preview scoring constants (replicates skill-selector.ts) ─────────────────
const SCORE_THRESHOLD = 1;
const MAX_SELECTED = 3;
const SKILLS_ROOT = process.env.PORTER_SKILLS_DIR || '/home/lobster/documents/porter/skills';

function scoreSkillInline(
  taskWords: Set<string>,
  skill: { name: string; description: string; tags: string[]; triggers: string[] }
): { score: number; reason: string } {
  let score = 0;
  const matched: string[] = [];

  const descLower = skill.description.toLowerCase();
  const nameParts = skill.name.toLowerCase().split('-');
  const tagsLower = (skill.tags || []).map((t: string) => t.toLowerCase());
  const triggersLower = (skill.triggers || []).map((t: string) => t.toLowerCase());

  for (const word of taskWords) {
    if (word.length < 3) continue;

    if (descLower.includes(word)) {
      score += 2;
      if (!matched.includes(word)) matched.push(word);
    }

    for (const tag of tagsLower) {
      if (tag.includes(word) || word.includes(tag)) {
        score += 3;
        if (!matched.includes(tag)) matched.push(tag);
        break;
      }
    }

    for (const trigger of triggersLower) {
      if (trigger.includes(word) || word.includes(trigger)) {
        score += 3;
        if (!matched.includes(trigger)) matched.push(trigger);
        break;
      }
    }

    for (const part of nameParts) {
      if (part.length >= 3 && (part.includes(word) || word.includes(part))) {
        score += 1;
        if (!matched.includes(part)) matched.push(part);
        break;
      }
    }
  }

  const reason = matched.length > 0
    ? `matched: ${[...new Set(matched)].join(', ')}`
    : 'no match';

  return { score, reason };
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

  // FBK-04: Per-template aggregated skill effectiveness across all spawned agents
  fastify.get('/:id/skill-effectiveness', async (req, _reply) => {
    const { id } = req.params as { id: string };
    const rows = await queryAll(
      `SELECT ts.skill_id, s.name AS skill_name,
              SUM(COALESCE(ps.times_selected, 0))::int AS times_selected,
              SUM(COALESCE(ps.positive_feedback_count, 0))::int AS positive_count,
              SUM(COALESCE(ps.negative_feedback_count, 0))::int AS negative_count,
              CASE
                WHEN SUM(COALESCE(ps.positive_feedback_count, 0) + COALESCE(ps.negative_feedback_count, 0)) > 0
                THEN ROUND(SUM(COALESCE(ps.positive_feedback_count, 0))::numeric /
                     SUM(COALESCE(ps.positive_feedback_count, 0) + COALESCE(ps.negative_feedback_count, 0))::numeric, 3)
                ELSE NULL
              END AS effectiveness_score
       FROM template_skills ts
       JOIN skills s ON s.id = ts.skill_id
       LEFT JOIN personas p ON p.template_id = $1
       LEFT JOIN persona_skills ps ON ps.persona_id = p.id AND COALESCE(ps.skill_id, ps.skill_name) = ts.skill_id
       WHERE ts.template_id = $1
       GROUP BY ts.skill_id, s.name
       ORDER BY effectiveness_score DESC NULLS LAST`,
      [id]
    );
    return ok({ template_id: id, skills: rows });
  });

  // ── TUX-01: GET /api/admin/templates/:id/skills ──────────────────────────
  // Returns all skills assigned to the template with quality metadata.
  fastify.get('/:id/skills', async (req) => {
    const { id } = req.params as { id: string };
    const rows = await queryAll(
      `SELECT ts.skill_id, ts.sort_order, ts.is_mandatory, ts.assignment_rationale,
              s.name, s.description, s.category, s.quality_tier, s.quality_score
       FROM template_skills ts
       JOIN skills s ON s.id = ts.skill_id
       WHERE ts.template_id = $1
       ORDER BY ts.sort_order ASC, s.name ASC`,
      [id]
    );
    return ok({ template_id: id, skills: rows });
  });

  // ── TUX-05: POST /api/admin/templates/:id/skills-preview ─────────────────
  // Returns ranked skill candidates for a sample prompt.
  // Registered before POST /:id/skills to avoid path collision.
  fastify.post('/:id/skills-preview', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { prompt: taskText } = req.body as { prompt?: string };
    if (!taskText || typeof taskText !== 'string') {
      reply.status(400);
      return err('INVALID_BODY', 'Body must contain { prompt: string }');
    }

    // Load assigned skills for this template
    const assignedRows = await queryAll<{
      skill_id: string;
      name: string;
      description: string;
      is_mandatory: number;
    }>(
      `SELECT ts.skill_id, ts.is_mandatory, s.name, s.description
       FROM template_skills ts
       JOIN skills s ON s.id = ts.skill_id
       WHERE ts.template_id = $1`,
      [id]
    );

    const taskWords = new Set(
      taskText.toLowerCase().split(/[\s\p{P}]+/u).filter((w: string) => w.length >= 3)
    );

    const candidates: Array<{
      skill_id: string;
      name: string;
      score: number;
      reason: string;
      is_mandatory: number;
    }> = [];

    for (const row of assignedRows) {
      // Try to load tags/triggers from skill.json on disk
      let tags: string[] = [];
      let triggers: string[] = [];
      try {
        const metaPath = path.join(SKILLS_ROOT, row.skill_id, 'meta', 'skill.json');
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          tags = Array.isArray(meta.tags) ? meta.tags : [];
          triggers = Array.isArray(meta.triggers) ? meta.triggers : [];
        }
      } catch {
        // No meta file — score on name/description only
      }

      const { score, reason } = scoreSkillInline(taskWords, {
        name: row.name,
        description: row.description || '',
        tags,
        triggers,
      });

      candidates.push({
        skill_id: row.skill_id,
        name: row.name,
        score,
        reason,
        is_mandatory: row.is_mandatory,
      });
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Selected: mandatory skills always included, then top scorers up to MAX_SELECTED
    const mandatory = candidates.filter(c => c.is_mandatory === 1);
    const scored = candidates.filter(
      c => c.is_mandatory !== 1 && c.score >= SCORE_THRESHOLD
    );

    const mandatoryIds = new Set(mandatory.map(c => c.skill_id));
    const top = scored.filter(c => !mandatoryIds.has(c.skill_id)).slice(0, Math.max(0, MAX_SELECTED - mandatory.length));
    const selected = [...mandatory, ...top];

    return ok({ candidates, selected, prompt: taskText });
  });

  // ── TUX-02: POST /api/admin/templates/:id/skills ─────────────────────────
  // Attaches a skill to the template with auto-incremented sort_order.
  fastify.post('/:id/skills', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { skill_id, is_mandatory = 0, assignment_rationale = '' } = req.body as {
      skill_id?: string;
      is_mandatory?: number;
      assignment_rationale?: string;
    };
    if (!skill_id) {
      reply.status(400);
      return err('INVALID_BODY', 'Body must contain { skill_id: string }');
    }

    const maxRow = await queryOne<{ max: number | null }>(
      `SELECT MAX(sort_order) AS max FROM template_skills WHERE template_id = $1`,
      [id]
    );
    const nextOrder = (maxRow?.max ?? -1) + 1;

    await execute(
      `INSERT INTO template_skills (template_id, skill_id, sort_order, is_mandatory, assignment_rationale)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (template_id, skill_id) DO NOTHING`,
      [id, skill_id, nextOrder, is_mandatory, assignment_rationale]
    );

    return ok({ attached: true, template_id: id, skill_id });
  });

  // ── TUX-02: DELETE /api/admin/templates/:id/skills/:skillId ──────────────
  // Detaches a skill and re-normalizes sort_order.
  fastify.delete('/:id/skills/:skillId', async (req) => {
    const { id, skillId } = req.params as { id: string; skillId: string };

    await execute(
      `DELETE FROM template_skills WHERE template_id = $1 AND skill_id = $2`,
      [id, skillId]
    );

    // Re-normalize sort_order for remaining skills
    await execute(
      `UPDATE template_skills SET sort_order = sub.rn
       FROM (
         SELECT skill_id, ROW_NUMBER() OVER (ORDER BY sort_order) - 1 AS rn
         FROM template_skills WHERE template_id = $1
       ) sub
       WHERE template_skills.skill_id = sub.skill_id
         AND template_skills.template_id = $1`,
      [id]
    );

    return ok({ detached: true, template_id: id, skill_id: skillId });
  });

  // ── TUX-03: PATCH /api/admin/templates/:id/skills/:skillId ───────────────
  // Updates is_mandatory, assignment_rationale, or sort_order fields.
  fastify.patch('/:id/skills/:skillId', async (req, reply) => {
    const { id, skillId } = req.params as { id: string; skillId: string };
    const body = req.body as Record<string, unknown>;

    const allowed = ['is_mandatory', 'assignment_rationale', 'sort_order'];
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const field of allowed) {
      if (field in body) {
        setClauses.push(`${field} = $${idx}`);
        params.push(body[field]);
        idx++;
      }
    }

    if (setClauses.length === 0) {
      reply.status(400);
      return err('INVALID_BODY', 'No updatable fields provided');
    }

    params.push(id, skillId);
    await execute(
      `UPDATE template_skills SET ${setClauses.join(', ')}
       WHERE template_id = $${idx} AND skill_id = $${idx + 1}`,
      params
    );

    return ok({ updated: true, template_id: id, skill_id: skillId });
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

  // GET /api/admin/templates/:id/instances — personas created from this template
  fastify.get('/:id/instances', async (req) => {
    const { id } = req.params as { id: string };
    const rows = await queryAll<{
      id: string; name: string; role: string; status: string;
      created_at: string; last_active: string | null; avatar: string | null;
    }>(
      `SELECT id, name, role, status, created_at, last_active, avatar
       FROM personas WHERE template_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    return ok({ instances: rows });
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
