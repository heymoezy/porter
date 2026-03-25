/**
 * AI Router Service
 * Smart model selection, dispatch, tool schema rebuild, and context compression.
 * Routing is DB-driven via routingEngine — no hardcoded model selection logic.
 */

import { pool } from '../db/client.js';
import { emitSSE } from './scheduler.js';
import { routingEngine } from './bridge/routing-engine.js';
import type { BridgeDispatchRequest } from './bridge/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DispatchRequest {
  agentId: string;
  message: string;
  projectId?: string | null;
  conversationHistory?: ConversationTurn[];
  tools?: ToolDefinition[];
}

export interface DispatchResult {
  response: string;
  model: string;
  tokensUsed?: number;
  routingReason: string;
}

export interface ConversationTurn {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  requiredBackend?: string;
  parameters?: unknown;
}

// ---------------------------------------------------------------------------
// Dynamic tool schema rebuild
// ---------------------------------------------------------------------------

/**
 * Strip tool definitions that require a backend that is not available.
 * Prevents hallucinated tool calls when a backend is offline.
 */
export function filterToolsForBackend(tools: ToolDefinition[], availableBackends: string[]): ToolDefinition[] {
  return tools.filter(t => !t.requiredBackend || availableBackends.includes(t.requiredBackend));
}

// ---------------------------------------------------------------------------
// Context compressor with tool-call boundary repair
// ---------------------------------------------------------------------------

const CONTEXT_LIMIT_CHARS = 100000; // ~25K tokens at 4 chars/token
const COMPRESS_THRESHOLD = 0.5;     // Compress when context exceeds 50% of limit
const PROTECT_HEAD = 3;             // Keep first 3 turns
const PROTECT_TAIL = 4;             // Keep last 4 turns

/**
 * Compress a conversation history to stay within context limits.
 * Preserves first 3 + last 4 turns. Summarizes the middle.
 * Repairs orphaned tool-call/result pairs at compression boundaries.
 */
export function compressContext(turns: ConversationTurn[]): ConversationTurn[] {
  const totalChars = turns.reduce((sum, t) => sum + t.content.length, 0);
  if (totalChars < CONTEXT_LIMIT_CHARS * COMPRESS_THRESHOLD) {
    return turns; // No compression needed
  }
  if (turns.length <= PROTECT_HEAD + PROTECT_TAIL) {
    return turns; // Too few turns to compress
  }

  const head = turns.slice(0, PROTECT_HEAD);
  const tail = turns.slice(-PROTECT_TAIL);
  const middle = turns.slice(PROTECT_HEAD, -PROTECT_TAIL);

  const repairedMiddle = repairToolCallBoundaries(head, middle, tail);

  // Summarize the middle into a handoff turn
  const middleSummary = repairedMiddle.map(t =>
    `[${t.role}]: ${t.content.slice(0, 100)}${t.content.length > 100 ? '...' : ''}`
  ).join('\n');

  const summaryTurn: ConversationTurn = {
    role: 'system',
    content: `[Context compressed — ${repairedMiddle.length} turns summarized]\n${middleSummary}`,
  };

  return [...head, summaryTurn, ...tail];
}

/**
 * Repair orphaned tool-call/result pairs at compression boundaries.
 * Moves tool-result turns into the head/tail arrays if their call pair
 * was left behind by the split, keeping the API payload valid.
 */
function repairToolCallBoundaries(
  head: ConversationTurn[],
  middle: ConversationTurn[],
  tail: ConversationTurn[]
): ConversationTurn[] {
  const repaired = [...middle];

  // If head's last turn has tool_calls and middle starts with the tool result, absorb it into head
  const lastHead = head[head.length - 1];
  if (lastHead?.tool_calls && repaired.length > 0 && repaired[0].role === 'tool') {
    head.push(repaired.shift()!);
  }

  // If middle's last turn has tool_calls and tail starts with the tool result, absorb it into tail
  if (repaired.length > 0) {
    const lastMiddle = repaired[repaired.length - 1];
    if (lastMiddle?.tool_calls && tail.length > 0 && tail[0].role === 'tool') {
      tail.unshift(repaired.pop()!);
    }
  }

  return repaired;
}

// ---------------------------------------------------------------------------
// Decision logging
// ---------------------------------------------------------------------------

