---
phase: 17-provider-adapters
verified: 2026-03-25T09:00:00+08:00
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 17: Provider Adapters Verification Report

**Phase Goal:** Every supported AI backend has a concrete adapter implementing the GatewayAdapter interface, with a stream normalizer that converts all output formats into a single unified AsyncIterable
**Verified:** 2026-03-25T09:00:00+08:00
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | OllamaAdapter.dispatch() sends POST to /api/chat with messages array and returns response text with token counts | VERIFIED | ollama.ts:88-114 — POST to `/api/chat`, returns `data.message.content`, `eval_count`, `prompt_eval_count` |
| 2 | OllamaAdapter.stream() yields individual tokens from NDJSON message.content fields | VERIFIED | ollama.ts:185 — `yield chunk.message.content`, parses NDJSON, checks `chunk.done` |
| 3 | OllamaAdapter.listModels() returns model names from /api/tags | VERIFIED | ollama.ts:208-218 — fetches `/api/tags`, returns `data.models.map(m => m.name)` |
| 4 | OllamaAdapter.health() returns healthy:true with latency when Ollama responds | VERIFIED | ollama.ts:48-64 — `{ healthy: true, latencyMs: Date.now() - start }` on 200 OK |
| 5 | OpenClawAdapter.health() probes /health and reports chatCompletions endpoint status | VERIFIED | openclaw.ts:57-97 — two-part check: `/health` then `/v1/chat/completions` GET; 404 returns specific config instruction |
| 6 | OpenClawAdapter.dispatch() sends POST to /v1/chat/completions with Bearer auth | VERIFIED | openclaw.ts:119-127 — POST with `Authorization: Bearer ${this.authToken}` |
| 7 | OpenClawAdapter.stream() yields tokens from OpenAI SSE delta.content fields | VERIFIED | openclaw.ts:219-235 — strips `data: ` prefix, handles `[DONE]`, yields `chunk.choices[0].delta.content` |
| 8 | CodexCLIAdapter spawns codex exec --json --ephemeral, parses JSONL item.completed events, yields output_text content | VERIFIED | codex-cli.ts:86,128-142 — args array includes `--json`, `--ephemeral`, `--skip-git-repo-check`; parses `item.completed`/`output_text` |
| 9 | ClaudeCLIAdapter spawns claude -p with --output-format stream-json --verbose --include-partial-messages, yields text from content_block_delta events | VERIFIED | claude-cli.ts:92-98,240-252 — exact flags present; yields `delta.text` from `content_block_delta` events |
| 10 | GeminiCLIAdapter spawns gemini -p with --output-format stream-json, yields content from assistant message events | VERIFIED | gemini-cli.ts:93,239-241 — `-p prompt` positional, `--yolo`, yields `event.content` where `event.role === 'assistant'` |
| 11 | All three CLI adapters have configurable timeout (120s Codex, 60s Claude/Gemini) with SIGTERM on timeout | VERIFIED | codex-cli.ts:22 (`TIMEOUT_MS = 120_000`), claude-cli.ts:23 and gemini-cli.ts:23 (`TIMEOUT_MS = 60_000`); all use `child.kill('SIGTERM')` in timeout |
| 12 | StreamNormalizer.normalize() wraps any GatewayAdapter.stream() with error boundary and abort propagation | VERIFIED | stream-normalizer.ts:28-45 — static async generator, `signal.aborted` check before yield and in catch, error re-thrown with `[adapter.name]` prefix |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/services/bridge/adapters/ollama.ts` | OllamaAdapter implementing GatewayAdapter | VERIFIED | 220 lines, exports `OllamaAdapter implements GatewayAdapter`, all 5 methods present |
| `backend/src/services/bridge/adapters/openclaw.ts` | OpenClawAdapter implementing GatewayAdapter | VERIFIED | 253 lines, exports `OpenClawAdapter implements GatewayAdapter`, all 5 methods present |
| `backend/src/services/bridge/adapters/codex-cli.ts` | CodexCLIAdapter implementing GatewayAdapter | VERIFIED | 237 lines, exports `CodexCLIAdapter implements GatewayAdapter`, all 5 methods present |
| `backend/src/services/bridge/adapters/claude-cli.ts` | ClaudeCLIAdapter implementing GatewayAdapter | VERIFIED | 268 lines, exports `ClaudeCLIAdapter implements GatewayAdapter`, all 5 methods present |
| `backend/src/services/bridge/adapters/gemini-cli.ts` | GeminiCLIAdapter implementing GatewayAdapter | VERIFIED | 257 lines, exports `GeminiCLIAdapter implements GatewayAdapter`, all 5 methods present |
| `backend/src/services/bridge/stream-normalizer.ts` | StreamNormalizer with static normalize() | VERIFIED | 47 lines, `static async *normalize(adapter, req, signal)` — thin wrapper as designed |
| `backend/src/services/bridge/adapters/index.ts` | Barrel re-export of all adapters | VERIFIED | Exports all 5 adapters + StreamNormalizer + ADAPTER_MAP + createAdapter() factory |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `adapters/ollama.ts` | `bridge/types.ts` | `implements GatewayAdapter` | WIRED | Line 23: `export class OllamaAdapter implements GatewayAdapter` |
| `adapters/openclaw.ts` | `bridge/types.ts` | `implements GatewayAdapter` | WIRED | Line 22: `export class OpenClawAdapter implements GatewayAdapter` |
| `adapters/codex-cli.ts` | `bridge/types.ts` | `implements GatewayAdapter` | WIRED | Line 24: `export class CodexCLIAdapter implements GatewayAdapter` |
| `adapters/claude-cli.ts` | `bridge/types.ts` | `implements GatewayAdapter` | WIRED | Line 25: `export class ClaudeCLIAdapter implements GatewayAdapter` |
| `adapters/gemini-cli.ts` | `bridge/types.ts` | `implements GatewayAdapter` | WIRED | Line 25: `export class GeminiCLIAdapter implements GatewayAdapter` |
| `stream-normalizer.ts` | `bridge/types.ts` | `import type { GatewayAdapter, BridgeDispatchRequest }` | WIRED | Line 16: `import type { GatewayAdapter, BridgeDispatchRequest } from './types.js'` |
| `adapters/index.ts` | `adapters/ollama.ts` | `export { OllamaAdapter } from './ollama.js'` | WIRED | Line 12 confirmed |
| `adapters/index.ts` | `adapters/openclaw.ts` | `export { OpenClawAdapter } from './openclaw.js'` | WIRED | Line 13 confirmed |
| `adapters/index.ts` | `stream-normalizer.ts` | `export { StreamNormalizer } from '../stream-normalizer.js'` | WIRED | Line 21 confirmed |

All key links verified. ADAPTER_MAP covers all 5 gateway types (`ollama`, `openclaw`, `codex_cli`, `claude_cli`, `gemini_cli`). The `openai_compat` GatewayType is defined in `types.ts` but has no adapter — consistent with it not being listed in phase requirements.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CLI-02 | 17-01 | Ollama adapter — wraps existing native API calls, implements GatewayAdapter | SATISFIED | `adapters/ollama.ts` — full 5-method implementation, `/api/chat` endpoint |
| CLI-03 | 17-01 | OpenClaw adapter — wraps existing OpenAI-compatible calls, implements GatewayAdapter | SATISFIED | `adapters/openclaw.ts` — full 5-method implementation, `/v1/chat/completions` + SSE |
| CLI-04 | 17-02 | Codex CLI adapter — subprocess dispatch with stdin/stdout streaming, error handling, timeout | SATISFIED | `adapters/codex-cli.ts` — spawn with readline, 120s timeout, SIGTERM, error events |
| CLI-05 | 17-02 | Claude CLI adapter — subprocess dispatch with -p flag, streaming output parsing | SATISFIED | `adapters/claude-cli.ts` — `claude -p`, stdin write, `content_block_delta` parsing |
| CLI-06 | 17-02 | Gemini CLI adapter — subprocess dispatch, output parsing, model detection | SATISFIED | `adapters/gemini-cli.ts` — `gemini -p`, `--yolo`, init event model detection |
| CLI-07 | 17-03 | Stream normalizer — converts all adapter output formats to unified AsyncIterable<string> | SATISFIED | `stream-normalizer.ts` — `static async *normalize()` unifies all adapter streams |

All 6 requirements (CLI-02 through CLI-07) satisfied. No orphaned requirements found for Phase 17 in REQUIREMENTS.md traceability table.

---

### Anti-Patterns Found

None detected. Scanned all 7 new files for:
- TODO/FIXME/PLACEHOLDER comments — none found
- Empty implementations (`return null`, `return []`, `return {}`) — no stub patterns; `return []` in `listModels()` error fallback (Ollama) is legitimate fallback on network failure, not a stub
- Handler stubs — none; all 5 methods in each adapter contain real logic
- No modifications to `stream-service.ts`, `ai-router.ts`, or any route file

One comment in `ollama.ts` references `stream-service.ts` by name but only as documentation distinguishing the two implementations — not an import.

---

### Human Verification Required

None required for this phase. All verifiable properties are structural (TypeScript types, method implementations, spawn arguments, stream parsing logic). No UI, no real-time behavior, no external service integration that would require manual testing to verify correctness.

The TypeScript compiler (`cd backend && npx tsc --noEmit`) exited 0 with zero errors, confirming all 5 adapters correctly implement the `GatewayAdapter` interface as enforced by TypeScript structural typing.

Note from SUMMARY-03: Playwright tests showed 35 failures due to Porter service not running at port 8877. This is a pre-existing infrastructure state (service not configured) — not a regression introduced by Phase 17. Phase 17 files are pure TypeScript library code with no route handlers that would affect the Playwright test suite.

---

### Summary

Phase 17 achieved its goal. All 5 supported AI backends have concrete adapter classes implementing the `GatewayAdapter` interface. The `StreamNormalizer` provides a single unified `AsyncIterable<string>` entry point regardless of which adapter (HTTP-based NDJSON, HTTP-based SSE, or any of the 3 CLI JSONL subprocess formats) produced the token stream. The barrel export with `ADAPTER_MAP` and `createAdapter()` factory makes all adapters importable via a single line and enables dynamic instantiation from DB rows in Phase 20.

All 6 requirements (CLI-02 through CLI-07) are satisfied. TypeScript compilation is clean. All 7 task commits exist in git history. No stubs, no orphaned files, no anti-patterns.

---

_Verified: 2026-03-25T09:00:00+08:00 (SGT)_
_Verifier: Claude (gsd-verifier)_
