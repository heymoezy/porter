/**
 * Bridge Task Executor (Phase 39)
 *
 * Core subprocess orchestrator for CLI-based task dispatch.
 * Spawns claude/gemini/codex CLIs as subprocesses, parses JSONL output,
 * and yields TaskEvent objects via an async generator.
 *
 * Features:
 * - CWD allowlist validation (security gate)
 * - Per-gateway task queue (concurrency=1)
 * - SIGTERM → SIGKILL timeout pattern (abort + hard timeout)
 * - stderr drain to prevent deadlock
 * - 1MB output cap with truncation notice
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import * as fs from 'node:fs';
import PQueue from 'p-queue';
import type { GatewayType, TaskEvent } from './types.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const TASK_CAPABLE_TYPES = new Set<GatewayType>(['claude_cli', 'gemini_cli', 'codex_cli', 'openclaw', 'ollama']);

const DEFAULT_TIMEOUT_MS = 300_000;   // 5 minutes
const MAX_TIMEOUT_MS = 600_000;       // 10 minutes
const MAX_OUTPUT_BYTES = 1_048_576;   // 1 MB

const CWD_ALLOWLIST = [
  '/home/lobster/projects/',
  '/home/websites/',
  '/home/lobster/documents/',
  '/tmp/',
];

// ── Per-gateway task queue (separate from chat queues in dispatch-queues.ts) ──

const _taskQueues = new Map<string, PQueue>();

/**
 * Get or create a concurrency=1 task queue for the given gateway type.
 * Task queues are separate from chat queues — one in-flight task per gateway.
 */
export function getTaskQueue(gatewayType: string): PQueue {
  if (!_taskQueues.has(gatewayType)) {
    _taskQueues.set(gatewayType, new PQueue({ concurrency: 1 }));
  }
  return _taskQueues.get(gatewayType)!;
}

// ── CWD validation ────────────────────────────────────────────────────────────

/**
 * Validate the working directory for a task subprocess.
 * - Must be an absolute path
 * - Must be under one of the CWD_ALLOWLIST prefixes
 * - Directory must exist on disk
 *
 * @throws Error with specific message if validation fails
 */
export function validateCwd(cwd: string): void {
  if (!cwd.startsWith('/')) {
    throw new Error(`Invalid cwd: must be absolute path, got "${cwd}"`);
  }

  const allowed = CWD_ALLOWLIST.some((prefix) => cwd.startsWith(prefix));
  if (!allowed) {
    throw new Error(
      `Invalid cwd: "${cwd}" is not under an allowed path. Allowed: ${CWD_ALLOWLIST.join(', ')}`
    );
  }

  if (!fs.existsSync(cwd)) {
    throw new Error(`Invalid cwd: directory does not exist: "${cwd}"`);
  }
}

// ── CLI argument builder ──────────────────────────────────────────────────────

export interface BuildTaskArgsResult {
  args: string[];
  stdinPrompt: string | null;
  spawnCwd: string;
}

/**
 * Build CLI arguments for the given gateway type and prompt.
 * Each gateway has a distinct invocation pattern:
 * - claude_cli: prompt via stdin, stream-json output, --bare to suppress extraneous output
 * - gemini_cli: prompt as -p positional arg, stream-json output, --yolo for full autonomy
 * - codex_cli: prompt positional, dangerously-bypass-approvals, -C for cwd
 */
export function buildTaskArgs(
  gatewayType: GatewayType,
  prompt: string,
  cwd: string,
  tools?: string[],
): BuildTaskArgsResult {
  switch (gatewayType) {
    case 'claude_cli': {
      const baseArgs = [
        '-p',
        '--dangerously-skip-permissions',
        '--output-format', 'stream-json',
        '--verbose',
        '--no-session-persistence',
      ];
      // GWC-03: Pass tool allowlist if specified
      if (tools?.length) {
        baseArgs.push('--allowedTools', tools.join(','));
      }
      return {
        args: baseArgs,
        stdinPrompt: prompt,
        spawnCwd: cwd,
      };
    }

    case 'gemini_cli':
      // Note: Gemini CLI (--yolo) does not support per-tool filtering
      return {
        args: [
          '-p', prompt,
          '--yolo',
        ],
        stdinPrompt: null,
        spawnCwd: cwd,
      };

    case 'codex_cli':
      // Note: Codex CLI (--dangerously-bypass-approvals-and-sandbox) does not support per-tool filtering
      return {
        args: [
          'exec',
          '--dangerously-bypass-approvals-and-sandbox',
          '--json',
          '-C', cwd,
          prompt,
        ],
        stdinPrompt: null,
        spawnCwd: cwd,
      };

    default:
      throw new Error(
        `Gateway type "${gatewayType}" does not support task dispatch. ` +
        `Supported: ${[...TASK_CAPABLE_TYPES].join(', ')}`
      );
  }
}

