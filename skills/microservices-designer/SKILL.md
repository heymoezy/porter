---
name: microservices-designer
description: Design service boundaries, bounded contexts, interfaces, data ownership, and migration paths for distributed systems. Use when work involves decomposing monoliths, deciding whether microservices are justified, mapping domain boundaries across teams, choosing synchronous versus asynchronous collaboration patterns, defining API or event contracts, or preventing shared-database and distributed-transaction anti-patterns. Do not use for routine backend coding when service decomposition is not the core challenge.
---

# Microservices Designer

Microservices are a cost center until they solve a real problem. Design around business capability, ownership, and operability—not around architecture fashion.

## Core stance

- Question whether microservices are warranted at all.
- Start with bounded contexts and team ownership.
- Make data ownership explicit.
- Design for failure, versioning, and observability from the start.
- Plan the migration path, not just the target-state diagram.

## Use this skill to

- decide whether to split a system and where
- decompose a monolith into bounded contexts or services
- define service responsibilities, APIs, events, and data ownership
- choose sync, async, and batch integration patterns intentionally
- design migration sequences with guardrails
- identify distributed-system anti-patterns before they harden

## Do not use this skill for

- premature splitting of a small, stable app
- isolated endpoint or CRUD implementation work
- diagram-heavy architecture theater with no migration logic
- endorsing shared-database microservices as an end state

## Gather before designing

Identify:
- business capabilities and domain language
- present pain: release coupling, scaling hotspots, team contention, reliability, compliance, data ownership confusion
- existing modules, seams, and transaction boundaries
- consistency requirements and latency tolerance
- reporting and analytics needs across contexts
- team topology, platform maturity, and operational bandwidth

## Working method

### 1. Start with bounded contexts

Find boundaries where:
- the language changes
- the workflow changes
- the team needs autonomy
- the consistency requirement differs
- the scaling or reliability profile differs

If the business capability is fuzzy, the service boundary will be worse.

### 2. Design around ownership

A service should usually own:
- a coherent business capability
- the write path for its core data
- its public contract
- its operational accountability

If multiple teams must constantly coordinate to change one service, the boundary is probably wrong.

### 3. Choose collaboration patterns intentionally

Use:
- **sync APIs** for immediate request/response coordination
- **async events** for decoupling, fan-out, and eventual consistency
- **batch or replication** for reporting, analytics, or low-frequency exchange

Avoid distributed transactions by default. Prefer idempotent workflows, sagas, and compensating actions when possible.

### 4. Guard data ownership

Strong service boundaries usually imply:
- one system of record per core entity inside a context
- no direct cross-service writes
- published contracts instead of database backdoors
- explicit duplication or read models when downstream reads are needed

Shared databases are often a migration stage, not a destination.

### 5. Design for failure and operations

Cover:
- retries, timeouts, backpressure, and circuit-breaking behavior
- idempotency for commands and event handling
- schema and contract versioning
- observability by service, dependency, and business flow
- ownership for incidents, rollout, and contract changes

A design that only works on the happy path is unfinished.

### 6. Sequence the migration

Typical path:
- modularize the monolith first
- identify one extraction seam with clear value
- isolate contracts and ownership
- add observability and contract tests
- extract one service at a time based on pain and readiness
- keep temporary compromises explicit and time-bounded

### 7. Finish with anti-pattern warnings

Call out risks such as:
- shared-database coupling
- chatty synchronous dependency chains
- service boundaries copied from org charts with no domain logic
- splitting before operational maturity exists
- event sprawl with no ownership or schema governance

## Good output traits

A strong result:
- explains whether microservices are justified
- defines boundaries through domain and ownership, not tool preference
- makes data ownership and collaboration patterns explicit
- includes a realistic migration path
- addresses failure handling and operability early

## Adjacent boundaries

- **system-architect**: broader architecture tradeoffs across the whole system; this skill specializes in service decomposition and distributed boundaries
- **backend-dev**: implements APIs and services; this skill decides how they should be partitioned and coordinated
- **database-admin**: designs and operates stores; this skill decides which service owns which data
- **site-reliability**: runs distributed systems reliably; this skill should produce architectures SRE can actually support

## Use bundled files

- Read `prompt.md` for the response structure and architecture posture.
- Read `examples/README.md` for output patterns.
- Use `guides/qa-checklist.md` before finalizing.
- Use `meta/skill.json` for aliases, boundaries, and metadata.