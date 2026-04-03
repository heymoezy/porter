# Phase 39: Bridge Task Dispatch — Research

**Researched:** 2026-04-03
**Domain:** CLI subprocess orchestration, task lifecycle management, SSE streaming, Fastify async patterns
**Confidence:** HIGH

---

## Summary

Porter Bridge currently dispatches chat conversations exclusively. Every adapter exposes `stream()` and `dispatch()` methods that route a text prompt to a model and return text tokens. There is no concept of "real work" — no file reads, no bash execution, no code changes. The target model receives words and returns words.

The gap: three of the five gateway adapters (claude-cli, gemini-cli, codex-cli) run as local subprocesses, and those CLIs have full tool access when invoked with the right flags. The existing adapters invoke them with read-only/chat flags (`-p`, `--output-format stream-json`). Adding a `task()` method that invokes the same binaries with tool-access flags (`--dangerously-skip-permissions`, `--yolo`, `--dangerously-bypass-approvals-and-sandbox`) would give Bridge real execution capability without redesigning the adapter interface.

The correct approach is a **new parallel capability on the adapter interface**: a `task()` method alongside the existing `stream()` and `dispatch()`. Chat dispatch stays unchanged. Task dispatch uses different flags, a `cwd` parameter, an extended timeout, and streams progress back through the existing SSE hub. Task state is persisted in a new `bridge_tasks` table.

**Primary recommendation:** Add `task(req: TaskRequest, signal: AbortSignal): AsyncIterable<TaskEvent>` to `GatewayAdapter`. Wire a new `POST /api/v1/tasks/dispatch` route that uses this method. Store task state in `bridge_tasks`. Stream events via SSE. Skip codex-cli for now (bwrap warning is non-fatal but noisy; `--dangerously-bypass-approvals-and-sandbox` works).

---

## Standard Stack

### Core (all already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:child_process` (spawn) | built-in | Run CLI subprocesses | Already used in all 3 CLI adapters |
| `node:readline` (createInterface) | built-in | Parse JSONL output line-by-line | Already used in all 3 CLI adapters |
| `uuid` (v4) | already in backend | Task ID generation | Already used in routing-engine |
| `drizzle-orm` + `pg` pool | already in backend | Persist task rows | Established pattern |
| `sse-hub.ts` (broadcast) | in-process | Push events to dashboard | Already used for bridge:dispatch events |

### New (zero new dependencies needed)
No new npm packages required. Everything needed is already in the codebase.

---

## Architecture Patterns

### Existing Adapter Interface (`types.ts` line 65-73)
```typescript
export interface GatewayAdapter {
  readonly name: string;
  readonly gatewayType: GatewayType;
  detect(): Promise<DetectResult>;
  health(): Promise<HealthResult>;
  dispatch(req: BridgeDispatchRequest): Promise<BridgeDispatchResult>;
  stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string>;
  listModels(): Promise<string[]>;
}
```

`task()` is a new optional method on this interface. Non-CLI adapters (ollama, openclaw) return `undefined` or throw `NOT_SUPPORTED`. The routing engine's `selectAllCandidates()` already filters to `active + enabled` gateways — task routing will add a `capabilities` filter for `'task_execution'`.

### New Types to Add

```typescript
// Add to types.ts

export interface TaskRequest {
  prompt: string;            // The task description
  cwd: string;               // Working directory for the subprocess
  timeoutMs?: number;        // Default: 300_000 (5 min)
  tools?: string[];          // Optional tool allowlist (claude: --allowedTools)
}

export interface TaskEvent {
  type: 'progress' | 'result' | 'error' | 'tool_use' | 'tool_result';
  text?: string;             // Human-readable output chunk
  tool?: string;             // Tool name (for tool_use events)
  input?: unknown;           // Tool input (for tool_use events)
  exitCode?: number;         // Final exit code (for result/error)
  durationMs?: number;       // Total wall time (for result/error)
}

export interface TaskDispatchResult {
  taskId: string;
  gatewayType: string;
  model: string;
  status: 'complete' | 'failed' | 'cancelled';
  output: string;            // Full concatenated text output
  durationMs: number;
  exitCode: number | null;
}
```

