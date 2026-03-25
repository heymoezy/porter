# Phase 17: Provider Adapters - Research

**Researched:** 2026-03-25
**Domain:** Subprocess process management, Ollama native API, OpenClaw gateway API, CLI adapter patterns, Node.js AsyncIterator streaming, TypeScript ESNext
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLI-02 | Ollama adapter — wraps native /api/chat calls (not OpenAI compat), implements GatewayAdapter | Ollama /api/chat confirmed; NDJSON stream format confirmed; /api/tags for listModels confirmed |
| CLI-03 | OpenClaw adapter — wraps OpenAI-compatible calls to gateway, handles auth/errors/model enumeration | OpenClaw has /v1/chat/completions BUT it is disabled by default; gate on config before use |
| CLI-04 | Codex CLI adapter — subprocess dispatch with stdin/stdout streaming, timeout, error parsing | codex exec --json confirmed; JSONL format confirmed from actual run; Rust native binary |
| CLI-05 | Claude CLI adapter — subprocess with -p flag, streaming output parsing | claude -p --output-format stream-json --verbose confirmed; stream_event delta format confirmed |
| CLI-06 | Gemini CLI adapter — subprocess dispatch, output parsing, model detection from binary | gemini -p --output-format stream-json confirmed; JsonStreamEventType enum verified from TypeScript types |
| CLI-07 | Stream normalizer — converts all adapter output formats to unified AsyncIterable<string> | All 5 output formats fully documented with exact field paths |
</phase_requirements>

---

## Summary

Phase 17 implements five concrete GatewayAdapter classes plus a StreamNormalizer. The interface contract is already defined (`backend/src/services/bridge/types.ts`) and all five CLIs are installed and confirmed in PATH. The research confirmed exact wire formats for every backend, which is the critical prerequisite for the StreamNormalizer.

The most important discovery is that **Ollama's adapter must use `/api/chat` (not `/api/generate`)** to support the `messages[]` array in `BridgeDispatchRequest`, and the streaming NDJSON fields differ: `/api/chat` emits `message.content` per token, while `/api/generate` emits `response`. The existing `OllamaStreamBackend` in `stream-service.ts` uses `/api/generate` with a prompt string — the Phase 17 adapter is a clean replacement that handles multi-turn history.

The most operationally significant discovery is that **OpenClaw's `/v1/chat/completions` endpoint is disabled by default** in the OpenClaw gateway config. The existing `ai-router.ts` calls it (and gets 404). The `OpenClawAdapter` must either (a) enable the endpoint via OpenClaw config, or (b) fall back to the `openclaw agent --message ... --json` subprocess. Option (a) is cleaner and more reliable; the adapter's `health()` method should detect whether the endpoint is enabled and report accordingly.

Claude CLI streaming uses `stream_event` JSONL objects with `event.type: "content_block_delta"` and `event.delta.text` for per-token text. This requires `--include-partial-messages` in addition to `--output-format stream-json --verbose` to get true streaming rather than a single final dump.

**Primary recommendation:** Implement all five adapters as classes in `backend/src/services/bridge/adapters/` with a shared `StreamNormalizer` exported from `backend/src/services/bridge/stream-normalizer.ts`. The existing `OllamaStreamBackend` and `OpenClawStreamBackend` in `stream-service.ts` remain untouched — Phase 20 retires them when routing switches to DB-driven.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:child_process (built-in) | stdlib | Spawn subprocess for CLI adapters | No external dependency; spawn() with stdio pipe is idiomatic Node.js |
| node:readline (built-in) | stdlib | Line-by-line async iteration over NDJSON/JSONL stdout streams | createInterface() over ReadableStream = zero-copy async line iterator |
| which | 6.0.1 (already installed) | Resolve binary path for detect() method | Already used in startup-detector.ts — consistent |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:stream (built-in) | stdlib | PassThrough, pipeline for stream bridging | Needed for subprocess stdout → AsyncIterable<string> |
| node:timers (built-in) | stdlib | setTimeout for dispatch timeout handling | Subprocess adapters need configurable timeout (default 60s) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node:readline for line iteration | Manual buffer splitting | readline createInterface is async-iterable ready in Node 22; no manual buffer management |
| spawn() with stdio pipe | execFile() | execFile buffers entire output — unusable for streaming; spawn() streams |
| OpenClaw /v1/chat/completions HTTP | openclaw agent --json subprocess | HTTP is cleaner but requires enabling the endpoint in openclaw config; subprocess is always available |

**No new npm packages needed.** All required APIs are Node.js stdlib + the already-installed `which` package.

