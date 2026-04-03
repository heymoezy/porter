---
phase: 38-adaptive-agent-context
plan: "02"
subsystem: api
tags: [compression, context-window, session-registry, bridge, postgres]

# Dependency graph
requires:
  - phase: 38-01
    provides: directive scoring and context metadata pipeline
provides:
  - context-compressor.ts service with compressToolOutput and compressConversationHistory
  - compression_stats JSONB column on bridge_dispatch_log
  - compression_events and tokens_reclaimed counters on session_registry
  - triggerCompression() triggered from upsertSession at 70%/85% context thresholds
  - SSE bridge:compression events for admin visibility
affects:
  - session-registry
  - routing-engine
  - bridge dispatch pipeline

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-layer compression: tool output compression (per-turn) + conversation history compression (threshold-triggered)
    - Fire-and-forget compression: failures never block dispatch pipeline
    - Env-configurable thresholds for all compression knobs

key-files:
  created:
    - backend/src/services/context-compressor.ts
    - backend/src/db/migrate-acx-v2.ts
  modified:
    - backend/src/services/bridge/routing-engine.ts
    - backend/src/services/session-registry.ts
    - backend/src/services/bridge/types.ts
    - backend/src/index.ts

key-decisions:
  - "dispatchCompression uses internal Bridge HTTP endpoint for LLM calls — avoids circular imports and reuses gateway selection"
  - "compressToolOutput fires in dispatchStream after stream completes — compression stats attached to dispatch log, not response"
  - "triggerCompression is fire-and-forget from upsertSession — context pressure check has zero latency cost on dispatch path"
  - "acx-v2 migration is idempotent by design — acx-v3 already applied it inline if acx-v2 had not run first"
  - "COMPRESS_MODEL defaults to ollama (local, cheapest) — avoids burning API credits on compression summarization"

patterns-established:
  - "Fire-and-forget compression pattern: always catch() on async compression calls, never await in hot path"
  - "Env-configurable constants at top of service file following PORTER_COMPRESS_* naming"

requirements-completed: [ACX-03, ACX-04]

# Metrics
duration: 15min
completed: 2026-04-03
---

# Phase 38 Plan 02: Deep Execution & Tool Output Compression Summary

**Two-layer context compression: per-turn tool output summarization via LLM + threshold-triggered conversation history compression at 70%/85% context, with full DB traceability**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-03T04:07:00Z
- **Completed:** 2026-04-03T04:22:00Z
- **Tasks:** 5
- **Files modified:** 5 (+ 2 new files created)

## Accomplishments
- New `context-compressor.ts` service with `compressToolOutput()` (Layer 1) and `compressConversationHistory()` (Layer 2), fully env-configurable
- `acx_v2` migration adds `compression_stats JSONB` to `bridge_dispatch_log` and `compression_events`/`tokens_reclaimed` counters to `session_registry`
- `dispatchStream` in `routing-engine.ts` now compresses verbose tool outputs before dispatch logging; compression metadata stored in `compression_stats`
- `upsertSession` triggers async `triggerCompression()` at 70%/85% context thresholds without blocking dispatch
- SSE `bridge:compression` events emitted for admin dashboard visibility

## Task Commits

Each task was committed atomically:

1. **Task 4: Migration** - `6d95a6c` (feat — acx-v2 migration adds compression columns)
2. **Task 1: Context compressor service** - `0050143` (feat — context-compressor.ts with both compression layers)
3. **Tasks 2+3+5: Hook + trigger + config** - `05f097f` (feat — session-registry trigger and types.ts directiveStats)

_Note: routing-engine.ts changes (Task 2) were already committed as part of the 38-03 execution that ran before this plan, so they are captured in commit `831d5d6`._

## Files Created/Modified
- `backend/src/services/context-compressor.ts` (NEW) — Two-layer compression service with all 5 env vars
- `backend/src/db/migrate-acx-v2.ts` (NEW) — Idempotent migration for compression tracking columns
- `backend/src/services/bridge/routing-engine.ts` — Tool output compression hook in dispatchStream, compressionStats param in logDispatch
- `backend/src/services/session-registry.ts` — triggerCompression() + upsertSession threshold check
- `backend/src/services/bridge/types.ts` — directiveStats field added to RoutingContext
- `backend/src/index.ts` — migrateAcxV2 registered in migration chain

## Decisions Made
- `dispatchCompression` uses internal Bridge HTTP endpoint (`/api/v1/chat/send`) rather than a direct adapter call — preserves the single-gateway routing abstraction and avoids circular service dependencies
- Compression stats are attached to the dispatch log entry (not the SSE stream) — full tool outputs are preserved in the log, only working history uses the compressed form
- `triggerCompression` only increments `compression_events` counter; it does not attempt to modify the DB conversation history (which would require conversation-level storage, a future concern)
- `acx_v2` migration is standalone but harmless to run after `acx_v3` already applied it inline — idempotency check handles this cleanly

## Deviations from Plan

None — plan executed exactly as written. The routing-engine.ts Task 2 changes were already present from the 38-03 execution that ran in sequence before this plan; they were verified and correct.

## Issues Encountered
- Phase 38-03 commits ran before 38-02, meaning some routing-engine.ts changes were already committed. All intended changes verified present via grep before committing.

## Next Phase Readiness
- Plan 38-03 (context pressure observability) is already complete (committed before this plan ran)
- Phase 38 fully complete: directive scoring (38-01), tool compression (38-02), context observability (38-03)

---
*Phase: 38-adaptive-agent-context*
*Completed: 2026-04-03*
