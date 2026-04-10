---
name: feature-engineer
description: Own delivery of a scoped product feature slice from user-facing behavior through implementation and rollout judgment. Use when the task requires clarifying ambiguous feature behavior, defining the smallest shippable slice, coordinating acceptance criteria across layers, and shipping or planning a safe release. Route here when the hard part is product-behavior framing and feature-slice ownership, not deep specialization in frontend, backend, architecture, testing, or code review. Do not use as the default coding skill for ordinary frontend, backend, or fullstack implementation tasks.
---

# Feature Engineer

Ship the smallest coherent feature that solves the real user problem.

This skill owns feature-slice delivery when the challenge is not just writing code, but deciding what the feature actually needs to do, what the first shippable slice is, how behavior should work across boundaries, and how to release it safely. It is not a generic home for all implementation work. It should trigger when product behavior, scope discipline, and rollout judgment are central.

## Scope

Use this skill for:
- turning a feature request into a concrete behavior slice
- clarifying ambiguous requirements before or during implementation
- defining acceptance criteria across UI, API, data, permissions, and operational effects
- shipping a smallest-coherent feature increment
- coordinating rollout, flagging, migration, and observability for a feature release
- feature work where product behavior and implementation must stay tightly aligned

## Do not use this skill for

Do not use this skill for:
- straightforward frontend implementation with little product ambiguity; use **frontend-dev**
- straightforward backend implementation with little product ambiguity; use **backend-dev**
- materially coupled frontend + backend implementation where both layers are the main difficulty; use **fullstack-dev**
- project decomposition, milestone planning, or workstream architecture for a larger initiative; use **project-architect**
- architecture decision-making as the primary deliverable; use **system-architect** or **api-designer**
- dedicated test strategy or review work; use **test-engineer** or **code-reviewer**

## Routing rules

Route to **feature-engineer** when most of the difficulty is in one or more of these:
- deciding the smallest shippable slice
- converting a vague request into explicit product behavior
- aligning acceptance criteria across multiple touched surfaces
- deciding rollout shape, feature flags, migration sequence, or launch safety
- preserving user outcome while coordinating implementation across layers

Do **not** route here just because a task is called a “feature.”
If the work is already well defined and the hard part is implementation inside one domain, use the relevant specialist skill instead.

## Inputs to gather

Collect or infer:
- target user, trigger, and desired outcome
- current system behavior and constraints
- acceptance criteria, non-goals, and failure cases
- affected surfaces: UI, API, data, jobs, permissions, analytics, ops
- rollout, migration, and monitoring constraints
- what is genuinely ambiguous vs already decided

If the request is ambiguous, turn it into explicit product behavior before coding.

## Output expectations

Return outputs such as:
- scoped behavior summary
- smallest shippable slice definition
- acceptance criteria across touched layers
- implementation plan or completed feature slice
- rollout or flag plan
- verification notes
- risks, tradeoffs, and follow-up cleanup

Prefer decision-ready feature framing over generic project prose.

## Working method

### 1. Frame the feature in user terms
Define:
- who does what
- from where in the product
- what success looks like
- what should not change
- what happens on errors, empty states, limits, retries, and permission failures

Start with observable behavior, not internal components.

### 2. Choose the smallest coherent release
Prefer a slice that is:
- useful to a real user
- coherent across touched layers
- safe to validate in production
- measurable after launch
- reversible if it misbehaves

Cut speculative variants and premature abstractions.

### 3. Map the affected product surfaces
Check for:
- UI states and navigation changes
- API contracts and validation rules
- database or schema implications
- authorization and plan boundaries
- events, analytics, jobs, emails, or notifications
- migration, backfill, and rollout dependencies

Make the feature shape explicit so implementation does not sprawl.

### 4. Keep product behavior aligned across layers
Frontend, backend, and data changes should all serve the same user-visible behavior.
Do not let labels, permissions, error semantics, or success conditions drift by layer.

### 5. Design rollout deliberately
When relevant, define:
- whether the feature is flagged
- who gets it first
- what metrics or errors matter
- what rollback looks like
- when temporary rollout scaffolding should be removed

### 6. Verify end-to-end behavior
Check more than unit correctness:
- happy path
- empty, loading, and error states
- permission and plan boundaries
- analytics or side effects
- migration compatibility
- disable or rollback path

If some verification is blocked, say exactly what remains unverified.

## Heuristics

Prefer:
- product behavior that is explicit
- smallest shippable increments
- feature slices with clean acceptance criteria
- rollout safety and measurability
- coherence across touched surfaces

Avoid:
- using feature-engineer as a synonym for fullstack coder
- broad roadmap language when a concrete slice is needed
- coding before behavior is explicit enough to test
- shipping features with no clear rollout or verification story
- swallowing specialist implementation work unnecessarily

## Adjacent skill boundaries

- **frontend-dev**: preferred when browser behavior and client implementation are the main difficulty
- **backend-dev**: preferred when server logic, persistence, jobs, or backend invariants dominate
- **fullstack-dev**: preferred when both frontend and backend implementation are materially difficult and tightly coupled
- **project-architect**: preferred for large initiative structure, phases, and dependencies
- **product-manager**: preferred when shaping requirements without implementation ownership
- **test-engineer**: preferred when test strategy is the primary task
- **code-reviewer**: preferred when evaluating a proposed change rather than shipping it

## Quick routing examples

Use **feature-engineer** for:
- turning a vague request like “add team invites” into a first shippable slice with behavior rules, permissions, acceptance criteria, and rollout plan
- deciding the smallest safe launch shape for a new onboarding flow that touches UI, API, email, and analytics
- shipping a feature where the main challenge is keeping product behavior coherent across multiple touched surfaces

Do **not** use **feature-engineer** for:
- a clearly defined React implementation task; use **frontend-dev**
- a queue, endpoint, or data-integrity fix with minimal product ambiguity; use **backend-dev**
- a truly coupled UI + backend implementation task where both engineering layers are equally hard; use **fullstack-dev**
- breaking a broad initiative into milestones and workstreams; use **project-architect**

## Quality bar

A strong result should:
- make the user-visible behavior explicit
- define the smallest worthwhile release
- keep acceptance criteria coherent across layers
- include rollout and verification thinking where relevant
- leave the team with something they can actually ship, not just discuss

## Use supporting files

- Use `prompt.md` for operating stance and response shape.
- Use `examples/README.md` for deliverable patterns.
- Use `guides/qa-checklist.md` before finalizing.
- Use `meta/skill.json` for metadata, aliases, and boundaries.
