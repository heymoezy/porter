import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { config } from '../config.js';
import { sqlite } from '../db/client.js';
import fs from 'fs';
import path from 'path';

export default async function porterProfileRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  const porterDir = () => path.join(config.personasDir, 'porter-core');

  // GET /api/admin/porter/identity — reads all identity files from personas/porter-core/
  fastify.get('/identity', async () => {
    const dir = porterDir();
    const files = ['SOUL.md', 'IDENTITY.md', 'ROLE_CARD.md', 'SKILLS.md', 'USER.md'];
    const identity: Record<string, string | null> = {};

    for (const file of files) {
      try {
        identity[file] = fs.readFileSync(path.join(dir, file), 'utf-8');
      } catch {
        identity[file] = null;
      }
    }

    // Read persona DB record
    let persona: Record<string, unknown> | null = null;
    try {
      persona = sqlite.prepare('SELECT * FROM personas WHERE id = ?').get('porter-core') as Record<string, unknown> | null;
    } catch {}

    return ok({ identity, persona });
  });

  // PUT /api/admin/porter/identity/:file — write back to filesystem
  fastify.put('/identity/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    const allowed = ['SOUL.md', 'IDENTITY.md', 'ROLE_CARD.md', 'SKILLS.md', 'USER.md'];
    if (!allowed.includes(file)) {
      reply.status(400);
      return err('INVALID_FILE', `Can only edit: ${allowed.join(', ')}`);
    }

    const { content } = req.body as { content: string };
    if (typeof content !== 'string') {
      reply.status(400);
      return err('INVALID_BODY', 'Body must contain { content: string }');
    }

    try {
      fs.writeFileSync(path.join(porterDir(), file), content, 'utf-8');
      return ok({ file, size: content.length });
    } catch (e) {
      reply.status(500);
      return err('WRITE_FAILED', `Failed to write ${file}: ${(e as Error).message}`);
    }
  });

  // GET /api/admin/porter/skills — proxy to porter.py for rich skill profile, DB fallback
  fastify.get('/skills', async (req) => {
    // Try porter.py first for the full profile with tiers + purposes
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${config.porterPyUrl}/api/personas/porter-core/skills`, {
        signal: controller.signal,
        headers: { Cookie: req.headers.cookie || '' },
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        return ok(data);
      }
    } catch { /* porter.py not available, fall back to DB */ }

    // Fallback: read from DB with hardcoded purpose map
    try {
      const rows = sqlite.prepare(
        'SELECT skill_name, enabled, assigned_at FROM persona_skills WHERE persona_id = ?'
      ).all('porter-core') as Array<{ skill_name: string; enabled: number; assigned_at: number }>;

      const PURPOSES: Record<string, string> = {
        'chat-orchestrator': 'Keeps Porter conversationally lean, asks the minimum clarifying questions, and turns chat into explicit orchestration moves.',
        'prompt-architect': 'Repairs weak user prompts, sharpens worker briefs, and improves inter-agent handoffs before work is delegated.',
        'delegation-governor': 'Decides what Porter should delegate, what should stay conversational, and when worker creation is justified.',
        'project-architect': 'Shapes new projects, scope boundaries, and execution lanes before Porter commits them.',
        'project-lineage': 'Keeps worker, task, and memory context attached to the right project lane over time.',
        'worker-architect': 'Designs the right worker role, lifecycle, and loadout for a delegated task.',
        'handoff-director': 'Manages handoffs between workers so execution moves cleanly without dropped context.',
        'approval-governor': 'Applies explicit approval gates before Porter changes the roster, project structure, or autonomy level.',
        'roster-curator': 'Keeps the worker roster clean by preferring reuse, retirement, and tight specialization over sprawl.',
        'directive-librarian': 'Turns memory into reviewed directives, tracks disputed guidance, and keeps false assumptions dismissible.',
        'runtime-selector': 'Chooses the right runtime lane for each delegated job and keeps the final model visible to the operator.',
        'memory-curator': 'Distills durable directives and learned truths into reviewable memory.',
        'runtime-auditor': 'Inspects runtime state, routing pressure, failures, and operator telemetry for drift.',
        'avatar-art-director': 'Turns agent role and temperament into Porter-owned pixel identity direction.',
        'skill-creator': 'Creates or updates specialist worker skills when the roster lacks coverage.',
        'healthcheck': 'Runtime, service, and environment verification.',
        'tmux': 'Multi-session supervision across worker terminals.',
      };

      const CORE = ['chat-orchestrator','prompt-architect','delegation-governor','project-architect','project-lineage','worker-architect','handoff-director','approval-governor','roster-curator','directive-librarian','runtime-selector','memory-curator'];
      const INTERNAL = ['skill-creator','tmux','avatar-art-director','runtime-auditor','healthcheck'];

      const skills = rows.map(r => {
        const tier = CORE.includes(r.skill_name) ? 'core' : INTERNAL.includes(r.skill_name) ? 'internal' : 'reserve';
        return {
          id: r.skill_name,
          name: r.skill_name,
          purpose: PURPOSES[r.skill_name] || '',
          tier,
          installed: true,
          enabled: !!r.enabled,
        };
      });

      const core = skills.filter(s => s.tier === 'core');
      const internal = skills.filter(s => s.tier === 'internal');
      const reserve = skills.filter(s => s.tier === 'reserve');

      return ok({
        skills,
        profile: { core, internal, reserve, available: [], available_count: skills.length },
        assigned_names: rows.map(r => r.skill_name),
        managed_by_porter: true,
        source: 'db_fallback',
      });
    } catch {
      return ok({ skills: [], profile: null, assigned_names: [], managed_by_porter: true });
    }
  });

  // POST /api/admin/porter/chat — proxy to Porter's chat stream, return full response
  fastify.post('/chat', async (req, reply) => {
    const { message } = req.body as { message: string };
    if (!message?.trim()) {
      reply.status(400);
      return err('EMPTY_MESSAGE', 'Message cannot be empty');
    }

    try {
      const url = `${config.porterPyUrl}/api/chat/stream?raw_text=${encodeURIComponent(message)}&persona_name=porter&model=auto`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Cookie: req.headers.cookie || '' },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return err('PORTER_ERROR', `Porter returned ${res.status}`);
      }

      // Read SSE stream and collect the full response
      const text = await res.text();
      const lines = text.split('\n');
      let fullResponse = '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.token) fullResponse += parsed.token;
            if (parsed.text) fullResponse += parsed.text;
            if (parsed.chunk) fullResponse += parsed.chunk;
            if (parsed.content) fullResponse += parsed.content;
          } catch {
            // Not JSON, might be raw text token
            if (payload && payload !== '[DONE]') fullResponse += payload;
          }
        }
      }

      return ok({ response: fullResponse.trim() || 'Porter did not respond.' });
    } catch (e) {
      return err('PORTER_UNREACHABLE', 'Could not reach Porter — is porter.py running?');
    }
  });

  // GET /api/admin/porter/stats — dispatch stats
  fastify.get('/stats', async () => {
    try {
      const dispatches = sqlite.prepare(
        "SELECT count(*) as total FROM orchestration_runs WHERE persona_id = 'porter-core'"
      ).get() as { total: number } | undefined;

      const recentRuns = sqlite.prepare(
        "SELECT status, count(*) as cnt FROM orchestration_runs WHERE persona_id = 'porter-core' GROUP BY status"
      ).all() as Array<{ status: string; cnt: number }>;

      const statusMap: Record<string, number> = {};
      for (const r of recentRuns) statusMap[r.status] = r.cnt;

      const total = dispatches?.total || 0;
      const succeeded = statusMap['completed'] || statusMap['success'] || 0;

      return ok({
        totalDispatches: total,
        successRate: total > 0 ? Math.round((succeeded / total) * 100) : 0,
        statusBreakdown: statusMap,
      });
    } catch {
      return ok({ totalDispatches: 0, successRate: 0, statusBreakdown: {} });
    }
  });
}
