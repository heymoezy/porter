# Phase 35: Agent Evolution Loop - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Feedback patterns drive concrete skill recommendations that admin can review and approve — closing the loop from "skill was used" to "skill inventory changed because of measured performance."

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. Key areas:
- Background job interval (6 hours per success criteria)
- skill_evolution_proposals table schema (proposed_change JSONB, reasoning, triggering_feedback_ids, status)
- Recommendation types: add skill, remove skill, rewrite prompt, enrich examples
- Admin UI for pending proposals with diffs and approve/reject buttons
- Evolution event log timeline
- Approval flow: updates persona_skills, regenerates SKILLS.md, logs event

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/services/skill-selector.ts` — Phase 33: selectSkills with scoring
- `backend/src/db/schema.ts` — persona_skills with effectiveness counters (Phase 34)
- `backend/src/routes/v1/feedback.ts` — Phase 34: feedback endpoint
- `backend/src/services/scheduler.ts` — existing background job system (if exists)
- `admin/backend/src/services/skill-library.ts` — skill pack management, SKILLS.md generation

### Integration Points
- Background job reads skill_feedback_events + persona_skills effectiveness data
- Proposals stored in new skill_evolution_proposals table
- Admin API for listing/approving/rejecting proposals
- Approval triggers persona_skills update + SKILLS.md regeneration via skill-library.ts

</code_context>

<specifics>
## Specific Ideas
No specific requirements — infrastructure phase.
</specifics>

<deferred>
## Deferred Ideas
None
</deferred>
