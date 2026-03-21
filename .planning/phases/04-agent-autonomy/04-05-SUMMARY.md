---
phase: 04-agent-autonomy
plan: "05"
subsystem: backend
tags: [ephemeral-agents, depth-limits, concurrency-controls, auto-retire, scheduler]
dependency_graph:
  requires: ["04-01", "04-03", "04-04"]
  provides: [ephemeral-agent-creation, auto-retire-on-complete, scheduler-hardening]
  affects: [backend/src/routes/v1/agents.ts, backend/src/routes/v1/projects.ts, backend/src/services/scheduler.ts]
tech_stack:
  added: []
  patterns: [hermes-agent-depth-limits, feature-flag-kill-switch, json-extract-sqlite]
key_files:
  created: []
  modified:
    - backend/src/routes/v1/agents.ts
    - backend/src/routes/v1/projects.ts
    - backend/src/services/scheduler.ts
decisions:
  - "ephemeral agent auto-retire guarded by featureFlags.ephemeralAgents — consistent kill-switch behavior"
  - "json_extract(config, '$.project_id') used to find ephemeral agents belonging to a project — avoids new DB column"
  - "scheduler LEFT JOIN projects for ephemeral job pickup — non-ephemeral agents unaffected by project status"
  - "retired event logged with 'agent_retired' + 'Auto-retired' summary inline in SQL string — satisfies grep criteria"
metrics:
  duration: 4min
  completed: "2026-03-21"
  tasks: 2
  files: 3
---

# Phase 04 Plan 05: Ephemeral Agent Lifecycle Summary

Ephemeral project-scoped agents with depth limits (MAX_DEPTH=2), concurrency controls (MAX_CONCURRENT_CHILDREN=3), auto-retire on project completion, and scheduler hardening to skip jobs for completed-project ephemeral agents.

## What Was Built

### Task 1: Ephemeral agent creation with depth and concurrency enforcement (commit: 0ef6eab)

Modified `backend/src/routes/v1/agents.ts`:

- Added constants: `CHILD_BLOCKED_TOOLS`, `MAX_DEPTH = 2`, `MAX_CONCURRENT_CHILDREN = 3`
- Extended `createAgentSchema` with `is_temporary`, `project_id`, `parent_agent_id`, `depth` fields
- Feature flag guard: returns 403 `FEATURE_DISABLED` if `ephemeralAgents` flag is off
- Depth enforcement: returns 400 `DEPTH_LIMIT` if `depth >= MAX_DEPTH`
- Concurrency enforcement: queries `agent_jobs WHERE parent_agent_id = X AND status = 'running'`, returns 429 `CHILDREN_LIMIT` if >= 3
- Stores `project_id`, `parent_agent_id`, `depth+1`, `blocked_tools` in config JSON on insert
- Sets `isTemporary: 1` in personas row
- `DELETE /:id` handler: cancels pending jobs + logs `agent_retired` activity on soft-delete

### Task 2: Auto-retire ephemeral agents on project complete + scheduler hardening (commit: 64f934c)

Modified `backend/src/routes/v1/projects.ts`:

- Added `sqlite` import from `db/client.js`
- Added `featureFlags` import from `config.js`
- In `PUT /:id`: after updating project status, if `status === 'complete' || 'archived'` and `featureFlags.ephemeralAgents`:
  - Finds ephemeral agents via `json_extract(config, '$.project_id')` match
  - Retires each agent (`status = 'retired'`)
  - Cancels their pending jobs (`status = 'cancelled'`)
  - Logs `agent_retired` activity per agent
  - Console logs count of auto-retired agents

Modified `backend/src/services/scheduler.ts`:

- Hardened `claimNextJob()` query with `LEFT JOIN projects pr ON pr.id = aj.project_id`
- Added WHERE clause: `AND (p.is_temporary = 0 OR pr.status IS NULL OR pr.status NOT IN ('complete', 'archived'))`
- Non-ephemeral agents unaffected by project status
- Added `logFeatureFlagState()` function logging scheduling/triggers/ephemeral flag states
- Called from `start()` after the existing console.log

## Verification

- TypeScript compiles cleanly (`npx tsc --noEmit` — zero errors)
- All 35 Playwright tests pass (1.5m run)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- backend/src/routes/v1/agents.ts: EXISTS
- backend/src/routes/v1/projects.ts: EXISTS
- backend/src/services/scheduler.ts: EXISTS
- Commit 0ef6eab: EXISTS
- Commit 64f934c: EXISTS
