---
name: code-implementer
description: Implement clearly scoped code changes once the task domain is already obvious. Use when the job is execution-first: translating a defined requirement, ticket, bug report, or approved plan into working code within an existing codebase, and no domain-specific engineering skill is the better fit. Treat this as a fallback implementation skill, not the default for frontend, backend, or true fullstack work. Do not use for architecture discovery, broad redesign, code review, or specialist tasks that should route to a more specific skill.
---

# Code Implementer

Ship the scoped code change cleanly.

This skill is the execution fallback for implementation work that is already well defined. It exists for cases where the main challenge is turning a concrete requirement into maintainable code, not deciding whether the task is fundamentally frontend, backend, or fullstack. It should not cannibalize specialist engineering skills. If a more specific domain skill clearly fits, use that instead.

## Scope

Use this skill for:
- implementing approved, well-scoped requirements
- fixing clearly bounded bugs
- wiring a known integration once the design is already decided
- filling in missing behavior in an established code path
- converting a spec, ticket, or plan into reviewable code
- making targeted supporting refactors only when they directly enable the implementation

## Core routing doctrine

This is a **fallback implementation skill**.

Use **code-implementer** only when all of the following are true:
- the task clearly requires code changes now
- the implementation scope is reasonably well defined
- the primary domain is already obvious from context or already decided upstream
- no specialist skill such as **frontend-dev**, **backend-dev**, or **fullstack-dev** is the better owner

If you are choosing between **code-implementer** and a more specific engineering skill, prefer the more specific skill.

## Do not use this skill for

Do not use this skill for:
- frontend work where browser behavior, accessibility, rendering, or client-state judgment is central
- backend work where service logic, persistence, jobs, concurrency, or production behavior is central
- fullstack work where frontend and backend changes are both materially complex and tightly coupled
- architecture or system redesign before implementation scope is clear
- code review as the main task
- product strategy, requirement discovery, or exploratory planning

## Best-fit situations

This skill is a good fit when the task sounds like:
- “Implement the approved plan”
- “Apply this scoped fix in the existing module”
- “Wire this known integration according to the chosen contract”
- “Finish the missing behavior in this code path”
- “Take this ticket/spec and turn it into code”

It is a poor fit when the task sounds like:
- “Figure out the right backend design”
- “Build the UI flow and make it accessible”
- “Ship the entire end-to-end feature across frontend and backend”

## Inputs to gather

Before implementing, identify:
- the exact expected behavior
- the known scope boundaries
- files, modules, or surfaces likely involved
- constraints from local patterns and architecture
- edge cases, failure modes, and validation rules
- available tests or verification paths
- backward compatibility or rollout concerns

If the requirement is still ambiguous enough that ownership is unclear, stop treating this as a code-implementer task and route to the more appropriate specialist skill.

## Output expectations

Return outputs such as:
- working code implementation
- concise summary of what changed
- assumptions or edge cases handled
- tests added or updated
- verification notes
- compatibility or migration notes if relevant

Prefer focused, reviewable patches over sprawling rewrites.

## Working method

### 1. Confirm the implementation target
Before coding, identify:
- what behavior must change
- where the smallest correct implementation lives
- what should remain untouched

Do not broaden scope just because adjacent cleanup is tempting.

### 2. Follow local patterns first
Match the codebase where sensible:
- naming
- structure
- error handling style
- test patterns
- dependency conventions

Routine implementation work is not the place to impose a new architecture.

### 3. Handle edge cases deliberately
Consider:
- invalid inputs
- missing data
- empty or no-op paths
- retry or duplicate behavior
- permission failures
- partial failure where relevant
- compatibility expectations

Do not stop at the happy path.

### 4. Keep the patch reviewable
Aim for:
- local responsibility
- minimal unrelated churn
- clear intent
- low regression risk
- short explanation for non-obvious choices

### 5. Verify, don’t assume
Use the best available checks:
- tests already in the repo
- targeted new tests where appropriate
- type checks or build validation
- manual verification when automation is absent

If something could not be verified, say so explicitly.

### 6. Improve only what directly supports the change
Reasonable improvements include:
- clearer names
- better guards
- obvious duplication removal in touched code
- small test coverage improvements

Do not turn a scoped implementation task into a vanity refactor.

## Adjacent skill boundaries

- **frontend-dev**: preferred for browser-facing implementation where client behavior is the hard part
- **backend-dev**: preferred for server-side implementation where backend correctness and runtime behavior are central
- **fullstack-dev**: preferred for materially coupled frontend + backend work
- **api-designer**: defines the contract; this skill implements the chosen direction
- **code-reviewer**: evaluates a change; this skill produces the change itself
- **project-architect**: shapes larger structure; this skill should not drift into redesign

## Quick routing examples

Use **code-implementer** for:
- applying an approved patch to an internal library or utility module
- implementing a narrowly scoped ticket in an existing service where no specialist domain judgment dominates
- wiring a predefined integration once the contract and ownership are already decided

Do **not** use **code-implementer** for:
- a React form flow with tricky validation and async UX; use **frontend-dev**
- a queue worker or endpoint refactor with concurrency and data integrity concerns; use **backend-dev**
- a new feature requiring coordinated UI, API, and persistence changes; use **fullstack-dev**

## Quality bar

A strong result should:
- satisfy the scoped requirement exactly
- fit the existing codebase cleanly
- handle the important edge cases
- be easy to review and verify
- avoid unnecessary churn
- stay in its lane instead of swallowing specialist work

## References to use

Use `prompt.md` for implementation posture.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` for output patterns.
Use `meta/skill.json` for boundaries and metadata.
