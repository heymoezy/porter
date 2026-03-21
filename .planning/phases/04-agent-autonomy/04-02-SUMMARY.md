---
phase: 04-agent-autonomy
plan: 02
subsystem: api
tags: [ai-router, ollama, openclaw, model-dispatch, context-compression, smart-routing]

# Dependency graph
requires: []
provides:
  - Smart model routing heuristic (cheap vs strong) based on message complexity
  - HTTP dispatch to Ollama (/api/generate) and openclaw (/v1/chat/completions)
  - Fallback chain: preferred tier → other tier → porter.py proxy
  - Dynamic tool schema rebuild stripping offline backend tools
  - Context compressor preserving first 3 + last 4 turns with tool-call boundary repair
  - config.ts AI backend fields: ollamaUrl, openclawUrl, ollamaModel, openclawModel, openclawToken
affects:
  - 04-04 (scheduler.ts imports dispatch() to replace naive porter.py proxy call)
  - 04-05 (ephemeral agents use filterToolsForBackend() before dispatch)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getBackends() derives backend descriptors from config at runtime — never hardcodes addresses"
    - "probeBackend() uses HEAD with 2s AbortSignal.timeout for lightweight liveness check"
    - "compressContext() + repairToolCallBoundaries() pattern for safe long-session truncation"

key-files:
  created:
    - backend/src/services/ai-router.ts
  modified:
    - backend/src/config.ts

key-decisions:
  - "getBackends() reads config at call-time (not module-load) — supports env var changes during testing without module reload"
  - "openclawToken has no hardcoded fallback — empty string produces clear 401, guiding operator to set OPENCLAW_TOKEN"
  - "HEAD probe treated as available if response is ok OR 405 (some APIs reject HEAD but server is running)"
  - "dispatch() throws on empty response to guarantee agent_jobs.result is non-empty on any successful call"
  - "compressContext() protects first 3 + last 4 turns as per Hermes Pattern 6 recommendation"

patterns-established:
  - "Pattern: All backend coordinates (URL, model, token) flow through config.ts — ai-router.ts has zero hardcoded values"
  - "Pattern: Probe-then-route — check backend liveness before dispatch, fallback gracefully"
  - "Pattern: Tool-call boundary repair at context compression boundaries prevents malformed API payloads"

requirements-completed: [AGNT-01]

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 4 Plan 02: AI Router Summary

**Smart routing TypeScript service dispatching to Ollama (cheap) or openclaw (strong) with fallback chain, tool schema rebuild, and context compressor**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T03:14:45Z
- **Completed:** 2026-03-21T03:19:35Z
- **Tasks:** 3 (Tasks 2 and 3 share one commit — same file)
- **Files modified:** 2

## Accomplishments
- Config extended with 5 AI backend env vars — no hardcoded values anywhere
- AI router probes backends with 2s timeout and implements full fallback chain (cheap → strong → porter.py proxy)
- Context compressor handles long agent sessions safely with tool-call boundary repair
- All 35 Playwright regression tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ollamaUrl, openclawUrl, openclawToken to config.ts** - `bc2ad4a` (feat)
2. **Tasks 2+3: Create ai-router.ts with routing, dispatch, and context compression** - `4a67ece` (feat)

## Files Created/Modified
- `backend/src/config.ts` - Added 5 AI backend config fields (all from env vars)
- `backend/src/services/ai-router.ts` - Complete AI router: shouldRouteCheap, dispatch, filterToolsForBackend, compressContext

## Decisions Made
- `getBackends()` reads config at call-time rather than module-load, so env changes during testing don't require module reload
- `openclawToken` has no hardcoded fallback — empty string causes clear 401 guiding operator to set env var
- HEAD probe accepts 405 responses as "server is up" since some APIs disallow HEAD but are otherwise live
- `dispatch()` throws on empty response to guarantee `agent_jobs.result` is always populated on success
- Context compressor uses 50% threshold of 100K char limit (25K token proxy), protecting first 3 + last 4 turns per Hermes Pattern 6

## Deviations from Plan

None — plan executed exactly as written. Tasks 2 and 3 were implemented together since the compressContext function is referenced in the dispatch() function written in Task 2.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required beyond standard env vars documented in CLAUDE.md.

## Next Phase Readiness
- `dispatch()` and `compressContext()` ready for import by `scheduler.ts` (plan 04-04)
- `filterToolsForBackend()` ready for use by ephemeral agent executor (plan 04-05)
- Plan 04-01 (scheduler/jobs schema) can be executed independently — ai-router.ts has no dependency on it

---
*Phase: 04-agent-autonomy*
*Completed: 2026-03-21*
