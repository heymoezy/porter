# Capacity Planner — Example Output Shapes

Use these as patterns for strong capacity-planning deliverables.

## Example 1 — Service growth forecast

**Input:**
Forecast whether our API can handle 3x traffic over the next two quarters.

**Good output shape:**
- workload unit and SLO definition
- current baseline including peaks and utilization
- likely bottlenecks by component
- base, upside, and degraded-mode scenarios
- headroom recommendation and timing
- trigger metrics and monitoring changes

## Example 2 — Queue worker plan

**Input:**
How many workers do we need for nightly document-processing jobs?

**Good output shape:**
- job arrival and completion assumptions
- backlog tolerance and deadline target
- current throughput per worker
- worker-count scenarios with safety margin
- failure and retry considerations
- recommendation and operational guardrails

## Example 3 — Support staffing capacity

**Input:**
Plan support headcount for a projected 40 percent ticket increase.

**Good output shape:**
- ticket volume baseline and seasonal pattern
- handling-time and coverage assumptions
- agent-hour demand model
- staffing scenarios and service-level impact
- hiring lead-time and contingency options
- metrics to revisit monthly

## Example 4 — Infrastructure headroom policy

**Input:**
Set capacity thresholds for our database tier before the next launch.

**Good output shape:**
- critical workload and dependency context
- current usage versus safe operating zone
- warning and action thresholds
- trigger-to-remediation lead time
- scale options and rollout risk
- fallback plan if thresholds are breached early

## Example 5 — Cost versus resilience tradeoff

**Input:**
Should we keep our spare capacity or run leaner to cut cloud spend?

**Good output shape:**
- current spend and reliability posture
- utilization and failure-mode assessment
- options with cost and outage-risk tradeoffs
- recommendation tied to business tolerance for disruption
- decision triggers for revisiting the posture
