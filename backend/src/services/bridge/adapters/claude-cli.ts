/**
 * Bridge Service — Claude CLI Adapter
 *
 * Dispatches AI requests through the locally-installed Claude CLI tool.
 * Spawns: claude -p --output-format stream-json --verbose --include-partial-messages --no-session-persistence
 * Prompt is written to stdin (not positional arg).
 * Parses JSONL stream_event/content_block_delta for streaming tokens.
 * Timeout: 5 min.
 *
 * ISOLATION: spawned with cwd = SANDBOX_CWD (a dir under /tmp with no
 * CLAUDE.md ancestors) so claude does NOT auto-load Porter's operating
 * context for cross-app consumers (e.g. YMC Tom).
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync } from 'node:fs';
import which from 'which';
import type {
  GatewayAdapter,
  GatewayRow,
  BridgeDispatchRequest,
  BridgeDispatchResult,
  DetectResult,
  HealthResult,
} from '../types.js';

const TIMEOUT_MS = 300_000; // 5 min — research tasks need more time than simple queries

// Sandbox cwd for claude subprocess. /tmp has no CLAUDE.md ancestors, so claude
// won't pull in /home/lobster/CLAUDE.md or ~/projects/Porter/CLAUDE.md when
// traversing up from cwd. Created once at module load.
const SANDBOX_CWD = '/tmp/porter-bridge-sandbox';
try {
  mkdirSync(SANDBOX_CWD, { recursive: true });
} catch {
  // best-effort; spawn will surface a clearer error if cwd is unusable
}

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
        env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
      });

      // Drain stderr to prevent deadlock
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

    // Porter Bridge dispatches run non-interactively — enable tool auto-approval
    // so agents can use web search, file I/O, and bash without a terminal.
    // Tom-bug fix 2026-05-18: when the caller asks for no tool surface
    // (req.tools === 'none'), pass `--tools ""` so claude has NO native
    // tools at all. Without this, claude in agent mode tries to call
    // Read/WebSearch/etc on prompts that reference filenames or external
    // info, and bubbles "I don't have ymc-tom__* tools" back at the user.
    // Cross-app consumers (Tom on openclaw, Recall summarize/query)
    // manage tools UPSTREAM of this adapter — claude just emits text.
    const noTools = req.tools === 'none';
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--no-session-persistence',
      ...(noTools
        ? ['--tools', '']
        : ['--permission-mode', 'auto',
           '--allowedTools', 'WebSearch,WebFetch,Read,Write,Edit,Bash,Glob,Grep,Agent']),
      // Isolation: skip user-level settings (hooks like porter-session-start
      // that inject Porter Memory/directives). Combined with cwd=SANDBOX_CWD
      // (no CLAUDE.md ancestors), this keeps cross-app consumers (e.g. YMC
      // Tom) from inheriting Porter's operating context. Auto-memory under
      // ~/.claude/projects/* is loaded by these hooks, not the binary, so it
      // is dropped too. OAuth (keychain) still works — only --bare disables that.
      '--setting-sources', 'project',
    ];

    const child = spawn(this.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: SANDBOX_CWD,
      env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
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

        // Capture text from assistant messages (appears after tool execution loops)
        if (event.type === 'assistant' && typeof event.message === 'string') {
          streamText += event.message;
        }
        // Also capture from content_block_stop with accumulated text
        if (event.type === 'assistant' && Array.isArray(event.content)) {
          for (const block of event.content as Array<Record<string, unknown>>) {
            if (block.type === 'text' && typeof block.text === 'string') {
              streamText += block.text;
            }
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

    // Tom-bug fix 2026-05-18: when the caller asks for no tool surface
    // (req.tools === 'none'), pass `--tools ""` so claude has NO native
    // tools at all. Without this, claude in agent mode tries to call
    // Read/WebSearch/etc on prompts that reference filenames or external
    // info, and bubbles "I don't have ymc-tom__* tools" back at the user.
    // Cross-app consumers (Tom on openclaw, Recall summarize/query)
    // manage tools UPSTREAM of this adapter — claude just emits text.
    const noTools = req.tools === 'none';
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--no-session-persistence',
      ...(noTools
        ? ['--tools', '']
        : ['--permission-mode', 'auto',
           '--allowedTools', 'WebSearch,WebFetch,Read,Write,Edit,Bash,Glob,Grep,Agent']),
      // Isolation: skip user-level settings (hooks like porter-session-start
      // that inject Porter Memory/directives). Combined with cwd=SANDBOX_CWD
      // (no CLAUDE.md ancestors), this keeps cross-app consumers (e.g. YMC
      // Tom) from inheriting Porter's operating context. Auto-memory under
      // ~/.claude/projects/* is loaded by these hooks, not the binary, so it
      // is dropped too. OAuth (keychain) still works — only --bare disables that.
      '--setting-sources', 'project',
    ];

    const child = spawn(this.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: SANDBOX_CWD,
      env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
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
    // Static — no programmatic endpoint available in claude CLI.
    // Anthropic public model lineup as of 2026-05.
    return [
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
      'claude-opus-4-6',
      'claude-haiku-3-5',
    ];
  }
}
