---
phase: 21
slug: first-run-setup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in Node.js test runner) + tsx |
| **Config file** | none — uses node:test directly |
| **Quick run command** | `npx tsx --test backend/src/__tests__/first-run-setup.test.ts` |
| **Full suite command** | `npx tsx --test backend/src/__tests__/first-run-setup.test.ts` |
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
| 21-01-01 | 01 | 1 | FRS-01, FRS-03 | unit | `npx tsx --test backend/src/__tests__/first-run-setup.test.ts` | ❌ W0 | ⬜ pending |
| 21-02-01 | 02 | 2 | FRS-02, FRS-04 | unit | `npx tsx --test backend/src/__tests__/first-run-setup.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/__tests__/first-run-setup.test.ts` — stubs for FRS-01, FRS-02, FRS-03, FRS-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Zero-config Ollama works on fresh install | FRS-03 | Requires fresh DB + running Ollama | Start Porter with empty DB, verify chat works without any setup |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
