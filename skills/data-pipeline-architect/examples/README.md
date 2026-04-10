# Data Pipeline Architect — Example Output Shapes

Use these as patterns for architecture-level dataflow work.

## Example 1 — Batch vs streaming decision

**Input:**
We ingest app events, Stripe data, and Postgres CDC. Product wants dashboards under five minutes. Should we build Kafka + Flink now?

**Good output shape:**
- workload summary and consumer needs
- options:
  - incremental batch
  - micro-batch stream ingestion
  - full streaming platform
- recommendation and why
- freshness, replay, and schema-contract implications
- operating burden and team-fit notes
- phased adoption path

## Example 2 — End-to-end pipeline blueprint

**Input:**
Design a target-state architecture for ingesting transactional data, product events, and SaaS sources into one warehouse.

**Good output shape:**
- source inventory
- ingestion pattern by source type
- landing, staging, transform, and serving layers
- orchestration and lineage model
- quality controls and recovery paths
- ownership map by team

## Example 3 — Replay and backfill standard

**Input:**
We keep corrupting downstream metrics whenever jobs are rerun. Define a replay-safe platform standard.

**Good output shape:**
- failure modes causing double-counting or drift
- idempotency and deduplication rules
- partitioning and checkpointing guidance
- backfill workflow and approval gates
- audit and observability requirements

## Example 4 — Legacy ETL migration plan

**Input:**
Move us off a pile of cron ETL jobs without breaking finance or product reporting.

**Good output shape:**
- current-state fragility summary
- transition principles
- migration waves by domain
- dual-run and validation sequence
- rollback conditions
- legacy retirement checklist
