/**
 * Bridge Adapter — Ollama
 *
 * Implements GatewayAdapter for the Ollama local inference server.
 * Uses Ollama's native /api/chat endpoint (messages[] array, NDJSON streaming).
 *
 * NOTE: This adapter uses /api/chat (not /api/generate).
 *       Streaming tokens come from message.content (not response).
 *       This is intentionally different from OllamaStreamBackend in stream-service.ts.
 */

import which from 'which';
import type {
  GatewayAdapter,
  GatewayRow,
  GatewayType,
  DetectResult,
  HealthResult,
  BridgeDispatchRequest,
  BridgeDispatchResult,
} from '../types.js';

export class OllamaAdapter implements GatewayAdapter {
  readonly name = 'Ollama';
  readonly gatewayType: GatewayType = 'ollama';

  constructor(private readonly row: GatewayRow) {}

  private get baseUrl(): string {
    return this.row.url ?? 'http://127.0.0.1:11434';
  }

  // ── detect() ──────────────────────────────────────────────────────────────

  async detect(): Promise<DetectResult> {
    try {
      const binaryPath = await which('ollama');
      // Also probe the HTTP endpoint to confirm the server is running
      await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return { found: true, binaryPath };
    } catch {
      return { found: false };
    }
  }

  // ── health() ──────────────────────────────────────────────────────────────

  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        return { healthy: true, latencyMs: Date.now() - start };
      }
      return { healthy: false, error: `Ollama /api/tags returned ${resp.status}` };
    } catch (err) {
      return {
        healthy: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── dispatch() ────────────────────────────────────────────────────────────

  async dispatch(req: BridgeDispatchRequest): Promise<BridgeDispatchResult> {
    const start = Date.now();

    const body: Record<string, unknown> = {
      model: req.model ?? 'qwen2.5-coder:1.5b',
      messages: req.messages,
      stream: false,
    };

    if (req.systemPrompt) {
      body.system = req.systemPrompt;
    }

    const options: Record<string, unknown> = {};
    if (req.maxTokens) options.num_predict = req.maxTokens;
    if (req.temperature !== undefined) options.temperature = req.temperature;
    if (Object.keys(options).length > 0) {
      body.options = options;
    }

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) {
      throw new Error(`Ollama /api/chat returned ${resp.status}: ${await resp.text()}`);
    }

    const data = (await resp.json()) as {
      message: { content: string };
      model: string;
      eval_count?: number;
      prompt_eval_count?: number;
    };

    return {
      response: data.message.content,
      model: data.model,
      inputTokens: data.prompt_eval_count,
      outputTokens: data.eval_count,
      tokensUsed: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      latencyMs: Date.now() - start,
      cached: false,
    };
  }

  // ── stream() ──────────────────────────────────────────────────────────────

  async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
    const body: Record<string, unknown> = {
      model: req.model ?? 'qwen2.5-coder:1.5b',
      messages: req.messages,
      stream: true,
    };

    if (req.systemPrompt) {
      body.system = req.systemPrompt;
    }

    if (req.temperature !== undefined) {
      body.options = { temperature: req.temperature };
    }

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!resp.ok) {
      throw new Error(`Ollama /api/chat (stream) returned ${resp.status}`);
    }

    if (!resp.body) {
      throw new Error('Ollama streaming response has no body');
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
          if (!trimmed) continue;

          let chunk: { message: { content: string }; done: boolean };
          try {
            chunk = JSON.parse(trimmed) as { message: { content: string }; done: boolean };
          } catch {
            continue;
          }

          if (chunk.done) return;

          if (chunk.message?.content) {
            yield chunk.message.content;
          }
        }
      }

      // Process any remaining buffered content
      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer.trim()) as { message: { content: string }; done: boolean };
          if (!chunk.done && chunk.message?.content) {
            yield chunk.message.content;
          }
        } catch {
          // Ignore malformed trailing buffer
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ── listModels() ──────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return [];
      const data = (await resp.json()) as { models: Array<{ name: string }> };
      return data.models.map((m) => m.name);
    } catch {
      return [];
    }
  }
}
