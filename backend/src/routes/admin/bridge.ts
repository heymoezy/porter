import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/admin-envelope.js';
import { queryAll, execute } from '../../db/pg-helpers.js';
import { getCachedVersions, probeAllGateways } from '../../services/admin/gateway-versions.js';
import { postIntelligence, assessUpdateRisk } from '../../services/admin/agent-loop.js';
import { buildAllGatewayPromptProfiles } from '../../services/admin/prompt-pipeline.js';
import { emitAdminEvent } from '../../services/admin/admin-sse.js';
import { getCapacitySnapshot } from '../../services/bridge/rate-limit-tracker.js';
import { collectLocalUsage } from '../../services/bridge/usage-collector.js';

type UserApiKeyRow = {
  id: string;
  username: string;
  gateway_type: string;
  label: string;
  masked_display: string;
  created_at: number | null;
  rotated_at: number | null;
};

type GatewayRow = {
  id: string;
  type: string;
  name: string;
  url: string;
  auth_method: string;
  status: string;
  source: string;
  priority: number;
  capabilities: unknown;
  enabled: boolean;
  last_health_at: string | null;
  circuit_state: string;
  model_count: number;
};

type ModelRow = {
  id: string;
  gateway_id: string;
  gateway_name: string;
  gateway_type: string;
  model_name: string;
  capabilities: string[];
  context_window: number | null;
  pricing_input_per_m: number | null;
  pricing_output_per_m: number | null;
  is_active: number;
  created_at: number;
  updated_at: number;
};

type ModelVersionRow = {
  id: string;
  model_id: string;
  version_label: string;
  snapshot: Record<string, unknown>;
  detected_at: number;
};

type DispatchLogRow = {
  id: string;
  gateway_id: string | null;
  gateway_type: string;
  model_name: string;
  chosen_reason: string;
  alternatives: unknown;
  estimated_cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  latency_ms: number | null;
  agent_id: string | null;
  project_id: string | null;
  chat_id: string | null;
  rule_id: string | null;
  username: string | null;
  created_at: number | null;
};

type SessionTurnRow = {
  message_sequence: number;
  gateway_type: string;
  model_name: string;
  created_at: number | null;
  estimated_cost_usd: number | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
};

function statusIndicator(status: string): 'healthy' | 'degraded' | 'unavailable' | 'unknown' {
  if (status === 'active') return 'healthy';
  if (status === 'stale') return 'degraded';
  if (status === 'unavailable') return 'unavailable';
  return 'unknown';
}

/**
 * GWC-01: Normalize gateway capabilities for frontend display.
 * Returns both the structured record (if available) and a flat tag array for backward compat.
 */
function normalizeGatewayCapabilities(raw: unknown): {
  capabilities: unknown;
  capability_tags: string[];
  capability_record: Record<string, unknown> | null;
} {
  if (Array.isArray(raw)) {
    return { capabilities: raw, capability_tags: raw as string[], capability_record: null };
  }
  if (raw && typeof raw === 'object' && 'cost_tier' in raw) {
    const rec = raw as Record<string, unknown>;
    const tags = Array.isArray(rec.legacy_tags) ? (rec.legacy_tags as string[]) : [];
    return { capabilities: raw, capability_tags: tags, capability_record: rec };
  }
  return { capabilities: raw ?? [], capability_tags: [], capability_record: null };
}

