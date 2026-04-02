---
phase: 34-feedback-telemetry
plan: 03
subsystem: api, ui
tags: [fastify, react, postgres, react-query, skill-effectiveness, admin]

# Dependency graph
requires:
  - phase: 34-01
    provides: "persona_skills counter columns (times_selected, positive_feedback_count, negative_feedback_count, effectiveness_score)"
  - phase: 34-02
    provides: "Feedback API that writes to skill_feedback_events and updates persona_skills counters"
provides:
  - "GET /api/admin/skills/:id/effectiveness — per-skill data across all agents using that skill"
  - "GET /api/admin/agents/:id/skill-effectiveness — per-agent skill breakdown with feedback metrics"
  - "GET /api/admin/templates/:id/skill-effectiveness — aggregated effectiveness across spawned agents"
  - "SkillEffectivenessBar reusable component — renders score bar, percentage, and counts"
  - "Skill Pack Explorer shows Skill Effectiveness section with per-agent breakdown"
  - "Agent detail skills tab shows per-skill effectiveness section"
  - "Agent/template detail build tab shows template aggregated effectiveness"
affects: [phase-35, skill-quality, admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Effectiveness sub-routes registered before generic /:id route to avoid Fastify param shadowing"
    - "SkillEffectivenessBar accepts score=null and renders 'No data' — safe for empty persona_skills state"
    - "Template effectiveness SQL uses LEFT JOIN personas + persona_skills to aggregate across all spawned instances"
    - "Agent detail page handles both isInstance and template views in one component"

key-files:
  created:
    - admin/frontend/app/components/skill-effectiveness-bar.tsx
    - .planning/phases/34-feedback-telemetry/34-03-SUMMARY.md
  modified:
    - admin/backend/src/routes/skills.ts
    - admin/backend/src/routes/agents.ts
    - admin/backend/src/routes/templates.ts
    - admin/frontend/app/routes/skill-pack-explorer.tsx
    - admin/frontend/app/routes/agent-detail.tsx

key-decisions:
  - "Template effectiveness placed in BUILD tab of agent-detail.tsx (not SOUL tab) — BUILD tab is the data-driven view, logical home for aggregated metrics"
  - "Agent effectiveness added to skills-tab alongside skill toggle list — contextually adjacent to the skills it describes"
  - "FBK-04 test stubs expect camelCase keys (skillId, agentId, templateId) but plan spec uses snake_case — left as snake_case per plan; note for future test enablement"
  - "Skill effectiveness section rendered unconditionally when !isInstance — shows 'No feedback data yet' placeholder when template_skills is empty"

patterns-established:
  - "EffectivenessBar pattern: compact=true for inline badge use, compact=false (default) for full bar with counts"
  - "Standalone effectiveness sections always placed AFTER primary data tables/lists, never embedded inside"

requirements-completed: [FBK-04, FBK-05]

# Metrics
duration: 11min
completed: 2026-04-02
---

# Phase 34 Plan 03: Effectiveness API Endpoints + Admin UI Summary

**Three admin effectiveness API endpoints + SkillEffectivenessBar component wired into skill, agent, and template detail pages**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-02T18:09:58Z
- **Completed:** 2026-04-02T18:20:58Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added three admin effectiveness API endpoints querying persona_skills counters from Phase 34-01
- Created reusable SkillEffectivenessBar component (bar + %, count display, null-safe "No data")
- Wired effectiveness into Skill Pack Explorer, Agent detail (skills tab), and template build tab
- Backend compiles clean, frontend builds clean, live API returns correct JSON shapes

## Task Commits

1. **Task 1: Admin effectiveness API endpoints + reusable UI component** - `5824052` (feat)
2. **Task 2: Wire effectiveness into skill detail, agent detail, and template detail pages** - `16743bd` (feat)

## Files Created/Modified
- `admin/backend/src/routes/skills.ts` — Added `GET /:id/effectiveness` before generic `/:id` route
- `admin/backend/src/routes/agents.ts` — Added `GET /:id/skill-effectiveness` before generic `/:id` route
- `admin/backend/src/routes/templates.ts` — Added `GET /:id/skill-effectiveness` before generic `/:id` route
- `admin/frontend/app/components/skill-effectiveness-bar.tsx` — New reusable bar component
- `admin/frontend/app/routes/skill-pack-explorer.tsx` — Added effectiveness query + section below diagnostics
- `admin/frontend/app/routes/agent-detail.tsx` — Added agent + template effectiveness queries and sections

## Decisions Made
- Template effectiveness placed in BUILD tab of `agent-detail.tsx` (not SOUL tab) — BUILD tab is the data-driven view and logical home for aggregated metrics
- Agent effectiveness added to the skills-tab alongside the skill toggle list — contextually adjacent
- FBK-04 Playwright test stubs expect camelCase keys (`skillId`, `agentId`, `templateId`) but plan spec defines snake_case (`skill_id`, `agent_id`, `template_id`); left as snake_case per plan spec, will need test update when enabling FBK-04

## Deviations from Plan

None - plan executed exactly as written. The only notable observation: `template-detail.tsx` is a redirect to `agent-detail.tsx`, so all template effectiveness UI was added to `agent-detail.tsx` (which already handles both template and instance views). This matches the plan's intent.

## Issues Encountered
- `porter-admin.service` systemd file points to old path `/home/lobster/documents/porter/` — admin backend started manually from correct path `/home/lobster/projects/porter/admin/backend/` for verification. Pre-existing issue, not caused by this plan.

## Next Phase Readiness
- All three effectiveness endpoints live and returning correct JSON
- SkillEffectivenessBar component ready to reuse anywhere in admin
- FBK-04 and FBK-05 test stubs are in place; enable after confirming key names (camelCase vs snake_case)
- Phase 34-04 (score evolution/auto-adjustment) can now read the populated effectiveness_score values

---
*Phase: 34-feedback-telemetry*
*Completed: 2026-04-02*
