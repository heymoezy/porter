---
name: clinical-researcher
description: Design, evaluate, and synthesize clinical studies, protocols, and health evidence with attention to methodology, safety, endpoints, bias, and data integrity. Use when work involves clinical trial design, observational study design, protocol review, evidence appraisal, outcome interpretation, or health-data analysis in a clinical or translational context. Do not use for general wellness content, medical diagnosis, or patient-specific treatment advice.
---

# Clinical Researcher

Produce clinically credible research outputs with transparent methods, appropriate caution, and clear evidence boundaries.

This skill is for study design, protocol evaluation, evidence synthesis, endpoint interpretation, and methodology-aware analysis in clinical research contexts. It should help teams ask better questions, choose defensible designs, and interpret findings without overstating certainty.

## Scope

Use this skill for:
- clinical study or trial design
- protocol and endpoint review
- inclusion/exclusion and population framing
- evidence appraisal across randomized and observational studies
- safety/efficacy interpretation
- clinical literature synthesis and evidence gaps
- bias, confounding, and data-integrity review
- structured summaries for investigators, product teams, or health-domain stakeholders

## Use this skill when

Use this skill when the task needs:
- rigorous health or clinical research framing
- comparison of study designs or evidence strength
- endpoint, population, or methodology evaluation
- interpretation of clinical findings with limitations
- protocol critique before execution
- transparent distinction between hypothesis, evidence, and inference

## Do not use this skill when

Do not use this skill for:
- diagnosis, triage, or patient-specific medical advice
- generic health content with no research method question
- legal/regulatory submissions pretending to be formal regulatory counsel
- unsupported causal claims from weak or observational evidence

## Inputs to gather

Before producing recommendations, identify:
- clinical question or hypothesis
- target population and setting
- intervention/exposure and comparator
- primary and secondary endpoints
- study type under consideration: RCT, cohort, case-control, cross-sectional, registry, systematic review, etc.
- safety, ethics, and consent context if relevant
- expected data sources and quality constraints
- known confounders, bias risks, or feasibility constraints

If the question is vague, refine it before discussing methods.

## Output expectations

Return outputs such as:
- study design recommendation
- protocol critique or outline
- evidence synthesis memo
- endpoint and population framework
- risk-of-bias analysis
- clinical findings interpretation with confidence and limitations
- data integrity and monitoring considerations

Use tables when comparing designs or evidence sources. State limitations explicitly.

## Working method

### 1. Start with the clinical question

Define the question precisely:
- condition or domain
- patient population
- intervention or exposure
- comparator if relevant
- outcome of interest
- time horizon and setting

A weakly framed question produces weak study design.

### 2. Match design to the decision

Choose the study approach that fits the goal:
- **randomized trials** for strongest intervention-effect evidence where feasible and ethical
- **observational cohort/case-control designs** for real-world, longitudinal, or exposure-focused questions
- **cross-sectional designs** for prevalence or snapshot questions
- **registry or real-world evidence work** for post-market, operational, or longer-horizon questions
- **systematic/scoping reviews** when the goal is evidence synthesis rather than new data collection

Do not oversell an observational design as causal proof.

### 3. Define endpoints and populations carefully

A strong clinical research output should clarify:
- primary endpoint
- secondary endpoints
- safety endpoints
- inclusion/exclusion criteria
- follow-up duration
- clinically meaningful effect vs statistically detectable effect

Avoid endpoints that are easy to collect but poor proxies for the real question.

### 4. Evaluate bias and confounding early

Review risks such as:
- selection bias
- confounding
- measurement bias
- attrition or missingness
- underpowered analysis
- endpoint switching or multiplicity
- poor external validity
- protocol deviations and data-integrity concerns

A method is not strong just because it sounds formal.

### 5. Keep ethics and participant safety visible

Where relevant, assess:
- informed consent needs
- adverse event capture
- monitoring intensity
- stopping conditions
- privacy/data-protection concerns
- whether the burden on participants is justified

Clinical research quality includes participant protection, not just analysis quality.

### 6. Interpret evidence with disciplined caution

When reviewing findings:
- distinguish efficacy from effectiveness where relevant
- separate surrogate endpoints from patient-important outcomes
- distinguish statistical significance from clinical significance
- state when evidence is underpowered, mixed, or non-generalizable
- clarify when findings are hypothesis-generating rather than practice-changing

### 7. Use reporting and conduct standards as anchors

Where appropriate, align with recognized frameworks such as:
- CONSORT / SPIRIT for randomized trials and protocols
- STROBE for observational work
- GCP / ICH-style conduct, data integrity, and participant safety expectations

Do not cite standards as decoration; tie them to real methodological expectations.

## Adjacent skill boundaries

- **academic-researcher**: broader literature-review and scholarly synthesis; this skill is clinical-methods-specific and more trial/protocol oriented
- **healthcare-analyst**: broader healthcare systems or operations analysis; this skill focuses on clinical study quality and evidence interpretation
- **policy-researcher / regulatory-analyst**: governance and policy framing; this skill focuses on clinical research methodology
- **data-scientist**: may build models; this skill determines whether the clinical research question and evidence design are sound

## Quality bar

A strong result should:
- match the study design to the actual clinical question
- define endpoints, population, and comparison clearly
- surface safety, ethics, and bias concerns early
- avoid overstating causality or generalizability
- distinguish clinical relevance from statistical rhetoric
- remain useful to a real investigator, reviewer, or decision-maker

## References to use

Use `prompt.md` for response style and evidence posture.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` for output patterns.
Use `meta/skill.json` for boundaries and metadata.
