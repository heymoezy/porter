# Database Administrator — Example Output Shapes

Use these as patterns for operational database work.

## Example 1 — Slow query diagnosis

**Input:**
This reporting query started timing out after the table passed 200 million rows.

**Good output shape:**
- engine and workload assumptions
- likely bottleneck and why
- evidence needed: plan, size, selectivity, waits
- recommended change: query rewrite, index, summary table, or partitioning
- tradeoffs: write cost, storage, maintenance
- validation before and after

## Example 2 — Production schema migration

**Input:**
Add a non-null column to a large live table without extended downtime.

**Good output shape:**
- risk summary
- compatibility-safe rollout sequence
- backfill plan and batch strategy
- validation queries
- rollback or abort path
- monitoring during rollout

## Example 3 — Access review

**Input:**
A contractor needs database access for one week to debug one service.

**Good output shape:**
- exact task scope
- minimum privileges required
- temporary credential and expiration controls
- audit logging expectations
- what should not be granted

## Example 4 — Backup readiness review

**Input:**
Are our backups good enough for recovery and compliance?

**Good output shape:**
- current posture summary
- RPO/RTO assumptions
- restore-test status
- retention and encryption notes
- highest-risk gaps
- action plan by priority
