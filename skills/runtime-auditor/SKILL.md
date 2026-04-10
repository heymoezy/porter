---
name: runtime-auditor
description: Audit Porter runtime behavior to explain health, degradation, fallback pressure, latency, errors, queueing, and cost anomalies across model paths. Use when diagnosing what is failing now, what changed, how big the blast radius is, and what should be stabilized or escalated.
---

# Runtime Auditor

Read the runtime as it behaves, not as dashboards wish it behaved.

## Mission

Turn messy operational signals into an evidence-backed explanation of current runtime state: what broke, when it started, which paths are affected, what users feel, and which containment actions are lowest-regret.

## Use this skill when

- requests are failing, timing out, backing up, or falling back unexpectedly
- latency or throughput worsens and the cause is unclear
- runtime cost spikes and you need to separate volume from routing drift
- operators need a concise health or incident summary
- a recent deploy, config change, provider issue, or traffic shift may have degraded runtime behavior
- you need to distinguish real runtime risk from transient noise

## Do not use this skill for

- making production changes without authorization
- debugging unrelated product features with no runtime evidence
- long-range architecture redesign when the urgent problem is current-state reliability
- declaring root cause from a single graph or anecdote
- treating retries as success if user impact remains bad

## Core principles

1. **Rebuild the timeline first.** Sequence matters. Without time order, diagnosis becomes storytelling.
2. **Separate failure classes.** Provider degradation, routing policy mistakes, gateway issues, queue saturation, bad config, and downstream dependency failures are not the same problem.
3. **Use percentiles and rates, not just averages.** Tail behavior often explains user pain before means move enough.
4. **Follow fallback behavior.** A surge in fallback traffic often reveals where the primary path is degraded, rate-limited, or mismatched.
5. **Describe blast radius operationally.** State who is affected, how often, and at what severity.
6. **Prioritize containment before elegance.** Low-regret stabilization beats speculative perfection during an active issue.

## Inputs to gather

Collect the smallest set of signals that explains the incident honestly.

Typical inputs:
- affected runtimes, gateways, routes, or workload classes
- request volume, success rate, timeout rate, error rate, queue depth, and latency percentiles
- retry behavior, fallback frequency, and circuit-break or failover events
- recent deploys, model changes, config edits, region shifts, or quota/rate-limit events
- logs, traces, alerts, incident notes, and user reports
- baseline comparison: normal vs current
- actions already taken and what changed after them

If baseline data is missing, say so and downgrade confidence.

## Working method

### 1. Build the timeline

Pin down when symptoms started, whether they are continuous or bursty, and which operational changes happened nearby.

### 2. Isolate the affected path

Name the exact runtime path under review: provider, model tier, gateway, region, queue, or policy branch. Avoid collapsing everything into “the system.”

### 3. Compare normal vs abnormal

Contrast current metrics with recent baseline. Look for shifts in p95/p99 latency, error mix, fallback rate, queue depth, throughput, and cost per successful request.

### 4. Classify the failure mode

Useful buckets:
- provider / upstream degradation
- routing or policy misselection
- gateway or transport failure
- quota / rate limiting
- queue saturation or capacity bottleneck
- config or deployment regression
- downstream dependency issue
- mixed or still-undetermined

### 5. Rank hypotheses by evidence

For each plausible explanation, state:
- supporting evidence
- conflicting evidence
- confidence level
- what would confirm or falsify it next

### 6. Recommend containment and next checks

Propose the safest actions that reduce impact now while preserving observability.

## Output expectations

A strong runtime audit usually includes:
- incident or health summary
- affected paths and blast radius
- symptom timeline
- leading hypotheses with confidence levels
- most likely failure mode or bottleneck
- immediate stabilization steps
- escalation threshold or ownership handoff
- data gaps that still matter

## Analysis heuristics

Prefer:
- histogram / percentile thinking for latency
- request-rate context around errors and cost
- fallback and retry analysis as first-class signals
- explicit fact vs inference separation
- low-regret containment actions

Avoid:
- blaming the last deploy automatically
- calling every transient spike an incident
- mixing successful retries with acceptable user experience
- overfitting to one metric in isolation
- risky changes before understanding blast radius

## Adjacent boundaries

- **runtime-selector** — choose the right runtime prospectively; use this skill to explain live behavior and degradation
- **site-reliability** — design broader reliability practice, runbooks, and incident-management systems
- **service-level-monitor** — track SLO/SLA posture and trend reporting over time
- **security-auditor** — investigate security-relevant anomalies when the issue may be malicious or policy-sensitive

## Quality bar

A strong result:
- explains what is happening now in operationally useful terms
- distinguishes symptom, mechanism, and likely root cause as far as evidence allows
- shows blast radius and urgency clearly
- gives containment steps an operator can act on immediately
- leaves the next verification questions obvious

## Use the supporting files

- Read `prompt.md` for operating posture and evidence discipline.
- Read `examples/README.md` for audit-output shapes.
- Read `guides/qa-checklist.md` before finalizing.
- Read `meta/skill.json` for metadata and adjacent boundaries.