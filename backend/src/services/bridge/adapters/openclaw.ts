/**
 * Bridge Adapter — OpenClaw
 *
 * Implements GatewayAdapter for the OpenClaw gateway (OpenAI-compatible API).
 * Uses /v1/chat/completions with Bearer token auth and OpenAI SSE streaming.
 *
 * Health check detects whether the chatCompletions endpoint is enabled in
 * ~/.openclaw/openclaw.json — a 404 response signals it is disabled.
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

export class OpenClawAdapter implements GatewayAdapter {
  readonly name = 'OpenClaw';
  readonly gatewayType: GatewayType = 'openclaw';

  constructor(private readonly row: GatewayRow) {}

  private get baseUrl(): string {
    return this.row.url ?? 'http://127.0.0.1:18789';
  }

  private get authToken(): string {
    return (
      (this.row.metadata as Record<string, string>).token ??
      process.env.OPENCLAW_GATEWAY_TOKEN ??
      'lobster-2026'
    );
  }

  // ── detect() ──────────────────────────────────────────────────────────────

  async detect(): Promise<DetectResult> {
    try {
      const binaryPath = await which('openclaw');
      return { found: true, binaryPath };
    } catch {
      return { found: false };
    }
  }

  // ── health() ──────────────────────────────────────────────────────────────

  async health(): Promise<HealthResult> {
    const start = Date.now();

    // Step 1: probe /health to confirm the gateway is running
    let healthResp: Response;
    try {
      healthResp = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      return {
        healthy: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    if (!healthResp.ok) {
      return { healthy: false, error: 'OpenClaw gateway not responding' };
    }

    // Step 2: probe /v1/chat/completions endpoint availability
    // GET will return 404 if endpoint is disabled, 405 (Method Not Allowed) if enabled
    let completionsResp: Response;
    try {
      completionsResp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      return {
        healthy: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    if (completionsResp.status === 404) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error:
          'OpenClaw /v1/chat/completions endpoint not enabled. Set gateway.http.endpoints.chatCompletions.enabled=true in ~/.openclaw/openclaw.json',
      };
    }

    // Any other status (405, 200, 401, etc.) means the endpoint exists
    return { healthy: true, latencyMs: Date.now() - start };
  }

  // ── dispatch() ────────────────────────────────────────────────────────────

  async dispatch(req: BridgeDispatchRequest): Promise<BridgeDispatchResult> {
    const start = Date.now();

    const messages: Array<{ role: string; content: string }> = [];
    if (req.systemPrompt) {
      messages.push({ role: 'system', content: req.systemPrompt });
    }
    messages.push(...req.messages);

    const body = {
      model: req.model ?? 'openai-codex/gpt-5.4',
      messages,
      stream: false,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.7,
    };

    const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) {
      throw new Error(
        `OpenClaw /v1/chat/completions returned ${resp.status}: ${await resp.text()}`
      );
    }

    const data = (await resp.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    return {
      response: data.choices[0]?.message?.content ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      tokensUsed: data.usage?.total_tokens,
      latencyMs: Date.now() - start,
      cached: false,
    };
  }

  // ── stream() ──────────────────────────────────────────────────────────────

  async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
    if (signal.aborted) return;

    const messages: Array<{ role: string; content: string }> = [];
    if (req.systemPrompt) {
      messages.push({ role: 'system', content: req.systemPrompt });
    }
    messages.push(...req.messages);

    const body = {
      model: req.model ?? 'openai-codex/gpt-5.4',
      messages,
      stream: true,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.7,
    };

    const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!resp.ok) {
      throw new Error(
        `OpenClaw /v1/chat/completions (stream) returned ${resp.status}`
      );
    }

    if (!resp.body) {
      throw new Error('OpenClaw streaming response has no body');
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
              choices?: Array<{
                delta?: { content?: string };
                finish_reason?: string | null;
              }>;
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

  // ── listModels() ──────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    // OpenClaw has no /v1/models endpoint — return the known available model
    return ['openai-codex/gpt-5.4'];
  }
}
