---
name: gh-issues
description: Operate GitHub issue intake and backlog hygiene with clear triage, prioritization, deduplication, and execution-ready rewriting. Use when the task is to review issues, clean up noisy backlog queues, classify bugs versus feature requests versus support, improve issue forms or labeling logic, cluster duplicates, or turn vague GitHub tickets into implementation-ready work. Do not use for coding the fix, full pull-request review, or repository administration unrelated to issue workflow.
---

# GitHub Issues

Protect engineering attention. Bad issues waste it.

## Scope

Use this skill for:
- intake triage of new GitHub issues
- issue quality improvement and rewriting
- severity and priority recommendations
- duplicate detection and consolidation
- backlog cleanup and stale-ticket handling
- turning support noise into the right next action instead of automatic engineering work
- shaping issue forms, labels, and triage conventions to improve future intake
- building implementation-ready tickets with acceptance criteria and missing-info callouts

GitHub’s own issue tooling supports labels, issue forms, default assignees, and structured intake. Use that reality to improve queue quality, not just to describe tickets better.

## Do not use this skill for

Do not use this skill for:
- implementing the fix itself
- full PR review, merge decisions, or branch workflow management
- repo settings, permissions, or automation outside issue operations
- broad product strategy work that is not tied to specific issue intake or backlog decisions
- treating every complaint as an engineering ticket

## Inputs to gather

Before triaging, collect:
- issue title, body, comments, and linked artifacts
- screenshots, logs, repro steps, environment details, and timestamps if available
- affected workflow, user segment, or system surface
- expected behavior versus observed behavior
- evidence of frequency, impact radius, workaround availability, and business risk
- current labels, assignees, milestones, projects, and related issues
- whether the decision needed now is close, clarify, merge, split, schedule, or escalate

## Output expectations

Return outputs such as:
- a triage summary with issue type, severity, and priority rationale
- a rewritten issue ready for engineering work
- duplicate-cluster recommendations with canonical issue choice
- clarifying questions for the reporter
- backlog cleanup proposal across a set of tickets
- issue-form, label, or workflow recommendations to reduce repeat noise

## Working method

### 1. Identify the actual job

Distinguish:
- bug
- feature request
- support request
- duplicate
- chore/task
- umbrella issue that should be split

Do not let the reporter’s preferred solution decide the classification.

### 2. Separate symptom, user pain, and likely root cause

Many issues describe frustration but not failure mode. Capture:
- what happened
- who it hurt
- what was expected
- what evidence exists
- what is still unknown

### 3. Score impact before urgency

A good priority call considers:
- affected users or systems
- frequency and reproducibility
- workaround availability
- trust, revenue, security, or data risk
- dependency blocking
- cost of delay

State the rationale explicitly.

### 4. Rewrite for execution readiness

A strong engineering-ready issue usually includes:
- concise title
- problem statement
- current behavior
- expected behavior
- repro steps or reproduction status
- environment details if relevant
- supporting evidence
- acceptance criteria or done conditions
- open questions and assumptions

### 5. Clean the backlog, not just the ticket

Check whether the issue should be:
- merged into a canonical duplicate
- split into smaller work items
- closed as support, invalid, or no longer relevant
- held pending more evidence
- escalated because the risk is broader than one issue suggests

### 6. Improve the intake system when patterns repeat

If the same gaps keep appearing, recommend:
- better issue forms
- clearer default labels
- required repro fields
- stronger templates
- routing rules that keep questions out of engineering backlog by default

## Heuristics

Prefer:
- explicit triage rationale
- evidence over speculation
- narrow, actionable tickets
- canonical duplicates instead of many semi-overlapping tickets
- queue reduction when noise is non-actionable

Avoid:
- urgency inflation without impact data
- mixing bug, request, and support semantics
- overstuffed tickets with multiple unrelated jobs
- vague titles and fuzzy acceptance criteria
- treating label application as the same thing as real triage

## Adjacent skill boundaries

- **github**: use for broader GitHub operations, repo/PR workflows, and direct `gh` execution
- **bug-triager**: use when deep defect diagnosis is the main job rather than queue shaping
- **project-manager**: use when cross-issue planning and sequencing is the main problem
- **release-manager**: use when coordination across milestones and shipping readiness dominates

## Quality bar

A strong result should:
- classify the ticket correctly
- make priority defensible
- reduce ambiguity for the next owner
- improve queue health rather than just rewording noise
- recommend the cleanest next action: keep, merge, split, close, or escalate

## References to use

Use `prompt.md` for response structure and triage stance.
Use `examples/README.md` for output patterns.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata, aliases, and boundaries.
