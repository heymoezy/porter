import { FastifyInstance } from 'fastify';
import { ok, err } from '../../../lib/envelope.js';
import { pool } from '../../../db/client.js';
import { z } from 'zod';
import crypto from 'crypto';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createToolSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  category: z.string().min(1).max(50),
  type: z.enum(['system', 'integration']).default('system'),
  enabled: z.number().int().min(0).max(1).default(1),
  visible: z.number().int().min(0).max(1).default(1),
  featured: z.number().int().min(0).max(1).default(0),
  icon: z.string().max(100).default(''),
  color: z.string().max(20).default(''),
  cover_image: z.string().max(500).default(''),
  short_label: z.string().max(50).default(''),
  sort_order: z.number().int().default(50),
  featured_order: z.number().int().default(0),
  config_schema: z.record(z.string(), z.unknown()).default({}),
  requires: z.array(z.string()).default([]),
  version: z.string().max(50).default(''),
});

const updateToolSchema = createToolSchema.partial();

// ── Route handler ─────────────────────────────────────────────────────────────

export default async function toolsRoutes(fastify: FastifyInstance) {

  // GET /api/admin/tools — all tools from DB with template assignment counts
  fastify.get('/', async () => {
    try {
      const rows = (await pool.query(`
        SELECT t.*,
          (SELECT COUNT(*) FROM template_tools tt WHERE tt.tool_id = t.id) AS template_count
        FROM tools t
        ORDER BY t.sort_order, t.name
      `)).rows;

      return ok({ tools: rows, total: rows.length });
    } catch {
      return ok({ tools: [], total: 0 });
    }
  });

  // GET /api/admin/tools/categories — category + type breakdown with counts
  // MUST be registered BEFORE /:id to avoid Fastify param conflict
  fastify.get('/categories', async () => {
    try {
      const rows = (await pool.query(`
        SELECT category, type, COUNT(*) as count FROM tools GROUP BY category, type ORDER BY category, type
      `)).rows;
      return ok({ categories: rows });
    } catch {
      return ok({ categories: [] });
    }
  });

  // GET /api/admin/tools/featured — featured tools ordered by featured_order
  // MUST be registered BEFORE /:id to avoid Fastify param conflict
  fastify.get('/featured', async () => {
    try {
      const rows = (await pool.query(`
        SELECT * FROM tools WHERE featured = 1 ORDER BY featured_order, sort_order, name
      `)).rows;
      return ok({ tools: rows });
    } catch {
      return ok({ tools: [] });
    }
  });

  // GET /api/admin/tools/connections — workspace_connections table (PRESERVED)
  // MUST be registered BEFORE /:id to avoid Fastify param conflict
  fastify.get('/connections', async () => {
    try {
      const rows = (await pool.query(
        'SELECT id, provider, kind, status, display_name, tools_json, last_sync_at, last_error, installed_by, created_at FROM workspace_connections ORDER BY provider'
      )).rows as Array<{
        id: string;
        provider: string;
        kind: string;
        status: string;
        display_name: string;
        tools_json: string;
        last_sync_at: number;
        last_error: string;
        installed_by: string;
        created_at: number;
      }>;

      return ok({
        connections: rows.map(r => ({
          id: r.id,
          provider: r.provider,
          kind: r.kind,
          status: r.status,
          displayName: r.display_name,
          toolsCount: JSON.parse(r.tools_json || '[]').length,
          lastSync: r.last_sync_at,
          lastError: r.last_error,
          installedBy: r.installed_by,
          createdAt: r.created_at,
        })),
        count: rows.length,
      });
    } catch {
      return ok({ connections: [], count: 0 });
    }
  });

  // GET /api/admin/tools/connections/:id/projects — project_connections for a connection (PRESERVED)
  fastify.get('/connections/:id/projects', async (req) => {
    const { id } = req.params as { id: string };
    try {
      const rows = (await pool.query(
        'SELECT pc.project_id, pc.access_mode, pc.status, pc.attached_by, pc.attached_at, p.name as project_name FROM project_connections pc LEFT JOIN projects p ON p.id = pc.project_id WHERE pc.connection_id = $1',
        [id]
      )).rows as Array<{
        project_id: string;
        access_mode: string;
        status: string;
        attached_by: string;
        attached_at: number;
        project_name: string | null;
      }>;

      return ok({ projects: rows });
    } catch {
      return ok({ projects: [] });
    }
  });

  // GET /api/admin/tools/:id — single tool with template details
  fastify.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const toolResult = await pool.query('SELECT * FROM tools WHERE id = $1', [id]);
      if (!toolResult.rows.length) {
        return reply.code(404).send(err('NOT_FOUND', 'Tool not found'));
      }
      const tool = toolResult.rows[0];

      const templates = (await pool.query(`
        SELECT tt.template_id, at.name, at.category
        FROM template_tools tt
        JOIN agent_templates at ON at.id = tt.template_id
        WHERE tt.tool_id = $1
        ORDER BY at.name
      `, [id])).rows;

      return ok({ tool: { ...tool, templates } });
    } catch {
      return reply.code(404).send(err('NOT_FOUND', 'Tool not found'));
    }
  });

  // POST /api/admin/tools — create a new tool
  fastify.post('/', async (req, reply) => {
    const parsed = createToolSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.message));
    }
    const d = parsed.data;
    const id = d.id || crypto.randomUUID();

    try {
      await pool.query(`
        INSERT INTO tools (
          id, name, description, category, type,
          enabled, visible, featured,
          icon, color, cover_image, short_label,
          sort_order, featured_order, config_schema,
          requires, version
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15,
          $16, $17
        )
      `, [
        id, d.name, d.description, d.category, d.type,
        d.enabled, d.visible, d.featured,
        d.icon, d.color, d.cover_image, d.short_label,
        d.sort_order, d.featured_order, JSON.stringify(d.config_schema),
        JSON.stringify(d.requires), d.version,
      ]);

      return reply.code(201).send(ok({ tool: { id, ...d } }));
    } catch (e: any) {
      if (e.code === '23505') {
        return reply.code(409).send(err('CONFLICT', `Tool with id '${id}' already exists`));
      }
      throw e;
    }
  });

  // PUT /api/admin/tools/:id — update an existing tool (partial)
  fastify.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateToolSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.message));
    }

    const fields = parsed.data;
    const keys = Object.keys(fields).filter(k => k !== 'id');
    if (keys.length === 0) {
      return reply.code(400).send(err('INVALID_INPUT', 'No fields to update'));
    }

    const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`);
    setClauses.push(`updated_at = EXTRACT(EPOCH FROM NOW())`);

    const values = keys.map(k => {
      const v = (fields as any)[k];
      if (k === 'config_schema' || k === 'requires') return JSON.stringify(v);
      return v;
    });

    const result = await pool.query(
      `UPDATE tools SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );

    if (!result.rows.length) {
      return reply.code(404).send(err('NOT_FOUND', 'Tool not found'));
    }

    return ok({ tool: result.rows[0] });
  });

  // DELETE /api/admin/tools/:id — remove a tool
  fastify.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await pool.query('DELETE FROM tools WHERE id = $1', [id]);
    if (!result.rowCount || result.rowCount === 0) {
      return reply.code(404).send(err('NOT_FOUND', 'Tool not found'));
    }
    return ok({ deleted: true });
  });

  // PUT /api/admin/tools/:id/toggle — toggle enabled state (backward compatibility)
  fastify.put('/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = (await pool.query('SELECT enabled FROM tools WHERE id = $1', [id])).rows[0] as { enabled: number } | undefined;
    if (!row) {
      return reply.code(404).send(err('NOT_FOUND', 'Tool not found'));
    }
    const newEnabled = row.enabled ? 0 : 1;
    await pool.query('UPDATE tools SET enabled = $1, updated_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $2', [newEnabled, id]);
    return ok({ id, enabled: newEnabled });
  });
}
