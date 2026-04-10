# Coding Agent — Example Output Shapes

Use these as patterns for strong coding-agent delegation.

## Example 1 — Feature implementation handoff

**Input:**
Implement user invitation expiry in the auth service. Repo is `apps/api`. Add tests. Do not change UI.

**Good output shape:**
- goal and non-goals
- repo path and relevant modules
- required behavior and acceptance criteria
- files likely involved
- validation commands
- expected return format: summary, files changed, tests run, open risks

## Example 2 — Bug-fix delegation

**Input:**
There is a duplicate charge issue during webhook retries. Investigate and fix it.

**Good output shape:**
- problem statement and likely risk area
- instructions to inspect retry and idempotency paths
- explicit expectation to reproduce or reason from code
- fix scope guardrails
- regression tests required
- summary format with root cause, fix, and residual risk

## Example 3 — Refactor with limits

**Input:**
Reduce duplication in the report export pipeline, but keep behavior unchanged and avoid touching API routes.

**Good output shape:**
- narrow refactor objective
- protected areas not to modify
- requirement to preserve external behavior
- request for before/after design summary
- lint, test, and build checks to run
- note any risky assumptions or skipped validation

## Example 4 — ACP or persistent coding session

**Input:**
Spin up a thread-bound Codex session for ongoing work on the mobile app login flow.

**Good output shape:**
- why persistent session is appropriate
- project path and first concrete task
- thread or session expectations
- handoff note for future iterations
- current blockers and next verification step

## Example 5 — Accepting returned work

**Input:**
The coding agent says the task is complete.

**Good output shape:**
- objective restated
- files changed and what each change does
- validation actually run
- anything unverified or deferred
- accept / revise recommendation with rationale
