---
phase: 19
slug: model-catalog
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in Node.js test runner) + tsx |
| **Config file** | none — uses node:test directly |
| **Quick run command** | `npx tsx --test backend/src/__tests__/model-catalog.test.ts` |
| **Full suite command** | `npx tsx --test backend/src/__tests__/model-catalog.test.ts` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | MOD-01, MOD-02, MOD-04, MOD-05 | unit | `npx tsx --test backend/src/__tests__/model-catalog.test.ts` | ❌ W0 | ⬜ pending |
| 19-02-01 | 02 | 2 | MOD-02, MOD-04 | unit | `npx tsx --test backend/src/__tests__/model-catalog.test.ts` | ❌ W0 | ⬜ pending |
| 19-02-02 | 02 | 2 | MOD-03, MOD-05 | unit | `npx tsx --test backend/src/__tests__/model-catalog.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/__tests__/model-catalog.test.ts` — stubs for MOD-01, MOD-02, MOD-03, MOD-04, MOD-05 (created in Plan 01, Task 1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Daily model refresh triggers | MOD-02 | Requires time-based scheduler wait | Verify scheduler logs show model refresh at configured interval |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
