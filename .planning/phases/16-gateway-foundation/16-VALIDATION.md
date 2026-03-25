---
phase: 16
slug: gateway-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (existing 35 tests) + TypeScript compiler |
| **Config file** | `tests/playwright.config.ts` |
| **Quick run command** | `cd backend && npm run build` |
| **Full suite command** | `cd tests && npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npm run build`
- **After every plan wave:** Run `cd tests && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | GW-01 | smoke | `cd tests && npx playwright test --grep "gateway"` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | GW-01 | unit | `cd backend && npm run build` | ✅ | ⬜ pending |
| 16-02-01 | 02 | 2 | GW-03 | smoke | `cd tests && npx playwright test --grep "detect"` | ❌ W0 | ⬜ pending |
| 16-02-02 | 02 | 2 | GW-08 | manual | DB query after restart | N/A | ⬜ pending |
| 16-03-01 | 03 | 2 | GW-07 | smoke | `cd tests && npx playwright test --grep "mask"` | ❌ W0 | ⬜ pending |
| 16-04-01 | 04 | 1 | CLI-01 | unit | `cd backend && npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/bridge-gateway.spec.ts` — stubs for GW-01, GW-03, GW-07 smoke tests
- [ ] TypeScript compilation (`npm run build`) covers CLI-01 interface type checking
- [ ] Existing 35 Playwright tests remain green as regression baseline

*Existing test infrastructure covers TypeScript compilation; bridge-specific Playwright tests are new.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Env var bootstrap creates gateway rows on first boot | GW-08 | Requires mocking env vars + fresh DB state; too complex for automated test | 1. Clear gateways table 2. Restart porter 3. Query `SELECT * FROM gateways WHERE source = 'env_bootstrap'` 4. Verify Ollama + OpenClaw rows exist |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
