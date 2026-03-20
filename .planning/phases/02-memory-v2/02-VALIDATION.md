---
phase: 2
slug: memory-v2
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-20
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (Node.js) + Python integration tests |
| **Config file** | `/home/lobster/documents/porter/tests/playwright.config.js` |
| **Quick run command** | `cd /home/lobster/documents/porter/tests && npx playwright test --grep "Memory"` |
| **Full suite command** | `cd /home/lobster/documents/porter/tests && npx playwright test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /home/lobster/documents/porter/tests && npx playwright test`
- **After every plan wave:** Run full Playwright suite + Python integration tests
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-00-* | 00 | 0 | MEM-01..04 | scaffold | `python3 -c "import os; [assert os.path.exists(f'/tmp/test_{n}.py') for n in ['grep_zero','mem_noise','recall_sse','scope_isolation','session_search']]"` | 02-00 creates | pending |
| 02-01-* | 01 | 1 | MEM-01 | smoke | `python3 /tmp/test_grep_zero.py` | 02-00 | pending |
| 02-02-* | 02 | 2 | MEM-01 | integration | `python3 /tmp/test_mem_noise.py` | 02-00 | pending |
| 02-03-* | 03 | 2 | MEM-03 | integration | `python3 /tmp/test_scope_isolation.py` | 02-00 | pending |
| 02-04-* | 04 | 3 | MEM-02 | integration | `python3 /tmp/test_recall_sse.py` | 02-00 | pending |
| 02-04-* | 04 | 3 | MEM-02 | e2e | `npx playwright test --grep "recall feed"` | TBD | pending |
| 02-05-* | 05 | 3 | MEM-04 | integration | `python3 /tmp/test_session_search.py` | 02-00 | pending |
| 02-01-* | 01 | 1 | MEM-01 | smoke | `npx playwright test --grep "Memory tab"` | existing (line 342) | pending |

*Status: pending -- green -- red -- flaky*

---

## Wave 0 Requirements

Plan 02-00-PLAN.md creates all five test scripts:

- [ ] `/tmp/test_grep_zero.py` — runs cortex-zero assertions on porter.py source — covers MEM-01
- [ ] `/tmp/test_mem_noise.py` — tests noise filter via HTTP + DB assertions — covers MEM-01
- [ ] `/tmp/test_recall_sse.py` — verifies recall:event SSE emission and feed API — covers MEM-02
- [ ] `/tmp/test_scope_isolation.py` — verifies project scope isolation in DB and injection — covers MEM-03
- [ ] `/tmp/test_session_search.py` — verifies session search endpoint and dispatch wiring — covers MEM-04

*Note: Python integration tests at `/tmp/` are not committed (porter.py is too large for git diff tracking; tests run in-process against live porter).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Memory feed badge count updates | MEM-02 | Real-time SSE visual verification | Open Memory tab, trigger chat that creates memory, verify badge increments |
| Inline "Recall noted" indicator | MEM-02 | Visual design verification | Send chat message that triggers learning, verify indicator appears below message |
| Agent evolution respawn animation | MEM-01 | Animation visual verification | Promote 5+ style signals, verify agent "Who Is" rebuilds with animation |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Plan 02-00)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
