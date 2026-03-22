---
phase: 09-streaming-chat
plan: 01
subsystem: api
tags: [streaming, ndjson, ollama, openclaw, abort-signal, node-test, tsx]

requires:
  - phase: 08-api-foundation
    provides: config.ts with ollamaUrl/porterPyUrl, ai-router.ts with shouldRouteCheap

provides:
  - StreamBackend interface (stream(prompt, signal): AsyncIterable<string>)
  - OllamaStreamBackend: NDJSON parser for Ollama /api/generate streaming
  - OpenClawStreamBackend: word-chunker for porter.py /api/dispatch blocking response
  - selectStreamBackend(): routes via shouldRouteCheap or explicit hint
  - Unit tests (10 cases) using node:test + tsx

affects:
  - 09-streaming-chat plan 02 (route handler that wires StreamBackend)

tech-stack:
  added: []
  patterns:
    - AsyncIterable<string> as the unified streaming contract
    - TextDecoder line-buffering for NDJSON streams with chunk-split handling
    - Word-chunking with ~25-char threshold for simulated typewriter streaming
    - AbortSignal checked at fetch call, reader.read(), and before each yield

key-files:
  created:
    - backend/src/services/stream-service.ts
    - backend/src/services/stream-service.test.ts
  modified: []

key-decisions:
  - "AbortSignal passed directly to fetch() so Ollama cancellation propagates all the way to network layer"
  - "OpenClawStreamBackend uses word-chunking (not character-by-character) to simulate typewriter streaming from blocking porter.py response"
  - "selectStreamBackend() re-uses shouldRouteCheap() from ai-router.ts — no duplicate routing logic"
  - "Tests use node:test built-in (no vitest install) with tsx for TypeScript support"

patterns-established:
  - "StreamBackend: all streaming backends implement stream(prompt, AbortSignal): AsyncIterable<string>"
  - "NDJSON buffering: accumulate partial lines across read chunks, split on newline, keep tail in buffer"

requirements-completed: [STRM-01, STRM-02, STRM-03]

duration: 2min
completed: 2026-03-22
---

# Phase 09 Plan 01: Streaming Service Summary

**AsyncIterable StreamBackend interface with Ollama NDJSON parser and porter.py word-chunker, routed by shouldRouteCheap(), with AbortSignal support and 10 unit tests**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T03:37:21Z
- **Completed:** 2026-03-22T03:39:43Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- StreamBackend interface defined as the sole streaming contract for Plan 02 route handler
- OllamaStreamBackend correctly parses NDJSON from Ollama /api/generate with chunk-split line buffering
- OpenClawStreamBackend word-chunks blocking porter.py /api/dispatch responses into ~25-char typewriter chunks
- selectStreamBackend() routes via shouldRouteCheap() or explicit 'ollama'/'openclaw'/'auto' hint
- AbortSignal terminates both backends at the earliest possible point (fetch, reader.read, yield)
- 10 unit tests all pass with node:test + tsx (no external test framework installed)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Test scaffold** - `effe6c3` (test)
2. **Task 1 GREEN: Implementation** - `a5b376c` (feat)

## Files Created/Modified

- `backend/src/services/stream-service.ts` - StreamBackend interface + OllamaStreamBackend + OpenClawStreamBackend + selectStreamBackend
- `backend/src/services/stream-service.test.ts` - 10 unit tests (3 Ollama, 2 OpenClaw, 5 selectStreamBackend)

## Decisions Made

- AbortSignal is passed directly to fetch() so that Ollama NDJSON stream cancellation propagates to the network layer, not just a generator return
- OpenClawStreamBackend uses word-chunking (accumulate to ~25 chars) with 15ms inter-chunk delay rather than character-by-character to reduce setTimeout call volume
- selectStreamBackend() re-uses shouldRouteCheap() from ai-router.ts — no routing logic duplicated
- Tests use node:test (built-in to Node v22) with tsx for TypeScript — no external test framework required

## Deviations from Plan

None - plan executed exactly as written. The TDD RED/GREEN cycle completed in a single pass with no additional debugging required.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- StreamBackend interface and both concrete implementations are ready for Plan 02
- Plan 02 will wire selectStreamBackend() into a Fastify route handler with SSE or chunked transfer encoding
- TypeScript compiles without errors, all unit tests green

---
*Phase: 09-streaming-chat*
*Completed: 2026-03-22*

## Self-Check: PASSED

- backend/src/services/stream-service.ts — FOUND
- backend/src/services/stream-service.test.ts — FOUND
- .planning/phases/09-streaming-chat/09-01-SUMMARY.md — FOUND
- commit effe6c3 (test RED) — FOUND
- commit a5b376c (feat GREEN) — FOUND
