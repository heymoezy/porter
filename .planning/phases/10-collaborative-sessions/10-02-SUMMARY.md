---
phase: 10-collaborative-sessions
plan: 02
subsystem: api
tags: [sqlite, fastify, rbac, collaboration, email, nodemailer, drip, scheduler]

# Dependency graph
requires:
  - phase: 10-collaborative-sessions/10-01
    provides: project_collaborators table, collaboration_events table, requireProjectAccess preHandler, ProjectRole types
  - phase: 09-streaming-chat
    provides: requireAuth preHandler, sessionUser decoration
provides:
  - POST /api/v1/projects/:id/collaborators — batch invite with partial failure response
  - GET /api/v1/projects/:id/collaborators — list collaborators with user display info
  - PATCH /api/v1/projects/:id/collaborators/:collab_id — role change with owner-protection
  - DELETE /api/v1/projects/:id/collaborators/:collab_id — soft-revoke with drip cancellation
  - POST /api/v1/collaborators/accept — token-based accept (no auth required), creates pending user
  - sendInviteEmail() and sendDripReminder() in transactional-email.ts
  - scheduleDripReminder() in scheduler.ts with invite_drip job handler
affects: [10-03, chat-routes, files-routes, frontend-v2]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Batch invite with partial failure: 207 response with {succeeded, failed, total}"
    - "Token-based route with no auth preHandler: invite accept uses token as credential"
    - "System agent_id='system' for infrastructure jobs: LEFT JOIN in claimNextJob to bypass persona requirement"
    - "Drip cadence: daily x3, weekly x4, monthly thereafter — up to MAX_DRIP_COUNT=20"
    - "Transaction per invite (not whole batch): sqlite.transaction() wraps each individual invite for atomicity"

key-files:
  created:
    - backend/src/routes/v1/collaborators.ts
    - backend/src/services/transactional-email.ts
  modified:
    - backend/src/routes/v1/index.ts
    - backend/src/services/scheduler.ts

key-decisions:
  - "collaboratorAcceptRoutes exported as second plugin — registered at /collaborators prefix separate from /projects"
  - "claimNextJob LEFT JOIN allows agent_id='system' jobs (drip reminders) without a persona record"
  - "Email and drip scheduling are best-effort after the transaction — invite succeeds even if email fails"
  - "Re-invite of revoked collaborator: generates new token, clears revoke fields, sets status='pending'"
  - "Pending user creation uses INSERT OR IGNORE to handle race conditions, then re-reads the actual username"

patterns-established:
  - "Two-plugin file pattern: default export for project-scoped routes, named export for public routes"
  - "cancelDripJobs() helper: cancels all pending invite_drip jobs for a collaborator on revoke/accept"

requirements-completed: [COLLAB-01, COLLAB-04]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 10 Plan 02: Collaborator Management API Summary

**Batch invite with email and drip scheduling, token-based accept, role change, and soft-revoke — all actions audit-logged to collaboration_events**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-22T09:10:20Z
- **Completed:** 2026-03-22T09:14:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created 5 collaborator management endpoints covering the full lifecycle (invite, list, change role, revoke, accept)
- Owner-protection enforced at two levels: CANNOT_REVOKE_OWNER and CANNOT_MODIFY_OWNER error codes
- Token-based accept route requires no authentication — invite token acts as credential
- Accept endpoint creates pending user account (with hashed password via scrypt) when invitee has no Porter account
- Drip reminder system: agent_jobs with `trigger_type='invite_drip'`, escalating cadence (daily/weekly/monthly), capped at 20 drips
- Fixed `claimNextJob` INNER JOIN issue that would have silently dropped all system drip jobs

## Task Commits

Each task was committed atomically:

1. **Task 1: Create collaborator CRUD routes** - `b3c29c4` (feat)
2. **Task 2: Add invite email templates, drip scheduling, and scheduler handler** - `9d24b11` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `backend/src/routes/v1/collaborators.ts` — all 5 routes: batch invite, list, change role, revoke, accept; two exported Fastify plugins
- `backend/src/services/transactional-email.ts` — new file (untracked before this plan): added sendInviteEmail() and sendDripReminder() with config.publicUrl
- `backend/src/routes/v1/index.ts` — added collaboratorV1Routes (/projects prefix) and collaboratorAcceptRoutes (/collaborators prefix)
- `backend/src/services/scheduler.ts` — scheduleDripReminder() export, invite_drip executeJob handler, LEFT JOIN fix in claimNextJob

## Decisions Made
- **Two-plugin export pattern:** `collaboratorV1Routes` (default) handles all `/projects/:id/collaborators/*` routes. `collaboratorAcceptRoutes` (named) handles `/collaborators/accept` with no auth. Cleaner than a messy prefix escape inside one plugin.
- **LEFT JOIN fix in claimNextJob:** The original INNER JOIN on `personas` would silently exclude `agent_id='system'` drip jobs. Changed to LEFT JOIN with conditional WHERE so system jobs are claimable without a persona record.
- **Email outside transaction:** `sendInviteEmail()` and `scheduleDripReminder()` are called after the transaction commits. Invite succeeds even if email delivery fails — the invite record is already created.
- **scrypt for password hashing in accept:** Matched the existing pattern from `auth.ts` (scrypt via promisify, 32-byte key, hex encoding).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] claimNextJob INNER JOIN blocks system drip jobs**
- **Found during:** Task 2 (scheduler handler implementation)
- **Issue:** `claimNextJob` uses `JOIN personas p ON p.id = aj.agent_id` — an INNER JOIN. Drip jobs use `agent_id='system'` which has no persona record, so they would never be claimed and would sit in the queue forever.
- **Fix:** Changed to `LEFT JOIN personas p ON p.id = aj.agent_id` with a WHERE clause: `aj.agent_id = 'system' OR (p.status != 'retired' AND ...)` — system jobs bypass the persona constraint, regular agent jobs retain all original guards.
- **Files modified:** backend/src/services/scheduler.ts
- **Verification:** TypeScript compiles cleanly, logic reviewed manually
- **Committed in:** 9d24b11 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug, scheduler JOIN)
**Impact on plan:** Critical for drip reminders to actually execute. No scope creep.

## Issues Encountered
- `transactional-email.ts` was untracked in git (created by another session, not yet committed) — treated as a new file to create/stage rather than an existing tracked file to modify. Added to Task 2 commit.

## User Setup Required
None - no external service configuration required. SMTP is optional — if unconfigured, invite emails log to console in dev mode.

## Next Phase Readiness
- Plan 03 (route hardening) can now apply `requireProjectAccess` to all existing project-scoped routes
- The `request.projectRole` decoration from Plan 01 is available in all collaborator route handlers
- Drip system is live — any new invites will automatically get their first drip job scheduled 24h out
- Concern: `project_collaborators_v1_legacy` still present in DB (from Plan 01 migration) — harmless, can be dropped in a future cleanup

## Self-Check: PASSED

- FOUND: backend/src/routes/v1/collaborators.ts
- FOUND: backend/src/services/transactional-email.ts
- FOUND: Task 1 commit b3c29c4
- FOUND: Task 2 commit 9d24b11

---
*Phase: 10-collaborative-sessions*
*Completed: 2026-03-22*
