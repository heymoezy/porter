---
name: motion-designer
description: Design purposeful motion systems, transitions, microinteractions, and animation specs for product, interface, or brand work. Use when the main task is deciding how movement should guide attention, explain state changes, shape tone, storyboard sequences, define timing/easing/choreography, or provide accessible reduced-motion alternatives for UI, marketing, or video experiences.
---

# Motion Designer

Use motion to explain change, direct attention, and make an experience feel coherent. Do not add movement just because a surface looks static.

## Own the problem

This skill owns:
- UI transitions and microinteractions
- state-change animation logic
- motion systems for products or design systems
- storyboard-level motion concepts for launches, explainers, or campaigns
- timing, easing, sequencing, and choreography specs
- reduced-motion and comfort-aware alternatives
- implementation-ready motion notes for web, iOS, Android, or video teams

This skill does **not** own:
- static visual identity or layout as the main task; use a visual design skill instead
- full video production planning, shot logistics, or post pipeline management as the primary job
- pure illustration or storyboard drawing without motion behavior as the core challenge

## Route here when

Use this skill when the hard part is deciding:
- how a state change should feel and read
- how to animate entry, emphasis, feedback, loading, success, error, or navigation
- how to make a product feel faster, calmer, clearer, or more premium through motion
- how to define a reusable motion language across components or scenes
- how to preserve accessibility and comfort while still using motion effectively

Do not route here for decorative flourish alone. Trigger when movement itself is the design problem.

## Inputs to gather

Collect what matters most:
- surface type: product UI, website, app, brand film, social spot, presentation, kiosk
- task and user context: onboarding, editing, waiting, error recovery, confirmation, navigation
- platform constraints: web, iOS, Android, After Effects, Lottie, CSS, Framer Motion, native APIs
- brand tone: calm, precise, playful, bold, premium, trustworthy
- performance limits: low-end devices, battery, frame budget, asset size
- accessibility needs: reduced motion, vestibular sensitivity, attention load, cognitive load
- current visual system: layout, hierarchy, component states, interaction patterns

If the current experience exists, audit it before inventing a new motion language.

## Working method

### 1. Define the job of the motion
Every motion moment should do at least one job:
- orient
- connect cause and effect
- emphasize hierarchy
- confirm success or failure
- teach interaction possibilities
- support brand expression

If it serves no job, cut it.

### 2. Start from state change and spatial logic
Describe:
- starting state
- triggering event
- what transforms, moves, scales, fades, or morphs
- end state
- what the user should understand by the end

Preserve spatial continuity where possible so users can track identity across transitions.

### 3. Specify the mechanics, not just the vibe
For each motion pattern, define:
- trigger
- duration or duration range
- easing behavior
- delay, if any
- sequence order
- interruption behavior
- reversal behavior
- exit conditions
- reduced-motion alternative

Avoid outputs like “make it feel smooth” without implementation detail.

### 4. Match timing to distance and importance
Use shorter motion for lightweight feedback and longer motion only when it helps orientation or storytelling. Long motion that blocks task completion is usually bad product motion.

Think in relative terms:
- tiny feedback: very short and crisp
- panel or modal transitions: short but readable
- navigation context shifts: long enough to preserve orientation
- narrative brand sequences: longer if pacing serves the story

### 5. Choreograph attention deliberately
Decide what should move first, what should stay still, and what should wait. Too many simultaneous animations flatten hierarchy and increase cognitive load.

Prefer one clear focal action over layered spectacle.

### 6. Design for comfort and accessibility
Always define a reduced-motion mode. Favor opacity, color, or minimal transform changes over large parallax, dramatic zooms, aggressive bounce, or perpetual ambient movement when comfort matters.

Movement from user interaction deserves special care. If a transition could trigger discomfort, provide a simpler alternative.

### 7. Respect implementation reality
Account for:
- frame budget and jank risk
- GPU-friendly properties versus expensive layout thrash
- platform animation primitives and handoff format
- asset size, Lottie complexity, raster versus vector tradeoffs
- maintainability in component libraries

A beautiful sequence that cannot ship cleanly is unfinished design.

## Output formats

Return one or more of:
- motion brief
- component motion system
- storyboard or shot-by-shot sequence
- state-transition table
- timing and easing spec
- implementation notes by platform
- accessibility and reduced-motion plan
- critique of an existing motion language

## Quality bar

A strong result:
- makes the interface or story easier to understand
- defines timing, sequencing, and triggers clearly enough to build
- stays consistent across related moments
- reflects brand tone without hurting usability
- includes accessible fallbacks and performance-aware choices

## Use with

- `prompt.md` for response posture
- `examples/README.md` for representative requests
- `guides/qa-checklist.md` for final review
- `meta/skill.json` for machine-readable metadata
