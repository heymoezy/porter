# Service Level Monitor — Example Output Shapes

Use these patterns for concise, trusted service-level reporting.

## 1) Weekly SLO report

**Input:**
Summarize this service’s SLO posture for the week.

**Good output shape:**
- target definition
- current attainment and error-budget position
- notable degradations
- burn-rate / near-breach outlook
- recommended follow-up actions

## 2) Monthly SLA breach risk

**Input:**
Are we at risk of breaching the customer SLA this month?

**Good output shape:**
- contractual target and measurement window
- current attainment vs threshold
- main risk drivers
- watch / at-risk / breach classification
- communication and mitigation timing

## 3) Tail latency problem

**Input:**
Average latency looks fine, but users are complaining. Analyze service-level risk.

**Good output shape:**
- why averages are misleading
- percentile or tail-latency framing
- effect on commitments or user experience
- monitoring adjustments
- action plan

## 4) Support response commitment review

**Input:**
Are we meeting first-response commitments across support tiers?

**Good output shape:**
- metric and clock rules
- compliance by tier or segment
- queue pressure and trend signals
- breach-risk segments
- staffing / workflow recommendations

## 5) Customer update after instability

**Input:**
Draft a concise service-level update for a customer after repeated incidents.

**Good output shape:**
- plain statement of performance vs commitment
- whether the target was met or threatened
- corrective actions underway
- what will be monitored next
- transparent, non-evasive tone
