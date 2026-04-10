---
name: capacity-planner
description: Forecast service and infrastructure capacity, model demand versus supply, and recommend headroom, scaling, and resilience plans before systems or teams hit failure. Use when the work is about growth planning, saturation risk, throughput limits, staffing or resource headcount tied to demand, or cost-versus-reliability tradeoffs in capacity decisions. Do not use for one-off incident response or detailed implementation of infrastructure changes.
---

# Capacity Planner

Plan before the queue forms, not after users feel it.

This skill is for estimating how much load a system, team, or operation can absorb, where bottlenecks will appear, and what changes are needed before growth turns into delay, outages, or runaway cost. Strong capacity planning combines demand forecasts, service-level goals, headroom policy, and realistic failure modes.

## Scope

Use this skill for:
- infrastructure and service capacity forecasting
- workload growth modeling and demand scenarios
- saturation-risk analysis for CPU, memory, storage, network, queue depth, or concurrency limits
- staffing or operations capacity tied to ticket, case, or request volume
- scale-up, scale-out, and buffering decisions
- headroom policy, utilization targets, and resiliency planning
- capacity-related cost, risk, and timing recommendations

## Do not use this skill for

Do not use this skill for:
- emergency incident triage during an active outage
- detailed cloud architecture implementation or terraform authoring
- pure performance debugging at code level with no planning horizon
- budgeting disconnected from workload or service behavior
- naive straight-line forecasting with no scenario or bottleneck analysis

## Inputs to gather

Before planning, identify:
- service, system, or operation being planned
- current demand, throughput, concurrency, and peak patterns
- service level objectives, latency targets, or turnaround commitments
- current resource limits, utilization, and known bottlenecks
- growth drivers, seasonality, launch events, and risk scenarios
- autoscaling behavior, failover assumptions, and operational constraints
- cost envelope, procurement lead times, and change windows

If baseline telemetry is weak, say so. Capacity plans built on bad measurements create false confidence.

## Output expectations

Return outputs such as:
- baseline capacity assessment
- demand forecast with scenario ranges
- bottleneck and saturation-risk analysis
- headroom recommendation and trigger thresholds
- scale plan with timing, cost, and reliability tradeoffs
- staffing or coverage model tied to workload volume
- monitoring and revisit plan for capacity assumptions

## Working method

### 1. Define the unit of demand and the unit of capacity

Be explicit about what is arriving and what is being consumed.
Examples:
- requests per second versus application worker concurrency
- jobs per hour versus queue workers
- tickets per week versus available agent hours
- report runs per day versus warehouse compute slots

If the units are fuzzy, the plan will be nonsense.

### 2. Baseline the system under real peaks, not average comfort

Capture:
- normal and peak load
- burst shape and duration
- current utilization and tail behavior
- retry storms, batch windows, or synchronized spikes
- dependencies that saturate earlier than the primary service

Average utilization hides the conditions users actually experience.

### 3. Model bottlenecks before modeling spend

Use simple but defensible relationships:
- identify the limiting resource
- connect throughput, concurrency, and response time with napkin math when appropriate
- assume queues worsen fast near saturation
- protect headroom rather than planning to run permanently at the cliff edge

Do not promise linear scaling unless the architecture has earned that assumption.

### 4. Plan with scenarios, not one forecast

At minimum, compare:
- base case
- upside growth or launch spike
- failure or degraded-mode case
- delayed-procurement or delayed-hiring case

Capacity planning is about survival under variance, not elegance under one assumption set.

### 5. Recommend thresholds and lead times

A plan should specify:
- when to add capacity
- what metric or threshold triggers action
- how much capacity to add
- what lead time is required
- what fallback exists if the action is late

Without decision triggers, forecasts stay decorative.

### 6. Tie capacity to reliability and cost

Show the tradeoff clearly:
- extra headroom costs money but buys resilience
- lean utilization saves money until queueing, toil, or outages erase the savings
- some constraints can be removed architecturally rather than purchased around

Recommend the cheapest reliable plan, not the cheapest spreadsheet number.

## Heuristics

Prefer:
- peak-aware baselines
- scenario ranges rather than single-point certainty
- explicit headroom policy
- bottleneck-first reasoning
- trigger thresholds linked to real lead times

Avoid:
- planning to run continuously near 100 percent utilization
- assuming cloud autoscaling erases all capacity risk
- ignoring dependency bottlenecks such as databases, queues, or people
- straight-line growth math with no seasonality or event risk
- cost estimates with no stated reliability implications

## Review lenses

When evaluating capacity planning work, check:
- Are demand and capacity units clearly defined?
- Is the baseline built from real peak behavior and saturation signals?
- Are bottlenecks identified before broad recommendations are made?
- Are scenarios, triggers, and lead times explicit?
- Are reliability and cost tradeoffs visible?
- Would an operator know when to act and why?

## Adjacent skill boundaries

- **site-reliability**: operates and improves reliability in live systems beyond planning artifacts
- **performance-optimizer**: investigates code or system performance bottlenecks in depth
- **cloud-architect**: designs target architecture choices once planning constraints are known
- **operations-manager**: staff planning and execution management after capacity choices are approved
- **cost-optimizer**: reduces spend broadly when capacity sufficiency is not the main question

## Quality bar

A strong result should:
- quantify the relationship between demand and available capacity
- identify the first likely bottleneck, not just generic scaling ideas
- preserve operational headroom
- state triggers, timing, and fallback actions clearly
- make reliability-versus-cost tradeoffs impossible to miss

## References to use

Use `prompt.md` for response structure and stance.
Use `examples/README.md` for output shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata and boundaries.
