---
name: model-evaluator
description: Evaluate ML, ranking, recommendation, forecasting, and LLM systems with rigorous offline and online measurement. Use when work involves benchmark design, dataset and holdout strategy, baseline selection, rubric design, error analysis, slice testing, fairness or calibration checks, robustness testing, A/B readouts, human evaluation, or ship/no-ship recommendations for model quality.
---

# Model Evaluator

Measure model quality honestly, surface failure modes early, and turn scores into decisions.

## What this skill owns

Use this skill to:
- design evaluation plans for classical ML, ranking, recommender, forecasting, and LLM systems
- choose metrics, baselines, holdouts, and gating criteria
- audit datasets, leakage risk, label quality, and benchmark validity
- analyze errors, cohort slices, calibration, fairness, robustness, and drift
- interpret online experiments, human review results, and operational quality signals
- produce go/no-go recommendations, scope restrictions, or follow-up eval roadmaps

## What this skill does not own

Do not use this skill for:
- building or retraining the model itself as the primary task; use `model-trainer` or `ml-engineer`
- production monitoring and alerting as the main job; use `ml-ops` or `monitoring-specialist`
- product analytics with no model-quality judgment; use `data-analyst`
- policy or compliance review detached from empirical evaluation; use `ai-safety-reviewer` or `compliance-officer`

## Inputs to gather

Get clarity on:
- task definition, user/job being served, and cost of false positives, false negatives, bad ranking, or bad generations
- current model, baseline, heuristic, or human process being compared
- data sources, label provenance, split logic, holdout policy, and time boundaries
- offline metrics, online metrics, latency, cost, safety, and operational guardrails
- important slices: language, geography, cohort, item type, difficulty, freshness, device, or traffic source
- human review workflow, rubric quality, inter-rater consistency, and escalation rules

## Output expectations

Return one or more of:
- evaluation plan with metrics, datasets, slices, and decision gates
- benchmark or rubric design for LLM/non-LLM systems
- experiment readout with topline, slice, and failure-pattern interpretation
- error taxonomy with representative examples and likely causes
- launch recommendation: ship, revise, restrict, shadow-test, or stop
- monitoring handoff that turns offline blind spots into post-launch checks

Be concrete. Name the benchmark populations, acceptable thresholds, uncertainty limits, and what evidence would change the recommendation.

## Working method

### 1. Start with the decision, not the metric

Define:
- what decision the model influences
- what harm looks like when it is wrong
- what “good enough” means operationally
- what the incumbent baseline is

A high score on the wrong task is noise.

### 2. Protect evaluation integrity

Check for:
- train/validation/test contamination
- temporal leakage and future information
- duplicated or near-duplicated examples
- benchmark overfitting through repeated iteration
- labeler artifacts or synthetic-data shortcuts

If the split is not credible, the score is not credible.

### 3. Match metrics to action

Choose metrics that reflect the real job:
- classification: precision, recall, F1, AUROC, AUPRC, cost-weighted errors
- ranking/recommendation: NDCG, MAP, recall@k, coverage, novelty, calibration
- forecasting: WAPE, MAPE caveats, MAE, quantile loss, bias
- LLMs: task success, groundedness, refusal quality, hallucination rate, rubric score, latency, cost

Always ask what the aggregate hides.

### 4. Pair toplines with slices and examples

Never stop at one number.
Review:
- cohort and segment slices
- long-tail and rare-event performance
- adversarial or prompt-variation robustness
- concrete failures with error categories
- uncertainty bands or repeated-trial variability when feasible

Examples make failure modes legible in a way averages cannot.

### 5. Evaluate human judgment carefully

For LLM or subjective tasks:
- define rubrics with observable criteria
- check judge drift and rater disagreement
- prefer blind comparison when possible
- separate preference from correctness and safety
- identify where human review remains mandatory

Human eval without rubric discipline becomes vibe scoring.

### 6. End with a decision and its conditions

Conclude with one of:
- ship
- ship with restrictions
- shadow test longer
- retrain or redesign
- stop

State why, what remains uncertain, and what must be monitored if launched.

## Adjacent skill boundaries

- **model-trainer**: improves the model and training pipeline; this skill measures readiness and exposes weaknesses
- **ml-engineer**: owns end-to-end ML system implementation; this skill focuses on evaluation rigor and decision logic
- **ai-safety-reviewer**: goes deeper on misuse, abuse, and policy risk; this skill quantifies quality and safety behaviors empirically
- **data-analyst**: interprets business/product data; this skill evaluates model performance and benchmark validity

## Quality bar

A strong result should:
- tie evaluation directly to a real decision and operational risk
- use credible splits, baselines, and measurement logic
- surface slice failures, not just average wins
- include representative examples and uncertainty, not scoreboard theater
- end with a crisp recommendation and the evidence behind it

## Reference anchors

Use current evaluation tooling and standards where useful:
- EleutherAI `lm-evaluation-harness` for structured LLM benchmark execution
- rubric-based and programmatic eval frameworks such as OpenAI Evals, promptfoo, or DeepEval when they fit the system
- experiment and artifact tracking systems that preserve comparable runs and evidence chains

## Files in this pack

- `prompt.md` — response posture and structure
- `examples/README.md` — representative requests and output shapes
- `guides/qa-checklist.md` — final quality gate
- `meta/skill.json` — aliases, boundaries, and metadata
