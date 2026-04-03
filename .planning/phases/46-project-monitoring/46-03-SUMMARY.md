---
phase: 46-project-monitoring
plan: 03
subsystem: ui, admin
tags: [watchers, admin-ops, react-query, table-view, status-badges]

requires:
  - phase: 46-project-monitoring
    provides: GET /api/v1/admin/watchers endpoint (Plan 02)
provides:
  - WatchersPage React component with table view, status badges, and filtering
  - Admin nav integration (Ops section) with /watchers route
affects: [admin-ui, project-monitoring-ops]

tech-stack:
  added: []
  patterns: [admin-ops-table-page, client-side-filtering, relative-time-formatting]

key-files:
  created:
    - admin/frontend/app/routes/watchers.tsx
  modified:
    - admin/frontend/app/components/layout/sidebar.tsx
    - admin/frontend/app/routes.ts

key-decisions:
  - "Nav item placed in Ops section (alongside Bridge, Recall, Intelligence, System) using Eye icon from Lucide"
  - "Client-side filtering chosen over server-side — watcher count expected <100, avoids extra API complexity"
  - "Sidebar.tsx modified for nav (not layout.tsx) — following actual codebase nav structure"

patterns-established:
  - "Admin ops table pattern: useQuery with auto-refresh, client-side filtering, color-coded badges, relative time display"
  - "Type badge coloring: web=blue, rss=orange, email=purple, custom=gray"

requirements-completed: [PMN-05]

duration: 4min
completed: 2026-04-03
---

# Phase 46 Plan 03: Watcher Admin Ops Panel Summary

**Admin ops table showing all project watchers with color-coded type/status badges, run metrics, scheduling info, and client-side filtering by status and project**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-03T18:39:10Z
- **Completed:** 2026-04-03T18:43:27Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created WatchersPage with full table view: name, project, type badge, status badge, last run, next run, run count, finding count, schedule
- Color-coded badges for watcher type (web=blue, rss=orange, email=purple, custom=gray) and status (active=green, paused=yellow, error=red)
- Client-side filtering by status and project with auto-refresh every 30s
- Wired into admin nav (Ops section) with Eye icon and /watchers route

## Task Commits

Each task was committed atomically:

1. **Task 1: WatchersPage ops panel with table view** - `1035762` (feat)
2. **Task 2: Wire watchers page into admin nav** - `d98200e` (feat)

## Files Created/Modified
- `admin/frontend/app/routes/watchers.tsx` - WatchersPage component with table, badges, filtering, relative time formatting
- `admin/frontend/app/components/layout/sidebar.tsx` - Added Eye icon import and Watchers nav item in Ops section
- `admin/frontend/app/routes.ts` - Added /watchers route entry

## Decisions Made
- Used Eye icon (Lucide) for Watchers nav item -- visually communicates monitoring/watching
- Client-side filtering instead of server-side query params -- watcher count is small (<100), avoids API complexity
- Modified sidebar.tsx for nav (plan referenced layout.tsx but actual nav structure is in sidebar.tsx)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Nav modification target corrected from layout.tsx to sidebar.tsx**
- **Found during:** Task 2
- **Issue:** Plan specified modifying layout.tsx for nav, but actual nav structure lives in sidebar.tsx
- **Fix:** Modified sidebar.tsx instead, following existing codebase patterns
- **Files modified:** admin/frontend/app/components/layout/sidebar.tsx
- **Verification:** Build passes, nav item renders correctly
- **Committed in:** d98200e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Corrected file target to match actual codebase structure. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 46 (Project Monitoring) is now complete with all 3 plans delivered
- Foundation (Plan 01), API endpoints (Plan 02), and admin UI (Plan 03) form a complete watcher system
- Runtime verification pending after service restart

---
*Phase: 46-project-monitoring*
*Completed: 2026-04-03*
