# QA Checklist — Site Reliability Engineer

Use this before finalizing reliability guidance.

## 1. Service promise clarity
- Is the critical user journey or service promise explicit?
- Is the reliability target, SLO, or acceptable failure envelope stated or called out as missing?
- Does the work avoid abstract uptime talk detached from user impact?

## 2. Failure concentration quality
- Are the dominant failure modes, bottlenecks, or propagation paths identified?
- Are dependencies, saturation points, and single points of failure visible?
- Are repeated incidents treated as structural signals rather than bad luck?

## 3. Observability and alert quality
- Are missing signals named specifically?
- Are alerts tied to symptoms, burn rate, or meaningful operational action?
- Does the plan reduce noise instead of adding more pages?

## 4. Change and recovery realism
- Are deploy, config, rollback, and blast-radius controls assessed when relevant?
- Does the output improve response and recovery, not just prevention?
- Are runbooks, drills, automation, or graceful-degradation paths addressed where needed?

## 5. Prioritization and tradeoffs
- Are recommendations ranked by leverage and feasibility?
- Are cost, complexity, and delivery-speed implications stated honestly?
- Is residual risk clear after the proposed changes?

## 6. Operator usefulness
- Would on-call, platform, or engineering leads know what to do next?
- Are owners, sequencing, or validation steps implied clearly enough to act?
- Would an experienced SRE view this as concrete guidance instead of generic advice?
