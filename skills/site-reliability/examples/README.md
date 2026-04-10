# Site Reliability Engineer — Example Output Shapes

Use these patterns to keep reliability work ranked, concrete, and operational.

## Example 1 — Reliability review

**Input:**
Review this service and tell us what is most likely to wake up on-call next quarter.

**Good output shape:**
- service promise and critical user journeys
- top failure concentrations
- missing telemetry or confidence gaps
- ranked fixes by leverage
- what to monitor after changes

## Example 2 — SLO and alerting redesign

**Input:**
Our alerts are noisy and we still miss user-impacting incidents. What should we change?

**Good output shape:**
- current alert failure modes
- proposed SLIs/SLO alignment
- symptom-based and burn-rate alert changes
- paging vs ticketing split
- rollout and tuning guidance

## Example 3 — Change-safety hardening

**Input:**
Most incidents come from deploys or config mistakes.

**Good output shape:**
- incident pattern summary
- change-path weaknesses
- canary / feature-flag / verification / rollback improvements
- blast-radius reduction tactics
- ownership and sequencing

## Example 4 — Capacity and overload risk

**Input:**
Traffic is growing faster than expected. Assess reliability risk.

**Good output shape:**
- demand assumptions and critical bottlenecks
- saturation and dependency risks
- overload behavior and degradation plan
- near-term mitigations vs longer-term changes
- signals and thresholds to watch

## Example 5 — Post-incident follow-through

**Input:**
We had a major outage. Turn the lessons into actions.

**Good output shape:**
- what failed and why it propagated
- prevention, detection, and recovery gaps
- action items with leverage and verification method
- runbook, drill, or automation follow-up
- residual risk after fixes
