---
phase: 25-rpg-engine
plan: "02"
subsystem: api
tags: [rpg, agent-stats, admin-api, filesystem, postgres]

requires:
  - phase: 25-01
    provides: recalculateStats, getRpgStats, checkProgression, awardXP in rpg-engine.ts

provides:
  - regenerateMdFiles() exported from rpg-engine.ts — writes SOUL/IDENTITY/SKILLS/TOOLS.md from DB state
  - GET /api/admin/agents/:id/rpg-stats — returns cached agent_rpg_stats row
  - POST /api/admin/agents/:id/rpg-recalculate — triggers recalculateStats() on demand

affects: [25-03, 26-forge, 27-character-sheet, 28-battle-arena]

tech-stack:
  added: []
  patterns:
    - "Trigger-based .md regeneration — only write files relevant to the event type (star_up, level_milestone, skill_change, equipment_change, full)"
    - "Fire-safe async functions — all exported functions catch errors and never throw"
    - "Admin RPG endpoints: GET for cache read, POST for on-demand recalc"

key-files:
  created: []
  modified:
    - backend/src/services/rpg-engine.ts
    - backend/src/routes/admin/agents.ts

key-decisions:
  - "regenerateMdFiles uses trigger-based routing — star_up writes SOUL.md, level_milestone writes IDENTITY.md only at level multiples of 10, skill_change writes SKILLS.md, equipment_change writes TOOLS.md, full writes all four"
  - "Applied RPG routes to backend/src/routes/admin/agents.ts not v1/admin/agents.ts — the former is the live-served route (auto-fixed plan path error)"

patterns-established:
  - "Pattern: agent identity files are DB-derived, regenerated on specific progression events, never hand-edited by the RPG system"

requirements-completed: [MD-01, MD-02, MD-03, MD-04, MD-05]

duration: 5min
completed: 2026-04-01
---

# Phase 25 Plan 02: RPG Engine MD File Regeneration + Admin Endpoints Summary

**regenerateMdFiles() writes DB-derived SOUL/IDENTITY/SKILLS/TOOLS.md on progression events; two admin endpoints expose RPG stats reads and on-demand recalculation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-01T07:07:07Z
- **Completed:** 2026-04-01T07:12:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `regenerateMdFiles(templateId, trigger)` to rpg-engine.ts — fetches agent_templates, agent_rpg_stats, and template_skills from DB, writes SOUL/IDENTITY/SKILLS/TOOLS.md based on trigger type
- Added `GET /api/admin/agents/:id/rpg-stats` — reads cached stats row or returns null-with-message
- Added `POST /api/admin/agents/:id/rpg-recalculate` — triggers full recalculateStats() and returns updated stats
- Zero TypeScript errors throughout, service restarts clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Add regenerateMdFiles() to rpg-engine.ts** - `2af4a07` (feat)
2. **Task 2: Add rpg-stats and rpg-recalculate admin endpoints** - `5469a83` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `backend/src/services/rpg-engine.ts` - Added fs/path/config imports + regenerateMdFiles() (240 lines)
- `backend/src/routes/admin/agents.ts` - Added rpg-engine import + 2 route handlers

## Decisions Made
- `regenerateMdFiles` uses trigger-based routing so callers (awardXP, checkProgression hooks) can be precise — no unnecessary file I/O
- IDENTITY.md only written on level_milestone when level is a multiple of 10, or trigger==='full'
- Entire function wrapped in try/catch with `[rpg-engine:md]` log prefix — fire-safe, callers never need to handle errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Applied routes to correct admin file (routes/admin/agents.ts not v1/admin/agents.ts)**
- **Found during:** Task 2 (adding RPG admin endpoints)
- **Issue:** Plan specified `backend/src/routes/v1/admin/agents.ts` but the app mounts `backend/src/routes/admin/index.ts` at `/api/admin` — v1/admin routes are not served
- **Fix:** Applied import and two route handlers to `backend/src/routes/admin/agents.ts` (the correct live-served file). Reverted incidental changes to v1/admin/agents.ts.
- **Files modified:** backend/src/routes/admin/agents.ts
- **Verification:** `curl /api/admin/agents/test/rpg-stats` returned expected JSON after auth
- **Committed in:** 5469a83 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - wrong file path in plan)
**Impact on plan:** Necessary correction — without this fix the endpoints would never be reachable. No scope creep.

## Issues Encountered
None beyond the path deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- rpg-engine.ts is complete: recalculateStats, awardXP, checkProgression, getRpgStats, regenerateMdFiles all exported
- Admin can read and recalculate RPG stats via API
- Phase 25-03 (hook rpg-engine into dispatch pipeline) can proceed
- Phase 27 Character Sheet UI has the endpoint it needs: `GET /api/admin/agents/:id/rpg-stats`

---
*Phase: 25-rpg-engine*
*Completed: 2026-04-01*
