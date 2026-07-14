/**
 * Bridge Service — Codex CLI Adapter
 *
 * Dispatches AI requests through the locally-installed Codex CLI tool.
 * Spawns: codex exec --skip-git-repo-check "<prompt>"
 *
 * Prompt is passed as a positional argument (NOT stdin like Claude CLI).
 * Output structure (verified against codex 0.136, 2026-07-06 — the transcript
 * moved to STDERR; stdout carries ONLY the final message):
 *   stdout:  <response>
 *   stderr:  OpenAI Codex v0.136.0
 *            --------
 *            workdir: ...
 *            model: gpt-5.5
 *            ...
 *            --------
 *            user
 *            <prompt>
 *            codex
 *            <response>
 *            tokens used        ← older builds: "tokens used: <n>" one-liner;
 *            3,007                count may be comma-grouped
 *
 * Parser: response = the block between the `codex` line and the `tokens used`
 * marker when transcript markers are present (old builds put it all on
 * stdout), else stdout verbatim. model/tokens are parsed from stdout+stderr
 * combined so both layouts work.
 *
 * One-shot. No tool surface. Not streaming-native — stream() yields the full
 * response as a single chunk after dispatch completes.
 *
 * Timeout: 5 min. ISOLATION: cwd = SANDBOX_CWD (no CLAUDE.md ancestors).
 */

import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import which from 'which';
import type {
  GatewayAdapter,
  GatewayRow,
  BridgeDispatchRequest,
  BridgeDispatchResult,
  DetectResult,
  HealthResult,
} from '../types.js';

const TIMEOUT_MS = 300_000; // 5 min — same as claude_cli

// Sandbox cwd. /tmp has no CLAUDE.md / AGENTS.md ancestors that codex might
// auto-discover. Mirrors claude-cli adapter.
const SANDBOX_CWD = '/tmp/porter-bridge-sandbox';
try {
  mkdirSync(SANDBOX_CWD, { recursive: true });
} catch {
  // best-effort; spawn will surface a clearer error if cwd is unusable
}

const DEFAULT_MODEL = 'codex/gpt-5.5';

// ── Output parser ────────────────────────────────────────────────────────────

interface ParsedCodexOutput {
  response: string;
  model?: string;
  outputTokens?: number;
}

/**
 * Parse codex exec output. Response comes from stdout: the body between the
 * `codex\n` line and the `tokens used` marker when transcript markers are
 * present (pre-0.136 layout), else stdout verbatim (0.136+ puts the bare
 * response on stdout). model/tokens are matched against stdout+stderr
 * combined — codex 0.136 emits the transcript (incl. `model:` and
 * `tokens used\n3,007`) on stderr, and some builds print the one-liner
 * `tokens used: <n>`. Count may be comma-grouped.
 *
 * Fallback: if no clean `codex\n` / `tokens used` markers, returns the
 * everything-after-last-divider slice as the response so we never silently
 * drop content.
 */
function parseCodexOutput(raw: string, stderrRaw = ''): ParsedCodexOutput {
  const result: ParsedCodexOutput = { response: '' };
  const meta = `${raw}\n${stderrRaw}`;

  // Header model: e.g. "model: gpt-5.5"
  const modelMatch = meta.match(/^model:\s*(\S+)/m);
  if (modelMatch) {
    result.model = `codex/${modelMatch[1]}`;
  }

  // Trailing token count: "tokens used\n3,007" or "tokens used: 3007"
  const tokensMatch = meta.match(/tokens used:?\s*([\d,]+)/);
  if (tokensMatch) {
    result.outputTokens = parseInt(tokensMatch[1].replace(/,/g, ''), 10);
  }

  // Primary parse: find the last standalone `codex` line and slice until
  // either `tokens used` or end-of-output.
  const lines = raw.split('\n');
  let codexIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === 'codex') {
      codexIdx = i;
      break;
    }
  }

  if (codexIdx >= 0) {
    let endIdx = lines.length;
    for (let i = codexIdx + 1; i < lines.length; i++) {
      if (lines[i].trim().startsWith('tokens used')) {
        endIdx = i;
        break;
      }
    }
    result.response = lines.slice(codexIdx + 1, endIdx).join('\n').trim();
    return result;
  }

  // Fallback: take everything after the last divider block, trimmed.
  const lastDividerIdx = raw.lastIndexOf('\n--------\n');
  if (lastDividerIdx >= 0) {
    result.response = raw.slice(lastDividerIdx + '\n--------\n'.length).trim();
  } else {
    result.response = raw.trim();
  }
  return result;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class CodexCLIAdapter implements GatewayAdapter {
  readonly name = 'Codex CLI';
  readonly gatewayType = 'codex_cli' as const;

  constructor(private readonly row: GatewayRow) {}

  private get binaryPath(): string {
    // Prefer the canonical global install. `codex` on PATH — and the binary_path the boot-time
    // discovery recorded — both resolved to a STRAY v0.128.0 in ~/node_modules/.bin (from an
    // accidental package.json in the home directory), while the real codex is v0.144.3 in
    // ~/.npm-global/bin. The stale binary exited 1 on every call and Bridge silently failed over to
    // Claude, so every "ask Codex for a second opinion" quietly returned Claude. A second opinion
    // that is secretly the same model is worse than no second opinion: it manufactures agreement.
    const canonical = join(homedir(), '.npm-global', 'bin', 'codex');
    if (existsSync(canonical)) return canonical;
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
        env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
      });

      // Drain stderr to prevent deadlock
      child.stderr.resume();

      // Capture stdout to parse version string ("codex-cli 0.130.0")
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
        // Match "codex-cli X.Y.Z"
        const m = raw.match(/codex-cli\s+(\S+)/);
        const version = m ? m[1] : (raw || undefined);
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

    // codex takes prompt as a positional argument. Linux ARG_MAX ~2MB,
    // so 60k+ char prompts are safe.
    const args = ['exec', '--skip-git-repo-check', prompt];

    const child = spawn(this.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: SANDBOX_CWD,
      env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
    });

    // codex doesn't read stdin in exec mode — close it immediately
    child.stdin.end();

    const stdoutChunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));

    // Drain stderr to prevent deadlock (reasoning logs land here)
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
      throw new Error(`Codex CLI timed out after ${TIMEOUT_MS}ms`);
    }

    const stdout = Buffer.concat(stdoutChunks).toString('utf8');

    if (exitCode !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      const detail = stderr || stdout.trim().slice(-500) || '(no output)';
      throw new Error(`Codex CLI exited with code ${exitCode}: ${detail}`);
    }

    const parsed = parseCodexOutput(stdout, Buffer.concat(stderrChunks).toString('utf8'));

    return {
      response: parsed.response,
      model: parsed.model ?? req.model ?? DEFAULT_MODEL,
      outputTokens: parsed.outputTokens,
      latencyMs: Date.now() - start,
      cached: false,
    };
  }

  // ── stream ───────────────────────────────────────────────────────────────────

  /**
   * codex exec is not streaming-native. Implemented as a degenerate async
   * iterable that yields the full response in one chunk after dispatch
   * completes. Downstream code expecting streaming gets one big chunk.
   */
  async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
    if (signal.aborted) return;

    // Race dispatch against abort
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
    // Static — codex CLI binary doesn't expose a programmatic model list.
    // Current ChatGPT OAuth account routes to gpt-5.5.
    return ['gpt-5.5'];
  }
}
