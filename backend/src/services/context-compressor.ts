/**
 * context-compressor.ts — Two-layer conversation context compression
 *
 * Layer 1: Tool output compression (per-turn, synchronous)
 *   - Compresses verbose tool results before storing in conversation history
 *   - Uses cheapest available model via internal Bridge dispatch
 *   - Fire-and-forget fallback: failures store truncated original
 *
 * Layer 2: Conversation compression (threshold-triggered, async)
 *   - Triggered at 70% context (mild) or 85% context (aggressive)
 *   - Summarizes old turns in chunks of 5, keeps recent N turns verbatim
 *   - Original turns always preserved in DB; only working context is modified
 *
 * Phase 38 Plan 02 — ACX-03, ACX-04
 */

// ── Configuration (env-driven) ────────────────────────────────────────────────

/** Token threshold above which a tool output is compressed (default 500 tokens) */
export const COMPRESS_THRESHOLD = parseInt(
  process.env.PORTER_COMPRESS_THRESHOLD ?? '500',
  10
);

/** Context fraction at which mild compression starts (default 0.70 = 70%) */
export const COMPRESS_MILD_PCT = parseFloat(
  process.env.PORTER_COMPRESS_MILD_PCT ?? '0.70'
);

/** Context fraction at which aggressive compression starts (default 0.85 = 85%) */
export const COMPRESS_AGGRESSIVE_PCT = parseFloat(
  process.env.PORTER_COMPRESS_AGGRESSIVE_PCT ?? '0.85'
);

/** Number of most-recent turns to keep verbatim (default 10) */
export const COMPRESS_KEEP_RECENT = parseInt(
  process.env.PORTER_COMPRESS_KEEP_RECENT ?? '10',
  10
);

/** Preferred compression model gateway type (default 'ollama' — cheapest local) */
export const COMPRESS_MODEL = process.env.PORTER_COMPRESS_MODEL ?? 'ollama';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConversationTurn {
  role: string;
  content: string;
  /** Set when this turn has been summarized from N original turns */
  compressed?: boolean;
  /** Original token count before compression */
  originalTokens?: number;
}

export interface CompressionResult {
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
  compressionEvents: number;
}

export interface ToolOutputCompression {
  summary: string;
  compressed: boolean;
  originalTokens: number;
  compressedTokens: number;
}

// ── Token estimation ──────────────────────────────────────────────────────────

/**
 * Estimate token count using the 4-chars-per-token heuristic.
 * Consistent with memory-injection.ts and routing-engine.ts usage.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Bridge dispatch helper (internal, no circular dep) ────────────────────────

/**
 * Fire a non-streaming dispatch via the internal Bridge HTTP endpoint.
 * Used for compression LLM calls only — not for main dispatch flow.
 * Falls back gracefully on failure.
 */
async function dispatchCompression(prompt: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch('http://127.0.0.1:3001/api/v1/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        message: prompt,
        systemPrompt:
          'You are a summarizer. Be extremely concise. Preserve: key data values, error messages, status codes, file paths, and actionable items. Output only the summary, no preamble.',
        forceGatewayType: COMPRESS_MODEL,
        maxTokens: 200,
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = (await response.json()) as { response?: string; content?: string };
    return data.response ?? data.content ?? null;
  } catch {
    // Network failure, timeout, or parse error — all non-fatal
    return null;
  }
}

// ── Layer 1: Tool Output Compression ─────────────────────────────────────────

/**
 * Compress a tool output string if it exceeds the token threshold.
 * Always returns a result — failures fall back to truncation, never throw.
 *
 * @param result - Raw tool output string
 * @param threshold - Override token threshold (default: COMPRESS_THRESHOLD)
 */
