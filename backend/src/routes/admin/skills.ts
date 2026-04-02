import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/admin-envelope.js';
import { queryAll, queryOne, execute } from '../../db/pg-helpers.js';
import { proxyToAdmin } from '../../lib/admin-proxy.js';

interface SkillRow {
  id: string; name: string; description: string; category: string; source: string;
  enabled: number; visible: number; featured: number;
  icon: string; color: string; short_label: string;
  sort_order: number; featured_order: number;
  pack_status: string;
  tags: string | null;
  template_count: number; agent_count: number;
}

export default async function skillsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // ── List ────────────────────────────────────────────────
  fastify.get('/', async (req) => {
    try {
      const qs = req.query as Record<string, string | undefined>;
      const searchQ = qs.search?.trim().toLowerCase();
      const categoryQ = qs.category?.trim();
      const featuredQ = qs.featured === 'true';
      const packStatusQ = qs.packStatus?.trim();

      const rows = await queryAll<SkillRow>(`
        SELECT s.*,
          COALESCE((SELECT COUNT(*) FROM template_skills ts WHERE ts.skill_id = s.id), 0)::int AS template_count,
          COALESCE((SELECT COUNT(*) FROM persona_skills ps WHERE ps.skill_name = s.id AND ps.enabled = 1), 0)::int AS agent_count
        FROM skills s
        ORDER BY s.featured DESC, s.featured_order, s.sort_order, s.name
      `);

      const assignments = await queryAll<{
        skill_name: string; persona_id: string; enabled: number;
        name: string | null; role: string | null;
      }>(`
        SELECT ps.skill_name, ps.persona_id, ps.enabled, p.name, p.role
        FROM persona_skills ps
        LEFT JOIN personas p ON p.id = ps.persona_id
        ORDER BY ps.skill_name, p.name
      `);

      const bySkill = new Map<string, Array<{ id: string; name: string; role: string; enabled: boolean }>>();
      for (const a of assignments) {
        const list = bySkill.get(a.skill_name) ?? [];
        list.push({ id: a.persona_id, name: a.name || a.persona_id, role: a.role || '', enabled: !!a.enabled });
        bySkill.set(a.skill_name, list);
      }

      // Parse tags from jsonb
      function parseTags(raw: string | null): string[] {
        if (!raw) return [];
        try { return Array.isArray(raw) ? raw : JSON.parse(raw); } catch { return []; }
      }

      let skills = rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        category: row.category || 'Unknown',
        source: row.source || 'detected',
        enabled: !!row.enabled,
        visible: !!row.visible,
        featured: !!row.featured,
        icon: row.icon || '',
        color: row.color || '',
        short_label: row.short_label || '',
        sort_order: row.sort_order ?? 50,
        featured_order: row.featured_order ?? 0,
        pack_status: row.pack_status || 'missing',
        tags: parseTags(row.tags),
        template_count: row.template_count ?? 0,
        agent_count: row.agent_count ?? 0,
        agents: bySkill.get(row.id) ?? [],
      }));

      // Build allTags from full set before filtering
      const allTags: Record<string, number> = {};
      for (const s of skills) {
        for (const t of s.tags) {
          allTags[t] = (allTags[t] || 0) + 1;
        }
      }

      // Apply filters
      if (categoryQ) skills = skills.filter(s => s.category === categoryQ);
      if (featuredQ) skills = skills.filter(s => s.featured);
      if (packStatusQ) skills = skills.filter(s => s.pack_status === packStatusQ);
      if (searchQ) {
        skills = skills.filter(s =>
          s.name.toLowerCase().includes(searchQ) ||
          s.description.toLowerCase().includes(searchQ) ||
          s.id.toLowerCase().includes(searchQ) ||
          s.tags.some(t => t.toLowerCase().includes(searchQ))
        );
      }

      const categories: Record<string, number> = {};
      const sources: Record<string, number> = {};
      const packStatuses: Record<string, number> = {};
      for (const s of skills) {
        categories[s.category] = (categories[s.category] || 0) + 1;
        sources[s.source] = (sources[s.source] || 0) + 1;
        packStatuses[s.pack_status] = (packStatuses[s.pack_status] || 0) + 1;
      }

      return ok({
        skills,
        totalSkills: skills.length,
        visibleSkills: skills.filter(s => s.visible).length,
        featuredSkills: skills.filter(s => s.featured).length,
        assignedSkills: skills.filter(s => s.agent_count > 0).length,
        totalAssignments: assignments.length,
        totalTemplatesUsingSkills: skills.reduce((sum, s) => sum + s.template_count, 0),
        categories,
        sources,
        packStatuses,
        allTags,
      });
    } catch {
      return ok({ skills: [], totalSkills: 0, visibleSkills: 0, featuredSkills: 0, assignedSkills: 0, totalAssignments: 0, totalTemplatesUsingSkills: 0, categories: {}, sources: {}, packStatuses: {}, allTags: {} });
    }
  });

  // ── Create ──────────────────────────────────────────────
  fastify.post('/', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const id = String(body.id || '').trim();
    const name = String(body.name || '').trim();
    if (!id || !name) { reply.status(400); return err('INVALID', 'id and name required'); }

    const exists = await queryOne('SELECT id FROM skills WHERE id = $1', [id]);
    if (exists) { reply.status(409); return err('CONFLICT', `Skill ${id} already exists`); }

    await execute(`
      INSERT INTO skills (id, name, description, category, source, enabled, visible, featured, icon, color, short_label, sort_order, featured_order, pack_status, config_schema)
      VALUES ($1, $2, $3, $4, $5, 1, 1, 0, '', '', '', 50, 0, 'missing', '{}')
    `, [id, name, body.description || '', body.category || 'Unknown', body.source || 'porter-curated']);

    return ok({ id, created: true });
  });

  // ── Update ──────────────────────────────────────────────
  fastify.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const exists = await queryOne('SELECT id FROM skills WHERE id = $1', [id]);
    if (!exists) { reply.status(404); return err('NOT_FOUND', `Skill ${id} not found`); }

    const fields: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const key of ['name', 'description', 'category', 'source', 'icon', 'color', 'short_label']) {
      if (body[key] !== undefined) { fields.push(`${key} = $${idx}`); vals.push(body[key]); idx++; }
    }
    for (const key of ['enabled', 'visible', 'featured']) {
      if (body[key] !== undefined) { fields.push(`${key} = $${idx}`); vals.push(body[key] ? 1 : 0); idx++; }
    }
    for (const key of ['sort_order', 'featured_order']) {
      if (body[key] !== undefined) { fields.push(`${key} = $${idx}`); vals.push(Number(body[key])); idx++; }
    }
    if (body.tags !== undefined) {
      fields.push(`tags = $${idx}`); vals.push(JSON.stringify(body.tags)); idx++;
    }
    if (fields.length === 0) return ok({ id, updated: false });

    fields.push(`updated_at = EXTRACT(EPOCH FROM NOW())`);
    vals.push(id);
    await execute(`UPDATE skills SET ${fields.join(', ')} WHERE id = $${idx}`, vals);
    return ok({ id, updated: true });
  });

  // ── Delete ──────────────────────────────────────────────
  fastify.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = await queryOne('SELECT id FROM skills WHERE id = $1', [id]);
    if (!exists) { reply.status(404); return err('NOT_FOUND', `Skill ${id} not found`); }
    await execute('DELETE FROM persona_skills WHERE skill_name = $1', [id]);
    await execute('DELETE FROM template_skills WHERE skill_id = $1', [id]);
    await execute('DELETE FROM skills WHERE id = $1', [id]);
    return ok({ id, deleted: true });
  });

  // ── Toggle persona assignment ───────────────────────────
  fastify.put('/:personaId/:skillName/toggle', async (req) => {
    const { personaId, skillName } = req.params as { personaId: string; skillName: string };
    const row = await queryOne<{ enabled: number }>('SELECT enabled FROM persona_skills WHERE persona_id = $1 AND skill_name = $2', [personaId, skillName]);
    if (!row) return ok({ error: 'not_found' });
    const newEnabled = row.enabled ? 0 : 1;
    await execute('UPDATE persona_skills SET enabled = $1 WHERE persona_id = $2 AND skill_name = $3', [newEnabled, personaId, skillName]);
    return ok({ personaId, skillName, enabled: !!newEnabled });
  });

  // ── Pack generation proxy (to admin backend) ────────────
  fastify.post('/builder/generate', async (req) => {
    const result = await proxyToAdmin('/api/admin/skills/builder/generate', {
      method: 'POST',
      body: req.body,
      timeout: 30000,
    });
    if (!result.ok) return ok({ error: result.error });
    return ok(result.data);
  });

  fastify.post('/builder/generate-all', async () => {
    const result = await proxyToAdmin('/api/admin/skills/builder/generate-all', {
      method: 'POST',
      timeout: 120000,
    });
    if (!result.ok) return ok({ error: result.error });
    return ok(result.data);
  });

  // ── Import from external repos (proxy to admin backend) ──

  fastify.post('/import/scan', async (req) => {
    const result = await proxyToAdmin('/api/admin/skills/import/scan', {
      method: 'POST',
      body: req.body,
      timeout: 60000,
    });
    if (!result.ok) return ok({ error: result.error });
    return ok(result.data);
  });

  fastify.post('/import/execute', async (req) => {
    const result = await proxyToAdmin('/api/admin/skills/import/execute', {
      method: 'POST',
      body: req.body,
      timeout: 120000,
    });
    if (!result.ok) return ok({ error: result.error });
    return ok(result.data);
  });
}
