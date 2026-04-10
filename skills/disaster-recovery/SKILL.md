---
name: disaster-recovery
description: Design disaster recovery strategy, backup and restore posture, continuity plans, failover approach, and recovery runbooks for severe outages, data corruption, ransomware-style disruption, or regional/provider failure. Use when the core problem is restoring critical services and data to explicit recovery targets (RTO/RPO), validating recovery readiness, prioritizing continuity investments, or turning resilience gaps into tested recovery plans. Do not use for ordinary uptime tuning, narrow deployment rollback planning, or generic risk talk with no executable recovery design.
---

# Disaster Recovery

Plan for the day the system is damaged, unavailable, or untrustworthy.

This skill exists to turn business impact into recovery objectives, recovery objectives into recovery design, and recovery design into runbooks and exercises that hold up under stress.

## Use this skill to

- define service tiers and business recovery priorities
- set or challenge RTO and RPO targets
- review backup, restore, retention, and immutability posture
- plan failover, rebuild, and continuity options across regions or providers
- map hidden dependencies that govern recovery speed
- write recovery runbooks for corruption, outage, compromise, or operator-loss scenarios
- design drills, tabletop exercises, and restore tests
- produce gap analyses and prioritized remediation roadmaps

## Do not use this skill to

- tune normal availability, latency, or autoscaling with no disaster scenario
- treat replication or snapshots as proof of recovery readiness
- write a feature rollback plan when broader continuity is not in scope
- produce generic business-risk language without explicit recovery mechanics

## Inputs to gather

Collect the minimum reality needed to avoid fiction:

- critical business processes and the systems that support them
- service tiers, downtime impact, and tolerable data loss by workflow
- current RTO/RPO targets, or evidence that none are actually agreed
- system architecture, state stores, control planes, and third-party dependencies
- backup cadence, retention, restore steps, geographic separation, and access controls
- identity, DNS, secrets, networking, and people/process dependencies
- compliance, contractual, and customer commitments that shape recovery posture
- likely failure scenarios: corruption, region loss, ransomware, provider outage, operator unavailability

If business priorities are unclear, say so early. Recovery planning without ranked priorities becomes theater.

## Deliverables

Return only artifacts that help the team recover faster or invest more intelligently:

- RTO/RPO matrix with target rationale and feasibility gaps
- disaster scenario matrix with controls, weaknesses, and owners
- backup and restore readiness assessment
- recovery strategy memo by service tier
- executable runbook or playbook outline
- exercise plan with success criteria
- prioritized remediation roadmap tied to business impact

Use tables whenever comparing tiers, dependencies, scenarios, or remediation waves.

## Working method

### 1. Start with business failure, not infrastructure inventory

Anchor the work in business consequences:

- what must be restored first
- what can degrade temporarily
- what data loss is unacceptable
- what manual fallback is possible
- what commitments exist to customers, regulators, or internal operations

The right question is not “how do we recover everything?” It is “what must we recover first, how fast, and with what evidence?”

### 2. Make recovery objectives explicit and owned

For each critical service or workflow, state:

- target **RTO**: maximum acceptable time to restore service
- target **RPO**: maximum acceptable data loss window
- current technical posture
- confidence level in meeting the target
- who accepted the tradeoff

If a target exists only in someone’s head, treat it as ungoverned risk.

### 3. Separate backup existence from restore capability

Review recovery reality, not checkbox comfort:

- backup frequency and coverage
- retention depth and offsite/geographic separation
- immutability or tamper resistance where compromise is plausible
- restore time, sequencing, and operator access
- consistency checks after restore
- proof from recent restore tests

Backups are inventory. Recovery readiness is demonstrated restore capability.

### 4. Map dependency chains honestly

A service recovers only as fast as its slowest hidden dependency.

Include:

- databases and object stores
- identity and access systems
- DNS, certificates, networking, and secrets
- queues, caches, schedulers, and background workers
- external providers and contractual dependencies
- people, approvals, knowledge holders, and communication paths

Call out dependencies that make failover impossible even when compute is available.

### 5. Design by failure scenario

Work through plausible scenarios such as:

- accidental deletion or destructive migration
- logical corruption spreading through replicas and backups
- regional or provider outage
- ransomware-style disruption or credential compromise
- control-plane or identity outage
- operator unavailability during the incident

For each scenario, specify containment, recovery path, decision owner, confidence, and unresolved risk.

### 6. Choose the right recovery mode per system

Not every system needs the same answer. Distinguish between:

- restore in place
- fail over to warm/hot standby
- rebuild from infrastructure as code plus data restore
- degrade gracefully with manual fallback
- accept delayed recovery for low-value services

Push back on premium failover designs where business impact does not justify them.

### 7. Write runbooks that work under stress

A usable runbook includes:

- trigger conditions and entry criteria
- incident commander / decision owner
- prerequisites, credentials, and access assumptions
- ordered actions with validation checkpoints
- communications, escalation, and stakeholder updates
- return-to-normal and post-incident steps

If a new operator could not run it at 3 a.m., it is not finished.

### 8. Make testing part of the design

Recommend evidence-producing exercises:

- backup restore drills
- checksum / integrity verification
- dependency-loss tabletop exercises
- regional failover simulations
- recovery-time measurements against stated RTOs
- post-exercise updates to runbooks, ownership, and tooling

Untested recovery plans should be labeled as unproven, not ready.

## Output structure

When useful, organize the answer in this order:

1. systems, assumptions, and business priorities
2. target versus current-state RTO/RPO
3. dependency and scenario analysis
4. recommended recovery design or runbook
5. evidence gaps, testing plan, and remediation priorities

## Adjacent skill boundaries

- **site-reliability**: handles availability and incident operations broadly; this skill focuses on major-failure recovery and continuity posture
- **devops-engineer**: improves delivery and platform automation; this skill defines recovery readiness and disaster execution design
- **database-admin**: goes deeper on engine-specific backup and restore mechanics; this skill coordinates end-to-end service recovery
- **security-auditor**: evaluates compromise risk; this skill defines how to restore operations after destructive or compromise-driven failure
- **cloud-architect**: designs infrastructure topology; this skill decides whether that topology actually supports recovery objectives

## Quality bar

A strong result:

- ties every recovery recommendation to business impact and explicit targets
- distinguishes backup comfort from restore evidence
- exposes hidden dependencies and operator constraints
- treats scenarios realistically instead of assuming best-case conditions
- produces a testable, prioritized plan rather than abstract resilience language

## Files in this pack

- `prompt.md` — response posture and recovery framing
- `examples/README.md` — output-shape examples
- `guides/qa-checklist.md` — final review checklist
- `meta/skill.json` — routing metadata and boundaries
