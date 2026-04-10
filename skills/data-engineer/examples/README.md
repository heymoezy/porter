# Example Requests — Data Engineer

Use this skill for asks like:

- “Design a CDC pipeline from Postgres into BigQuery with replay safety and schema evolution handling.”
- “Review this dbt + Airflow stack for freshness, lineage, and backfill risk.”
- “Propose a warehouse model for subscriptions, invoices, and product events that supports finance and product analytics.”
- “Plan how to ingest Stripe and app events without duplicate revenue records.”
- “Write a runbook for a daily batch job that keeps missing its SLA and occasionally produces partial loads.”
- “Should this use streaming, micro-batch, or daily batch given our latency and cost constraints?”

## Example output shapes

### 1. Pipeline design
- sources and interfaces
- stages and transformations
- contracts and keys
- orchestration model
- failure/replay behavior
- observability and ownership

### 2. Reliability audit
- finding
- production risk
- failure mode
- remediation
- priority

### 3. Modeling plan
- core entities and facts
- grain and joins
- incremental strategy
- tests and reconciliations
- serving outputs

### 4. Backfill runbook
- trigger condition
- blast radius
- recovery steps
- validation checks
- sign-off criteria
