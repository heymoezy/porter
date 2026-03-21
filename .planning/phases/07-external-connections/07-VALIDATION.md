---
phase: 7
slug: external-connections
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (existing) + vitest for unit tests |
| **Config file** | `tests/playwright.config.ts` |
| **Quick run command** | `cd tests && npx playwright test --grep @phase7` |
| **Full suite command** | `cd tests && npx playwright test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd tests && npx playwright test --grep @phase7`
- **After every plan wave:** Run `cd tests && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | CONN-01 | integration | `curl -s http://127.0.0.1:8877/api/v1/connections` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 1 | CONN-05 | grep | `grep -r 'hardcoded\|127.0.0.1\|8877\|lobster' backend/src/` | ✅ | ⬜ pending |
| 07-03-01 | 03 | 2 | CONN-02 | integration | `curl -s http://127.0.0.1:8877/api/v1/connections/github/status` | ❌ W0 | ⬜ pending |
| 07-04-01 | 04 | 2 | CONN-02 | integration | `curl -s http://127.0.0.1:8877/api/v1/connections/email/status` | ❌ W0 | ⬜ pending |
| 07-05-01 | 05 | 2 | CONN-03 | integration | `curl -s http://127.0.0.1:8877/api/v1/connections/calendar/status` | ❌ W0 | ⬜ pending |
| 07-06-01 | 06 | 3 | CONN-02 | integration | `curl -s http://127.0.0.1:8877/api/v1/connections/whatsapp/status` | ❌ W0 | ⬜ pending |
| 07-07-01 | 07 | 3 | CONN-04 | integration | `curl -s http://127.0.0.1:8877/api/v1/projects/1/connections` | ❌ W0 | ⬜ pending |
| 07-08-01 | 08 | 1 | CONN-01 | unit | `grep 'external_call' backend/src/services/scheduler.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/phase7/connections.spec.ts` — API endpoint tests for connection CRUD
- [ ] `tests/phase7/encryption.spec.ts` — credential encryption/decryption round-trip
- [ ] `tests/phase7/queue.spec.ts` — external call queuing verification

*Existing Playwright infrastructure covers browser-level tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OAuth2 popup flow | CONN-02 | Requires browser interaction with GitHub/Google | 1. Click "Connect GitHub" 2. Authorize in popup 3. Verify token saved |
| WhatsApp webhook delivery | CONN-02 | Requires public HTTPS endpoint + Meta verification | 1. Configure webhook URL 2. Send test message 3. Verify agent receives |
| Calendar deadline display | CONN-03 | Requires Google Calendar with test events | 1. Connect calendar 2. Create event with deadline 3. Verify appears on dashboard |
| Email inbound via IMAP | CONN-02 | Requires real email account + IMAP access | 1. Connect email 2. Send email to connected account 3. Verify agent receives |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
