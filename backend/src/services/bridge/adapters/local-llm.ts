/**
 * Bridge Service — Local LLM Adapter (Ollama)
 *
 * Moe 2026-09-19: "can we actually build our own local llm based on opensource stuff to handle a
 * lot of the mundane and low intelligence stuff needed to run our infra?" and then "R5 let's go".
 * An open model (default qwen3:4b-instruct, Apache-2.0) served by the Ollama already running on this box,
 * reached over its local HTTP API. No tokens, no provider, nothing leaves the machine.
 *
 * ⚠️ OPT-IN ONLY. `failover.ts` never puts this gateway in a chain it was not asked to lead: a 4B
 * model on a CPU is good at tagging, routing, yes/no gates and short extractions, and is not good
 * enough to answer Tom's chats because the premium gateways happened to be down. A caller reaches
 * it by naming it (`targetGateway: 'local_llm'`), or not at all.
 *
 * ⚠️ THE INSTRUCT MODEL, NOT `qwen3:4b`. That tag now resolves to the 2507 THINKING variant, which
 * reasons in plain text before every answer and ignores `think: false`, `/no_think` and an empty
 * pre-filled think block alike (all three tried 2026-09-19). A routine one-word job needs the answer,
 * so the default is `qwen3:4b-instruct`: same family and size, no reasoning step.
 *
 * ⚠️ IT IS A GUEST ON A SHARED 4 vCPU BOX: `num_thread` defaults to 2 (PORTER_LOCAL_THREADS), the
 * same ceiling the ymc embedder settled on after a batch pinned the machine at load 13.
 *
 * Measured 2026-09-19 at load ~8: about 9 prompt tokens a second, so a short prompt answers in
 * seconds and a full page in one to two minutes. Background work only; never on an interactive turn.
 */

import type {
  GatewayAdapter,
  GatewayRow,
  BridgeDispatchRequest,
  BridgeDispatchResult,
  DetectResult,
  HealthResult,
} from '../types.js';

const TIMEOUT_MS = 300_000; // 5 min — same budget as the CLI adapters
export const LOCAL_LLM_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
export const LOCAL_LLM_MODEL = process.env.PORTER_LOCAL_MODEL || 'qwen3:4b-instruct';
const THREADS = Number(process.env.PORTER_LOCAL_THREADS || 2);

type OllamaChatResponse = {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
};

export class LocalLLMAdapter implements GatewayAdapter {
  readonly name = 'Local LLM (Ollama)';
  readonly gatewayType = 'local_llm' as const;

  constructor(private readonly row: GatewayRow) {}

  private get baseUrl(): string {
    return ((this.row.metadata as Record<string, string>).url ?? this.row.url ?? LOCAL_LLM_URL).replace(/\/$/, '');
  }
  private get defaultModel(): string {
    return (this.row.metadata as Record<string, string>).default_model ?? LOCAL_LLM_MODEL;
  }

  /** The models Ollama has pulled, or null when the daemon does not answer. */
  private async tags(timeoutMs = 5_000): Promise<string[] | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) return null;
      const body = (await res.json()) as { models?: Array<{ name: string }> };
      return (body.models ?? []).map((m) => m.name);
    } catch {
      return null;
    }
  }

  async detect(): Promise<DetectResult> {
    const models = await this.tags();
    return models?.includes(this.defaultModel) ? { found: true, version: this.defaultModel } : { found: false };
  }

  /** Healthy means the daemon answers AND the model is pulled; a daemon without the model is not a gateway. */
  async health(): Promise<HealthResult> {
    const start = Date.now();
    const models = await this.tags(10_000);
    const latencyMs = Date.now() - start;
    if (!models) return { healthy: false, error: `Ollama not answering at ${this.baseUrl}`, latencyMs };
    if (!models.includes(this.defaultModel)) return { healthy: false, error: `model ${this.defaultModel} is not pulled`, latencyMs };
    return { healthy: true, latencyMs, version: this.defaultModel };
  }

  async dispatch(req: BridgeDispatchRequest): Promise<BridgeDispatchResult> {
    const start = Date.now();
    const model = req.model && !req.model.includes('/') ? req.model : this.defaultModel;
    const messages = [
      ...(req.systemPrompt ? [{ role: 'system', content: req.systemPrompt }] : []),
      ...req.messages.filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system'),
    ];
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          num_thread: THREADS,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.maxTokens ? { num_predict: req.maxTokens } : {}),
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as OllamaChatResponse;
    if (!res.ok || body.error) throw new Error(`Local LLM (${model}) ${res.status}: ${body.error ?? 'no body'}`);
    const text = (body.message?.content ?? '').trim();
    // An empty answer is a failed dispatch, never a successful empty one (the grok_cli lesson).
    if (!text) throw new Error(`Local LLM (${model}) returned an empty response`);
    return {
      response: text,
      model,
      inputTokens: body.prompt_eval_count,
      outputTokens: body.eval_count,
      tokensUsed: (body.prompt_eval_count ?? 0) + (body.eval_count ?? 0),
      latencyMs: Date.now() - start,
      cached: false,
    };
  }

  /** Not streamed: background work only, so the whole answer arrives as one chunk. */
  async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
    if (signal.aborted) return;
    const abortPromise = new Promise<never>((_resolve, reject) => {
      const onAbort = () => reject(new Error('aborted'));
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    });
    let result: BridgeDispatchResult;
    try {
      result = await Promise.race([this.dispatch(req), abortPromise]);
    } catch {
      return;
    }
    if (!signal.aborted && result.response) yield result.response;
  }

  async listModels(): Promise<string[]> {
    return (await this.tags()) ?? [];
  }
}
