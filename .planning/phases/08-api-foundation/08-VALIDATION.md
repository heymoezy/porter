---
phase: 8
slug: api-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (existing, 35 tests) + curl integration scripts |
| **Config file** | `tests/playwright.config.js` |
| **Quick run command** | `cd /home/lobster/documents/porter/tests && npx playwright test --grep "Auth"` |
| **Full suite command** | `cd /home/lobster/documents/porter/tests && npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /home/lobster/documents/porter/tests && npx playwright test`
- **After every plan wave:** Run full suite + curl-verify each success criteria
- **Before `/gsd:verify-work`:** Full suite must be green + all 6 curl verifications pass
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | API-01 | integration/curl | `curl -s -b porter_session=... http://127.0.0.1:3001/api/v1/projects \| jq '.ok'` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | API-01 | integration/curl | `bash tests/api/check-envelope.sh` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 1 | API-02 | integration/curl | `curl -sI http://127.0.0.1:3001/api/v1/nonexistent \| grep X-Request-ID` | ❌ W0 | ⬜ pending |
| 08-03-01 | 03 | 2 | API-03 | integration/curl | `curl -s http://127.0.0.1:3001/api/v1/openapi.json \| jq '.openapi'` | ❌ W0 | ⬜ pending |
| 08-04-01 | 04 | 2 | OBS-01 | integration/curl | `curl -s -X POST -H 'Content-Type: application/json' -d '{"message":"TypeError","component":"ChatPanel","stack":"..."}' http://127.0.0.1:3001/api/v1/errors \| jq '.ok'` | ❌ W0 | ⬜ pending |
| 08-04-02 | 04 | 2 | OBS-02 | integration/curl | `curl -s -b porter_session=... 'http://127.0.0.1:3001/api/v1/errors?severity=error&component=ChatPanel' \| jq '.data.errors'` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/api/check-envelope.sh` — bash script verifying envelope shape across all route groups
- [ ] No new framework install needed — Playwright already works for regression

*Existing infrastructure covers Playwright regression. API-level curl scripts are the primary validation mechanism for this phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE streaming exemption | API-01 | SSE endpoints return text/event-stream, not JSON | Verify wizard.ts SSE streams are not wrapped in envelope |
| OAuth redirect exemption | API-01 | 302 redirects are not JSON responses | Verify OAuth callback routes still redirect correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
