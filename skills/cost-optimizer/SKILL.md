---
name: cost-optimizer
description: Reduce infrastructure, cloud, SaaS, vendor, and operational spend without breaking service quality or business goals. Use when the task is to analyze cost drivers, identify waste, prioritize savings actions, improve utilization, compare architectural tradeoffs, or connect spend to unit economics and accountability. Do not use for pure reliability engineering, procurement-law review, or accounting treatment work.
---

# Cost Optimizer

Cut waste without cutting what actually matters.

This skill is for disciplined cost work: making spend visible, locating avoidable inefficiency, sizing savings, exposing tradeoffs, and recommending changes that preserve performance, resilience, and business value.

## Scope

Use this skill for:
- cloud and infrastructure cost analysis
- SaaS license and tooling-sprawl review
- workload rightsizing and utilization review
- storage, network, compute, and database cost reduction
- reserved-capacity / commitment planning support
- environment and lifecycle cost hygiene
- spend governance and accountability design
- cost-to-unit-economics analysis

## Use this skill when

Use this skill when the task needs:
- a ranked savings plan rather than vague “optimize costs” advice
- waste detection tied to actual drivers
- engineering-finance-business translation
- tradeoff analysis between savings, risk, and velocity
- unit cost framing such as cost per customer, request, team, or workload

## Do not use this skill when

Do not use this skill for:
- incident response or SRE firefighting as the main task
- vendor contract legal review
- bookkeeping, accounting-policy, or tax treatment questions
- pretending all cost cuts are good when they damage capacity, security, or delivery speed

## Inputs to gather

Before analyzing, identify:
- spend scope and period
- major cost categories and top drivers
- architecture or tool inventory
- usage/utilization data
- service-level and reliability constraints
- business priorities, growth expectations, and risk tolerance
- existing commitments, discounts, or contractual lock-ins
- desired outcome: quick savings, sustained governance, forecast accuracy, or unit-economics clarity

If the dataset is partial, say what conclusions are directional only.

## Output expectations

Return outputs such as:
- ranked savings opportunities
- waste and utilization findings
- cost-driver breakdown
- quick wins vs structural fixes
- estimated impact with assumptions
- guardrails for safe implementation
- owner-by-owner action plan

Use tables when helpful: category, issue, evidence, savings range, risk, owner, next step.

## Working method

### 1. Make spend legible

Start by segmenting cost into understandable buckets:
- compute
- storage
- data transfer/network
- databases/platform services
- observability/security tooling
- SaaS seats and overlapping vendors
- non-production environments

Optimization fails when the bill remains a blur.

### 2. Separate waste from justified spend

Look for patterns such as:
- idle or underutilized resources
- oversized instances or clusters
- low-value always-on environments
- duplicate tools or unused seats
- data retention and logging excess
- poor autoscaling behavior
- expensive architecture choices used by habit rather than need

Do not call a safety margin “waste” without evidence.

### 3. Connect cost to business activity

Translate spend into unit terms where possible:
- cost per tenant
- cost per request
- cost per job run
- cost per environment
- cost per sales rep or employee

This is where FinOps becomes decision-making instead of invoice archaeology.

### 4. Rank actions by savings, effort, and risk

Classify recommendations into:
- immediate hygiene fixes
- medium-effort engineering changes
- structural architecture or vendor shifts
- governance improvements that prevent cost rebound

Good cost work is prioritization, not a raw dump of findings.

### 5. Preserve service quality and strategic capacity

For each recommendation, note:
- impact on performance or reliability
- operational risk
- reversibility
- validation or rollout plan
- who must sign off

Cheap systems that miss SLAs are not optimized.

### 6. Build accountability loops

Recommend mechanisms like:
- budget ownership by team/service
- tagging and allocation hygiene
- spend anomaly review
- environment TTL policies
- license recertification
- commitment review cadence

Sustained savings require behavior change, not one cleanup sprint.

### 7. Be honest about tradeoffs

Call out when savings come with costs such as:
- slower builds or analytics
- lower redundancy
- migration work
- vendor-switch complexity
- deferred innovation

The right answer is often “not worth it.” Say so.

## Adjacent skill boundaries

- **cloud-architect**: owns overall platform design; this skill focuses on spend efficiency and economic tradeoffs
- **capacity-planner**: focuses on future demand and scaling sufficiency; this skill focuses on waste, efficiency, and spend control
- **procurement-specialist**: deeper sourcing and vendor negotiation process work
- **financial-analyst**: broader financial modeling beyond operational cost drivers
- **site-reliability / devops-engineer**: own reliability and delivery operations first; this skill evaluates their cost consequences

## Quality bar

A strong result should:
- identify the biggest spend drivers clearly
- distinguish waste from justified capacity
- size savings with assumptions and risk notes
- prioritize actions by impact and effort
- leave the operator with a realistic, accountable savings plan

## References to use

Use `prompt.md` for analysis posture and tradeoff framing.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` for output patterns.
Use `meta/skill.json` for boundaries and metadata.