### DB Schema — New `bridge_tasks` Table

```sql
CREATE TABLE bridge_tasks (
  id           TEXT PRIMARY KEY,
  gateway_type TEXT NOT NULL,
  model_name   TEXT NOT NULL,
  prompt       TEXT NOT NULL,
  cwd          TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued',  -- queued|running|complete|failed|cancelled
  output       TEXT,                            -- full output when complete
  error        TEXT,                            -- error message if failed
  exit_code    INTEGER,
  started_at   DOUBLE PRECISION,
  completed_at DOUBLE PRECISION,
  duration_ms  INTEGER,
  agent_id     TEXT,
  project_id   TEXT,
  username     TEXT,
  dispatch_log_id TEXT,                         -- FK to bridge_dispatch_log
  created_at   DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
);
```

Reuses the existing `bridge_dispatch_log` for cost/token attribution via a `dispatch_log_id` FK. No new log table needed.

### Recommended Project Structure

New files:
```
backend/src/
├── services/bridge/
│   └── task-executor.ts       # TaskExecutor class (spawns subprocess, streams events)
└── routes/v1/
    └── tasks.ts               # POST /api/v1/tasks/dispatch, GET /:id, DELETE /:id/cancel
```

Modified files:
```
backend/src/services/bridge/
├── types.ts                   # Add TaskRequest, TaskEvent, TaskDispatchResult
├── adapters/claude-cli.ts     # Add task() method
├── adapters/gemini-cli.ts     # Add task() method
├── adapters/codex-cli.ts      # Add task() method (with --dangerously-bypass flag)
└── adapters/ollama.ts         # task() returns NOT_SUPPORTED
backend/src/db/schema.ts       # Add bridgeTasks table definition
drizzle/                       # New migration file
```

### Pattern 1: Claude CLI Task Invocation

```typescript
// Source: verified by running claude --help and live test output
// Flags for task mode (vs. chat mode):
const args = [
  '-p',                                  // non-interactive / print mode
  '--dangerously-skip-permissions',      // bypass all permission checks
  '--output-format', 'stream-json',      // JSONL event stream on stdout
  '--verbose',                           // required with stream-json + -p
  '--include-partial-messages',          // get tokens as they arrive
  '--no-session-persistence',            // don't save sessions to disk
  '--bare',                              // skip hooks, LSP, auto-memory, CLAUDE.md
                                         // NOTE: --bare prevents porter session-hook noise
];
// CWD is the critical addition — tells Claude where to operate
const child = spawn(binaryPath, args, {
  cwd: req.cwd,                          // KEY: working directory for file operations
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
});
child.stdin.write(req.prompt, 'utf8');
child.stdin.end();
```

**Critical finding:** The `--bare` flag is essential for task mode. Without it, Claude runs `SessionStart` hooks (including the Porter session hook at `backend/src/cli/session-hook.cjs`) which inject memory context into every dispatch and add ~500ms startup latency. With `--bare`, Claude skips all hooks, CLAUDE.md discovery, and keychain reads — giving a clean execution environment.

### Pattern 2: Gemini CLI Task Invocation

```typescript
// Source: verified by running gemini --help
// Gemini already uses --yolo in chat mode (auto-approves all tool calls)
const args = [
  '-p', req.prompt,                      // prompt as flag value (not stdin)
  '--yolo',                              // auto-approve all tool actions
  '--output-format', 'stream-json',
];
const child = spawn(binaryPath, args, {
  cwd: req.cwd,                          // KEY: working directory
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
});
child.stdin.end();
```

Note: Gemini's `--yolo` is identical to what the existing chat adapter uses. The difference is the `cwd` parameter and that the prompt is a real task description, not just a chat message.

