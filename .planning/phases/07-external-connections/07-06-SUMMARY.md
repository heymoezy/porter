---
phase: 07-external-connections
plan: 06
subsystem: api
tags: [email, gmail, imap, oauth2, nodemailer, imapflow, google]

# Dependency graph
requires:
  - phase: 07-02
    provides: workspace_connections schema, credential-crypto.ts, connections routes

provides:
  - Google OAuth2 routes (/api/v1/oauth/google/start + /callback)
  - Email outbound via nodemailer OAuth2 transport
  - IMAP IDLE inbound listener with auto-reconnect
  - Email routing rules + AI fallback to Porter agent
  - Auto-start IMAP IDLE on server boot when email connected
  - Clean IMAP shutdown via Fastify onClose hook

affects: [07-07-calendar, connections-ui, agent-autonomy]

# Tech tracking
tech-stack:
  added: [nodemailer@8.0.3, imapflow@1.2.16, googleapis@171.4.0, @fastify/oauth2@8.2.0, @types/nodemailer]
  patterns: [OAuth2 token storage as encrypted meta_json, IMAP IDLE reconnect loop with failure cap, inbound email to agent_job dispatch]

key-files:
  created:
    - backend/src/routes/v1/oauth-google.ts
    - backend/src/services/email.ts (replaced stub)
  modified:
    - backend/src/routes/v1/index.ts
    - backend/src/index.ts
    - backend/package.json

key-decisions:
  - "workspace_connections has no UNIQUE on provider — upsert uses SELECT + INSERT/UPDATE pattern rather than ON CONFLICT"
  - "startImapIdle is fire-and-forget — called without await from server startup and OAuth callback"
  - "Dynamic import of email.js from oauth-google.ts callback avoids circular dependency at module load time"
  - "callbackUriParams includes prompt=consent to force refresh_token from Google on every OAuth flow"
  - "Both email and google_calendar connections share the same encrypted token blob — same Google OAuth grant covers both"
  - "IMAP IDLE degrades to degraded status after MAX_CONSECUTIVE_FAILURES=3 failures — emits SSE toast"
  - "routeInboundEmail falls back to Porter master agent when no routing rule matches — AI-based routing"
  - "60-second dedup window on inbound email agent_jobs prevents duplicate dispatch on rapid reconnects"

patterns-established:
  - "Google OAuth upsertConnection: SELECT id first, then UPDATE existing or INSERT new — no UNIQUE constraint needed"
  - "IMAP IDLE reconnect loop: async recursive connect() with consecutive failure counter, 5s backoff"
  - "Email auth error detection: check message for invalid_grant/Token has been expired — markNeedsReauth()"

requirements-completed: [CONN-02]

# Metrics
duration: 8min
completed: 2026-03-21
---

# Phase 07 Plan 06: Email Integration Summary

**Google OAuth2 flow stores encrypted Gmail+Calendar tokens; nodemailer sends outbound OAuth2 email; imapflow IMAP IDLE dispatches inbound emails to agents**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-21T16:53:42Z
- **Completed:** 2026-03-21T17:01:10Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Google OAuth2 routes that store a single encrypted token blob covering both Gmail and Google Calendar access
- nodemailer OAuth2 transport for outbound email with agent name attribution ("AgentName via Porter")
- IMAP IDLE listener via imapflow with auto-reconnect loop (max 3 consecutive failures before marking degraded)
- Inbound email routing: pattern-based rules against from address + AI fallback to Porter master agent
- IMAP IDLE auto-starts on server boot when a connected email connection exists in workspace_connections
- Clean IMAP logout on server shutdown via Fastify onClose hook

## Task Commits

1. **Task 1: Install packages, create Google OAuth routes** - `f9c8820` (feat)
2. **Task 2: Create email service (nodemailer + IMAP IDLE)** - `2dbbfa9` (feat)
3. **Task 3: Wire IMAP IDLE into server startup and shutdown** - `aa90794` (feat)

## Files Created/Modified
- `backend/src/routes/v1/oauth-google.ts` - Google OAuth2 start+callback routes; creates email + google_calendar connections
- `backend/src/services/email.ts` - Full email service: sendEmail, startImapIdle, stopImapIdle, routeInboundEmail
- `backend/src/routes/v1/index.ts` - Registered oauthGoogleRoutes at /oauth/google prefix
- `backend/src/index.ts` - Added startImapIdle/stopImapIdle wiring; onClose hook; auto-start after listen()
- `backend/package.json` - Added nodemailer, imapflow, googleapis, @fastify/oauth2, @types/nodemailer

## Decisions Made
- No UNIQUE constraint on workspace_connections.provider — used SELECT+INSERT/UPDATE upsert instead of ON CONFLICT
- Dynamic import of email.js inside the OAuth callback to avoid circular module dependency
- Both email and google_calendar connections share the same encrypted Google token (one OAuth grant covers all scopes)
- callbackUriParams includes `prompt: 'consent'` to ensure Google always returns a refresh_token

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] upsertConnection helper to work around missing UNIQUE constraint**
- **Found during:** Task 1 (Google OAuth callback implementation)
- **Issue:** Plan specified `ON CONFLICT (provider)` upsert but workspace_connections has no UNIQUE constraint on provider column — migration-07-ext-connections.ts confirms no such constraint
- **Fix:** Created `upsertConnection()` helper that SELECTs first, then UPDATEs existing or INSERTs new row
- **Files modified:** backend/src/routes/v1/oauth-google.ts
- **Verification:** TypeScript compilation passes; logic verified against schema
- **Committed in:** f9c8820 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — schema mismatch with plan assumption)
**Impact on plan:** Required fix for correctness. No scope creep.

## Issues Encountered
- email.ts stub already existed (prior plan created it). Full implementation replaced the stub — stub had a dynamic `import('imapflow' as string)` workaround that is no longer needed since imapflow is now a proper dependency.

## User Setup Required
**External services require manual configuration** before Google OAuth will function:

1. Create a Google Cloud project with OAuth 2.0 credentials (Web application type)
2. Add authorized redirect URI: `{PORTER_PUBLIC_URL}/api/v1/oauth/google/callback`
3. Enable Gmail API and Google Calendar API in the Google Cloud Console
4. Set environment variables:
   - `GOOGLE_CLIENT_ID` — from Google Cloud Console OAuth credentials
   - `GOOGLE_CLIENT_SECRET` — from same credentials page
   - `PORTER_PUBLIC_URL` — public-facing URL for redirect URIs

## Next Phase Readiness
- Google OAuth routes ready; Plan 07-07 (Calendar integration) can reuse the same token stored in google_calendar connection
- IMAP IDLE infrastructure is live — inbound emails will route to agents once connection is configured
- Email routing rules can be added to meta_json under `routing_rules` key (pattern + agent_id array)

---
*Phase: 07-external-connections*
*Completed: 2026-03-21*
