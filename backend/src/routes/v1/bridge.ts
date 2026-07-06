import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import crypto from 'node:crypto';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { detectAndUpsertGateways, type DetectionReport } from '../../services/bridge/startup-detector.js';
import { createAdapter } from '../../services/bridge/adapters/index.js';
import { encryptCredential, validatePorterSecret } from '../../lib/credential-crypto.js';
import { routingEngine } from '../../services/bridge/routing-engine.js';
import { sanitizeSimulateFailure, type FailoverRecord } from '../../services/bridge/failover.js';
import type {
  GatewayRow,
  AgentMessageRequest,
  AgentMessageResponse,
  RoutingContext,
} from '../../services/bridge/types.js';
import { logMsgBusEvent, updateMsgBusEvent } from '../../services/msg-bus.js';

/** Maximum Bridge hops before a request is rejected to prevent loops. */
const MAX_AGENT_HOPS = 3;

// ── Row mappers ───────────────────────────────────────────────────────────────

/**
 * Strips raw DB row down to safe gateway fields.
 * The raw encrypted credential column is never included in the output.
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
  };
}

/**
 * Returns credential row with only masked_display — never the raw key value.
 * This is the core security guarantee of GW-07.
 */
function maskCredentialRow(row: any) {
  return {
    id: row.id,
    gateway_id: row.gateway_id,
    label: row.label,
    masked_display: row.masked_display || '',
    created_at: row.created_at,
    rotated_at: row.rotated_at ?? null,
  };
}

/** Valid gateway types — used for input validation in setup routes. */
const VALID_GATEWAY_TYPES = new Set([
  'ollama', 'openclaw', 'codex_cli', 'claude_cli', 'antigravity_cli', 'gemini_cli', 'openai_compat',
]);

