/**
 * agent-delegation.ts — In-process agent delegation service
 *
 * Provides delegateToAgent(), a typed function that any orchestration code
 * (DAG executor, job queue, future automation) can call to delegate work to
 * another agent through Porter without HTTP overhead.
 *
 * All delegations:
 *   1. Generate a unique messageId
 *   2. Log to msg_bus_events for observability
 *   3. Persist to agent_messages for inbox/audit
 *   4. Route through the RoutingEngine (always selects Claude CLI)
 *   5. Return a typed DelegationResult with full correlation fields
 */

import crypto from 'node:crypto';
import { pool } from '../../db/client.js';
import { logMsgBusEvent, updateMsgBusEvent } from '../msg-bus.js';
import { classifyRisk, createApprovalRequest } from '../control-plane/approval-gate.js';
import { routingEngine } from './routing-engine.js';
import type { AgentMessageLogContext, RoutingContext } from './types.js';

/** PCP-02: Maximum delegation depth */
const MAX_DELEGATION_DEPTH = 3;

// ── Request / Result interfaces ───────────────────────────────────────────────

/** Parameters for an in-process agent delegation call. */
export interface DelegationRequest {
  /** The task description or prompt to delegate. */
  task: string;
  /** Links this delegation to an originating DAG rootId or parent correlation chain. */
  correlationId: string;
  /** Logical name of the delegating agent. Defaults to 'porter'. */
  sourceAgent?: string;
  /** Logical name of the target agent (e.g. a persona name). */
  targetAgent?: string;
  /** Structured context to pass as system prompt to the target model. */
  context?: Record<string, unknown>;
  /** Optional dispatch constraints. */
  constraints?: { maxTokens?: number };
  /** Current hop depth. Defaults to 0. */
  hopCount?: number;
  /** How long this delegation is valid in ms. Defaults to 120_000 (2 min). */
  ttlMs?: number;
}

/** Result of a successful in-process agent delegation. */
export interface DelegationResult {
  /** messageId generated for this delegation. */
  messageId: string;
  /** Correlation chain ID linking this to the originating DAG rootId. */
  correlationId: string;
  /** Model response text. */
  response: string;
  /** Model name that produced the response. */
  model: string;
  /** Gateway type that handled the dispatch (always 'claude_cli'). */
  gatewayType: string;
  /** End-to-end latency in ms (routing + dispatch). */
  latencyMs: number;
  /** Final hop count (input hopCount + 1). */
  hopCount: number;
  /** bridge_dispatch_log row ID for cross-table correlation. */
  dispatchLogId: string;
  /** msg_bus_events row ID, or null if logging failed (non-fatal). */
  msgBusEventId: string | null;
}

// ── delegateToAgent ───────────────────────────────────────────────────────────

/**
 * Delegate a task to another agent through Porter.
 *
 * Replicates the logic of POST /api/v1/bridge/agent-message but runs fully
 * in-process: no HTTP overhead, typed result, caller-controlled error handling.
 *
 * Errors are thrown — the caller is responsible for retry and cancellation logic.
 */
