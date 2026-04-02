---
phase: 32
slug: skill-pack-explorer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend) + Playwright (e2e) |
| **Config file** | admin/frontend/vitest.config.ts (if exists) or create |
| **Quick run command** | `cd admin/frontend && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd tests && npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd admin/frontend && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd tests && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | PKX-02 | integration | `curl -s http://127.0.0.1:5175/api/skills/:id/files/prompt.md` | ❌ W0 | ⬜ pending |
| 32-01-02 | 01 | 1 | PKX-02 | integration | `curl -X PUT http://127.0.0.1:5175/api/skills/:id/files/prompt.md` | ❌ W0 | ⬜ pending |
| 32-02-01 | 02 | 1 | PKX-03 | unit | `cd admin/frontend && npx vitest run scaffold-detection` | ❌ W0 | ⬜ pending |
| 32-03-01 | 03 | 2 | PKX-01 | e2e | `cd tests && npx playwright test skill-pack` | ❌ W0 | ⬜ pending |
| 32-03-02 | 03 | 2 | PKX-04 | e2e | `cd tests && npx playwright test skill-pack --grep link` | ❌ W0 | ⬜ pending |
| 32-03-03 | 03 | 2 | PKX-05 | visual | manual inspection of empty file warnings | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] CodeMirror 6 packages installed (`@uiw/react-codemirror`, `@codemirror/lang-markdown`, `@codemirror/lang-json`, `@codemirror/theme-one-dark`)
- [ ] PUT endpoint for skill pack file writes
- [ ] Pack diagnostics computation in skill-library.ts

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| File tree visual layout | PKX-01 | CSS/layout quality | Open /skills/:id/pack, verify left tree + right editor layout |
| Empty file warnings visible | PKX-05 | Visual indicator check | Navigate to a skill with missing files, verify grayed entries with "Empty" badge |
| Breadcrumb navigation | PKX-01 | Navigation flow | Click through Skills > Skill Name > Pack, verify breadcrumb updates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
