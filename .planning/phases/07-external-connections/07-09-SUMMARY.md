---
phase: 07-external-connections
plan: 09
subsystem: external-connections
tags: [scheduler, dispatcher, connections-ui, oauth, blocked-status]
dependency_graph:
  requires: [07-05, 07-06, 07-07, 07-08]
  provides: [external-dispatcher, queueExternalCall, blocked-status-gating, oauth-connect-ui]
  affects: [scheduler, connections-frontend]
tech_stack:
  added: []
  patterns: [job-routing, blocked-status, oauth-redirect, sse-real-time]
key_files:
  created:
    - backend/src/services/external-dispatcher.ts
  modified:
    - backend/src/services/scheduler.ts
    - frontend/src/modules/connections/ConnectionsPage.tsx
decisions:
  - "dispatchExternalCall routes external_call jobs by service key (github/email/calendar/whatsapp)"
  - "checkConnectionHealth maps service to provider column — returns blocked when no row or non-connected status"
  - "executeJob external_call branch returns early before AI router — completely bypasses LLM dispatch"
  - "Blocked jobs auto-unblock on 30s tick interval when checkConnectionHealth returns ok"
  - "OAuth connect uses window.location.href redirect (not popup) — simpler and more reliable"
  - "WhatsApp prerequisite callout checks /api/admin/health publicUrl field — shown only when disconnected"
  - "Post-OAuth query params (?connected= ?error=) cleaned via history.replaceState — no browser history pollution"
metrics:
  duration: "3min"
  completed_date: "2026-03-21"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 3
---

# Phase 07 Plan 09: External Dispatcher + Connections UI Summary

**One-liner:** External call dispatcher routing all 4 services through background jobs with blocked-status gating, plus OAuth connect buttons and SSE-driven real-time status in ConnectionsPage.

## What Was Built

### Task 1: external-dispatcher.ts + scheduler.ts wiring (commit 891f5bd)

Created `backend/src/services/external-dispatcher.ts` with three exports:

- **`queueExternalCall(agentId, projectId, service, action, params)`** — canonical utility for creating `external_call` agent_jobs without blocking the caller. Inserts with `trigger_type='external_call'` and merges `{service, action, ...params}` into `trigger_data`.

- **`dispatchExternalCall(triggerData)`** — routes to service-specific dispatcher (github/email/calendar/whatsapp). Each sub-dispatcher routes by `action` key to the correct service module function.

- **`checkConnectionHealth(service)`** — maps service name to `provider` column value, queries `workspace_connections`, returns `'ok'` only when `status = 'connected'`, `'blocked'` otherwise.

Updated `backend/src/services/scheduler.ts`:
- Added `import { dispatchExternalCall, checkConnectionHealth }` from external-dispatcher
- Added `external_call` branch at top of `executeJob()` — pre-checks connection health, sets job to `'blocked'` status (not failed) when connection unavailable, dispatches to `dispatchExternalCall` on success
- Added periodic unblock check every 30s: scans `blocked` + `external_call` jobs, re-queues to `pending` when connection restored

### Task 2: ConnectionsPage OAuth connect flow (commit 8c57f12)

Updated `frontend/src/modules/connections/ConnectionsPage.tsx`:
- **Service definitions** now include `connectMethod: 'oauth' | 'api_key'` and `oauthUrl` for OAuth providers
- **OAuth redirect**: GitHub and Google (Email + Calendar) use `window.location.href = oauthUrl` — no popup
- **WhatsApp prerequisite**: Checks `/api/admin/health` for `publicUrl` — shows callout "WhatsApp requires a public HTTPS URL. Set PORTER_PUBLIC_URL first." when disconnected and URL not configured
- **Post-OAuth feedback**: On mount, reads `?connected=` and `?error=` query params, shows success/error banners, cleans params via `history.replaceState`
- **SSE real-time**: `useSSEHub('connection:status', ...)` updates service card status without page refresh

### Task 3: checkpoint:human-verify (APPROVED)

Human reviewer approved the complete Connections page. Visual verification confirmed all 4 service cards render correctly with proper OAuth connect flows.

## Deviations from Plan

None — plan executed exactly as written.

## Auth Gates

None encountered during execution.

## Self-Check

### Files verified:

- `backend/src/services/external-dispatcher.ts` — exists, exports `queueExternalCall`, `dispatchExternalCall`, `checkConnectionHealth`
- `backend/src/services/scheduler.ts` — updated with import and external_call dispatch branch
- `frontend/src/modules/connections/ConnectionsPage.tsx` — updated with OAuth flow, SSE subscription, prerequisite check

### Commits verified:

- `891f5bd` — feat(07-09): create external-dispatcher and wire into scheduler
- `8c57f12` — feat(07-09): update ConnectionsPage with OAuth connect buttons

### TypeScript: PASS (both backend and frontend)

## Self-Check: PASSED
