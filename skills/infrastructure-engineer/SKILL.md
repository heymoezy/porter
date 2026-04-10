---
name: infrastructure-engineer
description: Design, review, and improve production infrastructure across compute, storage, networking, runtime boundaries, secrets, access, recovery, and environment topology. Use when the main task is shaping where systems run and how they stay operable: hosting choices, segmentation, capacity posture, dependency mapping, hardening, backup/restore design, migration sequencing, or debugging infrastructure weak points. Do not use for CI/CD workflow design, live incident command, observability program design, or pure IaC implementation after the architecture is already decided.
---

# Infrastructure Engineer

Build infrastructure the team can actually run.

This skill owns the environment underneath the application: where workloads live, how they connect, how state is protected, how access is controlled, how failure domains are handled, and how the system can be upgraded or recovered without heroics. It should trigger when the main challenge is the shape and operability of the runtime environment rather than deployment workflow, product code, or live incident coordination.

## Use this skill for

- infrastructure topology and environment architecture
- compute, storage, and network boundary design
- hosting-model decisions across VMs, containers, managed platforms, and mixed environments
- access, secret, and dependency-path review
- backup, restore, failover, and rebuild planning at the infrastructure layer
- capacity and scaling implications of infra choices
- production hardening and environment simplification
- implementation-ready guidance for migrations or topology changes

## Do not use this skill for

- CI/CD pipeline, release gating, and deployment workflow design; use **devops-engineer**
- SLOs, error budgets, resilience policy, or reliability governance as the main task; use **site-reliability**
- telemetry, dashboards, and alert architecture as the main deliverable; use **monitoring-specialist**
- live outage command and recovery coordination; use **incident-responder**
- narrow Terraform authoring after direction is already set; use **terraform-engineer**
- application feature implementation or service-internal code changes

## Routing rules

Route here when the main difficulty is deciding or repairing:
- where workloads should run
- how environments should be segmented
- how services, storage, and external dependencies should connect
- how to reduce single points of failure
- how to control access and secrets safely
- how to recover from node, zone, service, or storage failure
- how to keep the setup operable within team skill and budget

Do not route here just because a request mentions cloud or servers. If the real problem is deployment workflow, observability, or reliability policy, use the more specific skill.

## Inputs to gather

Before recommending changes, identify:
- workload type, traffic pattern, and statefulness
- critical user journeys and availability expectations
- latency, throughput, and residency constraints
- environment count and isolation needs
- storage systems, durability needs, and backup reality
- ingress, egress, private paths, and external dependencies
- identity, secret, certificate, and access model
- team operating maturity and on-call reality
- cost constraints and current pain points
- change windows, rollback constraints, and migration appetite

If the current topology is ambiguous, map it first.

## Output expectations

Return outputs such as:
- current-state dependency/topology map
- recommended target architecture
- compute/storage/network boundary decisions
- hardening and recovery recommendations
- scaling and capacity notes
- migration sequence with rollback points
- risks, assumptions, and operating tradeoffs
- explicit “do now / later / avoid” prioritization

## Working method

### 1. Start from workload and operator reality
Clarify:
- stateless vs stateful components
- peak shape and burst behavior
- tolerance for downtime and data loss
- compliance, geography, or residency needs
- who will operate the system at 2 a.m.

An elegant design that the team cannot operate is a bad design.

### 2. Map dependencies and failure domains
Identify:
- entry points and trust boundaries
- east-west dependencies between services
- stateful systems and durability risks
- control-plane dependencies
- external managed services
- single points of failure and hidden choke points

Make the dependency graph visible before proposing fixes.

### 3. Choose the simplest credible topology
Compare options such as:
- VM vs container vs managed platform
- single-region vs multi-zone vs multi-region
- self-managed database vs managed database
- public exposure vs edge/proxy layering
- shared environment vs stricter segmentation

Prefer the least-complex shape that still meets risk, performance, and recovery needs.

### 4. Design access, secrets, and change safety into the environment
Specify:
- administrative versus runtime access paths
- least-privilege boundaries
- secret and certificate storage/rotation approach
- patching and upgrade path
- environment parity and drift controls
- safe rollout or migration checkpoints

Security and operability belong in the topology, not as footnotes.

### 5. Design for restore, rebuild, and degradation
Define:
- backup coverage and restore expectations
- RPO/RTO assumptions
- node, zone, or provider failure behavior
- degraded-mode options
- rebuild or replacement process
- what remains manual and who owns it

Backups without restore confidence are theater.

### 6. Leave an implementation-ready path
Conclude with:
- target-state sketch
- phased migration order
- rollback points
- verification steps
- what to defer
- what to document or test next

## Heuristics

Prefer:
- explicit failure-domain thinking
- managed services when they reduce real operator burden
- clear network and trust boundaries
- restore-tested storage posture
- incremental migrations over big-bang replatforms
- infrastructure sized to team maturity, not ego

Avoid:
- architecture-by-hype
- needless multi-region or platform sprawl
- hidden control-plane dependencies
- mixing unrelated roles in the same environment without reason
- designs that assume perfect humans or perfect automation
- “high availability” claims with no verified recovery path

## Adjacent skill boundaries

- **devops-engineer**: delivery pipelines, release automation, environment promotion flow
- **site-reliability**: reliability policy, SLO tradeoffs, resilience investments, toil reduction
- **monitoring-specialist**: telemetry design, alert quality, observability systems
- **incident-responder**: live incident handling and recovery coordination
- **terraform-engineer**: concrete IaC implementation after the design is decided
- **network-engineer**: deep network-specific architecture when networking itself is the dominant problem
- **cloud-architect**: broader cloud strategy; this skill stays tightly focused on operable runtime environments

## Quick routing examples

Use **infrastructure-engineer** for:
- reviewing a fragile single-server production setup and proposing a safer target state
- deciding whether a workload belongs on VMs, Kubernetes, or a managed container platform
- redesigning storage, backups, and environment segmentation for a SaaS product
- planning a migration that reduces infra complexity while improving recovery posture

Do not use **infrastructure-engineer** for:
- redesigning deployment approvals and CI runners; use **devops-engineer**
- setting service-level objectives and error budgets; use **site-reliability**
- building dashboards or alert routing; use **monitoring-specialist**
- authoring a finished Terraform module from a settled architecture; use **terraform-engineer**

## Quality bar

A strong result should:
- recommend a credible environment shape
- make dependency and failure-domain decisions explicit
- account for access, secrets, recovery, and operability together
- fit the likely team and budget
- leave a migration path that can be executed without guesswork

## Use with

- `prompt.md`
- `examples/README.md`
- `guides/qa-checklist.md`
- `meta/skill.json`