### Pattern 3: Codex CLI Task Invocation

```typescript
// Source: verified by running `codex exec --help` and live test
// --dangerously-bypass-approvals-and-sandbox skips bwrap requirement
const args = [
  'exec',
  '--dangerously-bypass-approvals-and-sandbox',
  '--json',                              // JSONL output
  '-C', req.cwd,                         // KEY: working directory flag
  req.prompt,                            // prompt as positional arg
];
const child = spawn(binaryPath, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
});
child.stdin.end();
```

**Bwrap situation:** `codex exec --dangerously-bypass-approvals-and-sandbox` works on this VPS. It prints a warning ("Codex could not find system bubblewrap at /usr/bin/bwrap. Please install bubblewrap with your package manager. Codex will use the vendored bubblewrap in the meantime.") but the vendored bwrap runs fine. Live-tested: `echo hello` task ran and output "hello" successfully in 0ms. The warning should be filtered from task output or suppressed via stderr drain.

### Pattern 4: Task Progress Streaming via SSE

The existing `sse-hub.ts` `broadcast()` function is available. Task events should be broadcast on `bridge:task-progress` with a `task_id` field so clients can filter. The existing `/api/v1/health` SSE stream (or a new `/api/v1/tasks/stream` endpoint) would carry these events.

```typescript
// In task-executor.ts, after each output chunk:
const { broadcast } = await import('./sse-hub.js');
broadcast('bridge:task-progress', {
  task_id: taskId,
  gateway_type: gatewayType,
  type: 'progress',
  text: outputChunk,
  elapsed_ms: Date.now() - startedAt,
});
```

### Pattern 5: API Design — New Routes

```
POST /api/v1/tasks/dispatch    — Create and immediately start a task (async)
GET  /api/v1/tasks/:id         — Poll task status + partial output
DELETE /api/v1/tasks/:id/cancel — Send SIGTERM to running subprocess
GET  /api/v1/tasks             — List tasks (optional filters: status, gateway_type)
```

Request body for dispatch:
```json
{
  "prompt": "Read backend/src/routes/v1/chat.ts and summarize the SSE stream handler",
  "cwd": "/home/lobster/projects/porter",
  "gateway": "claude_cli",    // optional; 'auto' uses routing engine filtered to task-capable
  "agent_id": "...",          // optional; for dispatch log attribution
  "project_id": "...",        // optional
  "timeout_ms": 300000        // optional; max 600000 (10 min)
}
```

Response:
```json
{
  "ok": true,
  "data": {
    "task_id": "uuid",
    "status": "running",
    "gateway_type": "claude_cli",
    "model": "claude-opus-4-6[1m]"
  }
}
```

### Pattern 6: Task Routing — Capability Filter

The routing engine's `RoutingContext` gains an optional `taskMode: boolean` flag. When `taskMode: true`, the engine filters candidates to those with `task_execution` in their `capabilities` array. The `gateways` table already has a `capabilities` JSONB column — at detection time, CLI gateways should be updated to include `task_execution`.

Alternatively (simpler): hardcode `TASK_CAPABLE_TYPES = new Set(['claude_cli', 'gemini_cli', 'codex_cli'])` in `task-executor.ts` and filter `selectAllCandidates()` output by this set. Since capabilities are set at detection time and the DB row might not be updated yet, the hardcoded set is safer for the initial implementation.

### Anti-Patterns to Avoid

