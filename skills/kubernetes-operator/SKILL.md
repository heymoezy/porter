---
name: kubernetes-operator
description: Operate, debug, harden, and scale Kubernetes-based systems with production discipline. Use when the task involves Kubernetes manifests, Helm values, deployments, rollout or rollback planning, probes, requests and limits, autoscaling, scheduling, ingress or service networking, config and secret handling, cluster policy, workload debugging, or reliability improvement for workloads already running on Kubernetes. Do not use for generic Linux administration, broad cloud architecture without cluster-level decisions, or application-code implementation as the primary task.
---

# Kubernetes Operator

Keep Kubernetes systems boring in production: predictable rollouts, clear failure signals, sane resource behavior, and secure defaults.

## Focus
This skill is for **cluster and workload operations**: manifests, workload runtime behavior, rollout safety, traffic routing, scheduling, scaling, policy, and observability.

Use adjacent skills instead when the main need is:
- **infrastructure-engineer**: broader platform or topology design outside Kubernetes runtime operation
- **devops-engineer**: CI/CD pipeline design and delivery automation as the primary task
- **backend-dev / feature-engineer**: fixing application logic rather than Kubernetes behavior
- **security-auditor**: organization-wide security review beyond cluster and workload controls

## Gather first
- Cluster, namespace, environment, tenancy model, and deployment path
- Workload type: stateless app, stateful service, job, cronjob, operator, ingress-backed service
- Source-of-truth artifacts: manifests, Helm chart, Kustomize overlays, policy definitions, recent diffs
- Runtime symptoms: CrashLoopBackOff, pending pods, OOMKills, slow rollouts, probe failures, node pressure, DNS or ingress issues
- Dependencies: databases, queues, storage classes, service mesh, cert management, external APIs
- SLOs, traffic patterns, burst profile, disruption tolerance, maintenance windows
- Platform constraints: RBAC, Pod Security, admission policies, quota, network policy, image policy, multi-region requirements

## Deliverables
Provide some combination of:
- Workload diagnosis with likely root causes and confidence
- Manifest or values changes with rationale
- Rollout, rollback, and verification plan
- Resource, probe, scaling, disruption-budget, and scheduling recommendations
- Networking / ingress / service exposure guidance
- Risk summary covering availability, security, cost, and operability
- Runbook notes for future operators

## Working method
1. Define the operational job: deploy, stabilize, recover, harden, scale, or tune.
2. Trace the request through the real Kubernetes control points: image, config, scheduling, startup, readiness, traffic, dependencies, and observability.
3. Prefer source-of-truth fixes over live-cluster drift.
4. Check whether probes, requests, limits, disruption handling, and autoscaling work together rather than in isolation.
5. Separate application faults from Kubernetes faults before prescribing cluster changes.
6. Make rollout safety explicit: surge/unavailable settings, drain behavior, restart impact, rollback triggers, and verification steps.
7. End with the smallest credible change set that improves reliability without hiding risk.

## Operating rules
- Green pods do not prove healthy service behavior; verify readiness, traffic, and dependency health.
- Requests and limits are capacity decisions, not copy-paste defaults.
- Liveness, readiness, and startup probes must reflect actual recovery behavior or they become outage multipliers.
- PodDisruptionBudgets reduce voluntary disruption risk but do not guarantee availability during node failure or bad rollout design.
- Security baseline matters in-cluster too: least-privilege RBAC, scoped secrets, non-root execution, and controlled network paths.
- Autoscaling without observability and sane requests often amplifies instability.
- Never normalize manual kubectl surgery when declarative repair is available.

## Common intervention areas
### Rollout and recovery
Check:
- deployment strategy and revision history
- readiness before traffic cutover
- rollback trigger and operator ownership
- drain / eviction behavior for maintenance events

### Resource behavior
Check:
- requests versus observed baseline and burst
- limits versus throttling / OOM risk
- quota interactions
- node fit, affinity, taints, topology spread, and bin-packing side effects

### Traffic and connectivity
Check:
- service selectors and endpoints
- ingress / gateway routing and TLS
- DNS assumptions
- network policy, mesh policy, and cross-namespace access paths

### Runtime hardening
Check:
- secret and config rotation path
- security context and pod security posture
- persistent storage assumptions
- alerting, metrics, logs, and event visibility

## Quality bar
A strong deliverable makes it obvious:
1. What is failing and why
2. Which Kubernetes primitive actually needs to change
3. How the change will be rolled out and reversed safely
4. What evidence will confirm improvement
5. Which residual risks remain and who owns them

## Final check
Before finishing, read `guides/qa-checklist.md`, align the response structure with `prompt.md`, and sanity-check the deliverable against `examples/README.md`.
