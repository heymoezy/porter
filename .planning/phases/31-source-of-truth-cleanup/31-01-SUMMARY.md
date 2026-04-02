---
phase: 31-source-of-truth-cleanup
plan: 01
subsystem: database
tags: [postgres, drizzle, migration, skills, junction-table]

# Dependency graph
requires: []
provides:
  - "template_skills junction table populated with 91 rows from JSONB arrays"
  - "persona_skills.skill_id column with 17 porter-core rows migrated"
  - "Idempotent migration script for reproducibility"
affects: [31-02, 31-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [separate migration file per feature, fuzzy skill matching]

key-files:
  created:
    - "backend/scripts/migrate-skills-sot.ts"
    - "backend/src/db/migrate-sot-v1.ts"
  modified:
    - "backend/src/db/schema.ts"
    - "backend/src/index.ts"

key-decisions:
  - "Used separate migration file (migrate-sot-v1.ts) following existing codebase pattern instead of modifying migrate-consolidated.ts"
  - "361 of 452 JSONB tags unmatched (short tags like 'react' vs skill IDs like 'frontend-dev') -- expected per plan context"

patterns-established:
  - "SOT migration pattern: idempotent DDL + data migration script as separate concerns"

requirements-completed: [SOT-01, SOT-02, SOT-05]

# Metrics
duration: 3min
completed: 2026-04-02
---

# Phase 31 Plan 01: Skills SOT Migration Summary

**Migrated skill assignments from JSONB arrays to junction table rows with skill_id FKs -- 91 template_skills rows and 17 persona_skills rows populated**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-02T12:24:55Z
- **Completed:** 2026-04-02T12:28:46Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added nullable skill_id column to persona_skills schema (Drizzle + DDL migration)
- Populated template_skills with 91 rows matched from 107 templates' JSONB skill arrays
- Migrated 17 persona_skills rows from skill_name to skill_id via exact/fuzzy matching
- Marked skillsText as DEPRECATED (SOT-05) in agentTemplates schema

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema update -- add skill_id to persona_skills** - `9e219ec` (feat)
2. **Task 2: Migration script -- populate template_skills and persona_skills.skill_id** - `30d39f9` (feat)

## Files Created/Modified
- `backend/src/db/schema.ts` - Added skillId column to personaSkills, marked skillsText deprecated
- `backend/src/db/migrate-sot-v1.ts` - Idempotent DDL migration for persona_skills.skill_id
- `backend/src/index.ts` - Registered migrate-sot-v1 in startup migration sequence
- `backend/scripts/migrate-skills-sot.ts` - One-shot migration script (100 lines)

## Decisions Made
- Used separate migration file (migrate-sot-v1.ts) instead of appending to migrate-consolidated.ts -- follows the established codebase pattern where each feature gets its own migration file with schema_migrations idempotency
- 361 of 452 JSONB tags remained unmatched because tags are short strings ("react", "typescript") that don't match skills.id slugs ("frontend-dev") -- this is expected per plan context (only 2 of 365 unique tags match exactly)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration file location**
- **Found during:** Task 1 (Schema update)
- **Issue:** Plan specified adding migration to migrate-consolidated.ts, but codebase uses separate migration files per feature (12 existing files)
- **Fix:** Created backend/src/db/migrate-sot-v1.ts following the established pattern (idempotency check, schema_migrations insert, transaction wrapper)
- **Files modified:** backend/src/db/migrate-sot-v1.ts, backend/src/index.ts
- **Verification:** tsc --noEmit passes, migration file follows same pattern as migrate-rpg-v1.ts
- **Committed in:** 9e219ec (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Migration file placement adjusted to match codebase convention. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- template_skills has 91 rows -- ready for Plan 02 (query layer) to read from junction tables
- persona_skills has skill_id populated for 17 rows -- ready for query refactoring
- 361 unmatched JSONB tags will need future attention (tag normalization or skill registry expansion)
- skills_text marked deprecated -- subsequent plans can safely ignore it

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 31-source-of-truth-cleanup*
*Completed: 2026-04-02*
