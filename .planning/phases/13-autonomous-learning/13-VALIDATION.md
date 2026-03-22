---
phase: 13
slug: autonomous-learning
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bash + curl (smoke tests, project standard) |
| **Config file** | tests/smoke-phase13.sh (Wave 0 gap) |
| **Quick run command** | `./tests/smoke-phase13.sh` |
| **Full suite command** | `./tests/smoke-phase13.sh && cd tests && npx playwright test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `./tests/smoke-phase13.sh`
- **After every plan wave:** Run `./tests/smoke-phase13.sh && cd tests && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | LEARN-01 | smoke | `./tests/smoke-phase13.sh` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | LEARN-02 | smoke | `./tests/smoke-phase13.sh` | ❌ W0 | ⬜ pending |
| 13-01-03 | 01 | 1 | LEARN-03 | smoke | `./tests/smoke-phase13.sh` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/smoke-phase13.sh` — covers LEARN-01, LEARN-02, LEARN-03 (model: smoke-phase12.sh)
- [ ] `backend/src/db/migrate-13.ts` — concepts + learning_sessions + FTS5
- [ ] `backend/src/db/schema.ts` — append concepts, learningSessions Drizzle table definitions
- [ ] `backend/src/services/learner.ts` — research loop engine

*Wave 0 creates test + foundational files before feature work begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DuckDuckGo search returns results from VPS IP | LEARN-01 | Depends on external service + IP reputation | Run learner session, check sources_visited includes web results |
| Reddit .json endpoints accessible from VPS | LEARN-01 | Depends on Reddit IP policy | Run learner session, check sources_visited includes reddit results |
| PII scrubbing catches edge cases | LEARN-02 | Regex coverage varies by input | Grep concepts content for email/handle patterns after real session |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
