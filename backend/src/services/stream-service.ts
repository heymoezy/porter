/**
 * Stream Service
 * Backend-agnostic streaming abstraction for real-time token delivery.
 *
 * Provides a unified StreamBackend interface with two concrete implementations:
 *   - OllamaStreamBackend: parses NDJSON from Ollama /api/generate (stream: true)
 *   - OpenClawStreamBackend: streams from OpenClaw's OpenAI-compatible /v1/chat/completions
 *
 * Backend selection is handled by selectStreamBackend(), which re-uses
 * shouldRouteCheap() from ai-router.ts for routing decisions.
 *
 * All backends accept an AbortSignal and terminate early when aborted.
 */

import { config } from '../config.js';
import { routingEngine } from './bridge/routing-engine.js';

// ---------------------------------------------------------------------------
// StreamBackend interface
// ---------------------------------------------------------------------------

export interface StreamBackend {
  name: string;
  stream(prompt: string, signal: AbortSignal, systemPrompt?: string): AsyncIterable<string>;
}

// Default fallback — only used when no agent-specific prompt is available
const PORTER_SYSTEM_DEFAULT = `You are Porter, an AI orchestration platform. Be helpful, concise, and direct.`;

// ---------------------------------------------------------------------------
// OllamaStreamBackend
// ---------------------------------------------------------------------------

/**
 * Streams tokens from Ollama's /api/generate endpoint.
 * Ollama sends newline-delimited JSON (NDJSON) lines:
 *   {"response":"token","done":false}
 *   {"response":"","done":true,"total_duration":12345,...}
 *
 * Partial-line buffering handles the case where chunk boundaries split a JSON line.
 */
export class OllamaStreamBackend implements StreamBackend {
  readonly name = 'ollama';

  async *stream(prompt: string, signal: AbortSignal, systemPrompt?: string): AsyncIterable<string> {
    const resp = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.ollamaModel, system: systemPrompt || PORTER_SYSTEM_DEFAULT, prompt, stream: true, options: { num_predict: 150, temperature: 0.7 } }),
      signal,
    });

    if (!resp.ok) {
      throw new Error(`Ollama returned ${resp.status}`);
    }

    if (!resp.body) {
      throw new Error('Ollama response has no body');
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        // Check abort before each read
        if (signal.aborted) return;

        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await reader.read();
        } catch (err) {
          // Stream aborted or closed — stop cleanly
          return;
        }

        if (result.done) break;

        buffer += decoder.decode(result.value, { stream: true });

        // Split on newlines; last element is an incomplete line (keep in buffer)
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let chunk: { response: string; done: boolean };
          try {
            chunk = JSON.parse(trimmed) as { response: string; done: boolean };
          } catch {
            // Malformed line — skip
            continue;
          }

          if (chunk.done) return;

          if (chunk.response) {
            yield chunk.response;
          }
        }
      }

      // Process any remaining buffered content
      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer.trim()) as { response: string; done: boolean };
          if (!chunk.done && chunk.response) {
            yield chunk.response;
          }
        } catch {
          // Ignore malformed trailing buffer
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// ---------------------------------------------------------------------------
// OpenClawStreamBackend
// ---------------------------------------------------------------------------

/**
 * Streams tokens from OpenClaw's OpenAI-compatible /v1/chat/completions endpoint.
 * Parses SSE lines: data: {"choices":[{"delta":{"content":"token"}}]}
 */
export class OpenClawStreamBackend implements StreamBackend {
  readonly name = 'openclaw';

  async *stream(prompt: string, signal: AbortSignal, systemPrompt?: string): AsyncIterable<string> {
    if (signal.aborted) return;

    const resp = await fetch(`${config.openclawUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openclawToken}`,
      },
      body: JSON.stringify({
        model: config.openclawModel,
        messages: [
          { role: 'system', content: systemPrompt || PORTER_SYSTEM_DEFAULT },
          { role: 'user', content: prompt },
        ],
        stream: true,
      }),
      signal,
    });

    if (!resp.ok) {
      throw new Error(`OpenClaw /v1/chat/completions returned ${resp.status}`);
    }

    if (!resp.body) {
      throw new Error('OpenClaw response has no body');
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (signal.aborted) return;

        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await reader.read();
        } catch {
          return;
        }

        if (result.done) break;

        buffer += decoder.decode(result.value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const payload = trimmed.slice(6);
          if (payload === '[DONE]') return;

          try {
            const chunk = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
            };
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
            if (chunk.choices?.[0]?.finish_reason) return;
          } catch {
            // Malformed SSE line — skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// ---------------------------------------------------------------------------
// Backend selector
// ---------------------------------------------------------------------------

/**
 * Select a streaming backend based on message complexity or an explicit hint.
 *
 * @param message     - The user's message (used by routing engine for auto routing).
 * @param backendHint - Optional override: 'ollama' | 'openclaw' | 'auto' | undefined.
 *                      'auto' and undefined both delegate to the DB-driven routing engine.
 */
export async function selectStreamBackend(
  message: string,
  backendHint?: 'ollama' | 'openclaw' | 'auto',
): Promise<StreamBackend> {
  if (backendHint === 'ollama') return new OllamaStreamBackend();
  if (backendHint === 'openclaw') return new OpenClawStreamBackend();
  // 'auto' or undefined: delegate to routing engine for fallback-aware selection
  try {
    const candidates = await routingEngine.selectAllCandidates();
    // Find first candidate that maps to a known stream backend (in priority order)
    const streamable = candidates.find(c =>
      c.row.type === 'ollama' || c.row.type === 'openclaw'
    );
    if (streamable?.row.type === 'ollama') return new OllamaStreamBackend();
    if (streamable?.row.type === 'openclaw') return new OpenClawStreamBackend();
    return new OllamaStreamBackend(); // no streamable gateway found
  } catch {
    // Fallback to Ollama if routing engine fails (e.g., no gateways in DB)
    return new OllamaStreamBackend();
  }
}
