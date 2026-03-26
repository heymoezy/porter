---
phase: 18
slug: resilience-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in Node.js test runner) + tsx |
| **Config file** | none — uses node:test directly |
| **Quick run command** | `npx tsx --test backend/src/__tests__/circuit-breaker.test.ts backend/src/__tests__/retry.test.ts backend/src/__tests__/health-probe.test.ts backend/src/__tests__/fallback-chain.test.ts` |
| **Full suite command** | `npx tsx --test backend/src/__tests__/circuit-breaker.test.ts backend/src/__tests__/retry.test.ts backend/src/__tests__/health-probe.test.ts backend/src/__tests__/fallback-chain.test.ts backend/src/__tests__/routing-engine.test.ts` |
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
| 18-01-01 | 01 | 1 | GW-04, GW-05 | unit | `npx tsx --test backend/src/__tests__/circuit-breaker.test.ts backend/src/__tests__/retry.test.ts` | ❌ W0 | ⬜ pending |
| 18-02-01 | 02 | 2 | GW-02 | unit | `npx tsx --test backend/src/__tests__/health-probe.test.ts` | ❌ W0 | ⬜ pending |
| 18-03-01 | 03 | 2 | GW-06 | unit | `npx tsx --test backend/src/__tests__/fallback-chain.test.ts` | ❌ W0 | ⬜ pending |
| 18-03-02 | 03 | 2 | GW-06 | integration | `npx tsc --noEmit && npx tsx --test backend/src/__tests__/fallback-chain.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/__tests__/circuit-breaker.test.ts` — stubs for GW-04
- [ ] `backend/src/__tests__/retry.test.ts` — stubs for GW-05
- [ ] `backend/src/__tests__/health-probe.test.ts` — stubs for GW-02
- [ ] `backend/src/__tests__/fallback-chain.test.ts` — stubs for GW-06

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE events fire on gateway state change | GW-02 | Requires real SSE client connection | Open browser SSE listener, kill Ollama, verify gateway:status-change event |
| Circuit breaker half-open recovery | GW-04 | Requires timing-dependent state transitions | Trip breaker, wait resetTimeout, verify next request goes through |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
