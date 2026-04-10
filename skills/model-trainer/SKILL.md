---
name: model-trainer
description: Train, fine-tune, and optimize machine learning or LLM systems for production use. Use when work involves dataset curation, feature or embedding pipelines, supervised training, fine-tuning, reward modeling, hyperparameter search, experiment design, training stability, checkpoint strategy, model packaging, or reproducible training workflows. Do not use for evaluation-only tasks; use model-evaluator.
---

# Model Trainer

Turn a modeling objective into a reproducible training system that can be improved, audited, and deployed safely.

## What this skill owns

Use this skill to:
- design and improve training pipelines for classical ML, deep learning, and LLM fine-tuning
- define dataset preparation, labeling assumptions, augmentation, and feature or prompt construction
- choose baselines, architectures, loss functions, and training schedules
- improve training stability, utilization, checkpointing, and experiment tracking
- plan model export, packaging, release candidates, rollback strategy, and retraining cadence
- write training plans that connect data, compute, evaluation, and deployment constraints

## What this skill does not own

Do not use this skill for:
- evaluation-only work with no training changes; use `model-evaluator`
- serving, rollout, monitoring, and lineage operations as the main task; use `ml-ops`
- broad data infrastructure design with no modeling work; use `data-engineer`
- policy review, misuse analysis, or governance as the primary job; use `ai-safety-reviewer` or `compliance-officer`

## Inputs to gather

Get clarity on:
- target decision, task framing, labels, and what the model must outperform
- data provenance, freshness, sampling, class balance, and known quality issues
- training corpus size, context limits, augmentation rules, and exclusion criteria
- compute budget, hardware topology, wall-clock limits, and experiment budget
- serving constraints: latency, memory, cost, batch size, quantization, and update cadence
- evaluation gates, rollback triggers, registry or artifact expectations, and operator ownership

## Output expectations

Return one or more of:
- reproducible training plan with data, configs, runs, and acceptance gates
- model-selection or baseline strategy with justified tradeoffs
- fine-tuning recipe for LLM or multimodal systems
- training-stability remediation plan for divergence, overfit, underfit, or data-quality issues
- experiment roadmap with priorities, hypotheses, and stop conditions
- packaging and handoff notes for downstream serving and monitoring teams

Be concrete. Name the dataset versions, split strategy, run configs, checkpoint policy, and the exact evidence required before promotion.

## Working method

### 1. Start from the deployment problem

Define:
- what task the model serves
- what incumbent baseline exists
- what constraints production imposes
- what level of improvement is worth the extra complexity

Do not train a bigger model just because you can.

### 2. Make the data contract explicit

Before training, specify:
- label definitions and ambiguity rules
- inclusion and exclusion criteria
- sampling and balancing logic
- temporal boundaries and freshness constraints
- privacy, licensing, and provenance concerns

Most training failures start in the dataset, not the optimizer.

### 3. Establish a falsifiable baseline

Begin with the simplest model or recipe that can prove whether more complexity is justified.
Track:
- exact config and seed
- data version and preprocessing hash
- feature or prompt template version
- hardware and environment assumptions
- comparable evaluation outputs

If runs are not comparable, the experiment log is storytelling.

### 4. Optimize for stability and reproducibility

Cover:
- checkpoint cadence and resume behavior
- mixed precision, gradient accumulation, and batch-size tradeoffs
- exploding/vanishing gradients or loss spikes
- early stopping and overfit detection
- experiment tracking in systems such as MLflow or Weights & Biases

A fast run you cannot reproduce is not progress.

### 5. Train with serving reality in mind

Check:
- inference latency and memory footprint
- token/context or feature availability in production
- export format and compatibility
- quantization or distillation impact
- retraining cadence and data-refresh cost

Training wins that cannot be served are dead ends.

### 6. Finish with promotion discipline

Before recommending a candidate model, define:
- eval gates and failure tolerances
- rollback trigger and fallback model
- model card or release notes expectations
- downstream schema or contract changes
- monitoring hooks for drift, quality, and cost

## Adjacent skill boundaries

- **model-evaluator**: owns benchmark rigor, ship gates, and evidence interpretation; this skill owns how to improve the model
- **ml-engineer**: owns broader ML system implementation and inference-path integration; this skill focuses on training workflow design
- **ml-ops**: owns model lifecycle operations, deployment promotion, and monitoring systems; this skill hands off reproducible candidates and requirements
- **data-engineer**: owns durable data pipelines and storage systems; this skill specifies modeling data needs and training transforms

## Quality bar

A strong result should:
- start from a clear task, baseline, and business-worthy improvement target
- make data provenance, split logic, and experiment comparability explicit
- balance quality gains against compute, latency, and operational cost
- anticipate stability issues, rollback needs, and deployment compatibility early
- leave a reproducible trail another team can rerun and verify

## Reference anchors

Use current ecosystem standards where useful:
- MLflow or Weights & Biases for experiment and artifact tracking
- framework-native best practices from PyTorch, TensorFlow, Hugging Face, XGBoost, LightGBM, or equivalent stack docs
- evaluation and registry handoff patterns that preserve lineage from dataset to promoted model

## Files in this pack

- `prompt.md` — response posture and structure
- `examples/README.md` — representative requests and output shapes
- `guides/qa-checklist.md` — final quality gate
- `meta/skill.json` — aliases, boundaries, and metadata
