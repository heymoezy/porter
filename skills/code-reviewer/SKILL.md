---
name: code-reviewer
description: Provide thorough, constructive review feedback on code changes with attention to correctness, maintainability, edge cases, tests, regressions, performance, and security. Use when the task is to evaluate a diff, pull request, patch, or implementation plan before merge. Do not use when the primary task is to write the code itself.
---

# Code Reviewer

Improve code quality without turning review into noise.

This skill exists to inspect changes critically, surface real risks, and help the author ship safer, clearer code. Strong review is not about style nitpicks by default; it is about correctness, maintainability, test coverage, operational risk, and clarity of intent.

## Scope

Use this skill for:
- pull request review
- diff or patch review
- pre-merge risk analysis
- review of tests and failure handling
- maintainability and readability review
- spotting regression, security, and edge-case risks
- prioritizing comments by severity and merge impact

## Use this skill when

Use this skill when the task needs:
- structured code review feedback
- ranking issues by severity or merge-blocking status
- an independent view on whether a change is safe to merge
- review comments that are specific, constructive, and actionable
- a focus on real risks instead of generic approval or vague criticism

## Do not use this skill when

Do not use this skill for:
- implementing the code as the main task
- architecture planning before any concrete change exists
- purely stylistic cleanup when the real concern is elsewhere
- generic “looks good” approval with no actual review content

## Inputs to gather

Before reviewing, identify:
- change scope and intent
- affected modules and behaviors
- whether tests were added, changed, or omitted
- known requirements or acceptance criteria
- risk areas: data integrity, auth, concurrency, performance, compatibility, observability
- whether the task is bug fix, feature, refactor, migration, or infra change

If the review target is unclear, define the intended behavior first.

## Output expectations

Return outputs such as:
- review summary
- findings ranked by severity
- merge blockers vs non-blockers
- suggested fixes or follow-up questions
- confidence level and residual risks
- explicit “safe to merge” or “not yet safe” judgment when appropriate

Prefer concise, high-signal review comments over volume.

## Working method

### 1. Review for intent first

Start by asking:
- what is this change trying to do?
- does the implementation actually satisfy that intent?
- is the scope appropriate or oddly expanded?

A review that misses the intended behavior is shallow even if it catches style issues.

### 2. Check correctness before polish

Prioritize:
- logic correctness
- state transitions
- error handling
- missing edge cases
- data consistency
- concurrency or ordering issues
- permission and authorization behavior
- unintended side effects

Cosmetic comments should not bury merge blockers.

### 3. Review tests as evidence, not decoration

Assess whether tests:
- cover the changed behavior
- include edge cases and failure modes where needed
- would actually catch regressions
- are missing where risk justifies them

A passing test suite is not automatically good coverage.

### 4. Evaluate maintainability

Look for:
- surprising control flow
- duplication introduced by the change
- confusing naming
- hidden coupling
- brittle assumptions
- poor separation of responsibilities
- comments that explain symptoms instead of fixing causes

Ask whether the next engineer will trust this change.

### 5. Include operational thinking when relevant

For changes that affect production behavior, consider:
- rollback difficulty
- migration safety
- logging and observability
- backward compatibility
- performance implications
- failure blast radius

Review should reflect how the code behaves after merge, not just whether it compiles.

### 6. Write feedback that helps the author act

Strong review feedback should:
- identify the issue clearly
- explain why it matters
- indicate severity
- suggest a fix direction when possible
- avoid performative harshness or vague dislike

Examples:
- “High: this retry path can create duplicate records because the idempotency guard is only checked before the transaction begins.”
- “Medium: the happy path is covered, but there is no test for partial failure after the external call succeeds.”

### 7. Distinguish blockers from polish

Use categories such as:
- **Blocker**: incorrect, unsafe, or too risky to merge
- **Should fix**: important quality issue but not catastrophic
- **Nice to improve**: readability or maintainability improvement
- **Question**: clarification needed before confidence is high

That keeps the review actionable.

## Adjacent skill boundaries

- **code-implementer**: writes the change; this skill reviews it
- **backend-dev / frontend-dev / fullstack-dev**: may provide domain-specific implementation; this skill provides review discipline across the change
- **security-auditor**: deeper security review beyond general code review scope
- **project-architect**: higher-level structural guidance; this skill focuses on the actual proposed change

## Quality bar

A strong result should:
- catch real correctness or regression risks
- prioritize findings by impact
- avoid drowning the author in low-value nitpicks
- explain why issues matter
- make a defensible merge recommendation
- improve both code quality and team velocity

## References to use

Use `prompt.md` for review posture and comment style.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` for output patterns.
Use `meta/skill.json` for boundaries and metadata.
