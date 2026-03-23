import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { config } from '../../config.js';
import { z } from 'zod';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

function parseJsonField<T>(value: string | null | undefined | T, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  description: string | null;
  tags: string;
  skills: string;
  tools: string;
  required_backends: string;
  required_tools: string;
  system_prompt: string;
  soul_text: string;
  role_card_text: string;
  identity_text: string;
  skills_text: string;
  is_internal: number;
  sort_order: number | null;
  created_at: number | null;
}

interface PersonaRow {
  id: string;
  name: string;
  role: string;
  avatar: string | null;
  status: string;
  agent_group: string;
  preferred_backend: string | null;
  fallback_backends: string;
  soul_hash: string | null;
  owner: string;
  is_system: number;
  is_public: number;
  is_locked: number;
  is_master: number;
  orchestrator_only: number;
  is_temporary: number;
  managed_by_porter: number;
  appearance_style: string;
  appearance_spec: string;
  skin_asset_path: string;
  portrait_asset_path: string;
  sort_order: number;
  created_at: string;
  last_active: string | null;
  config: string;
  heartbeat_enabled: number;
  heartbeat_cron: string;
  last_heartbeat: string | null;
  template_id: string | null;
}

type ConfigBlob = {
  description?: string;
  skills?: string[];
  tools?: string[];
  project_id?: string | null;
  template_id?: string;
  [key: string]: unknown;
};

function formatTemplate(row: TemplateRow) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description ?? '',
    tags: parseJsonField<string[]>(row.tags, []),
    skills: parseJsonField<string[]>(row.skills, []),
    tools: parseJsonField<string[]>(row.tools, []),
    required_backends: parseJsonField<string[]>(row.required_backends, []),
    required_tools: parseJsonField<string[]>(row.required_tools, []),
    system_prompt: row.system_prompt,
    soul_text: row.soul_text,
    role_card_text: row.role_card_text,
    identity_text: row.identity_text,
    skills_text: row.skills_text,
    is_internal: Boolean(row.is_internal),
    sort_order: row.sort_order ?? 50,
    created_at: row.created_at,
  };
}

function formatAgent(row: PersonaRow) {
  const cfg = parseJsonField<ConfigBlob>(row.config, {});
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    avatar: row.avatar,
    status: row.status,
    agent_group: row.agent_group,
    preferred_backend: row.preferred_backend,
    fallback_backends: parseJsonField<string[]>(row.fallback_backends, []),
    soul_hash: row.soul_hash,
    owner: row.owner,
    is_system: Boolean(row.is_system),
    is_public: Boolean(row.is_public),
    is_locked: Boolean(row.is_locked),
    is_master: Boolean(row.is_master),
    orchestrator_only: Boolean(row.orchestrator_only),
    is_temporary: Boolean(row.is_temporary),
    managed_by_porter: Boolean(row.managed_by_porter),
    appearance_style: row.appearance_style,
    appearance_spec: parseJsonField<Record<string, unknown>>(row.appearance_spec, {}),
    skin_asset_path: row.skin_asset_path,
    portrait_asset_path: row.portrait_asset_path,
    sort_order: row.sort_order,
    created_at: row.created_at,
    last_active: row.last_active,
    heartbeat_enabled: Boolean(row.heartbeat_enabled),
    heartbeat_cron: row.heartbeat_cron,
    last_heartbeat: row.last_heartbeat,
    template_id: row.template_id,
    config: cfg,
    description: cfg.description ?? '',
    skills: cfg.skills ?? [],
    tools: cfg.tools ?? [],
  };
}

async function probeBackend(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
    return resp.ok || resp.status === 405;
  } catch {
    return false;
  }
}

function getBackendUrl(backendName: string): string | null {
  const map: Record<string, string> = {
    ollama: config.ollamaUrl,
    openclaw: config.openclawUrl,
  };
  return map[backendName] ?? null;
}

const instantiateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  project_id: z.string().optional(),
});

