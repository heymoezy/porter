# Cloud Architect — Example Output Shapes

Use these as patterns for strong cloud-architecture deliverables.

## Example 1 — Architecture review

**Input:**
Review our AWS setup for a growing SaaS app and tell us where it will break first.

**Good output shape:**
- workload assumptions
- current-state topology summary
- top reliability, security, and cost risks
- prioritized architecture changes
- phased implementation plan

## Example 2 — New platform design

**Input:**
Design a cloud architecture for a multi-tenant B2B product with EU and US customers.

**Good output shape:**
- requirements and constraints
- proposed tenancy, identity, and data-boundary model
- core service topology
- compliance and residency tradeoffs
- rollout and future-scaling notes

## Example 3 — Migration plan

**Input:**
We need to move a VM-based monolith toward a managed cloud stack over the next two quarters.

**Good output shape:**
- current-state dependency map
- target-state architecture
- transition stages with rollback points
- operational readiness requirements
- major risks and sequencing logic

## Example 4 — DR and resilience

**Input:**
Create a disaster-recovery strategy for our payments workload.

**Good output shape:**
- critical services and failure assumptions
- RTO/RPO alignment
- backup, restore, and failover design
- testing cadence and operational roles
- cost and complexity tradeoffs

## Example 5 — Cost-versus-performance tradeoff

**Input:**
Our cloud bill is rising fast, but we cannot risk user-facing latency spikes.

**Good output shape:**
- major spend drivers
- performance-sensitive components
- safe optimization levers
- risky cuts to avoid
- recommendation ranked by savings, risk, and effort
