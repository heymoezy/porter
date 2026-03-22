---
phase: 10
slug: collaborative-sessions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node:test`) + `tsx` for TypeScript |
| **Config file** | None — run via npx tsx --test |
| **Quick run command** | `npx tsx --test backend/src/routes/v1/collaborators.test.ts backend/src/plugins/auth.test.ts` |
| **Full suite command** | `cd tests && npx playwright test` |
| **Estimated runtime** | ~15 seconds (unit) / ~60 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npx tsx --test backend/src/routes/v1/collaborators.test.ts backend/src/plugins/auth.test.ts`
- **After every plan wave:** Run `cd tests && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | COLLAB-01 | unit | `npx tsx --test backend/src/routes/v1/collaborators.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | COLLAB-01 | unit | `npx tsx --test backend/src/routes/v1/collaborators.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 1 | COLLAB-02 | unit | `npx tsx --test backend/src/plugins/auth.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 1 | COLLAB-02 | unit | `npx tsx --test backend/src/plugins/auth.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 2 | COLLAB-03 | unit | `npx tsx --test backend/src/routes/v1/collaborators.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-02 | 03 | 2 | COLLAB-03 | unit | `npx tsx --test backend/src/routes/v1/collaborators.test.ts` | ❌ W0 | ⬜ pending |
| 10-04-01 | 04 | 2 | COLLAB-04 | unit | `npx tsx --test backend/src/routes/v1/collaborators.test.ts` | ❌ W0 | ⬜ pending |
| 10-04-02 | 04 | 2 | COLLAB-04 | unit | `npx tsx --test backend/src/plugins/auth.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/routes/v1/collaborators.test.ts` — stubs for COLLAB-01, COLLAB-03, COLLAB-04
- [ ] `backend/src/plugins/auth.test.ts` — stubs for COLLAB-02 (requireProjectAccess role hierarchy + platform_admin bypass + IDOR)
- [ ] `backend/src/db/migrate-10.ts` — migration must run before any tests

*Existing infrastructure covers email sending (transactional-email.ts) and scheduling (scheduler.ts).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| requireProjectAccess used in preHandler, not in handler body | COLLAB-02 | Code structure check, not runtime behavior | Grep all project-scoped routes: verify preHandler array contains requireProjectAccess, no role checks inside handler functions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
