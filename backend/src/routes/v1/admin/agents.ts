import { FastifyInstance } from 'fastify';
import { ok, err } from '../../../lib/envelope.js';
import { pool } from '../../../db/client.js';
import { config } from '../../../config.js';
import { getAgentTasks, getAgentTaskStats } from '../../../services/customer-intel.js';
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

  // GET /api/admin/agents — list all personas with skills, files, deployment
  fastify.get('/', async () => {
    try {
      const personas = (await pool.query(`
        SELECT id, name, role, avatar, preferred_backend, status, agent_group,
               is_system, is_locked, is_master, owner, appearance_style, appearance_spec,
               dispatch_mode, created_at, last_active
        FROM personas ORDER BY is_system DESC, sort_order, name
      `)).rows as Array<Record<string, unknown>>;

      // Skills per persona
      const allSkills = (await pool.query(
        'SELECT persona_id, skill_name, enabled FROM persona_skills'
      )).rows as Array<{ persona_id: string; skill_name: string; enabled: number }>;
      const skillMap = new Map<string, Array<{ name: string; enabled: boolean }>>();
      for (const s of allSkills) {
        if (!skillMap.has(s.persona_id)) skillMap.set(s.persona_id, []);
        skillMap.get(s.persona_id)!.push({ name: s.skill_name, enabled: !!s.enabled });
      }

      // Project deployments per persona
      let deployMap = new Map<string, number>();
      try {
        const deps = (await pool.query(
          'SELECT persona_id, count(*) as cnt FROM project_collaborators GROUP BY persona_id'
        )).rows as Array<{ persona_id: string; cnt: number }>;
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
        system: agents.filter(a => (a as Record<string, unknown>).is_system).length,
        user: agents.filter(a => !(a as Record<string, unknown>).is_system).length,
      });
    } catch (e) {
      return ok({ agents: [], total: 0, system: 0, user: 0 });
    }
  });

  // GET /api/admin/agents/:id — full agent detail with .md files
  fastify.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const persona = (await pool.query('SELECT * FROM personas WHERE id = $1', [id])).rows[0] as Record<string, unknown> | undefined;
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
    const skills = (await pool.query(
      'SELECT skill_name, enabled, assigned_at FROM persona_skills WHERE persona_id = $1', [id]
    )).rows as Array<{ skill_name: string; enabled: number; assigned_at: number }>;

    // Project deployments
    let projects: Array<{ project_id: string; project_name: string; role: string }> = [];
    try {
      projects = (await pool.query(`
        SELECT pc.project_id, p.name as project_name, pc.access_mode as role
        FROM project_collaborators pc
        LEFT JOIN projects p ON p.id = pc.project_id
        WHERE pc.persona_id = $1
      `, [id])).rows as typeof projects;
    } catch { /* table may not exist */ }

    // Recent activity
    let recentMessages = 0;
    try {
      recentMessages = (await pool.query(
        "SELECT count(*) as c FROM agent_messages WHERE persona_id = $1 AND created_at > EXTRACT(EPOCH FROM NOW()) - 604800", [id]
      )).rows[0]?.c || 0;
    } catch {}

    // Feedback signals (from memories/signals)
    let signalCount = 0;
    try {
      signalCount = (await pool.query(
        "SELECT count(*) as c FROM memories WHERE persona_id = $1 AND layer = 'signal'", [id]
      )).rows[0]?.c || 0;
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
    const stats = await getAgentTaskStats();
    const tasks = await getAgentTasks(50);
    return ok({ stats, tasks });
  });

  // POST /api/admin/agents/tasks/:taskId/execute
  fastify.post('/tasks/:taskId/execute', async (req) => {
    const { taskId } = req.params as { taskId: string };
    await pool.query("UPDATE admin_agent_tasks SET status = 'running', started_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $1 AND status = 'queued'", [taskId]);
    await pool.query("UPDATE admin_agent_tasks SET status = 'completed', completed_at = EXTRACT(EPOCH FROM NOW()), result = 'Executed by admin' WHERE id = $1 AND status = 'running'", [taskId]);
    return ok({ executed: taskId });
  });

  // POST /api/admin/agents/tasks/:taskId/skip
  fastify.post('/tasks/:taskId/skip', async (req) => {
    const { taskId } = req.params as { taskId: string };
    await pool.query("UPDATE admin_agent_tasks SET status = 'skipped', completed_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $1 AND status = 'queued'", [taskId]);
    return ok({ skipped: taskId });
  });
}
