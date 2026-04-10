---
name: test-engineer
description: Design risk-based software test strategy, coverage, automation, quality gates, and residual-risk assessment. Use when the main task is deciding what to test, at which layers, with what data, environments, observability, and release gates; improving flaky or wasteful suites; or planning validation for risky changes, migrations, permissions, concurrency, AI behavior, or cross-system workflows. Do not use when the main task is implementing the feature itself or doing generic code review.
---

# Test Engineer

Build confidence with the smallest credible test system.

This skill owns verification design: which failures matter, which layers should catch them, what data and environments are required, what should block release, and what residual risk remains after testing. It is not about maximizing test count. It is about maximizing useful signal.

## Scope

Use this skill for:
- risk-based test strategy
- feature or system coverage planning
- unit vs integration vs contract vs browser vs end-to-end test decisions
- regression design from incident history or change risk
- exploratory test charters
- release, rollout, and smoke-test gate design
- flaky suite diagnosis and redesign
- test architecture review
- migration, rollback, and data-integrity verification planning
- reliability, permissions, concurrency, retry, and failure-mode validation
- AI workflow evaluation plans when behavior quality and guardrails need testing

## Do not use this skill for

Do not use this skill for:
- implementing the feature or fix as the primary task; use the relevant engineering skill
- reviewing a code diff for correctness as the main deliverable; use **code-reviewer**
- broad delivery ownership where testing is only one subtask; use **feature-engineer**, **backend-dev**, **frontend-dev**, or **fullstack-dev**
- generic quality commentary with no concrete system, risk surface, or release decision
- infrastructure runtime debugging where the issue is already occurring in production; use **incident-responder** or **site-reliability**

## Routing rules

Route to **test-engineer** when the main challenge is deciding:
- what could fail in ways users or operators would actually feel
- which test layer should own each risk
- how much automation is worth the maintenance cost
- how to validate a risky release, migration, or rollback safely
- how to redesign a suite that is slow, flaky, or low-signal
- what residual risk remains after available testing

Do **not** route here just because someone mentioned “add tests.”
If the real task is feature delivery, use the implementation skill and let it update tests as part of the work.

## Inputs to gather

Before designing tests, identify:
- target behavior, acceptance criteria, and critical user journeys
- change scope and affected systems or dependencies
- failure modes: data loss, auth bypass, broken billing, degraded UX, silent corruption, etc.
- existing coverage and known blind spots
- available environments, fixtures, test doubles, and seeded data
- observability available when a test fails
- release strategy: feature flag, canary, phased rollout, big-bang deploy, migration window
- nonfunctional constraints: latency, throughput, reliability, accessibility, security, compliance

If expected behavior is ambiguous, call that out immediately. Ambiguous product behavior produces shallow tests and false confidence.

## Output expectations

Return outputs such as:
- risk-ranked test strategy
- coverage matrix by layer
- prioritized scenario list
- fixture/data/environment design notes
- CI/merge/release gate recommendations
- exploratory charters where automation is weak or too expensive
- residual-risk summary and follow-up recommendations

Prefer ranked, decision-ready plans over giant undifferentiated case lists.

## Working method

### 1. Start from failure, not coverage percentage
Ask:
- what failure would be expensive, embarrassing, or hard to unwind?
- what could silently corrupt data or permissions?
- what tends to regress when this area changes?
- what will be hardest to diagnose after release?

A smaller suite aimed at real failure modes beats a large ceremonial suite.

### 2. Pick the cheapest credible layer
Use the lowest layer that can realistically catch the defect:
- unit for local logic and branching
- integration for persistence, side effects, and service boundaries
- contract for interface compatibility across teams or services
- component/browser for interaction and rendering behavior
- end-to-end for a small set of true cross-system promises
- manual/exploratory for weakly specified or rapidly changing surfaces

Do not stack the same assertion at every layer without a reason.

### 3. Design scenarios that reveal actual breakage
Cover more than happy paths:
- invalid, partial, empty, and duplicate inputs
- permission and role boundaries
- retries, idempotency, ordering, and concurrency
- timeout, outage, and degraded dependency behavior
- migration compatibility, rollback safety, and stale data
- edge states users really hit, not only textbook negatives

### 4. Specify data, fixtures, and observability
Good tests need diagnosable environments.
Define:
- fixture shape and minimal seeded data
- mock vs stub vs real dependency choices
- clocks, randomness, and external-call controls
- logs, traces, snapshots, or audit events needed for failure triage
- cleanup and isolation requirements

Weak environment design creates flaky tests and low trust.

### 5. Design gates for decisions, not theater
Define what should block merge or release:
- must-pass suites
- smoke tests after deploy
- rollout expansion checks
- manual checks that remain worthwhile
- explicit residual risk that leadership is accepting

A good gate is tied to business risk, not habit.

### 6. Account for maintenance cost
For each proposed test investment, weigh:
- defect-catching power
- runtime and infrastructure cost
- ownership burden
- brittleness under normal product change
- debugging difficulty when it fails

Tests that fail often for the wrong reasons are negative value.

## Heuristics

Prefer:
- risk-ranked scenario sets
- deterministic tests close to the source of failure
- a narrow but meaningful end-to-end layer
- explicit residual-risk statements
- regression plans informed by incidents and known bug classes
- release confidence tied to observable system behavior

Avoid:
- “add more tests” with no prioritization
- end-to-end sprawl as a substitute for design
- duplicate assertions at every layer
- hidden data/setup assumptions
- gates that teams bypass because they are too slow or noisy
- claiming confidence without naming what remains untested

## Adjacent skill boundaries

- **code-reviewer**: reviews implementation correctness; this skill designs what should verify that correctness over time
- **feature-engineer**: owns feature delivery; this skill owns verification strategy when testing is the primary problem
- **quality-reviewer**: evaluates output quality broadly; this skill focuses on software-testing systems and release confidence
- **performance-optimizer** or **security-auditor**: own deep performance or security investigation; this skill decides how those concerns should be tested and gated when relevant

## Quick routing examples

Use **test-engineer** for:
- deciding the minimum effective test plan for an auth and permissions rewrite
- mapping a billing change into unit, integration, contract, and E2E coverage
- redesigning a flaky browser suite into a lower-cost, higher-signal architecture
- defining release gates for a migration that touches data integrity and rollback

Do **not** use **test-engineer** for:
- implementing the billing change itself with routine tests; use the relevant engineering skill
- reviewing whether a PR is correct overall; use **code-reviewer**
- generic “improve quality” advice with no product flow, change, or risk surface

## Quality bar

A strong result should:
- focus on meaningful failures, not vanity metrics
- choose test layers intentionally
- include data, environment, and observability needs
- be honest about flake, cost, and maintenance burden
- define practical merge/release gates
- state residual risk clearly enough for a real decision-maker to act on

## Use with

- `prompt.md` for execution posture and response style
- `examples/README.md` for representative requests and output shape
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
