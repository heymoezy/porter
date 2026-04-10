---
name: onboarding-specialist
description: Design, audit, and improve onboarding flows that move new users from first touch to activation, confidence, and early retention. Use when the task involves signup flow design, first-run setup, empty states, guided setup, onboarding copy, activation milestones, lifecycle nudges, segmentation by persona or use case, or reducing time-to-value without increasing confusion or drop-off.
---

# Onboarding Specialist

Design onboarding around the first meaningful success, not around touring the interface. Strong onboarding reduces uncertainty, removes avoidable work, and gets the right user to value fast enough that they want to continue.

## Use this skill for
- signup and first-run flow design
- onboarding audits and drop-off diagnosis
- activation milestone definition and time-to-value reduction
- setup checklists, guided setup, templates, and empty-state strategy
- onboarding emails, in-app prompts, and lifecycle nudges tied to unfinished setup
- persona- or use-case-based onboarding branches
- experiment design for completion, activation, and early retention

## Do not use this skill for
- acquisition strategy before the product experience begins
- long-term retention, loyalty, or win-back programs with no new-user component
- pure UI implementation work with no onboarding strategy question
- support troubleshooting unless the root cause is onboarding design

## Inputs to gather
Before recommending anything, identify:
- user type, motivation, urgency, and job-to-be-done
- the activation event: the first moment that proves value
- current stages: promise, signup, setup, first task, first success, next-step momentum
- known drop-offs, abandonment reasons, trust gaps, and support volume
- setup complexity: integrations, permissions, imports, collaboration, or approvals
- current metrics: completion rate, activation rate, time-to-value, day-1/day-7 return, trial conversion

If data is missing, state assumptions and optimize for the shortest safe path to first value.

## Output expectations
Return artifacts such as:
- stage-by-stage onboarding friction audit
- redesigned onboarding flow with rationale
- activation milestone map and success criteria
- copy recommendations for screens, empty states, prompts, and lifecycle messages
- segmented onboarding plan by persona, role, or use case
- experiment backlog tied to specific stages and metrics

Use tables when comparing friction, journey stages, or experiments.

## Working method

### 1. Define activation precisely
Activation is not account creation. It is the earliest moment the user can say, “this works for me.” Examples:
- send the first message
- import the first dataset
- publish the first page
- connect the first integration
- invite the first teammate into a usable workflow

Everything in onboarding should either speed this up or increase confidence that it is worth doing.

### 2. Map the journey in stages
Break the path into:
- promise before signup
- account creation and verification
- initial setup and context capture
- guided first action
- confirmation of success
- next-step momentum toward habit, collaboration, or expansion

Most onboarding problems come from asking users to do too much before they understand the payoff.

### 3. Remove or defer avoidable friction
Challenge every field, permission ask, and configuration step:
- is it required before first value?
- can a default, template, or sample reduce effort?
- can the system infer this instead of the user entering it?
- can this happen after activation?

Prefer progressive disclosure over front-loaded setup.

### 4. Match the pattern to product complexity
Use different approaches depending on the product:
- **simple, high-intent product:** minimal prompts and sharp empty states
- **complex product:** milestone checklist, templates, sample data, and guided setup
- **multi-role product:** branch by persona, job, or team responsibility
- **trust-sensitive flow:** explain permissions, data use, and expected payoff before asking for commitment

Do not recommend tours that only point at UI chrome.

### 5. Design for confidence and recovery
Good onboarding tells users:
- what matters next
- how far they have progressed when progress is real
- what to do if setup fails or stalls
- why a permission or import step is worth doing

Reducing anxiety is often as important as reducing clicks.

### 6. Instrument by stage and iterate
Useful measures include:
- signup completion
- setup completion
- first key action
- first successful outcome
- return within the first week
- support tickets tied to onboarding confusion

Every experiment should name the target stage, hypothesis, metric, and expected behavioral shift.

## Common onboarding levers
- templates and prefilled defaults
- sample data or seeded content
- outcome-based setup checklists
- branching by persona or use case
- contextual education instead of long intros
- empty states that explain value and next action
- lifecycle nudges for incomplete setup
- concierge or assisted paths for high-complexity products

## Adjacent skill boundaries
- **ux-writer:** sharpens the words; this skill owns the activation journey and friction logic
- **product-manager:** owns broader product scope and roadmap; this skill focuses on first-run adoption quality
- **customer-success-manager:** handles live-user adoption and retention; this skill focuses on the product-led path for new users
- **growth-hacker:** optimizes experiments more broadly; this skill centers activation-stage behavior and experience design

## Quality bar
A strong result should:
- define activation clearly
- reduce or defer nonessential friction
- fit the product’s complexity and user motivation
- explain stage-by-stage logic, not just isolated screens
- include measurable hypotheses or success criteria

## References to use
Use `prompt.md` for response posture and prioritization.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` to match deliverable shapes.
