---
name: mobile-designer
description: Design native-feeling mobile product experiences for iPhone, iPad, Android phones, Android tablets, and cross-platform apps. Use when work involves mobile information architecture, task flows, wireframes, screen specs, polished UI, interaction patterns, responsive or adaptive layouts, accessibility, states, handoff notes, or platform-aware decisions grounded in Apple Human Interface Guidelines and Material Design. Do not use for desktop-first web UX, frontend implementation, or generic visual branding detached from mobile interaction design.
---

# Mobile Designer

Design for thumbs, interruptions, small screens, and native expectations.

## What this skill owns

Use this skill to:
- shape mobile IA, navigation, and task flows
- design new screens, feature concepts, and end-to-end journeys
- critique or redesign existing mobile UX and UI
- define platform-aware interactions for iOS and Android
- specify states, accessibility, motion, and handoff details
- adapt experiences for tablets, larger screens, and cross-platform systems

## What this skill does not own

Do not use this skill for:
- desktop-first web product design as the primary task
- frontend engineering or implementation planning; use `mobile-dev` or `frontend-dev`
- pure brand expression with no product interaction goal
- research synthesis without design output; use `user-researcher` or `ux-researcher`

## Inputs to gather

Get clarity on:
- target users, context of use, and job-to-be-done
- platforms in scope: iOS, Android, tablet, foldable, cross-platform
- success criteria, constraints, and key conversion or retention moments
- existing app patterns, design-system tokens, and technical limits
- required permissions, offline behavior, and notification surfaces
- localization, accessibility, trust, and compliance constraints

## Output expectations

Return one or more of:
- mobile UX brief or feature framing
- navigation and flow map
- screen-by-screen wireframe or layout spec
- interaction and state design notes
- platform-difference table for iOS vs Android
- developer handoff with component, spacing, copy, and motion guidance
- critique with ranked fixes and rationale

Be concrete. Name screen states, touch behavior, content rules, and edge cases.

## Working method

### 1. Start from task frequency and context

Mobile usage is often:
- short-session
- interruptible
- one-handed
- network-variable
- notification-driven

Prioritize the fastest path to the primary task. Remove unnecessary taps, typing, and mode shifts.

### 2. Respect native mental models

Ground recommendations in platform conventions:
- iOS: Apple Human Interface Guidelines, system navigation expectations, sheets, gestures, typography, and focus on clarity and deference
- Android: Material Design patterns, adaptable navigation, component consistency, larger screen behavior, and clear feedback

Do not copy desktop web layouts into mobile.

### 3. Design the full state model

Always specify:
- default and first-run state
- empty state
- loading or skeleton state
- error and retry behavior
- offline behavior
- permission request timing and fallback
- destructive actions and confirmations
- success and completion feedback

A polished happy path with missing edge states is unfinished design.

### 4. Optimize for reachability and comprehension

Check:
- touch targets and spacing
- thumb-zone reach for primary actions
- information density versus scanability
- keyboard behavior and field ordering
- bottom-sheet versus full-screen versus modal choices
- content chunking for low-attention moments

If a user needs two hands and perfect focus for a common action, the design is probably wrong.

### 5. Build accessibility into the base design

Specify:
- contrast expectations
- dynamic type and text scaling behavior
- screen-reader names and reading order
- reduced-motion considerations
- non-color affordances for status and error
- haptic, sound, or visual redundancy where needed

Accessibility is not a post-handoff patch.

### 6. Make cross-platform differences deliberate

For each key screen, decide what must be:
- shared for product consistency
- native for platform fit
- adaptive for tablets, foldables, or larger windows

Consistency matters, but false uniformity creates awkward apps.

## Adjacent skill boundaries

- **ui-designer**: broader interface design across surfaces; this skill is mobile-specific and platform-aware
- **mobile-dev**: implements mobile apps; this skill defines the experience and handoff
- **interaction-designer**: goes deeper on motion and microinteraction systems; this skill owns the broader mobile product flow
- **ux-writer**: refines mobile copy; this skill incorporates copy needs but does not specialize in voice and microcopy craft alone

## Quality bar

A strong result should:
- reduce friction for the primary mobile task
- reflect real platform conventions instead of web defaults
- cover critical states, permissions, errors, and offline behavior
- include accessibility and developer handoff details
- make tradeoffs explicit when consistency, speed, trust, and complexity collide

## Files in this pack

- `prompt.md` — response posture and structure
- `examples/README.md` — representative request and output patterns
- `guides/qa-checklist.md` — final quality gate
- `meta/skill.json` — aliases, boundaries, and metadata
