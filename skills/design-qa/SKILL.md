---
name: design-qa
description: Verify that implemented UI matches design intent across layout, spacing, typography, components, states, responsiveness, and interaction behavior. Use when the task is to compare a real build against Figma, prototypes, screenshots, or design-system standards and report fidelity gaps with clear reproduction, severity, and fix guidance. Do not use when the main question is whether the design itself is good.
---

# Design QA

Find the gap between what was designed and what shipped. This is evidence work, not opinion work.

## What this skill is for

Use this skill to:
- compare implemented UI against source designs or design-system standards
- audit layout, spacing, typography, color, iconography, and component usage
- inspect responsive behavior across breakpoints and devices
- verify states such as hover, focus, loading, empty, error, success, and disabled
- document expected-versus-actual defects with reproducible detail
- prioritize visual and interaction regressions by release impact
- identify systemic token or component issues that affect multiple screens

## What this skill is not for

Do not use this skill for:
- open-ended critique of whether the design concept is good
- broader functional QA with no design-fidelity angle
- accessibility review as the primary mission
- subjective commentary without a source of truth

## Required inputs

Before auditing, gather:
- exact source of truth: Figma frame, prototype, screenshot set, component spec, design-system guideline
- environment under test: staging, production, local build
- viewport and browser coverage
- critical screens, components, and flows
- state coverage expectations
- acceptable variance, if any
- whether the goal is bug finding, release sign-off, or regression confirmation

If there is no agreed reference, call that out immediately. Without a source of truth, this is critique, not QA.

## Default output shape

Prefer a table with:
- area or component
- issue summary
- expected
- actual
- severity
- repro steps
- environment or viewport
- likely owner or system impact

Then end with:
- blockers
- non-blocking issues
- untested areas
- ship / no-ship / ship-with-known-issues recommendation

## Working method

### 1. Lock the source of truth

Confirm:
- which design version matters
- whether intentional deviations exist
- which tokens, components, or standards apply
- whether responsive and state specs are documented

QA becomes subjective noise if the reference is ambiguous.

### 2. Audit in layers

Inspect systematically:
- **layout:** alignment, spacing, sizing, grid, overflow, clipping
- **typography:** hierarchy, weight, wrapping, truncation, readability
- **visual styling:** color, icon size, borders, shadows, imagery treatment
- **components:** variant usage, token consistency, state fidelity
- **responsiveness:** wrapping, scrolling, breakpoints, safe areas, overflow
- **interaction:** hover, focus, transitions, affordances, feedback timing

### 3. Reproduce precisely

For every issue, capture:
- screen or component name
- environment and viewport
- exact steps to trigger
- expected behavior or appearance
- actual behavior or appearance
- whether the issue is isolated or systemic

If an engineer cannot reproduce it quickly, the report is weak.

### 4. Prioritize by user impact

Separate:
- blockers that damage trust or core-task completion
- high-visibility defects in primary flows
- medium inconsistencies that reduce polish
- low-priority cosmetic issues

Not every pixel mismatch deserves the same urgency.

### 5. Check states and edge conditions

Do not stop at default screens. Inspect:
- long content
- empty states
- validation errors
- disabled and loading states
- keyboard or focus states where relevant
- small screens and awkward in-between breakpoints
- theme variants if the product supports them

Release bugs hide in neglected states.

### 6. Look for systemic causes

Where useful, note:
- shared component misuse
- wrong token mapping
- one CSS/layout rule causing multiple regressions
- version drift between design system and implementation

A good QA report helps fix the root cause once.

### 7. End with a release-readiness call

Summarize:
- what you tested
- what remains unverified
- what blocks release
- what can safely follow later
- your confidence level

## Adjacent skill boundaries

- **design-critic** judges whether the design is strong; this skill checks whether implementation matches the intended design.
- **frontend-dev** fixes the defects; this skill identifies and scopes them.
- **accessibility-specialist** goes deep on inclusive access; this skill focuses on design fidelity.
- **test-engineer** or broader QA skills cover general product testing; this skill specializes in visual and interaction correctness.

## Quality bar

A strong design-QA output:
- names the exact source of truth
- gives precise expected-versus-actual findings
- includes reproducible steps and environments
- prioritizes defects by real release impact
- covers states and responsiveness, not just the happy path
- helps teams fix systemic issues efficiently

## Files in this skill pack

- `prompt.md` — audit posture and bug-report language
- `examples/README.md` — sample output structures for fidelity review
- `guides/qa-checklist.md` — final self-check before answering
- `meta/skill.json` — structured metadata and boundaries
