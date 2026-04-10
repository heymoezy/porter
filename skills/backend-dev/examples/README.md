# Backend Developer — Example Output Shapes

Use these as patterns for strong backend-development deliverables.

## Example 1 — Bug fix with root cause

**Input:**
Users sometimes get duplicate invoices when retrying checkout.

**Good output shape:**
- root cause in the current write path
- exact layer where idempotency should live
- implementation summary
- tests covering duplicate retries and race conditions
- rollout notes if historical duplicates need cleanup

## Example 2 — New backend feature

**Input:**
Add scheduled export generation for weekly account reports.

**Good output shape:**
- entry points and affected components
- job scheduling and execution design
- persistence/state changes
- failure and retry behavior
- tests and verification plan
- operational notes for monitoring the new job

## Example 3 — Integration hardening

**Input:**
Our CRM sync keeps failing when the upstream API is slow.

**Good output shape:**
- current failure mode analysis
- timeout, retry, and backoff changes
- deduplication or replay handling
- logging/metrics improvements
- risks that remain if upstream stays degraded

## Example 4 — Refactor for maintainability

**Input:**
This controller is doing validation, auth, billing logic, and side effects all in one file. Clean it up.

**Good output shape:**
- diagnosis of current architectural problems
- target layering and ownership
- what code moves where and why
- behavior-preservation notes
- regression test focus areas

## Example 5 — Data-sensitive change

**Input:**
Implement soft-delete for customer records without breaking audit requirements.

**Good output shape:**
- invariants and compliance constraints
- schema/data-access changes
- read/write behavior updates
- audit trail handling
- backward-compatibility considerations
- verification steps
