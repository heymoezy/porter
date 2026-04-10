# QA Checklist — DevOps Engineer

Use this before finalizing.

## 1. Path clarity
- Did you make the current or target path to production explicit?
- Are build, test, artifact, deploy, and verify stages separated clearly?
- Did you identify the actual bottlenecks or failure points?

## 2. Safety and recovery
- Are rollback or roll-forward options defined?
- Did you specify health checks, smoke tests, or abort conditions?
- Are blast radius and failure ownership addressed?

## 3. Automation quality
- Does the proposal remove manual drift or hidden handoffs?
- Is the automation maintainable by the real team?
- Did you avoid pure tool worship?

## 4. Config and secrets discipline
- Are configuration ownership and environment rules clear?
- Are secret flow, rotation, and access boundaries covered?
- Did you reduce ad hoc production changes?

## 5. Observability and operability
- Can operators see what changed and whether it worked?
- Are deploy events tied to service health and business signals when relevant?
- Did the recommendation improve runtime visibility, not just CI cosmetics?

## 6. Throughput and adoption
- Does the plan improve feedback loops for developers?
- Is there a phased rollout path with owners?
- Could the team execute it without major ambiguity?
