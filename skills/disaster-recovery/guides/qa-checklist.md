# QA Checklist — Disaster Recovery

Use this before finalizing any disaster-recovery output.

## 1. Business alignment
- Did you identify the critical workflows or service tiers?
- Are RTO and RPO explicit where relevant?
- Did you tie recommendations to downtime and data-loss consequences rather than infrastructure preference?

## 2. Recovery realism
- Did you distinguish backup presence from restore readiness?
- Are restore, failover, rebuild, and manual fallback paths separated clearly?
- Did you avoid treating replication, snapshots, or architecture diagrams as proof of recoverability?

## 3. Dependency and access awareness
- Did you include identity, DNS, secrets, networking, third-party, and people/process dependencies?
- Would any hidden dependency block the proposed recovery timeline?
- Are ownership, approvals, and operator-access assumptions visible?

## 4. Scenario coverage
- Did you analyze plausible failure modes instead of generic “disaster” language?
- Are destructive events such as corruption, provider outage, and compromise considered when relevant?
- Are containment and verification steps included, not just recovery steps?

## 5. Runbook and evidence quality
- Could an operator execute the plan under time pressure?
- Are trigger conditions, roles, ordered steps, validation checks, and return-to-normal guidance present?
- Did you state what evidence proves readiness or target compliance?

## 6. Prioritization and usefulness
- Is there a concrete remediation roadmap with priorities or owners?
- Are investment tradeoffs and residual risks stated honestly?
- Would both leadership and operators know what to do next from this output?
