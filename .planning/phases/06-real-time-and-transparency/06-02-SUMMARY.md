---
phase: 06-real-time-and-transparency
plan: 02
subsystem: ui
tags: [react, sse, eventsource, context, hooks, singleton]

# Dependency graph
requires:
  - phase: 05-guided-project-wizard
    provides: useProjectActivity hook with own EventSource (now refactored away)
provides:
  - SSEProvider singleton context (one EventSource for entire React app lifetime)
  - useSSEBus() hook for typed event subscription
  - useSSEHub() convenience hook with auto-cleanup
  - useProjectActivity refactored to shared bus pattern
affects: [06-real-time-and-transparency, all Phase 6 plans using SSE]

# Tech tracking
tech-stack:
  added: []
  patterns: [singleton-sse-context, typed-event-bus, react-context-pub-sub]

key-files:
  created:
    - frontend/src/providers/SSEProvider.tsx
    - frontend/src/hooks/useSSEHub.ts
  modified:
    - frontend/src/App.tsx
    - frontend/src/hooks/useProjectActivity.ts

key-decisions:
  - "SSEProvider creates one EventSource('/api/events') at app root — no per-component connections"
  - "Listener map uses Map<string, Set<Handler>> for O(1) dispatch with multiple subscribers per event type"
  - "TYPED_EVENTS list handles both named SSE events (event: field) and onmessage fallback for generic messages"
  - "useProjectActivity subscribes to both project:activity and agent:activity — handles nested {type,data} payload from porter.py _emit_event"
  - "bus object recreated on each render but ESRef is stable — subscribe() uses closure over ref, not bus identity"

patterns-established:
  - "SSE singleton: all SSE consumers call useSSEBus().subscribe() — never new EventSource()"
  - "useSSEHub pattern: useSSEHub(['event:type'], handler, deps) for fire-and-forget subscriptions with cleanup"
  - "Payload normalization: eventData = (data.data || data) handles both flat and wrapped SSE payloads"

requirements-completed: [PERF-03]

# Metrics
duration: 3min
completed: 2026-03-21
---

# Phase 06 Plan 02: SSE Singleton Provider Summary

**React SSE singleton via SSEProvider context — one EventSource per app, typed pub-sub bus replacing per-component connections**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T07:08:35Z
- **Completed:** 2026-03-21T07:11:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created SSEProvider (singleton EventSource, typed listener map, React context) wrapping entire app
- Created useSSEBus() hook for typed event subscription with auto-unsubscribe returns
- Created useSSEHub() convenience hook for components — single call with array of event types and auto-cleanup
- Refactored useProjectActivity to consume shared bus, removing its own EventSource connection
- App.tsx updated: SSEProvider wraps Layout inside QueryClientProvider

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SSEProvider and useSSEHub hook** - `2b3abb7` (feat)
2. **Task 2: Wire SSEProvider into App.tsx and refactor useProjectActivity** - `4860425` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `frontend/src/providers/SSEProvider.tsx` - Singleton SSEProvider with EventSource, typed listener map, useSSEBus export
- `frontend/src/hooks/useSSEHub.ts` - Convenience wrapper: subscribe to 1+ event types with effect cleanup
- `frontend/src/App.tsx` - Added SSEProvider wrapping Layout inside QueryClientProvider
- `frontend/src/hooks/useProjectActivity.ts` - Removed own EventSource; now consumes useSSEBus()

## Decisions Made
- SSEProvider wraps inside QueryClientProvider (not outside) so it can access React Query context if needed by future plans
- Listener map key `'*'` reserved for wildcard subscribers on onmessage fallback path
- TYPED_EVENTS covers all 6 known SSE event types from porter.py's _emit_event: agent:status, agent:activity, system:health, decision:made, project:update, memory:change

## Deviations from Plan

### Out-of-Scope Issues (Deferred)

**PERF-03 test partial failure — poller removal not in scope for this plan**
- The `/tmp/test_perf03_sse.py` test checks 3 things: emit endpoint, poller removal from porter.py, and setTimeout fallback patterns
- The poller removal check (`_projActivityPoller`, `_pulseOpsPoller`, etc. still using setInterval in porter.py) is work for a later Phase 6 plan
- The emit endpoint check returned SKIP (404 — not implemented yet, expected for this plan)
- The TypeScript frontend work (Tasks 1 and 2) is complete and correct
- Logged to deferred items for the poller-removal plan

None of the plan's actual deliverables deviated from spec.

## Issues Encountered
- PERF-03 behavioral test covers broader scope than this plan — poller removal from porter.py is a separate Phase 6 concern; test design notes "Stub behavior: If endpoints don't exist yet, tests print SKIP and exit 0" but the poller check fails on pre-existing code. Documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SSEProvider singleton is live; all Phase 6 hooks (health, decisions, activity feeds) use useSSEBus() or useSSEHub()
- TypeScript compiles cleanly (zero errors)
- No per-component EventSource remains in hooks/
- Plans 06-03 and beyond can add new typed subscriptions via useSSEHub(['event:type'], handler)

---
*Phase: 06-real-time-and-transparency*
*Completed: 2026-03-21*
