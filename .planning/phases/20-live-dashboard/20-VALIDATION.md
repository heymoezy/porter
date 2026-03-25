---
phase: 20
slug: smart-routing-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `backend/vitest.config.ts` or "none — Wave 0 installs" |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | RT-01 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | RT-02 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 20-01-03 | 01 | 1 | RT-03 | integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| 20-01-04 | 01 | 1 | RT-04 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 20-01-05 | 01 | 1 | RT-05 | integration | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/__tests__/routing-engine.test.ts` — stubs for RT-01, RT-02, RT-04
- [ ] `backend/src/__tests__/dispatch-log.test.ts` — stubs for RT-03
- [ ] `backend/src/__tests__/session-routing.test.ts` — stubs for RT-05

*Existing vitest infrastructure covers framework install.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Concurrent dispatch doesn't saturate VPS | RT-04 | Requires load testing under real conditions | Send 10+ concurrent dispatches, verify queuing via logs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
