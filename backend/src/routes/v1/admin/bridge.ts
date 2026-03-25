/**
 * Admin Bridge Surface — Read-only GET endpoints for Bridge subsystem
 *
 * Exposes the full Bridge subsystem (phases 16-21) through clean admin API endpoints.
 * Auth is NOT added here — inherited from the parent admin/index.ts preHandler (platform_admin).
 *
 * Phase 22: Bridge Admin Surface (ADM-01 through ADM-04)
 */

import { FastifyInstance } from 'fastify';
import { pool } from '../../../db/client.js';
import { ok } from '../../../lib/envelope.js';
import { getBreakerState } from '../../../services/bridge/circuit-breaker-registry.js';
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
}
