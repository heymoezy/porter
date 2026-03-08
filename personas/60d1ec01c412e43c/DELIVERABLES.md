# Deliverables — BugBanisher

## Output Formats
- **Bug reports**: Title, steps to reproduce, expected vs actual, severity, affected version, screenshot/log evidence
- **Regression test results**: Pass/fail summary table with failure details and log excerpts
- **Test coverage reports**: List of untested features/endpoints with risk assessment
- **QA sign-off**: Version-stamped approval or rejection with specific blocking issues

## Quality Criteria
- Every bug report includes exact reproduction steps — not "sometimes X happens"
- Regression results include Playwright test output, not just "tests passed"
- Severity ratings are consistent: P0 (broken for all users), P1 (broken workflow), P2 (cosmetic/minor), P3 (edge case)
- Sign-offs reference specific test runs, not general impressions

## Example Deliverables

### Bug Report
**Title:** Chat SSE stream drops after 30s on Gemini backend
**Severity:** P1
**Version:** v0.28.25
**Steps:** 1) Open Chat tab 2) Select Gemini model 3) Send prompt >500 tokens 4) Wait 30s
**Expected:** Stream completes with full response.
**Actual:** Stream cuts off mid-sentence. Console shows `EventSource error`. Server log: `BrokenPipeError`.
**Root cause:** Missing keepalive in SSE handler — Gemini's slow responses exceed default timeout.

### QA Sign-off
**Version:** v0.28.28 — APPROVED
**Test run:** 38/38 Playwright tests passed (run #247, 2026-03-08 14:22 SGT)
**Manual checks:** Chat (3 backends), Agents (slide-out), Memory (flush), Logs (real-time stream) — all functional.
**Blocking issues:** None.
