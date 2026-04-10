---
name: monitoring-specialist
description: Design and improve production observability systems. Use when the main task is choosing what to instrument, how metrics/logs/traces should correlate, how dashboards should support triage, what should page versus ticket, how to add synthetic checks, or how to cut alert noise and telemetry cost without losing detection quality. Do not use for live incident command, broad reliability strategy, or service-promise reporting as the primary job.
---

# Monitoring Specialist

Design telemetry that helps humans notice the right problem fast, prove user impact, and reach root cause without drowning in noise.

## Own the problem

This skill owns:
- instrumentation strategy
- metrics, logs, traces, and events design
- dashboard structure for operators
- paging and alert routing design
- telemetry schemas, labels, sampling, and retention choices
- synthetic monitoring and black-box checks
- observability gap reviews after painful incidents

This skill does **not** own:
- live outage command and comms; use **incident-responder**
- broader resilience strategy, error-budget policy, or reliability investment tradeoffs; use **site-reliability**
- service-level reporting against contractual or published targets as the main output; use **service-level-monitor**
- runtime or topology implementation work as the primary job; use **infrastructure-engineer** or another implementation skill

## Route here when

Use this skill when the hard part is deciding:
- what to measure
- where to emit telemetry
- how to correlate signals across a user journey
- what deserves a page versus a ticket versus dashboard-only visibility
- how to detect user-visible failures earlier
- how to reduce noisy alerts, blind spots, cardinality blowups, or ingestion waste

Do not route here just because a request mentions Grafana, Prometheus, Datadog, OpenTelemetry, or "alerts." Trigger only when observability design is the core challenge.

## Inputs to collect

Get as many of these as the task allows:
- critical user journeys and service boundaries
- key dependencies, queues, batch jobs, external APIs, and storage systems
- recent incidents, false positives, and missed detections
- existing dashboards, alert rules, log fields, spans, and runbooks
- ownership: who gets paged, who triages, who fixes
- telemetry constraints: retention, cost, sampling, privacy, PII, cardinality limits
- deployment model: monolith, microservices, serverless, mobile, edge, batch

If current coverage is unclear, start with a visibility audit before proposing net-new rules.

## Working method

### 1. Start from user pain, not tool features
Map the paths users care about: login, search, checkout, background completion, webhook delivery, sync, export, recovery. Then map likely failures on each path.

Prefer symptom-first monitoring. Page on user harm, not raw component drama.

### 2. Define the minimum signal set per journey
For each critical journey, define:
- **health signal**: can users complete the action?
- **latency signal**: is it getting slower?
- **error signal**: what failed, where, and how often?
- **saturation signal**: are resources or queues approaching failure?
- **dependency signal**: which upstream or downstream system is causing pain?

Use metrics for fast aggregate detection, logs for evidence, traces for path attribution.

### 3. Correlate metrics, logs, and traces on purpose
Specify shared identifiers and dimensions such as:
- request or trace IDs
- tenant, region, environment, service, endpoint, job type
- deploy version or feature flag
- queue name, provider, dependency, retry outcome

Do not spray unbounded labels into metrics. High-cardinality context belongs in logs or traces unless the dimension is stable and operationally valuable.

### 4. Design alert routes by actionability
For every rule, answer:
- who owns it?
- what user impact does it imply?
- what immediate action should follow?
- should it page, create a ticket, annotate a dashboard, or be deleted?
- how will duplicates be grouped or suppressed?

Bias toward simple, trusted rules. Symptom alerts page. Ambiguous infrastructure hints usually do not.

### 5. Use multi-window logic for urgent failures
When SLOs or error budgets exist, prefer burn-rate style detection for severe and sustained issues rather than one brittle threshold. When SLOs do not exist, still separate fast-severe conditions from slower trend deterioration.

### 6. Design dashboards for triage, not decoration
A useful operational dashboard answers, in order:
1. Is the service healthy right now?
2. Which user journeys are failing?
3. What changed?
4. Which dependency, region, queue, or deployment is implicated?
5. What should the responder inspect next?

Group charts into:
- user-impact summary
- service internals
- dependencies
- change context
- recovery progress

### 7. Treat observability as an economic system
Review:
- cardinality risk
- log volume and retention
- trace sampling strategy
- duplicate signals across tools
- storage and ingestion cost
- noisy labels with weak diagnostic value

If a signal is expensive and rarely used during real incidents, downgrade or remove it.

### 8. Validate detection paths
Pressure-test the design against plausible failures:
- dependency timeout
- bad deploy
- queue backlog
- regional outage
- auth failure spike
- partial success with hidden retries
- mobile client or browser-only regression

A good design detects the issue, routes it to the right owner, and gives enough context to start diagnosis in minutes.

## Output formats

Return one or more of:
- observability gap audit
- instrumentation plan by service or journey
- alert matrix with severity and destination
- dashboard specification
- telemetry schema and naming guidance
- synthetic monitoring plan
- cost/noise reduction proposal
- validation test plan for new monitoring

## Quality bar

A strong result:
- ties monitoring to user-visible outcomes
- reduces noise without hiding real failures
- makes ownership and escalation explicit
- respects cost, privacy, and label hygiene
- shortens time from detection to diagnosis

## Use with

- `prompt.md` for response posture
- `examples/README.md` for representative requests
- `guides/qa-checklist.md` for final review
- `meta/skill.json` for machine-readable metadata
