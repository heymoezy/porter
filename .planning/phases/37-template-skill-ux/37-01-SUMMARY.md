---
phase: 37-template-skill-ux
plan: 01
subsystem: api
tags: [postgres, fastify, typescript, template-skills, migration]

# Dependency graph
requires:
  - phase: 36-skill-quality
    provides: quality_tier and quality_score columns on skills table used in GET /:id/skills JOIN
  - phase: 33-skill-runtime-selection
    provides: scoreSkill pure function logic (replicated inline for preview endpoint)

provides:
  - migrate-tux-v1.ts migration adding is_mandatory + assignment_rationale to template_skills
  - GET /api/admin/templates/:id/skills — assigned skills with quality metadata
  - POST /api/admin/templates/:id/skills — attach skill with auto sort_order
  - DELETE /api/admin/templates/:id/skills/:skillId — detach + re-normalize sort_order
  - PATCH /api/admin/templates/:id/skills/:skillId — update mandatory flag, rationale, order
  - POST /api/admin/templates/:id/skills-preview — rank assigned skills against sample prompt

affects: [38-adaptive-agent-context, template-skill-ux-frontend, admin-templates-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migration ID 037_template_skill_ux follows sequential 03N_ prefix convention"
    - "Preview endpoint uses hyphenated path (skills-preview) to avoid param collision with skills/:skillId"
    - "Inline scoreSkill replication avoids cross-service imports in admin backend"
    - "PATCH uses dynamic SET clause builder — only updates fields present in request body"

key-files:
  created:
    - backend/src/db/migrate-tux-v1.ts
  modified:
    - backend/src/db/schema.ts
    - backend/src/index.ts
    - admin/backend/src/routes/templates.ts

key-decisions:
  - "Preview endpoint path is /:id/skills-preview (hyphenated) not /:id/skills/preview to avoid Fastify param shadowing with /:id/skills/:skillId"
  - "scoreSkill replicated inline in admin backend — no cross-service import between admin/backend and backend/"
  - "Mandatory skills (is_mandatory=1) always included in preview selected list regardless of score"
  - "execute import added to admin/backend/src/db/pg.ts import — was missing from initial templates.ts import line"

patterns-established:
  - "TUX endpoints registered before GET /:id — prevents Fastify wildcard shadowing sub-routes"
  - "Preview endpoint reads tags/triggers from SKILLS_ROOT/skill_id/meta/skill.json with silent fallback"
  - "Sort order re-normalization uses ROW_NUMBER() OVER (ORDER BY sort_order) - 1 pattern"

requirements-completed: [TUX-01, TUX-02, TUX-03, TUX-05]

# Metrics
duration: 10min
completed: 2026-04-03
---

# Phase 37 Plan 01: Template Skill UX — Backend Foundation Summary

**PostgreSQL migration + 5 admin CRUD/preview endpoints for template skill assignment management, with inline scoreSkill scoring and mandatory-skill logic**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-03T01:48:00Z
- **Completed:** 2026-04-03T01:50:36Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Migration `037_template_skill_ux` adds `is_mandatory` and `assignment_rationale` columns to `template_skills` via idempotent ALTER TABLE
- Schema.ts updated with `isMandatory` and `assignmentRationale` Drizzle fields
- 5 new admin API endpoints on `/api/admin/templates/:id/skills*` covering full CRUD plus ranked preview
- Preview endpoint reads skill meta from disk and applies inline scoreSkill logic; mandatory skills always surface in selected list
- Both backend and admin/backend compile with zero TypeScript errors

## Task Commits

1. **Task 1: DB migration + schema update** - `b201990` (feat)
2. **Task 2: Five template skill API endpoints** - `6570be2` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `backend/src/db/migrate-tux-v1.ts` — New migration file, migrateTuxV1 export, ID 037_template_skill_ux
- `backend/src/db/schema.ts` — Added isMandatory and assignmentRationale to templateSkills table definition
- `backend/src/index.ts` — Import and call migrateTuxV1 after migrateEvoV1 in startup sequence
- `admin/backend/src/routes/templates.ts` — 5 new endpoints + scoreSkillInline helper + SCORE_THRESHOLD/MAX_SELECTED constants

## Decisions Made

- Preview uses `/skills-preview` (hyphenated) path to avoid Fastify route param collision with `/:id/skills/:skillId`
- `execute` was missing from the pg import line in templates.ts — added as Rule 1 auto-fix during verify step
- scoreSkill replicated inline rather than imported from backend/ — avoids cross-package coupling in admin monorepo
- Mandatory skills always included in preview `selected` array regardless of score threshold

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing `execute` import in templates.ts**
- **Found during:** Task 2 verification (tsc --noEmit)
- **Issue:** templates.ts used `execute()` from pg.ts but import only listed `queryAll, queryOne`
- **Fix:** Added `execute` to the import statement from `../db/pg.js`
- **Files modified:** admin/backend/src/routes/templates.ts
- **Verification:** npx tsc --noEmit returned zero errors after fix
- **Committed in:** 6570be2 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (missing import)
**Impact on plan:** Necessary for compilation. No scope creep.

## Issues Encountered

None beyond the missing import auto-fix above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 37 Plan 02 (frontend) can now implement the template skill authoring UI against these endpoints
- All 5 endpoints are live and type-safe; preview endpoint ready for skill curation workflows
- Migration will run automatically on next backend restart

---
*Phase: 37-template-skill-ux*
*Completed: 2026-04-03*
