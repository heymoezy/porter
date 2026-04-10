---
name: tech-debt-manager
description: Identify, classify, prioritize, and reduce technical debt across code, architecture, tooling, tests, dependencies, and delivery workflows. Use when the main task is to turn messy systems or recurring engineering pain into a debt register, ranked remediation plan, modernization roadmap, or business case for engineering health investment. Do not use for one-off bug fixing, generic refactoring with no prioritization question, or architecture design work that is not framed as debt reduction.
---

# Tech Debt Manager

Turn vague complaints about brittle systems into a ranked debt portfolio and a practical reduction plan.

## Scope

Use this skill for:
- debt discovery and inventory creation
- debt classification by type, cause, and consequence
- prioritization across reliability, security, velocity, cost, and cognitive load
- debt roadmaps and remediation sequencing
- modernization and refactor business cases
- maintenance budgeting and capacity allocation guidance
- debt policies: pay down, contain, defer, or retire

Do not use this skill for:
- isolated bug fixes or incident triage with no portfolio view
- architecture design unrelated to inherited debt; use **system-architect**
- implementation of the chosen remediation; use engineering execution skills
- cleanup for aesthetics alone

## Start by separating debt from everything else

Not every messy thing is technical debt.
Classify items as:
- **true debt:** a shortcut or outdated structure that creates future cost/drag
- **defect:** a specific broken behavior
- **feature gap:** missing capability, not debt
- **operational issue:** run-state problem that may or may not stem from debt
- **deliberate tradeoff:** acceptable compromise chosen knowingly

This distinction matters because prioritization, ownership, and ROI differ.

## Debt categories to inspect

Look for debt in:
- architecture and service boundaries
- code complexity and duplication
- test gaps and flaky validation layers
- dependency and upgrade lag
- build/release pipeline fragility
- observability and runbook holes
- data-model sprawl and migration pain
- security hygiene and secret/config handling
- undocumented tribal knowledge and handoff bottlenecks

## Working method

### 1. Build a debt register
For each item, capture:
- area/system affected
- debt statement in plain language
- origin/root cause
- current symptoms
- business consequence
- engineering consequence
- evidence: incidents, delays, toil, defects, costs, or missed opportunities

If an item has no consequence, it is probably not worth prioritizing.

### 2. Estimate impact and urgency
Assess each item by:
- delivery drag
- reliability/user harm
- security/compliance exposure
- operational toil
- cloud or infrastructure waste
- cognitive load / onboarding tax
- coupling to upcoming roadmap work
- probability the problem compounds if ignored

Use rough sizing if needed, but label it as rough.

### 3. Decide the treatment
Each item should land in one of four buckets:
- **Fix now** — active risk or high leverage
- **Schedule** — important but can be staged
- **Contain** — add guardrails/monitoring while deferring deeper repair
- **Leave alone** — low payoff, speculative, or better replaced later

A good debt manager says no to cleanup theater.

### 4. Slice remediation safely
Prefer:
- incremental refactors
- thin-slice strangler patterns
- safety rails before big moves
- measurable before/after outcomes
- owner-by-owner sequencing

Avoid “rewrite everything” unless the cost of continued operation is clearly worse and migration risk is understood.

### 5. Tie debt reduction to business outcomes
Translate technical pain into consequences leaders understand:
- slower feature delivery
- recurring incident cost
- degraded conversion or retention
- compliance risk
- rising infrastructure spend
- staffing/onboarding inefficiency

The goal is not to dramatize. The goal is to make tradeoffs legible.

## Output expectations

Return some combination of:
- debt register
- prioritization matrix or ranked list
- remediation roadmap by horizon
- owner recommendations and dependencies
- success metrics / leading indicators
- business case for capacity allocation

Useful horizons are usually:
- this sprint
- this quarter
- later / revisit trigger

## Heuristics

Prefer:
- evidence-backed debt statements
- root-cause framing over symptom lists
- small, compounding remediation wins
- debt payoff tied to roadmap leverage
- explicit defer/contain decisions

Avoid:
- vague “code quality is poor” language
- equal priority for everything
- refactor proposals with no success measure
- cosmetic cleanup labeled as strategic debt work
- assuming every old subsystem must be replaced

## Adjacent skill boundaries

- **system-architect:** designs future structure; this skill prioritizes inherited drag and reduction strategy
- **release-manager / site-reliability:** manage release/run-state operations; this skill frames debt across horizons
- **code-reviewer / quality-reviewer:** review specific changes; this skill manages the debt portfolio
- **backend-dev / fullstack-dev / feature-engineer:** execute remediations once chosen

## Use with

- `prompt.md` for execution posture and response style
- `examples/README.md` for representative requests and output shape
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
