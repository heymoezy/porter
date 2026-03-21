---
phase: 08-api-foundation
plan: 01
subsystem: api
tags: [fastify, envelope, trace-id, x-request-id, response-shape, oauth, webhook]

# Dependency graph
requires: []
provides:
  - "Uniform JSON envelope: {ok: true/false, data/error, meta: {trace_id, timestamp}} on all v1 routes"
  - "Global X-Request-ID header on every HTTP response via onSend hook"
  - "trace_id in body synced to X-Request-ID request ID automatically"
  - "All 16 v1 route groups now conform to API-01 and API-02"
affects: [09-sessions-auth, 10-agent-runtime, 11-unified-chat, all future v1 route phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fastify genReqId: () => crypto.randomUUID() — UUID per request, accessible as request.id"
    - "Global onSend hook syncs trace_id: no per-call-site changes needed for existing 162 call sites"
    - "ok() and err() accept optional traceId param — allows auth plugin to pass request.id directly"
    - "Binary responses and OAuth redirects exempt from envelope — onSend hook skips non-JSON"

key-files:
  created: []
  modified:
    - backend/src/lib/envelope.ts
    - backend/src/index.ts
    - backend/src/plugins/auth.ts
    - backend/src/routes/v1/health.ts
    - backend/src/routes/v1/decisions.ts
    - backend/src/routes/v1/oauth-github.ts
    - backend/src/routes/v1/oauth-google.ts
    - backend/src/routes/v1/webhooks-whatsapp.ts

key-decisions:
  - "onSend hook approach: sync trace_id globally instead of updating 162 call sites — zero churn for conforming routes"
  - "trace_id in both meta object AND error object: API-02 requires error.trace_id matching X-Request-ID header"
  - "Removed standalone meta() function: callers always use ok() or err() — no raw meta construction"

patterns-established:
  - "All v1 JSON responses use ok({...}) or err('CODE', 'message') — no raw reply.send({data:...})"
  - "X-Request-ID header is automatically set on every response by the global onSend hook"
  - "Auth errors use err() helper passing request.id as traceId for immediate header/body alignment"

requirements-completed: [API-01, API-02]

# Metrics
duration: 6min
completed: 2026-03-21
---

# Phase 08 Plan 01: API Response Envelope Summary

**Uniform {ok, data/error, meta: {trace_id}} envelope on all v1 routes with global X-Request-ID header sync via Fastify onSend hook**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-21T19:04:57Z
- **Completed:** 2026-03-21T19:10:48Z
- **Tasks:** 2 of 2
- **Files modified:** 8

## Accomplishments

- Upgraded envelope.ts: added `ok: true/false`, renamed `request_id` to `trace_id`, added `trace_id` inside error object, removed standalone `meta()` function
- Added Fastify `genReqId` config and global `onSend` hook in index.ts — sets `X-Request-ID` header and syncs `trace_id` in JSON bodies across all 162+ existing call sites without touching them
- Fixed 5 non-conforming route files: health.ts and decisions.ts now use `ok()`, OAuth stubs use `err()`, WhatsApp webhook errors use `err()` and acknowledgments use `ok()`
- Auth plugin now uses `err('UNAUTHORIZED', ..., request.id)` instead of hardcoded `{error: {...}, meta: {request_id: ...}}` shape

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade envelope.ts, add global trace ID sync in index.ts, fix auth.ts plugin** - `03a39db` (feat)
2. **Task 2: Fix non-conforming routes to use envelope helpers** - `fdedcae` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `backend/src/lib/envelope.ts` - Complete rewrite: ok/false boolean, trace_id, optional traceId param, no meta()
- `backend/src/index.ts` - genReqId, requestIdHeader, global onSend hook for X-Request-ID + trace_id sync
- `backend/src/plugins/auth.ts` - Replaced hardcoded 401 shape with err() helper
- `backend/src/routes/v1/health.ts` - Wrapped response in ok()
- `backend/src/routes/v1/decisions.ts` - Wrapped response in ok()
- `backend/src/routes/v1/oauth-github.ts` - Stub error uses err('GITHUB_NOT_CONFIGURED')
- `backend/src/routes/v1/oauth-google.ts` - Both stub errors use err('GOOGLE_NOT_CONFIGURED')
- `backend/src/routes/v1/webhooks-whatsapp.ts` - All errors use err(), all ack responses use ok()

## Decisions Made

- **onSend hook strategy:** Rather than updating all 162 existing `ok()`/`err()` call sites to pass `request.id`, the global onSend hook rewrites `meta.trace_id` and `error.trace_id` in the serialized JSON body. This achieves API-02 compliance across all routes with zero per-call-site changes.
- **trace_id in two places:** `meta.trace_id` and `error.trace_id` both set — API-02 specifies trace_id in error object matching X-Request-ID header. Both locations kept consistent.
- **Removed meta() function:** No legitimate use case for constructing meta without data or error context. Callers always construct full ok/err responses.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- **Playwright tests fail (pre-existing, out of scope):** 35 tests fail with `ERR_CONNECTION_REFUSED` connecting to `http://127.0.0.1:8877`. Porter.py listens on `[::1]:8877` (IPv6 SSH tunnel) not IPv4. Unrelated to this plan's changes — tests were failing before execution began. Logged to `deferred-items.md`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All v1 routes now conform to API-01 and API-02 envelope contract
- Any new v1 route added in future phases automatically gets X-Request-ID header via onSend hook
- Plan 02 (08-02) can proceed: TypeScript build, tsc --noEmit verification

---
*Phase: 08-api-foundation*
*Completed: 2026-03-21*
