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
| **Framework** | vitest (already configured in project) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose src/services/stream-service.test.ts` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose src/services/stream-service.test.ts`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | STRM-01 | unit | `npx vitest run src/services/stream-service.test.ts` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 1 | STRM-03 | unit | `npx vitest run src/services/stream-service.test.ts` | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 1 | STRM-02 | integration | `curl -N http://localhost:3000/api/v1/chat/stream` | ❌ W0 | ⬜ pending |
| 9-02-02 | 02 | 1 | STRM-03 | integration | `npx vitest run src/routes/v1/chat.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/services/stream-service.test.ts` — stubs for STRM-01, STRM-03
- [ ] `src/routes/v1/chat.test.ts` — stubs for STRM-02, STRM-03

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TTFT < 2s | STRM-01 | Timing depends on model load state | `time curl -N /api/v1/chat/stream -d '{"message":"hi"}'` — first `data:` event under 2s |
| Client disconnect stops generation | STRM-02 | Requires real model inference + abort | Start curl stream, Ctrl-C, check Ollama logs for abort |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
