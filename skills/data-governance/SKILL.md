---
name: data-governance
description: Define and improve data ownership, stewardship, quality policy, metadata, lineage, access, retention, and control models for trustworthy enterprise data use. Use when Porter needs governance frameworks, stewardship operating models, classification schemes, data-quality accountability, metadata policy, access-control matrices, retention rules, or compliance-aware guidance for treating data as a managed asset. Do not use for low-level pipeline implementation, dashboard analysis, or public-facing storytelling.
---

# Data Governance

Turn “someone should manage this” into named owners, enforceable rules, and measurable trust.

This skill is for governing data as an asset: deciding who owns it, how it is classified, what quality it must meet, who may access it, how long it lives, and how exceptions are handled without chaos.

## Scope

Use this skill for:
- governance framework and operating-model design
- data ownership and stewardship definitions
- data classification and sensitivity policy
- metadata, catalog, glossary, and lineage expectations
- data-quality policy, thresholds, and remediation flow
- access, approval, audit, and retention-control design
- issue escalation, exception handling, and governance cadence
- domain-by-domain governance rollout planning

## Use this skill when

Use this skill when the task needs:
- a practical governance model, not just a list of principles
- clear decision rights over definitions, access, quality, and remediation
- a way to separate critical data from everything else
- policy language that technical, business, security, and legal teams can all operate
- trust controls that are proportionate to risk and business value

## Do not use this skill when

Do not use this skill for:
- designing ingestion pipelines or transformation jobs
- interpreting metrics or producing analytical conclusions
- writing privacy law advice or legal opinions as a substitute for counsel
- inventorying tables with no ownership or control implications
- creating bureaucracy for its own sake

## Inputs to gather

Before proposing controls, identify:
- data domains and datasets in scope
- business criticality and who depends on them
- sensitive classes involved: customer, employee, financial, health, regulated, confidential
- current ownership gaps and failure patterns
- relevant legal, contractual, audit, or policy obligations
- lifecycle expectations: creation, use, sharing, retention, deletion
- current metadata, lineage, and access tooling maturity
- incident history around quality, misuse, or unauthorized access
- tolerance for friction versus risk in the operating environment

If control requirements differ by domain, keep them domain-specific instead of forcing fake uniformity.

## Output expectations

Return outputs such as:
- governance framework
- ownership/stewardship RACI
- policy draft or control standard
- data-quality standard
- access and retention matrix
- lineage/metadata requirements
- escalation and exception process
- phased rollout plan

Strong output should help an organization operate better next week, not just sound mature in a slide deck.

## Working method

### 1. Define what is being governed and why

Clarify:
- which domains and datasets matter most
- why they matter: revenue, reporting, operations, compliance, customer trust
- what can go wrong if the data is wrong, exposed, stale, or misused
- which datasets are truly critical versus merely convenient

Do not make every table a crown jewel.

### 2. Assign ownership before writing policy

Name roles such as:
- executive sponsor
- domain owner
- data steward
- producer/system owner
- consumer or requestor
- access approver
- remediation owner
- audit or control reviewer

Governance with anonymous responsibility is theater.

### 3. Translate principles into operating rules

Specify rules for:
- business definitions and approved terms
- classification and labeling
- required metadata and lineage capture
- quality thresholds and breach handling
- access requests and periodic review
- retention, archival, and deletion
- third-party sharing and export controls
- exception requests, approvals, and expiry

A policy that cannot be enacted is just literature.

### 4. Make trust measurable

For important data, define:
- quality dimensions that matter
- thresholds by use case
- who monitors them
- when an issue becomes an incident
- expected remediation time
- who may approve temporary exceptions

Tie controls to service expectations, not generic slogans.

### 5. Balance control with usability

Recommend the lightest model that still protects:
- confidentiality
- integrity
- availability for legitimate use
- regulatory and contractual obligations
- executive trust in key decisions

Too much friction creates shadow systems. Too little control creates silent damage.

### 6. Design the operating cadence

Define:
- governance forum or review cadence
- issue triage and escalation path
- domain onboarding steps
- metrics for adoption and control health
- review cycles for access and retention
- conditions that trigger policy revision

Governance only works if it becomes routine work.

## Adjacent skill boundaries

- **data-engineer**: implements technical movement, modeling, and reliability patterns; this skill defines ownership, control, and policy expectations around data
- **privacy-specialist**: focuses more deeply on privacy obligations, legal interpretations, and privacy-by-design controls
- **compliance-officer**: owns broader regulatory and audit posture; this skill focuses on data-specific governance mechanics
- **knowledge-manager**: may organize information systems and documentation; this skill governs enterprise data assets and control models
- **risk-assessor**: evaluates enterprise risks broadly; this skill turns data-specific risk into operating rules and accountability

## Quality bar

A strong result should:
- make ownership and decision rights unambiguous
- distinguish critical from noncritical data sensibly
- define enforceable, reviewable controls instead of platitudes
- connect quality, lineage, access, and retention into one operating model
- stay proportionate to actual business and compliance risk

## References to use

Use `prompt.md` for governance posture and response shape.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` for representative governance requests.
Use `meta/skill.json` for routing metadata and boundaries.
