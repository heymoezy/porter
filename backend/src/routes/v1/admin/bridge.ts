/**
 * Admin Bridge Surface — GET + POST endpoints for Bridge subsystem
 *
 * Exposes the full Bridge subsystem (phases 16-21) through clean admin API endpoints.
 * Auth is NOT added here — inherited from the parent admin/index.ts preHandler (platform_admin).
 *
 * Phase 22: Bridge Admin Surface (ADM-01 through ADM-07)
 */

import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { pool } from '../../../db/client.js';
import { ok, err } from '../../../lib/envelope.js';
import { getBreakerState } from '../../../services/bridge/circuit-breaker-registry.js';
import { createAdapter } from '../../../services/bridge/adapters/index.js';
import { encryptCredential, validatePorterSecret } from '../../../lib/credential-crypto.js';
import type { GatewayRow } from '../../../services/bridge/types.js';

// ── Row mappers (local copies to avoid circular import with bridge.ts) ─────────

/**
 * Strips raw DB row down to safe gateway fields.
 * The raw encrypted credential column is never included in the output (GW-07).
 */
function maskGatewayRow(row: any) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    url: row.url,
    auth_method: row.auth_method,
    status: row.status,
    source: row.source,
    priority: row.priority,
    capabilities: row.capabilities ?? [],
    metadata: row.metadata ?? {},
    enabled: row.enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_health_at: row.last_health_at ?? null,
    model_count: row.model_count,
    circuit_state: row.circuit_state,
  };
}

/**
 * Maps a raw PostgreSQL row to a typed GatewayRow (camelCase fields).
 * Mirrors the same helper in bridge.ts — duplicated here to avoid circular import.
 */
function mapRawToGatewayRow(raw: any): GatewayRow {
  return {
    id: raw.id,
    type: raw.type,
    name: raw.name,
    url: raw.url,
    authMethod: raw.auth_method,
    status: raw.status,
    source: raw.source,
    priority: raw.priority,
    capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : [],
    metadata: (typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {}) as Record<string, unknown>,
    enabled: raw.enabled,
    maskedDisplay: raw.masked_display ?? '',
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    lastHealthAt: raw.last_health_at,
  };
}

/** Valid gateway types — used for input validation. */
const VALID_GATEWAY_TYPES = new Set([
  'ollama', 'openclaw', 'codex_cli', 'claude_cli', 'gemini_cli', 'openai_compat',
]);

// ── Status indicator mapping (DS-02) ─────────────────────────────────────────

