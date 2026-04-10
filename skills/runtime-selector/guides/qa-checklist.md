# QA Checklist — Runtime Selector

Use this before finalizing any routing recommendation.

## 1. Workload fit
- Is the workload classified clearly?
- Are success criteria explicit?
- Does the recommendation match actual complexity, context, and tool needs?

## 2. Constraint discipline
- Are policy, privacy, security, and context limits enforced first?
- Are unhealthy, quota-constrained, or unavailable runtimes treated appropriately?
- Are disallowed options explained plainly?

## 3. Tradeoff quality
- Are cost, latency, quality, and reliability tradeoffs visible?
- Is the primary choice justified against realistic alternatives?
- Does the recommendation avoid overprovisioning?

## 4. Fallback design
- Is there a clear fallback path?
- Are reroute, retry, or escalation triggers specified?
- Would the behavior still make sense during degradation?

## 5. Operational usefulness
- Can operators implement the recommendation directly?
- Are monitoring or reevaluation signals included?
- Would the guidance still be useful if runtime health changed tomorrow?

## 6. Writing quality
- Is the routing logic concise and auditable?
- Are recommendations easy to review later?
- Would a runtime owner trust the reasoning?