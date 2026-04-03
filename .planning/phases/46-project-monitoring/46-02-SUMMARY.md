---
phase: 46-project-monitoring
plan: 02
subsystem: services, api
tags: [watchers, activity-feed, notifications, sse, email, crud-api, findings]

requires:
  - phase: 46-project-monitoring
    provides: project_watchers and watcher_findings tables, executeWatcher function, scheduler integration
provides:
  - Activity feed integration for watcher findings via agent_activity table
  - SSE notification pipeline for important/critical findings
  - Email notification for important/critical findings when notify_email configured
  - Full CRUD API for project watchers at /api/v1/admin/watchers
  - Findings listing per watcher with importance filter
  - Manual watcher trigger endpoint
affects: [46-03, project-monitoring-ui, admin-ops-view]

tech-stack:
  added: []
  patterns: [activity-feed-integration, notification-pipeline-sse-email, admin-crud-with-envelope]

key-files:
  created:
    - backend/src/routes/v1/admin/watchers.ts
  modified:
    - backend/src/services/watcher-service.ts
    - backend/src/routes/v1/admin/index.ts

key-decisions:
  - "logWatcherFinding is internal (not exported) — only called within executeWatcher to keep notification pipeline encapsulated"
  - "Email notification failures are non-blocking — finding is already stored, email is best-effort"
  - "SSE events use catch(() => {}) for best-effort delivery — never block watcher execution"
  - "DELETE watcher cascades to watcher_findings manually (no FK cascade) for explicit control"
  - "schedule_cron computed from schedule_interval_sec with common interval shortcuts (hourly/6h/daily)"

patterns-established:
  - "Activity feed pattern: INSERT agent_activity + emitSSE('project:activity') for real-time feed updates"
  - "Notification tier: all findings -> activity feed, important/critical -> SSE notification + optional email"
  - "Admin CRUD pattern: dynamic WHERE/SET clauses with parameterized indices for flexible filtering/updates"

requirements-completed: [PMN-03, PMN-04]

duration: 4min
completed: 2026-04-03
---

# Phase 46 Plan 02: Watcher Activity Feed + Notifications + CRUD API Summary

**Watcher findings wired into project activity feed with source badges, SSE notifications for important findings, optional email alerts, and full admin CRUD API at /api/v1/admin/watchers**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-03T18:39:06Z
- **Completed:** 2026-04-03T18:43:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Built logWatcherFinding pipeline that inserts into agent_activity with source-type badges and pushes SSE events for real-time feed
- Added notification tier: important/critical findings trigger in-app SSE notification and optional email when notify_email is configured
- Created full CRUD API (7 endpoints) for project watchers with pagination, filtering, manual trigger, and cascading delete

## Task Commits

Each task was committed atomically:

1. **Task 1: Activity feed integration + notification pipeline in watcher-service** - `deec2ed` (feat)
2. **Task 2: Admin CRUD API for watchers + findings endpoint** - `d98200e` (feat)

## Files Created/Modified
- `backend/src/services/watcher-service.ts` - Added logWatcherFinding helper with activity feed, SSE, and email notification pipeline
- `backend/src/routes/v1/admin/watchers.ts` - Full CRUD API: create, list, detail, update, delete, findings, manual run
- `backend/src/routes/v1/admin/index.ts` - Registered watchersRoutes under /watchers prefix

## Decisions Made
- logWatcherFinding kept as internal helper (not exported) to encapsulate the notification pipeline within watcher execution
- Email failures are non-blocking: findings are already persisted, email is best-effort with error logging
- SSE emissions use catch(() => {}) pattern consistent with scheduler.ts for best-effort delivery
- Manual cascade delete on findings before watchers (no DB FK cascade) for explicit control
- Schedule cron computed from interval with shortcuts for common values (3600=hourly, 21600=every 6h, 86400=daily)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Email notifications require existing email connection setup (from prior phase).

## Next Phase Readiness
- Activity feed and notification pipeline ready for Plan 03 (UI components for watcher management)
- CRUD API fully operational at /api/v1/admin/watchers for frontend integration
- Manual trigger endpoint enables immediate watcher testing from UI

## Self-Check: PASSED

All created files verified, all commit hashes found in git log.

---
*Phase: 46-project-monitoring*
*Completed: 2026-04-03*
