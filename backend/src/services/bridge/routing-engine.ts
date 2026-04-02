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
import { calculateCostUsd } from './model-catalog.js';
import { getQueue } from './dispatch-queues.js';
import { getBreaker } from './circuit-breaker-registry.js';
import { withRetry } from './retry.js';
import { emitSSE } from '../scheduler.js';
import { parseRateLimitHeaders, record429, hasCapacity } from './rate-limit-tracker.js';
import { v4 as uuidv4 } from 'uuid';
import { awardXP } from '../rpg-engine.js';
import { upsertSession } from '../session-registry.js';
import type {
  GatewayRow,
  GatewayAdapter,
  RoutingContext,
  RoutingDecision,
  RoutingRuleRow,
  BridgeDispatchRequest,
  BridgeDispatchResult,
  AgentMessageLogContext,
} from './types.js';

// ── Internal helper types ─────────────────────────────────────────────────────

export interface GatewayCandidate {
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
   * Query all active+enabled gateway candidates ordered by priority.
   * Includes 'stale' gateways (degraded but functional) — only 'unavailable' is excluded.
   * Used by both select() and selectWithFallback().
   * GW-06: Fallback chain iterates all candidates returned here.
   */
  async selectAllCandidates(): Promise<GatewayCandidate[]> {
    const { rows: dbRows } = await pool.query<GatewayDbRow>(
      `SELECT id, type, name, url, auth_method, status, source, priority,
              capabilities, metadata, enabled, masked_display,
              created_at, updated_at, last_health_at
       FROM gateways
       WHERE status IN ('active', 'stale') AND enabled = 1
       ORDER BY priority ASC`,
    );

    const candidates: GatewayCandidate[] = [];
    for (const raw of dbRows) {
      const row = mapGatewayRow(raw);
      const adapter = createAdapter(row);
      if (adapter) candidates.push({ row, adapter });
    }
    return candidates;
  }

  /**
   * Select the best available gateway for the given routing context.
   *
   * RT-01: Queries gateways table for active+enabled candidates.
   * RT-02: Evaluates routing_rules before falling back to heuristic.
   */
  async select(ctx: RoutingContext): Promise<RoutingDecision> {
    // 1. Query active, enabled gateways ordered by priority
    const candidates = await this.selectAllCandidates();

    if (candidates.length === 0) {
      throw new Error('No active gateways available');
    }

    // MOD-03: Filter by model capabilities when requested
    const filteredCandidates = ctx.requiredCapabilities?.length
      ? await this.filterByCapabilities(candidates, ctx.requiredCapabilities)
      : candidates;

    if (ctx.forceGatewayType) {
      const forced = filteredCandidates.find(c => c.row.type === ctx.forceGatewayType)
        ?? candidates.find(c => c.row.type === ctx.forceGatewayType);

      if (!forced) {
        throw new Error(`Forced gateway ${ctx.forceGatewayType} is not available`);
      }

      const chosen = ctx.forceModelName
        ? {
            row: {
              ...forced.row,
              metadata: { ...forced.row.metadata, default_model: ctx.forceModelName },
            },
            adapter: forced.adapter,
          }
        : forced;

      const chosenId = chosen.row.id;
      const alternatives = candidates
        .filter(c => c.row.id !== chosenId)
        .map(c => ({
          gatewayType: c.row.type,
          modelName: resolveModelName(c.row),
          reasonSkipped: `forced to ${ctx.forceGatewayType}`,
        }));

      return {
        gatewayRow: chosen.row,
        adapter: chosen.adapter,
        modelName: resolveModelName(chosen.row),
        reason: `Forced target gateway: ${ctx.forceGatewayType}`,
        alternatives,
        matchedRuleId: null,
      };
    }

    // 3. Evaluate routing rules — returns first matching rule or null
    const matchedRule = await this.evaluateRules(ctx, filteredCandidates);

    let chosen: GatewayCandidate;
    let reason: string;
    let matchedRuleId: string | null = null;

    if (matchedRule) {
      matchedRuleId = matchedRule.id;

      if (matchedRule.action === 'force_model' && matchedRule.actionValue) {
        // force_model: find gateway matching actionValue (gatewayType or "type:model" format)
        // Use indexOf instead of split(':',2) to preserve model names that contain colons (e.g. llama3.1:8b)
        const [forceType, forceModel] = splitOnFirstColon(matchedRule.actionValue);

        const forced = filteredCandidates.find(c => c.row.type === forceType);
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
          chosen = this.selectByHeuristic(ctx.message, filteredCandidates);
          reason = `Heuristic fallback (forced gateway ${forceType} unavailable)`;
          matchedRuleId = null;
        }
      } else if (matchedRule.action === 'block_gateway' && matchedRule.actionValue) {
        // block_gateway: remove matching gateway type from candidates
        const afterBlock = filteredCandidates.filter(c => c.row.type !== matchedRule.actionValue);
        if (afterBlock.length === 0) throw new Error('No active gateways after block_gateway rule');
        chosen = this.selectByHeuristic(ctx.message, afterBlock);
        reason = `Heuristic (blocked ${matchedRule.actionValue}) — Rule: ${matchedRule.id}`;
      } else if (matchedRule.action === 'prefer_local') {
        // prefer_local: re-sort to put local/CLI gateways first
        const LOCAL_TYPES = new Set(['ollama', 'codex_cli', 'claude_cli', 'gemini_cli']);
        const sorted = [
          ...filteredCandidates.filter(c => LOCAL_TYPES.has(c.row.type)),
          ...filteredCandidates.filter(c => !LOCAL_TYPES.has(c.row.type)),
        ];
        chosen = sorted[0];
        reason = `Rule: prefer_local (${matchedRule.id})`;
      } else {
        // cap_cost_usd or unrecognised action — use heuristic
        chosen = this.selectByHeuristic(ctx.message, filteredCandidates);
        reason = `Heuristic (rule ${matchedRule.id} action=${matchedRule.action})`;
      }
    } else {
      // No rules — pure heuristic
      chosen = this.selectByHeuristic(ctx.message, filteredCandidates);
      reason = `Heuristic: ${isComplexMessage(ctx.message) ? 'complex' : 'simple'} message`;
    }