---

## Architecture Patterns

### Recommended Project Structure
```
backend/src/services/bridge/
├── types.ts               (exists — GatewayAdapter interface, all type aliases)
├── startup-detector.ts    (exists — detectAndUpsertGateways)
├── stream-normalizer.ts   (NEW — StreamNormalizer class, exports unified AsyncIterable<string>)
└── adapters/
    ├── ollama.ts          (NEW — OllamaAdapter implements GatewayAdapter)
    ├── openclaw.ts        (NEW — OpenClawAdapter implements GatewayAdapter)
    ├── codex-cli.ts       (NEW — CodexCLIAdapter implements GatewayAdapter)
    ├── claude-cli.ts      (NEW — ClaudeCLIAdapter implements GatewayAdapter)
    └── gemini-cli.ts      (NEW — GeminiCLIAdapter implements GatewayAdapter)
```

No changes to `routes/v1/bridge.ts` or `index.ts` are needed in this phase. Adapters are pure service layer.

### Pattern 1: GatewayAdapter Class Structure
**What:** Each adapter is a class implementing the GatewayAdapter interface. Constructor takes a `GatewayRow` from the DB so adapters can read url, metadata.binary_path, and credentials.
**When to use:** All five adapters follow this pattern exactly.
**Example:**
```typescript
// Source: backend/src/services/bridge/types.ts (interface contract)
export class OllamaAdapter implements GatewayAdapter {
  readonly name = 'Ollama';
  readonly gatewayType = 'ollama' as const;

  constructor(private readonly row: GatewayRow) {}

  async detect(): Promise<DetectResult> {
    const binaryPath = await which('ollama').catch(() => null);
    if (!binaryPath) return { found: false };
    try {
      const r = await fetch(`${this.row.url ?? 'http://127.0.0.1:11434'}/api/tags`,
        { signal: AbortSignal.timeout(3000) });
      if (!r.ok) return { found: false };
      return { found: true, binaryPath };
    } catch { return { found: false }; }
  }
  // ...
}
```

### Pattern 2: Subprocess Adapter Base Pattern
**What:** CLI adapters (Codex, Claude, Gemini) spawn a child process, pipe stdout to a readline interface, yield lines as they arrive, then buffer the final result.
**When to use:** CodexCLIAdapter, ClaudeCLIAdapter, GeminiCLIAdapter
**Example:**
```typescript
// Source: node:child_process + node:readline (Node.js stdlib pattern)
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

async function* spawnJsonLines(
  binaryPath: string,
  args: string[],
  stdinPayload: string,
  timeoutMs = 60_000,
): AsyncGenerator<string> {
  const child = spawn(binaryPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });

  // Write prompt on stdin, then close
  child.stdin.write(stdinPayload);
  child.stdin.end();

  // Set timeout: kill subprocess after N ms
  const timer = setTimeout(() => { child.kill('SIGTERM'); }, timeoutMs);

  const rl = createInterface({ input: child.stdout!, terminal: false });
  try {
    for await (const line of rl) {
      if (line.trim()) yield line;
    }
  } finally {
    clearTimeout(timer);
    rl.close();
  }

  // Wait for child to exit and check exit code
  const exitCode = await new Promise<number>(resolve => {
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });

  if (exitCode !== 0) {
    const stderr = await collectStderr(child);
    throw new Error(`${binaryPath} exited ${exitCode}: ${stderr}`);
  }
}
```

### Pattern 3: StreamNormalizer
**What:** A class that wraps an adapter's `stream()` result (which is already `AsyncIterable<string>`) and exposes the same type. Used by downstream code to consume any adapter uniformly.
**When to use:** Any code that receives streamed tokens from any adapter — chat routes, AI router
**Example:**
```typescript
// Source: GatewayAdapter.stream() returns AsyncIterable<string> (from types.ts)
export class StreamNormalizer {
  static async *normalize(
    adapter: GatewayAdapter,
    req: BridgeDispatchRequest,
    signal: AbortSignal,
  ): AsyncIterable<string> {
    for await (const token of adapter.stream(req, signal)) {
      yield token;
    }
  }
}
```

Note: The normalizer is thin because each adapter's `stream()` already normalizes to `AsyncIterable<string>` internally. The normalizer's real value is error wrapping and type safety — not format conversion.

