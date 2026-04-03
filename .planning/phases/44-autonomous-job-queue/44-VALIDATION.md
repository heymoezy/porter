---
phase: 44
slug: autonomous-job-queue
status: draft
nyquist_compliant: true
wave_0_complete: true
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

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 44-01-01 | 01 | 1 | AJQ-01 | type-check | `cd backend && npx tsc --noEmit` | pending |
| 44-01-02 | 01 | 1 | AJQ-02, AJQ-03 | type-check + grep | `cd backend && npx tsc --noEmit && grep -c 'selectBestAgent\|selectBestGateway\|assignJob' src/services/job-assignment.ts` | pending |
| 44-02-01 | 02 | 2 | AJQ-04 | type-check | `cd backend && npx tsc --noEmit` | pending |
| 44-02-02 | 02 | 2 | AJQ-04 | build | `cd admin/frontend && npx react-router build 2>&1 \| tail -5` | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements. No new test framework needed.

---

## Post-Deploy Verification

| Behavior | Requirement | Automated Command |
|----------|-------------|-------------------|
| Migration applied | AJQ-01 | `psql -d porter -c "SELECT COUNT(*) FROM agent_jobs WHERE source IS NOT NULL"` |
| Admin jobs endpoint live | AJQ-04 | `curl -s http://127.0.0.1:3001/api/v1/admin/jobs \| jq '.data.jobs \| length'` |
| Queue endpoint live | AJQ-04 | `curl -s http://127.0.0.1:3001/api/v1/admin/jobs/queue \| jq '.data.jobs'` |
| History endpoint live | AJQ-04 | `curl -s http://127.0.0.1:3001/api/v1/admin/jobs/history \| jq '.data.jobs'` |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Self-enqueue timing | AJQ-03 | Requires scheduler tick interval to elapse | Restart service, wait 60s, check `SELECT * FROM agent_jobs WHERE source = 'system'` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
