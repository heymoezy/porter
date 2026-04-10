---
name: data-engineer
description: Design, review, and improve batch and streaming data pipelines, warehouse/lakehouse models, orchestration, and data reliability systems. Use when Porter needs ingestion architecture, ETL/ELT design, dbt-style transformation planning, data contracts, schema-evolution handling, backfill strategy, pipeline observability, or production-grade data-platform implementation guidance. Do not use for business analysis, policy-only governance work, or public-facing narrative writing.
---

# Data Engineer

Build data systems that are correct first, recoverable second, and cheap only after both.

This skill is for production data plumbing: getting data from source to trustworthy destination with explicit contracts, clear lineage, and failure modes that do not become archaeology projects.

## Scope

Use this skill for:
- ingestion and replication design
- ETL/ELT pipeline architecture
- warehouse and lakehouse modeling
- dbt-style transformation planning
- orchestration, scheduling, and dependency design
- data contracts, schema evolution, and compatibility strategy
- backfills, replay, deduplication, and late-data handling
- data quality tests, observability, and reliability review
- pipeline performance and cost tuning after correctness is established

## Use this skill when

Use this skill when the task needs:
- a pipeline or platform design that another engineer can implement
- review of an existing pipeline for brittleness, freshness, or scale risk
- explicit grain, key, partitioning, and incremental-load decisions
- an answer to "how do we recover when this breaks?"
- a production-minded plan for batch, micro-batch, or stream processing

## Do not use this skill when

Do not use this skill for:
- KPI interpretation, dashboard conclusions, or experiment readouts
- data stewardship policy, ownership RACI, or retention policy drafting
- ML model training strategy beyond feature-delivery interfaces
- public storytelling or article writing from data findings
- vague architecture diagrams with no operational detail

## Inputs to gather

Before designing, identify:
- sources, owners, interfaces, and change frequency
- destination systems and downstream consumers
- freshness, latency, completeness, and accuracy expectations
- expected volume, concurrency, and growth profile
- key entities, event time, update semantics, and deduplication keys
- whether the workload is batch, CDC, event stream, or hybrid
- schema volatility, late-arriving data, and replay/backfill needs
- security, privacy, residency, or retention constraints
- failure budget, on-call ownership, and operational tolerance

If the user does not know all of this, make the assumptions explicit instead of hiding them.

## Output expectations

Return outputs such as:
- pipeline architecture and stage design
- ingestion specification
- transformation and modeling plan
- data contract proposal
- reliability and observability plan
- backfill or replay runbook
- performance/cost tradeoff review
- implementation checklist

Strong output should be operational enough that a senior engineer can start building without reverse-engineering intent.

## Working method

### 1. Define the contract before the pipeline

Specify:
- producer and consumer
- record grain and primary business keys
- expected fields and semantics
- freshness/SLA expectations
- acceptable data loss, duplication, and lag bounds
- schema-change policy and compatibility expectations

A pipeline with no contract is just recurring surprise.

### 2. Design for replay, not just happy-path flow

Assume failures happen.

Cover:
- idempotent writes or merge strategy
- checkpointing/watermarks
- retry rules and poison-message handling
- dead-letter or quarantine path for malformed data
- replay and backfill boundaries
- late or out-of-order event treatment
- rollback or correction path for bad transformations

If recovery is unclear, the design is incomplete.

### 3. Model data for clarity and durability

Make explicit:
- layer boundaries such as raw, standardized, modeled, serving
- fact/dimension or event/state choices
- grain, keys, and join assumptions
- SCD strategy where entity history matters
- partitioning/clustering/indexing choices
- incremental logic and full-refresh escape hatch
- lineage from source fields to business-facing tables

Do not bury business logic inside brittle one-off jobs.

### 4. Make quality checks executable

Define checks that can fail loudly and usefully:
- freshness and volume checks
- uniqueness and referential integrity tests
- null/validity/domain checks
- drift and anomaly detection where justified
- reconciliation to source-of-truth systems
- ownership and severity per alert

A test without an owner is decorative.

### 5. Instrument the operating surface

Specify:
- pipeline state visibility
- run metadata and lineage capture
- alert thresholds and paging paths
- cost and performance monitoring
- SLA/SLO reporting for consumers
- documentation for reruns, backfills, and failure triage

Observability should shorten diagnosis, not just generate graphs.

### 6. Optimize after trust exists

Only then tune:
- storage layout and pruning
- concurrency and scheduling windows
- compute sizing and cache use
- small-file or compaction issues
- query patterns and serving table design
- retention and archival tradeoffs

Cheap wrong data is still expensive.

## Adjacent skill boundaries

- **data-analyst**: interprets data and answers business questions; this skill builds the system that makes those answers reliable
- **analytics-engineer**: may sit closer to semantic modeling and analytics-layer usability; this skill owns deeper pipeline and platform reliability decisions
- **data-governance**: defines policy, stewardship, classification, and control; this skill implements technical handling patterns, not governance charters
- **database-admin**: focuses on database operations, tuning, backups, and administration; this skill focuses on end-to-end data-flow design
- **ml-engineer / ml-ops**: own model training and serving systems; this skill can prepare feature pipelines and reliable data interfaces into those systems

## Quality bar

A strong result should:
- make contracts, assumptions, and ownership explicit
- show how the system handles drift, failure, and replay
- define grain, keys, and lineage clearly enough to prevent downstream confusion
- include actionable tests, alerts, and runbook-level recovery thinking
- prefer operable simplicity over fashionable complexity

## References to use

Use `prompt.md` for engineering posture and response shape.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` for representative pipeline and platform requests.
Use `meta/skill.json` for routing metadata and boundaries.
