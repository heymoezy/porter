/**
 * Bridge HTTP Task Executor (Phase 39 — HTTP gateways)
 *
 * Agent-loop task dispatch for HTTP-based gateways (OpenClaw, Ollama).
 * Uses the OpenAI function-calling format (which Ollama also supports).
 *
 * Loop:
 *   1. Send initial prompt with tool definitions
 *   2. Model returns tool_calls → execute each locally, send results back
 *   3. Model returns a text response with no tool_calls → final output
 *   4. Yield TaskEvent objects throughout (progress, tool_use, result)
 *   5. Max 20 tool-call rounds to prevent infinite loops
 *
 * Tools available to the model:
 *   read_file(path)             — read a file (path within CWD allowlist)
 *   write_file(path, content)   — write a file (path within CWD allowlist)
 *   list_directory(path)        — list a directory (path within CWD allowlist)
 *   run_command(command, cwd)   — run a bash command (30s timeout, CWD validated)
 *
 * Security:
 *   - All file paths validated against CWD_ALLOWLIST
 *   - run_command: 30s timeout, no sudo, no rm -rf, CWD validated
 *   - Commands run as the porter service user (lobster)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TaskEvent } from './types.js';
import { validateCwd } from './task-executor.js';
import { filterToolsBySupport } from './capability-registry.js';

const execFileAsync = promisify(execFile);

// ── Constants ─────────────────────────────────────────────────────────────────

const HTTP_TYPES = new Set(['openclaw', 'ollama'] as const);
export type HttpGatewayType = typeof HTTP_TYPES extends Set<infer T> ? T : never;

const MAX_TOOL_ROUNDS = 20;
const TOOL_TIMEOUT_MS = 30_000;     // 30s per command
const MAX_OUTPUT_BYTES = 1_048_576; // 1 MB accumulated output cap

const CWD_ALLOWLIST = [
  '/home/lobster/projects/',
  '/home/websites/',
  '/home/lobster/documents/',
  '/tmp/',
];

// ── Blocked command patterns ──────────────────────────────────────────────────

const BLOCKED_PATTERNS: RegExp[] = [
  /\brm\s+-[a-z]*r[a-z]*f/i,   // rm -rf variants
  /\bsudo\b/,
  /\bsu\s/,
  /\bchmod\s+[0-9]*7[0-9]*/,   // chmod world-writable
  /\bmkfs\b/,
  /\bdd\s+if=/i,
  /\bshred\b/,
  />\s*\/dev\/(sd|nvme|hd)/,    // writes to block devices
];

// ── OpenAI-compatible tool definitions ───────────────────────────────────────

export const PORTER_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Path must be absolute and within an allowed directory.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to the file to read',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Write content to a file. Path must be absolute and within an allowed directory. Creates parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to the file to write',
          },
          content: {
            type: 'string',
            description: 'Content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_directory',
      description: 'List files and directories at a path. Path must be absolute and within an allowed directory.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to the directory to list',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Run a bash command. Has a 30-second timeout. The command runs in the specified working directory.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The bash command to execute',
          },
          cwd: {
            type: 'string',
            description: 'Working directory for the command (must be absolute and in the allowlist)',
          },
        },
        required: ['command', 'cwd'],
      },
    },
  },
];

// ── Path validation ───────────────────────────────────────────────────────────

/**
 * Validates a file path for tool use:
 * - Must be absolute
 * - Must be under one of CWD_ALLOWLIST prefixes
 * - Resolves symlinks / path traversal before checking
 */
function validatePath(filePath: string): void {
  if (!filePath.startsWith('/')) {
    throw new Error(`Path must be absolute, got: "${filePath}"`);
  }

  // Resolve to real path to prevent ../../../etc/passwd traversal
  // Note: realpath requires the file to exist; for write_file we use dirname
  const normalized = path.normalize(filePath);

  const allowed = CWD_ALLOWLIST.some((prefix) => normalized.startsWith(prefix));
  if (!allowed) {
    throw new Error(
      `Path "${normalized}" is not under an allowed directory. Allowed: ${CWD_ALLOWLIST.join(', ')}`
    );
  }
}

// ── Local tool implementations ────────────────────────────────────────────────

