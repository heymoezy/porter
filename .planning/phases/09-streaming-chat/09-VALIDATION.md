---
phase: 9
slug: streaming-chat
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node v22 built-in) + tsx runner |
| **Config file** | N/A (node:test requires no config file) |
| **Quick run command** | `npx tsx --test backend/src/services/stream-service.test.ts` |
| **Full suite command** | `npx tsx --test backend/src/services/stream-service.test.ts && npx tsc --noEmit --project backend/tsconfig.json` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsx --test backend/src/services/stream-service.test.ts`
- **After every plan wave:** Run full suite command (unit tests + TypeScript check)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | STRM-01 | unit | `npx tsx --test backend/src/services/stream-service.test.ts` | W0 | pending |
| 9-01-02 | 01 | 1 | STRM-03 | unit | `npx tsx --test backend/src/services/stream-service.test.ts` | W0 | pending |
| 9-02-01 | 02 | 2 | STRM-01, STRM-02 | integration | `curl -s -N -X POST http://127.0.0.1:3001/api/v1/chat/stream ...` | N/A (curl) | pending |
| 9-02-02 | 02 | 2 | STRM-03 | integration | `timeout 1 curl ... && check CPU` | N/A (curl) | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/services/stream-service.test.ts` — unit tests for STRM-01 (token parsing), STRM-03 (abort), backend selection

*Note: STRM-02/STRM-03 integration is verified via live curl smoke tests in Plan 02 Task 2 — no separate test file needed for the route handler. The route contains zero logic beyond wiring stream-service, so unit-testing it would duplicate the service tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TTFT < 2s | STRM-01 | Timing depends on model load state | `time curl -N /api/v1/chat/stream -d '{"message":"hi"}'` — first `data:` event under 2s |
| Client disconnect stops generation | STRM-03 | Requires real model inference + abort | Start curl stream, Ctrl-C, check Ollama logs for abort |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
