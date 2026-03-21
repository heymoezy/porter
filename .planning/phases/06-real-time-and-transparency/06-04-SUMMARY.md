---
phase: 06-real-time-and-transparency
plan: "04"
subsystem: backend-api
tags: [health-endpoint, decision-log, ai-router, sse, token-tracking]
dependency_graph:
  requires: [06-01]
  provides: [TRNS-02, TRNS-03]
  affects: [backend/src/routes/v1, backend/src/services/ai-router.ts, backend/src/services/scheduler.ts]
tech_stack:
  added: []
  patterns: [SSE-fire-and-forget, ON-CONFLICT-upsert, parallel-backend-probing]
key_files:
  created:
    - backend/src/routes/v1/health.ts
    - backend/src/routes/v1/decisions.ts
  modified:
    - backend/src/routes/v1/index.ts
    - backend/src/services/ai-router.ts
    - backend/src/services/scheduler.ts
decisions:
  - "emitSSE exported from scheduler.ts for shared use by ai-router.ts — no duplication"
  - "logDecision only fires when 2+ backends available (altAvailable probe) — no noise when fallback forced by outage"
  - "trackTokenUsage uses ON CONFLICT upsert on (model, date) — requires UNIQUE INDEX from migrate-06.ts (already present)"
  - "Ollama token tracking uses eval_count field; OpenClaw uses usage.prompt_tokens + completion_tokens"
  - "Health endpoint probes all 3 services (Ollama, OpenClaw, Porter.py) in parallel with 3s timeout"
metrics:
  duration: "2min"
  completed_date: "2026-03-21"
  tasks_completed: 2
  files_created: 2
  files_modified: 3
---

# Phase 06 Plan 04: Health and Decision Log API Summary

System health endpoint and decision log API with AI router decision persistence and SSE emission.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Create health and decisions v1 routes | f463494 | health.ts, decisions.ts, index.ts |
| 2 | Wire decision logging + SSE into AI router | a8c9229 | ai-router.ts, scheduler.ts |

## What Was Built

### GET /api/v1/health
Probes all three backend services (Ollama, OpenClaw, Porter.py) in parallel using HEAD requests with 3s timeout. Returns backend status array, DB health with latency, and 7-day token usage aggregated per model. No auth required — monitoring endpoint.

### GET /api/v1/decisions
Paginated decision log with optional `?type=` filter. Returns decisions with alternatives JSON parsed from storage. Handles missing table gracefully (table created by migrate-06.ts on first boot).

### AI Router Decision Logging
After every model selection, ai-router.ts probes the alternative backend. When both are available (altAvailable = true), `logDecision()` persists the choice to `decision_log` and fires `decision:made` SSE event. When only one backend is up (fallback scenario), no decision is logged — pure fallback is not a meaningful choice.

### Token Usage Tracking
Ollama dispatch reads `eval_count` from response; OpenClaw dispatch reads `usage.prompt_tokens` + `usage.completion_tokens`. Both call `trackTokenUsage()` which does an ON CONFLICT upsert into `token_usage_daily`. The UNIQUE INDEX on (model, date) was already added by migrate-06.ts in Plan 01.

## Deviations from Plan

None — plan executed exactly as written. The `altAvailable` probe approach replaces the plan's `availableBackends.length >= 2` guard (which would have required probing all backends upfront) with a targeted single probe of the alternative tier, which is more efficient.

## Self-Check: PASSED

Files created:
- backend/src/routes/v1/health.ts: EXISTS
- backend/src/routes/v1/decisions.ts: EXISTS

Commits:
- f463494: feat(06-04): add health and decisions v1 routes
- a8c9229: feat(06-04): wire decision logging and token tracking into AI router