- **Don't run tasks inline in the HTTP request handler:** Tasks can run for minutes. The HTTP connection should return `202 Accepted` with a `task_id` immediately. The subprocess runs in the background. Clients poll or watch SSE.
- **Don't reuse the chat stream() adapter for tasks:** Chat mode uses different flags (no `--dangerously-skip-permissions`, no `cwd`). Mixing them would require complex flag management and risks breaking chat.
- **Don't stream subprocess stdout directly over the HTTP response:** Each task needs a persistent record. Streaming directly to a single HTTP response means no recovery, no polling, no progress for subsequent viewers. Write to DB + broadcast SSE.
- **Don't forget SIGKILL on timeout:** `child.kill('SIGTERM')` is the first attempt. If the process doesn't exit within 5s, send `SIGKILL`. CLI processes that are waiting for user input can ignore SIGTERM.
- **Don't use `--dangerously-skip-permissions` on ollama/openclaw:** These are HTTP gateways. The flag is only meaningful for local CLI tools. The routing filter must prevent non-CLI gateways from receiving task dispatch.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Output line parsing | Custom byte-splitter | `createInterface({ input: child.stdout })` | Already proven in all 3 adapters — handles partial buffers, edge cases |
| Process cleanup | Manual listener management | `child.once('close', ...)` + AbortSignal pattern | Already proven in adapters |
| Task ID generation | Timestamp + random | `uuidv4()` | Already in routing-engine |
| SSE broadcast | Custom WebSocket or polling | `sse-hub.ts` broadcast() | In-process, zero latency, already used |
| Gateway selection | Custom priority logic | `routingEngine.selectAllCandidates()` | Already handles priorities, circuit breakers |
| Long-running queue | Custom queue | `getQueue(gatewayType)` from dispatch-queues | Already handles p-queue concurrency per gateway |

**Key insight:** The entire subprocess management + output parsing pattern is already battle-tested in `claude-cli.ts`, `gemini-cli.ts`, and `codex-cli.ts`. The task adapter is essentially the same spawn/readline loop with different flags and an extra `cwd` parameter.

---

## Common Pitfalls

### Pitfall 1: Claude Hooks Polluting Output
**What goes wrong:** Claude CLI dispatched without `--bare` runs `SessionStart` hooks. These emit JSON events with type `system/hook_response` containing session-hook output, Porter memory context, and git errors. These events appear before any assistant content and inflate the output with hundreds of lines of metadata.
**Why it happens:** Claude's default session startup runs CLAUDE.md-discovered hooks. The Porter session hook at `backend/src/cli/session-hook.cjs` is configured to inject directives/concepts at session start.
**How to avoid:** Always add `--bare` to task mode CLI args. This skips all hooks, CLAUDE.md auto-discovery, LSP, and keychain reads. Anthropic auth still works via `ANTHROPIC_API_KEY` env var.
**Warning signs:** First JSONL line from claude is `{"type":"system","subtype":"hook_started",...}` instead of `{"type":"system","subtype":"init",...}`.

### Pitfall 2: Task Subprocess Holding Open File Handles
**What goes wrong:** Subprocess exits but `close` event never fires because stderr was not drained. The readline loop blocks forever waiting for more stdin.
**Why it happens:** Node.js child process `close` waits for all stdio streams to close. If `child.stderr` is not drained, it can buffer-block the subprocess.
**How to avoid:** Always `child.stderr.resume()` immediately after `spawn()`. This is already done in all existing adapters.
**Warning signs:** Task never transitions from `running` to `complete`, even after the model appears to have finished.

### Pitfall 3: Long Running Timeout
**What goes wrong:** Default timeout of 60-120s (from chat adapters) kills a legitimate task that's doing deep work.
**Why it happens:** Chat adapters have tight timeouts appropriate for conversational responses. Tasks like "refactor this module" can take 5-10 minutes.
**How to avoid:** Task mode timeout must be configurable per request with a high default (5 min) and a hard cap (10 min). Implement the two-stage kill: SIGTERM → wait 5s → SIGKILL.
**Warning signs:** Tasks reliably fail at exactly 60000ms or 120000ms.

