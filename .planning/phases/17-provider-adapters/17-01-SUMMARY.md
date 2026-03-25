---
phase: 17-provider-adapters
plan: 01
subsystem: api
tags: [ollama, openclaw, bridge, adapters, typescript, fetch, streaming, ndjson, sse]

# Dependency graph
requires:
  - phase: 16-gateway-foundation
    provides: GatewayAdapter interface and GatewayRow types in bridge/types.ts
provides:
  - OllamaAdapter class implementing GatewayAdapter with /api/chat and NDJSON streaming
  - OpenClawAdapter class implementing GatewayAdapter with /v1/chat/completions and SSE streaming
affects: [17-02, 17-03, phase-18, bridge-service, router, dispatch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GatewayAdapter implementation pattern: constructor takes GatewayRow, private baseUrl getter, all 5 methods"
    - "Ollama NDJSON streaming: message.content field, not response field (/api/chat not /api/generate)"
    - "OpenAI SSE parsing: data: prefix stripping, [DONE] terminator, delta.content extraction"
    - "Two-part health check for OpenClaw: /health probe then /v1/chat/completions endpoint probe"
    - "AbortSignal.timeout() for all non-streaming requests, passed signal for streaming"

key-files:
  created:
    - backend/src/services/bridge/adapters/ollama.ts
    - backend/src/services/bridge/adapters/openclaw.ts
  modified: []

key-decisions:
  - "OllamaAdapter uses /api/chat (not /api/generate) — message.content, not response, for token extraction"
  - "OpenClawAdapter.health() probes both /health and /v1/chat/completions (GET→404 = endpoint disabled)"
  - "TextDecoder() default constructor only — TypeScript lib type rejects options object as first arg"
  - "OpenClawAdapter.listModels() returns static ['openai-codex/gpt-5.4'] — no /v1/models endpoint exists"

patterns-established:
  - "Adapter constructor: Takes GatewayRow, stores as private readonly row"
  - "baseUrl getter: Falls back to hardcoded default if row.url is null"
  - "AbortSignal.timeout(N) on all health/dispatch calls — never block indefinitely"
  - "reader.releaseLock() always in finally block for streaming generators"
  - "Signal abort check before each read() in streaming loops"

requirements-completed: [CLI-02, CLI-03]

# Metrics
duration: 4min
completed: 2026-03-25
---

# Phase 17 Plan 01: Provider Adapters (HTTP) Summary

**OllamaAdapter and OpenClawAdapter implementing GatewayAdapter via fetch(), with NDJSON and SSE streaming and two-part OpenClaw health detection**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-25T08:03:44Z
- **Completed:** 2026-03-25T08:07:14Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- OllamaAdapter: full GatewayAdapter implementation targeting /api/chat with messages[] array, NDJSON streaming, eval_count token counting
- OpenClawAdapter: full GatewayAdapter implementation targeting /v1/chat/completions with Bearer auth, OpenAI SSE parsing, chatCompletions endpoint detection
- Both adapters compile cleanly against GatewayAdapter interface with zero TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create OllamaAdapter implementing GatewayAdapter** - `911946b` (feat)
2. **Task 2: Create OpenClawAdapter implementing GatewayAdapter** - `0ed26eb` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `backend/src/services/bridge/adapters/ollama.ts` - OllamaAdapter: detect/health/dispatch/stream/listModels using /api/chat
- `backend/src/services/bridge/adapters/openclaw.ts` - OpenClawAdapter: detect/health/dispatch/stream/listModels using /v1/chat/completions

## Decisions Made
- Used `/api/chat` not `/api/generate` for OllamaAdapter — different from stream-service.ts's OllamaStreamBackend which uses the generate endpoint. The chat endpoint supports the messages[] array format required by GatewayAdapter.
- OpenClaw health check is two-part: first probe `/health` for gateway liveness, then GET `/v1/chat/completions` — 404 means chatCompletions endpoint is disabled and we return a clear config instruction; any other status (405=Method Not Allowed) means the endpoint is active.
- `new TextDecoder()` with no arguments — TypeScript's lib.dom.d.ts types TextDecoder as `new(label?: string, ...)` so passing an options object as first arg is a type error. Default UTF-8 constructor is correct.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TextDecoder constructor call**
- **Found during:** Task 1 (OllamaAdapter TypeScript compilation)
- **Issue:** Plan specified `new TextDecoder({ fatal: false })` but TypeScript lib types reject an options object as the first argument (expects string encoding label)
- **Fix:** Changed to `new TextDecoder()` — default UTF-8 with non-fatal error handling is the correct approach
- **Files modified:** backend/src/services/bridge/adapters/ollama.ts
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** 911946b (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor constructor argument fix. No scope creep. Both adapters exactly match the plan specification.

## Issues Encountered
- TextDecoder constructor type mismatch — fixed inline (see Deviations above)

## User Setup Required
None - no external service configuration required.

## Self-Check: PASSED

All files verified present. All commits verified in git log.

## Next Phase Readiness
- OllamaAdapter and OpenClawAdapter are ready for use by the bridge router and dispatch service
- Both adapters accept a GatewayRow from the DB and can be instantiated at request time
- Phase 17-02 (CLI adapters) follows the same GatewayAdapter pattern established here

---
*Phase: 17-provider-adapters*
*Completed: 2026-03-25*
