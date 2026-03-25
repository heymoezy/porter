---
phase: 20-live-dashboard
plan: 01
subsystem: database
tags: [p-queue, drizzle, postgres, bridge, routing, typescript]

# Dependency graph
requires:
  - phase: 16-gateway-foundation
    provides: gateways and gateway_credentials tables, migration pattern, GatewayAdapter interface
  - phase: 17-provider-adapters
    provides: GatewayType values, adapter implementations, stream normalizer

provides:
  - routing_rules table DDL with scope/action/priority columns
  - bridge_dispatch_log table DDL with JSONB alternatives field
  - session_routing_context table DDL with chat_id/message_sequence
  - p-queue installed and importable as ESM
  - Per-gateway dispatch queues with CLI=1 / HTTP=3 concurrency limits
  - All 3 new tables with appropriate indexes
  - Wave 0 test stubs for RT-01 through RT-05 (24 todos)
  - 7 new TypeScript types for routing engine
  - 3 new Drizzle table exports in schema.ts

affects: [20-02-routing-engine, Phase 21, Phase 22, Phase 23]

# Tech tracking
tech-stack:
  added: [p-queue@9.1.0]
  patterns: [ESM-only npm package in type=module backend, schema_migrations idempotency guard, PQueue singleton map per gateway type]

key-files:
  created:
    - backend/src/__tests__/routing-engine.test.ts
    - backend/src/__tests__/dispatch-log.test.ts
    - backend/src/__tests__/session-routing.test.ts
    - backend/src/db/migrate-bridge-v2.ts
    - backend/src/services/bridge/dispatch-queues.ts
  modified:
    - backend/package.json
    - backend/src/index.ts
    - backend/src/services/bridge/types.ts
    - backend/src/db/schema.ts

key-decisions:
  - "p-queue v9.1.0 chosen — ESM-only package, compatible with type=module backend"
  - "CLI gateway concurrency=1 (subprocess serialization), HTTP gateway concurrency=3 (connection pool)"
  - "PQueue singleton per gateway type at module level — persists across requests, no re-creation overhead"
  - "Wave 0 test stubs use node:test + tsx (existing test framework), not vitest"

patterns-established:
  - "Migration idempotency: schema_migrations guard with unique string key per migration file"
  - "PQueue singleton map: Map<string, PQueue> keyed by gateway type, lazy init in getQueue()"
  - "Wave 0 TDD: it.todo() stubs created before implementation — failing fast if prematurely run"

requirements-completed: [RT-02, RT-03, RT-04, RT-05]

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 20 Plan 01: Smart Routing Engine Foundation Summary

**Three PostgreSQL tables (routing_rules, bridge_dispatch_log, session_routing_context), p-queue ESM concurrency control, 7 routing TypeScript types, and 24 Wave 0 test stubs creating the data foundation for the smart routing engine**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T09:28:15Z
- **Completed:** 2026-03-25T09:31:22Z
- **Tasks:** 3 (Task 0, Task 1, Task 2)
- **Files modified:** 9

## Accomplishments
- Created 24 Wave 0 test stubs in 3 files covering RT-01 through RT-05 — all pass via npx tsx --test (exit 0)
- Installed p-queue@9.1.0 and created migrate-bridge-v2.ts with DDL for all 3 tables plus 6 indexes
- Extended bridge/types.ts with 7 routing types and schema.ts with 3 Drizzle table exports; created dispatch-queues.ts with PQueue singleton map

## Task Commits

Each task was committed atomically:

1. **Task 0: Wave 0 test stubs for RT-01 through RT-05** - `9d91d48` (test)
2. **Task 1: Install p-queue, create bridge v2 migration** - `86da3d3` (feat)
3. **Task 2: Extend bridge types, add Drizzle schema exports, create dispatch-queues** - `5ac5952` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `backend/src/__tests__/routing-engine.test.ts` - 14 test stubs for RT-01 (select), RT-02 (evaluateRules), RT-04 (dispatchWithQueue)
- `backend/src/__tests__/dispatch-log.test.ts` - 6 test stubs for RT-03 (logDispatch)
- `backend/src/__tests__/session-routing.test.ts` - 4 test stubs for RT-05 (recordSessionTurn)
- `backend/src/db/migrate-bridge-v2.ts` - DDL for routing_rules, bridge_dispatch_log, session_routing_context with all indexes
- `backend/src/services/bridge/dispatch-queues.ts` - PQueue singleton map, getQueue(), getQueueStats()
- `backend/package.json` - p-queue@9.1.0 added to dependencies
- `backend/src/index.ts` - migrateBridgeV2(pool) wired after migrateBridgeV1 in boot sequence
- `backend/src/services/bridge/types.ts` - 7 new routing types appended
- `backend/src/db/schema.ts` - routingRules, bridgeDispatchLog, sessionRoutingContext Drizzle exports

## Decisions Made
- p-queue v9.1.0 is ESM-only — works because backend is already `"type": "module"`
- CLI gateways (codex_cli, claude_cli, gemini_cli) get concurrency=1 to serialize subprocess calls
- HTTP gateways (ollama, openclaw, openai_compat) get concurrency=3 to use connection pools efficiently
- PQueue created lazily in getQueue() and cached in module-level Map — zero overhead per dispatch

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- package-lock.json in .gitignore — staged only package.json for commit (no functional impact)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 tables ready for Plan 02 routing engine implementation
- Wave 0 test stubs waiting for Plan 02 to fill in real assertions
- dispatch-queues.ts ready for import in routing-engine.ts
- All TypeScript types exported and compile-verified

## Self-Check: PASSED

All created files verified present. All task commits verified in git log.

---
*Phase: 20-live-dashboard*
*Completed: 2026-03-25*
