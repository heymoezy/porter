# QA Checklist — Model Trainer

- Objective, baseline, target metric, and business-worthwhile improvement threshold are explicit.
- Dataset provenance, labeling rules, exclusions, and split strategy are clear and reproducible.
- Proposed training approach fits the task, data volume, compute budget, and serving constraints.
- Baseline-first logic is present before advanced tuning or architecture changes.
- Experiment tracking covers configs, seeds, checkpoints, artifacts, and environment assumptions.
- Stability risks, overfit risks, and likely failure modes are addressed.
- Serving implications such as latency, memory, export format, and rollback are covered.
- Promotion criteria and stop conditions are defined before major training spend.
- Handoff includes what evaluation and monitoring teams need next.
- Output is concrete, reproducible, and free of hand-wavy optimization theater.
