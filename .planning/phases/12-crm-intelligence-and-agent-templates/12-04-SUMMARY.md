---
phase: 12-crm-intelligence-and-agent-templates
plan: "04"
subsystem: api
tags: [agent-templates, seed-data, typescript, sqlite, fastify]

requires:
  - phase: 12-01
    provides: agent_templates table schema and personas.template_id column

provides:
  - GET /api/v1/templates with category, tag, and search filtering
  - GET /api/v1/templates/:id for full template detail
  - POST /api/v1/templates/:id/instantiate creating fully configured agents with .md files
  - 103 agent templates (100 user-visible + 3 internal) across 10 categories
  - seed-templates.ts seedTemplates() function, idempotent, transaction-wrapped

affects: [frontend-v2, agent-creation-flows, phase-13]

tech-stack:
  added: []
  patterns:
    - "insertTemplate() helper wrapping raw sqlite.prepare() for batch seed inserts"
    - "sqlite.transaction() wrapping all seed INSERTs for atomic seed or nothing"
    - "Idempotency guard: SELECT COUNT(*) >= 100 returns early on re-run"
    - "probeBackend() + getBackendUrl() for dependency validation before instantiation"
    - "Persona .md file rollback on fs.writeFile failure to prevent partial agents"

key-files:
  created:
    - backend/src/routes/v1/templates.ts
    - backend/src/db/seed-templates.ts
  modified:
    - backend/src/routes/v1/index.ts
    - backend/src/db/migrate-12.ts

key-decisions:
  - "103 templates total: 100 user-visible across 10 categories + 3 is_internal=1 system templates (CRM sweeper, analytics collector, maintenance)"
  - "seedTemplates() called from migrate-12.ts after migration record insert — runs on first migration, idempotent thereafter"
  - "Instantiation returns 422 MISSING_DEPENDENCIES with specific missing_backends/missing_tools arrays — strict validation, no partial agents"
  - "Persona .md files rolled back (DELETE persona row) if any fs.writeFile fails — locked decision from plan"

patterns-established:
  - "Template seed pattern: insertTemplate() helper + sqlite.transaction() + idempotency check"
  - "Dependency probe: probeBackend(url) for backend availability, workspace_connections for tool availability"

requirements-completed: [TMPL-01, TMPL-02, TMPL-03]

duration: 25min
completed: 2026-03-22
---

# Phase 12 Plan 04: Agent Template Catalog Summary

**Fastify templates API with 103 agent templates (100 user-visible + 3 internal) across 10 categories, with one-call instantiation that probes dependencies, creates the persona row, and writes SOUL/ROLE_CARD/IDENTITY/SKILLS .md files atomically**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-22T17:00:00Z
- **Completed:** 2026-03-22T17:25:00Z
- **Tasks:** 2 (Task 1 from prior session, Task 2 this session)
- **Files modified:** 4

## Accomplishments

- Template catalog API: GET list with category/tag/search filtering, GET detail, POST instantiate
- 103 fully-populated templates — every template has non-empty system_prompt, soul_text, role_card_text, identity_text, skills_text
- Instantiation validates required_backends (probeBackend) and required_tools (workspace_connections) before creating agent; returns 422 with specific missing items
- Instantiation writes 4 .md files to personas/<agentId>/ and rolls back persona row if any file write fails
- seedTemplates() wired into migrate-12.ts — seeds on first migration run, idempotent on re-runs

## Task Commits

1. **Task 1: Templates API route** - `b728db3` (feat)
2. **Task 2: seed-templates.ts + migrate-12 wiring** - `54d0fa0` (feat)

## Files Created/Modified

- `backend/src/routes/v1/templates.ts` - GET list/detail, POST instantiate with dependency validation and .md file creation
- `backend/src/routes/v1/index.ts` - templateV1Routes registered at /templates
- `backend/src/db/seed-templates.ts` - 103 templates via insertTemplate() helper, sqlite.transaction()
- `backend/src/db/migrate-12.ts` - seedTemplates() import and call after migration record

## Decisions Made

- 103 templates (plan asked for 100 minimum): 3 extra are is_internal=1 system templates for CRM sweep, analytics, and maintenance
- seedTemplates() called in migrate-12.ts (not a separate migration step) — simpler, runs exactly once on fresh DB, idempotent via COUNT check
- Template categories: engineering(15), design(10), content(12), research(10), business(10), creative(8), support(8), legal(6), data-ai(8), domain(13)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Template API is fully functional; frontend-v2 can now render template catalog and instantiate agents
- Phase 13 (autonomous research agents) can use templates as agent type definitions
- The 3 is_internal=1 templates (sys-crm-sweeper, sys-analytics-agent, sys-maintenance) are ready to be instantiated by the platform on workspace bootstrap

---
*Phase: 12-crm-intelligence-and-agent-templates*
*Completed: 2026-03-22*
