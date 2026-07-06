/**
 * Routing Engine — Claude CLI single-gateway dispatch and logging
 *
 * Simplified from multi-gateway routing to single Claude CLI gateway.
 * Retains DB-backed gateway lookup, dispatch logging, session tracking,
 * and concurrency-queued dispatch.
 */

import { pool } from '../../db/client.js';
import { createAdapter } from './adapters/index.js';
import { calculateCostUsd } from './model-catalog.js';
import { getQueue } from './dispatch-queues.js';
import { buildContextStats } from '../context-stats-collector.js';
import { getBreaker } from './circuit-breaker-registry.js';
import { withRetry } from './retry.js';
import { emitSSE } from '../scheduler.js';
import { parseRateLimitHeaders, record429 } from './rate-limit-tracker.js';
import { v4 as uuidv4 } from 'uuid';
import { compressToolOutput, estimateTokens } from '../context-compressor.js';
import { getLegacyTags, normalizeCapabilities } from './capability-registry.js';
import { upsertSession } from '../session-registry.js';
import {
  orderChain,
  classifyFailure,
  raceBudget,
  DEFAULT_CHAIN_BUDGET_MS,
  MIN_ATTEMPT_MS,
  BUDGET_TIMEOUT_MARKER,
  type FailoverAttempt,
  type FailoverRecord,
} from './failover.js';
import type {
  GatewayRow,
  GatewayAdapter,
  GatewayType,
  RoutingContext,
  RoutingDecision,
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

// ── RoutingEngine class ───────────────────────────────────────────────────────

export class RoutingEngine {
  /**
   * Query all active+enabled gateway candidates ordered by priority.
   * With Claude CLI as sole gateway, returns at most 1 candidate.
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
   * Select a gateway for the given routing context.
   *
   * Selection order:
   *   1. forceGatewayType — pin to the matching candidate if active+enabled.
   *   2. Otherwise the first candidate (sorted by priority ASC).
   *
   * If forceModelName is set, overrides the default_model on the gateway row.
   */
  async select(ctx: RoutingContext): Promise<RoutingDecision> {
    const candidates = await this.selectAllCandidates();

    if (candidates.length === 0) {
      throw new Error('No active gateways available');
    }

    let chosen: GatewayCandidate;
    let reason: string;

    if (ctx.forceGatewayType) {
      const forced = candidates.find(c => c.row.type === ctx.forceGatewayType);
      if (!forced) {
        throw new Error(
          `Forced gateway type '${ctx.forceGatewayType}' not available (active candidates: ${candidates.map(c => c.row.type).join(', ') || 'none'})`,
        );
      }
      chosen = forced;
      reason = `Forced gateway type: ${ctx.forceGatewayType}`;
    } else {
      chosen = candidates[0];
      reason = `${chosen.row.name} (priority ${chosen.row.priority})`;
    }

    // Apply model override if requested
    if (ctx.forceModelName) {
      chosen = {
        row: {
          ...chosen.row,
          metadata: { ...chosen.row.metadata, default_model: ctx.forceModelName },
        },
        adapter: chosen.adapter,
      };
    }

    return {
      gatewayRow: chosen.row,
      adapter: chosen.adapter,
      modelName: resolveModelName(chosen.row),
      reason,
      alternatives: [],
      matchedRuleId: null,
    };
  }

  /**
   * Log a completed dispatch to bridge_dispatch_log.
   * Fire-and-forget — never blocks the caller.
   */
  async logDispatch(
    decision: RoutingDecision,
    ctx: RoutingContext,
    result: BridgeDispatchResult,
    agentMsgCtx?: AgentMessageLogContext,
    compressionStats?: { tool_outputs_compressed: number; tokens_saved: number; compression_model: string } | null,
    failover?: FailoverRecord | null,
  ): Promise<string> {
    const id = uuidv4();

    (async () => {
      try {
        const costUsd = await calculateCostUsd(
          result.inputTokens ?? null,
          result.outputTokens ?? null,
          result.cachedTokens ?? null,
          decision.modelName,
          decision.gatewayRow.id,
          pool,
        );

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
          // non-fatal
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
              compression_stats,
              dispatch_strategy,
              failover,
              created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                   $18,$19,$20,$21,$22,$23,$24,$25,
                   $26,
                   $27,
                   $28,
                   $29,
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
            agentMsgCtx?.sourceAgent ?? ctx.sourceAgent ?? null,
            agentMsgCtx?.sourceGateway ?? null,
            agentMsgCtx?.targetAgent ?? null,
            agentMsgCtx?.targetGateway ?? null,
            agentMsgCtx?.intent ?? null,
            agentMsgCtx?.replyTo ?? null,
            agentMsgCtx ? 1 : null,
            ctx.skillsUsed ? JSON.stringify(ctx.skillsUsed) : null,
            compressionStats ? JSON.stringify(compressionStats) : null,
            ctx.dispatchStrategy ?? null,
            failover ? JSON.stringify(failover) : null,
          ],
        );

        // Increment times_selected counter on persona_skills
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
          } catch { /* non-fatal */ }
        }

        // Session token tracking + context_stats
        let sessionContextPct = 0;
        let sessionCompressionEvents = 0;
        let sessionTokensReclaimed = 0;
        let sessionTurnNumber = 0;
        try {
          const totalTokens = (result.inputTokens ?? 0) + (result.outputTokens ?? 0);
          if (totalTokens > 0 && (ctx.chatId || ctx.agentId)) {
            let tokenBudget = 0;
            try {
              const { rows: mrows } = await pool.query<{ context_window: number }>(
                `SELECT context_window FROM models WHERE gateway_id = $1 AND model_name = $2 LIMIT 1`,
                [decision.gatewayRow.id, decision.modelName],
              );
              tokenBudget = mrows[0]?.context_window ?? 0;
            } catch { /* non-fatal */ }

            const sessionResult = await upsertSession(
              ctx.chatId ?? null,
              ctx.agentId ?? null,
              totalTokens,
              decision.gatewayRow.type,
              decision.modelName,
              tokenBudget,
            );
            sessionContextPct = sessionResult.contextPct;

            try {
              const { rows: srows } = await pool.query<{
                compression_events: number | null;
                tokens_reclaimed: number | null;
                context_msgs: number;
              }>(
                `SELECT compression_events, tokens_reclaimed, context_msgs
                 FROM session_registry WHERE id = $1`,
                [sessionResult.sessionId],
              );
              if (srows.length > 0) {
                sessionCompressionEvents = srows[0].compression_events ?? 0;
                sessionTokensReclaimed = srows[0].tokens_reclaimed ?? 0;
                sessionTurnNumber = srows[0].context_msgs;
              }
            } catch { /* non-fatal */ }
          }
        } catch { /* non-critical */ }

        // Write context_stats to dispatch log row
        try {
          const contextStats = buildContextStats({
            skillsUsed: ctx.skillsUsed ?? null,
            directiveStats: ctx.directiveStats ? {
              total_active: ctx.directiveStats.total,
              injected: ctx.directiveStats.injected,
              skipped: ctx.directiveStats.skipped,
              scoring_mode: ctx.directiveStats.scoring_mode,
            } : undefined,
            compressionStats: compressionStats ? {
              tool_outputs_compressed: compressionStats.tool_outputs_compressed,
              conversation_turns_compressed: 0,
              tokens_saved: compressionStats.tokens_saved,
            } : undefined,
            sessionResult: { tokensUsed: 0, contextPct: sessionContextPct },
            sessionCompressionEvents,
            sessionTokensReclaimed,
            turnNumber: sessionTurnNumber,
          });
          await pool.query(
            `UPDATE bridge_dispatch_log SET context_stats = $1 WHERE id = $2`,
            [JSON.stringify(contextStats), id],
          );
        } catch { /* non-critical */ }

        // Memory V3 signal — agent learns model preferences
        if (ctx.agentId) {
          try {
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
          } catch { /* non-critical */ }
        }
      } catch {
        // Non-critical — never block dispatch
      }

      // Parse rate limit headers from HTTP adapters
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
   * Dispatch to Claude CLI with circuit breaker and retry.
   * Single gateway — no fallback iteration.
   */
  async selectWithFallback(
    ctx: RoutingContext,
    req: BridgeDispatchRequest,
  ): Promise<{ decision: RoutingDecision; result: BridgeDispatchResult }> {
    const decision = await this.select(ctx);
    const breaker = getBreaker(decision.gatewayRow.id, decision.gatewayRow.type);

    try {
      const result = await withRetry(() =>
        getQueue(decision.gatewayRow.type).add(() =>
          breaker.fire(async () => decision.adapter.dispatch(req))
        ) as Promise<BridgeDispatchResult>,
      );

      return { decision, result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // Record 429 events for rate limit tracking
      if (/429|rate.?limit|too.?many/i.test(msg)) {
        record429(decision.gatewayRow.id);
      }

      throw new Error(`Gateway ${decision.gatewayRow.type} failed: ${msg}`);
    }
  }

  /**
   * Build a RoutingDecision from a candidate. Model override from ctx is
   * applied ONLY to the lead/forced gateway — fallback gateways run on their
   * own default model (a Claude model name is meaningless to codex/agy).
   */
  private buildDecision(cand: GatewayCandidate, ctx: RoutingContext, isLead: boolean, reason: string): RoutingDecision {
    let row = cand.row;
    if (isLead && ctx.forceModelName) {
      row = { ...row, metadata: { ...row.metadata, default_model: ctx.forceModelName } };
    }
    return {
      gatewayRow: row,
      adapter: cand.adapter,
      modelName: resolveModelName(row),
      reason,
      alternatives: [],
      matchedRuleId: null,
    };
  }

  /**
   * Dispatch with a MODEL-FAILOVER CHAIN (Moe 2026-07-06: "bridge should be
   * switching tom into other models via porter bridge as backup if claude
   * fails or quota is reached"). When the lead gateway errors — process
   * failure, timeout, or a quota/usage-limit signature — the SAME task is
   * retried on the next gateway in the configured chain
   * (claude_cli → codex_cli → antigravity_cli by default) so every Bridge
   * consumer (Tom's workers, digests, ops-chat, vault-chat, evolution loop)
   * survives Claude quota exhaustion instead of hard-failing until reset.
   *
   * @param opts.fallback   false ⇒ single-gateway hard-fail (no switching)
   * @param opts.simulateFailure gateway types to force-fail — LOOPBACK-GATED by
   *                        the caller; a proof hook that never burns real quota
   * @param opts.budgetMs   total wall-clock shared across the chain (default 300s)
   */
  async dispatchWithFailover(
    ctx: RoutingContext,
    req: BridgeDispatchRequest,
    opts?: { fallback?: boolean; simulateFailure?: GatewayType[]; budgetMs?: number },
  ): Promise<{ decision: RoutingDecision; result: BridgeDispatchResult; failover: FailoverRecord }> {
    const candidates = await this.selectAllCandidates();
    if (candidates.length === 0) throw new Error('No active gateways available');

    const fallbackEnabled = opts?.fallback !== false;
    const budgetMs = opts?.budgetMs ?? DEFAULT_CHAIN_BUDGET_MS;
    const simulate = opts?.simulateFailure ?? [];

    const candidateTypes: string[] = candidates.map(c => c.row.type);
    const lead = ctx.forceGatewayType;
    if (lead && !candidateTypes.includes(lead)) {
      throw new Error(
        `Forced gateway type '${lead}' not available (active candidates: ${candidateTypes.join(', ') || 'none'})`,
      );
    }

    let chain = orderChain(candidateTypes, lead);
    if (!fallbackEnabled) chain = chain.slice(0, 1); // hard-fail: lead only

    const attempts: FailoverAttempt[] = [];
    const startTs = Date.now();
    let lastErr: Error | null = null;

    for (let i = 0; i < chain.length; i++) {
      const type = chain[i];
      const cand = candidates.find(c => c.row.type === type);
      if (!cand) continue;
      const isLead = i === 0;
      const decision = this.buildDecision(
        cand, ctx, isLead,
        isLead ? `${cand.row.name} (lead)` : `failover → ${cand.row.name} (chain pos ${i})`,
      );
      const modelName = decision.modelName;

      const remaining = budgetMs - (Date.now() - startTs);
      if (remaining < MIN_ATTEMPT_MS) {
        attempts.push({ gatewayType: type, modelName, outcome: 'budget_exhausted', latencyMs: 0 });
        continue;
      }

      const breaker = getBreaker(cand.row.id, cand.row.type);
      const attemptStart = Date.now();
      try {
        if (simulate.includes(type as GatewayType)) {
          throw new Error(`[simulateFailure] forced failure for ${type}`);
        }
        const result = await raceBudget(
          withRetry(() =>
            getQueue(cand.row.type).add(() =>
              breaker.fire(async () => cand.adapter.dispatch(req)),
            ) as Promise<BridgeDispatchResult>,
          ),
          remaining,
        );
        attempts.push({ gatewayType: type, modelName, outcome: 'ok', latencyMs: Date.now() - attemptStart });
        return { decision, result, failover: { chain, attempts, answeredBy: type, fallbackEnabled, budgetMs } };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const outcome = msg.includes('[simulateFailure]') ? 'simulated'
          : msg.includes(BUDGET_TIMEOUT_MARKER) ? 'timeout'
          : classifyFailure(msg);
        if (/429|rate.?limit|too.?many/i.test(msg)) record429(cand.row.id);
        attempts.push({ gatewayType: type, modelName, outcome, reason: msg.slice(0, 300), latencyMs: Date.now() - attemptStart });
        lastErr = e instanceof Error ? e : new Error(msg);
        // fall through to the next gateway in the chain
      }
    }

    const record: FailoverRecord = { chain, attempts, answeredBy: null, fallbackEnabled, budgetMs };
    const finalErr = new Error(
      `Failover chain exhausted (${chain.join(' → ')}): ${lastErr ? lastErr.message : 'all gateways failed'}`,
    ) as Error & { failoverRecord?: FailoverRecord };
    finalErr.failoverRecord = record;
    throw finalErr;
  }

  /**
   * Dispatch a streaming request through per-gateway concurrency queue.
   * Wraps the adapter stream to capture observability data (latency, tokens).
   */
  private async dispatchStream(
    decision: RoutingDecision,
    ctx: RoutingContext,
    req: BridgeDispatchRequest,
    signal: AbortSignal,
  ): Promise<AsyncIterable<string>> {
    const start = Date.now();
    let firstTokenAt: number | null = null;
    let fullResponse = '';

    const self = this;

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

        const adapterTokens = (decision.adapter as any).lastStreamTokens as { inputTokens?: number; outputTokens?: number } | null;
        const rawOutputTokens = adapterTokens?.outputTokens ?? estimateTokens(fullResponse);
        const inputTokens = adapterTokens?.inputTokens ?? estimateTokens(JSON.stringify(req.messages));

        // Tool output compression
        let compressionStats: { tool_outputs_compressed: number; tokens_saved: number; compression_model: string } | null = null;
        let loggedResponse = fullResponse;
        try {
          const compressed = await compressToolOutput(fullResponse);
          if (compressed.compressed) {
            loggedResponse = compressed.summary;
            compressionStats = {
              tool_outputs_compressed: 1,
              tokens_saved: compressed.originalTokens - compressed.compressedTokens,
              compression_model: 'claude_cli',
            };
          }
        } catch {
          // Non-fatal
        }

        const result: BridgeDispatchResult = {
          response: loggedResponse,
          model: decision.modelName,
          latencyMs: Date.now() - start,
          cached: false,
          outputTokens: rawOutputTokens,
          inputTokens,
        };

        const dispatchId = self.logDispatch(decision, ctx, result, undefined, compressionStats).catch(() => null as string | null);
        const resolvedId = await dispatchId;
        if (resolvedId) yield `__DISPATCH_META__${JSON.stringify({ dispatch_id: resolvedId })}`;
      } catch (err) {
        throw err;
      }
    })();

    return wrappedStream;
  }

  /**
   * Dispatch streaming to Claude CLI with circuit breaker.
   * Single gateway — no fallback iteration.
   */
  async selectStreamWithFallback(
    ctx: RoutingContext,
    req: BridgeDispatchRequest,
    signal: AbortSignal,
  ): Promise<{ decision: RoutingDecision; stream: AsyncIterable<string> }> {
    const decision = await this.select(ctx);
    const breaker = getBreaker(decision.gatewayRow.id, decision.gatewayRow.type);

    if (breaker.opened) {
      throw new Error(`Gateway ${decision.gatewayRow.type}: circuit open`);
    }

    try {
      const stream = await this.dispatchStream(decision, ctx, req, signal);

      // Record session turn (fire-and-forget)
      this.recordSessionTurn(ctx, decision, uuidv4()).catch(() => {});

      return { decision, stream };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (/429|rate.?limit|too.?many/i.test(msg)) {
        record429(decision.gatewayRow.id);
      }

      throw new Error(`Streaming failed on ${decision.gatewayRow.type}: ${msg}`);
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const routingEngine = new RoutingEngine();

// ── Private helpers ───────────────────────────────────────────────────────────

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
    capabilities: getLegacyTags(raw.capabilities),
    capabilityRecord: (normalizeCapabilities(raw.capabilities) ?? undefined) as Record<string, unknown> | undefined,
    metadata: (typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {}) as Record<string, unknown>,
    enabled: raw.enabled,
    maskedDisplay: raw.masked_display,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    lastHealthAt: raw.last_health_at,
  };
}