// ── Core async generator ──────────────────────────────────────────────────────

/**
 * Execute a task via CLI subprocess and yield TaskEvent objects.
 *
 * Lifecycle:
 * 1. validateCwd — security gate before any subprocess is spawned
 * 2. buildTaskArgs — gateway-specific CLI flags
 * 3. spawn subprocess with PORTER_BRIDGE_DISPATCH=1 env marker
 * 4. AbortSignal → SIGTERM → 5s → SIGKILL
 * 5. Hard timeout → SIGTERM → 5s → SIGKILL
 * 6. readline loop over stdout — parse JSONL, yield progress/tool_use events
 * 7. 1MB output cap — truncate with notice, continue draining
 * 8. Final result event with exitCode + durationMs
 */
export async function* executeTask(
  binaryPath: string,
  gatewayType: GatewayType,
  prompt: string,
  cwd: string,
  signal: AbortSignal,
  timeoutMs?: number,
  tools?: string[],
): AsyncGenerator<TaskEvent> {
  validateCwd(cwd);

  const { args, stdinPrompt, spawnCwd } = buildTaskArgs(gatewayType, prompt, cwd, tools);

  // Clamp timeout
  const clampedTimeout = Math.min(
    Math.max(timeoutMs ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    MAX_TIMEOUT_MS
  );

  const startTime = Date.now();

  const child = spawn(binaryPath, args, {
    cwd: spawnCwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
  });

  // Drain stderr into buffer (prevents deadlock; used for Codex bwrap filtering)
  const stderrChunks: Buffer[] = [];
  child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

  // AbortSignal handler: SIGTERM → 5s → SIGKILL
  let abortKillTimer: NodeJS.Timeout | null = null;
  const onAbort = () => {
    child.kill('SIGTERM');
    abortKillTimer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 5_000);
  };
  signal.addEventListener('abort', onAbort, { once: true });

  // Hard timeout: SIGTERM → 5s → SIGKILL
  let hardKillTimer: NodeJS.Timeout | null = null;
  const hardTimer = setTimeout(() => {
    child.kill('SIGTERM');
    hardKillTimer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 5_000);
  }, clampedTimeout);

  // Feed prompt via stdin (claude_cli only)
  if (stdinPrompt !== null) {
    child.stdin.write(stdinPrompt, 'utf8');
    child.stdin.end();
  } else {
    child.stdin.end();
  }

  let outputBytes = 0;
  let outputTruncated = false;
  let exitCode: number | null = null;

  // Track accumulator for Claude's content_block_delta pattern
  let claudeAccumulator = '';
  let claudeLastYieldedLength = 0;

  try {
    const rl = createInterface({ input: child.stdout!, terminal: false });

    for await (const line of rl) {
      if (signal.aborted) break;
      if (!line.trim()) continue;

      let event: Record<string, unknown> | null = null;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        // Non-JSON line — for Codex/Gemini this IS the output (plain text)
        // Filter out known noise lines
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('warning:')) continue;
        if (trimmed.startsWith('OpenAI Codex')) continue;
        if (trimmed === '--------') continue;
        if (trimmed.startsWith('workdir:') || trimmed.startsWith('model:') || trimmed.startsWith('provider:')) continue;
        if (trimmed.startsWith('approval:') || trimmed.startsWith('sandbox:') || trimmed.startsWith('reasoning')) continue;
        if (trimmed.startsWith('session id:') || trimmed.startsWith('mcp startup:')) continue;
        if (trimmed === 'user' || trimmed === 'codex' || trimmed === 'exec') continue;
        if (trimmed.startsWith('tokens used')) continue;

        // Capture as output text
        if (!outputTruncated) {
          const text = trimmed + '\n';
          outputBytes += Buffer.byteLength(text, 'utf8');
          if (outputBytes > MAX_OUTPUT_BYTES) {
            outputTruncated = true;
            yield { type: 'progress' as const, text: '\n[output truncated at 1MB]' };
          } else {
            yield { type: 'progress' as const, text };
          }
        }
        continue;
      }

      if (!event) continue;

      // ── Claude CLI parsing ──────────────────────────────────────────────────
      if (gatewayType === 'claude_cli') {
        // New schema: type: assistant with content accumulator
        if (event.type === 'assistant' && event.message) {
          const msg = event.message as Record<string, unknown>;
          const content = msg.content as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text') {
                const fullText = (block.text as string) ?? '';
                claudeAccumulator = fullText;
                if (claudeAccumulator.length > claudeLastYieldedLength) {
                  const delta = claudeAccumulator.slice(claudeLastYieldedLength);
                  claudeLastYieldedLength = claudeAccumulator.length;

                  if (!outputTruncated) {
                    outputBytes += Buffer.byteLength(delta, 'utf8');
                    if (outputBytes > MAX_OUTPUT_BYTES) {
                      outputTruncated = true;
                      yield { type: 'progress', text: '\n[output truncated at 1MB]' };
                    } else {
                      yield { type: 'progress', text: delta };
                    }
                  }
                }
              }
              // Tool use block
              if (block.type === 'tool_use') {
                yield {
                  type: 'tool_use',
                  tool: block.name as string | undefined,
                  input: block.input,
                };
              }
            }
          }
        }

        // Legacy schema: stream_event content_block_delta
        if (
          event.type === 'stream_event' &&
          (event.event as Record<string, unknown>)?.type === 'content_block_delta'
        ) {
          const delta = (event.event as Record<string, unknown>).delta as
            | Record<string, unknown>
            | undefined;
          const text = delta?.text as string | undefined;
          if (text && !outputTruncated) {
            outputBytes += Buffer.byteLength(text, 'utf8');
            if (outputBytes > MAX_OUTPUT_BYTES) {
              outputTruncated = true;
              yield { type: 'progress', text: '\n[output truncated at 1MB]' };
            } else {
              yield { type: 'progress', text };
            }
          }
        }
      }

      // ── Gemini CLI parsing ──────────────────────────────────────────────────
      if (gatewayType === 'gemini_cli') {
        if (event.type === 'message' && event.role === 'assistant') {
          const content = event.content as string | undefined;
          if (content && !outputTruncated) {
            outputBytes += Buffer.byteLength(content, 'utf8');
            if (outputBytes > MAX_OUTPUT_BYTES) {
              outputTruncated = true;
              yield { type: 'progress', text: '\n[output truncated at 1MB]' };
            } else {
              yield { type: 'progress', text: content };
            }
          }
        }
      }

      // ── Codex CLI parsing (--json JSONL format) ─────────────────────────────
      if (gatewayType === 'codex_cli' && event.type === 'item.completed') {
        const item = event.item as Record<string, unknown> | undefined;
        if (!item) continue;

        // Agent message: {"item":{"type":"agent_message","text":"..."}}
        if (item.type === 'agent_message' && item.text) {
          const text = (item.text as string) + '\n';
          if (!outputTruncated) {
            outputBytes += Buffer.byteLength(text, 'utf8');
            if (outputBytes > MAX_OUTPUT_BYTES) {
              outputTruncated = true;
              yield { type: 'progress', text: '\n[output truncated at 1MB]' };
            } else {
              yield { type: 'progress', text };
            }
          }
        }

        // Command execution: {"item":{"type":"command_execution","aggregated_output":"...","exit_code":0}}
        if (item.type === 'command_execution' && item.aggregated_output) {
          const text = (item.aggregated_output as string);
          if (!outputTruncated) {
            outputBytes += Buffer.byteLength(text, 'utf8');
            if (outputBytes > MAX_OUTPUT_BYTES) {
              outputTruncated = true;
              yield { type: 'progress', text: '\n[output truncated at 1MB]' };
            } else {
              yield { type: 'progress', text };
            }
          }
        }

        // Legacy: message with content[].output_text
        if (item.type === 'message') {
          const content = item.content as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(content)) {
            for (const c of content) {
              if (c.type === 'output_text' && c.text && !outputTruncated) {
                const text = c.text as string;
                outputBytes += Buffer.byteLength(text, 'utf8');
                if (outputBytes > MAX_OUTPUT_BYTES) {
                  outputTruncated = true;
                  yield { type: 'progress', text: '\n[output truncated at 1MB]' };
                } else {
                  yield { type: 'progress', text };
                }
              }
            }
          }
        }
      }
    }
  } finally {
    clearTimeout(hardTimer);
    if (hardKillTimer) clearTimeout(hardKillTimer);
    signal.removeEventListener('abort', onAbort);
    if (abortKillTimer) clearTimeout(abortKillTimer);
  }

  // Wait for child to fully exit and capture exit code
  exitCode = await new Promise<number | null>((resolve) => {
    child.once('close', (code) => resolve(code));
  });

  const durationMs = Date.now() - startTime;

  yield {
    type: signal.aborted ? 'error' : 'result',
    exitCode: exitCode ?? undefined,
    durationMs,
  };
}
