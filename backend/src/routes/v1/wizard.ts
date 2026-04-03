import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db, pool } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { ok, err } from '../../lib/envelope.js';
import { featureFlags } from '../../config.js';
import { dispatch } from '../../services/ai-router.js';
import { z } from 'zod';
import crypto from 'crypto';
import { provisionProjectStructure } from '../../services/project-substrate.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  WizardDetectResult,
  WizardProposeResult,
  WizardApproveResult,
  WizardProposal,
} from '../../types/wizard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Template loading — scans personas/ directory at module load time
// ---------------------------------------------------------------------------

function loadAvailableTemplates(): Array<{ templateId: string; name: string }> {
  try {
    const personasDir = path.resolve(__dirname, '../../../../personas');
    if (!fs.existsSync(personasDir)) return [];
    return fs.readdirSync(personasDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => ({ templateId: d.name, name: d.name.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) }));
  } catch {
    console.warn('[wizard] Could not load personas/ templates — using empty list');
    return [];
  }
}

const AVAILABLE_TEMPLATES = loadAvailableTemplates();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const detectSchema = z.object({
  action: z.literal('detect'),
  message: z.string().min(1).max(2000),
});

const proposeSchema = z.object({
  action: z.literal('propose'),
  goal: z.string().min(1).max(2000),
  answers: z.array(z.string()).default([]),
});

const approveSchema = z.object({
  action: z.literal('approve'),
  proposal: z.object({
    projectName: z.string().min(1).max(100),
    projectType: z.string(),
    agents: z.array(z.object({
      templateId: z.string(),
      name: z.string(),
      role: z.string(),
      portrait: z.string().optional().default(''),
      whyChosen: z.string(),
    })),
    milestones: z.array(z.string()),
    scopeLabel: z.string(),
    explanation: z.string().optional().default(''),
  }),
});

const gsdDispatchSchema = z.object({
  action: z.literal('gsd_dispatch'),
  projectId: z.string().uuid(),
  message: z.string().min(1).max(2000),
});

