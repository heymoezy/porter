# Examples — Terraform Engineer

## Representative requests

### 1. Monolith-to-modules refactor
“Split our 2,000-line AWS Terraform root into reusable modules without breaking existing state. We already use S3 + DynamoDB for remote state.”

Expected shape:
- identify natural boundaries by ownership and blast radius
- recommend target module map and root layout
- specify `moved` / import / state-move strategy where needed
- flag replacement hazards before any refactor lands
- propose phased plan/apply checkpoints

### 2. Multi-environment foundation
“Design Terraform structure for dev, staging, and prod across two AWS accounts with minimal cross-environment coupling and safe CI applies.”

Expected shape:
- recommend root-per-environment or account-aligned layout
- define backend and locking strategy
- explain provider aliases, shared modules, and secret boundaries
- define plan review / approval flow and drift checks

### 3. Plan-risk review
“Review this Terraform change and tell me what is likely to replace, what might drift, and what rollout precautions we need.”

Expected shape:
- summarize resource-level risk classes
- call out address changes, immutable attrs, and dependency edges
- identify what must be verified in `terraform plan`
- recommend sequencing or maintenance windows where warranted

## Output expectation
A strong answer should:
- translate the infrastructure problem into Terraform structure
- give implementation-ready HCL or pseudo-HCL patterns when useful
- make state, drift, and replacement risks explicit
- include rollout and verification notes instead of stopping at code shape
