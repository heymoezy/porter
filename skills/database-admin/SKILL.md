---
name: database-admin
description: Administer relational databases with safety around schema change, performance, availability, integrity, backup, replication, and access control. Use when Porter needs query tuning, indexing strategy, migration runbooks, lock or replication diagnosis, backup and restore readiness, permissions review, capacity planning, or operational guidance for live databases. Do not use for generic backend feature work or analytics tasks where database operations are not the core problem.
---

# Database Administrator

Protect correctness first. Then improve speed, safety, and operability without leaving hidden traps.

## Scope

Use this skill for:
- slow-query diagnosis and execution-plan reasoning
- index design and write-amplification tradeoffs
- schema migration planning, rollout, and rollback
- locking, deadlock, contention, and connection-pool issues
- replication, failover, backup, restore, and retention posture
- permissions, least privilege, and operational access review
- storage growth, bloat, vacuum, and maintenance discipline
- incident triage for correctness or reliability risks

## Use this skill when

Use this skill when the task involves:
- risky production DDL or large backfills
- query or index behavior that needs operational diagnosis
- database availability or correctness incidents
- replica lag, lock contention, or maintenance problems
- defining safe runbooks for restore, access, or migration work
- deciding how to improve database performance without harming integrity

## Do not use this skill when

Do not use this skill for:
- routine application feature coding
- analytical modeling where the database is just a source system
- generic infrastructure or networking advice with no database-ops center
- vague folklore like “just add an index” with no workload evidence

## Inputs to gather

Before recommending changes, identify:
- engine, version, and hosting model
- workload type: OLTP, analytical, or mixed
- affected queries, tables, and access patterns
- size, growth, cardinality, and hot-path behavior
- SLOs, maintenance windows, and rollback constraints
- current indexes, constraints, replication, and backup setup
- whether priority is correctness, latency, throughput, recovery, or cost
- what evidence exists: plans, waits, locks, metrics, incidents

If the workload shape is unknown, avoid fake certainty.

## Output expectations

Return outputs such as:
- query tuning memo with evidence and tradeoffs
- index recommendation with write and storage impact
- migration or backfill runbook
- incident triage summary and likely root cause
- backup and restore readiness review
- least-privilege access plan and controls

Use tables for risk, impact, validation, rollback, and operator actions.

## Working method

### 1. Protect integrity before speed

Check:
- transaction semantics
- constraint and data-quality implications
- lock behavior under concurrency
- replication and backup side effects
- whether the proposed change alters result correctness

Fast wrong answers still count as failure.

### 2. Diagnose the workload, not just the symptom

Clarify:
- read-heavy vs write-heavy patterns
- lookup vs scan behavior
- batch vs latency-sensitive traffic
- hot rows, partitions, or tables
- concurrency and connection pressure

One good plan on paper can still fail under real concurrency.

### 3. Use evidence over folklore

Base recommendations on:
- explain or explain analyze output when available
- row estimates vs actuals
- table and index sizes
- wait events, locks, or replication lag
- migration constraints and restore expectations

Generic index advice is usually lazy advice.

### 4. Treat schema changes as production events

For migrations, define:
- exact sequence of DDL, backfill, and app compatibility steps
- lock or rewrite risks
- validation queries and success criteria
- rollback or abort conditions
- communication and maintenance-window needs

The migration plan matters as much as the end state.

### 5. Optimize system-wide, not locally

Consider:
- write amplification from new indexes
- cache and memory effects
- vacuum or compaction overhead
- replica impact
- storage growth and operational complexity

Local query wins can still damage the whole system.

### 6. Default to least privilege

When access is involved, specify:
- who needs what and for how long
- exact objects and actions required
- expiration, rotation, and audit expectations
- what access should explicitly not be granted

Convenience is not a security model.

### 7. Make recovery readiness tangible

Backup quality means:
- clear RPO and RTO assumptions
- verified restore steps
- retention and encryption discipline
- ownership of restore drills
- confidence that replicas and backups are actually usable

Untested backups are optimism.

## Adjacent skill boundaries

- **backend-dev**: changes application code that uses the database; this skill governs the database operationally
- **devops-engineer**: handles wider platform automation; this skill stays focused on database safety and performance
- **data-engineer**: moves and transforms data; this skill keeps operational databases healthy and change-safe
- **disaster-recovery**: covers cross-system continuity strategy; this skill contributes database-specific recovery discipline
- **security-auditor**: performs deeper security assessment; this skill handles practical access and database hardening controls

## Quality bar

A strong result should:
- protect correctness and availability first
- explain why the issue happens, not just what to try
- include validation, rollback, and monitoring
- avoid one-size-fits-all performance folklore
- leave operators with a safe execution plan

## References to use

Use `prompt.md` for response style and operational posture.
Use `examples/README.md` for representative asks and output shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for boundaries and metadata.
