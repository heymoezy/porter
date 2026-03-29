/**
 * Bridge Service — Claude CLI Adapter
 *
 * Dispatches AI requests through the locally-installed Claude CLI tool.
 * Spawns: claude -p --output-format stream-json --verbose --include-partial-messages --no-session-persistence
 * Prompt is written to stdin (not positional arg).
 * Parses JSONL stream_event/content_block_delta for streaming tokens.
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

export class ClaudeCLIAdapter implements GatewayAdapter {
  readonly name = 'Claude CLI';
  readonly gatewayType = 'claude_cli' as const;

  constructor(private readonly row: GatewayRow) {}

  private get binaryPath(): string {
    return (this.row.metadata as Record<string, string>).binary_path ?? 'claude';
  }

  // ── detect ──────────────────────────────────────────────────────────────────

  async detect(): Promise<DetectResult> {
    try {
      const binaryPath = await which('claude');
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
        env: process.env,
      });

      // Drain stderr to prevent deadlock
      child.stderr.resume();

      // Capture stdout to parse version string
      const stdoutChunks: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ healthy: false, error: 'health check timed out' });
      }, 5_000);

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

    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--no-session-persistence',
    ];

    const child = spawn(this.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    // Write prompt to stdin and close it
    child.stdin.write(prompt, 'utf8');
    child.stdin.end();

    // Drain stderr to prevent deadlock
    child.stderr.resume();

    let streamText = '';
    let resultText = '';
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
        if (event.type === 'system' && (event.subtype as string) === 'init') {
          detectedModel = event.model as string | undefined;
        }

        // Collect streaming tokens from content_block_delta events
        if (
          event.type === 'stream_event' &&
          (event.event as Record<string, unknown>)?.type === 'content_block_delta'
        ) {
          const delta = (event.event as Record<string, unknown>).delta as
            | Record<string, unknown>
            | undefined;
          const text = delta?.text as string | undefined;
          if (text) {
            streamText += text;
          }
        }

        // Extract final result (usage + fallback text)
        if (event.type === 'result') {
          resultText = (event.result as string) ?? '';
          const usage = event.usage as Record<string, unknown> | undefined;
          if (usage) {
            inputTokens = usage.input_tokens as number | undefined;
            outputTokens = usage.output_tokens as number | undefined;
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }

    if (timedOut) {
      throw new Error(`Claude CLI timed out after ${TIMEOUT_MS}ms`);
    }

    // Wait for child to fully exit
    await new Promise<void>((resolve) => child.once('close', () => resolve()));

    const response = streamText || resultText;
    const tokensUsed =
      inputTokens !== undefined && outputTokens !== undefined
        ? inputTokens + outputTokens
        : undefined;

    return {
      response,
      model: detectedModel ?? req.model ?? 'claude-sonnet-4-6',
      inputTokens,
      outputTokens,
      tokensUsed,
      latencyMs: Date.now() - start,
      cached: false,
    };
  }

  // ── stream ───────────────────────────────────────────────────────────────────

  async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
    const userContent = req.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const prompt = req.systemPrompt ? `${req.systemPrompt}\n\n${userContent}` : userContent;

    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--no-session-persistence',
    ];

    const child = spawn(this.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    // Write prompt to stdin and close it
    child.stdin.write(prompt, 'utf8');
    child.stdin.end();

    // Drain stderr to prevent deadlock
    child.stderr.resume();

    // Handle AbortSignal
    const onAbort = () => { child.kill('SIGTERM'); };
    signal.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => { child.kill('SIGTERM'); }, TIMEOUT_MS);

    try {
      const rl = createInterface({ input: child.stdout!, terminal: false });
      let lastYieldedLength = 0;

      for await (const line of rl) {
        if (signal.aborted) return;
        if (!line.trim()) continue;

        let event: Record<string, any>;
        try {
          event = JSON.parse(line) as Record<string, any>;
        } catch {
          continue;
        }

        // New schema: type: assistant with full content accumulator
        if (event.type === 'assistant' && event.message?.content) {
          const content = event.message.content as any[];
          // Combine all text blocks
          const fullText = content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('');

          if (fullText.length > lastYieldedLength) {
            const delta = fullText.slice(lastYieldedLength);
            yield delta;
            lastYieldedLength = fullText.length;
          }
        }

        // Legacy schema: type: stream_event with content_block_delta
        if (
          event.type === 'stream_event' &&
          event.event?.type === 'content_block_delta'
        ) {
          const text = event.event.delta?.text as string | undefined;
          if (text) {
            yield text;
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
    // Static — no programmatic endpoint available in claude CLI
    return ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-3-5'];
  }
}
