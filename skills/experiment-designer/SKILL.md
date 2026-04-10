---
name: experiment-designer
description: Design experiments that answer causal questions credibly across product, growth, marketing, operations, learning, pricing, and service contexts. Use when work requires hypothesis framing, randomization strategy, assignment-unit choice, metric design, guardrails, instrumentation planning, sample and duration estimates, contamination checks, or decision rules for test interpretation. Do not use for simple analytics reporting, observational correlation analysis, or fake experiments with no serious causal inference discipline.
---

# Experiment Designer

Design tests that can survive contact with reality.

This skill is for turning uncertain decisions into credible experiments: defining the causal question, selecting the right unit of assignment, choosing a primary metric, setting guardrails, planning instrumentation, anticipating interference and novelty effects, and making sure the readout can support a real decision.

## Use this skill to

- design A/B tests, holdouts, pilots, phased rollouts, or operational experiments
- sharpen hypotheses and causal mechanisms
- choose assignment units and exposure rules
- define primary metrics, secondary metrics, and guardrails
- estimate sample or duration needs with clear caveats
- plan instrumentation and experiment QA before launch
- write interpretation rules and launch/stop criteria

## Do not use this skill to

- summarize already-run analytics with no design work
- claim causality from observational data alone
- run experiments that are unethical, impossible to randomize, or better handled as policy decisions
- provide specialized regulated-trial advice beyond general experimentation principles

## Inputs to gather

Clarify:

- the decision the result should change
- the hypothesis and proposed causal mechanism
- the intervention itself and what exactly changes between variants
- unit of analysis and assignment: user, account, team, store, region, workflow, class
- baseline rates, traffic, sample constraints, and timing realities
- primary metric, secondary metrics, guardrails, and downside risks
- instrumentation quality, contamination risk, seasonality, and operational constraints

If the decision is fuzzy, fix that first. A vague decision produces fake precision later.

## Output expectations

Useful outputs include:

- experiment design memo
- hypothesis and metric framework
- assignment and rollout plan
- sample-size or duration guidance with assumptions
- instrumentation and QA checklist
- decision rubric for result interpretation

## Working method

### 1. Start with the decision, not the experiment format

Define what action changes if the result is positive, null, harmful, or inconclusive. If no one will act differently, the test is probably theater.

### 2. State the causal story plainly

Spell out:

- what changes
- who is exposed
- why behavior should change
- on what time horizon the effect should appear

A weak mechanism usually leads to muddled metrics.

### 3. Choose the assignment unit that minimizes interference

User-level randomization is common, not sacred. If users share environments, inventory, classmates, support queues, or social feeds, choose a unit that keeps spillover manageable.

### 4. Protect metric discipline

Use one clear primary metric tied to the decision. Add a small set of secondary metrics for interpretation and guardrails for harm detection. Do not reward metric sprawl.

### 5. Validate instrumentation before launch

An elegant test with broken logging is still broken. Confirm exposure logging, metric computation, exclusion logic, and expected event flows before treating the experiment as live.

### 6. Anticipate bias, contamination, and operational failure

Check for novelty effects, sample-ratio mismatch, implementation bugs, seasonality, carryover effects, partial rollout mismatch, leakage between variants, and uneven treatment quality.

### 7. Predefine the readout logic

State success, harm, inconclusive outcomes, and escalation paths before results arrive. Good experiment design reduces argument after the data appears.

## Heuristics

Prefer:

- one causal question per experiment
- assignment rules matched to real-world interference
- one primary metric with disciplined support metrics
- guardrails tied to meaningful downside risk
- interpretation plans agreed before launch

Avoid:

- testing many bundled changes without attribution strategy
- choosing metrics because they are easy rather than decisive
- pretending underpowered tests are conclusive
- changing success criteria after seeing results
- calling a null result “proof of no effect” without power context

## Review lenses

Check:

- Does the experiment answer a real decision?
- Is the causal mechanism explicit and plausible?
- Is the assignment unit appropriate for contamination risk?
- Are primary, secondary, and guardrail metrics well chosen?
- Will instrumentation and readout logic support a credible decision?

## Adjacent skill boundaries

- **data-scientist**: analyzes outcomes and may handle advanced statistical modeling
- **growth-analyst**: ties experiments to funnel and channel performance interpretation
- **product-manager**: owns prioritization, rollout tradeoffs, and business judgment
- **ux-researcher**: often informs hypotheses upstream with qualitative insight

## Quality bar

A strong result should:

- frame a clear causal question tied to a real decision
- use an assignment design that preserves interpretability
- define metrics and guardrails that match the mechanism and risk
- acknowledge practical limits such as power, contamination, and ethics
- make the eventual readout harder to politicize

## Files in this pack

- `prompt.md` — causal stance, structure, and guardrails
- `examples/README.md` — strong experiment-design deliverable shapes
- `guides/qa-checklist.md` — final review checklist
- `meta/skill.json` — catalog metadata and adjacent-skill map
