/**
 * Routing Engine — DB-driven AI gateway selection and dispatch logging
 *
 * Replaces hardcoded shouldRouteCheap() / getBackends() / selectModel() with
 * live DB-backed gateway selection, operator rule evaluation, concurrency-
 * queued dispatch, transparent logging, and session routing context.
 *
 * Phase 20: Smart Routing Engine (RT-01 through RT-05)
 */

import { pool } from '../../db/client.js';
import { createAdapter } from './adapters/index.js';
import { getQueue } from './dispatch-queues.js';
import { emitSSE } from '../scheduler.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  GatewayRow,
  GatewayAdapter,
  RoutingContext,
  RoutingDecision,
  RoutingRuleRow,
  BridgeDispatchRequest,
  BridgeDispatchResult,
} from './types.js';

// ── Internal helper types ─────────────────────────────────────────────────────

interface GatewayCandidate {
  row: GatewayRow;
  adapter: GatewayAdapter;
}

// ── DB row shape from raw SQL ─────────────────────────────────────────────────

interface GatewayDbRow {
  id: string;
  type: string;
  name: string;
  url: string | null;
  auth_method: string;
  status: string;
  source: string;
  priority: number;
  capabilities: unknown;
  metadata: unknown;
  enabled: number;
  masked_display: string;
  created_at: number | null;
  updated_at: number | null;
  last_health_at: number | null;
}

interface RoutingRuleDbRow {
  id: string;
  scope: string;
  scope_id: string | null;
  action: string;
  action_value: string | null;
  enabled: number;
  priority: number;
  description: string | null;
  created_by: string | null;
  created_at: number | null;
  updated_at: number | null;
}

// ── RoutingEngine class ───────────────────────────────────────────────────────

export class RoutingEngine {
  /**
   * Select the best available gateway for the given routing context.
   *
   * RT-01: Queries gateways table for active+enabled candidates.
   * RT-02: Evaluates routing_rules before falling back to heuristic.
   */
  async select(ctx: RoutingContext): Promise<RoutingDecision> {
    // 1. Query active, enabled gateways ordered by priority
    const { rows: dbRows } = await pool.query<GatewayDbRow>(
      `SELECT id, type, name, url, auth_method, status, source, priority,
              capabilities, metadata, enabled, masked_display,
              created_at, updated_at, last_health_at
       FROM gateways
       WHERE status = 'active' AND enabled = 1
       ORDER BY priority ASC`,
    );

    // 2. Map DB rows to typed GatewayRow + adapter pairs
    const candidates: GatewayCandidate[] = [];
    for (const raw of dbRows) {
      const row = mapGatewayRow(raw);
      const adapter = createAdapter(row);
      if (adapter) {
        candidates.push({ row, adapter });
      }
    }

    if (candidates.length === 0) {
      throw new Error('No active gateways available');
    }

    // 3. Evaluate routing rules — returns first matching rule or null
    const matchedRule = await this.evaluateRules(ctx, candidates);

    let chosen: GatewayCandidate;
    let reason: string;
    let matchedRuleId: string | null = null;

    if (matchedRule) {
      matchedRuleId = matchedRule.id;

      if (matchedRule.action === 'force_model' && matchedRule.actionValue) {
        // force_model: find gateway matching actionValue (gatewayType or "type:model" format)
        const [forceType, forceModel] = matchedRule.actionValue.includes(':')
          ? matchedRule.actionValue.split(':', 2)
          : [matchedRule.actionValue, null];

        const forced = candidates.find(c => c.row.type === forceType);
        if (forced) {
          chosen = forced;
          reason = `Rule: ${matchedRule.description ?? matchedRule.action} (${matchedRule.id})`;
          if (forceModel) {
            // Override modelName via shallow row copy
            chosen = {
              row: { ...forced.row, metadata: { ...forced.row.metadata, default_model: forceModel } },
              adapter: forced.adapter,
            };
          }
        } else {
          // Forced gateway not available — fall through to heuristic
          chosen = this.selectByHeuristic(ctx.message, candidates);
          reason = `Heuristic fallback (forced gateway ${forceType} unavailable)`;
          matchedRuleId = null;
        }
      } else if (matchedRule.action === 'block_gateway' && matchedRule.actionValue) {
        // block_gateway: remove matching gateway type from candidates
        const filtered = candidates.filter(c => c.row.type !== matchedRule.actionValue);
        if (filtered.length === 0) throw new Error('No active gateways after block_gateway rule');
        chosen = this.selectByHeuristic(ctx.message, filtered);
        reason = `Heuristic (blocked ${matchedRule.actionValue}) — Rule: ${matchedRule.id}`;
      } else if (matchedRule.action === 'prefer_local') {
        // prefer_local: re-sort to put local/CLI gateways first
        const LOCAL_TYPES = new Set(['ollama', 'codex_cli', 'claude_cli', 'gemini_cli']);
        const sorted = [
          ...candidates.filter(c => LOCAL_TYPES.has(c.row.type)),
          ...candidates.filter(c => !LOCAL_TYPES.has(c.row.type)),
        ];
        chosen = sorted[0];
        reason = `Rule: prefer_local (${matchedRule.id})`;
      } else {
        // cap_cost_usd or unrecognised action — use heuristic
        chosen = this.selectByHeuristic(ctx.message, candidates);
        reason = `Heuristic (rule ${matchedRule.id} action=${matchedRule.action})`;
      }
    } else {
      // No rules — pure heuristic
      chosen = this.selectByHeuristic(ctx.message, candidates);
      reason = `Heuristic: ${isComplexMessage(ctx.message) ? 'complex' : 'simple'} message`;
    }

    // 4. Build alternatives list (everything that was not chosen)
    const chosenId = chosen.row.id;
    const alternatives = candidates
      .filter(c => c.row.id !== chosenId)
      .map(c => ({
        gatewayType: c.row.type,
        modelName: resolveModelName(c.row),
        reasonSkipped: `lower priority or not selected (priority=${c.row.priority})`,
      }));

    return {
      gatewayRow: chosen.row,
      adapter: chosen.adapter,
      modelName: resolveModelName(chosen.row),
      reason,
      alternatives,
      matchedRuleId,
    };
  }

