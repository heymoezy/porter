---
phase: 26-forge-unification
plan: "02"
subsystem: ui
tags: [react, react-router, sidebar, tabs, forge, skills, tools]

# Dependency graph
requires: []
provides:
  - "Forge nav item (Agents group: 3 items — Forge, Org Chart, Email)"
  - "4-tab Forge page: Templates, Armory, Workshop, Arena"
  - "Armory tab absorbs skills + tools content inline"
  - "WorkshopPlaceholder ready for Plan 03 to fill"
  - "/skills and /tools redirect to /forge"
affects: [26-03-workshop, 28-battle-arena]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Tab-based page shell for multi-function admin pages", "Inline component absorption — copy content from old page into new tab without deleting source files"]

key-files:
  created:
    - admin/frontend/app/routes/skills-redirect.tsx
    - admin/frontend/app/routes/tools-redirect.tsx
  modified:
    - admin/frontend/app/components/layout/sidebar.tsx
    - admin/frontend/app/routes/forge.tsx
    - admin/frontend/app/routes.ts

key-decisions:
  - "Skills and Tools are absorbed into Armory tab inline (not imported as components) — keeps forge.tsx self-contained"
  - "AgentPresenceSummary omitted from Armory tab (page-level concern, not tab-level)"
  - "Arena tab disabled with opacity-50 — not yet buildable, placeholder only"
  - "Original skills.tsx and tools.tsx preserved as source reference — not deleted"

patterns-established:
  - "Tab shell pattern: Tabs wraps flex-1 flex-col, TabsContent uses flex-1 overflow-y-auto mt-0"
  - "Redirect pattern: Navigate to=/forge replace in a tiny stub route file"

requirements-completed: [FRG-01, FRG-02, FRG-03, FRG-04, FRG-07]

# Metrics
duration: 6min
completed: 2026-04-01
---

# Phase 26 Plan 02: Forge Unification — Nav Merge + 4-Tab Shell Summary

**Admin sidebar merged to 3-item Agents group (Forge, Org Chart, Email); forge.tsx rewritten as 4-tab shell (Templates/Armory/Workshop/Arena) absorbing skills and tools content inline**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-01T07:32:59Z
- **Completed:** 2026-04-01T07:38:00Z
- **Tasks:** 4
- **Files modified:** 5 (3 modified, 2 created)

## Accomplishments

- Sidebar Agents group reduced from 5 items to 3 (Forge, Org Chart, Email); "Agent Forge" renamed to "Forge"
- forge.tsx fully rewritten with 4-tab Tabs shell — Templates tab preserves all existing forge content (conveyor, queue, catalog)
- Armory tab absorbs ToolsContent (server tools, runtime tools, connections) and SkillsContent (skills registry with toggle) inline as ArmoryTools + ArmorySkills functions
- WorkshopPlaceholder ("Select a template from Templates tab") ready for Plan 03 to replace
- ArenaSoon placeholder with disabled tab trigger; /skills and /tools routes now redirect to /forge
- Frontend built clean (485ms), porter-admin and porter-fastify both healthy

## Task Commits

1. **Task 1: Sidebar nav merge** - `5914b6f` (feat)
2. **Task 2: 4-tab forge restructure + Armory absorption** - `0ff227a` (feat)
3. **Task 3: Remove /skills + /tools routes, add redirects** - `c2ffcbc` (feat)
4. **Task 4: Frontend build + service restart** - `88b1719` (chore)

## Files Created/Modified

- `admin/frontend/app/components/layout/sidebar.tsx` — Agents group: 3 items, Sparkles/Wrench imports removed
- `admin/frontend/app/routes/forge.tsx` — Full rewrite: 4-tab shell, ArmoryTools, ArmorySkills, ArmoryContent, WorkshopPlaceholder, ArenaSoon
- `admin/frontend/app/routes.ts` — tools/skills now point to redirect stubs
- `admin/frontend/app/routes/skills-redirect.tsx` — Navigate to="/forge" replace
- `admin/frontend/app/routes/tools-redirect.tsx` — Navigate to="/forge" replace

## Decisions Made

- Skills and Tools are absorbed inline into forge.tsx (not imported as separate components) — keeps forge.tsx self-contained and avoids cross-route imports
- AgentPresenceSummary wrapper omitted from Armory tab — it's a page-level concern; tabs don't need their own agent presence banner
- Arena tab disabled (opacity-50, disabled prop) — Phase 28 content not yet built
- Original skills.tsx and tools.tsx preserved — they serve as source reference and are not deleted

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- porter-admin service was in failed state at Task 4 verification (pre-existing condition, unrelated to this plan). Restarted with `systemctl --user restart porter-admin`. Now returns 200 at :5175.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 03 (Workshop tab) can now build against the 4-tab shell — WorkshopPlaceholder is the exact insertion point
- Arena tab placeholder is wired; Plan 28 (Battle Arena) will fill it
- /skills and /tools bookmarks redirect correctly to /forge

---
*Phase: 26-forge-unification*
*Completed: 2026-04-01*
