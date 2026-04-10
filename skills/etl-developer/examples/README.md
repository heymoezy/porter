# ETL Developer — Example Output Shapes

Use these patterns to keep ETL work explicit, replay-safe, and operable.

## Example 1 — Source-to-target design memo

**Input:**
Design a pipeline from Shopify and Stripe into our warehouse.

**Good output shape:**
- source systems and extraction constraints
- target tables and consumer use cases
- entity mapping and identity-resolution rules
- CDC/incremental strategy per source
- staging, transform, and load flow
- data-quality checks and reconciliation plan
- risks, assumptions, and rollout order

## Example 2 — Flaky pipeline diagnosis

**Input:**
Our nightly order job duplicates rows after retries. Diagnose the likely issue.

**Good output shape:**
- observed failure symptoms
- likely root-cause categories
- checks to confirm each hypothesis
- safest remediation path
- replay/backfill instructions
- longer-term hardening recommendations

## Example 3 — Backfill plan

**Input:**
We need to reprocess 18 months of CRM data after a mapping bug.

**Good output shape:**
- scope and blast-radius summary
- partitioning and run strategy
- throttling and dependency considerations
- verification and reconciliation steps
- rollback or replacement approach
- communication and monitoring checklist

## Example 4 — Incremental-load recommendation

**Input:**
Should this table use timestamps, version columns, or full snapshots?

**Good output shape:**
- source change semantics
- viable extraction patterns
- recommended method and why
- edge-case handling: late data, deletes, corrections
- downstream impact
- implementation cautions

## Example 5 — Quality-check suite

**Input:**
Propose automated checks for our customer pipeline.

**Good output shape:**
- critical business expectations
- table-level and field-level checks
- freshness and volume checks
- dedupe and referential checks
- alert thresholds and owners
- what to block versus what to warn on
