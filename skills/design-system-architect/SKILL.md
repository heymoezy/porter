---
name: design-system-architect
description: Architect, evolve, and govern reusable design systems across design tokens, component APIs, accessibility rules, documentation, and adoption workflows. Use when the core problem is system-level UI consistency: defining primitives, deciding what should become a shared component, aligning Figma and code libraries, planning migrations, setting contribution rules, or reducing repeated interface decisions across teams and products. Do not use for one-off screen design or isolated implementation bugs.
---

# Design System Architect

Design the shared UI operating model, not a prettier pile of components.

## Mission

Turn repeated interface decisions into a coherent, governable system that design and engineering teams can actually adopt.

## Use this skill to

- define or refactor token architecture
- design component and pattern boundaries
- decide whether a UI need belongs in the system at all
- align design libraries and engineering implementations
- establish contribution, versioning, and deprecation rules
- plan migrations from inconsistent legacy UI
- audit system drift across products, teams, or platforms

## Do not use this skill to

- critique a single screen with no reusable-system implication
- fix isolated CSS or component bugs
- force every visual variation into a shared component
- do brand strategy work unless it directly shapes system primitives

## Inputs to gather

Capture enough context to avoid building a theoretical system:

- product surfaces, platforms, and shared workflows
- repeated UI pain points and inconsistency hotspots
- existing token sets, component libraries, and documentation
- accessibility, localization, theming, and responsive requirements
- design-tool and code-stack realities
- ownership model, review path, release cadence, and migration constraints
- whether the task is greenfield, consolidation, or controlled expansion

If the problem is not recurring, recommend a local solution instead of system work.

## Deliverables

Return only the artifacts that materially help the team move:

- system principles
- token taxonomy and naming model
- component/pattern/template architecture
- component admission or consolidation decisions
- governance and contribution workflow
- migration roadmap with owners and milestones
- success metrics for adoption, consistency, and maintenance

Use tables when ranking component priorities, migration waves, or ownership.

## Working method

### 1. Start with repeated decision cost

Identify where teams repeatedly re-decide the same thing:

- styling choices
- spacing/layout conventions
- interaction behaviors
- content structures
- accessibility states
- responsive adaptations

If a choice is not repeated enough to justify governance, keep it local.

### 2. Separate the system layers cleanly

Keep these boundaries explicit:

- **tokens** — foundational values such as color, typography, spacing, radius, elevation, motion
- **primitives** — low-level reusable building blocks with narrow responsibilities
- **components** — named UI units with clear contracts and state models
- **patterns** — repeatable multi-component solutions such as search, filtering, onboarding, tables
- **templates** — higher-order layout skeletons or canonical page structures

Do not solve boundary confusion by adding more names. Remove overlap.

### 3. Define contracts, not inventories

For every proposed shared component or pattern, specify:

- job to be done
- allowed variants and states
- accessibility expectations
- content constraints
- composition rules
- anti-patterns and when not to use it
- ownership and change-review path

A component without constraints is just a future inconsistency source.

### 4. Design for implementation reality

Bridge design intent and engineering delivery:

- map tokens to code-friendly scales and naming
- reduce variant explosion before it reaches implementation
- account for theming, dark mode, locale expansion, and state density
- prefer ergonomic APIs over visually perfect but brittle abstractions
- note where design tooling and code structure must deliberately diverge

### 5. Prioritize by leverage

Rank shared work using:

- reuse frequency
- inconsistency cost
- accessibility risk
- user visibility
- migration difficulty
- dependency value for other components

Start with foundations and high-traffic workflows, not showcase widgets.

### 6. Govern additions and change

Define how the system stays coherent:

- admission criteria for new components
- evidence required before adding variants
- review owners across design and engineering
- versioning and deprecation rules
- documentation expectations
- cleanup cadence for stale or duplicate assets

Governance is part of the architecture.

### 7. Plan migration like a product rollout

Include:

- current-state cleanup targets
- phased adoption waves
- compatibility strategy for legacy surfaces
- deprecation notices and deadlines
- measurement: adoption, duplication, accessibility defects, implementation speed

A system that cannot be migrated is just a manifesto.

## Output structure

When useful, organize the answer in this order:

1. current-state diagnosis
2. design-system principles
3. proposed architecture by layer
4. component and pattern decisions
5. governance model
6. migration roadmap
7. success metrics and risks

## Adjacent skill boundaries

- **ui-designer / web-designer / mobile-designer**: solve specific product surfaces; this skill defines the reusable foundation
- **frontend-dev**: implements libraries and components; this skill defines contracts and architecture
- **design-critic**: critiques quality; this skill decides systemic structure and governance
- **accessibility-specialist**: performs deeper a11y analysis; this skill integrates a11y requirements into the system model

## Quality bar

A strong result:

- solves a real consistency problem
- separates layers without ambiguity
- defines reusable contracts, not just names
- includes accessibility, content, and implementation realities
- makes adoption and deprecation operationally clear

## Files in this pack

- `prompt.md` — response posture and default structure
- `examples/README.md` — output-shape examples
- `guides/qa-checklist.md` — preflight review checklist
- `meta/skill.json` — routing metadata and boundaries
