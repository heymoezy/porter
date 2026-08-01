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
import { mkdirSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { workspaceEnv } from '../workspace.js';
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

const TIMEOUT_MS = 300_000; // 5 min — research tasks need more time than simple queries
/**
 * A workspace dispatch is a code-changing session, not a query.
 *
 * ⚠️ v6.141.0 set a 1,800s budget on the JOB in job-executor.ts and it was dead:
 * this adapter kills the subprocess at TIMEOUT_MS first, so every workspace job
 * actually got 5 minutes. The release notes claimed 30. A ceiling set in the
 * caller cannot raise one enforced in the callee.
 */
const WORKSPACE_TIMEOUT_MS = Number(process.env.PORTER_WORKSPACE_TIMEOUT_MS || 1_800_000);

/**
 * Largest system prompt we will pass as a single argv element.
 *
 * The kernel caps ONE argument at MAX_ARG_STRLEN (32 pages = 128KB on this box:
 * `getconf PAGESIZE` × 32) independently of ARG_MAX. Exceeding it fails
 * `spawn E2BIG` **before claude runs**, so the caller sees a dead gateway rather
 * than a model error.
 *
 * This is not hypothetical and it is not new. grok_cli died exactly this way on
 * 2026-07-28 — "the failover chain reached it and died E2BIG on all four
 * gateways" — and grok-cli.ts got `MAX_ARG_PROMPT_BYTES` + `--prompt-file` as
 * the fix. THIS adapter never got the same treatment, and it is the one YMC Tom
 * runs on: his system prompt is SOUL.md (40KB and grown from 21KB) plus ~116
 * rendered tool descriptions, measured between 100KB and 128KB against a 131KB
 * ceiling. Nothing logged the size, so nobody knew how close it was.
 *
 * Above the threshold the prompt goes in a file via `--system-prompt-file`
 * (verified present in claude 2.x). Below it, the flag form stays — fewer moving
 * parts and no temp file to leak.
 */
const MAX_ARG_PROMPT_BYTES = 96 * 1024;

/** Kernel limit, for reporting. 32 pages; PAGE_SIZE is 4096 on Linux x86-64. */
const MAX_ARG_STRLEN = 32 * 4096;

/**
 * Decide how the system prompt travels, and say so out loud.
 *
 * Returns the argv fragment plus a cleanup for the temp file. Callers MUST call
 * cleanup in a `finally` — a leaked file under /tmp holds prompt text.
 */
function systemPromptArgs(systemPrompt: string | undefined, label: string): {
  args: string[];
  cleanup: () => void;
} {
  if (!systemPrompt) return { args: [], cleanup: () => {} };

  const bytes = Buffer.byteLength(systemPrompt, 'utf8');
  const headroom = MAX_ARG_STRLEN - bytes;

  if (bytes <= MAX_ARG_PROMPT_BYTES) {
    // Warn while there is still time to act. A prompt that has crossed the
    // kernel limit does not degrade — the gateway simply stops answering.
    if (headroom < 24 * 1024) {
      console.warn(
        `[claude-cli] system prompt ${bytes} bytes for ${label} — ${headroom} bytes from the ${MAX_ARG_STRLEN}-byte argv ceiling`,
      );
    }
    return { args: ['--system-prompt', systemPrompt], cleanup: () => {} };
  }

  const file = path.join(tmpdir(), `porter-claude-sys-${randomUUID()}.txt`);
  writeFileSync(file, systemPrompt, { encoding: 'utf8', mode: 0o600 });
  console.warn(`[claude-cli] system prompt ${bytes} bytes for ${label} — over ${MAX_ARG_PROMPT_BYTES}, using --system-prompt-file`);
  return {
    args: ['--system-prompt-file', file],
    cleanup: () => { try { unlinkSync(file); } catch { /* already gone */ } },
  };
}

// Sandbox cwd for claude subprocess. /tmp has no CLAUDE.md ancestors, so claude
// won't pull in /home/lobster/CLAUDE.md or ~/projects/Porter/CLAUDE.md when
// traversing up from cwd. Created once at module load.
const SANDBOX_CWD = '/tmp/porter-bridge-sandbox';
try {
  mkdirSync(SANDBOX_CWD, { recursive: true });
} catch {
  // best-effort; spawn will surface a clearer error if cwd is unusable
}

/**
 * Resolve the working directory for a dispatch.
 *
 * The sandbox is the default and stays the default. A workspace is honoured only
 * when the caller passes one — but "the caller asked for it" is not sufficient
 * licence to run a write-enabled Claude anywhere on disk, so the path is checked
 * rather than trusted:
 *
 *   · it must exist and be a directory;
 *   · it must be a git WORKTREE, not a primary checkout. In a linked worktree
 *     `.git` is a FILE containing `gitdir: …`; in a main clone it is a
 *     directory. That single distinction is what stops a code-changing session
 *     being pointed at `~/projects/ymc.capital` itself — the live tree that
 *     other sessions and the deploy hook are using.
 *
 * A failed check falls back to the sandbox and says so. Refusing loudly beats
 * running a write-capable session somewhere nobody intended.
 */
function resolveCwd(workspace: string | undefined): { cwd: string; isWorkspace: boolean } {
  if (!workspace) return { cwd: SANDBOX_CWD, isWorkspace: false };
  try {
    if (!statSync(workspace).isDirectory()) throw new Error('not a directory');
    const dotGit = statSync(`${workspace}/.git`);
    if (dotGit.isDirectory()) throw new Error('primary checkout, not a worktree — refusing to run in a live tree');
    return { cwd: workspace, isWorkspace: true };
  } catch (e) {
    console.warn(`[claude-cli] workspace "${workspace}" rejected (${e instanceof Error ? e.message : e}) — falling back to the sandbox.`);
    return { cwd: SANDBOX_CWD, isWorkspace: false };
  }
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

    // v6.24.0: systemPrompt goes to claude's --system-prompt FLAG, never
    // prepended into the -p user text. claude_cli 2.1.x is prompt-injection
    // hardened — a fake "System: …" prefix inside the user turn is rejected
    // as an injection attempt ("text formatted to impersonate a system
    // instruction"). The flag is the legitimate channel.
    const userContent = req.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const prompt = userContent;

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
    // Bounded worker sandbox: an explicit string[] allow-list restricts claude
    // to EXACTLY those tools (read-only research set for delegated workers).
    const toolAllowList = Array.isArray(req.tools) && req.tools.length > 0 ? req.tools.join(',') : null;
    const { cwd, isWorkspace } = resolveCwd(req.workspace);
    const sysPrompt = systemPromptArgs(req.systemPrompt, 'dispatch');
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--no-session-persistence',
      // Model override: callers (e.g. YMC Tom) can request a specific tier via
      // req.model — without it the CLI uses its account default (Opus). Agnostic
      // passthrough; Porter never hardcodes a model here.
      ...(req.model ? ['--model', req.model] : []),
      ...sysPrompt.args,
      ...(noTools
        ? ['--tools', '']
        : ['--permission-mode', 'auto',
           // A workspace dispatch is a code-changing job by definition, so it
           // gets the full agentic set. Without one, an explicit allow-list from
           // the caller still wins — that is how a research worker stays
           // read-only.
           '--allowedTools', (isWorkspace ? null : toolAllowList) ?? 'WebSearch,WebFetch,Read,Write,Edit,Bash,Glob,Grep,Agent']),
      // Isolation: skip user-level settings (hooks like porter-session-start
      // that inject Porter Memory/directives). Combined with cwd=SANDBOX_CWD
      // (no CLAUDE.md ancestors), this keeps cross-app consumers (e.g. YMC
      // Tom) from inheriting Porter's operating context. Auto-memory under
      // ~/.claude/projects/* is loaded by these hooks, not the binary, so it
      // is dropped too. OAuth (keychain) still works — only --bare disables that.
      '--setting-sources', 'project',
      // v6.25.0 — MCP-server isolation. --setting-sources only filters the
      // settings.json hierarchy; MCP servers ride a SEPARATE channel and
      // still get loaded from ~/.claude.json (e.g. gmail-themozaic,
      // gmail-ymc, and the claude.ai Gmail/Calendar/Drive connectors). Tom
      // saw those as a foreign toolbelt and narrated "wrong surface, finger
      // slipped" every turn. --strict-mcp-config ignores all MCP configs
      // unless explicitly passed via --mcp-config (Porter doesn't, so Tom
      // gets ZERO MCP tools — exactly the contract).
      '--strict-mcp-config',
    ];

    const child = spawn(this.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
      // ⚠️ A workspace session gets a SANITISED env, never Porter's own.
      // workspace.ts documents this guarantee and I failed to wire it up here on
      // the first pass — so a write-enabled session editing real code would have
      // been handed DATABASE_URL, the service token and every provider key in
      // the parent process. `claude` authenticates through its own file-based
      // OAuth under HOME, so it needs none of them. The sandbox path is
      // unchanged.
      env: { ...(isWorkspace ? workspaceEnv() : process.env), PORTER_BRIDGE_DISPATCH: '1' },
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
    }, isWorkspace ? WORKSPACE_TIMEOUT_MS : TIMEOUT_MS);

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
      sysPrompt.cleanup();
    }

    if (timedOut) {
      throw new Error(`Claude CLI timed out after ${isWorkspace ? WORKSPACE_TIMEOUT_MS : TIMEOUT_MS}ms`);
    }

    // Wait for child to fully exit
    await new Promise<void>((resolve) => child.once('close', () => resolve()));

    const response = streamText || resultText;
    // An empty answer on a clean exit is a FAILED dispatch, not a successful
    // empty one. Reported as success it becomes someone else's confusing error
    // far downstream (JSON.parse('') throws "Unexpected end of JSON input").
    // Throwing lets the failover chain try the next gateway — the whole point
    // of having one.
    if (!response?.trim()) {
      throw new Error('Claude CLI exited cleanly but returned an empty response');
    }
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
    // v6.24.0: systemPrompt → --system-prompt flag (see dispatch() note).
    const userContent = req.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const prompt = userContent;

    // Tom-bug fix 2026-05-18: when the caller asks for no tool surface
    // (req.tools === 'none'), pass `--tools ""` so claude has NO native
    // tools at all. Without this, claude in agent mode tries to call
    // Read/WebSearch/etc on prompts that reference filenames or external
    // info, and bubbles "I don't have ymc-tom__* tools" back at the user.
    // Cross-app consumers (Tom on openclaw, Recall summarize/query)
    // manage tools UPSTREAM of this adapter — claude just emits text.
    const noTools = req.tools === 'none';
    // Bounded worker sandbox: an explicit string[] allow-list restricts claude
    // to EXACTLY those tools (read-only research set for delegated workers).
    const toolAllowList = Array.isArray(req.tools) && req.tools.length > 0 ? req.tools.join(',') : null;
    const { cwd, isWorkspace } = resolveCwd(req.workspace);
    const sysPrompt = systemPromptArgs(req.systemPrompt, 'stream');
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--no-session-persistence',
      // Model override: callers (e.g. YMC Tom) can request a specific tier via
      // req.model — without it the CLI uses its account default (Opus). Agnostic
      // passthrough; Porter never hardcodes a model here.
      ...(req.model ? ['--model', req.model] : []),
      ...sysPrompt.args,
      ...(noTools
        ? ['--tools', '']
        : ['--permission-mode', 'auto',
           // A workspace dispatch is a code-changing job by definition, so it
           // gets the full agentic set. Without one, an explicit allow-list from
           // the caller still wins — that is how a research worker stays
           // read-only.
           '--allowedTools', (isWorkspace ? null : toolAllowList) ?? 'WebSearch,WebFetch,Read,Write,Edit,Bash,Glob,Grep,Agent']),
      // Isolation: skip user-level settings (hooks like porter-session-start
      // that inject Porter Memory/directives). Combined with cwd=SANDBOX_CWD
      // (no CLAUDE.md ancestors), this keeps cross-app consumers (e.g. YMC
      // Tom) from inheriting Porter's operating context. Auto-memory under
      // ~/.claude/projects/* is loaded by these hooks, not the binary, so it
      // is dropped too. OAuth (keychain) still works — only --bare disables that.
      '--setting-sources', 'project',
      // v6.25.0 — MCP-server isolation. --setting-sources only filters the
      // settings.json hierarchy; MCP servers ride a SEPARATE channel and
      // still get loaded from ~/.claude.json (e.g. gmail-themozaic,
      // gmail-ymc, and the claude.ai Gmail/Calendar/Drive connectors). Tom
      // saw those as a foreign toolbelt and narrated "wrong surface, finger
      // slipped" every turn. --strict-mcp-config ignores all MCP configs
      // unless explicitly passed via --mcp-config (Porter doesn't, so Tom
      // gets ZERO MCP tools — exactly the contract).
      '--strict-mcp-config',
    ];

    const child = spawn(this.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
      // ⚠️ A workspace session gets a SANITISED env, never Porter's own.
      // workspace.ts documents this guarantee and I failed to wire it up here on
      // the first pass — so a write-enabled session editing real code would have
      // been handed DATABASE_URL, the service token and every provider key in
      // the parent process. `claude` authenticates through its own file-based
      // OAuth under HOME, so it needs none of them. The sandbox path is
      // unchanged.
      env: { ...(isWorkspace ? workspaceEnv() : process.env), PORTER_BRIDGE_DISPATCH: '1' },
    });

    // Write prompt to stdin and close it
    child.stdin.write(prompt, 'utf8');
    child.stdin.end();

    // Drain stderr to prevent deadlock
    child.stderr.resume();

    // Handle AbortSignal
    const onAbort = () => { child.kill('SIGTERM'); };
    signal.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => { child.kill('SIGTERM'); }, isWorkspace ? WORKSPACE_TIMEOUT_MS : TIMEOUT_MS);

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
            // Advance the shared cursor so the final `type: assistant` event
            // (which carries the FULL accumulated text) reconciles to the tail
            // instead of re-yielding everything → exact-doubled output. Both
            // event families fire under --include-partial-messages.
            lastYieldedLength += text.length;
          }
        }
      }
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      sysPrompt.cleanup();
    }
  }

  // ── listModels ───────────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    // Static — no programmatic endpoint available in claude CLI.
    // Anthropic public model lineup as of 2026-06 (Fable 5 + the 4.x family).
    return [
      'claude-fable-5',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
    ];
  }
}
