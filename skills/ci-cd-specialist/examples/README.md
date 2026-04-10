# CI/CD Specialist — Example Output Shapes

Use these as patterns for strong CI/CD deliverables.

## Example 1 — Pipeline audit

**Input:**
Our GitHub Actions workflows are slow, flaky, and everyone is scared to deploy on Fridays.

**Good output shape:**
- current-state workflow map
- major bottlenecks and failure modes
- quick wins versus structural fixes
- deployment-risk analysis
- rollout order with success metrics

## Example 2 — New deployment architecture

**Input:**
Design a safer CD flow for our Kubernetes services with staging and production.

**Good output shape:**
- assumptions and constraints
- target-state deployment flow
- artifact, promotion, and approval model
- verification and rollback design
- tool or workflow recommendations by layer

## Example 3 — Supply-chain hardening

**Input:**
Harden our pipelines after a security review flagged secrets and unpinned actions.

**Good output shape:**
- current exposure summary
- prioritized hardening actions
- credential and trust-boundary redesign
- provenance, signing, and SBOM recommendations
- residual risks and operational caveats

## Example 4 — Build-speed improvement

**Input:**
Cut our PR feedback time from 25 minutes to under 10 without dropping coverage.

**Good output shape:**
- timing breakdown by stage
- causes of wasted time
- caching, parallelism, and test-selection recommendations
- tradeoffs and validation plan
- metrics to verify sustained improvement

## Example 5 — Release governance

**Input:**
We need a release process for multiple teams without turning every deploy into ceremony.

**Good output shape:**
- release-risk segmentation
- required versus optional controls
- environment and approval policy
- exception handling and rollback rules
- ownership model for operating the system
