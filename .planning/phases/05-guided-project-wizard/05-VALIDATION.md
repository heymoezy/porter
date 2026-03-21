---
phase: 5
slug: guided-project-wizard
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-21
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (existing, 35 tests) + Python3 stdlib behavioral scripts |
| **Config file** | tests/playwright.config.js |
| **Quick run command** | `cd /home/lobster/documents/porter/tests && npx playwright test` |
| **Full suite command** | `cd /home/lobster/documents/porter/tests && npx playwright test` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick Python3 test for the specific requirement
- **After every plan wave:** Run full Playwright suite (35 tests must stay green)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | PROJ-01 | integration | `python3 /tmp/test_proj01_wizard_api.py` | W0 | pending |
| 05-01-02 | 01 | 1 | PROJ-01 | integration | `python3 /tmp/test_proj01_detect.py && python3 /tmp/test_proj01_approve.py` | W0 | pending |
| 05-02-01 | 02 | 1 | PROJ-02 | integration | `python3 /tmp/test_proj02_agent_match.py` | W0 | pending |
| 05-03-01 | 03 | 2 | PROJ-03 | integration | `python3 /tmp/test_proj03_activity.py` | W0 | pending |
| 05-04-01 | 04 | 3 | PROJ-03 | integration | `python3 /tmp/test_proj03_activity.py` | W0 | pending |
| 05-05-01 | 05 | 4 | PROJ-04 | integration | `python3 /tmp/test_proj04_gsd_mode.py` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `/tmp/test_proj01_wizard_api.py` — POST /api/v1/projects/wizard endpoint existence + validation
- [ ] `/tmp/test_proj01_detect.py` — detect action classifies project vs non-project messages
- [ ] `/tmp/test_proj01_approve.py` — approve action atomic transaction (project + personas + jobs)
- [ ] `/tmp/test_proj02_agent_match.py` — project type to correct agent roles
- [ ] `/tmp/test_proj03_activity.py` — GET /api/v1/projects/:id/activity returns array
- [ ] `/tmp/test_proj04_gsd_mode.py` — GSD mode flag persists and routes differently

*Playwright regression suite (35 tests) covers existing surfaces — no new Playwright tests required for Phase 5 new views. Dashboard frontend (plan 04) verifies via the Python3 activity API test.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Proposal card renders correctly in chat stream | PROJ-01 | Visual rendering; requires browser + pixel verification | Navigate to chat, type project-like message, verify card shows agents/milestones/approve button |
| Dashboard feels alive with real-time updates | PROJ-03 | Subjective visual quality; SSE timing | Open project dashboard, trigger agent activity, verify updates appear without refresh |
| GSD mode toggle visible and functional | PROJ-04 | Visual UX verification | Click toggle, verify mode indicator changes, verify chat behavior differs |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [x] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