### Pitfall 4: CWD Security
**What goes wrong:** A caller passes `cwd: "/etc"` or `cwd: "/home/lobster/.ssh"` and the task model reads sensitive files.
**Why it happens:** No validation on the `cwd` parameter.
**How to avoid:** Validate `cwd` at the route level: must be an absolute path, must exist, must be under an allowlist (e.g., `/home/lobster/projects/`, `/home/websites/`). Reject anything outside the allowlist.
**Warning signs:** Not applicable until validation is added — add it at MVP.

### Pitfall 5: Codex Bwrap Warning in Output
**What goes wrong:** Codex task output contains the bwrap warning as a prominent first line, confusing callers.
**Why it happens:** Codex writes this warning to stderr but it sometimes leaks to stdout or gets captured in the JSON envelope.
**How to avoid:** Parse and discard known warning lines. Add a filter in the Codex task adapter: `if (line.includes('could not find system bubblewrap')) continue;`. Alternatively drain stderr separately and only log it for debugging.
**Warning signs:** Task output starts with "warning: Codex could not find system bubblewrap".

### Pitfall 6: Concurrent Tasks Saturating a Single Model
**What goes wrong:** 5 simultaneous Claude CLI tasks all running `opus` — each uses ~200K tokens, burning API budget fast.
**Why it happens:** No per-gateway concurrency limit on task dispatch (the existing `p-queue` from `dispatch-queues.ts` applies to chat, not tasks — or if shared, it limits concurrency globally including chat).
**How to avoid:** Use a separate p-queue for tasks with concurrency = 1 per gateway. This also prevents subprocess fan-out.
**Warning signs:** Multiple tasks showing `running` status for the same gateway simultaneously.

---

## Code Examples

### TaskExecutor Skeleton (verified patterns from adapters)

```typescript
// Source: patterns from backend/src/services/bridge/adapters/claude-cli.ts
// and backend/src/services/bridge/adapters/codex-cli.ts

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { v4 as uuidv4 } from 'uuid';

export class TaskExecutor {
  async *execute(
    binaryPath: string,
    args: string[],
    prompt: string,
    cwd: string,
    signal: AbortSignal,
    timeoutMs = 300_000,
  ): AsyncIterable<TaskEvent> {
    const child = spawn(binaryPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PORTER_BRIDGE_DISPATCH: '1' },
    });

    // Always drain stderr to prevent deadlock
    const stderrChunks: string[] = [];
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk.toString('utf8'));
    });

    // AbortSignal → SIGTERM → SIGKILL
    const onAbort = () => {
      child.kill('SIGTERM');
      setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000);
    };
    signal.addEventListener('abort', onAbort, { once: true });

    // Hard timeout
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000);
    }, timeoutMs);

    // Write prompt to stdin (claude pattern)
    if (args.includes('-p') && !args.includes(prompt)) {
      child.stdin.write(prompt, 'utf8');
    }
    child.stdin.end();

    try {
      const rl = createInterface({ input: child.stdout!, terminal: false });
      for await (const line of rl) {
        if (signal.aborted) return;
        if (!line.trim()) continue;
        // Parse JSONL and yield TaskEvents
        // ... adapter-specific parsing per CLI type
      }
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }

    await new Promise<void>((resolve) => child.once('close', () => resolve()));
  }
}
```

### Route Handler Pattern

