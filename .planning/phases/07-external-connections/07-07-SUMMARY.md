---
phase: 07-external-connections
plan: 07
subsystem: api
tags: [google-calendar, googleapis, oauth2, scheduler, event-triggers, calendar-sync]

requires:
  - phase: 07-02
    provides: credential-crypto module (encryptCredential, decryptCredential) and workspace_connections table with meta_json + meta_encrypted columns

provides:
  - Google Calendar service module (syncCalendarEvents, pushMilestoneToCalendar, getProjectCalendarEvents, checkCalendarDeadlines)
  - Scheduler periodic calendar sync (every 60s, guarded by externalConnections flag and connection existence)
  - Deadline agent jobs from calendar events linked to projects

affects:
  - plan-10 (frontend calendar event display on project dashboard)
  - event-triggers (deadline-approaching pattern extended to calendar sources)
  - scheduler (tick now does calendar sync + deadline check)

tech-stack:
  added: [googleapis@^latest (OAuth2 calendar client)]
  patterns:
    - googleapis auth token auto-refresh via 'tokens' event listener with encrypted credential update
    - Calendar sync guarded by feature flag + connection existence check before API call
    - checkCalendarDeadlines mirrors insertTriggerJob pattern from event-triggers.ts with inline dedup

key-files:
  created:
    - backend/src/services/calendar.ts
  modified:
    - backend/src/services/scheduler.ts
    - backend/package.json

key-decisions:
  - "googleapis installed as npm dependency — not in original package.json, added as Rule 3 auto-fix"
  - "encryptCredential imported alongside decryptCredential to persist refreshed access_token back to workspace_connections"
  - "checkCalendarDeadlines implements its own dedup inline (not via insertTriggerJob) because it needs calendar-specific trigger_data structure"
  - "project matching from calendar events: extendedProperties porter_project_id first, then description regex 'Project: <name>' fallback"
  - "calendar sync only runs when both externalConnections flag AND a connected google_calendar connection exist — avoids wasted API calls"

patterns-established:
  - "Calendar event project association: extendedProperties.private.porter_project_id (set on push) or description regex match"
  - "Token refresh persistence: auth.on('tokens') listener re-encrypts and saves updated access_token to workspace_connections"

requirements-completed: [CONN-03]

duration: 4min
completed: 2026-03-21
---

# Phase 07 Plan 07: Google Calendar Integration Summary

**Bidirectional Google Calendar sync via googleapis OAuth2: event ingestion, milestone push, and deadline-approaching agent job triggers wired into scheduler**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T18:13:38Z (SGT 02:13)
- **Completed:** 2026-03-21T18:17Z (SGT 02:17)
- **Tasks:** 2
- **Files modified:** 3 (calendar.ts created, scheduler.ts modified, package.json modified)

## Accomplishments
- Created `calendar.ts` with 5 exported functions covering full bidirectional calendar integration
- googleapis OAuth2 auto-refresh token rotation persisted back to encrypted workspace_connections
- Scheduler tick now syncs Google Calendar every 60 seconds when feature flag + connection both present
- Calendar deadlines fire `deadline-approaching` agent jobs using same dedup pattern as event-triggers.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Google Calendar service module** - `97ba428` (feat)
2. **Task 2: Wire calendar sync into scheduler tick** - `cfedb8b` (feat)

**Plan metadata:** committed with docs commit below

## Files Created/Modified
- `backend/src/services/calendar.ts` - Google Calendar OAuth2 client, sync, milestone push, deadline check
- `backend/src/services/scheduler.ts` - Calendar sync block added to tick (every 60s, feature-flagged)
- `backend/package.json` - googleapis dependency added

## Decisions Made
- googleapis was missing from package.json; installed via `npm install googleapis` (Rule 3 auto-fix)
- Used `encryptCredential` alongside `decryptCredential` so refreshed access tokens are persisted back to the DB
- Inline dedup in `checkCalendarDeadlines` (not via `insertTriggerJob`) because trigger_data structure for calendar events differs from project deadline triggers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] googleapis not in package.json**
- **Found during:** Task 1 (Create Google Calendar service module)
- **Issue:** `import { google } from 'googleapis'` would fail at runtime — package not installed
- **Fix:** Ran `npm install googleapis --save` in backend/
- **Files modified:** backend/package.json
- **Verification:** TypeScript compilation passes (exit 0), googleapis in node_modules
- **Committed in:** 97ba428 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking dependency)
**Impact on plan:** Essential — plan cannot work without googleapis. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in `oauth-github.ts` (githubOAuth2 property) and `oauth-google.ts` (missing email.js module) — both unrelated to this plan, already present before execution. No fix applied per scope boundary rule.

## Next Phase Readiness
- Calendar service ready for Plan 10 (frontend calendar display on project dashboard)
- `getProjectCalendarEvents(projectId)` exposes the data needed for timeline rendering
- Token refresh is automatic — no manual re-auth unless 401 marks connection needs_reauth

---
*Phase: 07-external-connections*
*Completed: 2026-03-21*
