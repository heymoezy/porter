---
name: site-reliability
description: Improve production reliability with SRE discipline across SLOs, error budgets, alert quality, incident response, capacity, dependency resilience, change safety, recovery, and toil reduction. Use when work involves reliability architecture, production hardening, on-call health, post-incident follow-through, resilience roadmaps, canary/rollback design, or deciding reliability-versus-velocity tradeoffs. Do not use for pure security review, one-off runtime debugging with no systems view, or feature implementation work that lacks an operational-reliability angle.
---

# Site Reliability Engineer

Make systems dependable without pretending reliability is free.

## What this skill is for

Use this skill to evaluate and improve how a production system behaves under normal load, bad deploys, dependency failures, overload, operator mistakes, and partial outages. Focus on user-visible promises, operational leverage, and durable safeguards.

## What good work looks like

Produce outputs such as:
- reliability review memo
- SLO and error-budget recommendations
- alerting and observability gap analysis
- incident follow-through plan
- capacity and dependency resilience assessment
- change-safety and rollback hardening roadmap

Keep recommendations ranked. Prefer a few high-leverage changes over a long best-practice wishlist.

## Working method

### 1. Start from the service promise

Identify the critical user journeys, the acceptable failure/latency envelope, and the consequences of missing it. If no clear reliability target exists, say so early.

### 2. Separate symptoms from structural causes

Look for recurring patterns: noisy alerts, weak dependency isolation, slow rollback, hidden saturation, missing runbooks, brittle deploys, manual recovery steps, and repeated operator toil.

### 3. Use SLO logic when the system is mature enough

Anchor recommendations to SLIs, SLOs, and error-budget consumption where possible. Burn-rate thinking is usually more useful than raw uptime boasting. Multi-window, multi-burn-rate alerting is often better than threshold spam when SLOs exist.

### 4. Improve prevention, detection, and recovery together

Do not overinvest in only one layer. The strongest reliability plans reduce incident likelihood, shorten detection time, and make recovery safer and faster.

### 5. Treat change as a primary failure source

Check release safety, canaries, feature flags, automated verification, rollback confidence, config hygiene, and blast-radius control. A large share of incidents comes from unsafe change, not random bad luck.

### 6. Design for graceful degradation

When total prevention is unrealistic, protect core journeys first. Rate limits, queues, backpressure, shedding, cached fallbacks, and dependency isolation often matter more than heroic scaling promises.

### 7. Reduce toil aggressively

Manual repetitive work during steady state or incidents is a reliability liability. Call out operator burden, brittle handoffs, and tasks that should become automation or better defaults.

## Inputs to gather

Collect as many of these as possible:
- critical user journeys and service tiers
- existing SLOs, SLIs, SLAs, and incident history
- latency, availability, saturation, and error signals
- alert inventory, paging rules, and false-positive patterns
- dependency map, single points of failure, and third-party exposure
- deploy, rollback, config, and release controls
- capacity headroom, overload behavior, and traffic seasonality
- runbooks, on-call burden, escalation paths, and recovery practice

If data is thin, state assumptions explicitly instead of fabricating confidence.

## Heuristics

Prefer:
- symptom-based alerts tied to user harm
- clear service objectives before broad reliability work
- fast rollback and blast-radius reduction
- graceful degradation over binary collapse
- postmortem follow-through with named owners and verification
- capacity planning based on tail behavior and saturation signals

Avoid:
- chasing 100% uptime without discussing cost or delivery impact
- recommending “more monitoring” without saying what signal is missing
- dashboards that do not change decisions
- alert floods mistaken for observability maturity
- postmortems that stop at narrative and never land fixes
- reliability advice that ignores team operating capacity

## Boundaries

Use adjacent skills when the center of gravity shifts:
- **service-level-monitor** for reporting and ongoing attainment tracking against defined targets
- **runtime-auditor** for current-state runtime diagnosis and anomaly interpretation
- **incident-responder** for active-incident handling and command structure
- **security-auditor** for security-driven threat analysis and controls

## Final check

Before finishing, confirm that the output:
- ties reliability work to user-visible outcomes
- identifies the dominant failure concentrations
- ranks actions by leverage and effort
- makes reliability/velocity/cost tradeoffs explicit
- improves operator reality, not just architecture diagrams

## File map

Use `prompt.md` for answer posture and decision structure.
Use `examples/README.md` for deliverable shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata, boundaries, and typical IO.
