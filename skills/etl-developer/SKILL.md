---
name: etl-developer
description: Design, build, debug, and harden ETL and ELT pipelines so data moves correctly, repeatably, and observably between systems. Use when work involves extraction strategy, schema mapping, transformation logic, CDC, incremental loads, deduplication, orchestration, backfills, reconciliation, schema drift handling, or pipeline recovery. Do not use for dashboard interpretation, pure warehouse BI modeling, or infrastructure administration unrelated to data movement and pipeline operations.
---

# ETL Developer

Move data without creating silent debt.

This skill is for operational data movement: extracting from source systems, transforming records into reliable structures, loading them into destinations safely, and making the whole path debuggable when sources change, jobs fail, or reprocessing is required.

## Use this skill to

- design ETL or ELT pipeline architecture
- choose extraction methods and change-capture strategy
- define schema mappings and transformation rules
- build incremental, snapshot, or replay-safe load patterns
- plan backfills, reprocesses, and cutovers
- diagnose broken jobs, duplicates, gaps, or drift
- add data-quality checks, reconciliation, and observability

## Do not use this skill to

- analyze business performance from finished datasets
- design dashboards or semantic layers as the main task
- tune databases with no pipeline context
- discuss “modern data stack” tools at a buzzword level without operational detail

## Inputs to gather

Clarify:

- source systems, owners, extraction limits, and change semantics
- destination tables/models and downstream consumers
- expected volume, cadence, lateness, retention, and SLA/SLO expectations
- business rules for keys, deduplication, deletes, corrections, and identity resolution
- compliance constraints: PII, retention, lineage, access, residency
- current pain points: drift, duplicate rows, stale data, expensive backfills, poor observability

If source semantics are ambiguous, stop pretending the mapping is obvious. Define the contract first.

## Output expectations

Useful outputs include:

- ETL/ELT design memo
- source-to-target mapping specification
- CDC or incremental-load recommendation
- replay/backfill plan
- troubleshooting diagnosis and recovery plan
- quality-check and monitoring suite

## Working method

### 1. Define source truth before writing transformations

Document what each source record represents, what counts as an update, how deletes appear, which fields are stable, and what timestamps or versions can actually be trusted.

### 2. Design for idempotence and recovery

A good pipeline tolerates reruns, retries, and partial failure. State how reprocessing works, how duplicates are prevented, and how failed batches are resumed or replaced.

### 3. Separate pipeline concerns clearly

Keep extraction, staging, transformation, and serving responsibilities understandable. Clean boundaries make schema drift, bad inputs, and load failures easier to isolate.

### 4. Make incremental logic explicit

Specify:

- the watermark or cursor
- handling of late-arriving data
- delete and tombstone behavior
- deduplication keys and tie-break rules
- upsert/merge logic
- what happens when source clocks or ordering are unreliable

Incremental pipelines fail quietly when these rules are hand-waved.

### 5. Treat quality checks as part of the pipeline

At minimum consider row-count shifts, null spikes, duplicate rates, freshness, referential breaks, reconciliation totals, schema drift, and source-to-target parity checks where possible.

### 6. Plan backfills before you need them

State the blast radius, cost, partitioning strategy, throttling approach, verification method, and rollback or replacement plan. Backfills are where fragile pipelines get exposed.

### 7. Optimize for maintainability, not just first-run success

Name transformations clearly, keep assumptions visible, reduce hidden state, and leave an operator enough information to debug the job at 3 a.m.

## Heuristics

Prefer:

- explicit source and target contracts
- deterministic transformations
- append-plus-merge or replay-safe patterns where appropriate
- narrow, testable stages
- observability tied to business-critical expectations

Avoid:

- silent type coercion and silent field drops
- timezone ambiguity in timestamp logic
- no plan for deletes, corrections, or late data
- pipelines that only prove success by “job finished”
- backfills run without load-impact and correctness checks

## Review lenses

Check:

- Are source semantics and keys clear?
- Is rerun, retry, and replay behavior safe?
- Is incremental logic explicit for updates, deletes, and late events?
- Are quality checks strong enough to catch bad data early?
- Can another engineer operate, debug, and recover the pipeline?

## Adjacent skill boundaries

- **data-engineer**: broader platform and storage architecture across the stack
- **analytics-engineer**: downstream modeling, marts, semantic definitions
- **database-admin**: engine-level tuning, backups, replication, and database ops
- **data-pipeline-architect**: higher-level multi-system pipeline architecture decisions

## Quality bar

A strong result should:

- preserve correctness under retries, backfills, and source weirdness
- make data contracts and assumptions explicit
- catch failure before downstream consumers discover it manually
- handle schema and change evolution without chaos
- stay operable by someone other than the original author

## Files in this pack

- `prompt.md` — engineering stance and response pattern
- `examples/README.md` — deliverable shapes for design, diagnosis, and recovery
- `guides/qa-checklist.md` — final operational review checklist
- `meta/skill.json` — catalog metadata and adjacent-skill map
