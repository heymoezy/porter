---
phase: 11
slug: unified-chat-and-crm-schema
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) + Playwright (existing) |
| **Config file** | `vitest.config.ts` / `tests/playwright.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run && cd tests && npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run && cd tests && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | CHAT-01 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | CHAT-02 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | CHAT-03 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 11-01-04 | 01 | 1 | CHAT-04 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 1 | CRM-01 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 1 | CRM-02 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 11-03-01 | 03 | 1 | FILE-01 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 11-03-02 | 03 | 1 | FILE-02 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 11-03-03 | 03 | 1 | FILE-03 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/conversations.test.ts` — stubs for CHAT-01, CHAT-02, CHAT-03, CHAT-04
- [ ] `src/__tests__/contacts.test.ts` — stubs for CRM-01, CRM-02
- [ ] `src/__tests__/files.test.ts` — stubs for FILE-01, FILE-02, FILE-03

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| File upload disk cleanup on DB failure | FILE-01 | Requires simulated DB failure mid-transaction | 1. Mock DB insert to throw, 2. Upload file, 3. Verify disk file removed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
