/**
 * Bridge Service — Codex CLI Adapter
 *
 * Dispatches AI requests through the locally-installed Codex CLI tool.
 * Spawns: codex exec --json --ephemeral --skip-git-repo-check <prompt>
 * Parses JSONL output for item.completed / output_text events.
 * Timeout: 120s (Codex is slower than other CLI tools).
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

const TIMEOUT_MS = 120_000;

export class CodexCLIAdapter implements GatewayAdapter {
  readonly name = 'Codex CLI';
  readonly gatewayType = 'codex_cli' as const;

  constructor(private readonly row: GatewayRow) {}

  private get binaryPath(): string {
    return (this.row.metadata as Record<string, string>).binary_path ?? 'codex';
  }

  // ── detect ──────────────────────────────────────────────────────────────────

  async detect(): Promise<DetectResult> {
    try {
      const binaryPath = await which('codex');
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

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ healthy: false, error: 'health check timed out' });
      }, 5_000);

      child.on('close', (code) => {
        clearTimeout(timer);
        const latencyMs = Date.now() - start;
        if (code === 0) {
          resolve({ healthy: true, latencyMs });
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
    const prompt = req.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';

    const args = ['exec', '--json', '--ephemeral', '--skip-git-repo-check', prompt];
    const child = spawn(this.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    // Close stdin immediately — prompt is positional arg, not stdin
    child.stdin.end();

    // Drain stderr to prevent deadlock
    child.stderr.resume();

    let responseText = '';
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

        if (event.type === 'error') {
          throw new Error('Codex error: ' + (event.message as string));
        }

        if (event.type === 'turn.failed') {
          const errMsg = (event.error as Record<string, unknown>)?.message as string;
          throw new Error('Codex error: ' + errMsg);
        }

        if (
          event.type === 'item.completed' &&
          (event.item as Record<string, unknown>)?.type === 'message'
        ) {
          const content = (event.item as Record<string, unknown>).content as Array<
            Record<string, unknown>
          >;
          if (Array.isArray(content)) {
            for (const c of content) {
              if (c.type === 'output_text') {
                responseText += (c.text as string) ?? '';
              }
            }
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }

    if (timedOut) {
      throw new Error(`Codex CLI timed out after ${TIMEOUT_MS}ms`);
    }

    // Wait for child to fully exit
    await new Promise<void>((resolve) => child.once('close', () => resolve()));

    return {
      response: responseText,
      model: req.model ?? 'gpt-5.4',
      latencyMs: Date.now() - start,
      cached: false,
    };
  }

  // ── stream ───────────────────────────────────────────────────────────────────

  async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
    const prompt = req.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';

    const args = ['exec', '--json', '--ephemeral', '--skip-git-repo-check', prompt];
    const child = spawn(this.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    // Close stdin immediately — prompt is positional arg, not stdin
    child.stdin.end();

    // Drain stderr to prevent deadlock
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

        if (event.type === 'error') {
          throw new Error('Codex error: ' + (event.message as string));
        }

        if (event.type === 'turn.failed') {
          const errMsg = (event.error as Record<string, unknown>)?.message as string;
          throw new Error('Codex error: ' + errMsg);
        }

        if (
          event.type === 'item.completed' &&
          (event.item as Record<string, unknown>)?.type === 'message'
        ) {
          const content = (event.item as Record<string, unknown>).content as Array<
            Record<string, unknown>
          >;
          if (Array.isArray(content)) {
            for (const c of content) {
              if (c.type === 'output_text' && c.text) {
                yield c.text as string;
              }
            }
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
    // Static — from Codex config.toml default
    return ['gpt-5.4'];
  }
}
