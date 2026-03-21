---
phase: 06
slug: real-time-and-transparency
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python3 stdlib (behavioral tests) + Playwright (regression) |
| **Config file** | tests/playwright.config.ts |
| **Quick run command** | `python3 /tmp/test_trns*.py` |
| **Full suite command** | `cd tests && npx playwright test` |
| **Estimated runtime** | ~100 seconds |

---

## Sampling Rate

- **After every task commit:** Run `python3 /tmp/test_trns*.py`
- **After every plan wave:** Run `cd tests && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-00-01 | 00 | 1 | TRNS-01 | behavioral | `python3 /tmp/test_trns01_agent_feed.py` | ❌ W0 | ⬜ pending |
| 06-00-02 | 00 | 1 | TRNS-02 | behavioral | `python3 /tmp/test_trns02_health.py` | ❌ W0 | ⬜ pending |
| 06-00-03 | 00 | 1 | TRNS-03 | behavioral | `python3 /tmp/test_trns03_decisions.py` | ❌ W0 | ⬜ pending |
| 06-00-04 | 00 | 1 | PERF-03 | behavioral | `python3 /tmp/test_perf03_sse.py` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `/tmp/test_trns01_agent_feed.py` — stubs for TRNS-01 (agent activity feed)
- [ ] `/tmp/test_trns02_health.py` — stubs for TRNS-02 (system health panel)
- [ ] `/tmp/test_trns03_decisions.py` — stubs for TRNS-03 (decision log)
- [ ] `/tmp/test_perf03_sse.py` — stubs for PERF-03 (SSE replacing polling)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Agent activity appears within 2s of occurring | TRNS-01 | Requires live agent execution + browser timing | Trigger agent job, observe activity feed update timing |
| Health panel shows live status dots | TRNS-02 | Visual verification | Check each service card shows green/yellow/red correctly |
| Decision tooltips readable by non-technical user | TRNS-03 | Subjective readability | Read 5 decision explanations, verify plain English |
| 80% polling reduction during idle | PERF-03 | Network monitoring | DevTools Network tab, compare before/after idle request count |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
