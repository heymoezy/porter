---
phase: 06-real-time-and-transparency
plan: 03
subsystem: ui
tags: [react, typescript, framer-motion, sse, activity-feed, real-time]

# Dependency graph
requires:
  - phase: 06-02
    provides: SSEProvider singleton with useSSEBus() hook for shared event bus
  - phase: 06-01
    provides: /api/events/emit endpoint enabling SSE events from scheduler
  - phase: 05-04
    provides: AgentStatusStrip and ProjectDashboard components (base implementations)
provides:
  - Three-section ActivityFeed (Active/Completed/Queued) with expandable detail rows
  - categorizeEvents() helper partitioning activity events by type and recency
  - CategorizedActivity and QueuedJob exported interfaces from useProjectActivity
  - AgentStatusStrip with live agent:status SSE subscription and onStatusChange callback
  - ProjectDashboard updated to pass categorized data to ActivityFeed
affects:
  - 06-04
  - 06-05
  - 06-06

# Tech tracking
tech-stack:
  added: []
  patterns:
    - CategorizedActivity: hook returns both flat events and categorized view for consumers needing structured layout
    - EventRow with AnimatePresence: expandable detail pattern for all activity rows -- click to reveal JSON detail
    - SectionHeader component: reusable status-section header with animated dot and count badge
    - onStatusChange callback prop: AgentStatusStrip notifies parent on SSE events so parent controls refetch

key-files:
  created: []
  modified:
    - frontend/src/hooks/useProjectActivity.ts
    - frontend/src/modules/projects/ActivityFeed.tsx
    - frontend/src/modules/projects/AgentStatusStrip.tsx
    - frontend/src/modules/projects/ProjectDashboard.tsx

key-decisions:
  - "ActivityFeed categorized prop replaces flat events prop -- hook returns both for backward compat with future consumers"
  - "Active section: only job_started and wizard_start event types; Completed: only today's job_complete/job_failed/agent_retired; Queued: pending jobs from /api/v1/jobs"
  - "Agent name for QueuedJob comes from job row agent_name field -- no extra agent lookup needed"
  - "onStatusChange on AgentStatusStrip is optional: guards with if (!onStatusChange) return -- strips without parent callback are unaffected"
  - "fetchQueued filters client-side by agent_id presence -- avoids false empty states from malformed rows"

patterns-established:
  - "Active dot pulses with animate-pulse; Completed dot is static green; Queued dot is muted"
  - "Expandable EventRow: hasDetail check guards against empty/null detail before showing toggle indicator"

requirements-completed: [TRNS-01]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 06 Plan 03: Three-Section ActivityFeed with Live AgentStatusStrip Summary

**ActivityFeed restructured into Active/Completed/Queued sections with expandable detail and real-time agent status via SSE**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T07:20:31Z
- **Completed:** 2026-03-21T07:23:09Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added CategorizedActivity and QueuedJob interfaces to useProjectActivity, plus categorizeEvents() helper that partitions events by type (Active: job_started/wizard_start, Completed: today's done/failed/retired, Queued: pending jobs fetched from /api/v1/jobs)
- Rewrote ActivityFeed from a time-grouped layout to a three-section state-machine layout: Active (pulsing dot), Completed, Queued -- each with SectionHeader and count badge
- Added expandable EventRow with AnimatePresence smooth expand/collapse for detail JSON on click
- AgentStatusStrip now subscribes to agent:status SSE events and notifies parent via optional onStatusChange callback prop for live agent status refresh
- ProjectDashboard updated to pass categorized (from hook) instead of flat events to ActivityFeed, and wires refetchAgents as onStatusChange

## Task Commits

Each task was committed atomically:

1. **Task 1: Add event categorization to useProjectActivity + fetch jobs for Queued section** - `356355b` (feat)
2. **Task 2: Rebuild ActivityFeed with three sections + expandable detail + agent grouping, update ProjectDashboard** - `eecddb9` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `frontend/src/hooks/useProjectActivity.ts` - Added CategorizedActivity, QueuedJob types, categorizeEvents(), fetchQueued(), categorized return value, agent:status SSE re-fetch
- `frontend/src/modules/projects/ActivityFeed.tsx` - Complete rewrite: three-section layout, SectionHeader, EventRow with AnimatePresence, QueuedRow
- `frontend/src/modules/projects/AgentStatusStrip.tsx` - Added useSSEBus import, onStatusChange optional prop, agent:status subscription
- `frontend/src/modules/projects/ProjectDashboard.tsx` - Pass categorized to ActivityFeed, wire refetchAgents as onStatusChange to AgentStatusStrip

## Decisions Made

- ActivityFeed `categorized` prop replaces flat `events` prop -- hook returns both flat events and categorized for different consumer needs
- Active section uses only job_started and wizard_start event types; Completed includes today's job_complete/job_failed/agent_retired; Queued pulls from /api/v1/jobs?status=pending
- onStatusChange on AgentStatusStrip is optional and guarded -- components without callback prop are unaffected

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compiled cleanly on first attempt for both tasks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TRNS-01 requirement complete: users can see Active/Completed/Queued agent activity in real-time
- ActivityFeed and AgentStatusStrip both wired to SSE bus for live updates
- Ready for Plan 06-04 (token usage tracking and transparency)

---
*Phase: 06-real-time-and-transparency*
*Completed: 2026-03-21*