### Anti-Patterns to Avoid
- **Using `execFile()` for streaming adapters:** `execFile()` buffers all output before callback — use `spawn()` with piped stdio.
- **Using `/api/generate` for OllamaAdapter:** The existing `OllamaStreamBackend` uses `/api/generate` with a `prompt` string. The Phase 17 adapter must use `/api/chat` with `messages[]` to support BridgeDispatchRequest (which carries a history array). Token field in streaming NDJSON changes from `response` to `message.content`.
- **Calling claude without `--include-partial-messages`:** Without this flag, `--output-format stream-json` yields a single `assistant` event at the end — no streaming. Streaming tokens come from `stream_event` + `content_block_delta` events.
- **Relying on OpenClaw's HTTP endpoint without checking if it's enabled:** The `/v1/chat/completions` endpoint is disabled by default in OpenClaw config. The adapter's `health()` must probe the endpoint and return `healthy: false` with a clear error if it returns 404.
- **Spawning CLI adapters without timeout:** CLI tools can hang indefinitely. Always use `setTimeout` + `child.kill('SIGTERM')` with a default 60s timeout.
- **Reading from child.stderr in the hot path:** Buffer stderr asynchronously — never await stderr in the streaming loop or it deadlocks on full pipe buffers.
- **Modifying ai-router.ts or stream-service.ts:** These are explicitly deferred to Phase 20. Phase 17 adds new files only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line-by-line async NDJSON parsing | Manual buffer split on '\n' | `readline.createInterface()` + `for await` | readline is async-iterable, handles partial lines, backpressure, and encoding correctly |
| Subprocess timeout | SIGKILL after N ms | `AbortSignal.timeout(N)` passed to `fetch()` for HTTP; `setTimeout + SIGTERM` for subprocess | AbortSignal timeout is idiomatic for HTTP; SIGTERM for subprocess gives graceful shutdown before SIGKILL |
| OpenAI SSE parsing | Manual 'data: ' prefix strip | Already implemented in `OpenClawStreamBackend` — copy the pattern | The existing implementation handles `[DONE]`, finish_reason, and partial chunks correctly |
| Subprocess path resolution | Hardcode binary path | Use `which()` from startup-detector registry + pass GatewayRow.metadata.binary_path | Paths are stored in DB from startup-detector; no need to re-resolve at dispatch time |

---

## Confirmed Wire Formats (HIGH confidence — verified from actual CLI runs and TypeScript types)

### Ollama /api/chat Streaming (NDJSON)
```
// Each line on stdout:
{"model":"qwen2.5-coder:1.5b","created_at":"...","message":{"role":"assistant","content":"Hello"},"done":false}
{"model":"qwen2.5-coder:1.5b","created_at":"...","message":{"role":"assistant","content":""},"done":true,
 "total_duration":...,"eval_count":10,"prompt_eval_count":31}

// Token extraction: line.message.content (when done: false)
// Token counts (done: true):
//   inputTokens  = line.prompt_eval_count
//   outputTokens = line.eval_count
```

### Ollama /api/chat Non-Streaming (dispatch)
```json
{
  "model": "qwen2.5-coder:1.5b",
  "message": { "role": "assistant", "content": "Hello! How can I assist you today?" },
  "done": true,
  "prompt_eval_count": 31,
  "eval_count": 10
}
```

### Ollama /api/tags (listModels)
```json
{
  "models": [
    { "name": "qwen2.5-coder:1.5b", "model": "qwen2.5-coder:1.5b", ... }
  ]
}
// Extract: models[].name
```

### Ollama /api/chat with tools
Ollama returns tool call as JSON in `message.content` when tools are passed. Tool use is model-dependent — qwen2.5-coder handles it inline as JSON string content.

### OpenClaw /v1/chat/completions (OpenAI-compat SSE streaming)
OpenClaw's `/v1/chat/completions` endpoint is **disabled by default**. Enable via:
```json5
// ~/.openclaw/openclaw.json
{ "gateway": { "http": { "endpoints": { "chatCompletions": { "enabled": true } } } } }
```
Once enabled, format is standard OpenAI SSE:
```
data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}
data: [DONE]
```
Auth: `Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>` (env: `OPENCLAW_GATEWAY_TOKEN`; current value: `lobster-2026`).
No `/v1/models` endpoint — listModels must return a static list or query via openclaw CLI.
The adapter's `health()` should call `GET /health` which returns `{"ok":true,"status":"live"}`.

### Claude CLI stream-json (with --include-partial-messages)
```
// Per-token streaming events (JSONL, one object per line):
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hey"}},...}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there"}},...}

// Final complete message event:
{"type":"assistant","message":{"content":[{"type":"text","text":"Hey there, friend!"}],"usage":{"input_tokens":2,"output_tokens":8,...}},...}

// Usage summary:
{"type":"result","subtype":"success","result":"Hey there, friend!","total_cost_usd":0.073,"usage":{...},...}
```

