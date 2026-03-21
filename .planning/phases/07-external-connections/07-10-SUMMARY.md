---
phase: 07-external-connections
plan: 10
subsystem: ui
tags: [react, typescript, calendar, google-calendar, connections, project-dashboard]

# Dependency graph
requires:
  - phase: 07-external-connections plan 03
    provides: ConnectionsPage patterns, API client usage, provider icon imports
  - phase: 07-external-connections plan 07
    provides: getProjectCalendarEvents service function, calendar_events table

provides:
  - GET /api/v1/connections/project/:projectId/calendar-events endpoint
  - CalendarEventsDisplay component (project dashboard sidebar)
  - ProjectConnectionsPanel component (per-project connection override dropdowns)

affects: [project-dashboard, calendar-integration, project-connections]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Calendar events route reuses existing connections.ts route file
    - ProjectConnectionsPanel fetches both workspace and project connections, derives override state
    - CalendarEventsDisplay renders nothing when empty (no clutter when calendar not connected)

key-files:
  created:
    - frontend/src/modules/connections/ProjectConnectionsPanel.tsx
    - frontend/src/modules/projects/CalendarEventsDisplay.tsx
  modified:
    - backend/src/routes/v1/connections.ts
    - frontend/src/modules/projects/ProjectDashboard.tsx

key-decisions:
  - "CalendarEventsDisplay returns null when events array is empty — keeps dashboard clean when calendar not connected"
  - "ProjectConnectionsPanel only renders service rows for providers that have at least one workspace connection — avoids showing useless empty dropdowns"
  - "Operators and admins can manage project-level overrides; only viewers see disabled selects — per UI-SPEC line 237"

patterns-established:
  - "Timeline display: thin 2px --border vertical line on left, dot per event, date badge color = urgency level"
  - "Date badge: --danger for today, --warning for <24h, --raised (default) for future"

requirements-completed: [CONN-03, CONN-05]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 7 Plan 10: Calendar Events Display and Project Connection Overrides Summary

**Calendar deadline timeline on project dashboard + per-project connection override dropdowns, closing two locked CONTEXT.md decisions**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T17:03:42Z
- **Completed:** 2026-03-21T17:05:44Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- GET /project/:projectId/calendar-events route added to connections.ts, backed by getProjectCalendarEvents service
- CalendarEventsDisplay renders upcoming deadlines with urgency-coded date badges and vertical timeline line; invisible when no events
- ProjectConnectionsPanel allows per-project connection override with provider-scoped dropdowns; operators and admins can edit, viewers see disabled selects
- Both components wired into ProjectDashboard side column (calendar after milestones, connection overrides at bottom)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add calendar events route and ProjectConnectionsPanel frontend** - `1dfac8a` (feat)
2. **Task 2: Add CalendarEventsDisplay to project dashboard** - `e2b96a3` (feat)

**Plan metadata:** (docs commit — see final_commit step)

## Files Created/Modified
- `backend/src/routes/v1/connections.ts` - Added getProjectCalendarEvents import and GET /project/:projectId/calendar-events endpoint
- `frontend/src/modules/connections/ProjectConnectionsPanel.tsx` - Per-project override dropdowns for each connected provider
- `frontend/src/modules/projects/CalendarEventsDisplay.tsx` - Timeline display for upcoming calendar deadlines with urgency badge colors
- `frontend/src/modules/projects/ProjectDashboard.tsx` - Imported and rendered CalendarEventsDisplay after milestones and ProjectConnectionsPanel at bottom

## Decisions Made
- CalendarEventsDisplay returns null when events array is empty — avoids cluttering dashboard when calendar is not connected
- ProjectConnectionsPanel only renders service rows that have at least one workspace connection, not all four fixed providers — avoids empty useless dropdowns
- Operators and admins can manage project-level overrides; only viewers see disabled selects — per UI-SPEC line 237

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Calendar events are now surfaced on every project dashboard when google_calendar is connected
- Project-level connection overrides accessible from the project detail view
- Both CONTEXT.md locked decisions (CONN-03: calendar on project dashboard, CONN-05: project-level overrides) are fully implemented
- Phase 07 plan 11 can proceed without outstanding blockers from these features

---
*Phase: 07-external-connections*
*Completed: 2026-03-21*
