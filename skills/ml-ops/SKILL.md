---
name: ml-ops
description: Operationalize the machine-learning lifecycle so models are reproducible, releasable, observable, and governable. Use when work involves training pipelines, artifact and feature versioning, model registries, CI/CD/CT, environment promotion, serving release controls, drift and performance monitoring, retraining policy, lineage, rollback, or MLOps maturity planning. Do not use for standalone model design when lifecycle automation and operational controls are not the core challenge.
---

# MLOps Engineer

Make ML dependable after the notebook ends.

## What this skill owns

Use this skill to:
- assess current MLOps maturity and operating gaps
- design training, validation, packaging, registry, and deployment workflows
- define lineage across code, data, features, models, and environments
- specify promotion gates, approvals, canaries, shadow runs, and rollback logic
- design monitoring for serving health, data quality, drift, calibration, and delayed outcomes
- define retraining, deprecation, governance, and incident-response policy

## What this skill does not own

Do not use this skill for:
- choosing model features or architecture as the primary task; use `ml-engineer`
- generic DevOps with no model lifecycle component
- one-off manual deployments presented as a durable operating model
- pure model evaluation with no release, lineage, or operational design

## Inputs to gather

Collect:
- current workflow from experiment to production
- how code, data, features, configs, and models are versioned today
- training orchestration, artifact store, registry, and serving stack
- environment separation and approval requirements
- monitoring, alerting, and on-call ownership
- compliance, audit, privacy, and reproducibility constraints
- retraining cadence, trigger logic, and label availability timing

## Output expectations

Return one or more of:
- MLOps maturity assessment
- training-to-serving workflow map
- environment and promotion policy
- validation-gate matrix
- monitoring and alert design
- retraining and governance plan
- phased implementation roadmap

Use tables for artifact flow, ownership, release gates, and alerts.

## Working method

### 1. Diagnose maturity before prescribing tooling

A practical maturity lens:
- **manual**: notebooks, scripts, and hand-carried artifacts
- **pipeline-driven**: repeatable training and packaging with partial controls
- **fully operationalized**: CI/CD/CT, registries, monitored promotion, reproducible rollback

Do not prescribe a high-ceremony platform a small team cannot run.

### 2. Make lineage and reproducibility explicit

Track and recover at minimum:
- source code commit
- training data snapshot, slice, or lineage reference
- feature definitions and transformations
- model artifact and metadata
- hyperparameters and config
- runtime environment and dependencies

If production artifacts cannot be recreated, the system is not under control.

### 3. Separate validation gates by failure type

Define gates for:
- code quality and security
- data quality and schema compatibility
- feature validation and freshness
- model performance against relevant baselines
- bias, safety, or policy review where needed
- serving smoke tests and rollback readiness

Every gate needs an owner, threshold, and action on failure.

### 4. Design promotion like any other risky release

Specify:
- dev, staging, prod, or equivalent environments
- registry states and approval transitions
- canary, shadow, blue-green, or champion-challenger patterns
- rollback triggers and who can execute them
- manual approval points for high-risk or regulated models

Model release policy should match business risk, not team optimism.

### 5. Monitor system health and model health separately

Track at least:
- latency, throughput, error rate, saturation
- feature missingness, freshness, and schema breaks
- prediction distribution shifts
- drift, calibration, and downstream quality when labels arrive
- business KPI degradation tied to model decisions

A healthy endpoint can still be a failing model.

### 6. Treat retraining as a controlled change, not a reflex

Define:
- retraining triggers: schedule, drift, performance decay, policy change, or data refresh
- dataset approval logic
- validation expectations before promotion
- retirement criteria for stale models
- incident and postmortem ownership

Automatic retraining without release controls is just automated risk.

## Adjacent skill boundaries

- **ml-engineer**: designs the predictive system and model behavior; this skill operationalizes lifecycle control
- **site-reliability**: owns runtime reliability disciplines; this skill ensures ML services expose the right release and model-health signals
- **data-engineer**: builds data infrastructure; this skill defines ML-specific lineage and validation needs
- **security-auditor** or **privacy-specialist**: go deeper on controls; this skill integrates those controls into the ML operating model

## Quality bar

A strong result should:
- match the proposed operating model to team maturity
- make lineage, reproducibility, and ownership explicit
- define release gates, approval points, and rollback paths
- monitor both technical serving health and model behavior
- explain how retraining and governance work without hand-waving

## Files in this pack

- `prompt.md` — response posture and structure
- `examples/README.md` — representative request and output patterns
- `guides/qa-checklist.md` — final quality gate
- `meta/skill.json` — aliases, boundaries, and metadata
