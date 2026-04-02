# Phase 34: Feedback Telemetry - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Every dispatch outcome produces a structured feedback signal linked to the skills that were used — enabling per-skill effectiveness measurement that actually means something.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. Key areas:
- skill_feedback_events table schema (persona_id, skill_id, dispatch_id, event_type, note)
- Feedback event types: positive/negative/correction/retry/abandon/success
- Thumbs up/down creates feedback events for all active skills in that dispatch
- Aggregated stats on persona_skill rows: times_selected, times_completed, positive/negative counts, effectiveness_score
- API endpoints: GET /api/admin/skills/:id/effectiveness, GET /api/admin/agents/:id/skill-effectiveness
- Admin UI surfaces for effectiveness data (skill detail, agent detail, template detail pages)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/services/skill-selector.ts` — Phase 33: selectSkills(), SkillSelectionResult with candidates/selected/scores
- `backend/src/services/bridge/routing-engine.ts` — logDispatch with skills_used JSONB
- `backend/src/db/schema.ts` — persona_skills with skill_id, bridge_dispatch_log with skills_used
- `admin/backend/src/routes/skills.ts` — existing skills API routes
- `admin/frontend/app/routes/skill-pack-explorer.tsx` — Phase 32 skill detail page

### Established Patterns
- Drizzle ORM for DB schema and queries
- JSONB columns for structured data
- Admin API with requirePlatformAdmin auth
- React Query for frontend data fetching

### Integration Points
- skill_feedback_events table needs foreign keys to skills, personas, bridge_dispatch_log
- Aggregated stats can be computed on-read or maintained as triggers/materialized
- Chat response thumbs up/down needs to create feedback events
- effectiveness_score feeds back into skill-selector.ts ranking (Phase 33 already has historical_success placeholder)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>
