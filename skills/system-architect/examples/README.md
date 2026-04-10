# Examples — System Architect

## Representative requests
- Design the architecture for a multi-tenant AI routing platform with metering, retries, gateway health checks, and failover.
- Decide whether a growing SaaS should stay a modular monolith or split billing and event ingestion into separate services.
- Propose a migration from synchronous order processing to an event-driven workflow with reconciliation and replay.
- Redesign a reporting platform so heavy analytics workloads stop degrading the transactional product.
- Define data ownership and integration boundaries between auth, billing, usage metering, and CRM systems.

## Strong output shape
- State goals, constraints, and assumptions first.
- Compare a small set of viable architecture options.
- Recommend one shape with clear rationale and tradeoffs.
- Spell out ownership boundaries, data flows, failure handling, and migration stages.
- Leave the team with decisions they can implement, test, and review.

## Weak output shape
- Buzzword-heavy advice with no workload assumptions.
- Boxes-and-arrows language that never defines source of truth or contracts.
- “Use microservices” or “use events” without operational consequences.
- Architecture recommendations that ignore migration cost and team maturity.
