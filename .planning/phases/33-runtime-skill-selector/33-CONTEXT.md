# Phase 33: Runtime Skill Selector - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Porter selects the right skills at dispatch time — gathering assigned skills, ranking them against the task, injecting only the top matches into the prompt, and logging what was used and why.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key areas:
- Skill ranking algorithm (keyword matching, embedding similarity, or hybrid)
- Prompt injection placement (between memory tiers and gateway instructions per success criteria)
- Logging format for skills_used JSONB column
- Performance thresholds for skill selection (must not add significant latency to dispatch)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/services/ai-router.ts` — current dispatch routing logic
- `backend/src/services/stream-service.ts` — streaming dispatch with dynamic system prompt
- `backend/src/services/memory-injection.ts` — tiered memory injection pipeline (directives → concepts → episodes)
- `backend/src/db/schema.ts` — template_skills and persona_skills junction tables (Phase 31 SOT)
- `admin/backend/src/services/skill-library.ts` — skill pack reading, diagnostics

### Established Patterns
- Drizzle ORM for DB queries
- JSONB columns for structured logging (bridge_dispatch_log)
- Memory injection tiers with token budgets

### Integration Points
- Skill injection must slot into the existing system prompt pipeline in stream-service.ts
- bridge_dispatch_log needs skills_used JSONB column migration
- persona_skills.skill_id is the canonical lookup key (Phase 31)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>
