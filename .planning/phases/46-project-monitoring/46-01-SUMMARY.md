---
phase: 46-project-monitoring
plan: 01
subsystem: database, services
tags: [watchers, rss, web-search, email-monitor, ollama, scheduling, agent-jobs]

requires:
  - phase: 44-autonomous-job-queue
    provides: agent_jobs table, scheduler tick loop, scheduleSystemJob, job claim/execute pattern
provides:
  - project_watchers and watcher_findings tables with full Drizzle schema
  - watcher-service.ts with 4 type handlers (web_search, rss_feed, email_monitor, custom)
  - scheduleWatcherRuns polling for due watchers every 60s
  - watcher_run job handler in scheduler executeJob
affects: [46-02, 46-03, project-monitoring-api, project-monitoring-ui]

tech-stack:
  added: [Brave Search API integration, RSS/Atom XML regex parser, Ollama custom watcher]
  patterns: [watcher-type-dispatch, dedup-guard-jsonb-containment, watcher-findings-insertion]

key-files:
  created:
    - backend/src/db/migrate-pmn-v1.ts
    - backend/src/services/watcher-service.ts
  modified:
    - backend/src/db/schema.ts
    - backend/src/services/scheduler.ts
    - backend/src/index.ts

key-decisions:
  - "Watcher dedup uses JSONB @> containment operator for flexible trigger_data matching"
  - "RSS parser uses regex instead of DOMParser (not available in Node) for zero-dependency XML extraction"
  - "Custom watcher routes to Ollama (qwen2.5-coder:1.5b) for cheap local inference"
  - "Error threshold: 3+ consecutive run failures set watcher status to 'error'"
  - "Watcher jobs use source='watcher' (not 'system') to distinguish from system jobs"

patterns-established:
  - "Watcher type dispatch: switch on watcher_type with per-type handler returning WatcherFinding[]"
  - "Finding insertion: bulk insert with denormalized project_id for fast project-scoped queries"
  - "Graceful degradation: missing API keys return informative single-finding instead of throwing"

requirements-completed: [PMN-01, PMN-02]

duration: 6min
completed: 2026-04-03
---

# Phase 46 Plan 01: Project Monitoring Foundation Summary

**Two new tables (project_watchers, watcher_findings) with watcher execution engine handling web search, RSS, email, and custom LLM monitoring via scheduler integration**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-03T18:30:25Z
- **Completed:** 2026-04-03T18:36:50Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created project_watchers and watcher_findings tables with idempotent migration and Drizzle schema
- Built watcher execution service with 4 type handlers: Brave Search, RSS/Atom, email keyword search, and Ollama custom prompts
- Integrated watcher scheduling into scheduler tick loop (60s check interval) with dedup guards
- Added watcher_run job handler in scheduler with proper error handling and activity logging

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration + Drizzle schema for project_watchers and watcher_findings** - `d82349e` (feat)
2. **Task 2: Watcher execution service + scheduler integration** - `c83e2f1` (feat)

## Files Created/Modified
- `backend/src/db/migrate-pmn-v1.ts` - Idempotent DDL migration for project_watchers and watcher_findings tables with indexes
- `backend/src/services/watcher-service.ts` - Watcher execution engine with 4 type handlers and scheduling logic
- `backend/src/db/schema.ts` - Drizzle schema definitions for projectWatchers and watcherFindings
- `backend/src/services/scheduler.ts` - Import watcher-service, tick schedule for watcher runs, watcher_run job handler
- `backend/src/index.ts` - Wire migratePmnV1 into startup migration chain

## Decisions Made
- Used JSONB @> containment operator for dedup guard -- more flexible than exact trigger_data match
- RSS parser uses regex extraction (not DOMParser) since DOMParser is browser-only -- zero external dependencies
- Custom watcher uses Ollama local model for cost-free inference with graceful fallback if Ollama is down
- Watcher jobs use `source='watcher'` to distinguish from `source='system'` jobs in queries
- Error threshold set at 3 consecutive failures before marking watcher as 'error' status

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Brave Search API key is optional (graceful degradation).

## Next Phase Readiness
- Tables and service ready for Plan 02 (API endpoints for CRUD on watchers and findings)
- Scheduler integration tested via TypeScript compilation -- ready for runtime verification after restart

---
*Phase: 46-project-monitoring*
*Completed: 2026-04-03*
