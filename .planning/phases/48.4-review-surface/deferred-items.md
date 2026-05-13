# Phase 48.4 deferred items

## From Plan 02 (admin/dreams routes) — 2026-05-13

### tests/smoke-48.4.sh login URL bug (out-of-scope for Plan 02)
- File: tests/smoke-48.4.sh line 58
- Issue: hits POST /api/auth/login (404 Not found). Actual login route is POST /api/v1/auth/login.
- Symptom: all RVS-01..RVS-07 smoke checks [skip] with "admin login failed — cannot test RVS-01..RVS-05 endpoints (login envelope changed?)".
- Owner: Plan 01 (smoke harness owner). Fix is a 1-line URL change: `$API/api/auth/login` → `$API/api/v1/auth/login`.
- Also: the user moe@themozaic.com / password 'porter' returns INVALID_CREDENTIALS — credentials likely need re-confirmation with Moe or smoke needs to seed a known test account.
- Plan 02 verified all 5 endpoints live + correct via direct curl with an existing porter_admin_session cookie:
  - GET /api/admin/dreams/proposals (200, empty list + counts_by_status)
  - GET /api/admin/dreams/runs (200, real run with correlated subquery counts)
  - GET /api/admin/dreams/runs/:id (404 NOT_FOUND on missing)
  - POST /proposals/:id/accept: new_directive happy path (directive INSERTed + proposal flipped + audit event + reviewer='moe' from sessionUser), 404, 409 re-accept, 422 SEALED_SEED, 422 SILO_MISMATCH, 410 TARGET_GONE — all ROLLBACK and leave targets untouched.
  - POST /proposals/:id/reject: 200 with audit event + reason; 404; symmetric atomicity confirmed.
- memory_proposals_expire handler SQL verified inline (UPDATE...RETURNING flipped 1 stale proposal to expired). Workflow seeded with every_24h schedule.
