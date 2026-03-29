/**
 * AI Router Service
 * Smart model selection, dispatch, tool schema rebuild, and context compression.
 * Routing is DB-driven via routingEngine — no hardcoded model selection logic.
 */

import { pool } from '../db/client.js';
import { emitSSE } from './scheduler.js';
import { routingEngine } from './bridge/routing-engine.js';
import { buildMemoryContext } from './memory-injection.js';
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
  username?: string;
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
// Bridge-Native Task Promotion & Reactive Subscriptions
// ---------------------------------------------------------------------------

/**
 * Detect @model mentions in the assistant response and promote them to the tasks table.
 */
export async function promoteTasksFromMentions(response: string, projectId?: string | null, username?: string) {
  const mentions = response.match(/@([\w-]+)/g);
  if (!mentions) return;

  for (const mention of mentions) {
    const modelName = mention.slice(1);
    // Skip common non-model mentions if any, but spec says "@model mention detector"
    const taskId = `task_${Math.random().toString(36).slice(2, 11)}`;
    try {
      await pool.query(`
        INSERT INTO tasks (id, project_id, username, title, description, status, priority)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        taskId,
        projectId ?? null,
        username ?? null,
        `Handoff to @${modelName}`,
        `Task promoted from bridge mention in assistant response.`,
        'pending',
        'normal'
      ]);
    } catch (e) {
      console.error('[ai-router] Failed to promote task:', e);
    }
  }
}

/**
 * Check for directives or project notes updated since the last dispatch in this session.
 */
export async function getRecentUpdates(agentId: string, projectId?: string | null) {
  try {
    // 1. Get last dispatch timestamp for this context
    const lastDispatch = await pool.query(
      `SELECT created_at FROM bridge_dispatch_log
       WHERE agent_id = $1 AND (project_id = $2 OR project_id IS NULL)
       ORDER BY created_at DESC LIMIT 1`,
      [agentId, projectId ?? null]
    );

    if (lastDispatch.rows.length === 0) return null;
    const threshold = lastDispatch.rows[0].created_at;

    // 2. Check for updated directives
    const updatedDirectives = await pool.query(
      `SELECT content FROM directives
       WHERE status = 'active'
         AND (scope = 'workspace' OR (scope = 'project' AND scope_id = $1))
         AND updated_at > $2`,
      [projectId ?? null, threshold]
    );

    // 3. Check for updated notes
    const updatedNotes = projectId ? await pool.query(
      `SELECT content FROM project_notes
       WHERE status = 'active' AND project_id = $1 AND updated_at > $2`,
      [projectId, threshold]
    ) : { rows: [] };

    if (updatedDirectives.rows.length === 0 && updatedNotes.rows.length === 0) return null;

    return {
      directives: updatedDirectives.rows.map(r => r.content),
      notes: updatedNotes.rows.map(r => r.content),
    };
  } catch {
    return null; // Fail silent — reactive updates are an enhancement
  }
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
  // 1. Build routing context
  const ctx = {
    message: req.message,
    agentId: req.agentId,
    projectId: req.projectId,
    username: req.username,  // MT-03: usage attribution
  };

  // 2. Build adapter-level request with system prompt + memory context
  const history = req.conversationHistory ? compressContext(req.conversationHistory) : [];

  // Reactive Subscriptions: Check for mid-conversation rule updates
  const updates = await getRecentUpdates(req.agentId, req.projectId);
  if (updates) {
    const updateMsg = [
      updates.directives.length > 0 ? `[SYSTEM] The following directives were updated:\n${updates.directives.join('\n')}` : '',
      updates.notes.length > 0 ? `[SYSTEM] The following project notes were updated:\n${updates.notes.join('\n')}` : '',
    ].filter(Boolean).join('\n\n');

    if (updateMsg) {
      history.push({ role: 'system', content: updateMsg });
    }
  }

  // Memory V3: inject tiered memory context (directives, concepts, notes)
  const memoryContext = await buildMemoryContext({
    agentId: req.agentId,
    projectId: req.projectId ?? undefined,
    searchQuery: req.message,
  });

  // Augment user message with memory context (original message preserved in history)
  const augmentedMessage = memoryContext
    ? memoryContext + '\n\n---\n\n' + req.message
    : req.message;

  const messages = [
    ...history.map(t => ({ role: t.role, content: t.content })),
    { role: 'user', content: augmentedMessage },
  ];

  // Look up agent's system prompt from template
  let systemPrompt: string | undefined;
  try {
    const rows = await pool.query(
      `SELECT at.system_prompt FROM personas p JOIN agent_templates at ON at.id = p.template_id WHERE p.id = $1 AND at.system_prompt IS NOT NULL AND at.system_prompt != '' LIMIT 1`,
      [req.agentId]
    );
    if (rows.rows.length > 0) {
      systemPrompt = rows.rows[0].system_prompt;
    }
  } catch { /* persona may not have template link — fall through */ }

  const bridgeReq: BridgeDispatchRequest = { messages, systemPrompt };

  // 3. Dispatch with N-gateway fallback chain (GW-06)
  const { decision, result: bridgeResult } = await routingEngine.selectWithFallback(ctx, bridgeReq);

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
    username: req.username,
  }, bridgeResult);

  // 6. Record session routing context if chat context available (non-blocking)
  await routingEngine.recordSessionTurn({
    message: req.message,
    agentId: req.agentId,
    projectId: req.projectId,
    username: req.username,
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

  // 9. Bridge-Native Task Promotion (promote @mentions to tasks table)
  await promoteTasksFromMentions(bridgeResult.response, req.projectId, req.username);

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
