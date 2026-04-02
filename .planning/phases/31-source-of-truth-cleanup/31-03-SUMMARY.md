---
phase: 31-source-of-truth-cleanup
plan: 03
subsystem: api
tags: [skills, toggle, delete, manifest-regeneration, rpg-engine, skill-id, SOT-06]

# Dependency graph
requires:
  - "31-01: persona_skills.skill_id column added, template_skills populated"
  - "31-02: skills-manifest.ts service with writeSkillsManifest function"
provides:
  - "Toggle endpoint uses skill_id with skill_name fallback and triggers SKILLS.md regeneration"
  - "Delete endpoint finds affected personas and regenerates manifests before cleanup"
  - "v1/admin/skills.ts delete now cleans up junction tables (persona_skills, template_skills)"
  - "rpg-engine SKILLS.md generation JOINs to skills table via skill_id for enriched output"
  - "Any skill assignment mutation (toggle, delete) triggers manifest regeneration (SOT-06)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [mutation-triggers-regeneration, skill_id-with-fallback, enriched-manifest-from-join]

key-files:
  created: []
  modified:
    - "backend/src/routes/admin/skills.ts"
    - "backend/src/routes/v1/admin/skills.ts"
    - "backend/src/services/rpg-engine.ts"

key-decisions:
  - "Toggle endpoint accepts skill_id param with OR skill_name fallback for backwards compatibility during transition"
  - "v1/admin/skills.ts delete endpoint now properly cascades through persona_skills and template_skills before removing the skill"
  - "v1/admin/skills.ts toggle (skill registry enabled state) also regenerates manifests for affected personas"
  - "rpg-engine query fixed from nonexistent skill_name column to actual skill_id column with LEFT JOIN to skills table"

patterns-established:
  - "Mutation-triggers-regeneration: any persona_skills or skill registry mutation triggers writeSkillsManifest for affected personas"
  - "Enriched manifest: SKILLS.md includes skill_id, display name, description, pack path, and RPG stats"

requirements-completed: [SOT-06]

# Metrics
duration: 3min
completed: 2026-04-02
---

# Phase 31 Plan 03: Skills SOT API + RPG Engine Summary

**Updated toggle/delete endpoints to use skill_id and trigger SKILLS.md regeneration on every assignment mutation, aligned rpg-engine manifest output with enriched skill_id JOIN**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-02T12:38:31Z
- **Completed:** 2026-04-02T12:42:15Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Toggle endpoint now uses skill_id (with skill_name fallback) and regenerates SKILLS.md after toggling
- Delete endpoint finds affected personas before deletion and regenerates manifests for each
- v1/admin/skills.ts delete now properly cleans up persona_skills and template_skills junction rows (was only deleting from skills table)
- rpg-engine SKILLS.md generation JOINs template_skills to skills registry for enriched output (display name, description, pack path)
- Fixed stale skill_name column reference in rpg-engine query (column was renamed to skill_id in template_skills)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update toggle and delete endpoints with skill_id + regeneration** - `b726d13` (feat)
2. **Task 2: Align rpg-engine SKILLS.md generation with skill_id** - `0acbf73` (feat)

## Files Created/Modified
- `backend/src/routes/admin/skills.ts` - Added writeSkillsManifest import, toggle uses skill_id with fallback, delete finds affected personas and regenerates manifests
- `backend/src/routes/v1/admin/skills.ts` - Added writeSkillsManifest import, delete cascades through junction tables with regeneration, toggle regenerates for affected personas
- `backend/src/services/rpg-engine.ts` - Skill query JOINs to skills table via skill_id, SKILLS.md output includes enriched data (display name, description, pack path)

## Decisions Made
- Toggle endpoint uses `OR skill_name` fallback to avoid breaking legacy persona_skills rows that only have skill_name populated (transition period)
- v1/admin/skills.ts delete was missing junction table cleanup entirely -- added persona_skills and template_skills deletion with manifest regeneration (Rule 1: bug fix)
- v1/admin/skills.ts toggle (which toggles the skills registry enabled state) also regenerates manifests, since disabling a skill globally affects all personas using it
- rpg-engine query used nonexistent `skill_name` column on template_skills (table only has `skill_id`) -- fixed with LEFT JOIN to skills for enriched data

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] v1/admin/skills.ts delete missing junction table cleanup**
- **Found during:** Task 1 (endpoint updates)
- **Issue:** v1/admin/skills.ts DELETE only removed from skills table, leaving orphaned persona_skills and template_skills rows
- **Fix:** Added persona_skills and template_skills deletion before skills deletion, with affected persona discovery and manifest regeneration
- **Files modified:** backend/src/routes/v1/admin/skills.ts
- **Verification:** npx tsc --noEmit passes clean
- **Committed in:** b726d13 (Task 1 commit)

**2. [Rule 2 - Missing Critical] v1/admin/skills.ts toggle missing manifest regeneration**
- **Found during:** Task 1 (endpoint updates)
- **Issue:** Toggling a skill's enabled state in the registry affects all personas using that skill, but no manifest regeneration was triggered
- **Fix:** Added affected persona discovery and writeSkillsManifest call after toggle
- **Files modified:** backend/src/routes/v1/admin/skills.ts
- **Verification:** npx tsc --noEmit passes clean
- **Committed in:** b726d13 (Task 1 commit)

**3. [Rule 1 - Bug] rpg-engine queried nonexistent skill_name column**
- **Found during:** Task 2 (rpg-engine alignment)
- **Issue:** template_skills table has `skill_id` column, not `skill_name` -- the old query `SELECT skill_name` would fail at runtime
- **Fix:** Updated query to `SELECT ts.skill_id` with LEFT JOIN to skills table
- **Files modified:** backend/src/services/rpg-engine.ts
- **Verification:** npx tsc --noEmit passes clean, column verified against actual table schema
- **Committed in:** 0acbf73 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical)
**Impact on plan:** All fixes directly related to SOT-06 goal (any skill change triggers regeneration). v1 endpoint cleanup was necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All skill assignment mutations (toggle, delete) now trigger SKILLS.md regeneration
- rpg-engine SKILLS.md is consistent with skills-manifest.ts format
- Phase 31 (Source of Truth Cleanup) is now complete: migration done (Plan 01), query layer done (Plan 02), API + RPG engine done (Plan 03)
- SOT-06 (regeneration triggers) satisfied across all mutation paths

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 31-source-of-truth-cleanup*
*Completed: 2026-04-02*
