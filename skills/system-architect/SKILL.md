---
name: system-architect
description: Design software system architecture, service boundaries, interaction patterns, data ownership, reliability posture, and migration shape for evolving platforms. Use when the main task is to decide how a system should be structured: monolith vs modular monolith vs services, sync vs async flows, platform decomposition, integration boundaries, scaling strategy, resilience design, or staged architecture evolution. Do not use for project-phase planning, narrow API contract design, or routine implementation inside an already chosen architecture.
---

# System Architect

Design the technical shape of a system so it can survive growth, change, and operational stress.

## Scope

Use this skill for:
- domain and subsystem decomposition
- service/module boundary design
- source-of-truth and data ownership decisions
- integration patterns across services and platforms
- sync vs async vs batch vs event-driven tradeoffs
- scaling, resilience, observability, and operability posture
- architecture option analysis and recommendation
- migration from current state to safer target state
- architecture decision records in prose/table form

Do not use this skill for:
- milestone plans or workstream sequencing; use **project-architect**
- endpoint/payload design as the core task; use **api-designer**
- implementing a chosen design; use **backend-dev** or **fullstack-dev**
- code-level cleanup with no meaningful structural decision
- empty brainstorming that never resolves into architecture choices

## Start with constraints

Architecture quality is constrained by reality. Gather or state assumptions about:
- product and business goals
- scale, throughput, latency, and burst behavior
- availability and recovery expectations
- consistency needs and data criticality
- security, compliance, and audit requirements
- team ownership and operational maturity
- deployment environment and infrastructure constraints
- migration limits, backward compatibility, and rollback tolerance

If the numbers are missing, label assumptions. Do not fake precision.

## Working method

### 1. Define the system job
Describe what the system must do, for whom, and what failure actually means. Separate primary capabilities from support capabilities.

### 2. Map capabilities to ownership boundaries
Identify:
- major capabilities and bounded contexts
- who owns each component
- where data originates and who is authoritative
- coupling hot spots
- shared concerns that should remain platform-level, not copied everywhere

Good boundaries reduce cross-team thrash and hidden dependencies.

### 3. Compare credible architecture shapes
Evaluate the simplest options that could work, such as:
- monolith
- modular monolith
- service split by capability
- event-driven subsystems
- batch or streaming pipelines
- gateway / orchestration / worker patterns

For each option, weigh:
- complexity added
- operational burden
- scaling fit
- failure isolation
- team autonomy
- migration cost
- reversibility

Prefer boring architecture unless complexity is clearly earned.

### 4. Design interaction and data rules
Make explicit:
- synchronous calls and their timeout/retry behavior
- asynchronous handoffs and their delivery semantics
- ownership of persistent data
- consistency model and reconciliation paths
- cache invalidation and derived-state strategy
- idempotency, deduplication, and ordering assumptions

Many architecture failures are really undefined ownership and interface failures.

### 5. Design for operations, not slides
Cover:
- observability signals and traceability
- blast radius and degradation modes
- deploy/rollback safety
- runbooks and recovery expectations
- capacity planning hooks
- dependencies on third parties and gateways

If operators cannot understand or stabilize the system under stress, the architecture is incomplete.

### 6. Separate target state from migration path
State:
- current-state constraints
- near-term fixes
- interim compromises
- target architecture
- staged migration sequence
- decision points that should trigger reevaluation

Do not present a clean-sheet fantasy when the real problem is evolutionary change.

## Output expectations

Return some combination of:
- recommended architecture and why
- option comparison table
- textual component/boundary map
- data flow and failure-flow notes
- migration plan with phases and guardrails
- explicit risks, assumptions, and sign-off decisions

Good output is concrete enough that engineering leads can turn it into ADRs and implementation tickets.

## Heuristics

Prefer:
- clear ownership
- minimal cross-boundary chatter
- explicit source-of-truth decisions
- observable and operable flows
- reversible changes where possible
- migration paths that preserve service continuity

Avoid:
- service sprawl without ownership maturity
- queues used as architecture perfume
- shared databases that erase boundaries while pretending not to
- diagrams with boxes but no contracts or responsibilities
- abstract “scalable” advice with no workload assumptions

## Adjacent skill boundaries

- **api-designer:** owns contract/interface shape when the main task is API design
- **project-architect:** owns execution plan and sequencing of workstreams
- **microservices-designer:** narrower specialization when service-topology detail is the exact focus
- **backend-dev / fullstack-dev:** implement inside an already chosen architecture
- **site-reliability:** focuses on operating and improving running services rather than primary structure design

## Use with

- `prompt.md` for execution posture and response style
- `examples/README.md` for representative requests and output shape
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
