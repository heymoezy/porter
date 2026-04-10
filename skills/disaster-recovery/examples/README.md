# Disaster Recovery — Example Output Shapes

Use these as patterns for recovery-planning deliverables.

## Example 1 — SaaS recovery posture review

**Input:**
Audit our B2B SaaS platform for disaster recovery gaps.

**Good output shape:**
- business-critical workflows and service tiers
- target vs current RTO/RPO by system
- current recovery posture:
  - backups and retention
  - restore evidence
  - failover and rebuild path
  - hidden dependencies
- top recovery blockers
- prioritized remediation plan with owners

## Example 2 — Database corruption runbook

**Input:**
Create a disaster recovery runbook for production database corruption.

**Good output shape:**
- trigger conditions and severity threshold
- decision owner and war-room roles
- containment steps to stop further corruption
- restore / failover decision tree
- ordered recovery steps
- integrity validation and acceptance criteria
- stakeholder communications
- return-to-normal and follow-up tasks

## Example 3 — Regional outage strategy

**Input:**
Help us plan for a full cloud-region outage.

**Good output shape:**
- critical services affected
- regional dependencies and cross-region blockers
- recovery mode by service:
  - fail over
  - rebuild elsewhere
  - degrade gracefully
- expected recovery times and assumptions
- tooling, access, and data replication gaps
- drill plan to validate readiness

## Example 4 — Leadership RTO/RPO decision memo

**Input:**
We need recommended recovery targets for leadership approval.

**Good output shape:**
- business process mapping
- proposed service tiers
- recommended RTO/RPO per tier with rationale
- cost / complexity implications of meeting each target
- current feasibility gap
- decisions leadership must make

## Example 5 — Quarterly exercise plan

**Input:**
What disaster recovery tests should we run this quarter?

**Good output shape:**
- exercise objectives
- scenarios to test
- participants and owners
- success criteria and timing measurements
- evidence to capture
- after-action update plan
