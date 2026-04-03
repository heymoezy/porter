---
phase: 47-project-substrate
plan: 03
subsystem: api
tags: [atlas, structural-health, drift-detection, auto-repair, project-substrate]

# Dependency graph
requires:
  - phase: 47-project-substrate plan 01
    provides: CANONICAL_DIRS, SYSTEM_FILES, provisionProjectStructure, projects.fs_path column
provides:
  - "Atlas structural health agent with drift detection and auto-repair"
  - "Scheduled 30-minute structural scans for all active projects"
  - "Activity feed logging for structural findings with SSE notifications"
affects: [project-health, admin-dashboard, project-monitoring]

# Tech tracking
tech-stack:
  added: []
  patterns: ["per-project error isolation in batch agent scans", "flag-only detection for content files vs auto-repair for structural directories"]

key-files:
  created: [backend/src/services/atlas-agent.ts]
  modified: [backend/src/services/scheduler.ts]

key-decisions:
  - "Missing canonical directories auto-repaired; missing _system files only flagged (content files are sacred)"
  - "Hidden files and README.md/.gitignore skipped in root misplacement check"
  - "Atlas runs every 30 minutes (ATLAS_CHECK_INTERVAL=900 ticks) -- structural drift is slow-changing"
  - "First Atlas run at tick 900 (30 min after startup) to avoid startup load"
  - "Per-project try/catch isolation: one project failure does not stop checks on other projects"

patterns-established:
  - "Flag-only detection: content files (_system/*.md) are never auto-recreated -- only structural dirs get auto-repair"
  - "Batch agent pattern: query all matching entities, iterate with per-item try/catch, aggregate findings"

requirements-completed: [PSB-04]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 47 Plan 03: Atlas Structural Health Agent Summary

**Atlas agent scans all active projects every 30 minutes, auto-repairs missing directories, flags missing system files and misplaced root files, and logs findings to activity feed**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T19:06:09Z
- **Completed:** 2026-04-03T19:10:02Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created atlas-agent.ts with runAtlasCheck, scheduleAtlasRuns, and ATLAS_WATCHER_TYPE exports
- Structural drift detection: auto-repairs missing canonical directories, flags missing _system files, detects misplaced root files
- Wired Atlas into scheduler tick loop at 30-minute interval (900 ticks)
- Activity feed logging with SSE notification for all non-clean findings

## Task Commits

Each task was committed atomically:

1. **Task 1: Atlas structural health agent** - `0bbeb2f` (feat)
2. **Task 2: Wire Atlas into scheduler tick loop** - `1633b09` (feat)

## Files Created/Modified
- `backend/src/services/atlas-agent.ts` - Atlas structural health agent with drift detection, auto-repair, and activity logging
- `backend/src/services/scheduler.ts` - Added import, ATLAS_CHECK_INTERVAL constant, and tick() call for Atlas

## Decisions Made
- Missing canonical directories are auto-repaired (structural); missing _system files are only flagged (content files are sacred)
- Hidden files (dotfiles) and known root files (README.md, .gitignore) are excluded from misplacement detection
- Atlas runs every 30 minutes -- deliberately less frequent than watchers (60s) because structural drift is slow-changing
- Per-project error isolation ensures one project failure does not stop checks on others
- Activity logging uses dynamic import of emitSSE to match watcher-service pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 47 (Project Substrate) is now complete: provisioning, ingress, and structural health all shipped
- Atlas agent will automatically maintain structural integrity of all provisioned projects
- No blockers

## Self-Check: PASSED

- FOUND: backend/src/services/atlas-agent.ts
- FOUND: commit 0bbeb2f
- FOUND: commit 1633b09
- TypeScript compiles clean (zero errors)

---
*Phase: 47-project-substrate*
*Completed: 2026-04-03*