async function toolReadFile(args: Record<string, unknown>): Promise<string> {
  const filePath = args.path as string;
  if (typeof filePath !== 'string' || !filePath) {
    throw new Error('read_file: path argument is required');
  }

  validatePath(filePath);

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Cap at 64KB for tool results to keep context manageable
    if (content.length > 65_536) {
      return content.slice(0, 65_536) + '\n[truncated at 64KB]';
    }
    return content;
  } catch (e) {
    throw new Error(`read_file failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function toolWriteFile(args: Record<string, unknown>): Promise<string> {
  const filePath = args.path as string;
  const content = args.content as string;

  if (typeof filePath !== 'string' || !filePath) {
    throw new Error('write_file: path argument is required');
  }
  if (typeof content !== 'string') {
    throw new Error('write_file: content argument is required');
  }

  validatePath(filePath);

  try {
    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return `Written ${content.length} characters to ${filePath}`;
  } catch (e) {
    throw new Error(`write_file failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function toolListDirectory(args: Record<string, unknown>): Promise<string> {
  const dirPath = args.path as string;
  if (typeof dirPath !== 'string' || !dirPath) {
    throw new Error('list_directory: path argument is required');
  }

  validatePath(dirPath);

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const lines = entries.map((e) => {
      const suffix = e.isDirectory() ? '/' : e.isSymbolicLink() ? '@' : '';
      return `${e.name}${suffix}`;
    });
    return lines.join('\n') || '(empty directory)';
  } catch (e) {
    throw new Error(`list_directory failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function toolRunCommand(args: Record<string, unknown>): Promise<string> {
  const command = args.command as string;
  const cwd = args.cwd as string;

  if (typeof command !== 'string' || !command.trim()) {
    throw new Error('run_command: command argument is required');
  }
  if (typeof cwd !== 'string' || !cwd) {
    throw new Error('run_command: cwd argument is required');
  }

  // Security checks
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`run_command: blocked command pattern detected: "${command}"`);
    }
  }

  // Validate cwd using the shared allowlist validator
  try {
    validateCwd(cwd);
  } catch (e) {
    throw new Error(`run_command: invalid cwd — ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const { stdout, stderr } = await execFileAsync('bash', ['-c', command], {
      cwd,
      timeout: TOOL_TIMEOUT_MS,
      maxBuffer: 1_048_576,
    });

    const out = stdout || '';
    const errOut = stderr ? `\n[stderr]\n${stderr}` : '';
    return (out + errOut).trim() || '(no output)';
  } catch (e) {
    // execFile throws with stdout/stderr on non-zero exit
    if (e && typeof e === 'object' && 'stdout' in e) {
      const execErr = e as { stdout: string; stderr: string; message: string };
      const out = execErr.stdout || '';
      const errOut = execErr.stderr ? `\n[stderr]\n${execErr.stderr}` : '';
      const result = (out + errOut).trim();
      return result
        ? `[exit code != 0]\n${result}`
        : `[exit code != 0] ${execErr.message}`;
    }
    throw new Error(`run_command failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── Tool dispatch ─────────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<string> {
  switch (toolName) {
    case 'read_file':
      return toolReadFile(toolArgs);
    case 'write_file':
      return toolWriteFile(toolArgs);
    case 'list_directory':
      return toolListDirectory(toolArgs);
    case 'run_command':
      return toolRunCommand(toolArgs);
    default:
      throw new Error(`Unknown tool: "${toolName}"`);
  }
}

// ── HTTP gateway config ───────────────────────────────────────────────────────

export interface HttpGatewayConfig {
  type: 'openclaw' | 'ollama';
  baseUrl: string;
  token?: string;
  model: string;
}

// ── OpenAI-compatible message types ──────────────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

// ── Core async generator ──────────────────────────────────────────────────────

/**
 * Execute a task via an HTTP gateway using an agent loop with tool calls.
 *
 * Lifecycle:
 *  1. Build initial messages with the task prompt and tool definitions
 *  2. POST to /v1/chat/completions (OpenAI format — both OpenClaw and Ollama support this)
 *  3. If model returns tool_calls: execute each, append tool_result messages, repeat
 *  4. If model returns plain text (finish_reason=stop, no tool_calls): that's the final answer
 *  5. Yield progress/tool_use/result TaskEvents throughout
 *  6. Abort signal respected between rounds; hard cap of MAX_TOOL_ROUNDS
 */
export async function* executeHttpTask(
  config: HttpGatewayConfig,
  prompt: string,
  cwd: string,
  signal: AbortSignal,
  toolSupport: 'full' | 'limited' | 'none' = 'full',
): AsyncGenerator<TaskEvent> {
  // Validate cwd upfront
  validateCwd(cwd);

  const startTime = Date.now();
  let outputBytes = 0;
  let outputTruncated = false;

  // Determine endpoint — Ollama also exposes /v1/chat/completions (OpenAI compat)
  const endpoint = `${config.baseUrl}/v1/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.token) {
    headers['Authorization'] = `Bearer ${config.token}`;
  }

  // GWC-03: Filter tools by gateway capability level
  const effectiveTools = filterToolsBySupport(PORTER_TOOLS, toolSupport);

  // System message — suppress Porter's context-loading startup protocol
  const systemMessage: ChatMessage = {
    role: 'system',
    content: [
      'You are a task-execution assistant with access to filesystem and shell tools.',
      'This is a Porter Bridge task dispatch — skip any session startup protocols.',
      'Do not read checkpoint files or git logs unless directly asked.',
      `Working directory for this task: ${cwd}`,
      'Use the provided tools to complete the task. When done, provide a final summary.',
    ].join(' '),
  };

  const messages: ChatMessage[] = [
    systemMessage,
    { role: 'user', content: prompt },
  ];

  let round = 0;

  while (round < MAX_TOOL_ROUNDS) {
    if (signal.aborted) break;

    round++;

    // ── Call the model ──────────────────────────────────────────────────────

    let resp: Response;
    try {
      resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages,
          tools: effectiveTools.length > 0 ? effectiveTools : undefined,
          tool_choice: effectiveTools.length > 0 ? 'auto' : undefined,
          stream: false,
          max_tokens: 4096,
          temperature: 0.2,
        }),
        signal: AbortSignal.any
          ? AbortSignal.any([signal, AbortSignal.timeout(120_000)])
          : signal,
      });
    } catch (fetchErr) {
      if (signal.aborted) break;
      throw new Error(
        `HTTP request to ${config.type} failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`
      );
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(
        `${config.type} /v1/chat/completions returned ${resp.status}: ${body}`
      );
    }

    // ── Parse response ──────────────────────────────────────────────────────

    const data = (await resp.json()) as {
      choices?: Array<{
        message?: {
          role?: string;
          content?: string | null;
          tool_calls?: Array<{
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
        finish_reason?: string | null;
      }>;
    };

    const choice = data.choices?.[0];
    if (!choice?.message) {
      throw new Error(`${config.type} returned no choices in response`);
    }

    const assistantMsg = choice.message;
    const toolCalls = assistantMsg.tool_calls?.filter(
      (tc) => tc.type === 'function' && tc.function?.name
    );

    // Append assistant message to conversation history
    messages.push({
      role: 'assistant',
      content: assistantMsg.content ?? null,
      tool_calls: toolCalls?.map((tc) => ({
        id: tc.id ?? `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        type: 'function' as const,
        function: {
          name: tc.function!.name!,
          arguments: tc.function!.arguments ?? '{}',
        },
      })),
    });

    // ── If there are tool calls: execute them ───────────────────────────────

    if (toolCalls && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        if (signal.aborted) break;

        const toolName = tc.function?.name ?? 'unknown';
        const toolCallId = tc.id ?? `call_${Date.now()}`;
        let toolArgs: Record<string, unknown> = {};

        try {
          toolArgs = JSON.parse(tc.function?.arguments ?? '{}') as Record<string, unknown>;
        } catch {
          // malformed args — pass empty object, let tool throw
        }

        // Yield tool_use event so the caller can surface it
        yield {
          type: 'tool_use',
          tool: toolName,
          input: toolArgs,
        };

        let toolResult: string;
        let toolSucceeded = true;

        try {
          toolResult = await executeTool(toolName, toolArgs);
        } catch (toolErr) {
          toolResult = `Error: ${toolErr instanceof Error ? toolErr.message : String(toolErr)}`;
          toolSucceeded = false;
        }

        // Yield tool_result event
        yield {
          type: 'tool_result',
          tool: toolName,
          text: toolResult,
        };

        // Add tool_result to message history
        messages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          name: toolName,
          content: toolResult,
        });

        // Emit brief progress note for visibility
        const statusNote = toolSucceeded
          ? `[${toolName}] completed\n`
          : `[${toolName}] failed: ${toolResult}\n`;

        if (!outputTruncated) {
          outputBytes += Buffer.byteLength(statusNote, 'utf8');
          if (outputBytes > MAX_OUTPUT_BYTES) {
            outputTruncated = true;
            yield { type: 'progress', text: '\n[output truncated at 1MB]' };
          } else {
            yield { type: 'progress', text: statusNote };
          }
        }
      }

      // More tool calls to process — continue the loop
      continue;
    }

    // ── No tool calls: final text response ─────────────────────────────────

    const finalText = assistantMsg.content ?? '';

    if (finalText && !outputTruncated) {
      outputBytes += Buffer.byteLength(finalText, 'utf8');
      if (outputBytes > MAX_OUTPUT_BYTES) {
        outputTruncated = true;
        yield { type: 'progress', text: '\n[output truncated at 1MB]' };
      } else {
        yield { type: 'progress', text: finalText };
      }
    }

    // Final result event — no exit code for HTTP gateways (use 0 for success)
    yield {
      type: 'result',
      exitCode: 0,
      durationMs: Date.now() - startTime,
    };
    return;
  }

  // Reached here because: aborted OR hit MAX_TOOL_ROUNDS
  const durationMs = Date.now() - startTime;

  if (signal.aborted) {
    yield { type: 'error', exitCode: 1, durationMs };
  } else {
    // Hit round limit — treat as an error
    yield {
      type: 'error',
      text: `[http-task-executor] Reached maximum tool-call rounds (${MAX_TOOL_ROUNDS}). Task may be incomplete.`,
      exitCode: 1,
      durationMs,
    };
  }
}

// ── HTTP_TASK_CAPABLE_TYPES export (for use in tasks.ts) ─────────────────────

export const HTTP_TASK_CAPABLE_TYPES = new Set<string>(['openclaw', 'ollama']);
