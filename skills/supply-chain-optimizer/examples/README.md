# Supply Chain Optimizer — Example Deliverable Shapes

Use these as patterns for crisp, operationally useful outputs.

## Example 1 — Chronic stockouts plus excess inventory

**Input:**
Find out why the business keeps expediting high-volume SKUs while sitting on months of slow-moving stock.

**Good output shape:**
- objective and current symptoms
- likely root causes split by demand, policy, and execution
- SKU / supplier segments that need different treatment
- ranked fixes with cost, cash, and service tradeoffs
- 30/60/90-day implementation checkpoints

## Example 2 — Replenishment redesign

**Input:**
Recommend better reorder-point and safety-stock policies across A/B/C SKUs with uneven lead times.

**Good output shape:**
- service target assumptions by segment
- data gaps that matter before parameter changes
- proposed segmentation logic and policy rules
- tradeoffs of higher vs lower buffers by segment
- metrics to monitor after rollout

## Example 3 — Supplier resilience choice

**Input:**
Assess whether adding a second supplier is worth the complexity and cost.

**Good output shape:**
- current exposure and single-point-of-failure analysis
- event scenarios and business impact if the primary supplier fails
- options: stay single-source, dual-source, qualify backup, redesign spec
- cost, lead-time, quality, and ramp-risk tradeoffs
- recommendation and trigger conditions for action

## Example 4 — OTIF improvement memo

**Input:**
Improve OTIF without blowing up working capital.

**Good output shape:**
- target service promise and present OTIF gap
- where misses occur: supply, planning, production, transport, handoff
- leading indicators and bottleneck diagnosis
- highest-leverage interventions with side effects
- owner-by-owner next steps and review cadence

## Example 5 — Network and policy tension

**Input:**
Choose between holding more regional inventory or centralizing stock and absorbing longer delivery times.

**Good output shape:**
- demand and geography assumptions
- option comparison on service, inventory, transport, and fragility
- failure scenarios and recovery considerations
- recommendation tied to actual customer promise
- metrics that would prove the choice is working
