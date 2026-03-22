---
phase: 09-streaming-chat
plan: 02
subsystem: api
tags: [streaming, sse, fastify, abort-controller, ollama, chat-route, dead-code-removal]

requires:
  - phase: 09-streaming-chat
    plan: 01
    provides: selectStreamBackend(), StreamBackend interface, OllamaStreamBackend, OpenClawStreamBackend

provides:
  - POST /api/v1/chat/stream SSE endpoint (STRM-01, STRM-02, STRM-03)
  - AbortController wired to request.raw 'close' event for client disconnect detection
  - Chat message persistence after stream completes (best-effort)
  - Tombstone 404 for deprecated /api/chat/stream to block proxy fallthrough

affects:
  - 09-streaming-chat plan 03+ (frontend integration consumes POST /api/v1/chat/stream)

tech-stack:
  added: []
  patterns:
    - "reply.raw.writeHead(200, SSE headers) before first await — prevents Fastify response hijack"
    - "AbortController wired to request.raw.on('close') for upstream cancellation"
    - "finally block emits done event — guarantees client receives done regardless of error/abort path"
    - "Persistence is best-effort in finally block — DB errors never fail the stream"
    - "Tombstone 404 route blocks proxy fallthrough to deprecated endpoints"

key-files:
  created: []
  modified:
    - backend/src/routes/v1/chat.ts
    - backend/src/routes/ai.ts

key-decisions:
  - "reply.raw.writeHead() called synchronously before first await to prevent Fastify from intercepting the response"
  - "done event always emitted in finally block (not try) to guarantee client receives it even on error paths"
  - "Tombstone 404 added for /api/chat/stream to prevent proxy fallthrough to port-8877 backend with old mock"
  - "body type includes 'ollama'|'openclaw' as TypeScript types only — all routing logic remains in selectStreamBackend()"

requirements-completed: [STRM-01, STRM-02, STRM-03]

duration: 8min
completed: 2026-03-22
---

# Phase 09 Plan 02: SSE Route Implementation Summary

**POST /api/v1/chat/stream SSE endpoint with AbortController disconnect detection, selectStreamBackend() delegation, done-event guarantee, and removal of GET proxy + mock stream dead code**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-22T03:49:00Z
- **Completed:** 2026-03-22T04:09:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- POST /api/v1/chat/stream route added to v1/chat.ts with full SSE implementation
- request.raw.on('close') wires AbortController for upstream cancellation (STRM-03)
- reply.raw.writeHead(200) called before first await to prevent Fastify from intercepting the response
- selectStreamBackend() is the only backend call — zero provider-specific code in route handler (STRM-02)
- done event guaranteed in finally block even if stream errors or aborts (prevents EventSource reconnect loops)
- Chat messages persisted to DB after successful stream completion (best-effort, never blocks stream)
- GET /stream porter.py proxy deleted from v1/chat.ts
- Mock SSE handler deleted from ai.ts
- Tombstone 404 added for /api/chat/stream to block proxy fallthrough to older backend
- TTFT measured at 388-683ms against local Ollama (requirement: < 2000ms) — PASS

## Task Commits

Each task was committed atomically:

1. **Task 1: SSE route + dead code removal** - `29ecc60` (feat)
2. **Task 2: Tombstone 404 fix** - `0a0a7e5` (fix)

## Files Created/Modified

- `backend/src/routes/v1/chat.ts` — POST /stream route added, GET /stream proxy deleted, import added
- `backend/src/routes/ai.ts` — Mock SSE stream deleted, tombstone 404 added

## Decisions Made

- `reply.raw.writeHead()` is called synchronously before the first `await` — Fastify will hijack the response with its own content-type if any async operation runs before headers are set
- The `done` event lives in the `finally` block not the `try` block — this ensures clients always receive the completion signal even if an error occurs mid-stream
- Tombstone 404 added to `ai.ts` because the proxy plugin forwards unknown routes to a separate backend process (port 8877) that still had the old mock — needed explicit blocking
- Body type definition with `'ollama' | 'openclaw' | 'auto'` is a TypeScript input type, not provider logic — satisfies STRM-02 "no provider-specific code in handler" requirement

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Proxy fallthrough serving old mock stream**

- **Found during:** Task 2 smoke test
- **Issue:** After removing the mock from `ai.ts`, GET `/api/chat/stream` still returned mock tokens because the proxy plugin forwarded the request to a systemd-managed tsx backend on port 8877 that still had old code
- **Fix:** Added tombstone 404 route in `ai.ts` for `/api/chat/stream` — the explicit route takes priority over proxy fallthrough
- **Files modified:** `backend/src/routes/ai.ts`
- **Commit:** `0a0a7e5`

## Smoke Test Results

| Test | Result |
|------|--------|
| POST /api/v1/chat/stream returns data: {"token":"..."} events | PASS |
| done event: data: {"done":true,"backend":"ollama","full_response":"..."} | PASS |
| TTFT < 2000ms (measured: 388ms - 683ms) | PASS |
| Empty message → 400 INVALID_INPUT | PASS |
| No auth → 401 UNAUTHORIZED | PASS |
| Old GET /api/chat/stream → 404 | PASS |
| TypeScript compiles with zero errors | PASS |
| 10 stream-service unit tests still green | PASS |

## Next Phase Readiness

- POST /api/v1/chat/stream is live and serving SSE token events from Ollama
- AbortController cancellation terminates upstream Ollama generation when client disconnects
- STRM-01, STRM-02, STRM-03 requirements all satisfied
- Frontend-v2 can now connect EventSource to POST /api/v1/chat/stream for real-time chat

---
*Phase: 09-streaming-chat*
*Completed: 2026-03-22*

## Self-Check: PASSED

- backend/src/routes/v1/chat.ts — FOUND
- backend/src/routes/ai.ts — FOUND
- .planning/phases/09-streaming-chat/09-02-SUMMARY.md — FOUND
- commit 29ecc60 (feat: SSE route + dead code removal) — FOUND
- commit 0a0a7e5 (fix: tombstone 404) — FOUND
