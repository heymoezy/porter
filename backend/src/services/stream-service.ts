/**
 * Stream Service
 * Backend-agnostic streaming abstraction for real-time token delivery.
 *
 * Provides a unified StreamBackend interface with two concrete implementations:
 *   - OllamaStreamBackend: parses NDJSON from Ollama /api/generate (stream: true)
 *   - OpenClawStreamBackend: word-chunks a blocking response from porter.py /api/dispatch
 *
 * Backend selection is handled by selectStreamBackend(), which re-uses
 * shouldRouteCheap() from ai-router.ts for routing decisions.
 *
 * All backends accept an AbortSignal and terminate early when aborted.
 */

import { config } from '../config.js';
import { shouldRouteCheap } from './ai-router.js';

// ---------------------------------------------------------------------------
// StreamBackend interface
// ---------------------------------------------------------------------------

export interface StreamBackend {
  name: string;
  stream(prompt: string, signal: AbortSignal): AsyncIterable<string>;
}

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
const PORTER_SYSTEM = `You are Porter. Keep replies under 2 sentences. Be friendly. Never say you are Qwen or any other AI. If unsure, say so. Do not make lists.`;

export class OllamaStreamBackend implements StreamBackend {
  readonly name = 'ollama';

  async *stream(prompt: string, signal: AbortSignal): AsyncIterable<string> {
    const resp = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.ollamaModel, system: PORTER_SYSTEM, prompt, stream: true, options: { num_predict: 150, temperature: 0.7 } }),
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

/** Minimum accumulated chunk size before yielding (chars). */
const OPENCLAW_CHUNK_SIZE = 25;

/** Delay between chunks for typewriter pacing (ms). */
const OPENCLAW_CHUNK_DELAY_MS = 15;

/**
 * Fetches a full blocking response from porter.py's /api/dispatch and
 * word-chunks it to simulate streaming.
 *
 * Word-chunking strategy:
 *   - Split response on whitespace into words.
 *   - Accumulate words until >= OPENCLAW_CHUNK_SIZE chars, then yield.
 *   - Yield the final leftover chunk.
 *   - Between chunks: short delay for typewriter pacing.
 *   - Check signal.aborted before each yield.
 */
export class OpenClawStreamBackend implements StreamBackend {
  readonly name = 'openclaw';

  async *stream(prompt: string, signal: AbortSignal): AsyncIterable<string> {
    if (signal.aborted) return;

    const resp = await fetch(`${config.porterPyUrl}/api/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona_id: 'porter', message: prompt }),
      signal,
    });

    if (!resp.ok) {
      throw new Error(`porter.py /api/dispatch returned ${resp.status}`);
    }

    const fullText = await resp.text();
    if (!fullText) return;

    if (signal.aborted) return;

    // Split into words (preserving space between them)
    const words = fullText.split(/(\s+)/);

    let current = '';

    for (const word of words) {
      if (signal.aborted) return;

      current += word;

      if (current.length >= OPENCLAW_CHUNK_SIZE) {
        await new Promise<void>(resolve => setTimeout(resolve, OPENCLAW_CHUNK_DELAY_MS));
        if (signal.aborted) return;
        yield current;
        current = '';
      }
    }

    // Yield any remaining text
    if (current && !signal.aborted) {
      yield current;
    }
  }
}

// ---------------------------------------------------------------------------
// Backend selector
// ---------------------------------------------------------------------------

/**
 * Select a streaming backend based on message complexity or an explicit hint.
 *
 * @param message     - The user's message (used by shouldRouteCheap for auto routing).
 * @param backendHint - Optional override: 'ollama' | 'openclaw' | 'auto' | undefined.
 *                      'auto' and undefined both delegate to shouldRouteCheap.
 */
export function selectStreamBackend(
  message: string,
  backendHint?: 'ollama' | 'openclaw' | 'auto',
): StreamBackend {
  if (backendHint === 'ollama') return new OllamaStreamBackend();
  if (backendHint === 'openclaw') return new OpenClawStreamBackend();
  // 'auto' or undefined: delegate to shouldRouteCheap from ai-router
  return shouldRouteCheap(message) ? new OllamaStreamBackend() : new OpenClawStreamBackend();
}
