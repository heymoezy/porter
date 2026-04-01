---
phase: 29-session-registry-message-bus
plan: "01"
subsystem: backend/session-registry
tags:
  - session-tracking
  - token-accounting
  - recall
  - bridge
dependency_graph:
  requires:
    - session_registry table (Phase 24 migration)
    - concepts table (Memory V3)
    - bridge_dispatch_log table
  provides:
    - upsertSession — called from logDispatch on every dispatch
    - openSession — opens fresh session rows
    - rotateSession — closes session, writes Recall concept, opens new session
    - getActiveSessions — returns active session snapshot
  affects:
    - backend/src/services/bridge/routing-engine.ts (logDispatch hook)
tech_stack:
  added: []
  patterns:
    - "pool.query() for all DB ops (no Drizzle ORM)"
    - "fire-and-forget try/catch pattern matching awardXP in logDispatch"
    - "INSERT INTO concepts with source_type='session' for rotation recall"
key_files:
  created:
    - backend/src/services/session-registry.ts
  modified:
    - backend/src/services/bridge/routing-engine.ts
decisions:
  - "message_text does not exist in bridge_dispatch_log — used COALESCE(NULLIF(intent,''), LEFT(chosen_reason, 80)) for rotation summary snippets"
  - "upsertSession uses OR logic for chatId/agentId lookup — session can be keyed on either identifier"
  - "context_pct stored in metadata JSONB as float; getActiveSessions casts it via parseFloat"
metrics:
  duration: "~5min"
  completed_date: "2026-04-01"
  tasks_completed: 2
  files_changed: 2
---

# Phase 29 Plan 01: Session Registry Service Summary

**One-liner:** Per-session token accounting via session-registry.ts with upsertSession hooked into logDispatch and rotateSession writing Recall concepts to the concepts table.

## What Was Built

### session-registry.ts (new)

Four exported functions:

- **openSession(chatId, agentId, username, gatewayType, modelName, tokenBudget)** — INSERTs a fresh `session_registry` row with `status='active'`, `tokens_used=0`, `metadata.context_pct=0`. Returns new session id.

- **upsertSession(chatId, agentId, tokensToAdd, gatewayType, modelName, tokenBudget)** — Finds existing active session by `(chat_id OR agent_id)`, falls back to `openSession` if none found. UPDATEs `tokens_used`, `context_msgs`, `last_active_at`, and `metadata.context_pct` via `jsonb_set`. Returns `{ sessionId, tokensUsed, contextPct }`.

- **rotateSession(sessionId)** — Marks outgoing session `status='rotated'`, queries `bridge_dispatch_log` for distinct intent/chosen_reason snippets during the session's lifetime, builds a ≤300-char summary, INSERTs a concept row (`source_type='session'`, `trust_tier='medium'`, `scope='agent'`, `confidence_score=60`), then calls `openSession` with the same identity. Returns new session id.

- **getActiveSessions()** — Returns all `status='active'` rows with `context_pct` parsed from `metadata` JSONB, ordered by `last_active_at DESC`.

### routing-engine.ts (modified)

Added import and fire-and-forget block inside `logDispatch`:

1. Import: `import { upsertSession } from '../session-registry.js'`
2. After `awardXP` call: resolves `context_window` from `models` table for this gateway+model (non-fatal if missing), then calls `upsertSession`. Entire block in `try/catch` — never blocks dispatch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] bridge_dispatch_log has no message_text column**
- **Found during:** Task 1 (rotateSession implementation)
- **Issue:** Plan specified `COALESCE(intent, LEFT(message_text, 80))` but `message_text` does not exist in `bridge_dispatch_log`
- **Fix:** Used `COALESCE(NULLIF(intent,''), LEFT(chosen_reason, 80))` — `chosen_reason` is always present (NOT NULL in schema) and provides dispatch context
- **Files modified:** `backend/src/services/session-registry.ts` (rotateSession query only)
- **Commit:** 06b2fbe

## Verification Results

All success criteria met:

- `session-registry.ts` created with all 4 exports: `openSession`, `upsertSession`, `rotateSession`, `getActiveSessions`
- `upsertSession` called inside `routing-engine.ts` `logDispatch` fire-and-forget block
- `rotateSession` writes Recall concept (`INSERT INTO concepts`, `source_type='session'`) before opening new session
- `npx tsc --noEmit` exits 0 — zero TypeScript errors

## Self-Check: PASSED

- [x] `backend/src/services/session-registry.ts` — file exists (317 lines)
- [x] `backend/src/services/bridge/routing-engine.ts` — modified (upsertSession import + call confirmed)
- [x] Commit `06b2fbe` — feat(29-01): create session-registry.ts service
- [x] Commit `a96ece1` — feat(29-01): hook upsertSession into logDispatch fire-and-forget block
- [x] Zero TypeScript errors
