import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryAll, queryOne, execute } from '../../db/pg-helpers.js';
import { generateToolsEnvFile, defaultToolsEnvPath } from '../../services/intellect/tools-env.js';

export default async function toolsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/tools/registry — the canonical tools registry (R8).
  // Full detail: kind, canonical_path, alt_paths, how_detected, install_recipe,
  // status (present|missing|drift). This is the source-of-truth sessions/agents
  // consult instead of `which`-ing their PATH and reinstalling elsewhere.
  // ?regenerateEnv=1 also (re)writes the shared ~/porter/tools.env discovery file.
  fastify.get('/registry', async (req) => {
    const q = (req.query ?? {}) as { regenerateEnv?: string };
    let envFile: { path: string; bytes: number } | null = null;
    if (q.regenerateEnv === '1' || q.regenerateEnv === 'true') {
      try { envFile = await generateToolsEnvFile(); } catch { envFile = null; }
    }
    try {
      const rows = await queryAll<{
        tool_key: string;
        detected: number;
        version: string;
        source: string;
        health: string;
        kind: string;
        canonical_path: string;
        alt_paths: string;
        how_detected: string;
        install_recipe: string;
        status: string;
        last_checked_at: number;
      }>(
        `SELECT tool_key, detected, version, source, health, kind, canonical_path,
                alt_paths, how_detected, install_recipe, status, last_checked_at
           FROM environment_tools ORDER BY tool_key`
      );

      const tools = rows.map(r => {
        let altPaths: string[] = [];
        if (r.alt_paths) { try { altPaths = JSON.parse(r.alt_paths); } catch { altPaths = []; } }
        return {
          key: r.tool_key,
          detected: !!r.detected,
          status: r.status || (r.detected ? 'present' : 'missing'),
          kind: r.kind || 'binary',
          version: r.version,
          canonicalPath: r.canonical_path,
          altPaths,
          howDetected: r.how_detected,
          installRecipe: r.install_recipe,
          source: r.source,
          health: r.health,
          lastChecked: r.last_checked_at,
        };
      });

      return ok({
        tools,
        count: tools.length,
        summary: {
          present: tools.filter(t => t.status === 'present').length,
          missing: tools.filter(t => t.status === 'missing').length,
          drift: tools.filter(t => t.status === 'drift').length,
        },
        envFile: {
          path: defaultToolsEnvPath(),
          regenerated: !!envFile,
          bytes: envFile?.bytes ?? null,
          optInLine: '[ -f "$HOME/porter/tools.env" ] && source "$HOME/porter/tools.env"',
        },
      });
    } catch {
      return ok({ tools: [], count: 0 });
    }
  });

  // GET /api/admin/tools — environment_tools table
  fastify.get('/', async () => {
    try {
      const rows = await queryAll<{
        tool_key: string;
        detected: number;
        version: string;
        source: string;
        health: string;
        last_checked_at: number;
      }>(
        'SELECT tool_key, detected, version, source, health, last_checked_at FROM environment_tools ORDER BY tool_key'
      );

      return ok({
        tools: rows.map(r => ({
          key: r.tool_key,
          detected: !!r.detected,
          version: r.version,
          source: r.source,
          health: r.health,
          lastChecked: r.last_checked_at,
        })),
        count: rows.length,
      });
    } catch {
      return ok({ tools: [], count: 0 });
    }
  });

  // PUT /api/admin/tools/:key/toggle — toggle tool visibility (health: ok ↔ hidden)
  fastify.put('/:key/toggle', async (req) => {
    const { key } = req.params as { key: string };
    const row = await queryOne<{ health: string }>('SELECT health FROM environment_tools WHERE tool_key = $1', [key]);
    if (!row) return ok({ error: 'not_found' });
    const newHealth = row.health === 'hidden' ? 'ok' : 'hidden';
    await execute('UPDATE environment_tools SET health = $1 WHERE tool_key = $2', [newHealth, key]);
    return ok({ key, health: newHealth });
  });

  // GET /api/admin/tools/connections — workspace_connections table
  fastify.get('/connections', async () => {
    try {
      const rows = await queryAll<{
        id: string;
        provider: string;
        kind: string;
        status: string;
        display_name: string;
        tools_json: unknown;
        last_sync_at: number;
        last_error: string;
        installed_by: string;
        created_at: number;
      }>(
        'SELECT id, provider, kind, status, display_name, tools_json, last_sync_at, last_error, installed_by, created_at FROM workspace_connections ORDER BY provider'
      );

      return ok({
        connections: rows.map(r => ({
          id: r.id,
          provider: r.provider,
          kind: r.kind,
          status: r.status,
          displayName: r.display_name,
          toolsCount: Array.isArray(r.tools_json) ? r.tools_json.length : 0,
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

  // GET /api/admin/tools/connections/:id/projects — project_connections for a connection
  fastify.get('/connections/:id/projects', async (req) => {
    const { id } = req.params as { id: string };
    try {
      const rows = await queryAll<{
        project_id: string;
        access_mode: string;
        status: string;
        attached_by: string;
        attached_at: number;
        project_name: string | null;
      }>(
        'SELECT pc.project_id, pc.access_mode, pc.status, pc.attached_by, pc.attached_at, p.name as project_name FROM project_connections pc LEFT JOIN projects p ON p.id = pc.project_id WHERE pc.connection_id = $1',
        [id]
      );

      return ok({ projects: rows });
    } catch {
      return ok({ projects: [] });
    }
  });
}