```typescript
// POST /api/v1/tasks/dispatch
fastify.post('/dispatch', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
  const body = request.body as TaskDispatchBody;

  // Validate cwd against allowlist
  const allowedRoots = ['/home/lobster/projects/', '/home/websites/'];
  if (!allowedRoots.some(root => body.cwd.startsWith(root))) {
    return reply.code(400).send(err('INVALID_CWD', 'cwd must be within an allowed directory'));
  }

  // Create task row
  const taskId = uuidv4();
  await pool.query(
    `INSERT INTO bridge_tasks (id, status, prompt, cwd, username, agent_id, project_id, created_at)
     VALUES ($1, 'queued', $2, $3, $4, $5, $6, EXTRACT(EPOCH FROM NOW()))`,
    [taskId, body.prompt, body.cwd, request.sessionUser!.username, body.agent_id ?? null, body.project_id ?? null]
  );

  // Start execution in background (do NOT await)
  runTaskInBackground(taskId, body).catch(() => {});

  return reply.code(202).send(ok({ task_id: taskId, status: 'queued' }));
});
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Chat-only Bridge (text in, text out) | Task dispatch (tool access, real execution) | Bridge can now delegate actual work |
| Inline subprocess management | Reuse existing adapter spawn patterns | Zero new risk, proven code |
| No cwd parameter | `cwd` on every task | CLI tools operate on the correct project directory |
| bwrap blocks codex | `--dangerously-bypass-approvals-and-sandbox` + vendored bwrap | Codex works on this VPS |
| Claude hooks add ~500ms + noise | `--bare` flag | Clean, fast, predictable task output |

**Key finding on --bare flag:** The `--bare` flag was added in a recent Claude CLI version. It is REQUIRED for Porter task dispatch. Without it, the Claude Porter session hook fires on every dispatch, injecting all directives and requiring git status checks. This adds latency, context noise, and potential failures (the hook currently errors with `Cannot find module ... session-hook.cjs` when run from non-porter directories).

---

## Open Questions

1. **Task output size limits**
   - What we know: Tasks can run for minutes and produce megabytes of output
   - What's unclear: Whether to store full output in the `bridge_tasks` table or truncate
   - Recommendation: Store up to 1MB, truncate with a `[output truncated]` marker. Separately, allow a `download_url` for full output.

2. **Task cancellation guarantees**
   - What we know: SIGTERM + SIGKILL pattern works for subprocess termination
   - What's unclear: Whether Claude/Gemini cleanly save any partial work before dying
   - Recommendation: Mark task as `cancelled` optimistically. Claude may complete its current tool call before dying — that's acceptable.

3. **Multiple tasks per gateway**
   - What we know: The existing dispatch-queues use p-queue with concurrency per gateway
   - What's unclear: Whether the same queue should be shared between chat and task dispatch, or separate queues
   - Recommendation: Separate task queue with concurrency = 1. Chat must not be blocked by long-running tasks.

4. **Tool allowlisting on Claude CLI**
   - What we know: Claude CLI supports `--allowedTools` flag to restrict tool access
   - What's unclear: Whether to expose this to callers or always run unrestricted
   - Recommendation: Start unrestricted (--dangerously-skip-permissions gives full access). Add allowlisting in a future iteration.

5. **Working directory for Codex**
   - What we know: Codex uses `-C <dir>` flag for working directory (verified in `codex exec --help`)
   - What's unclear: Whether Codex respects `-C` absolutely or relative to its CWD at spawn time
   - Recommendation: Pass both `-C req.cwd` in args AND `cwd: req.cwd` in spawn options for safety.

---

## Validation Architecture

nyquist_validation is enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (existing, 35 tests passing) |
| Config file | `/home/lobster/projects/porter/tests/playwright.config.ts` |
| Quick run command | `cd /home/lobster/projects/porter/tests && npx playwright test --grep "task"` |
| Full suite command | `cd /home/lobster/projects/porter/tests && npx playwright test` |

### Phase Requirements → Test Map

| ID | Behavior | Test Type | Automated Command | File Exists? |
|----|----------|-----------|-------------------|-------------|
| BTD-01 | POST /api/v1/tasks/dispatch returns 202 + task_id | integration | `npx playwright test --grep "task dispatch"` | ❌ Wave 0 |
| BTD-02 | GET /api/v1/tasks/:id returns status transitions | integration | `npx playwright test --grep "task status"` | ❌ Wave 0 |
| BTD-03 | DELETE /api/v1/tasks/:id/cancel sends SIGTERM | integration | `npx playwright test --grep "task cancel"` | ❌ Wave 0 |
| BTD-04 | claude_cli task() uses --bare + --dangerously-skip-permissions | unit/smoke | verify via spawn args inspection | ❌ Wave 0 |
| BTD-05 | gemini_cli task() uses --yolo + cwd | unit/smoke | verify via spawn args inspection | ❌ Wave 0 |
| BTD-06 | codex_cli task() uses --dangerously-bypass + -C cwd | unit/smoke | verify via spawn args inspection | ❌ Wave 0 |
| BTD-07 | cwd validated against allowlist — /etc rejected | unit | `npx playwright test --grep "task cwd"` | ❌ Wave 0 |
| BTD-08 | Task progress streamed via SSE bridge:task-progress | integration | SSE event monitor test | ❌ Wave 0 |
| BTD-09 | Non-CLI gateways (ollama, openclaw) return NOT_SUPPORTED | unit | adapter unit test | ❌ Wave 0 |
| BTD-10 | bridge_tasks row created on dispatch, updated on complete/fail | integration | DB state inspection | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/lobster/projects/porter/tests && npx playwright test --grep "task" -x`
- **Per wave merge:** `cd /home/lobster/projects/porter/tests && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/bridge-tasks.spec.ts` — covers BTD-01 through BTD-10
- [ ] `tests/fixtures/task-helpers.ts` — shared task dispatch helpers, cleanup on close

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `/home/lobster/projects/porter/backend/src/services/bridge/adapters/claude-cli.ts` — verified spawn pattern, JSONL parsing, AbortSignal handling
- Direct code inspection: `/home/lobster/projects/porter/backend/src/services/bridge/adapters/codex-cli.ts` — verified codex exec pattern, stdin handling
- Direct code inspection: `/home/lobster/projects/porter/backend/src/services/bridge/adapters/gemini-cli.ts` — verified gemini -p + --yolo pattern
- Direct code inspection: `/home/lobster/projects/porter/backend/src/services/bridge/types.ts` — verified GatewayAdapter interface, existing types
- Direct code inspection: `/home/lobster/projects/porter/backend/src/services/bridge/routing-engine.ts` — verified dispatchWithQueue, logDispatch, SSE emitSSE
- Direct code inspection: `/home/lobster/projects/porter/backend/src/services/sse-hub.ts` — verified broadcast() pattern
- Direct code inspection: `/home/lobster/projects/porter/backend/src/db/schema.ts` — verified bridge_dispatch_log columns, pgTable patterns
- Live CLI test: `codex exec --dangerously-bypass-approvals-and-sandbox "echo hello"` — confirmed working with vendored bwrap
- Live CLI test: `claude -p "echo hello" --dangerously-skip-permissions --output-format stream-json --verbose --no-session-persistence --bare` — confirmed working; `--bare` suppresses hook noise
- Live CLI test: `claude --help` — verified all flag names including `--bare`, `--allowedTools`
- Live CLI test: `codex exec --help` — verified `-C <DIR>` flag, `--dangerously-bypass-approvals-and-sandbox`, `--json`
- Live CLI test: `gemini --help` — verified `--yolo`, `-p`, `--output-format stream-json`

### Secondary (MEDIUM confidence)
- Live claude stream-json output inspection — verified `type:system/subtype:hook_started` events emitted when `--bare` is NOT used; `type:system/subtype:init` is first event when `--bare` IS used

### Tertiary (LOW confidence)
- None required — all critical claims verified against source code or live CLI tests

---

## Metadata

**Confidence breakdown:**
- Adapter interface: HIGH — read actual TypeScript source
- CLI flags: HIGH — verified via --help and live tests
- Subprocess patterns: HIGH — copied from existing adapters
- Database schema: HIGH — read actual Drizzle schema
- bwrap/sandbox: HIGH — tested live on this VPS
- SSE architecture: HIGH — read sse-hub.ts + scheduler.ts

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable infrastructure; CLI flags may change with new CLI versions)
