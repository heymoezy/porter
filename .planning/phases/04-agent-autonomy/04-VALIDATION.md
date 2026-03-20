---
phase: 04
slug: agent-autonomy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (existing) + inline curl/API verification |
| **Config file** | tests/playwright.config.js |
| **Quick run command** | `cd tests && npx playwright test` |
| **Full suite command** | `cd tests && npx playwright test` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Verify via curl against API endpoints
- **After every plan wave:** Run full Playwright suite (35 tests)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 04-01-01 | 01 | 1 | AGNT-01 | integration | `curl /api/v1/jobs` | ⬜ pending |
| 04-01-02 | 01 | 1 | AGNT-01 | integration | scheduler poll verification | ⬜ pending |
| 04-02-01 | 02 | 1 | AGNT-01 | integration | `curl /api/v1/dispatch` | ⬜ pending |
| 04-03-01 | 03 | 2 | AGNT-02 | integration | event trigger fire test | ⬜ pending |
| 04-04-01 | 04 | 2 | AGNT-03 | integration | `curl /api/v1/agents/:id/activity` | ⬜ pending |
| 04-05-01 | 05 | 3 | AGNT-04 | integration | ephemeral agent lifecycle test | ⬜ pending |
| 04-06-01 | 06 | 3 | AGNT-01 | config | feature flag toggle verification | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing Playwright infrastructure covers regression testing
- API verification via curl commands (no additional test framework needed)
- SQLite agent_jobs table created in plan 04-01

*Existing infrastructure covers regression requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scheduled agent wakes up on interval | AGNT-01 | Requires waiting for poll cycle | Create agent with 10s schedule, wait 15s, check activity log |
| Ephemeral agent auto-retires | AGNT-04 | Requires project lifecycle completion | Create ephemeral agent, complete project, verify agent marked retired |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
