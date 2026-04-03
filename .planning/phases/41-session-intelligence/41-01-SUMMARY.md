---
phase: 41-session-intelligence
plan: 01
subsystem: memory
tags: [postgres, session, memory-injection, lru-cache, fts, tsvector]

# Dependency graph
requires: []
provides:
  - Two-layer (in-memory LRU + DB) frozen memory snapshot cache keyed by session_id
  - DB columns: session_registry.memory_snapshot, session_registry.frozen_at
  - DB columns: bridge_dispatch_log.outcome_score, bridge_dispatch_log.outcome_note
  - DB columns + GIN index + trigger: agent_messages.search_vector (FTS)
  - getOrBuildSnapshot / clearSnapshot service API
  - ai-router dispatch path uses frozen snapshot instead of fresh buildMemoryContext per turn
  - Session rotation clears snapshot cache
affects:
  - 41-session-intelligence
  - any phase building on session tracking or memory injection

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LRU Map (insertion-order eviction) for in-memory service-layer caching"
    - "Two-layer cache: in-memory Map → DB column, write-through on first build"
    - "Dynamic import for clearSnapshot in rotateSession to avoid circular dep"
    - "schema_migrations table idempotency guard with ROLLBACK on error"

key-files:
  created:
    - backend/src/db/migrate-sin-v1.ts
    - backend/src/services/memory-snapshot.ts
  modified:
    - backend/src/db/schema.ts
    - backend/src/services/ai-router.ts
    - backend/src/services/session-registry.ts
    - backend/src/index.ts

key-decisions:
  - "Used dynamic import() for clearSnapshot in rotateSession to avoid circular dependency between session-registry and memory-snapshot"
  - "upsertSession called with 0 tokens in ai-router dispatch path to resolve session ID before snapshot lookup — idempotent, no token side-effects"
  - "chatId added as optional field to DispatchRequest to support cross-session keying"

patterns-established:
  - "getOrBuildSnapshot pattern: check in-memory → check DB → build once → write-through to DB"
  - "All SIN-01 changes tagged with // SIN-01 comment for traceability"

requirements-completed: [SIN-01]

# Metrics
duration: 5min
completed: 2026-04-03
---

# Phase 41 Plan 01: Session Intelligence — Frozen Memory Summary

**In-memory LRU + DB-persisted frozen snapshot service freezing memory context at session turn 1, with FTS index + outcome columns added via idempotent PostgreSQL migration**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-03T09:46:43Z
- **Completed:** 2026-04-03T09:50:59Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Migration (migrate-sin-v1.ts) adds all Phase 41 DB columns: memory_snapshot/frozen_at on session_registry, outcome_score/outcome_note on bridge_dispatch_log, search_vector with GIN index and auto-update trigger on agent_messages, plus backfill of existing rows
- Memory snapshot service (memory-snapshot.ts) implements two-layer cache: in-memory LRU Map (200 entries, insertion-order eviction) checked first, DB fallback on process restart, write-through on first build
- ai-router dispatch path replaces direct buildMemoryContext call with getOrBuildSnapshot — same memory text returned for every turn in the same session
- Session rotation clears the snapshot cache via dynamic import to avoid circular dependency

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration + memory snapshot service** - `57d8feb` (feat)
2. **Task 2: Wire frozen memory into ai-router dispatch path** - `6c0f6c6` (feat)

## Files Created/Modified
- `backend/src/db/migrate-sin-v1.ts` - Idempotent migration: 5 new DB columns, GIN index, FTS trigger, backfill
- `backend/src/services/memory-snapshot.ts` - Two-layer frozen snapshot cache (getOrBuildSnapshot, clearSnapshot)
- `backend/src/db/schema.ts` - memorySnapshot, frozenAt, outcomeScore, outcomeNote, searchVector Drizzle columns
- `backend/src/services/ai-router.ts` - Replaced buildMemoryContext with getOrBuildSnapshot; added chatId to DispatchRequest
- `backend/src/services/session-registry.ts` - rotateSession clears snapshot cache on session close
- `backend/src/index.ts` - migrateSinV1 registered in startup migration chain

## Decisions Made
- Used dynamic `import()` for clearSnapshot in rotateSession to avoid circular dependency between session-registry.ts and memory-snapshot.ts
- Called upsertSession with 0 tokens in ai-router to resolve session ID before snapshot lookup — this is idempotent and adds no token side effects
- Added optional `chatId` to DispatchRequest interface to support future chat-session keying without breaking existing callers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Migration runs automatically on next server startup.

## Next Phase Readiness
- Frozen memory foundation complete; Phase 41 Plan 02 can build episode/signal tracking on top of the outcome_score/outcome_note columns
- FTS index on agent_messages ready for session-search queries
- getOrBuildSnapshot available for any future service needing frozen session context

---
*Phase: 41-session-intelligence*
*Completed: 2026-04-03*

## Self-Check: PASSED
- migrate-sin-v1.ts: FOUND
- memory-snapshot.ts: FOUND
- 41-01-SUMMARY.md: FOUND
- commit 57d8feb: FOUND
- commit 6c0f6c6: FOUND
