---
phase: 34-feedback-telemetry
plan: 02
subsystem: api, frontend
tags: [feedback, telemetry, fastify, react, sse, persona-skills, skill-feedback-events]

# Dependency graph
requires:
  - phase: 34-01
    provides: skill_feedback_events table, persona_skills counter columns, dispatch_id in SSE done event
provides:
  - POST /api/v1/feedback/:dispatchId endpoint — fan-out to skill_feedback_events + counter update
  - ThumbsUp/ThumbsDown UI on chat assistant messages after stream completes
  - effectiveness_score recomputed from positive/(positive+negative) on each feedback write
affects: [34-03-skill-evolution, any consumer of persona_skills effectiveness_score]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fan-out feedback: one POST fans out to N skill_feedback_events rows (one per selected skill in dispatch)"
    - "Atomic counter update: single UPDATE persona_skills SET ... WHERE persona_id = $1 AND COALESCE(skill_id, skill_name) = ANY($2)"
    - "UX state machine: no thumbs (no dispatchId) → clickable thumbs (dispatchId present) → highlighted/disabled (feedbackSent set)"
    - "Relative fetch path /api/v1/feedback/:id — works in dev (vite proxy) and prod (served by same origin)"

key-files:
  created:
    - backend/src/routes/v1/feedback.ts
  modified:
    - backend/src/routes/v1/index.ts
    - admin/frontend/app/components/chat-panel.tsx

key-decisions:
  - "Fan-out per selected skill — one feedback event per skill for granular attribution, not one aggregate event per dispatch"
  - "COALESCE(skill_id, skill_name) = ANY($2) in UPDATE persona_skills — backwards compat with pre-Phase-31 rows where skill_name holds the skill id"
  - "dispatchId stored on ChatMessage in state only (not sessionStorage key) — no persistence needed, feedback buttons live only in current session"
  - "Thumbs hidden when dispatchId is null — correct absence when dispatch had no selected skills"

# Metrics
duration: 3min
completed: 2026-04-02
---

# Phase 34 Plan 02: Feedback API + Chat UI Summary

**POST /api/v1/feedback/:dispatchId endpoint fans out to skill_feedback_events + updates persona_skills counters; thumbs-up/down buttons on chat assistant messages after stream completes**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-02T18:04:27Z
- **Completed:** 2026-04-02T18:07:34Z
- **Tasks:** 2
- **Files created/modified:** 3

## Accomplishments

- Created `POST /api/v1/feedback/:dispatchId` endpoint on Brain v1 API:
  - Validates event_type (positive, negative, correction, retry, abandon, success)
  - Looks up dispatch in bridge_dispatch_log, returns 404 if not found
  - Fans out INSERT to skill_feedback_events for every selected skill
  - Batch-updates persona_skills: increments positive_feedback_count or negative_feedback_count, times_completed always incremented, effectiveness_score recomputed as positive/(positive+negative)
  - Returns 401 (UNAUTHORIZED) when no auth cookie present
- Updated `chat-panel.tsx`:
  - ChatMessage interface extended with `dispatchId` and `feedbackSent` fields
  - SSE done handler now captures `dispatch_id` from the done event and stores on the assistant message
  - `sendFeedback()` POSTs to Brain API via relative path, updates feedbackSent state on success
  - ThumbsUp/ThumbsDown buttons render below assistant messages that have a dispatchId
  - Clicking a thumb highlights it (green/red), disables both buttons, prevents double-submit
  - Messages without dispatchId (no skills dispatched) show no feedback buttons

## Task Commits

1. **Task 1: Feedback POST endpoint on Brain v1 API** - `a001c1f` (feat)
2. **Task 2: ThumbsUp/Down UI on chat assistant messages** - `064a927` (feat)

## Files Created/Modified

- `backend/src/routes/v1/feedback.ts` — New: POST /:dispatchId endpoint with fan-out + counter update logic
- `backend/src/routes/v1/index.ts` — Added import + registration of feedbackV1Routes at prefix /feedback
- `admin/frontend/app/components/chat-panel.tsx` — Extended ChatMessage type, capture dispatch_id from SSE, sendFeedback(), thumbs UI

## Decisions Made

- Fan-out per selected skill — creates one skill_feedback_events row per skill for granular attribution
- COALESCE(skill_id, skill_name) for backward compatibility with pre-Phase-31 persona_skills rows
- dispatchId lives only in React state (not sessionStorage) — feedback buttons are ephemeral, not needed after page reload
- Relative fetch path `/api/v1/feedback/${id}` works in both dev (Vite proxy) and production

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — endpoint auto-registered on service startup, no schema changes required (tables created in Plan 01).

## Next Phase Readiness

- Feedback events now flow end-to-end: user click → POST → skill_feedback_events INSERT + persona_skills UPDATE
- effectiveness_score is live in persona_skills — Plan 03 skill evolution can read it for threshold decisions
- FBK-03 Playwright test stub ready to enable (tests/skill-feedback.spec.js)

---
*Phase: 34-feedback-telemetry*
*Completed: 2026-04-02*
