---
phase: 32
slug: skill-pack-explorer
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-02
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (e2e) |
| **Config file** | tests/playwright.config.js |
| **Quick run command** | `cd tests && npx playwright test skill-pack-explorer.spec.js` |
| **Full suite command** | `cd tests && npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run task-specific `<verify>` command (tsc/build + grep checks)
- **After every plan wave:** Run `cd tests && npx playwright test skill-pack-explorer.spec.js`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 32-00-01 | 00 | 0 | PKX-01..05 | scaffold | `cd tests && npx playwright test skill-pack-explorer.spec.js --list` | Wave 0 creates | ⬜ pending |
| 32-01-01 | 01 | 1 | PKX-02,04 | integration | `cd admin/backend && npx tsc --noEmit` + grep checks | N/A (type check) | ⬜ pending |
| 32-01-02 | 01 | 1 | PKX-03 | integration | `grep -n "fastify.put.*files" admin/backend/src/routes/skills.ts` + tsc | N/A (type check) | ⬜ pending |
| 32-02-01 | 02 | 2 | PKX-01,02 | build+grep | `npx react-router build` + grep useBlocker/lazy/useMutation | N/A (build check) | ⬜ pending |
| 32-02-02 | 02 | 2 | PKX-01,02,03 | e2e | `cd tests && npx playwright test skill-pack-explorer.spec.js --grep "PKX-01\|PKX-02\|PKX-03"` | ✅ Wave 0 | ⬜ pending |
| 32-03-01 | 03 | 2 | PKX-04 | build+grep | `npx react-router build` + grep SkillQualityBadge | N/A (build check) | ⬜ pending |
| 32-03-02 | 03 | 2 | PKX-05 | e2e | `cd tests && npx playwright test skill-pack-explorer.spec.js --grep "PKX-05"` | ✅ Wave 0 | ⬜ pending |

*Status: ⬜ pending / ✅ green / ❌ red / ⚠️ flaky*

---

## Wave 0 Plan

Plan 32-00-PLAN.md creates `tests/skill-pack-explorer.spec.js` with Playwright smoke tests for PKX-01 through PKX-05. This must execute first (wave 0) before any implementation plans.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| File tree visual layout | PKX-01 | CSS/layout quality | Open /skills/:id/pack, verify left tree + right editor layout |
| Empty file warnings visible | PKX-01 | Visual indicator check | Navigate to a skill with missing files, verify grayed entries with "Empty" badge |
| Breadcrumb navigation | PKX-01 | Navigation flow | Click through Skills > Skill Name > Pack, verify breadcrumb updates |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
