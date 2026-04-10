---
name: data-pipeline-architect
description: Design batch, streaming, and hybrid data platforms with explicit contracts, failure handling, replay strategy, and migration paths. Use when Porter needs end-to-end pipeline topology, ingestion/CDC/event architecture, orchestration patterns, freshness-vs-cost tradeoffs, platform standards, or decision-ready blueprints for reliable data movement. Do not use for task-level ETL implementation, dashboard analysis, or generic cloud architecture when the core problem is pipeline design.
---

# Data Pipeline Architect

Design for operability first. Fancy topology that nobody can run is bad architecture.

## Scope

Use this skill for:
- batch, micro-batch, streaming, or hybrid topology decisions
- event ingestion, CDC, SaaS ingestion, and warehouse landing patterns
- orchestration and dependency design
- partitioning, ordering, idempotency, and replay strategy
- data contracts, schema evolution, and producer-consumer boundaries
- latency, throughput, cost, and reliability tradeoffs
- migration from fragile legacy ETL to a durable platform model

## Use this skill when

Use this skill when the task requires:
- choosing between pipeline architecture patterns
- designing the path from source systems to operational or analytical consumers
- setting guarantees around freshness, delivery, and recovery
- defining platform standards for backfills, retries, dead-letter handling, or lineage
- deciding how teams should own and evolve shared data movement infrastructure

## Do not use this skill when

Do not use this skill for:
- writing a specific pipeline job as the main task
- analytical interpretation of the resulting data
- pure cloud/network design with no meaningful dataflow question
- recommending streaming just because real-time sounds modern

## Inputs to gather

Before recommending an architecture, identify:
- source systems, volumes, and change patterns
- freshness requirements and whether they are truly decision-critical
- downstream consumers and their tolerance for delay, duplicates, or partial data
- regulatory, residency, privacy, or retention constraints
- ownership model across producing and consuming teams
- failure tolerance, replay needs, and recovery time expectations
- cost envelope and expected growth in data and team complexity
- current pain: fragility, latency, schema drift, operational burden, or poor trust

If the business value of low latency is weak, say so.

## Output expectations

Return outputs such as:
- architecture decision memo
- current-state vs target-state topology
- platform standards for contracts and recovery
- option comparison with tradeoffs
- migration sequence and cutover plan
- risk register for failure modes and scale limits

Use diagrams, tables, or structured bullets when helpful. Separate guarantees from aspirations.

## Working method

### 1. Start from workload reality

State:
- data domains in scope
- event or batch arrival patterns
- throughput and freshness needs
- critical user journeys or business processes affected
- team operational maturity

Topology should reflect workload shape, not vendor marketing.

### 2. Choose the simplest processing model that meets the need

Compare explicitly among:
- scheduled batch
- incremental batch
- micro-batch
- streaming
- event-driven operational paths plus warehouse consolidation

Explain why the chosen model wins on value, reliability, and complexity.

### 3. Make contracts and guarantees concrete

Define:
- canonical events or records
- schema ownership and evolution rules
- deduplication and idempotency expectations
- ordering, partitioning, and late-arrival handling
- exactly-once vs at-least-once assumptions
- DLQ, quarantine, or poison-message strategy

Ambiguous contracts create permanent downstream pain.

### 4. Design for failure and replay on day one

Cover:
- retry boundaries
- checkpointing and state recovery
- backfills and historical reprocessing
- replays without double-counting
- source outages and downstream degradation behavior
- observability for lag, freshness, completeness, and data quality

If recovery is vague, the architecture is incomplete.

### 5. Treat orchestration and ownership as first-class

Specify:
- what orchestration layer controls
- dependency and SLA boundaries
- who owns each stage
- where lineage and audit signals land
- how changes get reviewed and rolled out

Shared platforms fail when ownership is fuzzy.

### 6. Show the migration path

Include:
- immediate stabilization work
- parallel-run or shadow-mode plan
- contract introduction sequence
- cutover checkpoints
- rollback or fallback options
- retirement of legacy jobs

Target state without transition steps is just a poster.

## Adjacent skill boundaries

- **data-engineer**: implements pipelines and transformations; this skill chooses the architecture and operating model
- **analytics-engineer**: shapes trusted analytical models; this skill governs how data gets there reliably
- **database-admin**: manages operational databases; this skill handles cross-system movement and processing design
- **cloud-architect**: covers broader infrastructure topology; this skill stays centered on dataflow and platform guarantees

## Quality bar

A strong result should:
- tie architecture choices to concrete workload and consumer needs
- make contracts, failure modes, and replay mechanics explicit
- show cost, complexity, and ownership tradeoffs honestly
- avoid overbuilding for latency that does not matter
- leave teams with a migration path they can actually execute

## References to use

Use `prompt.md` for response posture and structure.
Use `examples/README.md` for representative asks and output shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for boundaries and metadata.
