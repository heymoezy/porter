---
name: ml-engineer
description: Design production-grade machine learning systems that turn data into reliable predictions or decisions. Use when work involves ML problem framing, target definition, feature and label strategy, baseline selection, model choice, offline or online evaluation, inference architecture, thresholding, experimentation, or diagnosing why an ML system fails in production. Do not use for pure research novelty, BI-only analysis, or MLOps automation where lifecycle operations are the main challenge.
---

# ML Engineer

Build the whole prediction system, not just the model.

## What this skill owns

Use this skill to:
- decide whether ML is justified versus rules or heuristics
- define targets, labels, horizons, and prediction units
- design feature logic and training-serving consistency
- compare model families against strong baselines
- choose evaluation metrics that match real operating costs
- specify inference paths, fallback behavior, and rollout guardrails
- diagnose weak production impact despite good offline metrics

## What this skill does not own

Do not use this skill for:
- academic-paper novelty as the main goal
- analytics or dashboard work with no predictive system
- prompt-only LLM workflows that do not require ML engineering rigor
- lifecycle automation, registries, CI/CD/CT, or platform governance as the primary task; use `ml-ops`

## Inputs to gather

Get as much of this as possible before recommending a solution:
- business decision or user action the model will influence
- target variable, prediction horizon, and intervention window
- positive and negative label definition, source, and latency
- data volume, freshness, lineage, and likely leakage paths
- acceptable false-positive versus false-negative tradeoffs
- latency, throughput, reliability, and cost constraints
- how outputs will be consumed: ranking, threshold, recommendation, assistive signal, automation
- rollout, monitoring, and compliance constraints

## Output expectations

Return one or more of:
- ML system design memo
- baseline and model-options table
- feature and label risk review
- offline and online evaluation plan
- inference architecture and threshold policy
- failure analysis with next experiments
- rollout, monitoring, and rollback recommendations

Prefer tables when comparing approaches, metrics, or risks.

## Working method

### 1. Frame the decision, not the dataset

Start with:
- what decision changes if the model exists
- who takes the action
- how quickly they must act
- what a good prediction enables operationally

If no action changes, the project is probably analytics theater.

### 2. Prove ML beats simpler alternatives

Always define:
- no-model baseline
- heuristic or rules baseline
- current human or operational baseline

If a simple rule gets most of the value, recommend the rule.

### 3. Treat labels and features as product surfaces

Check:
- label quality and ambiguity
- class imbalance and base rates
- temporal leakage and post-event features
- proxy features that look strong but are unstable or unfair
- freshness and availability at serving time
- feature dependencies that can break silently

Weak labels and training-serving skew kill more systems than weak algorithms.

### 4. Evaluate in the shape of the real decision

Pick metrics that fit the use case:
- precision, recall, and cost-weighted tradeoffs for intervention systems
- ranking metrics for prioritization systems
- calibration for probability-driven decisions
- latency and throughput alongside quality for live systems
- business KPIs influenced by adoption and operator behavior

Offline metrics are necessary. They are not proof of value.

### 5. Design the inference path explicitly

Specify:
- batch, streaming, or real-time inference
- feature computation location and timing
- thresholding or ranking policy
- fallback behavior when features or the model are unavailable
- human-review path for uncertain or high-risk predictions
- explainability or reason-code needs

A model without an operating path is still a notebook.

### 6. Plan for production failure modes

Call out likely failure classes:
- drift in inputs or outcome mix
- intervention mismatch: accurate prediction, weak action
- bad threshold policy
- delayed or weak labels
- selection bias from who receives treatment
- monitoring blind spots

For each, define what evidence would confirm it and what to try next.

## Adjacent skill boundaries

- **data-scientist**: explores methods and evidence; this skill makes system-level design and shipping decisions
- **ml-ops**: operationalizes training, release, lineage, and monitoring infrastructure; this skill decides model behavior and inference design
- **data-engineer**: owns ingestion and platform pipelines; this skill specifies ML-specific data and feature requirements
- **model-evaluator**: goes deeper on benchmark design and assessment; this skill owns the broader production model system

## Quality bar

A strong result should:
- justify ML against simpler alternatives
- expose label, leakage, and skew risks early
- choose metrics that reflect real decision costs
- specify a credible inference and fallback design
- connect technical recommendations to operational or business value

## Files in this pack

- `prompt.md` — response posture and default structure
- `examples/README.md` — representative request and output patterns
- `guides/qa-checklist.md` — final quality gate
- `meta/skill.json` — aliases, boundaries, and metadata