/**
 * Maps a raw PostgreSQL row to a typed GatewayRow (camelCase fields).
 * Mirrors the same helper in startup-detector.ts — used here to instantiate adapters.
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

function splitTargetGateway(value?: string): { gatewayType?: string; modelName?: string } {
  if (!value) return {};
  const idx = value.indexOf(':');
  if (idx === -1) return { gatewayType: value };
  return {
    gatewayType: value.slice(0, idx),
    modelName: value.slice(idx + 1) || undefined,
  };
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export default async function bridgeV1Routes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions,
) {
  // ── GET /detect — full gateway discovery with live health and models ─────────
  fastify.get('/detect', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    // Admin-only: detection re-runs upserts and model catalog refresh
    if (!['platform_admin', 'admin'].includes(request.sessionUser!.role ?? '')) {
      return reply.code(403).send(err('FORBIDDEN', 'Admin required'));
    }

    const report: DetectionReport = await detectAndUpsertGateways(pool);
    return reply.send(ok(report));
  });

  // ── GET /gateways — list all gateways with masked credentials ────────────────
  fastify.get('/gateways', {
    preHandler: [fastify.requireAuth],
  }, async (_request, reply) => {
    const { rows: gatewayRows } = await pool.query(
      'SELECT * FROM gateways ORDER BY priority ASC, created_at ASC',
    );

    const gateways = await Promise.all(
      gatewayRows.map(async (gw: any) => {
        const { rows: credRows } = await pool.query(
          'SELECT * FROM gateway_credentials WHERE gateway_id = $1 ORDER BY label ASC',
          [gw.id],
        );
        return {
          ...maskGatewayRow(gw),
          credentials: credRows.map(maskCredentialRow),
        };
      }),
    );

    return reply.send(ok({ gateways }));
  });

  // ── POST /redetect — admin-only re-scan of available gateways ────────────────
  fastify.post('/redetect', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (!['platform_admin', 'admin'].includes(request.sessionUser!.role ?? '')) {
      return reply.code(403).send(err('FORBIDDEN', 'Admin required'));
    }

    // Delete auto-detected + env-bootstrapped rows (cascade removes their credentials).
    // Manual entries are preserved.
    await pool.query(
      `DELETE FROM gateways WHERE source IN ('auto_detected', 'env_bootstrap')`,
    );

    // Re-run full detection + env bootstrap
    await detectAndUpsertGateways(pool);

    // Return fresh state
    const { rows: gatewayRows } = await pool.query(
      'SELECT * FROM gateways ORDER BY priority ASC, created_at ASC',
    );

    const gateways = await Promise.all(
      gatewayRows.map(async (gw: any) => {
        const { rows: credRows } = await pool.query(
          'SELECT * FROM gateway_credentials WHERE gateway_id = $1 ORDER BY label ASC',
          [gw.id],
        );
        return {
          ...maskGatewayRow(gw),
          credentials: credRows.map(maskCredentialRow),
        };
      }),
    );

    return reply.send(ok({ gateways, redetected: true }));
  });

  // ── POST /setup/detect — wizard step 1: run detection, return DetectionReport ─
  fastify.post('/setup/detect', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (!['platform_admin', 'admin'].includes(request.sessionUser!.role ?? '')) {
      return reply.code(403).send(err('FORBIDDEN', 'Admin required'));
    }

    const report: DetectionReport = await detectAndUpsertGateways(pool);
    return reply.send(ok(report));
  });

  // ── POST /setup/configure — wizard step 2: save gateway config with optional credential ─
  fastify.post('/setup/configure', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (!['platform_admin', 'admin'].includes(request.sessionUser!.role ?? '')) {
      return reply.code(403).send(err('FORBIDDEN', 'Admin required'));
    }

    const body = request.body as { type?: string; url?: string; token?: string };
    const { type, url, token } = body;

    if (!type || !VALID_GATEWAY_TYPES.has(type)) {
      return reply.send(err('INVALID_TYPE', `Unknown gateway type: ${type}`));
    }

    // Look up existing gateway for this type
    const { rows } = await pool.query(
      'SELECT * FROM gateways WHERE type = $1 LIMIT 1',
      [type]
    );

    let gatewayId: string;

    if (rows.length === 0) {
      // INSERT a new manual gateway row
      gatewayId = crypto.randomUUID();
      const authMethod = token ? 'bearer_token' : 'none';
      await pool.query(
        `INSERT INTO gateways (id, type, name, url, auth_method, status, source, priority, capabilities, metadata, enabled, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', 'manual', 10, '[]', '{}', 1, EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
        [gatewayId, type, type, url ?? null, authMethod]
      );
    } else {
      gatewayId = rows[0].id;
      if (url) {
        await pool.query(
          'UPDATE gateways SET url = $1, updated_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $2',
          [url, gatewayId]
        );
      }
    }

    // Encrypt and store credential if token provided
    if (token) {
      if (!validatePorterSecret()) {
        return reply.send(err('CONFIG_ERROR', 'PORTER_SECRET not set — cannot store credentials securely'));
      }
      const encrypted = encryptCredential(token);
      const masked = '****...' + token.slice(-4);
      const credId = crypto.createHash('sha256').update(`${type}:manual:primary`).digest('hex').slice(0, 36);
      await pool.query(
        `INSERT INTO gateway_credentials (id, gateway_id, label, encrypted_value, masked_display, created_at)
         VALUES ($1, $2, 'primary', $3, $4, EXTRACT(EPOCH FROM NOW()))
         ON CONFLICT (id) DO UPDATE SET
           encrypted_value = EXCLUDED.encrypted_value,
           masked_display  = EXCLUDED.masked_display`,
        [credId, gatewayId, encrypted, masked]
      );
    }

    return reply.send(ok({ configured: true, type, hasCredential: !!token }));
  });

  // ── POST /setup/validate — wizard step 3: live health check via adapter ──────
  fastify.post('/setup/validate', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (!['platform_admin', 'admin'].includes(request.sessionUser!.role ?? '')) {
      return reply.code(403).send(err('FORBIDDEN', 'Admin required'));
    }

    const body = request.body as { type?: string };
    const { type } = body;

    if (!type || !VALID_GATEWAY_TYPES.has(type)) {
      return reply.send(err('INVALID_TYPE', `Unknown gateway type: ${type}`));
    }

    // Look up enabled gateway — not found returns structured error, not 500
    const { rows } = await pool.query(
      'SELECT * FROM gateways WHERE type = $1 AND enabled = 1 LIMIT 1',
      [type]
    );

    if (rows.length === 0) {
      return reply.send(ok({
        valid: false,
        error: 'GATEWAY_NOT_FOUND',
        message: `No gateway of type ${type} found. Run /setup/detect or /setup/configure first.`,
      }));
    }

    const gatewayRow = mapRawToGatewayRow(rows[0]);
    const adapter = createAdapter(gatewayRow);

    if (!adapter) {
      return reply.send(ok({
        valid: false,
        error: 'UNSUPPORTED_TYPE',
        message: `No adapter for type: ${type}`,
      }));
    }

    try {
      const health = await adapter.health();
      return reply.send(ok({ valid: health.healthy, latencyMs: health.latencyMs, error: health.error }));
    } catch (e) {
      return reply.send(ok({
        valid: false,
        error: 'HEALTH_CHECK_FAILED',
        message: e instanceof Error ? e.message : String(e),
      }));
    }
  });

  // ── GET /session/:chatId/routing — INT-03: Session routing history ─────────
  fastify.get('/session/:chatId/routing', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { chatId } = request.params as { chatId: string };

    if (!chatId) {
      return reply.send(err('MISSING_PARAM', 'chatId path parameter is required'));
    }

    const { rows } = await pool.query(`
      SELECT src.message_sequence, src.gateway_type, src.model_name,
             src.created_at,
             bdl.estimated_cost_usd, bdl.latency_ms,
             bdl.input_tokens, bdl.output_tokens
      FROM session_routing_context src
      LEFT JOIN bridge_dispatch_log bdl ON bdl.id = src.dispatch_log_id
      WHERE src.chat_id = $1
      ORDER BY src.message_sequence ASC
    `, [chatId]);

    return reply.send(ok({
      chat_id: chatId,
      turns: rows,
      turn_count: rows.length,
    }));
  });

  // ── GET /user-keys — MT-01: List user's own API keys (masked) ─────────────
  fastify.get('/user-keys', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const username = request.sessionUser!.username;
    const { rows } = await pool.query(
      `SELECT id, gateway_type, label, masked_display, created_at, rotated_at
       FROM user_api_keys
       WHERE username = $1
       ORDER BY gateway_type ASC, label ASC`,
      [username]
    );
    return reply.send(ok({ keys: rows }));
  });

  // ── POST /user-keys — MT-01: Store/rotate/delete user API key ─────────────
  fastify.post('/user-keys', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const username = request.sessionUser!.username;
    const body = request.body as Record<string, any>;
    const { action } = body;

    // ── action = 'store' — store or rotate an API key
    if (action === 'store') {
      const { gateway_type, api_key, label } = body;
      if (!gateway_type || !api_key) {
        return reply.send(err('MISSING_FIELDS', 'gateway_type and api_key are required'));
      }
      if (!validatePorterSecret()) {
        return reply.send(err('CONFIG_ERROR', 'PORTER_SECRET not set — cannot store credentials securely'));
      }

      const encrypted = encryptCredential(api_key);
      const masked = '***' + api_key.slice(-4);
      const keyLabel = label || 'primary';
      const id = crypto.createHash('sha256')
        .update(`user:${username}:${gateway_type}:${keyLabel}`)
        .digest('hex').slice(0, 36);

      await pool.query(
        `INSERT INTO user_api_keys (id, username, gateway_type, label, encrypted_value, masked_display, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, EXTRACT(EPOCH FROM NOW()))
         ON CONFLICT (username, gateway_type, label) DO UPDATE SET
           encrypted_value = EXCLUDED.encrypted_value,
           masked_display  = EXCLUDED.masked_display,
           rotated_at      = EXTRACT(EPOCH FROM NOW())`,
        [id, username, gateway_type, keyLabel, encrypted, masked]
      );

      return reply.send(ok({ stored: true, gateway_type, label: keyLabel, masked_display: masked }));
    }

    // ── action = 'delete' — remove a user API key
    if (action === 'delete') {
      const { id: keyId } = body;
      if (!keyId) {
        return reply.send(err('MISSING_ID', 'id is required'));
      }
      // Only delete keys belonging to this user
      await pool.query(
        'DELETE FROM user_api_keys WHERE id = $1 AND username = $2',
        [keyId, username]
      );
      return reply.send(ok({ deleted: true, id: keyId }));
    }

    return reply.send(err('INVALID_ACTION', 'action must be one of: store, delete'));
  });

  // ── POST /agent-message — Bridge v1: authenticated hub/spoke agent dispatch ──
  //
  // Accepts an AgentMessageRequest envelope, routes through the non-streaming
  // routing engine (rules + fallback), dispatches to the chosen gateway, and
  // returns a structured AgentMessageResponse.
  //
  // Auth: requireAuth — service token (X-Porter-Service-Token) grants platform_admin
  //       access from localhost; human session cookies also work.
  // Max-hops: hopCount >= MAX_AGENT_HOPS → 429 to prevent routing loops.
  fastify.post('/agent-message', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const body = request.body as AgentMessageRequest;

    // ── Validate envelope ──────────────────────────────────────────────────
    if (!body?.message) {
      return reply.code(400).send(err('MISSING_MESSAGE', 'body.message is required'));
    }
    const { message, hopCount = 0 } = body;

    if (!message.messageId || typeof message.messageId !== 'string') {
      return reply.code(400).send(err('MISSING_FIELD', 'message.messageId is required'));
    }
    if (!message.intent || !['request', 'response', 'ack', 'error'].includes(message.intent)) {
      return reply.code(400).send(err('INVALID_INTENT', 'message.intent must be request | response | ack | error'));
    }
    if (!message.task || typeof message.task !== 'string') {
      return reply.code(400).send(err('MISSING_FIELD', 'message.task is required'));
    }

    // ── Peer-to-peer guard (IAM-03) ────────────────────────────────────────
    // All inter-agent messages must route through Porter as coordinator.
    // If sourceAgent is set and is NOT 'porter' AND targetAgent is set,
    // this is a direct peer-to-peer attempt. Block it and log violation.
    const sourceAgent = message.sourceAgent ?? message.sourceGateway ?? 'unknown';
    const isPorterCoordinated = sourceAgent === 'porter' || sourceAgent === 'porter-delegation';
    const isPeerToPeer = !isPorterCoordinated && !!message.targetAgent && message.sourceAgent !== undefined;

    if (isPeerToPeer) {
      // Log violation to msg_bus_events for audit trail
      try {
        await logMsgBusEvent({
          correlationId: message.correlationId,
          sourceAgent: message.sourceAgent,
          sourceGateway: message.sourceGateway,
          targetAgent: message.targetAgent,
          targetGateway: message.targetGateway,
          intent: 'violation',
          payload: { reason: 'PEER_TO_PEER_BLOCKED', task: message.task?.slice(0, 200) },
          hopCount: hopCount,
        });
      } catch { /* non-critical */ }

      return reply.code(403).send(err(
        'PEER_TO_PEER_BLOCKED',
        `Direct agent-to-agent routing is not allowed. All messages must be coordinated through Porter. source=${message.sourceAgent}, target=${message.targetAgent}`,
      ));
    }

    // ── Max-hops guard ─────────────────────────────────────────────────────
    if (hopCount >= MAX_AGENT_HOPS) {
      // PCP-02: Log depth violation to msg_bus_events for audit
      try {
        await logMsgBusEvent({
          correlationId: message.correlationId,
          sourceAgent: message.sourceAgent,
          sourceGateway: message.sourceGateway,
          targetAgent: message.targetAgent,
          targetGateway: message.targetGateway,
          intent: 'depth_violation',
          payload: {
            reason: 'MAX_HOPS_EXCEEDED',
            hopCount,
            maxHops: MAX_AGENT_HOPS,
            task: message.task?.slice(0, 200),
          },
          hopCount,
        });
      } catch { /* non-critical */ }

      return reply.code(429).send(err(
        'MAX_HOPS_EXCEEDED',
        `Bridge hop limit reached (hopCount=${hopCount}, max=${MAX_AGENT_HOPS})`,
      ));
    }

    // ── TTL check ──────────────────────────────────────────────────────────
    if (message.ttlMs != null && message.createdAt != null) {
      const age = Date.now() - message.createdAt;
      if (age > message.ttlMs) {
        return reply.code(408).send(err(
          'MESSAGE_EXPIRED',
          `Message TTL exceeded (age=${age}ms, ttl=${message.ttlMs}ms)`,
        ));
      }
    }

    // ── Build routing context ──────────────────────────────────────────────
    // targetGateway (if set) acts as a force_model hint via routing context.
    // We pass it as a routing context extension so operator rules still take
    // precedence; targetGateway is only advisory.
    const { gatewayType: forceGatewayType, modelName: forceModelName } = splitTargetGateway(message.targetGateway);

    const ctx: RoutingContext = {
      message: message.task,
      username: request.sessionUser?.username ?? 'system',
      forceGatewayType,
      forceModelName,
    };

    const runId = message.messageId;
    const chainId = message.correlationId ?? message.messageId;

    // MSG-01: Log structured inter-gateway message envelope before dispatch
    let msgBusId: string | null = null;
    try {
      msgBusId = await logMsgBusEvent({
        correlationId: message.correlationId,
        sourceAgent: message.sourceAgent,
        sourceGateway: message.sourceGateway,
        targetAgent: message.targetAgent,
        targetGateway: message.targetGateway,
        intent: message.intent,
        payload: { task: message.task, context: message.context ?? null },
        hopCount,
      });
    } catch { /* non-critical — never block dispatch */ }

    const created = await pool.query<{ id: number }>(
      `INSERT INTO agent_messages
         (run_id, from_agent, to_agent, message, status, chain_id, step_num, created_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, EXTRACT(EPOCH FROM NOW()))
       RETURNING id`,
      [
        runId,
        message.sourceAgent ?? message.sourceGateway ?? 'porter',
        message.targetAgent ?? message.targetGateway ?? 'unknown',
        message.task,
        chainId,
        hopCount,
      ],
    );
    const agentMessageId = created.rows[0]?.id ?? null;

    // ── Select gateway + dispatch ──────────────────────────────────────────
    const dispatchReq = {
      messages: [{ role: 'user', content: message.task }],
      ...(message.context ? { systemPrompt: JSON.stringify(message.context) } : {}),
      ...(message.constraints?.maxTokens != null
        ? { maxTokens: message.constraints.maxTokens as number }
        : {}),
    };

    // ── Failover controls ──────────────────────────────────────────────────
    // fallback:false ⇒ single-gateway hard-fail (caller must not model-switch).
    // simulateFailure ⇒ LOOPBACK-ONLY proof hook (forces a gateway to fail so
    // failover can be demonstrated without burning real quota); ignored for
    // non-loopback callers so it can never be weaponized in production.
    const isLoopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip);
    const fallbackEnabled = (message as { fallback?: boolean }).fallback !== false;
    const simulateFailure = isLoopback
      ? sanitizeSimulateFailure((message as { simulateFailure?: unknown }).simulateFailure)
      : [];

    let decision;
    let result;
    let failoverRecord: FailoverRecord | null = null;
    try {
      const out = await routingEngine.dispatchWithFailover(ctx, dispatchReq, {
        fallback: fallbackEnabled,
        simulateFailure,
      });
      decision = out.decision;
      result = out.result;
      failoverRecord = out.failover;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (agentMessageId != null) {
        await pool.query(
          `UPDATE agent_messages
           SET status = 'failed', error = $2, completed_at = EXTRACT(EPOCH FROM NOW())
           WHERE id = $1`,
          [agentMessageId, msg],
        );
      }
      // MSG-01: Mark msg_bus event as failed
      if (msgBusId) {
        updateMsgBusEvent(msgBusId, { status: 'failed' }).catch(() => {});
      }
      return reply.code(502).send(err('DISPATCH_FAILED', msg));
    }

    // ── Log dispatch with agent-message correlation fields ─────────────────
    const dispatchLogId = await routingEngine.logDispatch(decision, ctx, result, {
      correlationId: message.correlationId,
      sourceAgent: message.sourceAgent,
      sourceGateway: message.sourceGateway,
      targetAgent: message.targetAgent,
      targetGateway: message.targetGateway,
      intent: message.intent,
      replyTo: message.replyTo,
    }, null, failoverRecord);

    // MSG-01: Backfill dispatch log id + mark delivered
    if (msgBusId) {
      updateMsgBusEvent(msgBusId, {
        status: 'delivered',
        dispatchLogId,
        latencyMs: result.latencyMs,
        responsePayload: { response: result.response?.slice(0, 500) },
      }).catch(() => {});
    }

    // ── Build response envelope ────────────────────────────────────────────
    const response: AgentMessageResponse = {
      messageId: message.messageId,
      correlationId: message.correlationId,
      intent: 'response',
      dispatchLogId,
      gatewayType: decision.gatewayRow.type,
      modelName: decision.modelName,
      response: result.response,
      latencyMs: result.latencyMs,
      hopCount: hopCount + 1,
      createdAt: Date.now(),
      ...(failoverRecord && failoverRecord.attempts.length > 1
        ? {
            failover: {
              switched: failoverRecord.answeredBy !== failoverRecord.chain[0],
              answeredBy: failoverRecord.answeredBy,
              chain: failoverRecord.chain,
              attempts: failoverRecord.attempts.map(a => ({
                gatewayType: a.gatewayType,
                outcome: a.outcome,
                ...(a.reason ? { reason: a.reason } : {}),
              })),
            },
          }
        : {}),
    };

    if (agentMessageId != null) {
      await pool.query(
        `UPDATE agent_messages
         SET status = 'complete',
             response = $2,
             model = $3,
             tokens_total = $4,
             duration_ms = $5,
             completed_at = EXTRACT(EPOCH FROM NOW())
         WHERE id = $1`,
        [
          agentMessageId,
          result.response,
          decision.modelName,
          (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
          result.latencyMs,
        ],
      );
    }

    return reply.send(ok(response));
  });

  // ── GET /agent-message/inbox — retrieve persisted agent-message rows ──────
  fastify.get('/agent-message/inbox', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const agent = query.agent?.trim();
    const status = query.status?.trim() ?? 'complete';
    const limit = Math.min(Math.max(parseInt(query.limit ?? '20', 10) || 20, 1), 100);
    const sinceId = query.since_id ? parseInt(query.since_id, 10) : null;

    if (!agent) {
      return reply.code(400).send(err('MISSING_AGENT', 'query.agent is required'));
    }

    const params: unknown[] = [agent, status, limit];
    let sql = `
      SELECT id, run_id, from_agent, to_agent, message, response, status, model,
             tokens_total, duration_ms, error, created_at, completed_at, chain_id, step_num
      FROM agent_messages
      WHERE to_agent = $1 AND status = $2
    `;

    if (sinceId != null && Number.isFinite(sinceId)) {
      params.splice(2, 0, sinceId);
      sql += ` AND id > $3`;
      sql += ` ORDER BY id ASC LIMIT $4`;
    } else {
      sql += ` ORDER BY id ASC LIMIT $3`;
    }

    const { rows } = await pool.query(sql, params);
    return reply.send(ok({ messages: rows }));
  });

  // ── POST /setup/save — wizard step 4: enable or disable a gateway ────────────
  fastify.post('/setup/save', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (!['platform_admin', 'admin'].includes(request.sessionUser!.role ?? '')) {
      return reply.code(403).send(err('FORBIDDEN', 'Admin required'));
    }

    const body = request.body as { type?: string; enabled?: boolean };
    const { type, enabled } = body;

    if (!type || !VALID_GATEWAY_TYPES.has(type)) {
      return reply.send(err('INVALID_TYPE', `Unknown gateway type: ${type}`));
    }

    const { rows } = await pool.query(
      'SELECT id FROM gateways WHERE type = $1 LIMIT 1',
      [type]
    );

    if (rows.length === 0) {
      return reply.send(ok({ saved: false, error: 'GATEWAY_NOT_FOUND' }));
    }

    await pool.query(
      'UPDATE gateways SET enabled = $1, updated_at = EXTRACT(EPOCH FROM NOW()) WHERE type = $2',
      [enabled ? 1 : 0, type]
    );

    return reply.send(ok({ saved: true, type, enabled: !!enabled }));
  });
}
