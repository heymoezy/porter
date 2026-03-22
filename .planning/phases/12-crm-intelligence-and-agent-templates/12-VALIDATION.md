---
phase: 12
slug: crm-intelligence-and-agent-templates
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bash smoke scripts (existing pattern — smoke-phase11.sh) |
| **Config file** | None — shell scripts, self-contained |
| **Quick run command** | `bash tests/smoke-phase12.sh` |
| **Full suite command** | `cd tests && npx playwright test` |
| **Estimated runtime** | ~15 seconds (smoke), ~45 seconds (Playwright) |

---

## Sampling Rate

- **After every task commit:** Run `bash tests/smoke-phase12.sh`
- **After every plan wave:** Run `cd tests && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | CRM-03, CRM-04, TMPL-01, TMPL-02, TMPL-03 | migration | `bash tests/smoke-phase12.sh` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 2 | CRM-03 | smoke | `bash tests/smoke-phase12.sh` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 2 | CRM-03 | smoke | `bash tests/smoke-phase12.sh` | ❌ W0 | ⬜ pending |
| 12-03-01 | 03 | 2 | CRM-04 | smoke | `bash tests/smoke-phase12.sh` | ❌ W0 | ⬜ pending |
| 12-04-01 | 04 | 2 | TMPL-01, TMPL-02 | smoke | `bash tests/smoke-phase12.sh` | ❌ W0 | ⬜ pending |
| 12-04-02 | 04 | 2 | TMPL-03 | smoke | `bash tests/smoke-phase12.sh` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/smoke-phase12.sh` — smoke tests covering CRM-03, CRM-04, TMPL-01, TMPL-02, TMPL-03
- [ ] `backend/src/db/migrate-12.ts` — contact_analyses + agent_templates + ALTER TABLE personas
- [ ] `backend/src/services/contact-analyzer.ts` — Ollama dispatch + prompt builder + JSON parser
- [ ] `backend/src/routes/v1/templates.ts` — new route file
- [ ] Register templates route in `backend/src/routes/v1/index.ts`

*Wave 0 creates all new files — existing infrastructure covers framework and test runner.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Analysis uses real interaction history, not generic | CRM-03 | Requires seeded conversation data + Ollama running | Seed contact + messages, trigger analyze, verify ai_analysis references actual message content |
| Autonomous sweep self-adjusts frequency | CRM-03 | Requires observing scheduler behavior over time | Monitor scheduler logs after multiple sweep cycles |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
