---
name: wireframe-specialist
description: Create low-fidelity and mid-fidelity wireframes, wireflows, screen inventories, and annotated UX blueprints for apps, dashboards, journeys, and product concepts. Use when the main task is clarifying layout, information hierarchy, task flow, state coverage, or requirement gaps before polished UI design or engineering. Do not use for final visual design, usability evidence gathering, or frontend implementation.
---

# wireframe-specialist

Make structure testable before polish gets expensive.

This skill owns early interface thinking: what screens exist, what belongs on them, what the user does next, how states branch, and where requirements are still missing. Use it when the team needs to reduce ambiguity fast without pretending the visual layer is decided.

## Scope

Use this skill for:
- low-fi and mid-fi screen structure
- wireflows for multi-step tasks and branching journeys
- dashboard and product-surface layout exploration
- state inventories for empty, loading, success, error, and permission cases
- requirement clarification through annotated interface blueprints
- comparing structural options before committing to high-fidelity design
- handoff artifacts that give product, design, and engineering a shared skeleton

## Do not use this skill for

Do not use this skill for:
- polished visual treatment, styling, or brand expression; use **ui-designer** or **web-designer**
- user-research synthesis or usability validation as the primary task; use **ux-researcher** or **user-researcher**
- frontend implementation in code; use **frontend-dev** or **mobile-dev**
- strategy work with no interface, flow, or screen artifact
- detailed interaction microbehavior when the main problem is motion or behavior polish; use **interaction-designer**

## Routing rules

Route to **wireframe-specialist** when the main difficulty is deciding:
- what screens or steps are required
- how content and controls should be grouped before styling
- how a task branches across states, permissions, or edge cases
- what information must appear where for the flow to make sense
- which of several structural concepts is strongest

Do **not** route here just because the request mentions a page or feature.
If the key question is visual polish, research evidence, or implementation details, another skill should lead.

## Inputs to gather

Before wireframing, identify:
- user type and job to be done
- start point, end point, and success condition
- required screens, touchpoints, or channels
- critical content, data, and controls
- states: empty, loading, success, error, no-results, permissions, edge cases
- device, viewport, and platform constraints
- fidelity target: rough concept, reviewable mid-fi, or annotated handoff
- unresolved product questions that the wireframe should expose

If the user goal is fuzzy, say so. A wireframe cannot rescue an undefined job.

## Output expectations

Return outputs such as:
- screen inventory or step map
- wireflow with transitions, branches, and decision points
- screen-by-screen low-fi or mid-fi descriptions
- annotated hierarchy and region breakdown
- state inventory with triggers
- alternative-structure comparison with recommendation
- explicit open questions, assumptions, and missing requirements

Prefer buildable structure over decorative narration.

## Working method

### 1. Start with the user task
State:
- who the user is
- what they are trying to accomplish
- what information or confidence they need at each step
- where they might branch, stall, fail, or need recovery

Wireframes that start from rectangles instead of tasks usually hide the real problem.

### 2. Pick the lowest fidelity that answers the question
Use:
- **low-fi** for concept exploration and fast alignment
- **mid-fi** for denser structure and handoff clarity
- **wireflow** when sequence and branching matter more than any one screen

Do not drift into visual-spec theater if the structure is still unsettled.

### 3. Make screen purpose explicit
For every key screen or step, define:
- purpose
- primary action
- secondary actions
- must-see content
- deferred or optional content
- navigation or orientation cues

A screen without a clear job is probably two screens jammed together.

### 4. Show states and branches, not just the happy path
Cover where relevant:
- first-use empty states
- loading and processing states
- validation and error recovery
- no-access or no-results conditions
- success confirmation and next-step momentum
- branching based on permissions, plan level, or prior choices

Use annotation to expose requirements the product spec missed.

### 5. Keep annotations high-signal
Annotate:
- interaction behavior that is not visually obvious
- validation logic
- dependencies on data, permissions, or integrations
- mobile adaptations and responsive compression
- open questions that block confidence

Do not annotate the obvious. Annotate the risky.

### 6. End with a recommendation
If multiple structures are possible, say:
- which option wins
- what tradeoff it makes
- what should be tested next
- what downstream designers or engineers must preserve

## Heuristics

Prefer:
- one clear primary action per major screen
- obvious progression through a task
- deliberate grouping and hierarchy
- visible branching and recovery paths
- annotations that surface hidden requirements
- artifacts that unblock design and build work immediately

Avoid:
- polished-looking fake certainty
- screens packed with equal-priority content
- state-free happy-path sketches
- wireframes that merely restate the spec
- high-fi component language before structural decisions are settled

## Adjacent skill boundaries

- **ui-designer** owns polished visual hierarchy and final screen treatment
- **web-designer** owns page-level visual composition and conversion-oriented web presentation
- **interaction-designer** owns detailed behavior logic and interaction choreography
- **ux-researcher** and **user-researcher** validate whether users can understand and complete the flow
- **frontend-dev** and **mobile-dev** implement the approved structure in code

## Quick routing examples

Use **wireframe-specialist** for:
- mapping a new onboarding journey before visual design starts
- deciding whether a data-heavy workflow needs tabs, steps, or progressive disclosure
- producing annotated wireflows for an approvals or checkout process
- surfacing missing states in a dashboard or settings area before implementation

Do **not** use **wireframe-specialist** for:
- final UI polish, typography, or spacing decisions; use **ui-designer**
- testing whether the prototype is understandable; use **ux-researcher**
- coding the interface; use **frontend-dev** or **mobile-dev**

## Quality bar

A strong result should:
- make the task flow and screen roles obvious
- reveal requirement gaps early
- cover critical states and branches
- stay appropriately low fidelity for the question
- give downstream design and engineering a clean structural starting point

## Use with

- `prompt.md` for execution posture and response shape
- `examples/README.md` for representative requests and output patterns
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
