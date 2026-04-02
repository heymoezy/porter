---
phase: 34-feedback-telemetry
plan: 01
subsystem: database
tags: [postgres, drizzle, migration, sse, routing-engine, skill-feedback, telemetry]

# Dependency graph
requires:
  - phase: 33-runtime-skill-selector
    provides: skillsUsed shape in RoutingContext, persona_skills with skill_id, logDispatch returning dispatch id
provides:
  - skill_feedback_events table with id/persona_id/skill_id/dispatch_id/event_type/note/created_at columns
  - persona_skills extended with times_selected, times_completed, positive_feedback_count, negative_feedback_count, last_used_at, effectiveness_score
  - dispatch_id surfaced in SSE done event via __DISPATCH_META__ convention
  - times_selected auto-incremented on persona_skills per dispatch with selected skills
affects: [34-02-feedback-api, 34-03-skill-evolution, any consumer of SSE done events]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "__DISPATCH_META__ token convention: routing-engine yields metadata after stream, chat.ts intercepts and strips before forwarding to client"
    - "migrateFbkV1 pattern: migration ID 034_skill_feedback_events, single transaction, idempotency via schema_migrations"

key-files:
  created:
    - backend/src/db/migrate-fbk-v1.ts
  modified:
    - backend/src/db/schema.ts
    - backend/src/index.ts
    - backend/src/services/bridge/routing-engine.ts
    - backend/src/routes/v1/chat.ts

key-decisions:
  - "__DISPATCH_META__ token convention avoids changing StreamBackend interface — routing-engine yields a specially-prefixed JSON string as the last token; chat.ts strips it, never forwards to client"
  - "logDispatch fires async IIFE internally and returns id immediately — await self.logDispatch(...) resolves quickly, maintaining fire-and-forget DB semantics while capturing the id"
  - "times_selected uses COALESCE(skill_id, skill_name) = ANY($2) for backwards compat with pre-Phase-31 rows where skill_name holds the skill id"
  - "No FK constraints on skill_feedback_events — consistent with entire existing schema convention"

patterns-established:
  - "Phase 34 metadata threading: __DISPATCH_META__{json} token is yielded after the final stream token, stripped by chat.ts, never visible to SSE client"
  - "Counter increment pattern: UPDATE persona_skills SET times_selected = COALESCE(times_selected,0)+1 inside logDispatch async IIFE, non-fatal on error"

requirements-completed: [FBK-01, FBK-02]

# Metrics
duration: 3min
completed: 2026-04-02
---

# Phase 34 Plan 01: Feedback Telemetry Schema Summary

**skill_feedback_events table + persona_skills counter columns in PostgreSQL, dispatch_id surfaced in SSE done events via __DISPATCH_META__ stream convention, times_selected auto-incremented on persona_skills per dispatch**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-02T17:57:53Z
- **Completed:** 2026-04-02T18:01:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created skill_feedback_events table with all 7 columns (id, persona_id, skill_id, dispatch_id, event_type, note, created_at) plus two indexes
- Added 6 counter/metric columns to persona_skills (times_selected, times_completed, positive_feedback_count, negative_feedback_count, last_used_at, effectiveness_score)
- SSE done events now carry dispatch_id field — clients can link thumbs-up/down to the exact dispatch that produced the response
- times_selected + last_used_at auto-incremented inside logDispatch for every dispatch with selected skills

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration file + Drizzle schema + startup registration** - `1ff7b4d` (feat)
2. **Task 2: Surface dispatch_id in SSE done event + increment times_selected** - `0328979` (feat)

## Files Created/Modified
- `backend/src/db/migrate-fbk-v1.ts` - Migration: CREATE TABLE skill_feedback_events + ALTER TABLE persona_skills ADD COLUMN x6, migration ID 034_skill_feedback_events
- `backend/src/db/schema.ts` - Added skillFeedbackEvents Drizzle table + 6 new columns to personaSkills definition
- `backend/src/index.ts` - Import migrateFbkV1, call await migrateFbkV1(pool) after migrateRtsV1
- `backend/src/services/bridge/routing-engine.ts` - Capture logDispatch return, yield __DISPATCH_META__ token after stream; increment times_selected in logDispatch async IIFE
- `backend/src/routes/v1/chat.ts` - Detect/strip __DISPATCH_META__ tokens in streaming loop, include dispatch_id in SSE done event

## Decisions Made
- Used __DISPATCH_META__ token convention to thread dispatch_id from routing-engine through to chat.ts without touching the StreamBackend interface or adding ref objects
- logDispatch fires an async IIFE internally and returns id synchronously — awaiting the Promise resolves quickly, capturing id without changing the fire-and-forget DB write semantics
- COALESCE(skill_id, skill_name) in the times_selected UPDATE handles both pre- and post-Phase-31 persona_skills rows
- No FK constraints on skill_feedback_events (consistent with existing codebase convention)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Migration runs automatically on service startup.

## Next Phase Readiness
- skill_feedback_events table ready to receive POST /api/v1/agents/:id/skills/:skillId/feedback writes (Plan 02)
- persona_skills counter columns ready for effectiveness_score computation (Plan 03)
- All SSE clients now receive dispatch_id in done events — feedback UI can store it for linking
- Existing 35 Playwright tests unaffected (SSE done event is backwards-compatible: dispatch_id is null when no skills were dispatched)

---
*Phase: 34-feedback-telemetry*
*Completed: 2026-04-02*