export default async function templateV1Routes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  // GET /api/v1/templates — list templates with optional filtering
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const {
      category,
      tag,
      q,
      include_internal,
      limit: limitParam,
      offset: offsetParam,
    } = request.query as {
      category?: string;
      tag?: string;
      q?: string;
      include_internal?: string;
      limit?: string;
      offset?: string;
    };

    const maxLimit = Math.min(parseInt(limitParam ?? '200', 10), 500);
    const skip = parseInt(offsetParam ?? '0', 10);
    const showInternal = include_internal === 'true';

    let sql = 'SELECT * FROM agent_templates WHERE 1=1';
    const params: unknown[] = [];
    let paramIdx = 1;

    if (!showInternal) {
      sql += ' AND is_internal = 0';
    }

    if (category) {
      sql += ` AND category = $${paramIdx}`;
      params.push(category);
      paramIdx++;
    }

    if (tag) {
      sql += ` AND id IN (SELECT at2.id FROM agent_templates at2, jsonb_array_elements_text(at2.tags) jt WHERE jt = $${paramIdx})`;
      params.push(tag);
      paramIdx++;
    }

    if (q) {
      sql += ` AND (name ILIKE $${paramIdx} OR description ILIKE $${paramIdx + 1})`;
      params.push(`%${q}%`, `%${q}%`);
      paramIdx += 2;
    }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as n');
    const totalRow = (await pool.query(countSql, params)).rows[0] as { n: number };

    sql += ` ORDER BY sort_order ASC, name ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(maxLimit, skip);

    const rows = (await pool.query(sql, params)).rows as TemplateRow[];

    return reply.send(ok({
      templates: rows.map(formatTemplate),
      total: totalRow.n,
    }));
  });

  // GET /api/v1/templates/:id — get single template
  fastify.get('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const row = (await pool.query('SELECT * FROM agent_templates WHERE id = $1', [id])).rows[0] as TemplateRow | undefined;

    if (!row) {
      return reply.code(404).send(err('TEMPLATE_NOT_FOUND', 'Template not found'));
    }

    return reply.send(ok({ template: formatTemplate(row) }));
  });

  // POST /api/v1/templates/:id/instantiate — create agent from template
  fastify.post('/:id/instantiate', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const parsed = instantiateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const template = (await pool.query('SELECT * FROM agent_templates WHERE id = $1', [id])).rows[0] as TemplateRow | undefined;
    if (!template) {
      return reply.code(404).send(err('TEMPLATE_NOT_FOUND', 'Template not found'));
    }

    // Validate required backends
    const requiredBackends = parseJsonField<string[]>(template.required_backends, []);
    const missingBackends: string[] = [];
    for (const backendName of requiredBackends) {
      const url = getBackendUrl(backendName);
      if (!url) {
        missingBackends.push(backendName);
        continue;
      }
      const available = await probeBackend(url);
      if (!available) {
        missingBackends.push(backendName);
      }
    }

    // Validate required tools (workspace_connections)
    const requiredTools = parseJsonField<string[]>(template.required_tools, []);
    const missingTools: string[] = [];
    for (const toolName of requiredTools) {
      const conn = (await pool.query(
        `SELECT id, status FROM workspace_connections WHERE provider = $1 AND status = 'connected'`,
        [toolName]
      )).rows[0] as { id: string; status: string } | undefined;
      if (!conn) {
        missingTools.push(toolName);
      }
    }

    if (missingBackends.length > 0 || missingTools.length > 0) {
      return reply.code(422).send(
        err('MISSING_DEPENDENCIES', JSON.stringify({ missing_backends: missingBackends, missing_tools: missingTools }))
      );
    }

    // Create persona row
    const agentId = 'agent_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const now = new Date().toISOString();

    const cfg: ConfigBlob = {
      description: parsed.data.description || template.description || '',
      skills: parseJsonField<string[]>(template.skills, []),
      tools: parseJsonField<string[]>(template.tools, []),
      template_id: template.id,
      project_id: parsed.data.project_id || null,
    };

    await pool.query(`
      INSERT INTO personas (id, name, role, config, created_at, status, owner, is_temporary, template_id)
      VALUES ($1, $2, $3, $4, $5, 'idle', $6, 0, $7)
    `, [
      agentId,
      parsed.data.name || template.name,
      parsed.data.role || template.category,
      JSON.stringify(cfg),
      now,
      request.sessionUser!.username,
      template.id,
    ]);

    // Write .md files to personas directory
    const personaDir = path.join(process.env.HOME!, 'documents/porter/personas', agentId);
    try {
      await fs.mkdir(personaDir, { recursive: true });
      await fs.writeFile(path.join(personaDir, 'SOUL.md'), template.soul_text);
      await fs.writeFile(path.join(personaDir, 'ROLE_CARD.md'), template.role_card_text);
      await fs.writeFile(path.join(personaDir, 'IDENTITY.md'), template.identity_text);
      await fs.writeFile(path.join(personaDir, 'SKILLS.md'), template.skills_text);
    } catch (fsErr) {
      // Rollback: delete persona row on file write failure
      await pool.query('DELETE FROM personas WHERE id = $1', [agentId]);
      throw fsErr;
    }

    // Fetch back the created row and return it
    const agent = (await pool.query('SELECT * FROM personas WHERE id = $1', [agentId])).rows[0] as PersonaRow | undefined;

    return reply.code(201).send(ok({ agent: agent ? formatAgent(agent) : null }));
  });
}
