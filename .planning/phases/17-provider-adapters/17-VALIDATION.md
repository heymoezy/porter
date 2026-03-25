---
phase: 17
slug: provider-adapters
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (35 existing tests in `tests/`) + TypeScript compiler |
| **Config file** | `tests/playwright.config.ts` |
| **Quick run command** | `cd backend && npx tsc --noEmit` |
| **Full suite command** | `cd tests && npx playwright test` |
| **Estimated runtime** | ~15 seconds (tsc) / ~45 seconds (playwright) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit`
- **After every plan wave:** Run `cd tests && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | CLI-02 | integration | `cd tests && npx playwright test --grep "ollama-adapter"` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | CLI-03 | unit/smoke | `cd tests && npx playwright test --grep "openclaw-adapter"` | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 1 | CLI-04 | unit | `cd backend && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 17-02-02 | 02 | 1 | CLI-05 | integration | `cd tests && npx playwright test --grep "claude-adapter"` | ❌ W0 | ⬜ pending |
| 17-02-03 | 02 | 1 | CLI-06 | integration | `cd tests && npx playwright test --grep "gemini-adapter"` | ❌ W0 | ⬜ pending |
| 17-03-01 | 03 | 2 | CLI-07 | unit | `cd backend && npx tsc --noEmit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/bridge-adapters.spec.ts` — smoke tests for OllamaAdapter.dispatch(), health(), listModels() against live Ollama
- [ ] `tests/bridge-openclaw.spec.ts` — health() returns correct status based on /health response
- [ ] TypeScript compilation check sufficient for CLI adapters (Codex/Claude/Gemini — no live API keys required for type safety)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CodexCLIAdapter live dispatch | CLI-04 | Codex usage limit prevents automated runs | `codex exec --json --ephemeral -p "hello"` — verify JSONL output |
| ClaudeCLIAdapter live streaming | CLI-05 | Requires active Claude session | `claude -p --output-format stream-json --include-partial-messages "hello"` |
| GeminiCLIAdapter live dispatch | CLI-06 | Requires Gemini auth | `gemini -p "hello" --output-format stream-json` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
