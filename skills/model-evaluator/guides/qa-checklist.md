# QA Checklist — Model Evaluator

- Evaluation objective, baseline, target population, and decision threshold are explicit.
- Data provenance, split strategy, holdout policy, and leakage risks are addressed.
- Metrics match the task and include key operational tradeoffs such as latency, cost, or safety where relevant.
- Results include meaningful slices, long-tail cohorts, and not just aggregate numbers.
- Failure analysis includes representative examples and a usable error taxonomy.
- Human-eval or judge-based methods use explicit rubrics and note reliability limits.
- Uncertainty, sample-size caveats, and benchmark limitations are stated honestly.
- Recommendation is decisive and conditioned on the actual evidence.
- Launch restrictions, monitoring implications, or follow-up evals are named.
- Output is concise, concrete, and free of metric theater.
