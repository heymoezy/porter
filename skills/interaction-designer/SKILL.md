---
name: interaction-designer
description: Design user flows, interaction rules, state models, and recovery behavior for digital products. Use when work involves onboarding, navigation, forms, multi-step tasks, approvals, settings, empty/loading/error states, permission friction, or translating product requirements into implementable interaction behavior. Do not use for styling-only visual design, brand direction, UX copy as a standalone task, or frontend implementation after the interaction model is already settled.
---

# Interaction Designer

Design how users understand the system, decide what to do next, and recover when things go wrong.

## Core outcomes
- Turn vague product requirements into explicit flow logic.
- Reduce user confusion, hesitation, and accidental misuse.
- Specify states and transitions so engineering does not have to guess behavior.
- Balance speed, clarity, accessibility, and error recovery.

## Use this skill for
- onboarding, activation, and first-value journeys
- navigation models, information scent, and wayfinding
- forms, validation behavior, save states, confirmations, and undo paths
- async flows: uploads, imports, approvals, retries, background jobs, handoffs
- interaction logic for permissions, roles, destructive actions, and status changes
- state design for loading, empty, partial, success, failure, offline, and blocked conditions
- converting product goals into implementation-ready flows, rules, and edge-case behavior

## Do not use this skill for
- visual polish decisions that do not change behavior
- brand, illustration, or marketing presentation work
- frontend build execution once the behavior spec is already clear
- user research synthesis unless the main need is interaction redesign from those findings

## Inputs to gather
- user goal, business goal, and success metric
- actors, permissions, environments, and device/platform constraints
- current flow, screens, prototype, or requirements if they exist
- data dependencies, latency expectations, and integration constraints
- failure modes, irreversible actions, compliance constraints, and accessibility needs
- known drop-off points, support tickets, or usability evidence

## Deliverables
Choose the lightest artifact that removes ambiguity.

### Common outputs
- flow map with primary, alternate, and failure paths
- step-by-step interaction spec with state transitions and decision rules
- component behavior notes for forms, tables, filters, modals, toasts, navigation, and bulk actions
- state inventory covering empty, loading, success, warning, error, offline, expired, and permission-denied cases
- risk memo calling out confusion points, dead ends, recovery gaps, and unresolved decisions

## Working method
1. Define the job to be done, the high-stakes moments, and the minimum successful outcome.
2. Map the current or proposed journey end to end, including branch points and dependency waits.
3. Simplify the path before optimizing it: remove unnecessary choices, steps, and memory burden.
4. Specify every meaningful state, trigger, and transition, especially validation, errors, retries, and cancellations.
5. Stress-test the design for accessibility, keyboard flow, focus order, mobile constraints, and interruption recovery.
6. Deliver a behavior spec that product, design, and engineering can implement without inventing missing rules.

## Decision heuristics
- Prefer recognition over recall: show context, defaults, examples, recent choices, and previews.
- Prefer progressive disclosure over dumping all options at once.
- Make status visible: saving, syncing, processing, blocked, failed, completed.
- Prevent destructive mistakes with context, timing, reversibility, and scoped confirmations.
- If an action takes time, show what is happening, what the user can do meanwhile, and what happens next.
- If users can get stuck, specify the escape hatch.
- If different roles see different behavior, make the rule explicit.

## State coverage minimum
For any meaningful flow, check whether these states need explicit treatment:
- initial / precondition not met
- loading / fetching / syncing
- empty / no results / first-use
- partial success / degraded mode
- validation error / system error / timeout
- permission denied / expired session / conflict
- success / completion / post-completion next step
- retry / undo / cancel / resume later

## Boundaries and escalation
- If the real problem is poor information architecture, route toward IA or product design work, not just interaction patching.
- If evidence is weak, label assumptions and offer testable options rather than pretending certainty.
- If regulation, safety, or irreversible financial/legal consequences are involved, raise the risk bar and design for explicit acknowledgment, traceability, and review.

## Final check
Before finishing, review `guides/qa-checklist.md`, align with `prompt.md`, and ensure the deliverable would clearly match the requests in `examples/README.md`.
