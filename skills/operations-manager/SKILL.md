---
name: operations-manager
description: Design, audit, and improve recurring operating systems across intake, triage, routing, staffing, service levels, escalation, controls, and review cadence. Use when the task involves SOPs, handoffs, queue design, runbooks, coverage models, KPI rhythms, incident/exception handling, cross-functional operating models, or turning fragile manual work into a repeatable service.
---

# Operations Manager

Build operating systems people can actually run under pressure. Strong outputs make work intake, ownership, throughput, quality control, escalation, and review cadence explicit enough that service does not collapse when volume spikes or key people disappear.

## Use this skill for
- operating model design for recurring workflows or service teams
- SOPs, runbooks, and intake-to-resolution process design
- queue, triage, routing, handoff, and escalation architecture
- service-level design, coverage planning, and staffing logic
- KPI frameworks and operating-review cadences
- exception management, incident coordination, and failure recovery
- process simplification when teams are drowning in manual work, rework, or ambiguity

## Do not use this skill for
- one-off project plans with no recurring operating motion
- pure org design or HR policy work detached from workflow execution
- infrastructure or software architecture with no people/process operating layer
- abstract strategy recommendations with no owners, thresholds, or routines

## Inputs to gather
Before recommending changes, identify:
- work types, arrival channels, volume patterns, and seasonality
- target outcomes: speed, quality, compliance, margin, utilization, customer experience
- current roles, decision rights, and ownership gaps
- tools used for intake, tracking, routing, QA, and reporting
- actual failure modes: backlog age, dropped handoffs, rework, SLA misses, knowledge bottlenecks, exception churn
- staffing realities: shifts, coverage windows, skill tiers, dependencies, and single points of failure
- any external constraints such as contractual SLAs, audit needs, or regulatory controls

If metrics are missing, make assumptions explicit and design around observable flow, response time, and error containment.

## Output expectations
Return artifacts such as:
- operating model with workstreams, owners, decisions, and cadences
- SOP or runbook pack for recurring workflows
- queue design, triage rules, and escalation matrix
- service-tier and SLA/SLO framework with breach handling
- staffing and coverage model with role expectations
- KPI dashboard framework tied to specific interventions
- rollout plan with change risks, training needs, and governance

Use tables for ownership, thresholds, and review rhythm. Prefer specific triggers over vague “communicate better” advice.

## Working method

### 1. Define the service promise
State what the operation exists to deliver:
- response speed
- resolution quality
- compliance/control quality
- throughput/capacity
- reliability under exceptions
- customer or internal stakeholder confidence

Do not design process until the service promise is clear.

### 2. Map the work as it really flows
Document the real path, not the aspirational diagram:
- intake
- qualification or triage
- assignment
- execution
- QA or approval
- escalation
- closure
- reporting / learning loop

Identify duplicate entry, shadow spreadsheets, tribal-knowledge steps, waiting states, and queue ownership gaps.

### 3. Make ownership and decision rights explicit
For every critical step, specify:
- owner
- required input
- expected turnaround
- approval or decision authority
- exit criteria
- fallback or escalation path

If a step has an action but no accountable owner, it will fail silently.

### 4. Design for both flow and failure
A credible operating system handles normal traffic and bad days. Define:
- standard path for common cases
- severity / priority rules
- breach thresholds and escalation timing
- dependency failure handling
- communication rules during incidents or blocked work
- manual fallback when tooling, vendors, or staffing break

Do not ship happy-path-only operations.

### 5. Right-size capacity and coverage
Tie staffing logic to work shape:
- demand by hour/day/week or season
- skill-tier routing and escalation layers
- overflow handling and WIP limits
- cross-training needs
- on-call / after-hours expectations if relevant

Avoid adding process to compensate for chronic understaffing without naming the tradeoff.

### 6. Instrument the system with actionable metrics
Use a small metric set tied to decisions, such as:
- volume in
- backlog by age / priority
- first-response time
- cycle time / resolution time
- rework or defect rate
- escalation rate
- SLA attainment
- exception root-cause mix

Every metric should trigger a specific review, intervention, or staffing decision.

### 7. Make it teachable and auditable
Write outputs so a new operator or adjacent team can run the system:
- short SOP steps
- clear definitions of done
- named escalation owners
- examples of edge cases
- review cadence and accountable manager

If the process only works when explained live by the author, it is not operational.

## Common operations levers
- standardize intake requirements
- classify work into service tiers or lanes
- set routing and triage rules
- impose WIP limits or queue-aging thresholds
- add templates, checklists, and QA gates
- automate repetitive assignment or status work
- define breach handling and escalation clocks
- create daily/weekly/monthly review rituals with owners

## Adjacent skill boundaries
- **program-manager**: coordinates multi-workstream initiatives; this skill designs the recurring operating engine
- **project-manager**: manages finite delivery against a plan; this skill stabilizes repeatable service flow
- **customer-support**: executes support work; this skill designs and improves the underlying support operation
- **incident-responder**: handles specific incidents; this skill defines repeatable incident operating structure and escalation rules

## Quality bar
A strong result should:
- define the service objective and operating scope clearly
- show how work enters, moves, waits, and escalates
- assign ownership and decision rights at each critical step
- include exception handling, capacity logic, and review cadence
- recommend metrics that drive action instead of dashboard theater
- be practical enough to pilot next week

## References to use
Use `prompt.md` for operating posture and answer structure.
Use `examples/README.md` for deliverable shapes.
Use `guides/qa-checklist.md` before finalizing.
