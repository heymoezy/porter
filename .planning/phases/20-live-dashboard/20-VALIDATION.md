---
phase: 20
slug: smart-routing-engine
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-25
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in Node.js test runner via tsx) |
| **Config file** | None needed — uses `npx tsx --test` |
| **Quick run command** | `npx tsx --test backend/src/__tests__/*.test.ts` |
| **Full suite command** | `npx tsx --test backend/src/__tests__/*.test.ts backend/src/services/stream-service.test.ts` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit` + `npx tsx --test` on relevant test files
- **After every plan wave:** Run `npx tsx --test` on all Phase 20 test files
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-00 | 01 | 1 | RT-01..05 | stubs | `npx tsx --test backend/src/__tests__/*.test.ts` | Plan 01 Task 0 creates | ⬜ pending |
| 20-01-01 | 01 | 1 | RT-02..05 | compilation | `npx tsc --noEmit` | N/A | ⬜ pending |
| 20-01-02 | 01 | 1 | RT-02..05 | compilation | `npx tsc --noEmit` | N/A | ⬜ pending |
| 20-02-01 | 02 | 2 | RT-01..05 | compilation | `npx tsc --noEmit` | N/A | ⬜ pending |
| 20-02-02 | 02 | 2 | RT-01..05 | unit+compilation | `npx tsc --noEmit && npx tsx --test backend/src/services/stream-service.test.ts` | Exists | ⬜ pending |

*Status: ⬜ pending / ✅ green / ❌ red / ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/__tests__/routing-engine.test.ts` — stubs for RT-01, RT-02, RT-04 (created by Plan 01 Task 0)
- [ ] `backend/src/__tests__/dispatch-log.test.ts` — stubs for RT-03 (created by Plan 01 Task 0)
- [ ] `backend/src/__tests__/session-routing.test.ts` — stubs for RT-05 (created by Plan 01 Task 0)

*Wave 0 stubs use node:test (same framework as existing stream-service.test.ts). No vitest install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Concurrent dispatch doesn't saturate VPS | RT-04 | Requires load testing under real conditions | Send 10+ concurrent dispatches, verify queuing via logs |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Plan 01 Task 0 creates stubs)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
