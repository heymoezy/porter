/**
 * Bridge Service — Grok CLI Adapter
 *
 * Dispatches AI requests through the locally-installed xAI Grok CLI.
 * Spawns: grok -p "<prompt>"   (headless single-turn — "Prints the response
 * to stdout and exits"; verified against grok 0.2.91, 2026-07-08).
 *
 * Unlike codex, grok's headless mode emits ONLY the final response on stdout
 * (no transcript markers to parse), so response = stdout.trim(). Reasoning /
 * progress logs land on stderr and are drained.
 *
 * One-shot. No tool surface (grok runs its own internal tools). Not
 * streaming-native — stream() yields the full response as one chunk.
 *
 * Timeout: 5 min. ISOLATION: cwd = SANDBOX_CWD (no CLAUDE.md / AGENTS.md
 * ancestors that grok might auto-discover).
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import which from 'which';
import type {
  GatewayAdapter,
  GatewayRow,
  BridgeDispatchRequest,
  BridgeDispatchResult,
  DetectResult,
  HealthResult,
} from '../types.js';

const TIMEOUT_MS = 300_000; // 5 min — same as claude_cli / codex_cli

/**
 * Largest prompt we will pass as a positional argv. The kernel caps a SINGLE
 * argument at MAX_ARG_STRLEN (32 pages = 128KB) independently of ARG_MAX, and
 * exceeding it fails with `spawn E2BIG` before the binary runs. 96KB leaves
 * headroom for the rest of argv and the environment block, which count too.
 */
const MAX_ARG_PROMPT_BYTES = 96 * 1024;

// Sandbox cwd. /tmp has no CLAUDE.md / AGENTS.md ancestors grok might
// auto-discover. Mirrors codex-cli / claude-cli adapters.
const SANDBOX_CWD = '/tmp/porter-bridge-sandbox';
try {
  mkdirSync(SANDBOX_CWD, { recursive: true });
} catch {
  // best-effort; spawn will surface a clearer error if cwd is unusable
}

const DEFAULT_MODEL = 'grok/grok-4.5';

export class GrokCLIAdapter implements GatewayAdapter {
  readonly name = 'Grok CLI';
  readonly gatewayType = 'grok_cli' as const;

  constructor(private readonly row: GatewayRow) {}

  private get binaryPath(): string {
    return (this.row.metadata as Record<string, string>).binary_path ?? 'grok';
  }

  // ── detect ──────────────────────────────────────────────────────────────────

  async detect(): Promise<DetectResult> {
    try {
      const binaryPath = await which('grok');
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
      child.stderr.resume();
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
        // Match "grok 0.2.91"
        const m = raw.match(/grok\s+(\S+)/i);
        const version = m ? m[1] : (raw || undefined);
        if (code === 0) resolve({ healthy: true, latencyMs, version });
        else resolve({ healthy: false, error: `exited with code ${code}`, latencyMs });
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

    const userContent = req.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const prompt = req.systemPrompt ? `${req.systemPrompt}\n\n${userContent}` : userContent;

    // grok -p <prompt> : headless single-turn, response on stdout.
    //
    // ⚠️ The prompt CANNOT always be a positional arg. The old comment here read
    // "Linux ARG_MAX ~2MB — big prompts are safe", which is a real limit but the
    // wrong one: a SINGLE argument is capped by MAX_ARG_STRLEN (32 pages =
    // 128KB), whatever ARG_MAX says. Anything larger fails `spawn E2BIG` before
    // grok is even reached — so grok could never serve a dream (2026-07-28: the
    // failover chain reached it and died E2BIG on all four gateways).
    //
    // Over the threshold we use grok's own `--prompt-file`, which exists for
    // exactly this. Small prompts keep the arg form — fewer moving parts, no
    // temp file to leak.
    let promptFile: string | null = null;
    const args: string[] = [];
    if (Buffer.byteLength(prompt, 'utf8') > MAX_ARG_PROMPT_BYTES) {
      promptFile = path.join(tmpdir(), `porter-grok-${randomUUID()}.txt`);
      writeFileSync(promptFile, prompt, { encoding: 'utf8', mode: 0o600 });
      args.push('--prompt-file', promptFile);
    } else {
      args.push('-p', prompt);
    }
    args.push('--output-format', 'plain');

    const cleanupPromptFile = () => {
      if (!promptFile) return;
      try { unlinkSync(promptFile); } catch { /* best-effort */ }
      promptFile = null;
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(this.binaryPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: SANDBOX_CWD,
        env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
      });
    } catch (e) {
      cleanupPromptFile();
      throw e;
    }
    child.stdin?.end();

    const stdoutChunks: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    const stderrChunks: Buffer[] = [];
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, TIMEOUT_MS);

    const exitCode = await new Promise<number | null>((resolve) => {
      child.once('close', (code) => resolve(code));
      child.once('error', () => resolve(null));
    });
    clearTimeout(timer);
    cleanupPromptFile();

    if (timedOut) throw new Error(`Grok CLI timed out after ${TIMEOUT_MS}ms`);

    const stdout = Buffer.concat(stdoutChunks).toString('utf8');
    if (exitCode !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      const detail = stderr || stdout.trim().slice(-500) || '(no output)';
      throw new Error(`Grok CLI exited with code ${exitCode}: ${detail}`);
    }

    // An empty answer on a clean exit is a FAILED dispatch, not a successful
    // empty one. Reported as success it becomes someone else's confusing error
    // far downstream — a dream run died "JSON parse failed: Unexpected end of
    // JSON input" (which is what JSON.parse('') throws) while the failover
    // record said this gateway answered ok. Throwing here lets the chain try
    // the next gateway, which is the whole point of having one.
    const grokText = stdout.trim();
    if (!grokText) {
      const stderrTail = Buffer.concat(stderrChunks).toString('utf8').trim().slice(-300);
      throw new Error(`Grok CLI exited 0 but returned an empty response${stderrTail ? `: ${stderrTail}` : ''}`);
    }

    return {
      response: grokText,
      model: req.model ?? DEFAULT_MODEL,
      latencyMs: Date.now() - start,
      cached: false,
    };
  }

  // ── stream ───────────────────────────────────────────────────────────────────

  /** grok -p is not streaming-native — yield the full response in one chunk. */
  async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
    if (signal.aborted) return;
    const dispatchPromise = this.dispatch(req);
    const abortPromise = new Promise<never>((_resolve, reject) => {
      const onAbort = () => reject(new Error('aborted'));
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    });
    let result: BridgeDispatchResult;
    try {
      result = await Promise.race([dispatchPromise, abortPromise]);
    } catch {
      return;
    }
    if (signal.aborted) return;
    if (result.response) yield result.response;
  }

  // ── listModels ───────────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    // Static — grok's account currently routes to grok-4.5 by default.
    return ['grok-4.5'];
  }
}