const wizardSchema = z.union([detectSchema, proposeSchema, approveSchema, gsdDispatchSchema]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a message likely expresses a project intent.
 * Heuristic: look for action verbs near a noun phrase.
 */
function heuristicIsProject(message: string): boolean {
  const lower = message.toLowerCase().trim();
  if (lower.length < 8) return false;
  return /\b(i need|i want|build|create|make|start|launch|develop|design|write|produce)\b/.test(lower);
}

/**
 * Get the Porter master agent ID for dispatch calls.
 * Falls back to first persona if no master found.
 */
async function getMasterAgentId(): Promise<string | null> {
  const master = (await pool.query(
    `SELECT id FROM personas WHERE is_master = 1 AND status != 'retired' LIMIT 1`
  )).rows[0] as { id: string } | undefined;
  if (master) return master.id;

  const first = (await pool.query(
    `SELECT id FROM personas WHERE status != 'retired' LIMIT 1`
  )).rows[0] as { id: string } | undefined;
  return first?.id ?? null;
}

/**
 * Attempt to extract JSON from an LLM response string.
 * Handles cases where the model wraps JSON in markdown code fences.
 */
function extractJson(text: string): unknown {
  // Try raw parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting from code fence
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        return JSON.parse(fence[1]);
      } catch {
        // fall through
      }
    }
    // Try finding first { ... } block
    const brace = text.match(/\{[\s\S]*\}/);
    if (brace) {
      try {
        return JSON.parse(brace[0]);
      } catch {
        // fall through
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export default async function wizardV1Routes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {

    // Feature flag gate
    if (!featureFlags.guidedWizard) {
      return reply.code(503).send(err('FEATURE_DISABLED', 'Guided wizard is not enabled'));
    }

    const parsed = wizardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const data = parsed.data;

    // -----------------------------------------------------------------------
    // detect action
    // -----------------------------------------------------------------------
    if (data.action === 'detect') {
      const { message } = data;
      const likelyProject = heuristicIsProject(message);

      if (!likelyProject) {
        const result: WizardDetectResult = {
          isProject: false,
          clarity: 'clear',
          suggestedQuestions: [],
        };
        return reply.send(ok(result));
      }

      // LLM classification
      const agentId = await getMasterAgentId();
      const classifyPrompt = `Classify this message. Is the user requesting a new project? Respond with JSON only:
{"isProject":true,"clarity":"clear","projectType":"website|app|content|research|design|ops|custom","suggestedQuestions":[]}
Or if vague: {"isProject":true,"clarity":"vague","projectType":"custom","suggestedQuestions":[{"id":"q1","text":"What type of project?","options":[{"id":"o1","label":"Website"},{"id":"o2","label":"App"},{"id":"o3","label":"Content"}]}]}

Message: "${message.slice(0, 500)}"`;

      try {
        if (agentId) {
          const dispatchResult = await dispatch({ agentId, message: classifyPrompt });
          const json = extractJson(dispatchResult.response);
          if (json && typeof json === 'object' && 'isProject' in (json as Record<string, unknown>)) {
            const raw = json as {
              isProject?: boolean;
              clarity?: string;
              suggestedQuestions?: unknown[];
            };
            const result: WizardDetectResult = {
              isProject: raw.isProject === true,
              clarity: (raw.clarity === 'clear' || raw.clarity === 'vague' || raw.clarity === 'ambiguous')
                ? raw.clarity
                : 'clear',
              suggestedQuestions: Array.isArray(raw.suggestedQuestions)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ? (raw.suggestedQuestions as any[]).map((q: any, qi: number) => ({
                    id: q.id ?? `q${qi + 1}`,
                    text: q.text ?? '',
                    options: Array.isArray(q.options)
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      ? (q.options as any[]).map((o: any, oi: number) => ({
                          id: o.id ?? `o${oi + 1}`,
                          label: o.label ?? '',
                          description: o.description,
                        }))
                      : [],
                  }))
                : [],
            };
            return reply.send(ok(result));
          }
        }
      } catch (e) {
        fastify.log.warn('[wizard] LLM detect failed, using heuristic fallback: %s', (e as Error).message);
      }

      // Heuristic fallback — message matched project pattern so return isProject: true
      const result: WizardDetectResult = {
        isProject: true,
        clarity: 'clear',
        suggestedQuestions: [],
      };
      return reply.send(ok(result));
    }

    // -----------------------------------------------------------------------
    // propose action
    // -----------------------------------------------------------------------
    if (data.action === 'propose') {
      const { goal, answers } = data;
      const agentId = await getMasterAgentId();

      const templateList = AVAILABLE_TEMPLATES.length > 0
        ? AVAILABLE_TEMPLATES.map(t => t.templateId).join(', ')
        : 'no templates available — use generic role names like "researcher", "developer", "designer"';

      const proposePrompt = `You are Porter, an AI orchestrator. Generate a project proposal.

User's goal: "${goal}"
${answers.length > 0 ? `User's answers: ${answers.join('; ')}` : ''}

Available project types: website, app, presentation, research, content, design, ops, custom
Available agent templates (select from these ONLY, do NOT invent agent names): ${templateList}

Select 2-4 agents appropriate for this project type. Use templateId values from the list above.
Generate 3-5 milestones.
Estimate scope: "Small (1-2 weeks)", "Medium (1 month)", or "Large (2+ months)".

Respond with JSON only, matching this exact shape:
{
  "projectName": "string",
  "projectType": "website|app|presentation|research|content|design|ops|custom",
  "agents": [
    {"templateId": "from-list-above", "name": "Human Name", "role": "Their role", "portrait": "", "whyChosen": "One sentence reason"}
  ],
  "milestones": ["Milestone 1", "Milestone 2", "Milestone 3"],
  "scopeLabel": "Small (1-2 weeks)|Medium (1 month)|Large (2+ months)",
  "explanation": "One paragraph explaining why Porter chose this configuration"
}`;

      if (!agentId) {
        return reply.code(503).send(err('NO_AGENT', 'No agent available for proposal generation'));
      }

      try {
        const dispatchResult = await dispatch({ agentId, message: proposePrompt });
        const json = extractJson(dispatchResult.response);

        if (json && typeof json === 'object') {
          const raw = json as Partial<WizardProposal>;
          const proposal: WizardProposal = {
            projectName: typeof raw.projectName === 'string' ? raw.projectName : goal.slice(0, 50),
            projectType: typeof raw.projectType === 'string' ? raw.projectType : 'custom',
            agents: Array.isArray(raw.agents) ? raw.agents.map(a => ({
              templateId: a.templateId ?? '',
              name: a.name ?? '',
              role: a.role ?? '',
              portrait: a.portrait ?? '',
              whyChosen: a.whyChosen ?? '',
            })) : [],
            milestones: Array.isArray(raw.milestones) ? raw.milestones.filter((m): m is string => typeof m === 'string') : [],
            scopeLabel: typeof raw.scopeLabel === 'string' ? raw.scopeLabel : 'Medium (1 month)',
            explanation: typeof raw.explanation === 'string' ? raw.explanation : '',
          };
          const result: WizardProposeResult = { proposal };
          return reply.send(ok(result));
        }
      } catch (e) {
        fastify.log.warn('[wizard] LLM propose failed: %s', (e as Error).message);
        return reply.code(502).send(err('LLM_ERROR', 'Failed to generate proposal'));
      }

      return reply.code(502).send(err('LLM_ERROR', 'Failed to parse proposal from LLM response'));
    }

    // -----------------------------------------------------------------------
    // approve action
    // -----------------------------------------------------------------------
    if (data.action === 'approve') {
      const { proposal } = data;
      const ownerId = request.sessionUser!.username;
      const now = Date.now() / 1000;

      const projectId = crypto.randomUUID();
      const slug = proposal.projectName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);

      const agentIds: string[] = [];
      const jobIds: string[] = [];

      // Atomic transaction: project + personas + jobs
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Insert project
        await client.query(`
          INSERT INTO projects (id, name, slug, type, status, description, owner_id, milestones, metadata, created_at, updated_at)
          VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
        `, [
          projectId,
          proposal.projectName,
          slug,
          proposal.projectType ?? 'custom',
          proposal.explanation ?? '',
          ownerId,
          JSON.stringify(proposal.milestones),
          JSON.stringify({ wizard: true }),
        ]);

        // 2. Create ephemeral persona + job per proposed agent
        for (const agent of proposal.agents) {
          const personaId = crypto.randomUUID();
          const jobId = crypto.randomUUID();

          await client.query(`
            INSERT INTO personas (id, name, role, status, is_temporary, config, created_at)
            VALUES ($1, $2, $3, 'idle', 1, $4, $5)
          `, [
            personaId,
            agent.name,
            agent.role,
            JSON.stringify({ project_id: projectId, template_id: agent.templateId }),
            new Date().toISOString(),
          ]);

          await client.query(`
            INSERT INTO agent_jobs (id, agent_id, project_id, trigger_type, prompt, status, scheduled_for, created_at)
            VALUES ($1, $2, $3, 'wizard_start', $4, 'pending', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
          `, [
            jobId,
            personaId,
            projectId,
            `Project "${proposal.projectName}" just started. Your role: ${agent.role}. Review the milestones and begin your first task.`,
          ]);

          // Log activity
          await client.query(`
            INSERT INTO agent_activity (agent_id, project_id, event_type, summary)
            VALUES ($1, $2, 'wizard_start', $3)
          `, [
            personaId,
            projectId,
            `${agent.name} assigned to ${proposal.projectName}`,
          ]);

          agentIds.push(personaId);
          jobIds.push(jobId);
        }

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      // Provision filesystem (best-effort, after commit)
      provisionProjectStructure({
        projectId,
        name: proposal.projectName,
        slug,
        type: proposal.projectType ?? 'custom',
        description: proposal.explanation ?? '',
      }).catch(e => console.error('[substrate] wizard provision failed:', e));

      const result: WizardApproveResult = { projectId, agentIds, jobIds };
      return reply.send(ok(result));
    }

    // -----------------------------------------------------------------------
    // gsd_dispatch action
    // -----------------------------------------------------------------------
    if (data.action === 'gsd_dispatch') {
      const { projectId, message } = data;

      // Verify project exists
      const project = (await pool.query('SELECT id, name FROM projects WHERE id = $1', [projectId])).rows[0] as { id: string; name: string } | undefined;
      if (!project) return reply.code(404).send(err('NOT_FOUND', 'Project not found'));

      // Get project agents — those with jobs on this project OR config pointing to it
      const agents = (await pool.query(`
        SELECT DISTINCT p.id, p.name, p.role FROM personas p
        WHERE p.status != 'retired' AND (
          p.id IN (
            SELECT DISTINCT aj.agent_id FROM agent_jobs aj WHERE aj.project_id = $1
          ) OR p.config->>'project_id' = $2
        )
      `, [projectId, projectId])).rows as Array<{ id: string; name: string; role: string }>;

      if (agents.length === 0) {
        return reply.send(ok({ dispatched: false, jobsCreated: 0, agentNames: [], summary: 'No agents assigned to this project. Create agents first via the wizard.' }));
      }

      // Call Porter LLM with orchestration prompt — Porter decides which agents handle what
      const masterAgent = (await pool.query(`SELECT id FROM personas WHERE is_master = 1 AND status != 'retired' LIMIT 1`)).rows[0] as { id: string } | undefined;
      const agentList = agents.map(a => `- ${a.name} (${a.role})`).join('\n');
      const orchestratorId = masterAgent?.id || agents[0].id;

      const orchestrationPrompt = `You are Porter, the orchestrator. A user sent this message for project "${project.name}": "${message}"

Available agents on this project:
${agentList}

Decide which agent(s) should handle this. For each agent, write a specific task prompt.
Respond with JSON only:
{"tasks":[{"agentId":"<id>","agentName":"<name>","prompt":"<specific task for this agent>"}]}

Rules:
- Assign 1-3 agents maximum
- Each agent gets a specific, actionable task — not a vague instruction
- You do NOT do the work yourself — you delegate`;

      const dispatchResult = await dispatch({
        agentId: orchestratorId,
        message: orchestrationPrompt,
      });

      // Parse Porter's response to get task assignments
      let tasks: Array<{ agentId: string; agentName: string; prompt: string }> = [];
      try {
        const parsedResponse = extractJson(dispatchResult.response);
        if (parsedResponse && typeof parsedResponse === 'object' && 'tasks' in (parsedResponse as Record<string, unknown>)) {
          tasks = (parsedResponse as { tasks: Array<{ agentId: string; agentName: string; prompt: string }> }).tasks || [];
        }
      } catch {
        // If LLM didn't return valid JSON, create a single task for the first agent
        tasks = [{ agentId: agents[0].id, agentName: agents[0].name, prompt: message }];
      }

      // Fallback: if tasks is empty, assign to first agent
      if (tasks.length === 0) {
        tasks = [{ agentId: agents[0].id, agentName: agents[0].name, prompt: message }];
      }

      // Create agent_jobs for each dispatched task (atomic transaction)
      const jobIds: string[] = [];
      const agentNames: string[] = [];
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const task of tasks) {
          const jobId = crypto.randomUUID();
          await client.query(`
            INSERT INTO agent_jobs (id, agent_id, project_id, trigger_type, prompt, status, scheduled_for, created_at)
            VALUES ($1, $2, $3, 'gsd_dispatch', $4, 'pending', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
          `, [jobId, task.agentId, projectId, task.prompt]);

          await client.query(`
            INSERT INTO agent_activity (agent_id, job_id, project_id, event_type, summary, detail, created_at)
            VALUES ($1, $2, $3, 'gsd_dispatch', $4, $5, EXTRACT(EPOCH FROM NOW()))
          `, [task.agentId, jobId, projectId, `${task.agentName} assigned: ${task.prompt.substring(0, 100)}`, JSON.stringify({ prompt: task.prompt })]);

          jobIds.push(jobId);
          agentNames.push(task.agentName);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      const summary = agentNames.length === 1
        ? `Dispatched task to ${agentNames[0]}`
        : `Dispatched ${agentNames.length} tasks to ${agentNames.join(', ')}`;

      return reply.send(ok({ dispatched: true, jobsCreated: jobIds.length, agentNames, summary }));
    }

    // Should be unreachable due to zod union validation
    return reply.code(400).send(err('UNKNOWN_ACTION', 'Unknown action'));
  });
}
