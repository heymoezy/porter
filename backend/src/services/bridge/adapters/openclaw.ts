/**
 * Bridge Adapter — OpenClaw
 *
 * Implements GatewayAdapter for the OpenClaw gateway (OpenAI-compatible API).
 * Uses /v1/chat/completions with Bearer token auth and OpenAI SSE streaming.
 *
 * Health check detects whether the chatCompletions endpoint is enabled in
 * ~/.openclaw/openclaw.json — a 404 response signals it is disabled.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

  /**
   * Resolve the bearer token by checking, in order:
   *   1. gateway row metadata.token (DB-configured)
   *   2. OPENCLAW_TOKEN / OPENCLAW_GATEWAY_TOKEN env vars
   *   3. ~/.openclaw/openclaw.json → gateway.auth.token (canonical source of truth)
   *
   * Never falls back to a hardcoded value — a missing token is an explicit error
   * surfaced by health() and dispatch().
   */
  private get authToken(): string {
    const fromMetadata = (this.row.metadata as Record<string, string> | undefined)?.token;
    if (fromMetadata) return fromMetadata;

    const fromEnv = process.env.OPENCLAW_TOKEN ?? process.env.OPENCLAW_GATEWAY_TOKEN;
    if (fromEnv) return fromEnv;

    const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), '.openclaw');
    const configPath = path.join(stateDir, 'openclaw.json');
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const cfg = JSON.parse(raw) as { gateway?: { auth?: { token?: string } } };
      const fromFile = cfg.gateway?.auth?.token;
      if (fromFile) return fromFile;
    } catch {
      // fall through to empty — health() will surface the config gap
    }

    return '';
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

    // Extract version from /health response if available
    let version: string | undefined;
    try {
      const healthData = (await healthResp.json()) as Record<string, unknown>;
      const v = healthData.version ?? healthData.server_version ?? healthData.openclaw_version;
      if (typeof v === 'string' && v) {
        version = v;
      }
    } catch {
      // JSON parse failed — response may not be JSON, ignore
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

    // Step 3: test actual dispatch capability with a minimal request.
    // This catches OAuth expiry, model unavailability, and other runtime errors
    // that the /health endpoint doesn't surface.
    try {
      const testResp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({
          model: 'openclaw',
          messages: [{ role: 'user', content: 'health check — reply OK' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!testResp.ok) {
        const errBody = await testResp.text().catch(() => '');
        const isAuth = testResp.status === 401 || errBody.includes('OAuth') || errBody.includes('token');
        return {
          healthy: false,
          latencyMs: Date.now() - start,
          version,
          error: isAuth
            ? `OpenClaw auth failed (${testResp.status}). Run: openclaw onboard --auth-choice openai-codex`
            : `OpenClaw dispatch test failed: ${testResp.status} ${errBody.slice(0, 100)}`,
        };
      }
    } catch (err) {
      // Dispatch test failed but /health was OK — mark degraded via error message
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        version,
        error: `OpenClaw dispatch test failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    return { healthy: true, latencyMs: Date.now() - start, version };
  }

  // ── dispatch() ────────────────────────────────────────────────────────────

  async dispatch(req: BridgeDispatchRequest): Promise<BridgeDispatchResult> {
    const start = Date.now();

    // OpenClaw proxies to GPT-5.4 via openai-codex. Per Porter policy we never
    // send system-role messages to external models — the dispatch protocol
    // override is prepended as a user-role preamble instead.
    const preamble =
      '[porter-bridge-dispatch] Skip session startup. Do not read checkpoints, git logs, or project state. Answer directly and concisely.';
    const messages: Array<{ role: string; content: string }> = [];
    const systemPreamble = req.systemPrompt ? `${preamble}\n\n${req.systemPrompt}` : preamble;
    messages.push({ role: 'user', content: systemPreamble });
    messages.push(...req.messages);

    const body = {
      model: req.model ?? 'openclaw',
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

    // Capture response headers for rate limit tracking
    const responseHeaders: Record<string, string> = {};
    resp.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

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
      responseHeaders,
    };
  }

  // ── stream() ──────────────────────────────────────────────────────────────

  async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
    if (signal.aborted) return;

    const preamble =
      '[porter-bridge-dispatch] Skip session startup. Do not read checkpoints, git logs, or project state. Answer directly and concisely.';
    const messages: Array<{ role: string; content: string }> = [];
    const systemPreamble = req.systemPrompt ? `${preamble}\n\n${req.systemPrompt}` : preamble;
    messages.push({ role: 'user', content: systemPreamble });
    messages.push(...req.messages);

    const body = {
      model: req.model ?? 'openclaw',
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
    // OpenClaw has no /v1/models endpoint — return the known model
    // API dispatch uses 'openclaw' as the model param, but the real model is GPT-5.4
    return ['openai-codex/gpt-5.4'];
  }
}
