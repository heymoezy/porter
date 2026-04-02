# Phase 37: Template Skill UX - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Template detail view is the command center for skill configuration — showing what's assigned, why, how effective each skill is, and letting admin author the skill loadout with priorities and auto-detect settings.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — frontend phase. Key areas:
- Template detail skills section layout (table or card grid)
- Drag-and-drop or manual sort for skill reordering
- Mandatory vs optional skill toggle per assignment
- Aggregated effectiveness display across all spawned agents
- Preview feature: show which skills would auto-select for a sample task prompt
- API endpoints for skill assignment CRUD on templates

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `admin/frontend/app/components/skill-quality-badge.tsx` — Phase 32/36: quality tier badges
- `admin/frontend/app/components/skill-effectiveness-bar.tsx` — Phase 34: effectiveness visualization
- `admin/backend/src/routes/skills.ts` — existing skill CRUD + toggle endpoints
- `backend/src/db/schema.ts` — template_skills junction table (Phase 31)

### Integration Points
- Template detail page needs skills section with assignment management
- template_skills table already exists but may need priority/mandatory columns
- Aggregated effectiveness queries across persona_skills for all instances of a template
- Preview uses selectSkills() from Phase 33 with a mock task prompt

</code_context>

<specifics>
## Specific Ideas
No specific requirements — frontend phase.
</specifics>

<deferred>
## Deferred Ideas
None
</deferred>
