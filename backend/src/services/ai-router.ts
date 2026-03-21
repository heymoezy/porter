/**
 * AI Router Service
 * Smart model selection, dispatch, tool schema rebuild, and context compression.
 * All backend URLs and tokens come from config.ts — no hardcoded values in this file.
 */

import { config } from '../config.js';

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

type ModelTier = 'cheap' | 'strong';

// ---------------------------------------------------------------------------
// Smart routing heuristic (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Decide whether to route a message to the cheap (Ollama) model.
 * Returns false (strong model) if message is long, complex, contains code/URLs,
 * or uses technical keywords that indicate substantive work.
 */
export function shouldRouteCheap(message: string): boolean {
  // Messages over 160 chars or 28 words → strong
  if (message.length > 160 || message.split(/\s+/).length > 28) return false;
  // Code, URLs, technical keywords → strong
  if (/```|`|https?:\/\/|debug|implement|refactor|test|tool|analyze|architecture/i.test(message)) return false;
  // Everything else → cheap
  return true;
}

// ---------------------------------------------------------------------------
// Backend selection and availability probing
// ---------------------------------------------------------------------------

/**
 * Returns backend descriptors derived from config at runtime.
 * No hardcoded addresses — all values come from config.ts which reads env vars.
 */
function getBackends() {
  return {
    cheap: { name: 'ollama', url: config.ollamaUrl, model: config.ollamaModel },
    strong: { name: 'openclaw', url: config.openclawUrl, model: config.openclawModel },
  } as const;
}

/**
 * Probe a backend with a 2s timeout HEAD request.
 * HEAD returning 405 is treated as "server is up" — some APIs disallow HEAD.
 */
async function probeBackend(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
    return resp.ok || resp.status === 405;
  } catch {
    return false;
  }
}

async function selectModel(message: string): Promise<{
  tier: ModelTier;
  backend: { name: string; url: string; model: string };
  reason: string;
}> {
  const BACKENDS = getBackends();
  const preferCheap = shouldRouteCheap(message);
  const tier: ModelTier = preferCheap ? 'cheap' : 'strong';
  const backend = BACKENDS[tier];

  const available = await probeBackend(backend.url);
  if (available) {
    return { tier, backend, reason: `${tier} model selected (${preferCheap ? 'simple' : 'complex'} message)` };
  }

  const fallbackTier: ModelTier = tier === 'cheap' ? 'strong' : 'cheap';
  const fallback = BACKENDS[fallbackTier];
  const fallbackAvailable = await probeBackend(fallback.url);
  if (fallbackAvailable) {
    return { tier: fallbackTier, backend: fallback, reason: `Fallback to ${fallbackTier} (${tier} unreachable)` };
  }

  // Last resort: proxy to porter.py
  return {
    tier: 'strong' as ModelTier,
    backend: { name: 'porter-proxy', url: config.porterPyUrl, model: 'proxy' },
    reason: 'All backends down, proxying to porter.py',
  };
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
// Main dispatch function
// ---------------------------------------------------------------------------

/**
 * Dispatch an agent job to the best available model backend.
 * Routing: cheap (Ollama) for simple messages, strong (openclaw) for complex.
 * Fallback: preferred → other tier → porter.py proxy.
 * Throws on empty response — guarantees agent_jobs.result is non-empty on success.
 */
export async function dispatch(req: DispatchRequest): Promise<DispatchResult> {
  const { tier, backend, reason } = await selectModel(req.message);

  // If proxying to porter.py, use the existing dispatch endpoint
  if (backend.name === 'porter-proxy') {
    const resp = await fetch(`${config.porterPyUrl}/api/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        persona_id: req.agentId,
        message: req.message,
        project_id: req.projectId,
      }),
    });
    const text = await resp.text();
    if (!text) throw new Error('porter-proxy returned empty response');
    return { response: text, model: 'porter-proxy', routingReason: reason };
  }

  // Direct dispatch to Ollama: POST /api/generate { model, prompt, stream: false }
  if (backend.name === 'ollama') {
    const resp = await fetch(`${backend.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: backend.model, prompt: req.message, stream: false }),
    });
    const data = await resp.json() as { response: string };
    if (!data.response) throw new Error('ollama returned empty response field');
    return { response: data.response, model: backend.model, routingReason: reason };
  }

  // openclaw/codex via OpenAI-compatible API — token from config (no hardcoded value)
  const history = req.conversationHistory ? compressContext(req.conversationHistory) : [];
  const messages: { role: string; content: string }[] = [
    ...history.map(t => ({ role: t.role, content: t.content })),
    { role: 'user', content: req.message },
  ];

  const resp = await fetch(`${backend.url}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Token read from config.openclawToken (set via OPENCLAW_TOKEN env var — no hardcoded fallback)
      'Authorization': `Bearer ${config.openclawToken}`,
    },
    body: JSON.stringify({ model: backend.model, messages, stream: false }),
  });
  const data = await resp.json() as { choices: { message: { content: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error('openclaw returned empty content');
  return { response: content, model: backend.model, routingReason: reason };
}