function deriveStatusIndicator(status: string): 'healthy' | 'degraded' | 'unavailable' | 'unknown' {
  if (status === 'active') return 'healthy';
  if (status === 'stale') return 'degraded';
  if (status === 'unavailable') return 'unavailable';
  return 'unknown';
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export default async function adminBridgeRoutes(fastify: FastifyInstance) {

  // ── GET / — ADM-01: Gateway dashboard cards ──────────────────────────────────
  fastify.get('/', async (_request, reply) => {
    const { rows } = await pool.query(`
      SELECT g.id, g.type, g.name, g.url, g.auth_method, g.status,
             g.source, g.priority, g.capabilities, g.metadata,
             g.enabled, g.last_health_at, g.circuit_state,
             COUNT(m.id) FILTER (WHERE m.is_active = 1) AS model_count
      FROM gateways g
      LEFT JOIN models m ON m.gateway_id = g.id
      GROUP BY g.id
      ORDER BY g.priority ASC, g.created_at ASC
    `);

    const gateways = rows.map((gw: any) => {
      const masked = maskGatewayRow(gw);
      return {
        ...masked,
        model_count: parseInt(gw.model_count) || 0,
        circuit_state: getBreakerState(gw.id) ?? gw.circuit_state ?? 'closed',
        status_indicator: deriveStatusIndicator(gw.status),  // DS-02
        briefing_slot: null,                                   // DS-02 — reserved for Bridge agent narratives
      };
    });

    const summary = {
      total_gateways: gateways.length,
      healthy: gateways.filter((g: any) => g.status_indicator === 'healthy').length,
      degraded: gateways.filter((g: any) => g.status_indicator === 'degraded').length,
      unavailable: gateways.filter((g: any) => g.status_indicator === 'unavailable').length,
      last_activity: Math.max(...gateways.map((g: any) => g.last_health_at || 0)) || null,
    };

    return reply.send(ok({ gateways, summary }));
  });

  // ── GET /models — ADM-02: Unified model catalog ───────────────────────────────
  fastify.get('/models', async (request, reply) => {
    const { gateway_id, capability } = request.query as Record<string, string>;

    const params: unknown[] = [];
    let whereClause = 'WHERE m.is_active = 1';

    if (gateway_id) {
      params.push(gateway_id);
      whereClause += ` AND m.gateway_id = $${params.length}`;
    }

    const { rows } = await pool.query(`
      SELECT m.*, g.name AS gateway_name, g.type AS gateway_type, g.status AS gateway_status
      FROM models m
      JOIN gateways g ON g.id = m.gateway_id
      ${whereClause}
      ORDER BY g.priority ASC, m.model_name ASC
    `, params);

    let models = rows as any[];

    // Filter by capability in JS if requested
    if (capability) {
      models = models.filter((r: any) =>
        Array.isArray(r.capabilities) && r.capabilities.includes(capability)
      );
    }

    // Build summary: count by gateway_type
    const byGateway: Record<string, number> = {};
    for (const m of models) {
      const key = m.gateway_type as string;
      byGateway[key] = (byGateway[key] || 0) + 1;
    }

    const summary = {
      total_models: models.length,
      by_gateway: byGateway,
    };

    return reply.send(ok({ models, summary }));
  });

  // ── GET /dispatch-log — ADM-03: Paginated routing decisions ──────────────────
  fastify.get('/dispatch-log', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(q.page || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(q.limit || '50')));
    const offset = (page - 1) * limit;

    const params: unknown[] = [];
    const whereParts: string[] = [];

    if (q.gateway_type) {
      params.push(q.gateway_type);
      whereParts.push(`gateway_type = $${params.length}`);
    }
    if (q.model_name) {
      params.push(q.model_name);
      whereParts.push(`model_name = $${params.length}`);
    }
    if (q.agent_id) {
      params.push(q.agent_id);
      whereParts.push(`agent_id = $${params.length}`);
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    // Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM bridge_dispatch_log ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || '0');

    // Data query
    params.push(limit, offset);
    const { rows: entries } = await pool.query(`
      SELECT id, gateway_id, gateway_type, model_name, chosen_reason,
             alternatives, estimated_cost_usd, input_tokens, output_tokens,
             cached_tokens, latency_ms, agent_id, project_id, chat_id, rule_id, created_at
      FROM bridge_dispatch_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const pages = Math.ceil(total / limit);

    return reply.send(ok({
      entries,
      pagination: { page, limit, total, pages },
    }));
  });

  // ── GET /costs — ADM-04: Cost analytics ──────────────────────────────────────
  fastify.get('/costs', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const now = Math.floor(Date.now() / 1000);
    const from = parseFloat(q.from || String(now - 30 * 86400));
    const to = parseFloat(q.to || String(now));

    // 1. By gateway type
    const { rows: byGatewayRows } = await pool.query(`
      SELECT gateway_type,
             COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
             COUNT(*) AS dispatch_count,
             COALESCE(SUM(input_tokens), 0) AS input_tokens,
             COALESCE(SUM(output_tokens), 0) AS output_tokens
      FROM bridge_dispatch_log
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY gateway_type
      ORDER BY total_cost_usd DESC
    `, [from, to]);

    // 2. By model
    const { rows: byModelRows } = await pool.query(`
      SELECT model_name, gateway_type,
             COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
             COUNT(*) AS dispatch_count
      FROM bridge_dispatch_log
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY model_name, gateway_type
      ORDER BY total_cost_usd DESC
    `, [from, to]);

    // 3. By day
    const { rows: byDayRows } = await pool.query(`
      SELECT TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD') AS day,
             COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
             COUNT(*) AS dispatch_count
      FROM bridge_dispatch_log
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD')
      ORDER BY day ASC
    `, [from, to]);

    const totalCostUsd = byGatewayRows.reduce((sum: number, r: any) => sum + parseFloat(r.total_cost_usd || 0), 0);
    const totalDispatches = byGatewayRows.reduce((sum: number, r: any) => sum + parseInt(r.dispatch_count || 0), 0);

    const summary = {
      total_cost_usd: totalCostUsd,
      total_dispatches: totalDispatches,
      period_days: Math.ceil((to - from) / 86400),
    };

    return reply.send(ok({
      byGateway: byGatewayRows,
      byModel: byModelRows,
      byDay: byDayRows,
      summary,
      range: { from, to },
    }));
  });

  // ── GET /agent-stats — INT-02: Per-agent dispatch performance ──────────────
  fastify.get('/agent-stats', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const agentId = q.agent_id;

    if (!agentId) {
      return reply.send(err('MISSING_PARAM', 'agent_id query parameter is required'));
    }

    const { rows } = await pool.query(`
      SELECT
        model_name,
        gateway_type,
        COUNT(*)::int AS dispatch_count,
        ROUND(AVG(latency_ms)::numeric, 1) AS avg_latency_ms,
        COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
        COALESCE(SUM(input_tokens), 0)::int AS total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::int AS total_output_tokens
      FROM bridge_dispatch_log
      WHERE agent_id = $1
      GROUP BY model_name, gateway_type
      ORDER BY dispatch_count DESC
    `, [agentId]);

    const summary = {
      agent_id: agentId,
      total_dispatches: rows.reduce((s: number, r: any) => s + (r.dispatch_count || 0), 0),
      total_cost_usd: rows.reduce((s: number, r: any) => s + parseFloat(r.total_cost_usd || 0), 0),
      model_count: rows.length,
    };

    return reply.send(ok({ stats: rows, summary }));
  });

  // ── POST /workspace-config — MT-02: Workspace gateway overrides ───────────
  fastify.post('/workspace-config', async (request, reply) => {
    const body = request.body as Record<string, any>;
    const { action, ...data } = body;
    const actor = (request as any).sessionUser?.username ?? 'admin';

    // ── action = 'list' — list all overrides
    if (action === 'list') {
      const { rows } = await pool.query(`
        SELECT wgo.id, wgo.gateway_id, wgo.enabled, wgo.reason, wgo.updated_by, wgo.updated_at,
               g.type AS gateway_type, g.name AS gateway_name
        FROM workspace_gateway_overrides wgo
        JOIN gateways g ON g.id = wgo.gateway_id
        ORDER BY g.priority ASC
      `);
      return reply.send(ok({ overrides: rows }));
    }

    // ── action = 'set' — enable or disable a gateway for the workspace
    if (action === 'set') {
      if (!data.gateway_id) {
        return reply.send(err('MISSING_FIELD', 'gateway_id is required'));
      }
      const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1;
      const id = crypto.createHash('sha256')
        .update(`wgo:${data.gateway_id}`)
        .digest('hex').slice(0, 36);

      await pool.query(
        `INSERT INTO workspace_gateway_overrides (id, gateway_id, enabled, reason, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, EXTRACT(EPOCH FROM NOW()))
         ON CONFLICT (gateway_id) DO UPDATE SET
           enabled    = EXCLUDED.enabled,
           reason     = EXCLUDED.reason,
           updated_by = EXCLUDED.updated_by,
           updated_at = EXTRACT(EPOCH FROM NOW())`,
        [id, data.gateway_id, enabled, data.reason ?? null, actor]
      );

      return reply.send(ok({ set: true, gateway_id: data.gateway_id, enabled: !!enabled }));
    }

    // ── action = 'remove' — remove override (gateway returns to default behavior)
    if (action === 'remove') {
      if (!data.gateway_id) {
        return reply.send(err('MISSING_FIELD', 'gateway_id is required'));
      }
      await pool.query(
        'DELETE FROM workspace_gateway_overrides WHERE gateway_id = $1',
        [data.gateway_id]
      );
      return reply.send(ok({ removed: true, gateway_id: data.gateway_id }));
    }

    return reply.send(err('INVALID_ACTION', 'action must be one of: list, set, remove'));
  });

  // ── GET /attribution — MT-03: Usage attribution by user/project/agent ─────
  fastify.get('/attribution', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const now = Math.floor(Date.now() / 1000);
    const from = parseFloat(q.from || String(now - 30 * 86400));
    const to = parseFloat(q.to || String(now));
    const groupBy = q.group_by || 'user'; // user | project | agent

    let groupCol: string;
    let groupLabel: string;
    if (groupBy === 'project') {
      groupCol = 'project_id';
      groupLabel = 'project_id';
    } else if (groupBy === 'agent') {
      groupCol = 'agent_id';
      groupLabel = 'agent_id';
    } else {
      groupCol = 'username';
      groupLabel = 'username';
    }

    const { rows } = await pool.query(`
      SELECT
        COALESCE(${groupCol}, 'unattributed') AS ${groupLabel},
        COUNT(*)::int AS dispatch_count,
        COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
        COALESCE(SUM(input_tokens), 0)::int AS total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::int AS total_output_tokens,
        COALESCE(SUM(input_tokens + output_tokens), 0)::int AS total_tokens
      FROM bridge_dispatch_log
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY ${groupCol}
      ORDER BY total_cost_usd DESC
    `, [from, to]);

    const summary = {
      group_by: groupBy,
      total_dispatches: rows.reduce((s: number, r: any) => s + (r.dispatch_count || 0), 0),
      total_cost_usd: rows.reduce((s: number, r: any) => s + parseFloat(r.total_cost_usd || 0), 0),
      period_days: Math.ceil((to - from) / 86400),
    };

    return reply.send(ok({
      attribution: rows,
      summary,
      range: { from, to },
    }));
  });

  // ── POST /gateways — ADM-05: Gateway CRUD ────────────────────────────────────
  fastify.post('/gateways', async (request, reply) => {
    const body = request.body as Record<string, any>;
    const { action, ...data } = body;

    // ── action = 'remove' ────────────────────────────────────────────────────
    if (action === 'remove') {
      if (!data.id) {
        return reply.send(err('MISSING_ID', 'id is required for action=remove'));
      }
      await pool.query('DELETE FROM gateways WHERE id = $1', [data.id]);
      return reply.send(ok({ removed: true, id: data.id }));
    }

    // ── action = 'validate' ──────────────────────────────────────────────────
    if (action === 'validate') {
      if (!data.id) {
        return reply.send(err('MISSING_ID', 'id is required for action=validate'));
      }
      const { rows } = await pool.query('SELECT * FROM gateways WHERE id = $1', [data.id]);
      if (rows.length === 0) {
        return reply.send(ok({ valid: false, error: 'NOT_FOUND' }));
      }
      const gatewayRow = mapRawToGatewayRow(rows[0]);
      const adapter = createAdapter(gatewayRow);
      if (!adapter) {
        return reply.send(ok({ valid: false, error: 'NO_ADAPTER' }));
      }
      try {
        const health = await adapter.health();
        return reply.send(ok({ valid: health.healthy, latencyMs: health.latencyMs, error: health.error ?? null }));
      } catch (e) {
        return reply.send(ok({
          valid: false,
          error: 'HEALTH_CHECK_FAILED',
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }

    // ── action = 'add' ───────────────────────────────────────────────────────
    if (action === 'add') {
      if (!data.type || !data.name) {
        return reply.send(err('MISSING_FIELDS', 'type and name are required for action=add'));
      }
      if (!VALID_GATEWAY_TYPES.has(data.type)) {
        return reply.send(err('INVALID_TYPE', 'type must be one of: ' + [...VALID_GATEWAY_TYPES].join(', ')));
      }

      const id = crypto.randomUUID();

      await pool.query(
        `INSERT INTO gateways (id, type, name, url, auth_method, status, source, priority, capabilities, metadata, enabled, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'unavailable', 'manual', $6, $7::jsonb, $8::jsonb, $9, EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
        [
          id,
          data.type,
          data.name,
          data.url ?? null,
          data.auth_method ?? 'none',
          data.priority ?? 50,
          JSON.stringify(data.capabilities ?? []),
          JSON.stringify(data.metadata ?? {}),
          data.enabled ?? 1,
        ]
      );

      if (data.api_key) {
        if (!validatePorterSecret()) {
          return reply.send(err('SECRET_MISSING', 'PORTER_SECRET not configured — cannot encrypt credentials'));
        }
        const credId = crypto.createHash('sha256').update(data.api_key).digest('hex').slice(0, 36);
        const encrypted = encryptCredential(data.api_key);
        const masked = '***' + data.api_key.slice(-4);
        await pool.query(
          `INSERT INTO gateway_credentials (id, gateway_id, label, encrypted_value, masked_display, created_at)
           VALUES ($1, $2, 'primary', $3, $4, EXTRACT(EPOCH FROM NOW()))
           ON CONFLICT (id) DO UPDATE SET
             encrypted_value = EXCLUDED.encrypted_value,
             masked_display  = EXCLUDED.masked_display`,
          [credId, id, encrypted, masked]
        );
      }

      return reply.send(ok({ created: true, id }));
    }

    // ── action = 'update' ────────────────────────────────────────────────────
    if (action === 'update') {
      if (!data.id) {
        return reply.send(err('MISSING_ID', 'id is required for action=update'));
      }

      const allowedFields: Record<string, string> = {
        name: 'name',
        url: 'url',
        auth_method: 'auth_method',
        priority: 'priority',
        capabilities: 'capabilities',
        metadata: 'metadata',
        enabled: 'enabled',
      };

      const setClauses: string[] = [];
      const params: unknown[] = [];

      for (const [key, col] of Object.entries(allowedFields)) {
        if (data[key] !== undefined) {
          params.push(data[key]);
          if (key === 'capabilities' || key === 'metadata') {
            setClauses.push(`${col} = $${params.length}::jsonb`);
          } else {
            setClauses.push(`${col} = $${params.length}`);
          }
        }
      }

      // Always update updated_at
      setClauses.push(`updated_at = EXTRACT(EPOCH FROM NOW())`);

      if (setClauses.length > 1) {
        params.push(data.id);
        await pool.query(
          `UPDATE gateways SET ${setClauses.join(', ')} WHERE id = $${params.length}`,
          params
        );
      }

      if (data.api_key) {
        if (!validatePorterSecret()) {
          return reply.send(err('SECRET_MISSING', 'PORTER_SECRET not configured — cannot encrypt credentials'));
        }
        const credId = crypto.createHash('sha256').update(data.api_key).digest('hex').slice(0, 36);
        const encrypted = encryptCredential(data.api_key);
        const masked = '***' + data.api_key.slice(-4);
        await pool.query(
          `INSERT INTO gateway_credentials (id, gateway_id, label, encrypted_value, masked_display, created_at)
           VALUES ($1, $2, 'primary', $3, $4, EXTRACT(EPOCH FROM NOW()))
           ON CONFLICT (id) DO UPDATE SET
             encrypted_value = EXCLUDED.encrypted_value,
             masked_display  = EXCLUDED.masked_display`,
          [credId, data.id, encrypted, masked]
        );
      }

      return reply.send(ok({ updated: true, id: data.id }));
    }

    // ── Default: unknown action ──────────────────────────────────────────────
    return reply.send(err('INVALID_ACTION', 'action must be one of: add, update, remove, validate'));
  });

  // ── POST /routing-rules — ADM-06: Routing rule management ────────────────────
  fastify.post('/routing-rules', async (request, reply) => {
    const body = request.body as Record<string, any>;
    const { action, ...data } = body;

    const VALID_SCOPES = new Set(['global', 'agent', 'project', 'gateway']);
    const VALID_RULE_ACTIONS = new Set(['force_model', 'block_gateway', 'cap_cost_usd', 'prefer_local']);

    // ── action = 'list' ──────────────────────────────────────────────────────
    if (action === 'list') {
      const { rows } = await pool.query(`
        SELECT id, scope, scope_id, action, action_value, enabled, priority,
               description, created_by, created_at, updated_at
        FROM routing_rules
        ORDER BY priority ASC, created_at ASC
      `);
      return reply.send(ok({ rules: rows }));
    }

    // ── action = 'create' ────────────────────────────────────────────────────
    if (action === 'create') {
      if (!VALID_SCOPES.has(data.scope)) {
        return reply.send(err('INVALID_SCOPE', 'scope must be one of: ' + [...VALID_SCOPES].join(', ')));
      }
      if (!VALID_RULE_ACTIONS.has(data.action_type)) {
        return reply.send(err('INVALID_ACTION_TYPE', 'action_type must be one of: ' + [...VALID_RULE_ACTIONS].join(', ')));
      }
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO routing_rules (id, scope, scope_id, action, action_value, enabled, priority, description, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
        [
          id,
          data.scope,
          data.scope_id ?? null,
          data.action_type,
          data.action_value ?? null,
          data.enabled ?? 1,
          data.priority ?? 50,
          data.description ?? null,
          (request as any).sessionUser?.username ?? null,
        ]
      );
      return reply.send(ok({ created: true, id }));
    }

    // ── action = 'update' ────────────────────────────────────────────────────
    if (action === 'update') {
      if (!data.id) {
        return reply.send(err('MISSING_ID', 'id is required for action=update'));
      }

      if (data.scope !== undefined && !VALID_SCOPES.has(data.scope)) {
        return reply.send(err('INVALID_SCOPE', 'scope must be one of: ' + [...VALID_SCOPES].join(', ')));
      }
      if (data.action_type !== undefined && !VALID_RULE_ACTIONS.has(data.action_type)) {
        return reply.send(err('INVALID_ACTION_TYPE', 'action_type must be one of: ' + [...VALID_RULE_ACTIONS].join(', ')));
      }

      const allowedFields: Record<string, string> = {
        scope: 'scope',
        scope_id: 'scope_id',
        action_type: 'action',
        action_value: 'action_value',
        enabled: 'enabled',
        priority: 'priority',
        description: 'description',
      };

      const setClauses: string[] = [];
      const params: unknown[] = [];

      for (const [key, col] of Object.entries(allowedFields)) {
        if (data[key] !== undefined) {
          params.push(data[key]);
          setClauses.push(`${col} = $${params.length}`);
        }
      }

      setClauses.push(`updated_at = EXTRACT(EPOCH FROM NOW())`);

      if (setClauses.length > 1) {
        params.push(data.id);
        await pool.query(
          `UPDATE routing_rules SET ${setClauses.join(', ')} WHERE id = $${params.length}`,
          params
        );
      }

      return reply.send(ok({ updated: true, id: data.id }));
    }

    // ── action = 'delete' ────────────────────────────────────────────────────
    if (action === 'delete') {
      if (!data.id) {
        return reply.send(err('MISSING_ID', 'id is required for action=delete'));
      }
      await pool.query('DELETE FROM routing_rules WHERE id = $1', [data.id]);
      return reply.send(ok({ deleted: true, id: data.id }));
    }

    // ── Default: unknown action ──────────────────────────────────────────────
    return reply.send(err('INVALID_ACTION', 'action must be one of: create, update, delete, list'));
  });

  // ── GET /sse-status — ADM-07: SSE event type documentation ───────────────────
  // Documents the 3 Bridge SSE event types that already flow through sse-hub.ts.
  // Emission points (no new code needed — already wired in phases 18-20):
  //   bridge:health       → health-probe.ts:126 (every 30s health probe cycle)
  //   bridge:dispatch     → routing-engine.ts:298 (every AI dispatch)
  //   bridge:circuit-trip → circuit-breaker-registry.ts:57/65/73 (on circuit state change)
  fastify.get('/sse-status', async (_req, reply) => {
    return reply.send(ok({
      events: [
        { type: 'bridge:health', source: 'health-probe.ts', frequency: 'every 30s health probe cycle' },
        { type: 'bridge:dispatch', source: 'routing-engine.ts', frequency: 'every AI dispatch' },
        { type: 'bridge:circuit-trip', source: 'circuit-breaker-registry.ts', frequency: 'on circuit state change' },
      ],
      note: 'Subscribe to GET /api/events SSE stream to receive these events in real-time',
    }));
  });

  // ── POST /speed-test — Latency benchmark across one or all gateways ──────────
  // Body: { gateway_id?: string }
  // Tests each gateway by dispatching a minimal "Hi" message and measuring latency.
  // Returns: { results: Array<{ gateway_id, gateway_name, gateway_type, ok, latency_ms, model, error? }> }
  fastify.post('/speed-test', async (request, reply) => {
    const body = request.body as Record<string, any>;
    const gatewayIdFilter = body?.gateway_id as string | undefined;

    // Build WHERE clause
    const params: unknown[] = [1];
    let whereClause = `WHERE g.enabled = $1`;
    if (gatewayIdFilter) {
      params.push(gatewayIdFilter);
      whereClause += ` AND g.id = $${params.length}`;
    }

    const { rows } = await pool.query(`
      SELECT id, type, name, url, auth_method, status, source, priority,
             capabilities, metadata, enabled, masked_display,
             created_at, updated_at, last_health_at
      FROM gateways g
      ${whereClause}
      ORDER BY priority ASC
    `, params);

    if (rows.length === 0) {
      return reply.send(ok({ results: [] }));
    }

    const TEST_MESSAGE = { role: 'user', content: 'Hi' };

    // Run all gateways in parallel
    const results = await Promise.all(
      rows.map(async (raw: any): Promise<{
        gateway_id: string;
        gateway_name: string;
        gateway_type: string;
        ok: boolean;
        latency_ms: number | null;
        model: string | null;
        error?: string;
      }> => {
        const gatewayRow = mapRawToGatewayRow(raw);
        const adapter = createAdapter(gatewayRow);

        if (!adapter) {
          return {
            gateway_id: raw.id,
            gateway_name: raw.name,
            gateway_type: raw.type,
            ok: false,
            latency_ms: null,
            model: null,
            error: 'No adapter available for this gateway type',
          };
        }

        const start = Date.now();
        try {
          const result = await adapter.dispatch({ messages: [TEST_MESSAGE] });
          return {
            gateway_id: raw.id,
            gateway_name: raw.name,
            gateway_type: raw.type,
            ok: true,
            latency_ms: result.latencyMs ?? (Date.now() - start),
            model: result.model,
          };
        } catch (e) {
          return {
            gateway_id: raw.id,
            gateway_name: raw.name,
            gateway_type: raw.type,
            ok: false,
            latency_ms: Date.now() - start,
            model: null,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      })
    );

    return reply.send(ok({ results }));
  });
}