export async function delegateToAgent(opts: DelegationRequest): Promise<DelegationResult> {
  const startMs = Date.now();
  const messageId = crypto.randomUUID();
  const source = opts.sourceAgent ?? 'porter';
  const hopCount = opts.hopCount ?? 0;
  const chainId = opts.correlationId;

  // PCP-02: Enforce delegation depth limit
  if (hopCount >= MAX_DELEGATION_DEPTH) {
    try {
      await logMsgBusEvent({
        correlationId: opts.correlationId,
        sourceAgent: source,
        targetAgent: opts.targetAgent,
        targetGateway: 'claude_cli',
        intent: 'depth_violation',
        payload: {
          reason: 'DELEGATION_DEPTH_EXCEEDED',
          hopCount,
          maxDepth: MAX_DELEGATION_DEPTH,
          task: opts.task?.slice(0, 200),
        },
        hopCount,
      });
    } catch { /* non-critical */ }

    throw new Error(`Delegation depth limit exceeded (depth=${hopCount}, max=${MAX_DELEGATION_DEPTH})`);
  }

  // PCP-03: Approval gate for high-risk actions
  const riskAssessment = classifyRisk(opts.task);
  if (riskAssessment.level === 'high') {
    const approval = await createApprovalRequest({
      task: opts.task,
      correlationId: opts.correlationId,
      sourceAgent: source,
      targetAgent: opts.targetAgent,
      riskAssessment,
      delegationRequest: opts,
    });

    const error = new Error(
      `Action requires approval (id=${approval.id}): ${riskAssessment.reasons.join(', ')}`,
    );
    (error as any).code = 'APPROVAL_REQUIRED';
    (error as any).approvalId = approval.id;
    (error as any).riskReasons = riskAssessment.reasons;
    throw error;
  }

  // ── Step 1: Log to msg_bus_events (non-blocking) ──────────────────────────
  let msgBusEventId: string | null = null;
  try {
    msgBusEventId = await logMsgBusEvent({
      correlationId: opts.correlationId,
      sourceAgent: source,
      targetAgent: opts.targetAgent,
      targetGateway: 'claude_cli',
      intent: 'request',
      payload: {
        task: opts.task,
        context: opts.context ?? null,
      },
      hopCount,
    });
  } catch {
    // Non-critical — observability failure must never block delegation
  }

  // ── Step 2: Persist to agent_messages ────────────────────────────────────
  const created = await pool.query<{ id: number }>(
    `INSERT INTO agent_messages
       (run_id, from_agent, to_agent, message, status, chain_id, step_num, created_at)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6, EXTRACT(EPOCH FROM NOW()))
     RETURNING id`,
    [
      messageId,
      source,
      opts.targetAgent ?? 'claude_cli',
      opts.task,
      chainId,
      hopCount,
    ],
  );
  const agentMessageId = created.rows[0]?.id ?? null;

  // ── Step 3: Build routing context (always Claude CLI) ────────────────────
  const ctx: RoutingContext = {
    message: opts.task,
    username: 'porter-delegation',
    forceGatewayType: 'claude_cli',
  };

  // ── Step 4: Build dispatch request ───────────────────────────────────────
  const dispatchReq = {
    messages: [{ role: 'user', content: opts.task }],
    ...(opts.context ? { systemPrompt: JSON.stringify(opts.context) } : {}),
    ...(opts.constraints?.maxTokens != null ? { maxTokens: opts.constraints.maxTokens } : {}),
  };

  // ── Step 5: Route and dispatch ────────────────────────────────────────────
  let decision;
  let result;
  try {
    decision = await routingEngine.select(ctx);
    result = await routingEngine.dispatchWithQueue(decision, dispatchReq);
  } catch (e) {
    if (agentMessageId != null) {
      await pool.query(
        `UPDATE agent_messages
         SET status = 'failed', error = $2, completed_at = EXTRACT(EPOCH FROM NOW())
         WHERE id = $1`,
        [agentMessageId, e instanceof Error ? e.message : String(e)],
      );
    }
    if (msgBusEventId) {
      updateMsgBusEvent(msgBusEventId, { status: 'failed' }).catch(() => {});
    }
    throw e;
  }

  // ── Step 6: Log dispatch with correlation fields ───────────────────────────
  const agentMsgCtx: AgentMessageLogContext = {
    correlationId: opts.correlationId,
    sourceAgent: source,
    sourceGateway: undefined,
    targetAgent: opts.targetAgent,
    targetGateway: 'claude_cli',
    intent: 'request',
    replyTo: undefined,
  };

  const dispatchLogId = await routingEngine.logDispatch(decision, ctx, result, agentMsgCtx);

  // ── Step 7: Update msg_bus_events to delivered ────────────────────────────
  if (msgBusEventId) {
    updateMsgBusEvent(msgBusEventId, {
      status: 'delivered',
      dispatchLogId,
      latencyMs: result.latencyMs,
      responsePayload: { response: result.response?.slice(0, 500) },
    }).catch(() => {});
  }

  // ── Step 8: Update agent_messages to complete ─────────────────────────────
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

  const totalLatency = Date.now() - startMs;

  return {
    messageId,
    correlationId: opts.correlationId,
    response: result.response,
    model: decision.modelName,
    gatewayType: decision.gatewayRow.type,
    latencyMs: totalLatency,
    hopCount: hopCount + 1,
    dispatchLogId,
    msgBusEventId,
  };
}