export default async function bridgeRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/bridge — gateway dashboard data from Brain PostgreSQL
  fastify.get('/', async (_req, reply) => {
    const rows = await queryAll<GatewayRow & { metadata: Record<string, unknown>; model_names: string[] }>(`
      SELECT g.id, g.type, g.name, g.url, g.auth_method, g.status,
             g.source, g.priority, g.capabilities, g.enabled,
             g.last_health_at, g.circuit_state, g.metadata, g.masked_display,
             COUNT(m.id) FILTER (WHERE m.is_active = 1)::int AS model_count,
             COALESCE(
               ARRAY_AGG(m.model_name ORDER BY m.model_name) FILTER (WHERE m.id IS NOT NULL AND m.is_active = 1),
               ARRAY[]::TEXT[]
             ) AS model_names
      FROM gateways g
      LEFT JOIN models m ON m.gateway_id = g.id
      GROUP BY g.id
      ORDER BY g.priority ASC, g.created_at ASC
    `);

    const gateways = rows.map(row => {
      const caps = normalizeGatewayCapabilities(row.capabilities);
      return {
        ...row,
        ...caps,
        status_indicator: statusIndicator(row.status),
        briefing_slot: null,
      };
    });

    const summary = {
      total_gateways: gateways.length,
      healthy: gateways.filter(g => g.status_indicator === 'healthy').length,
      degraded: gateways.filter(g => g.status_indicator === 'degraded').length,
      unavailable: gateways.filter(g => g.status_indicator === 'unavailable').length,
      zeroConfigReady: gateways.some(g => g.status_indicator === 'healthy'),
    };

    return reply.send(ok({ gateways, summary }));
  });

  // GET /api/admin/bridge/models — active models with gateway info
  fastify.get('/models', async (_req, reply) => {
    const models = await queryAll<ModelRow>(`
      SELECT m.id, m.gateway_id, g.name AS gateway_name, g.type AS gateway_type,
             m.model_name, m.capabilities, m.context_window,
             m.pricing_input_per_m, m.pricing_output_per_m,
             m.is_active, m.created_at, m.updated_at
      FROM models m
      JOIN gateways g ON g.id = m.gateway_id
      WHERE m.is_active = 1
      ORDER BY g.priority ASC, m.model_name ASC
    `);

    return reply.send(ok({ models }));
  });

  // POST /api/admin/bridge/models/:id/toggle — toggle model active/inactive
  fastify.post('/models/:id/toggle', async (request, reply) => {
    const { id } = request.params as { id: string };
    await execute(
      `UPDATE models SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $1`,
      [id]
    );
    return reply.send(ok({ toggled: id }));
  });

  // GET /api/admin/bridge/models/:id/versions — version history for one model
  fastify.get('/models/:id/versions', async (request, reply) => {
    const { id } = request.params as { id: string };

    const versions = await queryAll<ModelVersionRow>(`
      SELECT id, model_id, version_label, snapshot, detected_at
      FROM model_versions
      WHERE model_id = $1
      ORDER BY detected_at DESC
      LIMIT 50
    `, [id]);

    return reply.send(ok({ versions }));
  });

  // GET /api/admin/bridge/dispatch-log — paginated dispatch log with optional filters (RT-01)
  fastify.get('/dispatch-log', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(q.page || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(q.limit || '50')));
    const offset = (page - 1) * limit;

    const filters: string[] = [];
    const params: unknown[] = [];

    if (q.agent_id) {
      params.push(q.agent_id);
      filters.push(`agent_id = $${params.length}`);
    }
    if (q.gateway_type) {
      params.push(q.gateway_type);
      filters.push(`gateway_type = $${params.length}`);
    }
    if (q.model_name) {
      params.push(q.model_name);
      filters.push(`model_name = $${params.length}`);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const countRows = await queryAll<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM bridge_dispatch_log ${where}
    `, params);
    const total = parseInt(countRows[0]?.count ?? '0');

    const entries = await queryAll<DispatchLogRow>(`
      SELECT id, gateway_id, gateway_type, model_name, chosen_reason, alternatives,
             estimated_cost_usd, input_tokens, output_tokens, cached_tokens,
             latency_ms, agent_id, project_id, chat_id, rule_id, username, created_at
      FROM bridge_dispatch_log
      ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    return reply.send(ok({
      entries,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    }));
  });

  // GET /api/admin/bridge/agent-stats — per-model dispatch breakdown for one agent (RT-04)
  fastify.get('/agent-stats', async (request, reply) => {
    const q = request.query as Record<string, string>;

    if (!q.agent_id) {
      return reply.send(err('MISSING_PARAM', 'agent_id query parameter is required'));
    }

    const rows = await queryAll<{
      model_name: string;
      gateway_type: string;
      dispatch_count: number;
      avg_latency_ms: number | null;
      total_cost_usd: number;
      total_input_tokens: number;
      total_output_tokens: number;
    }>(`
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
    `, [q.agent_id]);

    const total_dispatches = rows.reduce((sum, r) => sum + r.dispatch_count, 0);
    const total_cost_usd = rows.reduce((sum, r) => sum + Number(r.total_cost_usd), 0);

    return reply.send(ok({
      stats: rows,
      summary: {
        agent_id: q.agent_id,
        total_dispatches,
        total_cost_usd,
        model_count: rows.length,
      },
    }));
  });

  // GET /api/admin/bridge/session/:chatId/routing — ordered turns with cost/latency per turn (RT-05)
  fastify.get('/session/:chatId/routing', async (request, reply) => {
    const { chatId } = request.params as { chatId: string };

    const turns = await queryAll<SessionTurnRow>(`
      SELECT src.message_sequence, src.gateway_type, src.model_name,
             src.created_at,
             bdl.estimated_cost_usd, bdl.latency_ms,
             bdl.input_tokens, bdl.output_tokens
      FROM session_routing_context src
      LEFT JOIN bridge_dispatch_log bdl ON bdl.id = src.dispatch_log_id
      WHERE src.chat_id = $1
      ORDER BY src.message_sequence ASC
    `, [chatId]);

    return reply.send(ok({ chat_id: chatId, turns, turn_count: turns.length }));
  });

  // GET /api/admin/bridge/costs — spend dashboard data (COST-01, COST-03)
  fastify.get('/costs', async (request, reply) => {
    const q = request.query as Record<string, string>;

    const params: unknown[] = [];
    const filters: string[] = [];

    if (q.from_ts) {
      params.push(parseInt(q.from_ts));
      filters.push(`created_at >= $${params.length}`);
    }
    if (q.to_ts) {
      params.push(parseInt(q.to_ts));
      filters.push(`created_at <= $${params.length}`);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    // Summary totals
    const totalsRows = await queryAll<{
      total_cost_usd: number;
      total_input_tokens: number;
      total_output_tokens: number;
      total_dispatches: number;
    }>(`
      SELECT
        COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
        COALESCE(SUM(input_tokens), 0)::int AS total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::int AS total_output_tokens,
        COUNT(*)::int AS total_dispatches
      FROM bridge_dispatch_log
      ${where}
    `, params);

    // By gateway
    const byGateway = await queryAll<{
      gateway_type: string;
      total_cost_usd: number;
      dispatch_count: number;
    }>(`
      SELECT
        gateway_type,
        COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
        COUNT(*)::int AS dispatch_count
      FROM bridge_dispatch_log
      ${where}
      GROUP BY gateway_type
      ORDER BY total_cost_usd DESC
    `, params);

    // By model
    const byModel = await queryAll<{
      model_name: string;
      gateway_type: string;
      total_cost_usd: number;
      dispatch_count: number;
      total_input_tokens: number;
      total_output_tokens: number;
    }>(`
      SELECT
        model_name,
        gateway_type,
        COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
        COUNT(*)::int AS dispatch_count,
        COALESCE(SUM(input_tokens), 0)::int AS total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::int AS total_output_tokens
      FROM bridge_dispatch_log
      ${where}
      GROUP BY model_name, gateway_type
      ORDER BY total_cost_usd DESC
    `, params);

    // Daily trend — truncate created_at (unix epoch seconds) to day bucket
    // Use integer division: day_bucket = floor(created_at / 86400) * 86400
    const dailyTrend = await queryAll<{
      day_ts: number;
      total_cost_usd: number;
      dispatch_count: number;
    }>(`
      SELECT
        (FLOOR(created_at / 86400) * 86400)::int AS day_ts,
        COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
        COUNT(*)::int AS dispatch_count
      FROM bridge_dispatch_log
      ${where}
      GROUP BY day_ts
      ORDER BY day_ts ASC
    `, params);

    const totals = totalsRows[0] ?? {
      total_cost_usd: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_dispatches: 0,
    };

    return reply.send(ok({
      totals,
      by_gateway: byGateway,
      by_model: byModel,
      daily_trend: dailyTrend,
    }));
  });

  // GET /api/admin/bridge/attribution — cost attribution by user, project, or agent (COST-02)
  fastify.get('/attribution', async (request, reply) => {
    const q = request.query as Record<string, string>;
    // group_by: 'user' | 'project' | 'agent' — defaults to 'agent'
    const groupBy = (q.group_by === 'user' || q.group_by === 'project') ? q.group_by : 'agent';

    const params: unknown[] = [];
    const filters: string[] = [];

    if (q.from_ts) {
      params.push(parseInt(q.from_ts));
      filters.push(`created_at >= $${params.length}`);
    }
    if (q.to_ts) {
      params.push(parseInt(q.to_ts));
      filters.push(`created_at <= $${params.length}`);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const colMap: Record<string, string> = {
      agent: 'agent_id',
      project: 'project_id',
      user: 'username',
    };
    const groupCol = colMap[groupBy];

    const rows = await queryAll<{
      group_key: string | null;
      total_cost_usd: number;
      dispatch_count: number;
      total_input_tokens: number;
      total_output_tokens: number;
    }>(`
      SELECT
        ${groupCol} AS group_key,
        COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
        COUNT(*)::int AS dispatch_count,
        COALESCE(SUM(input_tokens), 0)::int AS total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::int AS total_output_tokens
      FROM bridge_dispatch_log
      ${where}
      GROUP BY ${groupCol}
      ORDER BY total_cost_usd DESC
      LIMIT 100
    `, params);

    return reply.send(ok({
      group_by: groupBy,
      rows,
    }));
  });

  // POST /api/admin/bridge/gateways — Gateway CRUD (CFG-01)
  fastify.post('/gateways', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const { action, ...data } = body as { action: string; [k: string]: unknown };

    // ── list ──────────────────────────────────────────────────────────────
    if (action === 'list') {
      const rows = await queryAll<{
        id: string; type: string; name: string; url: string | null;
        auth_method: string; status: string; source: string; priority: number;
        capabilities: unknown; metadata: unknown; enabled: number;
        circuit_state: string; last_health_at: number | null;
        created_at: number; updated_at: number; model_count: number;
      }>(`
        SELECT g.id, g.type, g.name, g.url, g.auth_method, g.status,
               g.source, g.priority, g.capabilities, g.metadata, g.enabled,
               g.circuit_state, g.last_health_at, g.created_at, g.updated_at,
               COUNT(m.id) FILTER (WHERE m.is_active = 1)::int AS model_count
        FROM gateways g
        LEFT JOIN models m ON m.gateway_id = g.id
        GROUP BY g.id
        ORDER BY g.priority ASC, g.created_at ASC
      `);
      return reply.send(ok({ gateways: rows }));
    }

    // ── remove ────────────────────────────────────────────────────────────
    if (action === 'remove') {
      const id = data.id as string | undefined;
      if (!id) return reply.send(err('MISSING_ID', 'id is required'));
      await execute('DELETE FROM gateways WHERE id = $1', [id]);
      return reply.send(ok({ removed: true, id }));
    }

    // ── add ───────────────────────────────────────────────────────────────
    if (action === 'add') {
      const VALID_TYPES = new Set(['ollama', 'openclaw', 'codex_cli', 'claude_cli', 'gemini_cli', 'openai_compat']);
      const type = data.type as string | undefined;
      const name = data.name as string | undefined;
      if (!type || !name) return reply.send(err('MISSING_FIELDS', 'type and name are required'));
      if (!VALID_TYPES.has(type)) return reply.send(err('INVALID_TYPE', `type must be one of: ${[...VALID_TYPES].join(', ')}`));
      const { randomUUID } = await import('node:crypto');
      const id = randomUUID();
      await execute(
        `INSERT INTO gateways (id, type, name, url, auth_method, status, source, priority, capabilities, metadata, enabled, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'unavailable','manual',$6,$7::jsonb,$8::jsonb,$9,EXTRACT(EPOCH FROM NOW()),EXTRACT(EPOCH FROM NOW()))`,
        [
          id, type, name,
          (data.url as string | null) ?? null,
          (data.auth_method as string) ?? 'none',
          (data.priority as number) ?? 50,
          JSON.stringify((data.capabilities as unknown[]) ?? []),
          JSON.stringify((data.metadata as Record<string, unknown>) ?? {}),
          (data.enabled as number) ?? 1,
        ]
      );
      return reply.send(ok({ created: true, id }));
    }

    // ── update ────────────────────────────────────────────────────────────
    if (action === 'update') {
      const id = data.id as string | undefined;
      if (!id) return reply.send(err('MISSING_ID', 'id is required'));
      const allowed: Record<string, string> = {
        name: 'name', url: 'url', auth_method: 'auth_method',
        priority: 'priority', enabled: 'enabled',
        masked_display: 'masked_display',
      };
      const setClauses: string[] = [];
      const params: unknown[] = [];
      for (const [key, col] of Object.entries(allowed)) {
        if (data[key] !== undefined) {
          params.push(data[key]);
          setClauses.push(`${col} = $${params.length}`);
        }
      }
      if (setClauses.length > 0) {
        setClauses.push(`updated_at = EXTRACT(EPOCH FROM NOW())`);
        params.push(id);
        await execute(`UPDATE gateways SET ${setClauses.join(', ')} WHERE id = $${params.length}`, params);
      }
      emitAdminEvent('bridge:config-changed', { gateway_id: id });
      return reply.send(ok({ updated: true, id }));
    }

    // ── validate — return current persisted status from Brain's DB ────────
    if (action === 'validate') {
      const id = data.id as string | undefined;
      if (!id) return reply.send(err('MISSING_ID', 'id is required'));
      const rows = await queryAll<{ status: string; last_health_at: number | null; name: string }>(
        'SELECT status, last_health_at, name FROM gateways WHERE id = $1', [id]
      );
      if (rows.length === 0) return reply.send(ok({ valid: false, error: 'NOT_FOUND' }));
      const gw = rows[0];
      return reply.send(ok({
        valid: gw.status === 'active',
        status: gw.status,
        last_health_at: gw.last_health_at,
        name: gw.name,
      }));
    }

    return reply.send(err('INVALID_ACTION', 'action must be one of: list, add, update, remove, validate'));
  });

  // GET /api/admin/bridge/user-keys — all users' masked API keys (CFG-03)
  fastify.get('/user-keys', async (_req, reply) => {
    const keys = await queryAll<UserApiKeyRow>(`
      SELECT id, username, gateway_type, label, masked_display, created_at, rotated_at
      FROM user_api_keys
      ORDER BY username ASC, gateway_type ASC, label ASC
    `);
    return reply.send(ok({ keys }));
  });

  // POST /api/admin/bridge/user-keys — delete or rotate a user API key (CFG-03)
  fastify.post('/user-keys', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const { action, ...data } = body as { action: string; [k: string]: unknown };

    // ── delete ────────────────────────────────────────────────────────────
    if (action === 'delete') {
      const id = data.id as string | undefined;
      if (!id) return reply.send(err('MISSING_ID', 'id is required'));
      await execute('DELETE FROM user_api_keys WHERE id = $1', [id]);
      return reply.send(ok({ deleted: true, id }));
    }

    // ── rotate ────────────────────────────────────────────────────────────
    if (action === 'rotate') {
      const id = data.id as string | undefined;
      const api_key = data.api_key as string | undefined;
      if (!id || !api_key) return reply.send(err('MISSING_FIELDS', 'id and api_key are required'));
      const masked = '***' + api_key.slice(-4);
      await execute(
        `UPDATE user_api_keys SET encrypted_value = $1, masked_display = $2, rotated_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $3`,
        [api_key, masked, id]
      );
      return reply.send(ok({ rotated: true, id, masked_display: masked }));
    }

    return reply.send(err('INVALID_ACTION', 'action must be one of: delete, rotate'));
  });

  // POST /api/admin/bridge/gateways/save-token — save token to metadata.token + masked_display
  // Brain reads from metadata.token for dispatch auth (see openclaw adapter line 34)
  fastify.post('/gateways/save-token', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const gateway_id = body.gateway_id as string | undefined;
    const token = body.token as string | undefined;
    if (!gateway_id || !token) return reply.send(err('MISSING_FIELDS', 'gateway_id and token are required'));

    const rows = await queryAll<{ name: string }>('SELECT name FROM gateways WHERE id = $1', [gateway_id]);
    if (rows.length === 0) return reply.send(err('NOT_FOUND', 'Gateway not found'));
    const gwName = rows[0].name;
    const username = request.sessionUser?.username || 'admin';

    // Save to metadata.token (Brain's adapter reads this) + masked_display
    await execute(
      `UPDATE gateways SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{token}', to_jsonb($1::text)), masked_display = $1, updated_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $2`,
      [token, gateway_id]
    );

    // Log to Intelligence
    await postIntelligence({
      sourceAgent: 'bridge-operator',
      entryType: 'learning',
      title: `[manual] Gateway token changed: ${gwName}`,
      body: `${username} updated the gateway token for ${gwName}. Brain will use the new token on next dispatch.`,
      metadata: { action: 'token_change', gateway_id, initiated_by: username },
    }).catch(() => {});

    emitAdminEvent('bridge:config-changed', { gateway_id, gateway_name: gwName, field: 'token' });
    return reply.send(ok({ saved: true, gateway_id }));
  });

  // POST /api/admin/bridge/gateways/restart — restart a gateway process
  fastify.post('/gateways/restart', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const gateway_id = body.gateway_id as string | undefined;
    if (!gateway_id) return reply.send(err('MISSING_FIELD', 'gateway_id is required'));

    const rows = await queryAll<{ type: string; name: string; metadata: Record<string, unknown> }>(
      'SELECT type, name, metadata FROM gateways WHERE id = $1', [gateway_id]
    );
    if (rows.length === 0) return reply.send(err('NOT_FOUND', 'Gateway not found'));

    const gw = rows[0];
    const meta = (typeof gw.metadata === 'object' && gw.metadata !== null ? gw.metadata : {}) as Record<string, unknown>;
    const { execSync } = await import('child_process');

    try {
      let output = '';

      if (gw.type === 'ollama') {
        // Ollama runs as system service
        output = execSync('sudo systemctl restart ollama 2>&1 || systemctl --user restart ollama 2>&1', { timeout: 15_000, encoding: 'utf8' });
      } else if (gw.type === 'openclaw') {
        // OpenClaw: kill all processes, restart main + gateway
        execSync('pkill -f "^openclaw" 2>/dev/null || true', { timeout: 5_000, encoding: 'utf8' });
        // Give processes time to die
        execSync('sleep 2', { timeout: 5_000, encoding: 'utf8' });
        // Restart in background
        const bp = (meta.binary_path as string) || 'openclaw';
        execSync(`nohup ${bp} > /dev/null 2>&1 &`, { timeout: 5_000, encoding: 'utf8', shell: '/bin/bash' });
        output = `Killed openclaw processes and restarted ${bp}`;
      } else {
        // CLI gateways don't have persistent processes — nothing to restart
        return reply.send(ok({ restarted: false, message: `${gw.name} is a CLI tool — no persistent process to restart` }));
      }

      // Re-probe after restart
      setTimeout(() => probeAllGateways().catch(() => {}), 5_000);

      emitAdminEvent('bridge:restarted', { gateway_id, gateway_name: gw.name });
      return reply.send(ok({ restarted: true, output: output.trim(), gateway_name: gw.name }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.send(ok({ restarted: false, error: message }));
    }
  });

  // POST /api/admin/bridge/gateways/run-update — execute update_cmd for a gateway
  fastify.post('/gateways/run-update', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const gateway_type = body.gateway_type as string | undefined;
    if (!gateway_type) return reply.send(err('MISSING_FIELD', 'gateway_type is required'));

    const versions = getCachedVersions();
    const info = versions.find(v => v.gateway_type === gateway_type);
    if (!info?.update_cmd) return reply.send(err('NO_UPDATE', 'No update command available'));

    const username = request.sessionUser?.username || 'admin';

    // Log action to Intelligence Feed
    await postIntelligence({
      sourceAgent: 'bridge-operator',
      entryType: 'learning',
      title: `[manual] Update initiated: ${info.gateway_name} ${info.version} → ${info.latest}`,
      body: `${username} triggered update for ${info.gateway_name}.\nCommand: ${info.update_cmd}`,
      metadata: { action: 'gateway_update_start', gateway_type, initiated_by: username, risk_level: assessUpdateRisk(info.version, info.latest) },
    }).catch(() => {});

    try {
      const { execSync } = await import('child_process');
      const output = execSync(info.update_cmd, { timeout: 120_000, encoding: 'utf8', env: { ...process.env, PATH: process.env.PATH } });

      // Re-probe and wait — verify the version actually changed
      const newVersions = await probeAllGateways();
      const newInfo = newVersions.find(v => v.gateway_type === gateway_type);
      const versionChanged = newInfo?.version !== info.version;

      // Log result to Intelligence Feed
      await postIntelligence({
        sourceAgent: 'bridge-operator',
        entryType: versionChanged ? 'capability' : 'learning',
        title: versionChanged
          ? `${info.gateway_name} updated: ${info.version} → ${newInfo?.version}`
          : `${info.gateway_name} reinstalled (still ${newInfo?.version})`,
        body: versionChanged
          ? `Successfully updated. Process may need restart to use new version.`
          : `Package reinstalled but version unchanged. May already be at latest or process needs restart.`,
        metadata: { action: 'gateway_update_complete', gateway_type, old_version: info.version, new_version: newInfo?.version, version_changed: versionChanged, initiated_by: username },
      }).catch(() => {});

      emitAdminEvent('bridge:updated', { gateway_type, old_version: info.version, new_version: newInfo?.version, version_changed: versionChanged });
      return reply.send(ok({
        success: true,
        output: output.trim(),
        update_cmd: info.update_cmd,
        old_version: info.version,
        new_version: newInfo?.version ?? null,
        version_changed: versionChanged,
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);

      // Log failure to Intelligence Feed
      await postIntelligence({
        sourceAgent: 'bridge-operator',
        entryType: 'blocker',
        title: `Update failed: ${info.gateway_name}`,
        body: `Update command failed: ${message}\n\nCommand: ${info.update_cmd}`,
        metadata: { action: 'gateway_update_failed', gateway_type, error: message, initiated_by: username },
      }).catch(() => {});

      return reply.send(ok({ success: false, error: message, update_cmd: info.update_cmd }));
    }
  });

  // GET /api/admin/bridge/prompts — system prompt profiles per gateway
  fastify.get('/prompts', async (_req, reply) => {
    const profiles = await buildAllGatewayPromptProfiles();
    return reply.send(ok({ profiles }));
  });

  // GET /api/admin/bridge/versions — cached version info (instant, probed at startup)
  fastify.get('/versions', async (_req, reply) => {
    return reply.send(ok({ versions: getCachedVersions() }));
  });

  // POST /api/admin/bridge/versions/refresh — re-probe all gateways
  fastify.post('/versions/refresh', async (_req, reply) => {
    const versions = await probeAllGateways();
    return reply.send(ok({ versions }));
  });

  // POST /api/admin/bridge/speed-test — ping gateway, fetch version, update DB
  fastify.post('/speed-test', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const gateway_id = body.gateway_id as string | undefined;

    if (!gateway_id) {
      return reply.send(err('MISSING_FIELD', 'gateway_id is required'));
    }

    const rows = await queryAll<{ id: string; type: string; name: string; url: string | null; status: string; metadata: Record<string, unknown> }>(
      'SELECT id, type, name, url, status, metadata FROM gateways WHERE id = $1',
      [gateway_id]
    );

    if (rows.length === 0) {
      return reply.send(err('NOT_FOUND', 'Gateway not found'));
    }

    const gw = rows[0];
    const meta = (typeof gw.metadata === 'object' && gw.metadata !== null ? gw.metadata : {}) as Record<string, unknown>;
    const start = Date.now();
    let version: string | undefined;

    try {
      if (gw.url) {
        const base = gw.url.replace(/\/$/, '');
        // Health check
        const healthUrl = base + (gw.type === 'ollama' ? '/api/tags' : '/models');
        await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });

        // Fetch version (best-effort)
        try {
          if (gw.type === 'ollama') {
            const vResp = await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(3000) });
            if (vResp.ok) { const d = await vResp.json() as { version?: string }; version = d.version; }
          } else if (gw.type === 'openclaw') {
            // OpenClaw /health has no version field — try it, then CLI fallback
            const vResp = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
            if (vResp.ok) {
              const d = await vResp.json() as Record<string, unknown>;
              const v = d.version ?? d.server_version ?? d.openclaw_version;
              if (typeof v === 'string') version = v;
            }
            if (!version) {
              try {
                const { execSync } = await import('child_process');
                const out = execSync('openclaw --version 2>&1', { timeout: 5000, encoding: 'utf8' });
                const match = out.match(/(\d+\.\d+[\.\d]*)/);
                if (match) version = match[1];
              } catch { /* CLI fallback best-effort */ }
            }
          }
        } catch { /* version fetch is best-effort */ }
      } else {
        // CLI-based gateways — check binary exists via which
        const binaryPath = meta.binary_path as string | undefined;
        if (binaryPath) {
          try {
            const { execSync } = await import('child_process');
            const out = execSync(`${binaryPath} --version 2>&1 || true`, { timeout: 5000, encoding: 'utf8' });
            const match = out.match(/(\d+\.\d+[\.\d]*)/);
            if (match) version = match[1];
          } catch { /* version detection best-effort */ }
        }
      }

      const latency_ms = Date.now() - start;

      // Update DB: last_health_at + version in metadata
      await queryAll(
        `UPDATE gateways SET last_health_at = EXTRACT(EPOCH FROM NOW())${version ? `, metadata = jsonb_set(COALESCE(metadata, '{}'), '{version}', to_jsonb($2::text))` : ''} WHERE id = $1`,
        version ? [gateway_id, version] : [gateway_id]
      );

      return reply.send(ok({ ok: true, gateway_id, gateway_name: gw.name, latency_ms, version }));
    } catch (e: unknown) {
      const latency_ms = Date.now() - start;
      const message = e instanceof Error ? e.message : 'Unknown error';
      return reply.send(ok({ ok: false, gateway_id, gateway_name: gw.name, latency_ms, error: message }));
    }
  });

  // GET /api/admin/bridge/capacity — rate limit snapshot for all gateways
  fastify.get('/capacity', async (_req, reply) => {
    const snapshot = await getCapacitySnapshot();
    return reply.send(ok({ gateways: snapshot }));
  });

  // POST /api/admin/bridge/capacity/refresh — force fresh usage collection
  fastify.post('/capacity/refresh', async (_req, reply) => {
    await collectLocalUsage({ forceAuthRefresh: true });
    const snapshot = await getCapacitySnapshot();
    return reply.send(ok({ gateways: snapshot, refreshed: true }));
  });

  // POST /api/admin/bridge/capacity — set manual rate limit for a gateway
  fastify.post('/capacity', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const gateway_id = body.gateway_id as string | undefined;
    const limit_type = body.limit_type as string | undefined;
    const period = (body.period as string | undefined) ?? 'minute';
    const model_name = (body.model_name as string | undefined) ?? null;
    const limit_value = body.limit_value as number | undefined;

    if (!gateway_id || !limit_type) {
      return reply.send(err('MISSING_FIELDS', 'gateway_id and limit_type are required'));
    }

    const VALID_TYPES = new Set(['requests', 'tokens', 'input_tokens', 'output_tokens']);
    if (!VALID_TYPES.has(limit_type)) {
      return reply.send(err('INVALID_TYPE', `limit_type must be one of: ${[...VALID_TYPES].join(', ')}`));
    }

    const VALID_PERIODS = new Set(['minute', 'daily', 'weekly', 'monthly']);
    if (!VALID_PERIODS.has(period)) {
      return reply.send(err('INVALID_PERIOD', `period must be one of: ${[...VALID_PERIODS].join(', ')}`));
    }

    // Verify gateway exists
    const gwRows = await queryAll<{ id: string }>('SELECT id FROM gateways WHERE id = $1', [gateway_id]);
    if (gwRows.length === 0) {
      return reply.send(err('NOT_FOUND', 'Gateway not found'));
    }

    const { randomUUID } = await import('node:crypto');
    const id = randomUUID();
    const now = Date.now() / 1000;

    await execute(
      `INSERT INTO gateway_rate_limits (id, gateway_id, model_name, limit_type, period, limit_value, current_value, source, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 'configured', $7)
       ON CONFLICT (gateway_id, COALESCE(model_name, ''), limit_type, period) DO UPDATE SET
         limit_value = EXCLUDED.limit_value,
         source = 'configured',
         updated_at = EXCLUDED.updated_at`,
      [id, gateway_id, model_name, limit_type, period, limit_value ?? null, now]
    );

    return reply.send(ok({ saved: true, gateway_id, model_name, limit_type, period, limit_value }));
  });

  // GET /api/admin/bridge/metrics — per-gateway p95 latency, success %, 429 rate
  fastify.get('/metrics', async (_req, reply) => {
    const oneHourAgo = Date.now() / 1000 - 3600;

    const rows = await queryAll<{
      gateway_id: string;
      gateway_type: string;
      total_dispatches: number;
      success_count: number;
      error_429_count: number;
      p95_latency_ms: number | null;
      avg_latency_ms: number | null;
      total_input_tokens: number;
      total_output_tokens: number;
      total_cost_usd: number;
    }>(`
      SELECT
        gateway_id,
        gateway_type,
        COUNT(*)::int AS total_dispatches,
        COUNT(*) FILTER (WHERE latency_ms IS NOT NULL AND latency_ms > 0)::int AS success_count,
        0::int AS error_429_count,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS p95_latency_ms,
        ROUND(AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL)::numeric, 1) AS avg_latency_ms,
        COALESCE(SUM(input_tokens), 0)::int AS total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::int AS total_output_tokens,
        COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd
      FROM bridge_dispatch_log
      WHERE created_at >= $1 AND gateway_id IS NOT NULL
      GROUP BY gateway_id, gateway_type
      ORDER BY total_dispatches DESC
    `, [oneHourAgo]);

    // Fetch 429 counts from gateway_rate_limits (accumulated across all time)
    const rateLimitRows = await queryAll<{
      gateway_id: string;
      total_429_count: number;
      last_429_at: number | null;
    }>(`
      SELECT gateway_id,
             MAX(total_429_count)::int AS total_429_count,
             MAX(last_429_at) AS last_429_at
      FROM gateway_rate_limits
      GROUP BY gateway_id
    `);

    const rateLimitMap = new Map<string, { total_429_count: number; last_429_at: number | null }>();
    for (const r of rateLimitRows) {
      rateLimitMap.set(r.gateway_id, { total_429_count: r.total_429_count, last_429_at: r.last_429_at });
    }

    const metrics = rows.map(row => {
      const rl = rateLimitMap.get(row.gateway_id);
      const successRate = row.total_dispatches > 0
        ? Math.round((row.success_count / row.total_dispatches) * 10000) / 100
        : null;

      return {
        gateway_id: row.gateway_id,
        gateway_type: row.gateway_type,
        total_dispatches: row.total_dispatches,
        success_count: row.success_count,
        success_rate_pct: successRate,
        error_429_count: rl?.total_429_count ?? 0,
        last_429_at: rl?.last_429_at ?? null,
        p95_latency_ms: row.p95_latency_ms ? Math.round(row.p95_latency_ms) : null,
        avg_latency_ms: row.avg_latency_ms,
        total_input_tokens: row.total_input_tokens,
        total_output_tokens: row.total_output_tokens,
        total_cost_usd: row.total_cost_usd,
      };
    });

    return reply.send(ok({
      period: 'last_hour',
      from_ts: oneHourAgo,
      metrics,
    }));
  });

  // GET /api/admin/bridge/sessions — active session registry for Vigil BRG-01
  fastify.get('/sessions', async (request, reply) => {
    const query = request.query as { limit?: string; status?: string };
    const limit = Math.min(parseInt(query.limit ?? '50', 10), 200);
    const status = query.status ?? 'active';

    const rows = await queryAll<{
      id: string;
      chat_id: string | null;
      agent_id: string | null;
      username: string | null;
      gateway_type: string | null;
      model_name: string | null;
      tokens_used: number;
      token_budget: number;
      context_msgs: number;
      status: string;
      created_at: number;
      last_active_at: number;
    }>(
      `SELECT id, chat_id, agent_id, username, gateway_type, model_name,
              tokens_used, token_budget, context_msgs, status, created_at, last_active_at
       FROM session_registry
       WHERE status = $1
       ORDER BY last_active_at DESC
       LIMIT $2`,
      [status, limit],
    );

    const sessions = rows.map(r => ({
      ...r,
      context_pct: r.token_budget > 0
        ? Math.round((r.tokens_used / r.token_budget) * 1000) / 10
        : 0,
    }));

    return reply.send(ok({ sessions, count: sessions.length }));
  });

  // GET /api/admin/bridge/patterns — intelligence patterns for Vigil BRG-03
  fastify.get('/patterns', async (request, reply) => {
    const query = request.query as { limit?: string; status?: string };
    const limit = Math.min(parseInt(query.limit ?? '20', 10), 100);
    const status = query.status ?? null;

    const rows = await queryAll<{
      id: string;
      pattern_type: string;
      gateway_type: string | null;
      agent_id: string | null;
      summary: string;
      confidence: number;
      status: string;
      promoted_to_concept_id: string | null;
      created_at: number;
    }>(
      `SELECT id, pattern_type, gateway_type, agent_id, summary,
              confidence, status, promoted_to_concept_id, created_at
       FROM intelligence_patterns
       ${status ? 'WHERE status = $2' : ''}
       ORDER BY created_at DESC
       LIMIT $1`,
      status ? [limit, status] : [limit],
    );

    return reply.send(ok({ patterns: rows, count: rows.length }));
  });

  // GET /api/admin/bridge/msgbus — message bus events for Vigil BRG-02
  fastify.get('/msgbus', async (request, reply) => {
    const query = request.query as { limit?: string; since?: string };
    const limit = Math.min(parseInt(query.limit ?? '30', 10), 100);
    const since = query.since ? parseFloat(query.since) : null;

    const rows = await queryAll<{
      id: string;
      correlation_id: string | null;
      source_agent: string | null;
      source_gateway: string | null;
      target_agent: string | null;
      target_gateway: string | null;
      intent: string;
      status: string;
      created_at: number;
      delivered_at: number | null;
      latency_ms: number | null;
    }>(
      `SELECT id, correlation_id, source_agent, source_gateway,
              target_agent, target_gateway, intent, status, created_at, delivered_at, latency_ms
       FROM msg_bus_events
       ${since ? 'WHERE created_at > $2' : ''}
       ORDER BY created_at DESC
       LIMIT $1`,
      since ? [limit, since] : [limit],
    );

    return reply.send(ok({ events: rows, count: rows.length }));
  });

  // GET /api/admin/bridge/dispatches/:id/context — ACX-05: Context pressure for a dispatch
  fastify.get('/dispatches/:id/context', async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await queryAll<{
      id: string;
      context_stats: Record<string, unknown> | null;
      input_tokens: number | null;
      output_tokens: number | null;
    }>(
      `SELECT id, context_stats, input_tokens, output_tokens
       FROM bridge_dispatch_log WHERE id = $1`,
      [id],
    );

    if (!rows.length) {
      return reply.status(404).send(err('NOT_FOUND', `Dispatch ${id} not found`));
    }

    const row = rows[0];

    // Return context_stats if present, or a zeroed-out fallback
    const stats = row.context_stats ?? {
      memory: { tiers_used: [], total_memory_tokens: 0, budget_tokens: 0 },
      directives: { total_active: 0, injected: 0, skipped: 0, scoring_mode: 'all' },
      skills: { candidates: 0, selected: 0, prompt_tokens: 0 },
      compression: { tool_outputs_compressed: 0, conversation_turns_compressed: 0, tokens_saved: 0 },
      session: { turn_number: 0, context_pct: 0, compression_events: 0, tokens_reclaimed: 0 },
    };

    return reply.send(ok({
      dispatch_id: row.id,
      context_stats: stats,
      input_tokens: row.input_tokens,
      output_tokens: row.output_tokens,
    }));
  });

  // GET /api/admin/bridge/sessions/:id/context-pressure — ACX-05: Session pressure timeline
  fastify.get('/sessions/:id/context-pressure', async (request, reply) => {
    const { id } = request.params as { id: string };

    const sessionRows = await queryAll<{
      id: string;
      chat_id: string | null;
      agent_id: string | null;
      created_at: number;
    }>(
      `SELECT id, chat_id, agent_id, created_at
       FROM session_registry
       WHERE id = $1 OR chat_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [id],
    );

    if (!sessionRows.length) {
      return reply.status(404).send(err('NOT_FOUND', `Session ${id} not found`));
    }

    const session = sessionRows[0];

    const filterClauses: string[] = [];
    const params: unknown[] = [];

    if (session.chat_id) {
      params.push(session.chat_id);
      filterClauses.push(`chat_id = $${params.length}`);
    }
    if (session.agent_id) {
      params.push(session.agent_id);
      filterClauses.push(`agent_id = $${params.length}`);
    }

    if (!filterClauses.length) {
      return reply.send(ok({ session_id: id, turns: [] }));
    }

    params.push(session.created_at);
    const timeFilter = `created_at >= $${params.length}`;

    const dispatchRows = await queryAll<{
      id: string;
      context_stats: Record<string, unknown> | null;
      created_at: number | null;
    }>(
      `SELECT id, context_stats, created_at
       FROM bridge_dispatch_log
       WHERE (${filterClauses.join(' OR ')}) AND ${timeFilter}
       ORDER BY created_at ASC`,
      params,
    );

    const turns = dispatchRows.map((row, idx) => {
      const cs = row.context_stats as {
        session?: { turn_number?: number; context_pct?: number; compression_events?: number };
      } | null;
      const s = cs?.session;
      return {
        turn: s?.turn_number ?? (idx + 1),
        context_pct: s?.context_pct ?? null,
        compression_event: (s?.compression_events ?? 0) > 0,
        dispatch_id: row.id,
        created_at: row.created_at,
      };
    });

    return reply.send(ok({
      session_id: session.id,
      chat_id: session.chat_id,
      turns,
    }));
  });

  // GET /api/admin/bridge/confidence — per-gateway outcome confidence scores
  // (routing-confidence removed — single gateway, confidence scoring is moot)
  fastify.get('/confidence', async (_req, reply) => {
    return reply.send(ok({ confidence: [] }));
  });
}
