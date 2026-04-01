---
phase: 29-session-registry-message-bus
plan: 02
subsystem: backend/bridge
tags: [msg-bus, bridge, audit-log, inter-gateway, phase-29]
dependency_graph:
  requires: [msg_bus_events table from Phase 24 migration]
  provides: [logMsgBusEvent, updateMsgBusEvent, msg_bus_events rows on every /agent-message dispatch]
  affects: [backend/src/routes/v1/bridge.ts, Phase 30 intelligence loop reads]
tech_stack:
  added: []
  patterns: [pool.query direct SQL, try/catch non-blocking wrapper, .catch() fire-and-forget on hot path]
key_files:
  created:
    - backend/src/services/msg-bus.ts
  modified:
    - backend/src/routes/v1/bridge.ts
decisions:
  - logMsgBusEvent returns UUID so caller can backfill after dispatch — not fire-and-forget internally
  - updateMsgBusEvent on hot path uses .catch(() => {}) — never blocks response to caller
  - COALESCE on UPDATE — partial updates leave existing values intact (e.g. failed path skips latency)
  - response_payload truncated to 500 chars — keeps msg_bus_events lean for Phase 30 FTS
metrics:
  duration: ~4min
  completed: "2026-04-01T08:25:00Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 29 Plan 02: Message Bus Service Summary

**One-liner:** msg-bus.ts provides `logMsgBusEvent` + `updateMsgBusEvent` wired into `/agent-message` so every inter-gateway dispatch writes a structured envelope to `msg_bus_events`.

## What Was Built

### msg-bus.ts (new)

`backend/src/services/msg-bus.ts` — lightweight service with two exported async functions:

- `logMsgBusEvent(init: MsgBusEventInit): Promise<string>` — inserts a `pending` row to `msg_bus_events` before dispatch; returns the generated UUID.
- `updateMsgBusEvent(id: string, update: MsgBusEventUpdate): Promise<void>` — backfills `status`, `dispatch_log_id`, `latency_ms`, `response_payload`, and `delivered_at` after dispatch completes or fails.

Both functions use `pool.query()` direct SQL matching the existing `msg_bus_events` DDL (from Phase 24). COALESCE guards on UPDATE ensure partial updates don't clobber existing values.

### bridge.ts (modified)

Three addition points in the `POST /agent-message` handler:

1. **Before dispatch** (`~line 473`): `logMsgBusEvent` called inside try/catch — populates the structured envelope with `correlationId`, source/target agent+gateway, intent, task payload, and `hopCount`. Result stored as `msgBusId`.
2. **Error path** (`~line 527`): `updateMsgBusEvent(msgBusId, { status: 'failed' })` — marks failed dispatches without blocking the 502 reply (`.catch(() => {})`).
3. **Success path** (`~line 545`): `updateMsgBusEvent` called after `routingEngine.logDispatch()` — backfills `dispatchLogId`, `latencyMs`, and `responsePayload` (truncated to 500 chars). Non-blocking via `.catch(() => {})`.

MSG-02 (cross-model routing traceability) requires no additional code — `targetGateway → forceGatewayType` was already handled in the routing context, and `correlation_id` in `msg_bus_events` is the link Phase 30 needs to detect handoff patterns.

## Commits

| Hash | Message |
|------|---------|
| `8f06909` | feat(29-02): create msg-bus service with logMsgBusEvent and updateMsgBusEvent |
| `4ab91e8` | feat(29-02): wire msg-bus into POST /agent-message route |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `backend/src/services/msg-bus.ts` exists and exports `logMsgBusEvent` + `updateMsgBusEvent`
- [x] `npx tsc --noEmit` — zero errors
- [x] `grep -n "logMsgBusEvent\|updateMsgBusEvent" bridge.ts` — 4 references (import + 3 call sites)
- [x] Both commits exist: `8f06909`, `4ab91e8`
