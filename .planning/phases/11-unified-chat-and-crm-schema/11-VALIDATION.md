---
phase: 11
slug: unified-chat-and-crm-schema
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-22
---

# Phase 11 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | curl-based API smoke tests + Playwright (existing regression) |
| **Smoke script** | `tests/smoke-phase11.sh` (created in Plan 01, Task 3) |
| **Quick run command** | `bash tests/smoke-phase11.sh` |
| **Full suite command** | `bash tests/smoke-phase11.sh && cd tests && npx playwright test` |
| **Estimated runtime** | ~30 seconds |

**Note:** Phase 11 is pure backend API with zero frontend. The 35 existing Playwright tests verify UI elements that Phase 11 does not touch. The validation approach is curl-based API smoke tests (per RESEARCH.md recommendation), not vitest unit tests.

---

## Sampling Rate

- **After every task commit:** `cd /home/lobster/documents/porter && npx tsc --noEmit -p backend/tsconfig.json` (type check) + `cd tests && npx playwright test` (regression)
- **After every plan wave:** Targeted curl verification per the plan's `<verify>` blocks + full Playwright suite
- **Before `/gsd:verify-work`:** `bash tests/smoke-phase11.sh && cd tests && npx playwright test` -- both must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 11-01-01 | 01 | 1 | all | grep | `grep -c "CREATE TABLE\|CREATE VIRTUAL TABLE" backend/src/db/migrate-11.ts` | pending |
| 11-01-02 | 01 | 1 | all | grep | `grep -c "export const" backend/src/db/schema.ts && grep "migrate11" backend/src/index.ts` | pending |
| 11-01-03 | 01 | 1 | all | file-check | `test -x tests/smoke-phase11.sh && grep -c "CHAT-\|CRM-\|FILE-" tests/smoke-phase11.sh` | pending |
| 11-02-01 | 02 | 2 | CHAT-01,02,03 | grep | `grep -c "fastify\.\(get\|post\|patch\|delete\)" backend/src/routes/v1/conversations.ts` | pending |
| 11-02-02 | 02 | 2 | CHAT-01 | grep | `grep "conversationV1Routes" backend/src/routes/v1/index.ts && grep "chatV1Routes" backend/src/routes/v1/index.ts` | pending |
| 11-03-01 | 03 | 2 | CRM-01,02 | grep | `grep -c "fastify\.\(get\|post\|patch\|delete\)" backend/src/routes/v1/contacts.ts` | pending |
| 11-03-02 | 03 | 2 | FILE-02 | grep | `grep -c "registry/upload\|sqlite.transaction\|fs.unlink" backend/src/routes/v1/files.ts` | pending |
| 11-03-03 | 03 | 2 | FILE-01,03 | grep | `grep -c "registry" backend/src/routes/v1/files.ts` | pending |
| 11-03-04 | 03 | 2 | CRM-01 | grep | `grep "contactV1Routes" backend/src/routes/v1/index.ts` | pending |
| 11-04-01 | 04 | 3 | CHAT-04 | grep | `grep -c "export function findOrCreate" backend/src/services/whatsapp.ts` | pending |
| 11-04-02 | 04 | 3 | CHAT-04 | grep | `grep -c "findOrCreate\|INSERT INTO messages\|unified" backend/src/routes/v1/webhooks-whatsapp.ts` | pending |
| 11-05-01 | 05 | 3 | CHAT-04 | grep | `grep -c "findOrCreateEmail\|INSERT INTO messages" backend/src/services/email.ts` | pending |
| 11-05-02 | 05 | 3 | CHAT-04 | grep | `grep -c "archiveOutboundMessage\|INSERT INTO messages\|unified" backend/src/services/external-dispatcher.ts` | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

All Wave 0 artifacts are created by Plan 01 (wave 1):

- [x] `tests/smoke-phase11.sh` -- curl-based smoke test script covering all 9 Phase 11 requirements (Plan 01, Task 3)
- [x] `backend/src/db/migrate-11.ts` -- migration file creating all tables (Plan 01, Task 1)
- [x] `backend/src/db/schema.ts` -- Drizzle ORM exports for new tables (Plan 01, Task 2)
- [x] `backend/src/index.ts` -- boot registration of migrate-11 (Plan 01, Task 2)

**No vitest stubs needed.** Phase 11 uses curl-based smoke tests per RESEARCH.md validation architecture. The existing Playwright tests provide regression coverage for unchanged UI behavior.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| File upload disk cleanup on DB failure | FILE-02 | Requires simulated DB failure mid-transaction | 1. Upload file with invalid project_id, 2. Verify 404 returned, 3. Check upload dir for orphan files |
| WhatsApp inbound end-to-end | CHAT-04 | Requires live WhatsApp webhook payload | 1. Send test message via WhatsApp, 2. Check GET /conversations returns it |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (smoke script + migration + schema)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
