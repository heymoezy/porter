---
name: tutorial-creator
description: Design task-based tutorials, walkthroughs, quickstarts, onboarding guides, and teach-by-doing learning content that helps a defined audience complete a concrete outcome safely and successfully. Use when work involves step-by-step instruction, docs-to-tutorial conversion, first-run success flows, procedural learning assets, product education walkthroughs, or guided examples with checkpoints and troubleshooting. Do not use for broader curriculum architecture that requires full training-program design.
---

# tutorial-creator

Teach by getting the user to finish the task.

This skill owns procedural teaching judgment: how to choose one meaningful outcome, strip the path to the shortest safe sequence, write steps that can actually be followed, and include checkpoints and troubleshooting where users usually get stuck.

## Scope

Use this skill for:
- quickstarts and first-run guides
- step-by-step tutorials and walkthroughs
- docs-to-tutorial rewrites
- product onboarding lessons
- guided examples with verification checkpoints
- multi-part tutorial series and progression maps
- sandbox or lab instructions for a defined task
- procedural learning content for beginners or mixed audiences
- task-focused help that must teach through doing
- screenshot plans or placeholder guidance for visual walkthroughs

## Do not use this skill for

Do not use this skill for:
- broad training programs with assessments, facilitation, and rollout needs
- reference documentation where users look up facts rather than follow a path
- conceptual explainers that do not require task completion
- marketing copy disguised as education
- advanced operational runbooks where the audience is already expert and needs decision logic more than guided teaching

## Routing rules

Route to **tutorial-creator** when the main challenge is deciding:
- how to get a user from blank state to one successful outcome
- how to translate dense docs into a usable sequence
- what prerequisites, steps, checks, and troubleshooting are needed
- how to reduce first-run friction and hidden assumptions
- how to teach a procedure without burying the user in theory

Do **not** route here just because the content is educational.
If the task is a curriculum, onboarding program, or performance-focused enablement system, use **training-developer** instead.

## Inputs to gather

Before writing the tutorial, identify:
- target audience and prior knowledge
- exact outcome to achieve by the end
- starting state, prerequisites, and environment assumptions
- tools, accounts, permissions, or sample data required
- common failure points and confusing transitions
- whether the tutorial is for web, CLI, API, mobile, or mixed surfaces
- acceptable completion time and desired depth
- what success looks like after each critical step
- logical next step once the tutorial is complete

If the end state is vague, say the tutorial target is underspecified.

## Output expectations

Return outputs such as:
- quickstart guides
- step-by-step tutorials with checkpoints
- multi-part walkthrough series
- product onboarding flows
- rewritten docs that teach by doing
- troubleshooting callouts and verification cues

Prefer executable instruction over explanatory sprawl.

## Working method

### 1. Define one clear end state
A tutorial should usually teach one meaningful outcome.
If the request tries to teach everything, split it into phases.

### 2. Design the shortest safe path
Remove detours.
Keep only the steps necessary to reach the target without creating hidden leaps.

### 3. Surface prerequisites early
Tell the learner what they need before step 1.
Hidden setup is one of the fastest ways to make tutorials fail.

### 4. Write action-first steps
Use imperative language.
Each step should say:
- what to do
- what should happen
- what to check if it does not

### 5. Add checkpoints at meaningful transitions
After important steps, state the expected result so the learner can verify progress before continuing.

### 6. Anticipate the usual mistakes
Include brief troubleshooting for the highest-probability failure modes.
Do not dump a giant FAQ inside the flow.

### 7. Close with recap and next step
End with what the learner accomplished, what they now understand, and where to go next.

## Heuristics

Prefer:
- one task outcome per tutorial
- plain language and strong headings
- steps that can be executed in order without guessing
- checkpoints immediately after risky actions
- examples, screenshots, or placeholders when they clarify the action
- concise troubleshooting tied to the exact point of failure

Avoid:
- giant theory sections before action starts
- burying prerequisites halfway through the tutorial
- steps that hide expected outputs
- mixing beginner and expert assumptions without warning
- writing a reference manual and calling it a tutorial
- ending without a recap or next step

## Adjacent skill boundaries

- **tutorial-creator** owns step-by-step procedural teaching for one defined outcome
- **training-developer** owns larger learning programs and capability systems
- **documentation-writer** owns reference and explanatory docs
- **onboarding-specialist** may own full onboarding journeys; this skill owns the procedural lesson within them
- **course-creator** may own broader educational packaging; use this skill when the core artifact is a task walkthrough

## Quick routing examples

Use **tutorial-creator** for:
- rewriting a dense setup document into a 10-minute developer quickstart
- creating a beginner tutorial for publishing a first automation
- turning a product feature launch into a customer walkthrough with checkpoints
- building a short CLI guide with sample commands and success verification

Do **not** use **tutorial-creator** for:
- a 30-day onboarding curriculum with labs and assessment
- API reference documentation
- a conceptual deep dive on system architecture with no guided task

## Quality bar

A strong result should:
- define the audience, starting state, and end state clearly
- provide steps that can be followed without hidden assumptions
- include verification checkpoints at critical moments
- anticipate likely failure points with concise troubleshooting
- stay focused on task completion rather than background theory
- leave the learner confident about the immediate next step

## Use with

- `prompt.md` for execution posture and response style
- `examples/README.md` for representative requests and output shape
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
