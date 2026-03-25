---
phase: 17-provider-adapters
plan: "02"
subsystem: bridge/adapters
tags: [bridge, cli-adapters, subprocess, streaming, codex, claude, gemini]
dependency_graph:
  requires:
    - 16-01 (GatewayAdapter interface in types.ts)
    - 16-02 (startup-detector which() usage pattern)
  provides:
    - CodexCLIAdapter (codex_cli gateway type)
    - ClaudeCLIAdapter (claude_cli gateway type)
    - GeminiCLIAdapter (gemini_cli gateway type)
  affects:
    - 17-03 (router/registry that instantiates these adapters)
tech_stack:
  added: []
  patterns:
    - node:child_process spawn() with stdio piping
    - node:readline createInterface() for async JSONL line iteration
    - AsyncGenerator for streaming with AbortSignal
    - SIGTERM timeout pattern with clearTimeout in finally
key_files:
  created:
    - backend/src/services/bridge/adapters/codex-cli.ts
    - backend/src/services/bridge/adapters/claude-cli.ts
    - backend/src/services/bridge/adapters/gemini-cli.ts
  modified: []
decisions:
  - Prompt passed as positional arg for Codex (codex exec ... <prompt>) vs stdin for Claude vs -p flag for Gemini
  - Codex timeout 120s (slower) vs 60s for Claude/Gemini
  - HealthResult.version field not in interface — stripped version capture from health(), just return healthy/latencyMs
  - GeminiCLIAdapter prioritizes final complete message (delta absent) over concatenated delta chunks
metrics:
  duration_seconds: 235
  completed_date: "2026-03-25"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 0
---

# Phase 17 Plan 02: CLI Provider Adapters Summary

**One-liner:** Three subprocess CLI adapters (Codex/Claude/Gemini) using spawn+readline for JSONL streaming with per-adapter timeout, AbortSignal, and stderr-drain deadlock prevention.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create CodexCLIAdapter | aa22195 | backend/src/services/bridge/adapters/codex-cli.ts |
| 2 | Create ClaudeCLIAdapter | de49682 | backend/src/services/bridge/adapters/claude-cli.ts |
| 3 | Create GeminiCLIAdapter | 1db80ad | backend/src/services/bridge/adapters/gemini-cli.ts |

## What Was Built

All three adapters implement the full `GatewayAdapter` interface (5 methods: `detect`, `health`, `dispatch`, `stream`, `listModels`).

**CodexCLIAdapter** (`codex_cli`):
- Spawns `codex exec --json --ephemeral --skip-git-repo-check <prompt>` (prompt as positional arg)
- Parses `item.completed` events, extracts `output_text` content
- Handles `error` and `turn.failed` JSONL events
- 120s timeout (Codex is slower than other tools)
- stdin closed immediately after spawn

**ClaudeCLIAdapter** (`claude_cli`):
- Spawns `claude -p --output-format stream-json --verbose --include-partial-messages --no-session-persistence`
- Writes prompt to stdin, closes stdin
- Extracts tokens from `stream_event`/`content_block_delta` events
- Captures detected model from `system`/`init` event
- Extracts `input_tokens`/`output_tokens` from `result` event
- 60s timeout

**GeminiCLIAdapter** (`gemini_cli`):
- Spawns `gemini -p <prompt> --output-format stream-json --yolo`
- Prompt passed as `-p` argument (not stdin); `--yolo` suppresses confirmation prompts
- Parses `message` events with `role === 'assistant'`; distinguishes `delta === true` (partial) from final
- Captures model from `init` event, tokens from `result.stats`
- Drains stderr for libsecret/keychain warnings
- 60s timeout

**Shared patterns across all three:**
- `child.stderr.resume()` on every code path to prevent deadlock
- AbortSignal listener in `stream()` with `{ once: true }`, removed in `finally`
- `clearTimeout` always in `finally` block
- SIGTERM for both timeout-triggered kills and abort-triggered kills

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] HealthResult type missing `version` field**
- **Found during:** Task 2 (ClaudeCLIAdapter)
- **Issue:** Plan spec said to return `{ healthy: true, latencyMs, version }` from `health()`, but `HealthResult` interface in `types.ts` has no `version` field — TypeScript error TS2353
- **Fix:** Removed version capture from `health()`. Health check returns `{ healthy: true, latencyMs }` only. Version detection is not part of the GatewayAdapter contract.
- **Files modified:** backend/src/services/bridge/adapters/claude-cli.ts
- **Impact:** None — version field was never consumed by callers; health result shape matches interface

## Self-Check: PASSED

Files verified:
- [x] backend/src/services/bridge/adapters/codex-cli.ts — FOUND
- [x] backend/src/services/bridge/adapters/claude-cli.ts — FOUND
- [x] backend/src/services/bridge/adapters/gemini-cli.ts — FOUND

Commits verified:
- [x] aa22195 — CodexCLIAdapter
- [x] de49682 — ClaudeCLIAdapter
- [x] 1db80ad — GeminiCLIAdapter

TypeScript: `npx tsc --noEmit` exits 0 with zero errors.