  /**
   * Evaluate routing_rules table. Returns first matching rule (lowest priority number).
   * RT-02: DB-driven rule evaluation.
   */
  async evaluateRules(
    ctx: RoutingContext,
    _candidates: GatewayCandidate[],
  ): Promise<RoutingRuleRow | null> {
    const { rows } = await pool.query<RoutingRuleDbRow>(
      `SELECT id, scope, scope_id, action, action_value, enabled, priority,
              description, created_by, created_at, updated_at
       FROM routing_rules
       WHERE enabled = 1
       ORDER BY priority ASC`,
    );

    for (const raw of rows) {
      const rule = mapRuleRow(raw);
      const matches =
        (rule.scope === 'global') ||
        (rule.scope === 'agent' && rule.scopeId === ctx.agentId && ctx.agentId != null) ||
        (rule.scope === 'project' && rule.scopeId === ctx.projectId && ctx.projectId != null) ||
        (rule.scope === 'gateway' && _candidates.some(c => c.row.type === rule.scopeId));

      if (matches) return rule;
    }

    return null;
  }

  /**
   * Log a completed dispatch to bridge_dispatch_log.
   * Fire-and-forget — never blocks the caller.
   * RT-03: Transparent dispatch logging.
   */
  async logDispatch(
    decision: RoutingDecision,
    ctx: RoutingContext,
    result: BridgeDispatchResult,
  ): Promise<string> {
    const id = uuidv4();

    // Fire-and-forget — pattern from existing logDecision() in ai-router.ts
    (async () => {
      try {
        await pool.query(
          `INSERT INTO bridge_dispatch_log
             (id, gateway_id, gateway_type, model_name, chosen_reason, alternatives,
              estimated_cost_usd, input_tokens, output_tokens, latency_ms,
              agent_id, project_id, chat_id, rule_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, EXTRACT(EPOCH FROM NOW()))`,
          [
            id,
            decision.gatewayRow.id,
            decision.gatewayRow.type,
            decision.modelName,
            decision.reason,
            JSON.stringify(decision.alternatives),
            null, // estimated_cost_usd — Phase 19 models table not yet available
            result.inputTokens ?? null,
            result.outputTokens ?? null,
            result.latencyMs,
            ctx.agentId ?? null,
            ctx.projectId ?? null,
            ctx.chatId ?? null,
            decision.matchedRuleId,
          ],
        );
      } catch {
        // Non-critical — never block dispatch
      }

      emitSSE('bridge:dispatch', {
        gateway_type: decision.gatewayRow.type,
        model_name: decision.modelName,
        reason: decision.reason,
        latency_ms: result.latencyMs,
      }).catch(() => {});
    })();

    return id;
  }

