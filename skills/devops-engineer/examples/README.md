# DevOps Engineer — Example Output Shapes

Use these shapes to keep recommendations concrete.

## Example 1 — Flaky pipeline redesign

**Input:**
Our pipeline is slow, flaky, and deployments are still partly manual.

**Good output shape:**
- current path to production
- main failure points and bottlenecks
- target stages: build, test, artifact, deploy, verify
- automation changes
- rollback and smoke-test design
- rollout phases and owners

## Example 2 — Deployment strategy choice

**Input:**
Should this service use rolling, blue/green, or canary deploys?

**Good output shape:**
- service risk profile and traffic shape
- dependency and state considerations
- chosen strategy with rationale
- metrics and abort conditions
- rollback / roll-forward plan

## Example 3 — Environment drift cleanup

**Input:**
Staging and production behave differently and nobody trusts either.

**Good output shape:**
- drift sources
- source-of-truth proposal for config
- secret-management implications
- parity and verification plan
- migration sequence

## Example 4 — Release readiness checklist

**Input:**
What should our team validate before every production release?

**Good output shape:**
- pre-deploy checks
- deploy-time checks
- post-deploy validation window
- rollback triggers
- metrics/logs to watch
- owner assignments
