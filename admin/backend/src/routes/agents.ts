import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { sqlite } from '../db/client.js';
import { config } from '../config.js';
import { getAgentTasks, getAgentTaskStats } from '../services/customer-intel.js';
import fs from 'fs';
import path from 'path';

const IDENTITY_FILES = ['SOUL.md', 'IDENTITY.md', 'ROLE_CARD.md', 'SKILLS.md', 'DELIVERABLES.md', 'USER.md', 'MEMORY.md'];

function readPersonaFile(personaId: string, file: string): string | null {
  try {
    return fs.readFileSync(path.join(config.personasDir, personaId, file), 'utf-8');
  } catch { return null; }
}

function writePersonaFile(personaId: string, file: string, content: string) {
  const dir = path.join(config.personasDir, personaId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), content, 'utf-8');
}

export default async function agentsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/agents — list all personas with skills, files, deployment
  fastify.get('/', async () => {
    try {
      const personas = sqlite.prepare(`
        SELECT id, name, role, avatar, preferred_backend, status, agent_group,
               is_system, is_locked, is_master, owner, appearance_style, appearance_spec,
               dispatch_mode, created_at, last_active
        FROM personas WHERE id != 'porter-core' ORDER BY sort_order, name
      `).all() as Array<Record<string, unknown>>;

      // Skills per persona
      const allSkills = sqlite.prepare(
        'SELECT persona_id, skill_name, enabled FROM persona_skills'
      ).all() as Array<{ persona_id: string; skill_name: string; enabled: number }>;
      const skillMap = new Map<string, Array<{ name: string; enabled: boolean }>>();
      for (const s of allSkills) {
        if (!skillMap.has(s.persona_id)) skillMap.set(s.persona_id, []);
        skillMap.get(s.persona_id)!.push({ name: s.skill_name, enabled: !!s.enabled });
      }

      // Project deployments per persona
      let deployMap = new Map<string, number>();
      try {
        const deps = sqlite.prepare(
          'SELECT persona_id, count(*) as cnt FROM project_collaborators GROUP BY persona_id'
        ).all() as Array<{ persona_id: string; cnt: number }>;
        for (const d of deps) deployMap.set(d.persona_id, d.cnt);
      } catch { /* table may not exist */ }

      // Identity files existence check
      const agents = personas.map(p => {
        const id = p.id as string;
        const dir = path.join(config.personasDir, id);
        let fileCount = 0;
        try {
          const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
          fileCount = files.length;
        } catch {}

        return {
          ...p,
          skills: skillMap.get(id) || [],
          skillCount: (skillMap.get(id) || []).length,
          deployments: deployMap.get(id) || 0,
          fileCount,
        };
      });

      return ok({
        agents,
        total: agents.length,
        system: agents.filter(a => a.is_system).length,
        user: agents.filter(a => !a.is_system).length,
      });
    } catch (e) {
      return ok({ agents: [], total: 0, system: 0, user: 0 });
    }
  });

  // GET /api/admin/agents/:id — full agent detail with .md files
  fastify.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const persona = sqlite.prepare('SELECT * FROM personas WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!persona) {
      reply.status(404);
      return err('NOT_FOUND', `Agent ${id} not found`);
    }

    // Read all .md files
    const files: Record<string, string | null> = {};
    for (const file of IDENTITY_FILES) {
      files[file] = readPersonaFile(id, file);
    }

    // Skills
    const skills = sqlite.prepare(
      'SELECT skill_name, enabled, assigned_at FROM persona_skills WHERE persona_id = ?'
    ).all(id) as Array<{ skill_name: string; enabled: number; assigned_at: number }>;

    // Project deployments
    let projects: Array<{ project_id: string; project_name: string; role: string }> = [];
    try {
      projects = sqlite.prepare(`
        SELECT pc.project_id, p.name as project_name, pc.access_mode as role
        FROM project_collaborators pc
        LEFT JOIN projects p ON p.id = pc.project_id
        WHERE pc.persona_id = ?
      `).all(id) as typeof projects;
    } catch { /* table may not exist */ }

    // Recent activity
    let recentMessages = 0;
    try {
      recentMessages = (sqlite.prepare(
        "SELECT count(*) as c FROM agent_messages WHERE persona_id = ? AND created_at > unixepoch('now') - 604800"
      ).get(id) as { c: number })?.c || 0;
    } catch {}

    // Feedback signals (from memories/signals)
    let signalCount = 0;
    try {
      signalCount = (sqlite.prepare(
        "SELECT count(*) as c FROM memories WHERE persona_id = ? AND layer = 'signal'"
      ).get(id) as { c: number })?.c || 0;
    } catch {}

    return ok({
      persona,
      files,
      skills: skills.map(s => ({ name: s.skill_name, enabled: !!s.enabled, assignedAt: s.assigned_at })),
      projects,
      metrics: { recentMessages, signalCount },
    });
  });

  // PUT /api/admin/agents/:id/files/:filename — edit agent .md file
  fastify.put('/:id/files/:filename', async (req, reply) => {
    const { id, filename } = req.params as { id: string; filename: string };
    if (!IDENTITY_FILES.includes(filename)) {
      reply.status(400);
      return err('INVALID_FILE', `Allowed: ${IDENTITY_FILES.join(', ')}`);
    }
    const { content } = req.body as { content: string };
    if (typeof content !== 'string') {
      reply.status(400);
      return err('INVALID_BODY', 'Body must contain { content: string }');
    }
    try {
      writePersonaFile(id, filename, content);
      return ok({ id, file: filename, size: content.length });
    } catch (e) {
      reply.status(500);
      return err('WRITE_FAILED', (e as Error).message);
    }
  });

  // ── Admin AI Task Queue (retained) ──────────────────────

  // GET /api/admin/agents/tasks — admin AI agent task queue
  fastify.get('/tasks', async () => {
    const stats = getAgentTaskStats();
    const tasks = getAgentTasks(50);
    return ok({ stats, tasks });
  });

  // POST /api/admin/agents/tasks/:taskId/execute
  fastify.post('/tasks/:taskId/execute', async (req) => {
    const { taskId } = req.params as { taskId: string };
    sqlite.prepare("UPDATE admin_agent_tasks SET status = 'running', started_at = unixepoch('now') WHERE id = ? AND status = 'queued'").run(taskId);
    sqlite.prepare("UPDATE admin_agent_tasks SET status = 'completed', completed_at = unixepoch('now'), result = 'Executed by admin' WHERE id = ? AND status = 'running'").run(taskId);
    return ok({ executed: taskId });
  });

  // POST /api/admin/agents/tasks/:taskId/skip
  fastify.post('/tasks/:taskId/skip', async (req) => {
    const { taskId } = req.params as { taskId: string };
    sqlite.prepare("UPDATE admin_agent_tasks SET status = 'skipped', completed_at = unixepoch('now') WHERE id = ? AND status = 'queued'").run(taskId);
    return ok({ skipped: taskId });
  });
}
