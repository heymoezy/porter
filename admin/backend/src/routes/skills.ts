import { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';
import { queryAll, queryOne, execute } from '../db/pg.js';
import { config } from '../config.js';

// Full skill catalog with descriptions — merged from Porter's sources
const SKILL_CATALOG: Record<string, { name: string; description: string; category: string; source: string }> = {
  'chat-orchestrator': { name: 'Chat Orchestrator', description: 'Keeps conversations lean, turns chat into orchestration moves', category: 'Orchestration', source: 'porter-core' },
  'prompt-architect': { name: 'Prompt Architect', description: 'Repairs weak prompts, sharpens worker briefs before delegation', category: 'Orchestration', source: 'porter-core' },
  'delegation-governor': { name: 'Delegation Governor', description: 'Decides what to delegate vs handle directly', category: 'Orchestration', source: 'porter-core' },
  'project-architect': { name: 'Project Architect', description: 'Shapes new projects, scope boundaries, execution lanes', category: 'Orchestration', source: 'porter-core' },
  'project-lineage': { name: 'Project Lineage', description: 'Keeps context attached to the right project lane over time', category: 'Orchestration', source: 'porter-core' },
  'worker-architect': { name: 'Worker Architect', description: 'Designs the right worker role and loadout for tasks', category: 'Orchestration', source: 'porter-core' },
  'handoff-director': { name: 'Handoff Director', description: 'Manages handoffs between workers without dropped context', category: 'Orchestration', source: 'porter-core' },
  'approval-governor': { name: 'Approval Governor', description: 'Applies approval gates before roster/structure changes', category: 'Orchestration', source: 'porter-core' },
  'roster-curator': { name: 'Roster Curator', description: 'Keeps worker roster clean — reuse over sprawl', category: 'Orchestration', source: 'porter-core' },
  'directive-librarian': { name: 'Directive Librarian', description: 'Turns memory into reviewed directives, tracks disputed guidance', category: 'Memory', source: 'porter-core' },
  'runtime-selector': { name: 'Runtime Selector', description: 'Chooses the right runtime for each job', category: 'Infrastructure', source: 'porter-core' },
  'memory-curator': { name: 'Memory Curator', description: 'Distills durable directives and learned truths', category: 'Memory', source: 'porter-core' },
  'runtime-auditor': { name: 'Runtime Auditor', description: 'Inspects runtime state, routing pressure, failures', category: 'Infrastructure', source: 'porter-internal' },
  'avatar-art-director': { name: 'Avatar Art Director', description: 'Turns agent role into pixel identity direction', category: 'Creative', source: 'porter-internal' },
  'skill-creator': { name: 'Skill Creator', description: 'Creates specialist worker skills when roster lacks coverage', category: 'Orchestration', source: 'porter-internal' },
  'healthcheck': { name: 'Healthcheck', description: 'Runtime, service, and environment verification', category: 'Infrastructure', source: 'porter-internal' },
  'tmux': { name: 'Tmux', description: 'Multi-session supervision across worker terminals', category: 'Infrastructure', source: 'porter-internal' },
  'humor-writer': { name: 'Humor Writer', description: 'Writes short, high-hit-rate jokes matched to tone and audience', category: 'Writing', source: 'porter-curated' },
  'project-operator': { name: 'Project Operator', description: 'Keeps worker aligned to assigned tasks and timing', category: 'Operations', source: 'porter-curated' },
  'content-writer': { name: 'Content Writer', description: 'Drafts concise written output matched to brief and audience', category: 'Writing', source: 'porter-curated' },
  'research-analyst': { name: 'Research Analyst', description: 'Reduces uncertainty quickly with decision-useful findings', category: 'Research', source: 'porter-curated' },
  'design-critic': { name: 'Design Critic', description: 'Reviews visual work for clarity and consistency', category: 'Design', source: 'porter-curated' },
  'quality-reviewer': { name: 'Quality Reviewer', description: 'Checks work for regressions and defects before signoff', category: 'Quality', source: 'porter-curated' },
  'code-implementer': { name: 'Code Implementer', description: 'Turns requirements into working code changes', category: 'Development', source: 'porter-curated' },
  'coding-agent': { name: 'Coding Agent', description: 'Delegated implementation lane for real code execution', category: 'Development', source: 'runtime' },
  'github': { name: 'GitHub', description: 'Repository, branch, and pull request coordination', category: 'Development', source: 'runtime' },
  'gh-issues': { name: 'GitHub Issues', description: 'Issue intake, triage, and queue shaping', category: 'Development', source: 'runtime' },
  'gemini': { name: 'Gemini', description: 'Deep research and long-context investigation', category: 'AI & LLM', source: 'runtime' },
  'gog': { name: 'GoG', description: 'Fast retrieval and structured lookup for docs and assets', category: 'Research', source: 'runtime' },
  'weather': { name: 'Weather', description: 'External environment signal (example skill)', category: 'Other', source: 'runtime' },
};

export default async function skillsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/skills — full skill catalog with assignments, descriptions, categories
  fastify.get('/', async () => {
    try {
      const rows = await queryAll<{
        skill_name: string;
        enabled: number;
        persona_id: string;
        persona_name: string | null;
        persona_role: string | null;
      }>(`
        SELECT ps.skill_name, ps.enabled, ps.persona_id, p.name as persona_name, p.role as persona_role
        FROM persona_skills ps
        LEFT JOIN personas p ON p.id = ps.persona_id
        ORDER BY ps.skill_name, p.name
      `);

      // Group by skill with catalog enrichment
      const skillMap = new Map<string, {
        id: string;
        name: string;
        description: string;
        category: string;
        source: string;
        agents: Array<{ id: string; name: string; role: string; enabled: boolean }>;
      }>();

      // First, seed from catalog (includes unassigned skills)
      for (const [id, meta] of Object.entries(SKILL_CATALOG)) {
        skillMap.set(id, { id, ...meta, agents: [] });
      }

      // Then overlay assignments
      for (const r of rows) {
        if (!skillMap.has(r.skill_name)) {
          skillMap.set(r.skill_name, {
            id: r.skill_name,
            name: r.skill_name,
            description: '',
            category: 'Unknown',
            source: 'detected',
            agents: [],
          });
        }
        skillMap.get(r.skill_name)!.agents.push({
          id: r.persona_id,
          name: r.persona_name || r.persona_id,
          role: r.persona_role || '',
          enabled: !!r.enabled,
        });
      }

      const skills = Array.from(skillMap.values()).sort((a, b) =>
        a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
      );

      // Category summary
      const categories: Record<string, number> = {};
      for (const s of skills) categories[s.category] = (categories[s.category] || 0) + 1;

      // Source summary
      const sources: Record<string, number> = {};
      for (const s of skills) sources[s.source] = (sources[s.source] || 0) + 1;

      return ok({
        skills,
        totalSkills: skills.length,
        totalAssignments: rows.length,
        assignedSkills: new Set(rows.map(r => r.skill_name)).size,
        categories,
        sources,
      });
    } catch {
      return ok({ skills: [], totalSkills: 0, totalAssignments: 0, assignedSkills: 0, categories: {}, sources: {} });
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