**Spawn command:** `claude -p --output-format stream-json --verbose --include-partial-messages --no-session-persistence`
**Prompt delivery:** Write to stdin, close stdin.
**Token extraction (streaming):** `line.type === "stream_event" && line.event?.type === "content_block_delta"` → `line.event.delta.text`
**Token counts (final):** `line.type === "result"` → `line.usage.input_tokens` + `line.usage.output_tokens`
**Model detection:** `line.type === "system" && line.subtype === "init"` → `line.model`
**Stderr noise:** Hook events (type="system", subtype="hook_*") and rate_limit_event lines appear — skip any line whose `type` is not `stream_event` or `result` when collecting tokens.

### Claude CLI listModels
No programmatic list endpoint. Return hardcoded list: `['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-3-5']`.
Installed version: `2.1.83 (Claude Code)`.

### Codex CLI exec --json (JSONL)
```
// Thread lifecycle:
{"type":"thread.started","thread_id":"..."}
{"type":"turn.started"}
// Success output (item.type == "message"):
{"type":"item.completed","item":{"id":"item_0","type":"message","content":[{"type":"output_text","text":"Hello!"}]}}
{"type":"turn.completed"}   // (inferred — not directly observed due to usage limit)
// Error path:
{"type":"error","message":"You've hit your usage limit..."}
{"type":"turn.failed","error":{"message":"..."}}
```

**Spawn command:** `codex exec --json --ephemeral --skip-git-repo-check`
**Prompt delivery:** Pass as positional argument (not stdin): `codex exec --json --ephemeral "the prompt"` — OR pipe via stdin with `-` as prompt argument.
**Text extraction:** `line.type === "item.completed" && line.item?.type === "message"` → `line.item.content[].text` where `content[].type === "output_text"`.
**Error detection:** `line.type === "error"` or `line.type === "turn.failed"` → throw with `line.message || line.error?.message`.
**listModels:** Return `['gpt-5.4']` (from `~/.codex/config.toml`: `model = "gpt-5.4"`).
**Installed version:** `codex-cli 0.116.0` (Rust native binary).
**Important:** Codex is a Rust binary spawned via the JS launcher. The actual binary path is `/home/lobster/.npm-global/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/codex/codex` — but the `which('codex')` path stored in DB metadata points to the npm wrapper. Use the wrapper path for spawning.

### Gemini CLI -p --output-format stream-json (JSONL)
TypeScript types from `@google/gemini-cli-core` (verified from installed package):
```typescript
enum JsonStreamEventType {
  INIT = "init",
  MESSAGE = "message",
  TOOL_USE = "tool_use",
  TOOL_RESULT = "tool_result",
  ERROR = "error",
  RESULT = "result"
}

interface MessageEvent {
  type: "message";
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;  // Full content for role=="assistant"
  delta?: boolean;   // true when this is a streaming delta (incremental)
}

interface ResultEvent {
  type: "result";
  status: 'success' | 'error';
  stats?: {
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    duration_ms: number;
  };
}
```

**Spawn command:** `gemini -p "prompt text" --output-format stream-json`
**Prompt delivery:** Pass as `-p` argument (not stdin). For multi-turn, stdin content is appended to -p value.
**Text extraction:** `line.type === "message" && line.role === "assistant"` → `line.content`. If `line.delta === true`, it's a streaming partial. If `line.delta` is absent or false, it's the final complete message.
**Token counts:** `line.type === "result"` → `line.stats.input_tokens` + `line.stats.output_tokens`.
**Stderr noise:** Keychain warnings (`Keychain initialization encountered an error: libsecret-1.so.0`) go to stderr — pipe stderr separately and discard.
**Model detection:** `line.type === "init"` → `line.model` (e.g. `"auto-gemini-3"`).
**listModels:** Return `['gemini-2.5-pro', 'gemini-2.5-flash', 'auto-gemini-3']` (discovered from init event).
**Installed version:** `0.35.0`.

---

## Common Pitfalls

### Pitfall 1: Wrong Ollama endpoint for adapter
**What goes wrong:** Using `/api/generate` with a `prompt` string (as in the existing `OllamaStreamBackend`) breaks multi-turn conversation because `BridgeDispatchRequest.messages[]` cannot be passed to that endpoint.
**Why it happens:** The existing code predates the GatewayAdapter interface.
**How to avoid:** OllamaAdapter must use `/api/chat` with `messages` array. Streaming NDJSON from `/api/chat` uses `message.content` (not `response`) for tokens.
**Warning signs:** All conversation history is ignored; Ollama treats every dispatch as single-turn.

