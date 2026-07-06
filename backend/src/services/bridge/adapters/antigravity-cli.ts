/**
 * Bridge Service — Antigravity CLI Adapter
 *
 * Dispatches AI requests through the locally-installed Google Antigravity CLI
 * (binary: `agy`, installed 2026-07-05).
 * Spawns: agy --print "<prompt>" [--model "<name>"]
 *
 * Exec contract (verified against agy 1.0.16):
 *   - `--print` runs a single prompt non-interactively and prints the response
 *     to stdout as PLAIN TEXT — no header/divider/footer framing to parse
 *     (unlike codex exec). Exit 0 on success.
 *   - Prompt is a positional argument (like codex, NOT stdin like claude).
 *   - `--model` selects a model by its display name (see `agy models`).
 *   - `agy --version` prints the bare version ("1.0.16").
 *   - `agy models` prints one model display name per line.
 *
 * One-shot from Bridge's perspective (no tool injection surface), so
 * req.tools is ignored and stream() yields the full response as one chunk —
 * same shape as the codex adapter.
 *
 * Timeout: 5 min (matches agy's own --print-timeout default of 5m).
 * ISOLATION: cwd = SANDBOX_CWD (no CLAUDE.md / AGENTS.md ancestors). Note the
 * CLI still applies the user's global ~/.gemini/antigravity config, exactly as
 * claude_cli applies ~/.claude — that is user config, not Porter context.
 */

import { spawn } from 'node:child_process';
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

const TIMEOUT_MS = 300_000; // 5 min — same as claude_cli / codex_cli

// Sandbox cwd — mirrors the claude/codex adapters.
const SANDBOX_CWD = '/tmp/porter-bridge-sandbox';
try {
  mkdirSync(SANDBOX_CWD, { recursive: true });
} catch {
  // best-effort; spawn will surface a clearer error if cwd is unusable
}

// agy --print doesn't echo which model served the session, so responses are
// labelled with the requested model or this default marker.
const DEFAULT_MODEL = 'antigravity/default';

// ── Adapter ──────────────────────────────────────────────────────────────────

export class AntigravityCLIAdapter implements GatewayAdapter {
  readonly name = 'Antigravity CLI';
  readonly gatewayType = 'antigravity_cli' as const;

  constructor(private readonly row: GatewayRow) {}

  private get binaryPath(): string {
    return (this.row.metadata as Record<string, string>).binary_path ?? 'agy';
  }

  // ── detect ──────────────────────────────────────────────────────────────────

  async detect(): Promise<DetectResult> {
    try {
      const binaryPath = process.env.PORTER_ANTIGRAVITY_PATH ?? await which('agy');
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
        // agy --version prints the bare version, e.g. "1.0.16"
        const version = Buffer.concat(stdoutChunks).toString('utf8').trim() || undefined;
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

    // Build prompt: systemPrompt prepended if provided (same as codex —
    // agy --print has no separate system-prompt flag).
    const userContent = req.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const prompt = req.systemPrompt ? `${req.systemPrompt}\n\n${userContent}` : userContent;

    const args = ['--print', prompt];
    // Optional model pin — agy takes the display name from `agy models`.
    // Accepts either the bare name or our "antigravity/<name>" label.
    if (req.model && req.model !== DEFAULT_MODEL) {
      args.push('--model', req.model.replace(/^antigravity\//, ''));
    }

    const child = spawn(this.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: SANDBOX_CWD,
      env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
    });

    // agy doesn't read stdin in print mode — close it immediately
    child.stdin.end();

    const stdoutChunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));

    const stderrChunks: Buffer[] = [];
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

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

    if (timedOut) {
      throw new Error(`Antigravity CLI timed out after ${TIMEOUT_MS}ms`);
    }

    const stdout = Buffer.concat(stdoutChunks).toString('utf8');

    if (exitCode !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      const detail = stderr || stdout.trim().slice(-500) || '(no output)';
      throw new Error(`Antigravity CLI exited with code ${exitCode}: ${detail}`);
    }

    // Plain-text contract: stdout IS the response.
    return {
      response: stdout.trim(),
      model: req.model ?? DEFAULT_MODEL,
      latencyMs: Date.now() - start,
      cached: false,
    };
  }

  // ── stream ───────────────────────────────────────────────────────────────────

  /**
   * agy --print is not streaming-native. Degenerate async iterable yielding
   * the full response in one chunk after dispatch completes (same as codex).
   */
  async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
    if (signal.aborted) return;

    const dispatchPromise = this.dispatch(req);
    const abortPromise = new Promise<never>((_resolve, reject) => {
      const onAbort = () => reject(new Error('aborted'));
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    });

    let result: BridgeDispatchResult;
    try {
      result = await Promise.race([dispatchPromise, abortPromise]);
    } catch {
      return;
    }

    if (signal.aborted) return;
    if (result.response) {
      yield result.response;
    }
  }

  // ── listModels ───────────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    // `agy models` prints one display name per line (verified 1.0.16).
    return new Promise<string[]>((resolve) => {
      const child = spawn(this.binaryPath, ['models'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: SANDBOX_CWD,
        env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
      });
      child.stderr.resume();
      const chunks: Buffer[] = [];
      child.stdout.on('data', (c: Buffer) => chunks.push(c));
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve([]);
      }, 30_000);
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return resolve([]);
        resolve(
          Buffer.concat(chunks).toString('utf8')
            .split('\n').map((l) => l.trim()).filter(Boolean),
        );
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve([]);
      });
    });
  }
}
