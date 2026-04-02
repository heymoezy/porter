---
phase: 31-source-of-truth-cleanup
plan: 02
subsystem: api
tags: [skills, manifest, forge, instantiation, template-skills, persona-skills]

# Dependency graph
requires:
  - "31-01: template_skills populated with 91 rows, persona_skills.skill_id column added"
provides:
  - "skills-manifest.ts service generating thin SKILLS.md from DB data"
  - "Instantiation flow writing persona_skills with skill_id from template_skills"
  - "Forge Station 2 (both files) using skill_id and generating manifests"
  - "No code path reads skills_text during instantiation or forge"
affects: [31-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [DB-driven manifest generation, junction-table-first skill reading]

key-files:
  created:
    - "backend/src/services/skills-manifest.ts"
  modified:
    - "backend/src/routes/v1/templates.ts"
    - "backend/src/services/forge.ts"
    - "backend/src/services/admin/forge.ts"

key-decisions:
  - "Removed JSONB fallback for skills in all three files -- template_skills is now the only source"
  - "Kept JSONB fallback for tools in templates.ts since tool migration is out of scope for this plan"
  - "Used skill_id as both skill_name and skill_id in persona_skills INSERT (skill_id is the canonical identifier)"

patterns-established:
  - "Skill manifest generation: query persona_skills JOIN skills, group by category, write thin markdown"
  - "Instantiation pattern: read junction -> insert persona_skills -> generate manifest (no prose copy)"

requirements-completed: [SOT-03, SOT-04]

# Metrics
duration: 5min
completed: 2026-04-02
---

# Phase 31 Plan 02: Skills SOT Query Layer Summary

**Rewrote instantiation and forge Station 2 to use template_skills as canonical source, write persona_skills with skill_id, and generate SKILLS.md as a thin DB-driven manifest**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-02T12:30:50Z
- **Completed:** 2026-04-02T12:36:11Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created skills-manifest.ts service with generateSkillsManifest and writeSkillsManifest functions
- Rewrote templates.ts instantiation to read template_skills (no JSONB fallback), insert persona_skills with skill_id, and generate SKILLS.md from DB
- Updated forge.ts Station 2 to use template_skills junction, write skill_id, and generate manifest after station advance
- Updated admin/forge.ts Station 2 with same pattern using queryOne/execute helpers

## Task Commits

Each task was committed atomically:

1. **Task 1: Create skills-manifest.ts service** - `5de9558` (feat)
2. **Task 2: Rewrite instantiation and forge Station 2** - `e9156d7` (feat)

## Files Created/Modified
- `backend/src/services/skills-manifest.ts` - New service: generateSkillsManifest (DB query + markdown) and writeSkillsManifest (disk writer)
- `backend/src/routes/v1/templates.ts` - Instantiation reads template_skills, inserts persona_skills with skill_id, generates manifest instead of copying skills_text
- `backend/src/services/forge.ts` - Station 2 reads template_skills junction, writes skill_id to persona_skills, generates manifest
- `backend/src/services/admin/forge.ts` - Station 2 same pattern using pg-helpers, writes skill_id, generates manifest

## Decisions Made
- Removed JSONB fallback for skills in all three files -- template_skills junction table is now the sole source of truth for skill assignments. This is the core behavioral change Plan 02 exists to make.
- Kept JSONB fallback for tools in templates.ts since tool migration is a separate concern not covered by this plan.
- Used skill_id as both the skill_name and skill_id values in persona_skills INSERT, since the canonical identifier IS the skill_id slug (e.g., "frontend-dev") and the skill_name column is deprecated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Null check for agent_id in forge files**
- **Found during:** Task 2 (forge Station 2 rewrite)
- **Issue:** PipelineItem.agent_id is typed as `string | null`, but writeSkillsManifest requires `string` -- TypeScript compilation failed
- **Fix:** Wrapped writeSkillsManifest calls in `if (item.agent_id)` null guard in both forge.ts and admin/forge.ts
- **Files modified:** backend/src/services/forge.ts, backend/src/services/admin/forge.ts
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** e9156d7 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type safety fix required by existing schema. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All instantiation and forge paths now use template_skills as canonical source
- persona_skills rows are written with skill_id on every new agent creation
- SKILLS.md is generated from DB data, not from skills_text prose
- Ready for Plan 03 to address any remaining skills_text references and cleanup

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 31-source-of-truth-cleanup*
*Completed: 2026-04-02*
