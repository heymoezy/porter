import { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';
import { sqlite } from '../db/client.js';

export default async function skillsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/skills — all skills grouped by skill_name with agent counts
  fastify.get('/', async () => {
    try {
      // Get all skills with their agent info
      const rows = sqlite.prepare(`
        SELECT ps.skill_name, ps.enabled, ps.persona_id, p.name as persona_name, p.role as persona_role
        FROM persona_skills ps
        LEFT JOIN personas p ON p.id = ps.persona_id
        ORDER BY ps.skill_name, p.name
      `).all() as Array<{
        skill_name: string;
        enabled: number;
        persona_id: string;
        persona_name: string | null;
        persona_role: string | null;
      }>;

      // Group by skill
      const skillMap = new Map<string, {
        name: string;
        agents: Array<{ id: string; name: string; role: string; enabled: boolean }>;
      }>();

      for (const r of rows) {
        if (!skillMap.has(r.skill_name)) {
          skillMap.set(r.skill_name, { name: r.skill_name, agents: [] });
        }
        skillMap.get(r.skill_name)!.agents.push({
          id: r.persona_id,
          name: r.persona_name || r.persona_id,
          role: r.persona_role || '',
          enabled: !!r.enabled,
        });
      }

      const skills = Array.from(skillMap.values()).sort((a, b) =>
        b.agents.length - a.agents.length || a.name.localeCompare(b.name)
      );

      return ok({
        skills,
        totalSkills: skills.length,
        totalAssignments: rows.length,
      });
    } catch {
      return ok({ skills: [], totalSkills: 0, totalAssignments: 0 });
    }
  });

  // PUT /api/admin/skills/:personaId/:skillName/toggle — toggle skill enabled state
  fastify.put('/:personaId/:skillName/toggle', async (req) => {
    const { personaId, skillName } = req.params as { personaId: string; skillName: string };
    const row = sqlite.prepare('SELECT enabled FROM persona_skills WHERE persona_id = ? AND skill_name = ?').get(personaId, skillName) as { enabled: number } | undefined;
    if (!row) return ok({ error: 'not_found' });
    const newEnabled = row.enabled ? 0 : 1;
    sqlite.prepare('UPDATE persona_skills SET enabled = ? WHERE persona_id = ? AND skill_name = ?').run(newEnabled, personaId, skillName);
    return ok({ personaId, skillName, enabled: !!newEnabled });
  });
}
