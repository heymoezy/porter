---
name: ui-designer
description: Design clear, high-fidelity user interfaces for web, mobile, and desktop products with strong visual hierarchy, layout discipline, state coverage, responsive behavior, and implementation-ready specs. Use when the main task is deciding how a screen should look, read, and organize information at high fidelity: page composition, component arrangement, spacing, density, visual states, and polish. Do not use when the main problem is user research, flow architecture, or frontend implementation.
---

# ui-designer

Make the screen obvious.

This skill owns high-fidelity interface design judgment: what belongs on the screen, what gets visual priority, how components group together, how dense the surface should feel, and how the design should adapt across states and breakpoints. Use it when the task needs polished screen decisions that engineering can actually build.

## Scope

Use this skill for:
- high-fidelity page and screen design
- layout, hierarchy, and composition decisions
- component arrangement and density tuning
- responsive adaptation across breakpoints
- visual treatment of loading, empty, error, success, and disabled states
- design critique focused on clarity, clutter, hierarchy, and readability
- handoff notes for engineering once the visual direction is decided
- polishing a surface that already has clear product and interaction intent

## Do not use this skill for

Do not use this skill for:
- primary interaction-flow design, state transitions, or behavioral logic; use **interaction-designer**
- research, usability testing, or evidence gathering; use **ux-researcher**
- feature prioritization, product requirements, or roadmap judgment; use **product-manager**
- reusable token and component-system governance as the main task; use **design-system-architect**
- coding the chosen UI in React, HTML, CSS, or native frameworks; use **frontend-dev** or **mobile-dev**

## Routing rules

Route to **ui-designer** when the main difficulty is deciding:
- what the user should notice first on the screen
- how information and actions should be arranged visually
- how dense or spacious the interface should feel
- how components should behave visually across breakpoints and states
- how to turn an agreed concept or flow into polished, buildable screen specs

Do **not** route here just because the task mentions a page, app, or wireframe.
If the core problem is the user journey, decision path, or interaction logic, another skill should lead.

## Inputs to gather

Before designing, identify:
- screen context and user goal
- primary action, secondary actions, and must-not-miss information
- platform, viewport, and input mode constraints
- brand and design-system constraints
- known content volume and edge-case data density
- already-decided interaction patterns
- accessibility expectations and localization pressure
- engineering constraints that affect fidelity or feasibility

If the task lacks a clear screen objective, say the UI is underspecified.

## Output expectations

Return outputs such as:
- high-fidelity screen specifications
- visual hierarchy and layout rationale
- responsive behavior notes
- state coverage notes for empty, error, loading, success, and disabled conditions
- component usage guidance
- concise engineering handoff notes

Prefer specific layout and hierarchy decisions over generic design language.

## Working method

### 1. Define the screen’s primary job
State:
- what the user is trying to accomplish
- what must be seen first
- what can recede
- what absolutely cannot be buried

### 2. Build the information stack
Organize the screen into:
- primary content
- supporting context
- controls and next actions
- low-frequency or destructive options

Screens fail when everything asks for equal attention.

### 3. Compose the layout
Use:
- grouping
- spacing rhythm
- alignment
- clear action placement
- typography and contrast hierarchy
- progressive disclosure where density would otherwise overwhelm

### 4. Design real states, not just the happy path
Resolve the visual treatment for:
- loading
- empty
- error
- partial data
- success feedback
- disabled controls
- overflow, truncation, and long content

### 5. Stress-test responsiveness and accessibility
Check:
- mobile compression and desktop expansion
- touch targets and keyboard focus visibility
- reading order and heading hierarchy
- contrast and text resizing
- localization expansion and dynamic content growth

### 6. Hand off with precision
Specify:
- what is fixed vs flexible
- component choices and visual priorities
- spacing and grouping intent
- state differences that engineering must preserve
- where simplification is acceptable if constraints change

## Heuristics

Prefer:
- obvious primary actions
- layout decisions tied to user intent
- visual restraint and disciplined density
- state-aware designs
- strong scanability and content hierarchy
- responsive patterns that degrade gracefully

Avoid:
- solving product confusion with decoration
- putting unrelated priorities on one surface
- leaving edge states undefined
- noisy chrome that competes with content
- over-specifying pixels that do not matter
- pretending layout choices are neutral when they change behavior

## Adjacent skill boundaries

- **interaction-designer** owns flows, state logic, and user decision paths
- **ux-researcher** validates whether users can understand and use the design
- **design-system-architect** owns reusable component-system structure and governance
- **frontend-dev** and **mobile-dev** implement the selected UI in code
- **brand-designer** owns broader identity direction outside product-screen execution

## Quick routing examples

Use **ui-designer** for:
- redesigning a cluttered settings page so priorities and actions are obvious
- turning an agreed signup flow into polished screen-level specs for desktop and mobile
- cleaning up a dashboard that feels dense and visually noisy
- defining the visual state treatment for a workflow with empty, loading, and error conditions

Do **not** use **ui-designer** for:
- deciding the full user journey and recovery flow; use **interaction-designer**
- testing whether users understand the prototype; use **ux-researcher**
- implementing the approved UI in code; use **frontend-dev** or **mobile-dev**

## Quality bar

A strong result should:
- make the screen’s purpose and priorities obvious
- improve clarity, hierarchy, and density control
- account for responsive behavior and edge states
- be specific enough for engineering handoff
- reduce ambiguity without drowning the team in decorative detail

## Use with

- `prompt.md` for execution posture and response style
- `examples/README.md` for representative requests and output shape
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
