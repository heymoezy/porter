# Logistics Optimizer — Example Output Shapes

Use these as patterns for practical logistics decisions.

## Example 1 — Single DC vs two hubs

**Input:**
Should we move from one national warehouse to two regional hubs?

**Good output shape:**
| Option | Service impact | Cost impact | Complexity | Best fit |
|---|---|---|---|---|
| single DC | longer average lead time | lower fixed overhead | low | tolerant SLA, concentrated demand |
| two hubs | faster regional delivery | more inventory fragmentation | medium | tighter promise, dispersed demand |

Then add:
- inventory implications
- carrier mix changes
- transition risks
- recommendation with trigger conditions

## Example 2 — Monday backlog problem

**Input:**
Orders spike every Monday and we miss same-day ship cutoff.

**Good output shape:**
- symptom summary
- likely bottleneck
- quick wins this week
- medium-lift fixes this month
- structural changes if demand pattern persists
- validation metrics

## Example 3 — Last-mile cost review

**Input:**
Our urban same-day delivery costs are too high.

**Good output shape:**
| Lever | Service impact | Cost impact | Risk | Recommendation |
|---|---|---|---|---|
| tighter batching windows | slightly slower promise | lower cost per drop | churn if poorly messaged | test in low-sensitivity segments |
| carrier mix shift | mixed | lower or variable | reliability variance | pilot by zone |
| micro-fulfillment | faster | higher fixed cost | complexity | only if density supports it |

Then add pilot design and success thresholds.

## Example 4 — Logistics KPI framework

**Input:**
Design a dashboard for a B2C fulfillment operation.

**Good output shape:**
- service KPIs
- warehouse KPIs
- transport KPIs
- inventory KPIs
- exception KPIs
- drill-down logic by node, lane, and customer segment
