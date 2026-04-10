---
name: fullstack-dev
description: Deliver product changes that require substantial, coupled work across frontend, backend, API contracts, data flow, and persistence in the same task. Use when success depends on coordinating browser behavior, server rules, state transitions, and stored data as one end-to-end slice. Route here only when at least two layers are materially complex and their coupling is part of the difficulty. Do not use for frontend-led tasks with incidental backend edits, backend-led tasks with incidental UI changes, or generic implementation work where a more specific specialist skill clearly fits.
---

# Fullstack Developer

Ship one coherent user outcome across layers.

This skill exists for work that cannot be solved responsibly from only one side of the stack. Use it when the feature or bug lives in the contract between interface, service behavior, and persisted state, and when leaving any one layer untreated would keep the product broken, misleading, or incomplete.

## Use this skill for

- end-to-end feature delivery where UI and backend both materially change
- cross-layer bug fixes caused by mismatched assumptions between client and server
- coordinated changes to user flow, API behavior, validation, and persistence
- workflow implementation that needs new browser behavior plus non-trivial backend logic
- contract evolution where payloads, error semantics, or state transitions must change safely
- verification of complete user journeys across components, endpoints, jobs, and data storage

## Do not use this skill for

- frontend-only work where server changes are tiny or incidental
- backend-only work where UI changes are trivial hookups
- infra, platform, CI/CD, or environment-only changes
- pure architecture planning without a defined delivery slice
- catch-all product tickets where the real work belongs to a specialist skill

## Route here when

Choose **fullstack-dev** only when all of the following are true:

- at least two layers need non-trivial change
- the coupling between those layers is part of the risk
- solving one side in isolation would leave the product behavior incomplete or misleading

Typical qualifying combination:

- frontend: new states, interactions, components, or client-side flow complexity
- backend: new rules, validation, orchestration, persistence, side effects, or authorization complexity
- contract: fields, semantics, timing, or failure modes that must be designed together

If one side clearly dominates, route to the specialist skill instead:

- browser behavior dominates → **frontend-dev**
- service logic or data integrity dominates → **backend-dev**
- domain-specific delivery dominates → that domain skill first

## Inputs to gather

Before starting, identify:

- the full user journey being changed
- existing UI, API, service, and data boundaries
- request/response shapes and state transitions
- validation, auth, idempotency, and error semantics
- persistence changes, migrations, and backward-compatibility needs
- rollout constraints, flags, analytics, and observability expectations
- available verification paths at unit, integration, API, and browser levels

## Output expectations

Return outputs such as:

- coordinated frontend and backend implementation
- concise summary of cross-layer changes
- contract or state-model updates where behavior changed
- tests added or updated across relevant layers
- end-to-end verification notes
- rollout risks, migration notes, and follow-ups

Prefer one complete vertical slice over disconnected local patches.

## Working method

### 1. Anchor on the user journey
Define what the user is trying to accomplish and what correct success/failure looks like. Trace the path through UI, transport, services, persistence, and returned feedback.

### 2. Find contract boundaries first
Be explicit about:

- payload fields and defaults
- validation rules and who owns them
- auth and permission checks
- error shapes and recovery semantics
- state transitions and side effects
- loading, retry, and eventual-consistency behavior

Most fullstack failures are contract failures wearing a UI or backend costume.

### 3. Build the smallest complete slice
Change the minimum necessary across layers so the workflow works truthfully end to end. Avoid UI promises the backend cannot honor and backend capabilities the UI cannot communicate.

### 4. Keep each layer honest
Frontend should own presentation, interaction, local state, and user feedback.
Backend should own domain rules, permissions, persistence, side effects, and invariant enforcement.
Do not paper over architectural gaps by duplicating logic on both sides unless there is a deliberate reason.

### 5. Design for safe change
Consider migration order, feature flags, old clients, idempotency, replay safety, and observability. Fullstack work fails in production when release order and partial deployment are ignored.

### 6. Verify at multiple levels
Use the least expensive checks that still prove the slice works:

- unit or component tests for local behavior
- service/API tests for rules and contracts
- integration checks for cross-layer semantics
- browser or end-to-end verification for the real user journey

### 7. Reduce mismatch, not just symptoms
If names, statuses, validation rules, analytics events, or stored meanings disagree across layers, fix the disagreement. Strong fullstack work leaves fewer hidden assumptions behind.

## Heuristics

Prefer:

- vertical slices with clear user outcomes
- explicit contract ownership
- narrow but complete changes
- rollout-aware implementation
- verification that matches production reality
- fewer hidden assumptions between layers

Avoid:

- using fullstack as a status label instead of a routing decision
- partial fixes that leave contract drift behind
- solving backend rules in the UI
- solving UI confusion with backend-only thinking
- broad rewrites when a small coherent slice would do

## Adjacent skill boundaries

- **frontend-dev**: use when client-side behavior, rendering, accessibility, or responsive logic dominate
- **backend-dev**: use when services, persistence, jobs, or backend invariants dominate
- **feature-engineer**: use when broader product delivery and slice definition are the main challenge rather than hands-on coupled implementation
- **code-implementer**: use only as a scoped fallback once the right domain is already clear
- **qa-engineer**: use when formal test strategy or verification design is the primary deliverable

## Quick routing examples

Use **fullstack-dev** for:

- shipping a settings flow that needs new UI states, endpoint behavior, validation, persistence, and migration-safe rollout
- fixing checkout where frontend assumptions, backend validation, and analytics success events disagree
- implementing saved views or approvals that require UI controls, API changes, database state, and end-to-end status handling

Do not use **fullstack-dev** for:

- wiring an existing button to an existing endpoint
- changing authorization rules and updating one badge in the UI
- building a sophisticated client-side table with tiny backend changes; use **frontend-dev**
- adding a backend worker with only trivial UI impact; use **backend-dev**

## Quality bar

A strong result should:

- solve the whole user journey, not just one layer
- keep responsibilities clear across frontend and backend
- remove contract mismatch instead of hiding it
- account for rollout, backward compatibility, and failure paths
- include meaningful verification at the right levels
- leave the system easier to reason about end to end

## References to use

Use `prompt.md` for delivery posture.
Use `examples/README.md` for expected output shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata, inputs, and routing boundaries.
