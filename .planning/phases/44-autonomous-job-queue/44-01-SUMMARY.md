---
phase: 44-autonomous-job-queue
plan: 01
subsystem: api
tags: [postgres, job-queue, scheduler, capability-matching, skill-matching]

requires:
  - phase: 40-gateway-capabilities
    provides: "GatewayCapabilityRecord type and JSONB capabilities column on gateways table"
  - phase: 42-task-decomposition
    provides: "schema_migrations pattern, task execution pipeline"
provides:
  - "4 new columns on agent_jobs: source, required_skill, required_capability, assigned_gateway"
  - "job-assignment.ts service: selectBestAgent, selectBestGateway, assignJob"
  - "scheduleSystemJob function with deduplication guard"
  - "health_sweep and gateway_check self-scheduled system jobs"
affects: [44-02-autonomous-job-queue, project-monitoring, autonomous-agents]

tech-stack:
  added: []
  patterns: ["skill-based agent matching via persona_skills JOIN", "capability-based gateway matching via JSONB query", "system job deduplication guard"]

key-files:
  created:
    - backend/src/db/migrate-ajq-v1.ts
    - backend/src/services/job-assignment.ts
  modified:
    - backend/src/db/schema.ts
    - backend/src/services/scheduler.ts
    - backend/src/index.ts

key-decisions:
  - "selectBestAgent uses effectiveness_score DESC ranking with enabled=1 filter and retired/temporary exclusions"
  - "selectBestGateway uses JSONB ->> operator with field:value capability format for flexible matching"
  - "scheduleSystemJob dedup checks trigger_type + source='system' + status IN (pending, running)"
  - "Gateway assignment happens between job claim and executeJob — allows constraint-based routing without changing claim logic"

patterns-established:
  - "System job pattern: source='system' jobs with dedup guard prevent duplicate enqueuing"
  - "Constraint-based assignment: jobs declare what they need (skill/capability), assignment engine finds best match"

requirements-completed: [AJQ-01, AJQ-02, AJQ-03]

duration: 4min
completed: 2026-04-03
---

# Phase 44 Plan 01: Autonomous Job Queue Foundation Summary

**Skill/capability matching engine for agent_jobs with self-scheduling health_sweep and gateway_check system jobs**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-03T13:48:36Z
- **Completed:** 2026-04-03T13:52:36Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Extended agent_jobs table with source, required_skill, required_capability, assigned_gateway columns via idempotent migration
- Built job assignment engine that selects agents by skill effectiveness (persona_skills JOIN with enabled filter) and gateways by JSONB capability match
- Porter now self-schedules health_sweep (every 60min) and gateway_check (every 30min) system jobs with deduplication guard
- Existing pending jobs unaffected by migration (safe defaults)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration + schema extension for agent_jobs** - `755fb2b` (feat)
2. **Task 2: Job assignment service + scheduler self-scheduling** - `72c4f94` (feat)

## Files Created/Modified
- `backend/src/db/migrate-ajq-v1.ts` - Idempotent migration adding 4 columns + 2 indexes to agent_jobs
- `backend/src/services/job-assignment.ts` - Skill + capability matching engine (selectBestAgent, selectBestGateway, assignJob)
- `backend/src/db/schema.ts` - Drizzle schema updated with 4 new agentJobs columns
- `backend/src/services/scheduler.ts` - scheduleSystemJob, health_sweep/gateway_check handlers, constraint-based assignment in tick()
- `backend/src/index.ts` - migrateAjqV1 import and call in startup chain

## Decisions Made
- selectBestAgent uses effectiveness_score DESC ranking with enabled=1 filter — ensures disabled skill assignments are excluded and best performers are preferred
- selectBestGateway uses JSONB ->> operator with field:value format — flexible enough to match any capability field without schema changes
- scheduleSystemJob dedup checks trigger_type + source='system' + status IN (pending, running) — prevents duplicate system jobs without race conditions
- Gateway assignment happens between job claim and executeJob in tick() — keeps claim logic unchanged while adding constraint routing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Job assignment engine ready for Plan 02 (API endpoints, admin visibility, queue management)
- System jobs will begin self-scheduling on next server restart
- health_sweep and gateway_check handlers use existing runHealthProbe and refreshAllGateways

---
*Phase: 44-autonomous-job-queue*
*Completed: 2026-04-03*

## Self-Check: PASSED
- All created files exist on disk
- Both task commits verified (755fb2b, 72c4f94)
