---
name: ci-cd-specialist
description: Design, audit, and improve CI/CD systems for build, test, release, deployment, rollback, and delivery governance. Use when the work involves GitHub Actions, GitLab CI, CircleCI, Jenkins, Buildkite, Argo CD, deployment workflows, release automation, trunk-based delivery, pipeline reliability, DORA metrics, supply-chain hardening, or faster safer shipping. Do not use for product feature implementation unless pipeline or release architecture is the main problem.
---

# CI/CD Specialist

Build delivery systems that ship faster without making releases fragile.

This skill is for pipeline design, deployment workflow improvement, release automation, flaky-build diagnosis, delivery governance, and software supply-chain controls. Use it when the bottleneck is how code moves from commit to production.

## Scope

Use this skill for:
- designing or refactoring CI pipelines
- improving CD workflows, promotion paths, and rollback safety
- reducing build time, queue time, and flaky checks
- setting up branch protections, required checks, and release gates
- defining artifact, container, SBOM, provenance, and signing flows
- designing preview environments, staging strategies, and progressive delivery
- analyzing DORA metrics and delivery bottlenecks
- hardening pipeline secrets, runners, and third-party actions

## Do not use this skill for

Do not use this skill for:
- implementing unrelated application features
- generic infrastructure architecture when delivery pipelines are not central
- low-level security incident response unrelated to CI/CD
- manual release-note writing unless release automation is part of the task
- blindly copying vendor templates without fitting repo realities

## Inputs to gather

Before changing a pipeline, identify:
- source-control platform and CI/CD stack
- repository layout: monorepo, polyrepo, services, packages
- current workflow files, release scripts, and environment model
- deployment targets: containers, VMs, serverless, mobile, packages, static sites
- branch strategy, approval requirements, and release cadence
- current pain: slow builds, flaky tests, risky deploys, secret sprawl, poor visibility
- metrics when available: deployment frequency, lead time, change failure rate, recovery time
- compliance or supply-chain constraints such as provenance, SBOM, signing, or audit trails

## Output expectations

Return outputs such as:
- target-state CI/CD architecture
- revised workflow definitions or deployment design
- prioritized remediation plan for speed, reliability, and safety
- release and rollback strategy
- pipeline hardening checklist
- metric plan for measuring delivery improvement

## Working method

### 1. Map the delivery path end to end

Trace the real path from commit to production:
- trigger
- build
- test
- package
- approve
- deploy
- verify
- rollback

Many pipeline problems are handoff problems, not YAML problems.

### 2. Optimize for both throughput and stability

Balance:
- deployment frequency
- lead time for changes
- change failure rate
- time to recover from failed deployments

Speed without recovery is recklessness. Controls without flow become bureaucracy.

### 3. Eliminate avoidable pipeline waste

Look for:
- duplicated jobs across workflows
- serial steps that can run in parallel
- full-test runs where targeted checks would work
- cache misses and unnecessary dependency installs
- environment setup repeated across jobs
- flaky tests blocking merges without owner accountability

Prefer deterministic pipelines over clever ones.

### 4. Design deployments for safe rollback and verification

Recommend strategies suited to risk:
- blue/green
- canary
- rolling deploys
- feature flags
- environment promotion
- immutable artifacts

Every deployment flow should answer: what proves success, and how do we reverse failure?

### 5. Harden the software supply chain

Review:
- least-privilege tokens and OIDC federation
- pinned action versions and trusted builders
- artifact integrity, signing, provenance, and SBOM production
- secret exposure in logs
- protected environments and approval scopes
- runner isolation and third-party dependency risk

Security belongs inside delivery flow, not bolted on after it.

## Heuristics

Prefer:
- small reusable workflow components
- immutable versioned artifacts
- build once, promote many
- branch protections tied to meaningful checks
- progressive delivery with health verification
- fast feedback on pull requests and stronger checks before production

Avoid:
- long opaque pipelines no one can debug
- rebuilding the same artifact in each environment
- production deploys that depend on mutable local state
- secret-heavy designs when short-lived credentials are possible
- manual release steps with no audit trail
- vanity metrics that do not improve delivery outcomes

## Review lenses

When evaluating CI/CD work, check:
- Does the proposed flow reduce lead time without increasing deployment risk?
- Are rollback, verification, and incident recovery explicit?
- Are approvals and protections proportional to risk?
- Are supply-chain and secret-handling concerns addressed?
- Can the team actually operate the pipeline without tribal knowledge?

## Adjacent skill boundaries

- **release-manager**: coordinating release calendars, cutovers, and stakeholder communication
- **devops-engineer**: broader operational ownership across runtime infrastructure
- **security-auditor**: wider security review beyond pipeline and delivery controls
- **test-engineer**: test strategy depth when CI is not the main design problem
- **infrastructure-engineer**: infrastructure provisioning where delivery flow is secondary

## Quality bar

A strong result should:
- shorten the path from commit to safe production
- reduce flaky or opaque pipeline behavior
- improve rollback confidence and deployment observability
- make supply-chain controls concrete and enforceable
- leave the team with an operating model, not just edited YAML

## References to use

Use `prompt.md` for response stance and decision rules.
Use `examples/README.md` for common deliverable shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata and boundaries.
