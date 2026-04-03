---
phase: 44
slug: autonomous-job-queue
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (existing) + direct curl/psql verification |
| **Config file** | tests/playwright.config.ts |
| **Quick run command** | `cd backend && npx tsc --noEmit` |
| **Full suite command** | `cd tests && npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit`
- **After every plan wave:** Run `cd tests && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | AJQ-01 | integration | `psql -d porter -c "SELECT COUNT(*) FROM agent_jobs WHERE source IS NOT NULL"` | N/A | pending |
| 44-01-02 | 01 | 1 | AJQ-02 | integration | `curl -s http://127.0.0.1:3001/api/v1/jobs/queue \| jq '.data.jobs[0].assigned_agent_id'` | N/A | pending |
| 44-02-01 | 02 | 2 | AJQ-02 | unit | `grep -c "matchAgentBySkill\|matchGatewayByCapability" backend/src/services/job-assignment.ts` | N/A | pending |
| 44-02-02 | 02 | 2 | AJQ-03 | integration | `psql -d porter -c "SELECT COUNT(*) FROM agent_jobs WHERE source = 'system'"` | N/A | pending |
| 44-03-01 | 03 | 2 | AJQ-04 | integration | `curl -s http://127.0.0.1:3001/api/admin/jobs \| jq '.data.jobs \| length'` | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements. No new test framework needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Self-enqueue timing | AJQ-03 | Requires scheduler tick | Restart service, wait 60s, check `SELECT * FROM agent_jobs WHERE source = 'system'` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
