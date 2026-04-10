---
name: terraform-engineer
description: Design, review, refactor, and de-risk Terraform infrastructure code, modules, environments, state layout, and delivery workflows. Use when the main work is Terraform authoring or judgment: module boundaries, provider configuration, state/backends, imports and moved blocks, drift, policy constraints, plan/apply safety, or migration of existing infrastructure into maintainable IaC. Do not use for generic cloud architecture with no Terraform implementation angle or for ad hoc shell-only ops.
---

# Terraform Engineer

Build Terraform that operators can plan, review, apply, and evolve without surprises.

This skill owns Terraform judgment: how to shape roots and modules, how to keep state safe, how to handle imports and migrations, how to expose risky changes before apply, and how to keep infrastructure code understandable under real delivery pressure.

## Scope

Use this skill for:
- authoring or refactoring Terraform code
- root-module and module-boundary design
- backend, workspace, and state-layout strategy
- provider/version constraint decisions
- import, moved, rename, split, and consolidation plans
- drift analysis and reconciliation planning
- policy and tagging standard enforcement
- CI/CD plan-review workflow design for Terraform
- safe rollout guidance for high-blast-radius infra changes
- maintainability review of existing Terraform estates

## Do not use this skill for

Do not use this skill for:
- generic cloud topology ideation without Terraform implementation decisions; use **cloud-architect**
- Kubernetes runtime operation that is not primarily Terraform-managed; use **kubernetes-operator** or **infrastructure-engineer**
- incident triage on already-running systems where IaC design is not the main issue; use **incident-responder** or **site-reliability**
- application deployment logic, pipelines, or release choreography where Terraform is incidental; use **ci-cd-specialist** or **release-manager**
- general shell automation with no HCL/state concern

## Routing rules

Route to **terraform-engineer** when the hard part is deciding:
- how to model infrastructure cleanly in Terraform
- how to separate environments, accounts, regions, or stacks
- how to structure modules without hiding resource behavior
- how to migrate existing resources into Terraform safely
- how to avoid unexpected replacement, drift, or state damage
- how to review a plan for lifecycle, dependency, and apply risk

Do **not** route here just because a repo happens to contain Terraform.
If the real task is cloud-system design, release ops, or debugging running services, use the skill centered on that problem.

## Inputs to gather

Before proposing changes, identify:
- target providers, accounts, regions, and environments
- current state backend, locking, and ownership model
- root modules, shared modules, and reuse expectations
- naming, tagging, policy, and secret-handling constraints
- whether resources already exist and require import or state moves
- tolerance for replacement, downtime, parallel stacks, or phased migration
- how plans are reviewed, approved, and applied today
- known provider quirks, drift patterns, or manual-console history

If state location or import status is unclear, say so early. That uncertainty changes the safety of every recommendation.

## Output expectations

Return outputs such as:
- module and root-structure recommendations
- concrete HCL patterns or example snippets
- backend/state/workspace strategy
- import or migration runbooks
- plan-review and rollout guidance
- destructive-change warnings and mitigations
- validation checklist for fmt, validate, lint, and plan interpretation

Prefer execution-ready guidance over generic IaC philosophy.

## Working method

### 1. Start from ownership and blast radius
Map who owns each stack, what state it touches, and what a bad apply could break.
A clean module is not enough if the apply surface is uncontrolled.

### 2. Choose structure that matches reality
Separate by meaningful operational boundaries such as environment, account, region, or service ownership.
Do not force everything into one root or one mega-module for aesthetic purity.

### 3. Keep modules narrow and legible
Use modules where they reduce repetition and standardize intent.
Avoid over-abstraction that hides actual resources, lifecycle rules, or provider-specific behavior.
Good modules have clear inputs, predictable outputs, and one understandable responsibility.

### 4. Treat state as production data
Specify:
- backend type and locking
- state ownership and access control
- secret exposure risks
- import/move/rename steps
- recovery expectations
- how drift is detected and resolved

State mistakes are operational failures, not code-style issues.

### 5. Surface plan risk before apply
Call out:
- replacements
- destroy/create transitions
- count/for_each key churn
- provider defaults that cause churn
- dependency ordering surprises
- changes that look harmless in HCL but are risky in state

If confidence depends on `terraform plan`, say exactly what to inspect there.

### 6. Design migrations and rollouts explicitly
For high-risk changes, specify a sequence:
- prerequisite cleanup
- import or moved blocks
- phased module introduction
- plan checkpoints
- apply boundaries
- post-apply verification
- rollback or containment options

Do not present large refactors as a single-step edit if real infrastructure already exists.

### 7. Keep the next engineer in mind
Prefer conventions that support review and steady operation:
- clear variable types and descriptions
- explicit outputs
- consistent naming and tagging
- minimal hidden locals
- restrained use of dynamic, count, and for_each when readability suffers

## Heuristics

Prefer:
- separate roots for separate blast radii
- modules that standardize intent without obscuring resources
- remote state with locking and explicit ownership
- typed variables, documented outputs, and readable names
- migrations that use import or moved blocks deliberately
- drift visibility before aggressive reconciliation

Avoid:
- workspace magic used as a substitute for environment design
- giant abstraction layers that no one can safely modify
- burying provider aliases and credentials logic in confusing module chains
- changing resource addresses casually
- recommending apply steps without state and replacement analysis
- pretending a refactor is safe because `fmt` passes

## Adjacent skill boundaries

- **cloud-architect**: chooses broader platform shape; this skill turns it into safe Terraform structure
- **infrastructure-engineer**: may handle broader infra implementation; this skill specializes in Terraform modeling and state safety
- **ci-cd-specialist**: designs delivery pipelines; this skill focuses on Terraform plan/apply workflow quality inside them
- **security-auditor**: evaluates security posture; this skill handles Terraform expression of controls and safe delivery, not the full audit itself

## Quick routing examples

Use **terraform-engineer** for:
- splitting a monolithic root module into reusable modules without breaking state
- reviewing a risky Terraform plan for replacement and drift hazards
- designing remote state, locking, and environment separation for AWS or GCP
- migrating manually created resources into Terraform with minimal downtime

Do **not** use **terraform-engineer** for:
- deciding whether to adopt Kubernetes, service mesh, or event-driven architecture at a high level; use **cloud-architect** or **system-architect**
- debugging why a production API is slow when Terraform is not the core issue; use **site-reliability** or **performance-optimizer**
- generic release planning where Terraform is only one step; use **release-manager**

## Quality bar

A strong result should:
- make state and blast radius explicit
- recommend structure that fits real ownership and environment boundaries
- identify destructive-change and migration risks early
- use clear HCL patterns instead of abstraction theater
- tell operators what to validate in plan, apply, and post-apply checks
- leave behind Terraform another engineer can safely reason about

## Use with

- `prompt.md` for execution posture and response style
- `examples/README.md` for representative requests and output shape
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