/**
 * Persist a model selection decision to decision_log and emit decision:made SSE.
 * Non-critical — failures are swallowed so dispatch is never blocked.
 */
async function logDecision(
  decisionType: 'model_selection' | 'agent_routing' | 'task_skip',
  chosen: string,
  reasoning: string,
  alternatives: string[],
  extra?: { projectId?: string | null; agentId?: string },
) {
  try {
    await pool.query(`
      INSERT INTO decision_log (decision_type, chosen, reasoning, alternatives, project_id, agent_id, job_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      decisionType,
      chosen,
      reasoning,
      JSON.stringify(alternatives),
      extra?.projectId ?? null,
      extra?.agentId ?? null,
      null,
    ]);
  } catch {
    // Decision logging is non-critical — never block dispatch
  }

  // SSE push — fire and forget
  emitSSE('decision:made', {
    decision_type: decisionType,
    chosen,
    reasoning,
    alternatives,
    project_id: extra?.projectId ?? null,
    agent_id: extra?.agentId ?? null,
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Main dispatch function
// ---------------------------------------------------------------------------

/**
 * Dispatch an agent job to the best available model backend.
 * Routing is DB-driven via RoutingEngine — no hardcoded model selection logic.
 * Throws on empty response — guarantees agent_jobs.result is non-empty on success.
 */
export async function dispatch(req: DispatchRequest): Promise<DispatchResult> {
  // 1. Route via DB-driven engine
  const decision = await routingEngine.select({
    message: req.message,
    agentId: req.agentId,
    projectId: req.projectId,
  });

  // 2. Build adapter-level request
  const history = req.conversationHistory ? compressContext(req.conversationHistory) : [];
  const messages = [
    ...history.map(t => ({ role: t.role, content: t.content })),
    { role: 'user', content: req.message },
  ];
  const bridgeReq: BridgeDispatchRequest = {
    messages,
    model: decision.modelName,
  };

  // 3. Dispatch through per-gateway concurrency queue
  const bridgeResult = await routingEngine.dispatchWithQueue(decision, bridgeReq);

  // 4. Map to DispatchResult (callers expect this shape)
  const result: DispatchResult = {
    response: bridgeResult.response,
    model: bridgeResult.model || decision.modelName,
    tokensUsed: (bridgeResult.inputTokens ?? 0) + (bridgeResult.outputTokens ?? 0) || bridgeResult.tokensUsed,
    routingReason: decision.reason,
  };

  // 5. Log dispatch decision (non-blocking)
  const logId = await routingEngine.logDispatch(decision, {
    message: req.message,
    agentId: req.agentId,
    projectId: req.projectId,
  }, bridgeResult);

  // 6. Record session routing context if chat context available (non-blocking)
  await routingEngine.recordSessionTurn({
    message: req.message,
    agentId: req.agentId,
    projectId: req.projectId,
  }, decision, logId);

  // 7. Track daily token usage (existing pattern — keep for aggregate view)
  if (bridgeResult.inputTokens || bridgeResult.outputTokens) {
    await trackTokenUsage(
      decision.modelName,
      bridgeResult.inputTokens ?? 0,
      bridgeResult.outputTokens ?? 0,
    );
  }

  // 8. Log agent-level decision (kept separate from bridge_dispatch_log)
  if (decision.alternatives.length > 0) {
    await logDecision(
      'model_selection',
      `${decision.gatewayRow.type} (${decision.modelName})`,
      decision.reason,
      decision.alternatives.map(a => `${a.gatewayType} (${a.modelName})`),
      { projectId: req.projectId, agentId: req.agentId },
    );
  }

  return result;
}

/**
 * Upsert daily token usage for the given model.
 * Non-critical — failures are swallowed so dispatch is never blocked.
 */
async function trackTokenUsage(model: string, inputTokens: number, outputTokens: number) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    await pool.query(`
      INSERT INTO token_usage_daily (model, date, input_tokens, output_tokens, request_count)
      VALUES ($1, $2, $3, $4, 1)
      ON CONFLICT(model, date) DO UPDATE SET
        input_tokens = token_usage_daily.input_tokens + $3,
        output_tokens = token_usage_daily.output_tokens + $4,
        request_count = token_usage_daily.request_count + 1
    `, [model, today, inputTokens, outputTokens]);
  } catch {
    // Non-critical — never block dispatch
  }
}
