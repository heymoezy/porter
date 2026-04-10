/**
 * Bridge Service — Gemini CLI Adapter
 *
 * Dispatches AI requests through the locally-installed Gemini CLI tool.
 * Spawns: gemini -p "<prompt>" --output-format stream-json --yolo
 * Prompt is passed as the value to -p flag (positional arg, NOT stdin).
 * Must drain stderr — keychain warnings from libsecret pollute output.
 * Timeout: 60s.
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import which from 'which';
import type {
  GatewayAdapter,
  GatewayRow,
  BridgeDispatchRequest,
  BridgeDispatchResult,
  DetectResult,
  HealthResult,
} from '../types.js';

const TIMEOUT_MS = 60_000;

export class GeminiCLIAdapter implements GatewayAdapter {
  readonly name = 'Gemini CLI';
  readonly gatewayType = 'gemini_cli' as const;

  /** Token counts from the last stream() call — captured from Gemini's result event */
  lastStreamTokens: { inputTokens?: number; outputTokens?: number } | null = null;

  constructor(private readonly row: GatewayRow) {}

  private get binaryPath(): string {
    return (this.row.metadata as Record<string, string>).binary_path ?? 'gemini';
  }

  // ── detect ──────────────────────────────────────────────────────────────────

  async detect(): Promise<DetectResult> {
    try {
      const binaryPath = await which('gemini');
      return { found: true, binaryPath };
    } catch {
      return { found: false };
    }
  }

  // ── health ──────────────────────────────────────────────────────────────────

  async health(): Promise<HealthResult> {
    const start = Date.now();
    return new Promise<HealthResult>((resolve) => {
      const child = spawn(this.binaryPath, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
      });

      // Drain stderr — libsecret/keychain warnings
      child.stderr.resume();

      // Capture stdout to parse version string
      const stdoutChunks: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ healthy: false, error: 'health check timed out' });
      }, 10_000);

      child.on('close', (code) => {
        clearTimeout(timer);
        const latencyMs = Date.now() - start;
        const raw = Buffer.concat(stdoutChunks).toString('utf8').trim();
        const version = raw || undefined;
        if (code === 0) {
          resolve({ healthy: true, latencyMs, version });
        } else {
          resolve({ healthy: false, error: `exited with code ${code}`, latencyMs });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ healthy: false, error: err.message });
      });
    });
  }

  // ── dispatch ─────────────────────────────────────────────────────────────────

  async dispatch(req: BridgeDispatchRequest): Promise<BridgeDispatchResult> {
    const start = Date.now();

    // Build prompt: systemPrompt prepended if provided
    const userContent = req.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const prompt = req.systemPrompt ? `${req.systemPrompt}\n\n${userContent}` : userContent;

    // Prompt is passed as the value to -p (positional arg, not stdin)
    const args = ['-p', prompt, '--output-format', 'stream-json', '--yolo'];

    const child = spawn(this.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
    });

    // Close stdin immediately — prompt is via -p flag, not stdin
    child.stdin.end();

    // Drain stderr — libsecret/keychain warnings
    child.stderr.resume();

    let finalMessageContent = '';
    const deltaChunks: string[] = [];
    let detectedModel: string | undefined;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, TIMEOUT_MS);

    try {
      const rl = createInterface({ input: child.stdout!, terminal: false });

      for await (const line of rl) {
        if (!line.trim()) continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }

        // Capture model from init event
        if (event.type === 'init') {
          detectedModel = event.model as string | undefined;
        }

        // Handle error events
        if (event.type === 'error') {
          throw new Error('Gemini error: ' + (event.message as string ?? JSON.stringify(event)));
        }

        // Collect message events from assistant
        if (event.type === 'message' && event.role === 'assistant') {
          const content = event.content as string | undefined;
          const delta = event.delta;
          if (content) {
            if (delta === true) {
              // Streaming partial
              deltaChunks.push(content);
            } else {
              // Final complete message — prefer this as response
              finalMessageContent = content;
            }
          }
        }

        // Extract token counts from result event
        if (event.type === 'result') {
          const stats = event.stats as Record<string, unknown> | undefined;
          if (stats) {
            inputTokens = stats.input_tokens as number | undefined;
            outputTokens = stats.output_tokens as number | undefined;
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }

    if (timedOut) {
      throw new Error(`Gemini CLI timed out after ${TIMEOUT_MS}ms`);
    }

    // Wait for child to fully exit
    await new Promise<void>((resolve) => child.once('close', () => resolve()));

    // Use final complete message if available, otherwise concatenate deltas
    const response = finalMessageContent || deltaChunks.join('');
    const tokensUsed =
      inputTokens !== undefined && outputTokens !== undefined
        ? inputTokens + outputTokens
        : undefined;

    return {
      response,
      model: detectedModel ?? req.model ?? 'gemini-2.5-flash',
      inputTokens,
      outputTokens,
      tokensUsed,
      latencyMs: Date.now() - start,
      cached: false,
    };
  }

  // ── stream ───────────────────────────────────────────────────────────────────

  async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
    this.lastStreamTokens = null;

    const userContent = req.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const prompt = req.systemPrompt ? `${req.systemPrompt}\n\n${userContent}` : userContent;

    const args = ['-p', prompt, '--output-format', 'stream-json', '--yolo'];

    const child = spawn(this.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
    });

    // Close stdin immediately — prompt is via -p flag, not stdin
    child.stdin.end();

    // Drain stderr — libsecret/keychain warnings
    child.stderr.resume();

    // Handle AbortSignal
    const onAbort = () => { child.kill('SIGTERM'); };
    signal.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => { child.kill('SIGTERM'); }, TIMEOUT_MS);

    try {
      const rl = createInterface({ input: child.stdout!, terminal: false });

      for await (const line of rl) {
        if (signal.aborted) return;
        if (!line.trim()) continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }

        // Handle error events
        if (event.type === 'error') {
          throw new Error('Gemini error: ' + (event.message as string ?? JSON.stringify(event)));
        }

        // Yield all assistant message content (both delta=true partials and final messages)
        if (event.type === 'message' && event.role === 'assistant' && event.content) {
          yield event.content as string;
        }

        // Capture actual token counts from result event
        if (event.type === 'result') {
          const stats = event.stats as Record<string, unknown> | undefined;
          if (stats) {
            this.lastStreamTokens = {
              inputTokens: stats.input_tokens as number | undefined,
              outputTokens: stats.output_tokens as number | undefined,
            };
          }
        }
      }
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }

  // ── listModels ───────────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    return [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-3-flash-preview',
      'gemini-3-pro-preview',
    ];
  }
}
