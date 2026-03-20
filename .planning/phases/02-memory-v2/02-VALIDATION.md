---
phase: 2
slug: memory-v2
status: draft
nyquist_compliant: false
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
| 02-01-* | 01 | 1 | MEM-01 | smoke | `python3 /tmp/test_grep_zero.py` | ❌ W0 | ⬜ pending |
| 02-02-* | 02 | 1 | MEM-01 | integration | `python3 /tmp/test_mem_noise.py` | ❌ W0 | ⬜ pending |
| 02-03-* | 03 | 2 | MEM-03 | integration | `python3 /tmp/test_scope_isolation.py` | ❌ W0 | ⬜ pending |
| 02-04-* | 04 | 2 | MEM-03 | integration | `python3 /tmp/test_scope_isolation.py` | ❌ W0 | ⬜ pending |
| 02-05-* | 05 | 3 | MEM-02 | integration | `python3 /tmp/test_recall_sse.py` | ❌ W0 | ⬜ pending |
| 02-05-* | 05 | 3 | MEM-02 | e2e | `npx playwright test --grep "recall feed"` | ❌ W0 | ⬜ pending |
| 02-06-* | 06 | 3 | MEM-04 | integration | `python3 /tmp/test_session_search.py` | ❌ W0 | ⬜ pending |
| 02-01-* | 01 | 1 | MEM-01 | smoke | `npx playwright test --grep "Memory tab"` | ✅ (line 342) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `/tmp/test_grep_zero.py` — runs `grep -c "cortex" porter.py`, asserts count is 0 (or only in release notes) — covers MEM-01
- [ ] `/tmp/test_mem_noise.py` — imports porter functions, calls login + file upload, asserts zero new signals in `memories` table — covers MEM-01
- [ ] `/tmp/test_recall_sse.py` — calls `_mem_insert()` directly, checks `_event_queues` received `recall:event` — covers MEM-02
- [ ] `/tmp/test_scope_isolation.py` — inserts project-scoped memory, calls `_mem_inject_for_dispatch()` with different project_id, asserts memory absent — covers MEM-03
- [ ] `/tmp/test_session_search.py` — inserts episode memory, calls `/api/memory/session-search?q=test`, asserts result returned — covers MEM-04

*Note: Python integration tests at `/tmp/` are not committed (porter.py is too large for git diff tracking; tests run in-process against live porter).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Memory feed badge count updates | MEM-02 | Real-time SSE visual verification | Open Memory tab, trigger chat that creates memory, verify badge increments |
| Inline "✨ Recall noted" indicator | MEM-02 | Visual design verification | Send chat message that triggers learning, verify indicator appears below message |
| Agent evolution respawn animation | MEM-01 | Animation visual verification | Promote 5+ style signals, verify agent "Who Is" rebuilds with animation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
