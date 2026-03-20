---
phase: 3
slug: route-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58.2 |
| **Config file** | `tests/playwright.config.js` |
| **Quick run command** | `cd /home/lobster/documents/porter/tests && npx playwright test --grep "Auth"` |
| **Full suite command** | `cd /home/lobster/documents/porter/tests && npx playwright test` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /home/lobster/documents/porter/tests && npx playwright test`
- **After every plan wave:** Run `cd /home/lobster/documents/porter/tests && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | PERF-01 | unit | `python3 /tmp/test_prompt_audit.py` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | PERF-01 | unit | `python3 /tmp/test_lean_identity.py` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | PERF-02 | e2e | `npx playwright test --grep "Auth"` | ✅ | ⬜ pending |
| 03-03-01 | 03 | 2 | PERF-02 | e2e | `npx playwright test` | ✅ | ⬜ pending |
| 03-04-01 | 04 | 2 | PERF-02 | e2e | `npx playwright test` | ✅ | ⬜ pending |
| 03-05-01 | 05 | 3 | PERF-02 | e2e | `npx playwright test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `/tmp/test_prompt_audit.py` — measures current `_build_context_suffix()` output for all personas, records baseline token counts (PERF-01)
- [ ] `/tmp/test_lean_identity.py` — calls `_build_lean_identity()` after implementation, asserts all agents produce < 300 tokens (PERF-01)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Login page feels alive with motion/energy | PERF-02 | Visual/subjective | Load login page, verify animations, live activity display |
| `/api/v1/auth/login` returns 200 with session cookie | PERF-02 | Smoke test | `curl -X POST http://127.0.0.1:8877/api/v1/auth/login -d '{"username":"moe","password":"porter"}'` |
| `/api/v1/agents` returns agent list | PERF-02 | Smoke test | `curl -b porter_session=TOKEN http://127.0.0.1:8877/api/v1/agents` |
| `/api/v1/projects` returns project list | PERF-02 | Smoke test | `curl -b porter_session=TOKEN http://127.0.0.1:8877/api/v1/projects` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
