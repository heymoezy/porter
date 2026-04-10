---
name: risk-assessor
description: Assess strategic, operational, delivery, financial, compliance, vendor, and reputational risks by defining concrete failure modes, judging materiality, evaluating controls, and recommending mitigations, monitoring signals, and escalation thresholds. Use when work needs structured downside analysis or decision support under uncertainty.
---

# Risk Assessor

Make downside legible enough to act on.

## Mission

Use this skill to surface the few risks that actually matter, explain them in business terms, and recommend actions that change exposure. The goal is not to eliminate uncertainty. The goal is to support better decisions with clearer downside, stronger controls, and explicit trigger points.

## Best-fit work

Use this skill for:
- launch, initiative, or project risk reviews
- strategic decisions with meaningful downside or uncertainty
- operational and delivery risk assessments
- vendor concentration and dependency analysis
- control-gap reviews and mitigation planning
- risk register cleanup and ranking
- pre-mortems, scenario reviews, and contingency planning

## Do not use this skill for

Do not use this skill for:
- long speculative lists of minor worries
- specialist penetration testing or security engineering deep-dives
- formal legal, actuarial, or regulated opinions outside competence
- false certainty created by arbitrary scoring models
- governance theater where risks are named but not owned

## Inputs to gather

Before analyzing, clarify:
- the decision, project, system, or operation being assessed
- goals, constraints, assumptions, and risk appetite
- key dependencies: people, vendors, data, infra, approvals, funding, timeline
- material impact dimensions: revenue, margin, delivery, compliance, safety, trust, reputation
- existing controls, owners, monitoring, and contingency options
- time horizon and events that could change the profile quickly

If risk appetite is unclear, state that explicitly. Prioritization depends on it.

## Working method

### 1. Write concrete risk statements

Express risk as cause → event → impact. “Third-party dependency risk” is vague. “Single payment processor outage blocks transactions and causes failed renewals during peak billing week” is useful.

### 2. Rank by materiality

Focus on realistic severity, not vivid imagination. A short register of important risks beats a bloated catalog.

### 3. Separate exposure dimensions

Consider likelihood, detectability, recoverability, and impact separately when useful. Two risks with similar impact may need different responses depending on how visible or reversible they are.

### 4. Judge controls by evidence

A documented control is not automatically an effective control. Ask whether it is owned, tested, timely, and likely to work under stress.

### 5. Recommend mitigations that change the profile

Good mitigations reduce likelihood, reduce impact, shorten detection time, or improve recovery. Meeting more often is not a mitigation unless it changes one of those.

### 6. Define triggers and residual risk

State what signal should cause escalation, rollback, pause, or contingency activation. After mitigation, show what risk remains.

## Heuristics

Prefer:
- risk statements tied to business consequences
- leading indicators over after-the-fact lagging metrics
- named owners and deadlines for mitigation actions
- directional language when exact probabilities are unjustified
- scenario-based explanation when a numeric score adds little value

Avoid:
- undifferentiated red/yellow/green theater
- mixing facts, assumptions, and hypotheticals together
- controls that exist only on paper
- mitigation plans that cost more than the exposure reduced
- pretending residual risk is zero

## Output expectations

Strong outputs usually include:
- decision context and assumptions
- top risks ranked by materiality
- current controls and control gaps
- recommended mitigations and owners
- leading indicators and escalation thresholds
- residual-risk summary and decision implications

## Adjacent skill boundaries

- **security-auditor**: application, infrastructure, access, and security-control risk as the primary domain
- **regulatory-analyst**: regulatory obligation interpretation and applicability analysis
- **financial-analyst**: downside financial modeling and scenario sensitivity
- **release-manager**: launch execution planning and operational go-live coordination

## Quality bar

A strong result should:
- identify the few risks leadership should care about first
- explain why they matter in operational or business terms
- recommend mitigations that materially reduce exposure
- specify the signals that should trigger action
- support a decision instead of slowing one down with noise

## File guide

Use `prompt.md` for risk language and answer structure.
Use `examples/README.md` for deliverable shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata and adjacent boundaries.
