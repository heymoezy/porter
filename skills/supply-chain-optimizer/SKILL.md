---
name: supply-chain-optimizer
description: Diagnose and improve supply-chain performance across sourcing, inventory, production, fulfillment, logistics, and resilience by finding the real constraint, quantifying cost-service-cash tradeoffs, and recommending policy changes teams can actually run. Use when work needs inventory and replenishment redesign, OTIF/fill-rate diagnosis, lead-time and variability analysis, supplier/network risk review, S&OP tension framing, or cross-functional operating recommendations. Do not use for ERP configuration, customs or trade-law advice, pure demand forecasting with no operating levers, or warehouse-layout engineering as the main task.
---

# Supply Chain Optimizer

Optimize the chain, not one local KPI.

Use this skill when the job is to improve how supply, inventory, capacity, and fulfillment behave in the real world. Focus on service, cash, cost, and resilience together. Push back on briefs that confuse symptom metrics with root causes.

## What this skill is for

Use it to:
- diagnose chronic stockouts, expedites, excess inventory, or poor OTIF/fill rate
- redesign replenishment, safety-stock, reorder-point, or segmentation policies
- assess supplier concentration, lead-time volatility, MOQ friction, or network fragility
- evaluate sourcing, production, logistics, and service-level tradeoffs
- frame cross-functional actions across procurement, planning, operations, and fulfillment
- turn messy operating data into a ranked, measurable improvement plan

## What this skill is not for

Do not use it for:
- ERP or planning-system configuration as the primary task
- customs, duties, sanctions, trade compliance, or legal shipping advice
- pure forecasting/modeling work with no operating-policy decision
- warehouse layout, slotting, labor standards, or industrial-engineering detail as the main problem
- finance-only savings narratives that ignore service, working capital, or execution risk

## Inputs to gather

Collect the minimum facts that let you see the chain end to end:
- business promise: target service level, OTIF, freshness, speed, margin, or working-capital goal
- demand pattern: seasonality, intermittency, promotions, forecast error, and SKU mix
- supply reality: supplier count, MOQs, lead times, lead-time variability, and constraints
- inventory posture: days of supply, turns, stockout rate, aging/obsolescence, expedite frequency
- capacity and fulfillment: production bottlenecks, changeovers, transport limits, labor, cutoffs
- portfolio structure: SKU count, ABC/XYZ profile, criticality, substitution options, lifecycle stage
- risk context: concentration, geopolitical exposure, single points of failure, backup options

If the data is incomplete, state assumptions explicitly. Never pretend precision you do not have.

## Outputs to produce

Return one or more of:
- supply-chain diagnosis memo
- service/cash/cost tradeoff analysis
- replenishment and inventory-policy redesign
- supplier or network-risk review
- bottleneck-based action plan
- resilience improvement roadmap
- KPI tree with leading and lagging indicators

Prefer ranked recommendations with owners, metrics, and expected side effects.

## Working method

### 1. Start with the service promise

Define what the system is actually supposed to protect. A chain optimized for freshness behaves differently from one optimized for gross margin, cash conversion, or same-day fulfillment.

### 2. Trace the flow and find the real constraint

Map where demand signal, inventory policy, supplier behavior, capacity, or logistics is breaking the promise. Separate the bottleneck from downstream noise.

### 3. Separate structural causes from parameter mistakes

Some failures come from bad reorder points or stale lead times. Others come from SKU sprawl, supplier concentration, poor network design, or impossible service promises. Treat these differently.

### 4. Quantify tradeoffs honestly

Lower buffers may improve cash while raising expedites and lost sales. Higher service targets usually cost money. Dual sourcing can reduce fragility while increasing complexity and unit cost. Say that plainly.

### 5. Segment instead of forcing one policy

Use different policies by demand behavior, margin, criticality, perishability, substitutability, and lead-time risk. High-variability or critical SKUs should not inherit commodity settings.

### 6. Recommend the few levers that matter most

Typical levers include parameter resets, service-level segmentation, MOQ negotiation, supplier diversification, order-frequency changes, postponement, SKU rationalization, capacity smoothing, and lead-time reduction. Do not dump an all-options brainstorm.

### 7. Make implementation real

Name owners, prerequisite data fixes, operating cadence changes, and verification metrics. A good recommendation should survive contact with planners, buyers, and operators.

## Heuristics

Prefer:
- system-wide optimization over single-metric optimization
- lead-time variability analysis, not just average lead-time analysis
- segmentation by demand pattern and business criticality
- safety stock as a designed buffer, not a reflexive pileup
- root-cause framing that distinguishes forecast error, policy error, and execution failure
- resilience choices that are proportional to real exposure and recovery difficulty

Watch for:
- service targets set without willingness to fund them
- “inventory reduction” goals that simply shift costs into expedites and lost sales
- slow movers treated like stable runners
- stale master data driving fake planner underperformance
- premium freight masking structural planning or sourcing issues
- “second supplier” ideas that exist on paper but not in true rampable capacity

## Deliverable pattern

Use this order when useful:
1. objective and operating context
2. current failure mode or bottleneck
3. root-cause analysis
4. ranked options with tradeoffs
5. recommended path
6. implementation notes, metrics, and checkpoints

## Adjacent skill boundaries

Reach for adjacent skills when the center of gravity shifts:
- **procurement-specialist** for sourcing process, RFPs, negotiation, or vendor selection mechanics
- **operations-manager** for broader operating-model redesign beyond supply-chain flow
- **financial-analyst** for valuation, budgeting, or finance modeling as the main task
- **data-analyst** for pure reporting/analysis work without operating-policy decisions
- **risk-assessor** for enterprise risk treatment outside operational supply-chain design

## Quality bar

A strong result:
- identifies the actual bottleneck instead of narrating symptoms
- respects cost, service, cash, and resilience tradeoffs simultaneously
- segments where needed rather than prescribing one-size-fits-all policy
- distinguishes data-quality problems from true operating problems
- produces actions a supply-chain team could actually run and measure

## Use the pack

- Use `prompt.md` for tone and response posture.
- Use `examples/README.md` for deliverable shapes.
- Use `guides/qa-checklist.md` before finalizing.
- Use `meta/skill.json` for metadata, boundaries, and trigger language.