export async function compressToolOutput(
  result: string,
  threshold?: number
): Promise<ToolOutputCompression> {
  const limit = threshold ?? COMPRESS_THRESHOLD;
  const originalTokens = estimateTokens(result);

  // Under threshold — return verbatim
  if (originalTokens <= limit) {
    return {
      summary: result,
      compressed: false,
      originalTokens,
      compressedTokens: originalTokens,
    };
  }

  // Attempt LLM compression
  const prompt = `Summarize this tool output preserving: key data values, error messages, status codes, file paths, and actionable items. Be concise.\n\n${result.slice(0, 8000)}`;
  const summary = await dispatchCompression(prompt);

  if (summary && summary.length > 0) {
    const compressedTokens = estimateTokens(summary);
    return {
      summary,
      compressed: true,
      originalTokens,
      compressedTokens,
    };
  }

  // Fallback: truncate to 1000 tokens (~4000 chars)
  const truncated = result.slice(0, 4000);
  return {
    summary: truncated,
    compressed: true,
    originalTokens,
    compressedTokens: estimateTokens(truncated),
  };
}

// ── Layer 2: Conversation History Compression ─────────────────────────────────

/**
 * Compress old conversation turns to reclaim context budget.
 * Keeps the most recent `keepRecent` turns verbatim.
 * Groups older turns into chunks of 5 and summarizes each chunk.
 * Original turns are NOT deleted — only the working representation is modified.
 *
 * @param turns - Full conversation history
 * @param keepRecent - How many recent turns to leave untouched
 * @param targetTokenBudget - Target token count for the compressed history
 */
export async function compressConversationHistory(
  turns: ConversationTurn[],
  keepRecent?: number,
  targetTokenBudget?: number
): Promise<{ compressed: ConversationTurn[]; stats: CompressionResult }> {
  const keep = keepRecent ?? COMPRESS_KEEP_RECENT;
  const _budget = targetTokenBudget; // reserved for future budget-aware trimming

  if (turns.length <= keep) {
    // Nothing old enough to compress
    const totalTokens = turns.reduce((sum, t) => sum + estimateTokens(t.content), 0);
    return {
      compressed: turns,
      stats: {
        originalTokens: totalTokens,
        compressedTokens: totalTokens,
        savedTokens: 0,
        compressionEvents: 0,
      },
    };
  }

  const recentTurns = turns.slice(-keep);
  const oldTurns = turns.slice(0, turns.length - keep);

  const originalTokens = turns.reduce((sum, t) => sum + estimateTokens(t.content), 0);
  let compressionEvents = 0;
  const summarizedTurns: ConversationTurn[] = [];

  // Group old turns into chunks of 5 and summarize each
  const CHUNK_SIZE = 5;
  for (let i = 0; i < oldTurns.length; i += CHUNK_SIZE) {
    const chunk = oldTurns.slice(i, i + CHUNK_SIZE);
    const chunkText = chunk
      .map(t => `${t.role}: ${t.content}`)
      .join('\n');

    const chunkOriginalTokens = chunk.reduce((sum, t) => sum + estimateTokens(t.content), 0);

    const prompt = `Summarize these ${chunk.length} conversation turns in 1-2 sentences. Preserve key decisions, data values, errors, and outcomes.\n\n${chunkText.slice(0, 6000)}`;
    const summary = await dispatchCompression(prompt);

    if (summary && summary.length > 0) {
      compressionEvents++;
      summarizedTurns.push({
        role: 'system',
        content: `[Summary of ${chunk.length} earlier turns] ${summary}`,
        compressed: true,
        originalTokens: chunkOriginalTokens,
      });
    } else {
      // Compression failed — keep original chunk to avoid data loss
      summarizedTurns.push(...chunk);
    }
  }

  const compressed = [...summarizedTurns, ...recentTurns];
  const compressedTokens = compressed.reduce((sum, t) => sum + estimateTokens(t.content), 0);

  return {
    compressed,
    stats: {
      originalTokens,
      compressedTokens,
      savedTokens: Math.max(0, originalTokens - compressedTokens),
      compressionEvents,
    },
  };
}
