---
name: healthcheck
description: Audit host, service, runtime, network, dependency, and environment health to produce a fast operational readout, risk scan, or remediation plan. Use when diagnosing service failures, startup problems, degraded performance, dependency breakage, configuration drift, capacity pressure, missing observability, exposure risk, or general requests to assess whether a system is healthy enough to operate. Do not use for feature implementation, pure compliance paperwork, or architecture strategy that is not grounded in current system evidence.
---

# Healthcheck

Use this skill for evidence-first operational diagnosis.

A useful healthcheck does not just say healthy or unhealthy. It identifies scope, collects live evidence, separates symptoms from causes, and leaves the operator with a prioritized fix-and-verify plan.

## Gather the minimum context first

Identify:
- system in scope: host, VM, container, service, app, network path, or full stack
- environment and criticality: prod, staging, dev; customer-facing or internal; uptime sensitivity
- reported symptom or decision needed: diagnose outage, assess risk, verify deployment health, review hardening, or spot bottlenecks
- recent changes: deploys, config edits, dependency updates, infra events, cert renewals, incidents
- evidence available: service status, logs, metrics, traces, dashboards, config, health endpoints, backup state
- resource posture: CPU, memory, disk, file descriptors, network, queue depth, latency, error rate, saturation
- protection posture: auth exposure, secrets handling, TLS, firewalling, backups, restore confidence, observability coverage
- constraints: maintenance windows, rollback options, access limits, and blast radius concerns

If evidence is missing, say the conclusion is provisional and name what would resolve it.

## Core workflow

1. **Define the scope and health question**
   - Decide whether the user needs incident diagnosis, readiness review, hardening scan, or routine operational check.
   - Judge health at the relevant layer instead of making vague whole-system claims.
2. **Collect live evidence by layer**
   - Check infrastructure, platform, application, dependencies, and user-facing behavior.
   - Prefer observed state over remembered architecture.
3. **Separate symptoms from causes**
   - Map the failure chain: trigger, propagation path, user impact, and why safeguards did or did not catch it.
   - Name confidence level where multiple root causes remain plausible.
4. **Score health by component**
   - For each component, state status, evidence, impact, urgency, and next action.
   - Use service-centric indicators like latency, traffic/load, errors, and saturation when relevant.
5. **Recommend fixes in the right order**
   - Stabilize first, then remediate root cause, verify recovery, and finally harden to prevent repeat incidents.
   - Prefer reversible, low-blast-radius steps when the system is live.

## What good output looks like

Return practical deliverables such as:
- incident triage summary with likely root cause
- environment health review
- service-by-service risk scan
- deployment-readiness assessment
- host hardening checklist
- prioritized remediation and verification plan

## Heuristics

Prefer:
- evidence-backed findings
- component-by-component status
- explicit user impact and blast radius
- verification steps for every material fix
- honest uncertainty when telemetry is incomplete

Avoid:
- declaring overall health with no layer-by-layer evidence
- confusing noisy symptoms with root cause
- recommending risky changes before stabilization
- ignoring backups, restore confidence, or observability gaps
- generic “looks fine” language that leaves operators guessing

## Boundary calls

Use adjacent skills instead when needed:
- **incident-responder** for active incident coordination, comms, and time-critical ownership management
- **security-auditor** when the main job is deep security assessment rather than operational health
- **site-reliability** for long-horizon reliability engineering and SLO/system design work
- **devops-engineer** for implementing pipelines, infra changes, or platform automation after diagnosis

## Final check

Before finishing, verify:
- health is assessed by component and layer, not as a vague overall opinion
- every important claim has evidence or a clearly labeled inference
- impact, urgency, and next steps are prioritized sensibly
- root cause is distinguished from symptoms and unknowns
- fixes include verification and hardening follow-through

Use `prompt.md` for response structure, `examples/README.md` for output shapes, `guides/qa-checklist.md` for final review, and `meta/skill.json` for boundaries and metadata.