    // 4. Build alternatives list (all candidates, not just filtered — shows full picture)
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
   *
   * @param agentMsgCtx — optional agent-message correlation fields (Bridge v1)
   */
  async logDispatch(
    decision: RoutingDecision,
    ctx: RoutingContext,
    result: BridgeDispatchResult,
    agentMsgCtx?: AgentMessageLogContext,
  ): Promise<string> {
    const id = uuidv4();

    // Fire-and-forget — pattern from existing logDecision() in ai-router.ts
    (async () => {
      try {
        // MOD-05: Calculate estimated USD cost from model pricing metadata
        const costUsd = await calculateCostUsd(
          result.inputTokens ?? null,
          result.outputTokens ?? null,
          result.cachedTokens ?? null,
          decision.modelName,
          decision.gatewayRow.id,
          pool,
        );

        // MOD-04: Resolve model_version_id — most recent version for this gateway+model
        let modelVersionId: string | null = null;
        try {
          const { rows: vrows } = await pool.query<{ id: string }>(
            `SELECT mv.id
             FROM model_versions mv
             JOIN models m ON mv.model_id = m.id
             WHERE m.gateway_id = $1 AND m.model_name = $2
             ORDER BY mv.detected_at DESC
             LIMIT 1`,
            [decision.gatewayRow.id, decision.modelName],
          );
          modelVersionId = vrows[0]?.id ?? null;
        } catch {
          // non-fatal — version lookup failure must not block dispatch logging
        }

        await pool.query(
          `INSERT INTO bridge_dispatch_log
             (id, gateway_id, gateway_type, model_name, chosen_reason, alternatives,
              estimated_cost_usd, input_tokens, output_tokens, cached_tokens,
              model_version_id, latency_ms,
              agent_id, project_id, chat_id, rule_id, username,
              correlation_id, source_agent, source_gateway,
              target_agent, target_gateway, intent, reply_to, is_agent_message,
              skills_used,
              created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                   $18,$19,$20,$21,$22,$23,$24,$25,
                   $26,
                   EXTRACT(EPOCH FROM NOW()))`,
          [
            id,
            decision.gatewayRow.id,
            decision.gatewayRow.type,
            decision.modelName,
            decision.reason,
            JSON.stringify(decision.alternatives),
            costUsd,
            result.inputTokens ?? null,
            result.outputTokens ?? null,
            result.cachedTokens ?? null,
            modelVersionId,
            result.latencyMs,
            ctx.agentId ?? null,
            ctx.projectId ?? null,
            ctx.chatId ?? null,
            decision.matchedRuleId,
            ctx.username ?? null,
            agentMsgCtx?.correlationId ?? null,
            agentMsgCtx?.sourceAgent ?? null,
            agentMsgCtx?.sourceGateway ?? null,
            agentMsgCtx?.targetAgent ?? null,
            agentMsgCtx?.targetGateway ?? null,
            agentMsgCtx?.intent ?? null,
            agentMsgCtx?.replyTo ?? null,
            agentMsgCtx ? 1 : null,
            ctx.skillsUsed ? JSON.stringify(ctx.skillsUsed) : null,
          ],
        );

        // RPG: award XP for this dispatch (fire-and-forget, never blocks)
        // logDispatch is only reached on success — errors throw before reaching here
        if (ctx.agentId) {
          awardXP(ctx.agentId, 'dispatch').catch(() => {});
        }

        // Phase 34: Increment times_selected counter on persona_skills for each selected skill
        if (ctx.skillsUsed?.selected?.length && ctx.agentId) {
          try {
            const skillIds = ctx.skillsUsed.selected.map(s => s.skillId);
            await pool.query(
              `UPDATE persona_skills
               SET times_selected = COALESCE(times_selected, 0) + 1,
                   last_used_at = EXTRACT(EPOCH FROM NOW())
               WHERE persona_id = $1
                 AND COALESCE(skill_id, skill_name) = ANY($2)`,
              [ctx.agentId, skillIds]
            );
          } catch { /* non-fatal — counter update must never block dispatch */ }
        }

        // SES-01: Track per-session token usage
        try {
          const totalTokens = (result.inputTokens ?? 0) + (result.outputTokens ?? 0);
          if (totalTokens > 0 && (ctx.chatId || ctx.agentId)) {
            // Resolve context_window from models table for this gateway+model
            let tokenBudget = 0;
            try {
              const { rows: mrows } = await pool.query<{ context_window: number }>(
                `SELECT context_window FROM models WHERE gateway_id = $1 AND model_name = $2 LIMIT 1`,
                [decision.gatewayRow.id, decision.modelName],
              );
              tokenBudget = mrows[0]?.context_window ?? 0;
            } catch { /* non-fatal */ }

            await upsertSession(
              ctx.chatId ?? null,
              ctx.agentId ?? null,
              totalTokens,
              decision.gatewayRow.type,
              decision.modelName,
              tokenBudget,
            );
          }
        } catch { /* non-critical — never block dispatch */ }

        // INT-01: Memory V3 signal — agent learns model preferences
        if (ctx.agentId) {
          try {
            // Deduplication: skip if same agent+gateway_type+model note exists in last hour
            const existing = await pool.query(
              `SELECT 1 FROM agent_notes
               WHERE agent_id = $1
                 AND content LIKE $2
                 AND created_at > EXTRACT(EPOCH FROM NOW()) - 3600
                 AND status = 'active'
               LIMIT 1`,
              [ctx.agentId, `%${decision.gatewayRow.type}%${decision.modelName}%`]
            );
            if (!existing.rows.length) {
              const perf = result.latencyMs < 3000 ? 'fast' : result.latencyMs < 8000 ? 'normal' : 'slow';
              await pool.query(
                `INSERT INTO agent_notes
                   (id, agent_id, content, note_type, confidence_score, source_type, status, created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, 'learning', 40, 'learning', 'active', 'bridge', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
                [
                  uuidv4(),
                  ctx.agentId,
                  `Routed via ${decision.gatewayRow.type} (${decision.modelName}) — ${perf} response (${result.latencyMs}ms). Reason: ${decision.reason}`,
                ]
              );
            }
          } catch { /* non-critical — never block dispatch */ }
        }
      } catch {
        // Non-critical — never block dispatch
      }

      // Parse rate limit headers from HTTP adapters (fire-and-forget)
      if (result.responseHeaders) {
        try {
          parseRateLimitHeaders(result.responseHeaders, decision.gatewayRow.id);
        } catch { /* non-critical */ }
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
   * Dispatch with N-gateway fallback chain.
   * Iterates priority-ordered candidates. For each:
   *   - Skip if circuit breaker is open
   *   - Try dispatch wrapped in withRetry() + breaker.fire() + dispatch queue
   *   - On failure, record error and try next candidate
   * GW-06: Fallback chain — N gateways in priority order.
   */
  async selectWithFallback(
    ctx: RoutingContext,
    req: BridgeDispatchRequest,
  ): Promise<{ decision: RoutingDecision; result: BridgeDispatchResult }> {
    const candidates = await this.selectAllCandidates();
    if (candidates.length === 0) {
      throw new Error('No active gateways available');
    }

    // Evaluate rules — apply them to fallback order just as select() does
    const matchedRule = await this.evaluateRules(ctx, candidates);

    // INT-03: Check concepts table for learned gateway preference for this agent
    let conceptPreferredType: string | null = null;
    if (ctx.agentId) {
      try {
        const { rows: conceptRows } = await pool.query<{ content: string; scope_id: string }>(
          `SELECT content, scope_id FROM concepts
           WHERE source_type = 'intelligence_loop'
             AND status = 'active'
             AND memory_kind = 'concept'
             AND (scope_id = $1 OR scope_id IS NULL)
             AND (content LIKE '%model_strength%' OR content LIKE '%routed to%')
           ORDER BY created_at DESC
           LIMIT 5`,
          [ctx.agentId],
        );
        // Extract preferred gateway_type from concept content
        // Content format: "Agent {id} routed to {gateway_type}/{model} N times..."
        for (const row of conceptRows) {
          const match = row.content.match(/routed to (\w+)\//);
          if (match) {
            conceptPreferredType = match[1];
            break;
          }
        }
      } catch { /* non-critical — concept lookup never blocks routing */ }
    }

    // Sort candidates: prefer gateways with capacity headroom (soft preference)
    // Gateways at 90%+ utilization are pushed to the end, not blocked.
    // INT-03: Learned concept preference wins over capacity + priority
    const capacitySorted = [...candidates].sort((a, b) => {
      const aConceptPreferred = conceptPreferredType && a.row.type === conceptPreferredType ? 0 : 1;
      const bConceptPreferred = conceptPreferredType && b.row.type === conceptPreferredType ? 0 : 1;
      if (aConceptPreferred !== bConceptPreferred) return aConceptPreferred - bConceptPreferred;
      const aHas = hasCapacity(a.row.id) ? 0 : 1;
      const bHas = hasCapacity(b.row.id) ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return a.row.priority - b.row.priority; // preserve priority within same capacity tier
    });

    // Apply matched routing rule to fallback iteration order
    const sorted = applyRuleToFallbackOrder(matchedRule, capacitySorted);

    const errors: string[] = [];

    for (const candidate of sorted) {
      const breaker = getBreaker(candidate.row.id, candidate.row.type);

      // Skip gateways with open circuit breakers
      if (breaker.opened) {
        errors.push(`${candidate.row.type}(${candidate.row.id.slice(0, 8)}): circuit open`);
        continue;
      }

      try {
        const result = await withRetry(() =>
          getQueue(candidate.row.type).add(() =>
            breaker.fire(async () => candidate.adapter.dispatch(req))
          ) as Promise<BridgeDispatchResult>,
        );

        // Build the routing decision for the gateway that succeeded
        const chosenId = candidate.row.id;
        const alternatives = candidates
          .filter(c => c.row.id !== chosenId)
          .map(c => ({
            gatewayType: c.row.type,
            modelName: resolveModelName(c.row),
            reasonSkipped: errors.find(e => e.startsWith(c.row.type))
              ?? `lower priority (priority=${c.row.priority})`,
          }));

        const baseReason = errors.length > 0
          ? `Fallback: ${errors.length} gateway(s) failed before ${candidate.row.type}`
          : `Primary: ${candidate.row.type} (priority=${candidate.row.priority})`;

        // INT-03: Annotate reason when concept preference was applied and matched
        const finalReason = (conceptPreferredType && candidate.row.type === conceptPreferredType)
          ? `${baseReason} [learned: preferred ${conceptPreferredType} for agent ${ctx.agentId?.slice(0, 8)}]`
          : baseReason;

        const decision: RoutingDecision = {
          gatewayRow: candidate.row,
          adapter: candidate.adapter,
          modelName: resolveModelName(candidate.row),
          reason: finalReason,
          alternatives,
          matchedRuleId: matchedRule?.id ?? null,
        };

        return { decision, result };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${candidate.row.type}(${candidate.row.id.slice(0, 8)}): ${msg}`);

        // Record 429 events for rate limit tracking
        if (/429|rate.?limit|too.?many/i.test(msg)) {
          record429(candidate.row.id);
        }
      }
    }

    throw new Error(`All ${candidates.length} gateways failed: ${errors.join('; ')}`);
  }

  /**
   * Dispatch a streaming request through per-gateway concurrency queue.
   * Wraps the adapter stream to capture observability data (latency, tokens).
   * RT-04: p-queue concurrency control for streams.
   */
  async dispatchStream(
    decision: RoutingDecision,
    ctx: RoutingContext,
    req: BridgeDispatchRequest,
    signal: AbortSignal,
  ): Promise<AsyncIterable<string>> {
    const start = Date.now();
    let firstTokenAt: number | null = null;
    let fullResponse = '';

    // Create a local reference to logDispatch to avoid 'this' issues in generator
    const self = this;

    // Use a generator to wrap the adapter's stream and capture metrics
    const wrappedStream = (async function* () {
      try {
        const stream = decision.adapter.stream(req, signal);
        for await (const token of stream) {
          if (firstTokenAt === null) {
            firstTokenAt = Date.now();
          }
          fullResponse += token;
          yield token;
        }

        // Stream finished successfully — calculate results and log dispatch
        const result: BridgeDispatchResult = {
          response: fullResponse,
          model: decision.modelName,
          latencyMs: Date.now() - start,
          cached: false,
          // Estimate tokens if adapter doesn't provide them for streams
          outputTokens: Math.ceil(fullResponse.length / 4),
          inputTokens: Math.ceil(JSON.stringify(req.messages).length / 4),
        };

        // Phase 34: capture dispatch ID and yield as metadata token for chat.ts to thread into SSE done event
        const dispatchId = self.logDispatch(decision, ctx, result).catch(() => null as string | null);
        const resolvedId = await dispatchId;
        if (resolvedId) yield `__DISPATCH_META__${JSON.stringify({ dispatch_id: resolvedId })}`;
      } catch (err) {
        // Errors in the stream are re-thrown to the caller
        throw err;
      }
    })();

    return wrappedStream;
  }

  /**
   * Dispatch with N-gateway fallback chain for streaming.
   * Similar to selectWithFallback() but returns an AsyncIterable.
   * GW-06: Fallback chain for streams.
   */
  async selectStreamWithFallback(
    ctx: RoutingContext,
    req: BridgeDispatchRequest,
    signal: AbortSignal,
  ): Promise<{ decision: RoutingDecision; stream: AsyncIterable<string> }> {
    const candidates = await this.selectAllCandidates();
    if (candidates.length === 0) {
      throw new Error('No active gateways available');
    }

    // Evaluate rules — must be applied to streaming fallback order the same way as select()
    const matchedRule = await this.evaluateRules(ctx, candidates);

    // Sort candidates: prefer gateways with capacity headroom
    const capacitySorted = [...candidates].sort((a, b) => {
      const aHas = hasCapacity(a.row.id) ? 0 : 1;
      const bHas = hasCapacity(b.row.id) ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return a.row.priority - b.row.priority;
    });

    // Apply matched routing rule to fallback iteration order (fixes force_model/block_gateway/prefer_local)
    const sorted = applyRuleToFallbackOrder(matchedRule, capacitySorted);

    const errors: string[] = [];

    for (const candidate of sorted) {
      const breaker = getBreaker(candidate.row.id, candidate.row.type);

      if (breaker.opened) {
        errors.push(`${candidate.row.type}: circuit open`);
        continue;
      }

      try {
        // Build the routing decision for the chosen candidate
        const chosenId = candidate.row.id;
        const alternatives = candidates
          .filter(c => c.row.id !== chosenId)
          .map(c => ({
            gatewayType: c.row.type,
            modelName: resolveModelName(c.row),
            reasonSkipped: errors.find(e => e.startsWith(c.row.type))
              ?? `lower priority (priority=${c.row.priority})`,
          }));

        const decision: RoutingDecision = {
          gatewayRow: candidate.row,
          adapter: candidate.adapter,
          modelName: resolveModelName(candidate.row),
          reason: errors.length > 0
            ? `Fallback: ${errors.length} failure(s) before ${candidate.row.type}`
            : `Primary: ${candidate.row.type}`,
          alternatives,
          matchedRuleId: matchedRule?.id ?? null,
        };

        // Initiate the stream — if this throws, we fallback to next candidate
        const stream = await this.dispatchStream(decision, ctx, req, signal);

        // Record session turn (fire-and-forget)
        // Note: dispatchStream logs the dispatch result when the stream ends,
        // so we don't have a logId yet. We'll pass null or a placeholder.
        this.recordSessionTurn(ctx, decision, uuidv4()).catch(() => {});

        return { decision, stream };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${candidate.row.type}: ${msg}`);

        // Record 429 events for rate limit tracking
        if (/429|rate.?limit|too.?many/i.test(msg)) {
          record429(candidate.row.id);
        }
      }
    }

    throw new Error(`Streaming failed on all gateways: ${errors.join('; ')}`);
  }

  /**
   * Filter candidates by model capabilities when requiredCapabilities is set.
   * MOD-03: Route by model strengths, not just cost tier.
   * Gracefully degrades — returns full candidate list if no models match.
   */
  private async filterByCapabilities(
    candidates: GatewayCandidate[],
    requiredCapabilities: string[],
  ): Promise<GatewayCandidate[]> {
    if (requiredCapabilities.length === 0) return candidates;

    const gatewayIds = candidates.map(c => c.row.id);
    if (gatewayIds.length === 0) return candidates;

    const placeholders = gatewayIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query<{ gateway_id: string; capabilities: unknown }>(
      `SELECT gateway_id, capabilities
       FROM models
       WHERE gateway_id IN (${placeholders})
         AND is_active = 1`,
      gatewayIds,
    );

    // Build set of gateway IDs that have at least one model with all required capabilities
    const capableGatewayIds = new Set<string>();
    for (const row of rows) {
      const caps: string[] = Array.isArray(row.capabilities)
        ? (row.capabilities as string[])
        : (typeof row.capabilities === 'string' ? JSON.parse(row.capabilities as string) : []);
      const hasAll = requiredCapabilities.every(rc => caps.includes(rc));
      if (hasAll) capableGatewayIds.add(row.gateway_id);
    }

    const filtered = candidates.filter(c => capableGatewayIds.has(c.row.id));

    // Graceful degradation — return all candidates if none match capabilities
    return filtered.length > 0 ? filtered : candidates;
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

/**
 * Split a "type:model" string on the first colon only.
 * Preserves model names that themselves contain colons (e.g. "ollama:llama3.1:8b").
 */
function splitOnFirstColon(s: string): [string, string | null] {
  const idx = s.indexOf(':');
  if (idx === -1) return [s, null];
  return [s.slice(0, idx), s.slice(idx + 1)];
}

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

/**
 * Apply a matched routing rule to a fallback candidate list.
 * Exported for unit testing.
 *
 * Used by both selectWithFallback() and selectStreamWithFallback() so that
 * force_model / block_gateway / prefer_local are honored consistently with select().
 *
 * Unlike select() which picks exactly one gateway, fallback methods iterate the list,
 * so rules are expressed as ordering/filtering rather than single-gateway selection:
 *   - force_model: move forced gateway type to front (it is tried first, others remain as fallbacks)
 *   - block_gateway: remove the blocked gateway type entirely
 *   - prefer_local: reorder so local gateway types lead the list
 *   - cap_cost_usd / unknown: no ordering change
 */
export function applyRuleToFallbackOrder(
  rule: RoutingRuleRow | null,
  candidates: GatewayCandidate[],
): GatewayCandidate[] {
  if (!rule) return candidates;

  if (rule.action === 'force_model' && rule.actionValue) {
    const [forceType] = rule.actionValue.includes(':')
      ? rule.actionValue.split(':', 2)
      : [rule.actionValue];

    // Move the forced gateway type to the front; keep the rest in order as fallbacks
    const forced = candidates.filter(c => c.row.type === forceType);
    const rest = candidates.filter(c => c.row.type !== forceType);

    if (forced.length > 0) {
      // Use indexOf-based split to preserve model names with colons (e.g. llama3.1:8b)
      const [, forceModel] = splitOnFirstColon(rule.actionValue);
      const mappedForced = forceModel
        ? forced.map(c => ({
            row: { ...c.row, metadata: { ...c.row.metadata, default_model: forceModel } },
            adapter: c.adapter,
          }))
        : forced;
      return [...mappedForced, ...rest];
    }
    return candidates; // forced type not available — keep original order
  }

  if (rule.action === 'block_gateway' && rule.actionValue) {
    const after = candidates.filter(c => c.row.type !== rule.actionValue);
    return after.length > 0 ? after : candidates; // graceful: never produce empty list
  }

  if (rule.action === 'prefer_local') {
    const LOCAL_TYPES = new Set(['ollama', 'codex_cli', 'claude_cli', 'gemini_cli']);
    return [
      ...candidates.filter(c => LOCAL_TYPES.has(c.row.type)),
      ...candidates.filter(c => !LOCAL_TYPES.has(c.row.type)),
    ];
  }

  return candidates; // cap_cost_usd and unknown actions — no ordering change
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
