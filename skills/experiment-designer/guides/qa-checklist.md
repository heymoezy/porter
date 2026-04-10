# QA Checklist — Experiment Designer

Review every experiment-design output against this checklist before finalizing.

## 1. Decision clarity

- Is there a real decision attached to the experiment?
- Is it clear what action changes under positive, null, harmful, or inconclusive results?
- Does the test scope match the decision scope?

## 2. Causal design quality

- Is the intervention defined precisely?
- Is the causal mechanism stated clearly?
- Is the assignment unit appropriate given likely interference or spillover?

## 3. Metric discipline

- Is there one clear primary metric?
- Are secondary metrics limited and useful?
- Are guardrails tied to meaningful downside risk rather than vanity monitoring?

## 4. Instrumentation and execution

- Are exposure logging, metric definitions, and exclusions specified?
- Is there a launch QA or experiment-readiness check?
- Are timing, seasonality, or rollout constraints acknowledged?

## 5. Validity threats

- Are contamination, novelty effects, implementation bugs, and SRM risks considered?
- Is the design honest about power or traffic limits?
- Are ethics or fairness constraints addressed where relevant?

## 6. Interpretation readiness

- Are success, harm, and inconclusive outcomes defined ahead of time?
- Does the plan avoid post-hoc metric shopping?
- Will stakeholders know how to interpret a mixed result?

## 7. Writing quality

- Is the plan concrete enough to execute?
- Does it avoid fake precision and experimentation jargon for its own sake?
- Would a skeptical operator trust this design to produce usable evidence?
