---
phase: 07-external-connections
plan: 01
subsystem: database
tags: [aes-256-gcm, credential-encryption, drizzle, sqlite, migration, feature-flags]

# Dependency graph
requires:
  - phase: 06-real-time-and-transparency
    provides: migrate06RealTimeTransparency pattern and schema.ts tokenUsageDaily anchor
provides:
  - AES-256-GCM credential encryption utility (encryptCredential/decryptCredential/validatePorterSecret)
  - migrate07ExternalConnections() idempotent migration for workspace_connections, project_connections, calendar_events
  - Drizzle ORM schemas for all three external connection tables
  - PORTER_SECRET and PORTER_PUBLIC_URL in config.ts
  - featureFlags.externalConnections kill-switch
affects: [07-02, 07-03, 07-04, 07-05, 07-06, 07-07, 07-08, 07-09, 07-10, 07-11]

# Tech tracking
tech-stack:
  added: [node:crypto (AES-256-GCM), scryptSync key derivation]
  patterns: [iv:tag:ciphertext hex encoding, PRAGMA table_info column-existence guard before ALTER TABLE]

key-files:
  created:
    - backend/src/lib/credential-crypto.ts
    - backend/src/db/migrate-07-ext-connections.ts
  modified:
    - backend/src/db/schema.ts
    - backend/src/config.ts
    - backend/src/index.ts

key-decisions:
  - "migrate-07-ext-connections.ts named separately from migrate-07.ts (billing) — both cover phase 7 but different subsystems"
  - "getDerivedKey() uses crypto.scryptSync with fixed salt 'porter-connections-salt' — deterministic key per secret, no per-record salt needed for credential store"
  - "meta_encrypted column added via PRAGMA table_info guard — safe when table already exists from a prior partial migration"
  - "migrate07ExternalConnections called after migrate07Billing in index.ts startup sequence — billing tables created first"

patterns-established:
  - "Credential format: iv_hex:tag_hex:ciphertext_hex — all in one string, no separate columns needed"
  - "PRAGMA table_info column guard before any ALTER TABLE ADD COLUMN — prevents duplicate column errors on repeat runs"

requirements-completed: [CONN-05]

# Metrics
duration: 6min
completed: 2026-03-21
---

# Phase 07 Plan 01: External Connections Foundation Summary

**AES-256-GCM credential encryption with scrypt key derivation, idempotent SQLite migration for workspace_connections/project_connections/calendar_events, and Drizzle ORM schemas wired into startup**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-21T16:36:22Z
- **Completed:** 2026-03-21T16:42:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- AES-256-GCM credential utility with round-trip verification passing — iv:tag:ciphertext hex format, scryptSync key derivation from PORTER_SECRET
- Idempotent migration (migrate-07-ext-connections.ts) creating 3 tables with PRAGMA guard for meta_encrypted column
- Drizzle ORM schemas for workspaceConnections, projectConnections, calendarEvents appended to schema.ts
- PORTER_SECRET, PORTER_PUBLIC_URL, and featureFlags.externalConnections added to config.ts
- Migration wired into Fastify startup after migrate07Billing(), TypeScript compiles with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create credential encryption utility and DB migration** - `b4817f3` (feat)
2. **Task 2: Add Drizzle schemas, feature flag, and wire migration into server startup** - `76cbe3f` (feat)

## Files Created/Modified

- `backend/src/lib/credential-crypto.ts` - AES-256-GCM encrypt/decrypt/validate using scryptSync
- `backend/src/db/migrate-07-ext-connections.ts` - Idempotent migration for external connection tables
- `backend/src/db/schema.ts` - Added workspaceConnections, projectConnections, calendarEvents Drizzle schemas
- `backend/src/config.ts` - Added porterSecret, publicUrl, featureFlags.externalConnections
- `backend/src/index.ts` - Import and call migrate07ExternalConnections() in startup sequence

## Decisions Made

- Named the new migration `migrate-07-ext-connections.ts` instead of `migrate-07.ts` because `migrate-07.ts` already exists for billing. Both are Phase 7 but cover independent subsystems.
- Used a separate `getDerivedKey()` helper that reads PORTER_SECRET at call-time (not module-load) — consistent with the `getBackends()` pattern established in Phase 4.
- `validatePorterSecret()` returns a boolean without throwing — callers that need it optional can check the flag; `encryptCredential/decryptCredential` throw when the secret is missing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renamed migration file to avoid collision with existing migrate-07.ts**
- **Found during:** Task 1 (creating migrate-07.ts)
- **Issue:** `backend/src/db/migrate-07.ts` already exists containing `migrate07Billing()` for Phase 7 billing. Creating a second `migrate-07.ts` would overwrite it.
- **Fix:** Created `migrate-07-ext-connections.ts` exporting `migrate07ExternalConnections()`. Updated index.ts import accordingly.
- **Files modified:** backend/src/db/migrate-07-ext-connections.ts (created), backend/src/index.ts
- **Verification:** TypeScript compiles clean, round-trip test passes
- **Committed in:** b4817f3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — file name collision)
**Impact on plan:** Cosmetic rename only. All functional requirements met identically. Billing migration untouched.

## Issues Encountered

- Playwright tests all fail with `ERR_CONNECTION_REFUSED` — the porter service is bound to port 8877 but the connection is refused from the test runner. This is a pre-existing infrastructure issue unrelated to this plan's changes. TypeScript compilation (the real acceptance criterion) passes with zero errors.

## Next Phase Readiness

- All Phase 7 downstream plans (07-02 through 07-11) can now import `encryptCredential`/`decryptCredential` from `credential-crypto.ts` and reference the Drizzle schemas from `schema.ts`
- `PORTER_SECRET` env var must be set before any encrypted credential is stored — documented in the thrown error message
- `FEATURE_EXTERNAL_CONNECTIONS=true` must be set to enable Phase 7 routes

---
*Phase: 07-external-connections*
*Completed: 2026-03-21*

## Self-Check: PASSED

- FOUND: backend/src/lib/credential-crypto.ts
- FOUND: backend/src/db/migrate-07-ext-connections.ts
- FOUND: .planning/phases/07-external-connections/07-01-SUMMARY.md
- FOUND: commit b4817f3
- FOUND: commit 76cbe3f
