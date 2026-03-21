import { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';
import { sqlite } from '../db/client.js';
import { getAgentTasks, getAgentTaskStats } from '../services/customer-intel.js';

const ADMIN_AGENTS = [
  {
    id: 'growth',
    name: 'Growth Agent',
    role: 'Converts free users to paid. Sends upgrade nudges, onboarding sequences, feature gate prompts.',
    status: 'active',
  },
  {
    id: 'retention',
    name: 'Retention Agent',
    role: 'Prevents churn. Watches inactivity, sends re-engagement emails, offers concessions.',
    status: 'active',
  },
  {
    id: 'security',
    name: 'Security Agent',
    role: 'Monitors anomalies. Flags suspicious logins, session leaks, brute force attempts.',
    status: 'active',
  },
  {
    id: 'social',
    name: 'Social Agent',
    role: 'Posts daily to X promoting Porter. Sources content from customer wins and feature launches.',
    status: 'active',
  },
];

export default async function agentsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/agents — list admin agents with task stats
  fastify.get('/', async () => {
    const stats = getAgentTaskStats();
    const tasks = getAgentTasks(50);

    const agents = ADMIN_AGENTS.map(a => {
      const agentTasks = tasks.filter(t => t.agent_type === a.id);
      return {
        ...a,
        queued: agentTasks.filter(t => t.status === 'queued').length,
        running: agentTasks.filter(t => t.status === 'running').length,
        completed: agentTasks.filter(t => t.status === 'completed').length,
      };
    });

    return ok({ agents, stats, recentTasks: tasks.slice(0, 20) });
  });

  // POST /api/admin/agents/execute/:taskId — manually trigger a queued task
  fastify.post<{ Params: { taskId: string } }>('/execute/:taskId', async (request, reply) => {
    const { taskId } = request.params;
    try {
      sqlite.prepare("UPDATE admin_agent_tasks SET status = 'running', started_at = unixepoch('now') WHERE id = ? AND status = 'queued'").run(taskId);
      // In a real system, this would dispatch to the actual agent.
      // For now, mark as completed after "execution"
      sqlite.prepare("UPDATE admin_agent_tasks SET status = 'completed', completed_at = unixepoch('now'), result = 'Executed manually by admin' WHERE id = ? AND status = 'running'").run(taskId);
      return ok({ executed: taskId });
    } catch {
      return reply.code(400).send({ error: { code: 'EXEC_FAILED', message: 'Task execution failed' } });
    }
  });

  // POST /api/admin/agents/skip/:taskId — skip a queued task
  fastify.post<{ Params: { taskId: string } }>('/skip/:taskId', async (request, reply) => {
    try {
      sqlite.prepare("UPDATE admin_agent_tasks SET status = 'skipped', completed_at = unixepoch('now') WHERE id = ? AND status = 'queued'").run(request.params.taskId);
      return ok({ skipped: request.params.taskId });
    } catch {
      return reply.code(400).send({ error: { code: 'SKIP_FAILED', message: 'Task skip failed' } });
    }
  });
}
