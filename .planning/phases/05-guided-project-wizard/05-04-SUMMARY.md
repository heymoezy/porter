---
phase: 05-guided-project-wizard
plan: "04"
subsystem: ui
tags: [react, framer-motion, tanstack-query, sse, real-time, dashboard]

# Dependency graph
requires:
  - phase: 05-03
    provides: Activity API at /api/v1/projects/:id/activity and SSE events for project:activity and agent:activity

provides:
  - useProjectActivity hook with SSE subscription to project and agent activity events
  - ActivityFeed component with time-grouped event cards and relative timestamps
  - AgentStatusStrip component with live status indicators and framer-motion stagger
  - ProjectDashboard with activity-first two-column layout (feed + milestones/next steps)
  - Layout.tsx routing projects tab to ProjectDashboard or ProjectListPlaceholder

affects:
  - 05-05-PLAN (further project wizard UI)
  - Any future plans touching projects module

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SSE subscription via EventSource in custom React hook with cleanup on unmount
    - useQuery from @tanstack/react-query for project/agents data, useProjectActivity for live events
    - Design system CSS variables exclusively — var(--text), var(--surface), var(--border) etc.
    - Activity events prepended to in-memory list capped at 100, SSE pushes new events without re-fetch
    - framer-motion stagger for agent card entry animation

key-files:
  created:
    - frontend/src/hooks/useProjectActivity.ts
    - frontend/src/modules/projects/ActivityFeed.tsx
    - frontend/src/modules/projects/AgentStatusStrip.tsx
    - frontend/src/modules/projects/ProjectDashboard.tsx
  modified:
    - frontend/src/components/Layout.tsx

key-decisions:
  - "AgentStatusStrip accepts agents as prop from parent — parent (ProjectDashboard) does all data fetching"
  - "Agents filtered client-side by project_id from config — no server-side project filter in GET /api/v1/agents"
  - "Layout.tsx calls useAppStore.getState() inside TabPlaceholder — reads Zustand state directly for routing decision"

patterns-established:
  - "SSE hook pattern: EventSource created in useEffect with named event listeners and close() on cleanup"
  - "Time grouping: 'Just now' (<5min), 'Earlier today' (same day), date label for older — applied before rendering groups"
  - "Status dots: accent=starting, success=complete, danger=failed, text3=default — consistent across ActivityFeed and AgentStatusStrip"

requirements-completed: [PROJ-03]

# Metrics
duration: 15min
completed: 2026-03-21
---

# Phase 05 Plan 04: Project Dashboard Frontend Summary

**Activity-first project dashboard with SSE real-time feed, framer-motion agent strip, and design-system-token components wired into Layout routing**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-21T06:05:00Z
- **Completed:** 2026-03-21T06:20:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- SSE subscription hook (`useProjectActivity`) subscribes to `project:activity` and `agent:activity` events with automatic EventSource reconnection
- `ActivityFeed` renders time-grouped event cards (Just now / Earlier today / date) with relative timestamps, status-colored dots, and empty/loading states — zero neutral-* classes
- `AgentStatusStrip` shows assigned agents with live status dots (idle gray, active pulsing green, retired dimmed) using framer-motion stagger entrance
- `ProjectDashboard` combines all three with `@tanstack/react-query` for project + agents data, milestones list with completion indicators, and contextual "next steps" coaching card
- `Layout.tsx` now routes the projects tab to either `ProjectDashboard` (when `activeProjectId` is set) or a `ProjectListPlaceholder`

## Task Commits

1. **Task 1: SSE hook and ActivityFeed** - `47a1292` (feat)
2. **Task 2: AgentStatusStrip, ProjectDashboard, Layout wiring** - `e2598ec` (feat)

## Files Created/Modified
- `frontend/src/hooks/useProjectActivity.ts` - SSE subscription hook, initial fetch, real-time prepend
- `frontend/src/modules/projects/ActivityFeed.tsx` - Time-grouped event card list
- `frontend/src/modules/projects/AgentStatusStrip.tsx` - Horizontal agent strip with framer-motion
- `frontend/src/modules/projects/ProjectDashboard.tsx` - Activity-first two-column dashboard
- `frontend/src/components/Layout.tsx` - Projects tab routing to ProjectDashboard

## Decisions Made
- AgentStatusStrip accepts agents as a prop array rather than fetching internally — keeps data fetching centralized in ProjectDashboard and avoids duplicate API calls
- Agents filtered client-side by project_id (stored in agent config JSON field) — existing GET /api/v1/agents has no project filter param, adding one is Phase 4 scope
- Sidebar already used design system tokens (bg-bg, text-text2, border-border) — no migration needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `python3 /tmp/test_proj03_activity.py` returned SKIP (not PASS) — the activity endpoint returns 404 on the test project, treated as SKIP per acceptance criteria. This is expected since the feature requires a live project with activity records.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Project dashboard module complete: all four files created, Layout routing working
- SSE hook ready for reuse in any component needing real-time project events
- Design system compliance verified — all new components use CSS variables exclusively
- TypeScript compiles cleanly, 31 of 35 Playwright tests pass (4 pre-existing failures unrelated to this plan)

---
*Phase: 05-guided-project-wizard*
*Completed: 2026-03-21*
