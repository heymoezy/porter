---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58.2 + grep-based assertions |
| **Config file** | `tests/playwright.config.js` |
| **Quick run command** | `cd /home/lobster/documents/porter/tests && npx playwright test` |
| **Full suite command** | `cd /home/lobster/documents/porter/tests && npx playwright test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /home/lobster/documents/porter/tests && npx playwright test`
- **After every plan wave:** Run full suite + grep checks
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | UI-02 | grep | `grep -c "neutral-" frontend/src/components/Sidebar.tsx` (must return 0) | ✅ | ⬜ pending |
| 01-01-02 | 01 | 1 | UI-02 | grep | `grep -c "#f7931a" frontend/src/index.css` (must return 0) | ✅ | ⬜ pending |
| 01-02-01 | 02 | 1 | FOUND-01 | grep | `grep -c "except: pass" porter.py` (must return 0) | ✅ | ⬜ pending |
| 01-02-02 | 02 | 1 | FOUND-01 | manual | Review mlog output during restart | manual-only | ⬜ pending |
| 01-02-03 | 02 | 1 | FOUND-02 | grep | `grep -q "threading.local" porter.py && grep -q "busy_timeout=30000" porter.py` | ✅ | ⬜ pending |
| 01-02-04 | 02 | 1 | FOUND-02 | integration | `bash tests/concurrency.sh` (10 concurrent requests, zero lock errors) | ✅ | ⬜ pending |
| 01-03-01 | 03 | 2 | FOUND-04 | grep | `grep -c "ROLE_CAPS\|auth_check_cap\|platform_admin" porter.py` (must return 0) | ✅ | ⬜ pending |
| 01-03-02 | 03 | 2 | FOUND-04 | grep | `grep -c "cortex_enabled.*True" porter.py` (must return 0) | ✅ | ⬜ pending |
| 01-04-01 | 04 | 1 | FOUND-03 | grep | `grep -q "export const projects" backend/src/db/schema.ts` | ✅ | ⬜ pending |
| 01-04-02 | 04 | 1 | FOUND-03 | grep | `grep -q "config.porterPyUrl" backend/src/plugins/proxy.ts` | ✅ | ⬜ pending |
| 01-05-01 | 05 | 3 | FOUND-03 | grep | `grep -c '_config\["projects"\]' porter.py` (must return 0) | ✅ | ⬜ pending |
| 01-05-02 | 05 | 3 | FOUND-03 | e2e | `npx playwright test --grep "Projects"` | ✅ | ⬜ pending |
| 01-06-01 | 06 | 3 | UI-01 | grep | `grep -cE '#[0-9a-fA-F]{6}' porter.py` (must be near 0) | ✅ | ⬜ pending |
| 01-06-02 | 06 | 3 | UI-01 | e2e | `npx playwright test --grep "CSS"` | ✅ | ⬜ pending |
| 01-07-01 | 07 | 4 | FOUND-05 | grep | `grep -q "def _boot_sequence" porter.py` | ✅ | ⬜ pending |
| 01-07-02 | 07 | 4 | UI-01 | manual | Set `data-theme="light"`, visual inspection | ❌ W0 | ⬜ pending |
| 01-07-03 | 07 | 4 | UI-02 | e2e | Full Playwright suite (dark + light mode) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/concurrency.sh` — bash script firing 10 concurrent curl requests, checks for "database is locked" in logs; covers FOUND-02 (added to Plan 02 Task 3)
- [ ] Light mode visual smoke — no automated test exists; manual inspection required post-implementation

*Existing Playwright infrastructure covers FOUND-01, FOUND-03, FOUND-04, UI-01, UI-02 (dark mode).*
*Plan 02 Task 3 now creates tests/concurrency.sh, closing the FOUND-02 Wave 0 gap.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| mlog output correctness | FOUND-01 | Log format requires visual review | Restart porter, trigger exception, verify structured log entry |
| Boot sequence on fresh install | FOUND-05 | Requires clean environment | Use fresh PORTER_DATA_DIR, start porter.py, verify wizard flow |
| Light mode rendering | UI-02 | No automated visual comparison available | Set `data-theme="light"` in DevTools, check all main views |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
