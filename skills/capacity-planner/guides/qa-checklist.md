# QA Checklist — Capacity Planner

Use this before finalizing any capacity-planning output.

## 1. Measurement baseline
- Are the demand and capacity units explicit?
- Is the baseline based on real peaks, burst behavior, and known bottlenecks?
- Are measurement gaps or telemetry weaknesses stated clearly?

## 2. Forecast quality
- Are scenarios provided instead of a single-point forecast?
- Are growth assumptions, seasonality, and event risks visible?
- Does the plan account for degraded-mode or failure cases?

## 3. Recommendation quality
- Is the first likely bottleneck identified?
- Are headroom targets, trigger thresholds, and lead times specific?
- Are recommendations tied to both reliability and cost consequences?

## 4. Operational usability
- Would an operator or manager know when to act and what to do?
- Are fallback options included if scaling or hiring is delayed?
- Are monitoring changes or revisit checkpoints defined?

## 5. Overall strength
- Does the plan avoid average-only or linear-scaling assumptions?
- Does it expose dependency or staffing bottlenecks, not just primary resource limits?
- Would this output reduce surprise under growth, launches, or incidents?
