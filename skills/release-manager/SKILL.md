---
name: release-manager
description: Plan and coordinate software, content, operations, or multi-team launches with clear scope, sequencing, readiness checks, communication, rollback paths, and post-release verification. Use when a launch needs go/no-go criteria, dependency tracking, release notes, deployment windows, support prep, staged rollout, or post-launch follow-through.
---

# Release Manager

Run launches like controlled operations: clear scope, explicit owners, reversible steps, and verified outcomes.

## Core principles

- Scope the release tightly before coordinating it.
- Turn hidden dependencies into named checklist items.
- Make ownership explicit for every critical step.
- Treat rollback, support readiness, and verification as first-class release work.
- Prefer boring, observable rollout paths over clever but fragile ones.

## Workflow

1. Define the release.
   - version, milestone, launch type, target date or window, owner, and success criteria
2. Lock scope.
   - what is in, what is out, what is conditional, and what change freeze applies
3. Map dependencies.
   - code, data migrations, infrastructure, content, approvals, feature flags, vendors, support, analytics, and legal or compliance checks
4. Build the runbook.
   - preflight checks, exact execution sequence, rollback path, communications, and monitoring plan
5. Run readiness review.
   - resolve blockers, confirm owners, and state go/no-go criteria explicitly
6. Execute the release.
   - follow the sequence, record outcomes, and escalate deviations fast
7. Verify and close.
   - confirm expected behavior, capture incidents, assign follow-ups, and publish release notes or launch recap

## Release lenses

### Scope and packaging

Clarify whether the release is:
- product or software deployment
- content or campaign launch
- operational rollout
- internal-only release
- phased or region-based launch

State the user-visible impact, not just internal activity.

### Dependency control

Check for:
- environment readiness
- migrations and backfills
- schema compatibility
- third-party or vendor dependencies
- feature-flag sequencing
- customer support readiness
- docs, training, and analytics instrumentation
- approval gates and blackout windows

### Rollout safety

Specify:
- deployment order
- canary or staged rollout logic
- kill switch or rollback trigger
- rollback owner
- data restore constraints if rollback is not symmetric
- communications for degraded or delayed launch scenarios

### Verification

Verification should answer:
- What must be true for this release to count as successful?
- What dashboards, logs, or checks prove it?
- Who is monitoring, for how long, and with what thresholds?

## Output expectations

A strong release plan usually includes:

1. Release summary
2. Scope and exclusions
3. Dependencies and risks
4. Preflight checklist
5. Launch sequence with owners and timing
6. Communication plan
7. Verification and monitoring plan
8. Rollback or contingency plan
9. Follow-up actions

## Common failure modes

Watch for:
- scope creep after coordination has started
- release notes that list tickets instead of user impact
- migrations without rollback thinking
- unowned monitoring or support handoff
- ambiguous go/no-go logic
- different teams assuming another team owns the final call

## Boundaries

Do not treat release management as deep implementation debugging.
Do not promise zero-risk launches.
Do not recommend launch timing without acknowledging operational constraints and support coverage.

## Definition of done

A strong output lets another operator run the launch calmly, understand the critical path, know when to stop, and verify whether the release actually succeeded.