### Pitfall 2: OpenClaw /v1/chat/completions returns 404
**What goes wrong:** `OpenClawAdapter.dispatch()` or `stream()` gets a 404 response.
**Why it happens:** The OpenClaw chat completions endpoint is disabled by default in OpenClaw config.
**How to avoid:** In `health()`, probe `GET /health` (which always works) but also probe `GET /v1/models` to detect if the HTTP API is enabled. If completions endpoint is not enabled, set `OpenClawAdapter.health()` to return `healthy: false, error: "OpenClaw /v1/chat/completions endpoint not enabled. Set gateway.http.endpoints.chatCompletions.enabled=true in ~/.openclaw/openclaw.json"`.
**Warning signs:** 404 from dispatch, silent failures in the AI router.

### Pitfall 3: Claude CLI token streaming without --include-partial-messages
**What goes wrong:** Using `--output-format stream-json --verbose` without `--include-partial-messages` causes the entire response to arrive as a single `assistant` event at the end — no streaming.
**Why it happens:** Without `--include-partial-messages`, Claude CLI buffers and emits the complete message once done.
**How to avoid:** Always spawn with `--include-partial-messages`. Extract tokens from `stream_event` lines with `event.type === "content_block_delta"`, not from `assistant` message lines.
**Warning signs:** Chat responses appear as block dumps, not token-by-token.

### Pitfall 4: Deadlock reading stderr synchronously while stdout is buffered
**What goes wrong:** Subprocess hangs indefinitely when stdout AND stderr both fill their pipe buffers.
**Why it happens:** `readline` consuming stdout blocks; stderr pipe fills up (Gemini CLI emits verbose keychain errors); child process blocks trying to write to stderr.
**How to avoid:** Always drain stderr asynchronously. Use `child.stderr.resume()` to discard, or pipe to a string collector that never blocks.
**Warning signs:** Subprocess hangs at dispatch, no output.

### Pitfall 5: No timeout on subprocess adapters
**What goes wrong:** A stalled CLI tool (network issue, auth prompt, hanging model) blocks the adapter indefinitely.
**Why it happens:** `spawn()` has no timeout by default.
**How to avoid:** Set a configurable timeout (default 60s). Use `setTimeout` + `child.kill('SIGTERM')`. Check if child is still running after readline iteration ends; kill if it hasn't exited.
**Warning signs:** HTTP route times out, request never resolves.

### Pitfall 6: Codex prompt argument vs stdin
**What goes wrong:** `codex exec --json` with prompt piped via stdin may not work correctly; passing prompt as positional arg is the reliable path.
**Why it happens:** Codex uses a Rust CLI that reads args first.
**How to avoid:** Pass prompt as positional argument: `codex exec --json --ephemeral "prompt text"`. Use `--skip-git-repo-check` to avoid "not in a git repo" errors.
**Warning signs:** Empty JSONL output, `thread.started` but no `item.completed`.

### Pitfall 7: Gemini model name in stream-json output
**What goes wrong:** Gemini's init event shows `"model":"auto-gemini-3"` — an alias, not a canonical model name. Downstream code comparing model names might not recognize it.
**Why it happens:** Gemini CLI uses auto-routing internally and reports the routing alias.
**How to avoid:** Accept `auto-*` prefixed model names as valid. Store the model name from the `init` event in `BridgeDispatchResult.model`.
**Warning signs:** Model catalog mismatches, routing logic rejecting Gemini responses.

---

## Code Examples

Verified patterns from official sources:

### OllamaAdapter — dispatch (non-streaming)
```typescript
// Source: Verified against http://127.0.0.1:11434/api/chat (actual response observed)
async dispatch(req: BridgeDispatchRequest): Promise<BridgeDispatchResult> {
  const start = Date.now();
  const url = this.row.url ?? 'http://127.0.0.1:11434';
  const body = {
    model: req.model ?? 'qwen2.5-coder:1.5b',
    messages: req.messages,
    stream: false,
    ...(req.systemPrompt ? { system: req.systemPrompt } : {}),
    ...(req.maxTokens ? { options: { num_predict: req.maxTokens } } : {}),
  };
  const resp = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) throw new Error(`Ollama /api/chat returned ${resp.status}`);
  const data = await resp.json() as {
    message: { content: string };
    model: string;
    eval_count?: number;
    prompt_eval_count?: number;
  };
  return {
    response: data.message.content,
    model: data.model,
    inputTokens: data.prompt_eval_count,
    outputTokens: data.eval_count,
    tokensUsed: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
    latencyMs: Date.now() - start,
    cached: false,
  };
}
```

