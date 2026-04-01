import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryAll, queryOne, execute } from '../../db/pg-helpers.js';

interface SkillRow {
  id: string; name: string; description: string; category: string; source: string;
  enabled: number; visible: number; featured: number;
  icon: string; color: string; short_label: string;
  sort_order: number; featured_order: number;
  template_count: number; agent_count: number;
}

export default async function skillsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/skills — full skill library from skills table + assignments
  fastify.get('/', async () => {
    try {
      const rows = await queryAll<SkillRow>(`
        SELECT s.*,
          COALESCE((SELECT COUNT(*) FROM template_skills ts WHERE ts.skill_id = s.id), 0)::int AS template_count,
          COALESCE((SELECT COUNT(*) FROM persona_skills ps WHERE ps.skill_name = s.id AND ps.enabled = 1), 0)::int AS agent_count
        FROM skills s
        ORDER BY s.featured DESC, s.featured_order, s.sort_order, s.name
      `);

      // Persona assignments
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

      const skills = rows.map(row => ({
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
        template_count: row.template_count ?? 0,
        agent_count: row.agent_count ?? 0,
        agents: bySkill.get(row.id as string) ?? [],
      }));

      const categories: Record<string, number> = {};
      const sources: Record<string, number> = {};
      for (const s of skills) {
        categories[s.category] = (categories[s.category] || 0) + 1;
        sources[s.source] = (sources[s.source] || 0) + 1;
      }

      return ok({
        skills,
        totalSkills: skills.length,
        visibleSkills: skills.filter(s => s.visible).length,
        featuredSkills: skills.filter(s => s.featured).length,
        assignedSkills: skills.filter(s => s.agent_count > 0).length,
        totalAssignments: assignments.length,
        totalTemplatesUsingSkills: skills.reduce((sum, s) => sum + (s.template_count as number), 0),
        categories,
        sources,
      });
    } catch {
      return ok({ skills: [], totalSkills: 0, visibleSkills: 0, featuredSkills: 0, assignedSkills: 0, totalAssignments: 0, totalTemplatesUsingSkills: 0, categories: {}, sources: {} });
    }
  });

  // PUT /api/admin/skills/:personaId/:skillName/toggle
  fastify.put('/:personaId/:skillName/toggle', async (req) => {
    const { personaId, skillName } = req.params as { personaId: string; skillName: string };
    const row = await queryOne<{ enabled: number }>('SELECT enabled FROM persona_skills WHERE persona_id = $1 AND skill_name = $2', [personaId, skillName]);
    if (!row) return ok({ error: 'not_found' });
    const newEnabled = row.enabled ? 0 : 1;
    await execute('UPDATE persona_skills SET enabled = $1 WHERE persona_id = $2 AND skill_name = $3', [newEnabled, personaId, skillName]);
    return ok({ personaId, skillName, enabled: !!newEnabled });
  });
}