  /**
   * Record a per-turn session routing entry in session_routing_context.
   * Fire-and-forget — never blocks the caller.
   * RT-05: Session routing context.
   */
  async recordSessionTurn(
    ctx: RoutingContext,
    decision: RoutingDecision,
    dispatchLogId: string,
  ): Promise<void> {
    if (!ctx.chatId) return;

    (async () => {
      try {
        await pool.query(
          `INSERT INTO session_routing_context
             (id, chat_id, message_sequence, gateway_id, gateway_type, model_name, dispatch_log_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7, EXTRACT(EPOCH FROM NOW()))`,
          [
            uuidv4(),
            ctx.chatId,
            ctx.messageSequence ?? 0,
            decision.gatewayRow.id,
            decision.gatewayRow.type,
            decision.modelName,
            dispatchLogId,
          ],
        );
      } catch {
        // Non-critical — never block dispatch
      }
    })();
  }

  /**
   * Dispatch through per-gateway concurrency queue.
   * RT-04: p-queue concurrency control.
   */
  async dispatchWithQueue(
    decision: RoutingDecision,
    req: BridgeDispatchRequest,
  ): Promise<BridgeDispatchResult> {
    return getQueue(decision.gatewayRow.type).add(
      () => decision.adapter.dispatch(req),
    ) as Promise<BridgeDispatchResult>;
  }

  /**
   * Select a gateway candidate by message complexity heuristic.
   * Complex messages prefer HTTP/remote gateways; simple messages prefer local.
   */
  private selectByHeuristic(message: string, candidates: GatewayCandidate[]): GatewayCandidate {
    const complex = isComplexMessage(message);
    const LOCAL_TYPES = new Set(['ollama', 'codex_cli', 'claude_cli', 'gemini_cli']);

    let sorted: GatewayCandidate[];
    if (complex) {
      // Prefer HTTP/remote gateways with lower priority numbers (openclaw first)
      sorted = [...candidates].sort((a, b) => a.row.priority - b.row.priority);
    } else {
      // Prefer local gateways — ollama and CLI types first, then by priority
      sorted = [
        ...candidates.filter(c => LOCAL_TYPES.has(c.row.type)).sort((a, b) => a.row.priority - b.row.priority),
        ...candidates.filter(c => !LOCAL_TYPES.has(c.row.type)).sort((a, b) => a.row.priority - b.row.priority),
      ];
    }

    return sorted[0];
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const routingEngine = new RoutingEngine();

// ── Private helpers ───────────────────────────────────────────────────────────

function isComplexMessage(message: string): boolean {
  return (
    message.length > 160 ||
    message.split(/\s+/).length > 28 ||
    /```|`|https?:\/\/|debug|implement|refactor|test|tool|analyze|architecture/i.test(message)
  );
}

function resolveModelName(row: GatewayRow): string {
  const meta = row.metadata as Record<string, unknown> | undefined;
  if (meta?.default_model && typeof meta.default_model === 'string') {
    return meta.default_model;
  }
  return row.name;
}

function mapGatewayRow(raw: GatewayDbRow): GatewayRow {
  return {
    id: raw.id,
    type: raw.type as GatewayRow['type'],
    name: raw.name,
    url: raw.url,
    authMethod: raw.auth_method as GatewayRow['authMethod'],
    status: raw.status as GatewayRow['status'],
    source: raw.source as GatewayRow['source'],
    priority: raw.priority,
    capabilities: Array.isArray(raw.capabilities) ? (raw.capabilities as string[]) : [],
    metadata: (typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {}) as Record<string, unknown>,
    enabled: raw.enabled,
    maskedDisplay: raw.masked_display,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    lastHealthAt: raw.last_health_at,
  };
}

function mapRuleRow(raw: RoutingRuleDbRow): RoutingRuleRow {
  return {
    id: raw.id,
    scope: raw.scope as RoutingRuleRow['scope'],
    scopeId: raw.scope_id,
    action: raw.action as RoutingRuleRow['action'],
    actionValue: raw.action_value,
    enabled: raw.enabled,
    priority: raw.priority,
    description: raw.description,
    createdBy: raw.created_by,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}