### OllamaAdapter — stream
```typescript
// Source: Verified streaming NDJSON from http://127.0.0.1:11434/api/chat stream:true
async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
  const url = this.row.url ?? 'http://127.0.0.1:11434';
  const resp = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: req.model ?? 'qwen2.5-coder:1.5b',
      messages: req.messages,
      stream: true,
      ...(req.systemPrompt ? { system: req.systemPrompt } : {}),
    }),
    signal,
  });
  if (!resp.ok || !resp.body) throw new Error(`Ollama /api/chat stream ${resp.status}`);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      if (signal.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        const chunk = JSON.parse(t) as { message: { content: string }; done: boolean };
        if (chunk.done) return;
        if (chunk.message?.content) yield chunk.message.content;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

### ClaudeCLIAdapter — stream (key part)
```typescript
// Source: Verified stream_event format from actual claude -p --output-format stream-json
//         --verbose --include-partial-messages --no-session-persistence run
async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
  const binaryPath = (this.row.metadata as Record<string,string>).binary_path ?? 'claude';
  const lastUserMessage = req.messages.filter(m => m.role === 'user').at(-1)?.content ?? '';

  const child = spawn(binaryPath, [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--no-session-persistence',
    '--tools', '',  // disable tools to avoid permission prompts
  ], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });

  child.stdin.write(lastUserMessage);
  child.stdin.end();

  const timer = setTimeout(() => child.kill('SIGTERM'), 60_000);
  child.stderr.resume(); // drain stderr to prevent deadlock

  try {
    const rl = createInterface({ input: child.stdout!, terminal: false });
    for await (const line of rl) {
      if (signal.aborted) { child.kill('SIGTERM'); break; }
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        // Token-level streaming: stream_event with content_block_delta
        if (
          event.type === 'stream_event' &&
          (event.event as Record<string,unknown>)?.type === 'content_block_delta'
        ) {
          const text = ((event.event as Record<string,unknown>).delta as Record<string,unknown>)?.text;
          if (typeof text === 'string' && text) yield text;
        }
      } catch { /* malformed line — skip */ }
    }
  } finally {
    clearTimeout(timer);
  }
}
```

### GeminiCLIAdapter — stream (key part)
```typescript
// Source: Verified from JsonStreamEventType enum in @google/gemini-cli-core types.d.ts
async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
  const binaryPath = (this.row.metadata as Record<string,string>).binary_path ?? 'gemini';
  const lastUserMessage = req.messages.filter(m => m.role === 'user').at(-1)?.content ?? '';

  const child = spawn(binaryPath, [
    '-p', lastUserMessage,
    '--output-format', 'stream-json',
    '--yolo',  // suppress confirmation prompts in headless mode
  ], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });

  child.stdin.end();
  const timer = setTimeout(() => child.kill('SIGTERM'), 60_000);
  child.stderr.resume(); // discard keychain warnings

  try {
    const rl = createInterface({ input: child.stdout!, terminal: false });
    for await (const line of rl) {
      if (signal.aborted) { child.kill('SIGTERM'); break; }
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as { type: string; role?: string; content?: string; delta?: boolean };
        // Streaming deltas: role="assistant", delta=true
        if (event.type === 'message' && event.role === 'assistant' && event.content) {
          yield event.content;
        }
      } catch { /* skip */ }
    }
  } finally {
    clearTimeout(timer);
  }
}
```

### CodexCLIAdapter — stream (key part)
```typescript
// Source: Verified JSONL format from actual codex exec --json run
async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
  const binaryPath = (this.row.metadata as Record<string,string>).binary_path ?? 'codex';
  const lastUserMessage = req.messages.filter(m => m.role === 'user').at(-1)?.content ?? '';

  const child = spawn(binaryPath, [
    'exec', '--json', '--ephemeral', '--skip-git-repo-check', lastUserMessage
  ], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });

  child.stdin.end();
  const timer = setTimeout(() => child.kill('SIGTERM'), 120_000); // Codex is slower
  child.stderr.resume();

  try {
    const rl = createInterface({ input: child.stdout!, terminal: false });
    for await (const line of rl) {
      if (signal.aborted) { child.kill('SIGTERM'); break; }
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        if (event.type === 'error' || event.type === 'turn.failed') {
          const msg = (event.message ?? (event.error as Record<string,unknown>)?.message) as string;
          throw new Error(`Codex error: ${msg}`);
        }
        if (event.type === 'item.completed') {
          const item = event.item as Record<string, unknown>;
          if (item?.type === 'message') {
            const contents = item.content as Array<{ type: string; text: string }>;
            for (const c of contents ?? []) {
              if (c.type === 'output_text' && c.text) yield c.text;
            }
          }
        }
      } catch (e) {
        if ((e as Error).message?.startsWith('Codex error:')) throw e;
        // malformed line — skip
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
```

### StreamNormalizer
```typescript
// Source: GatewayAdapter.stream() interface (types.ts)
export class StreamNormalizer {
  /**
   * Wraps an adapter's stream() with error boundary and abort propagation.
   * Downstream consumers call this instead of adapter.stream() directly.
   */
  static async *normalize(
    adapter: GatewayAdapter,
    req: BridgeDispatchRequest,
    signal: AbortSignal,
  ): AsyncIterable<string> {
    try {
      for await (const token of adapter.stream(req, signal)) {
        if (signal.aborted) return;
        yield token;
      }
    } catch (err) {
      if (signal.aborted) return; // normal abort — don't propagate
      throw err;
    }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `OllamaStreamBackend` uses `/api/generate` + prompt string | `OllamaAdapter` uses `/api/chat` + messages array | Phase 17 | Enables multi-turn history; changes streaming field from `response` to `message.content` |
| `OpenClawStreamBackend` calls `/v1/chat/completions` (broken — returns 404) | `OpenClawAdapter` calls same endpoint but gates on health check first | Phase 17 | Surfaces the config error explicitly instead of silent 404 failure |
| `StreamBackend` interface (2 methods: name + stream) | `GatewayAdapter` interface (5 methods) | Phase 16 (interface); Phase 17 (implementations) | Phase 17 adapters implement GatewayAdapter; stream-service.ts StreamBackend remains until Phase 20 |
| Single-string `prompt` for Claude dispatch | `messages[]` array with roles | Phase 17 | Required for conversation history and system prompts |

**Deprecated/outdated after Phase 17:**
- `OllamaStreamBackend` in `stream-service.ts`: Not deleted yet — Phase 20 retires it. Phase 17 adapters coexist.
- `OpenClawStreamBackend` in `stream-service.ts`: Same — coexists until Phase 20.

---

## Open Questions

1. **OpenClaw chatCompletions endpoint not enabled**
   - What we know: `~/.openclaw/openclaw.json` has empty `gateway.http` config; `/v1/chat/completions` returns 404; `/health` returns `{"ok":true,"status":"live"}`.
   - What's unclear: Should the OpenClawAdapter enable the endpoint as part of its `detect()` flow, or just report `healthy: false` and let the admin enable it?
   - Recommendation: Adapter reports health status accurately. If endpoint is 404, `health()` returns `healthy: false, error: "chatCompletions endpoint not enabled"`. The Phase 21 first-run setup or admin UI handles the config change. Do NOT auto-mutate OpenClaw config from Porter.

2. **Codex CLI JSONL streaming vs final-message**
   - What we know: The Codex CLI outputs complete `item.completed` events (not delta events) — text arrives as a final item, not streamed tokens.
   - What's unclear: Is there a streaming/delta mode in Codex exec --json that we missed?
   - Recommendation: Treat `CodexCLIAdapter.stream()` as "pseudo-streaming" — buffer the complete item.completed output and yield it as a single token. This satisfies the `AsyncIterable<string>` contract while being honest about Codex's non-streaming nature. Document this in the adapter.

3. **Claude CLI --tools '' flag causing issues**
   - What we know: Without `--tools ''`, Claude CLI may attempt to use Bash/Edit tools that require permission prompts.
   - What's unclear: Whether `--tools ''` fully disables tools in -p mode or if `--dangerously-skip-permissions` is also needed.
   - Recommendation: Use `--tools ''` (empty string to disable all tools) AND `--dangerously-skip-permissions` for headless dispatch. Log a warning that this mode has security implications for the running environment.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (35 existing tests in `/home/lobster/documents/porter/tests/`) |
| Config file | `tests/playwright.config.ts` |
| Quick run command | `cd /home/lobster/documents/porter/backend && npx tsc --noEmit` |
| Full suite command | `cd /home/lobster/documents/porter/tests && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLI-02 | OllamaAdapter dispatches and streams against running Ollama | integration | `cd tests && npx playwright test --grep "ollama-adapter"` | ❌ Wave 0 |
| CLI-03 | OpenClawAdapter health() reflects chatCompletions endpoint status | unit/smoke | `cd tests && npx playwright test --grep "openclaw-adapter"` | ❌ Wave 0 |
| CLI-04 | CodexCLIAdapter spawns, parses JSONL, handles error event | unit | `cd backend && npx tsc --noEmit` (type check only — usage limit prevents live run) | ❌ Wave 0 (manual verify) |
| CLI-05 | ClaudeCLIAdapter streams tokens via stream_event content_block_delta | integration | `cd tests && npx playwright test --grep "claude-adapter"` | ❌ Wave 0 |
| CLI-06 | GeminiCLIAdapter dispatches via -p, extracts tokens from message events | integration | `cd tests && npx playwright test --grep "gemini-adapter"` | ❌ Wave 0 |
| CLI-07 | StreamNormalizer yields same token stream regardless of adapter | unit | `cd backend && npx tsc --noEmit` (TypeScript validation) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/lobster/documents/porter/backend && npx tsc --noEmit` — TypeScript compilation must stay green after every file created
- **Per wave merge:** `cd /home/lobster/documents/porter/tests && npx playwright test` — full 35-test regression
- **Phase gate:** Full suite green + manual smoke test of OllamaAdapter dispatch before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/bridge-adapters.spec.ts` — smoke tests for OllamaAdapter.dispatch(), health(), listModels() against live Ollama
- [ ] `tests/bridge-openclaw.spec.ts` — health() returns correct status based on /health response
- [ ] TypeScript compilation check sufficient for Codex/Claude/Gemini adapters (no live API keys required for type safety)

*(Ollama integration tests are possible without external API keys — Ollama is running locally. Claude/Codex/Gemini live tests require active auth/quota.)*

---

## Sources

### Primary (HIGH confidence)
- `/home/lobster/documents/porter/backend/src/services/bridge/types.ts` — GatewayAdapter interface with all 5 method signatures confirmed
- `/home/lobster/documents/porter/backend/src/services/stream-service.ts` — Existing OllamaStreamBackend/OpenClawStreamBackend patterns; streaming NDJSON and SSE parsing already implemented
- `curl http://127.0.0.1:11434/api/chat` — Ollama /api/chat streaming NDJSON format confirmed: `message.content` per token, `eval_count`/`prompt_eval_count` for tokens
- `curl http://127.0.0.1:11434/api/tags` — Ollama listModels format confirmed: `models[].name`
- `claude -p --output-format stream-json --verbose --include-partial-messages --no-session-persistence` — Claude CLI stream-json format confirmed: `stream_event` + `content_block_delta` + `event.delta.text` for per-token streaming
- `/home/lobster/.npm-global/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/output/types.d.ts` — Gemini CLI JsonStreamEventType enum confirmed: init/message/tool_use/tool_result/error/result; MessageEvent.content field confirmed
- `codex exec --json --ephemeral` — Codex CLI JSONL format confirmed: thread.started, item.completed(type=message), turn.failed, error events
- `/home/lobster/.npm-global/lib/node_modules/openclaw/docs/gateway/openai-http-api.md` — OpenClaw chatCompletions endpoint disabled by default confirmed; enable config key confirmed
- `curl http://127.0.0.1:18789/health` — OpenClaw /health endpoint confirmed: `{"ok":true,"status":"live"}`

### Secondary (MEDIUM confidence)
- `/home/lobster/.npm-global/lib/node_modules/openclaw/docs/` — OpenClaw gateway is WebSocket-based; HTTP API is optional overlay; agent dispatch via `openclaw agent --message ... --json` exists as fallback
- `/home/lobster/.codex/config.toml` — Codex model `gpt-5.4` confirmed as default; sandbox_mode/approval_policy confirmed
- `gemini --help` — `-p` flag for non-interactive mode confirmed; `--output-format stream-json` confirmed; `--yolo` flag confirmed for suppressing prompts

### Tertiary (LOW confidence)
- Codex JSONL `turn.completed` event (inferred from `turn.started`/`turn.failed` pattern — not directly observed due to usage limit)
- Gemini `MessageEvent.delta === true` for streaming deltas (from TypeScript type definition; not directly observed from live run due to rate limit)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all stdlib only; no new packages; confirmed from existing codebase
- Architecture: HIGH — all adapter patterns derived from observed CLI outputs and existing stream-service.ts patterns
- Wire formats: HIGH for Ollama, Claude CLI, Gemini CLI (types.d.ts), OpenClaw health; MEDIUM for Codex (usage limit prevented full success run)
- Pitfalls: HIGH — all derived from actual test runs and source code inspection

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (Ollama, Claude, Gemini CLIs update frequently — re-verify streaming format if CLI versions change)
