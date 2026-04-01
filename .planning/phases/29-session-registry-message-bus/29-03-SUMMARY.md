---
phase: 29-session-registry-message-bus
plan: "03"
subsystem: scheduler
tags: [session-registry, context-pressure, sse, scheduler]
dependency_graph:
  requires:
    - 29-01-PLAN.md  # session-registry.ts + getActiveSessions/rotateSession
    - 29-02-PLAN.md  # msg-bus.ts
  provides:
    - Scheduler context pressure probe (SES-02)
    - bridge:context-pressure SSE event
  affects:
    - backend/src/services/scheduler.ts
tech_stack:
  added: []
  patterns:
    - HEALTH_PROBE_INTERVAL gate for infrastructure probes
    - emitSSE for real-time admin Bridge events
key_files:
  modified:
    - backend/src/services/scheduler.ts
decisions:
  - "CONTEXT_PRESSURE_THRESHOLD = 0.8 and CONTEXT_ROTATION_THRESHOLD = 0.95 as named constants"
  - "ActiveSession.context_pct is number (not string | null) — parseFloat not needed"
  - "runContextPressureCheck placed before start() to avoid hoisting issues"
metrics:
  duration: "~8min"
  completed_date: "2026-04-01T08:32:05Z"
  tasks_completed: 1
  files_modified: 1
---

# Phase 29 Plan 03: Scheduler Context Pressure Probe Summary

**One-liner:** Scheduler runs `runContextPressureCheck()` every 30s — emits `bridge:context-pressure` SSE warning at 80%, auto-rotates session at 95% via `rotateSession()`.

## What Was Built

Added `runContextPressureCheck()` to `backend/src/services/scheduler.ts` — a new infrastructure probe that runs every 30 seconds inside the existing `HEALTH_PROBE_INTERVAL` tick gate.

The function calls `getActiveSessions()` from session-registry.ts, inspects `context_pct` for each active session, and:
- At >= 80% (CONTEXT_PRESSURE_THRESHOLD): emits `bridge:context-pressure` SSE with `action: 'warning'`
- At >= 95% (CONTEXT_ROTATION_THRESHOLD): calls `rotateSession()` to close the current session and open a new one, then emits `bridge:context-pressure` SSE with `action: 'rotated'` + `new_session_id`

Both paths log to console for operator visibility.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add runContextPressureCheck to scheduler + build + ship | dbfd642 | backend/src/services/scheduler.ts |
| 2 | Checkpoint: human-verify (auto-approved) | — | — |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ActiveSession.context_pct is number, not string | null**
- **Found during:** Task 1 — TypeScript compile error TS2345
- **Issue:** Plan specified `parseFloat(session.context_pct ?? '0')` but `ActiveSession.context_pct` is typed as `number` (already parsed in getActiveSessions mapper), not `string | null`
- **Fix:** Replaced `parseFloat(session.context_pct ?? '0')` with direct `session.context_pct` access; removed the `isNaN()` guard (redundant for number type)
- **Files modified:** backend/src/services/scheduler.ts
- **Commit:** dbfd642

## Verification Results

```
grep -n "bridge:context-pressure" scheduler.ts  → lines 250, 264 (two emitSSE calls)
grep -n "runContextPressureCheck" scheduler.ts  → line 240 (def), 305 (tick call)
grep -n "CONTEXT_PRESSURE_THRESHOLD" scheduler.ts → line 22 (0.8), 262 (usage)
curl http://127.0.0.1:3001/health  → {"status":"ok","engine":"fastify","version":"3.4.1"}
```

Build: clean (zero TypeScript errors). Service: healthy.

## Self-Check: PASSED

- [x] `backend/src/services/scheduler.ts` modified — confirmed
- [x] Commit dbfd642 exists — confirmed via `git log`
- [x] `bridge:context-pressure` present in scheduler.ts — confirmed
- [x] `runContextPressureCheck` present in function def and tick() call — confirmed
- [x] `CONTEXT_PRESSURE_THRESHOLD = 0.8` present — confirmed
- [x] Service health returns ok — confirmed
