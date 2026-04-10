# QA Checklist — ML Engineer

- Problem framing is tied to a real decision, intervention, or workflow change.
- A no-model or heuristic baseline is defined and used as the comparison anchor.
- Label quality, leakage, skew, freshness, and serving-time feature availability are addressed.
- Evaluation metrics match operating tradeoffs, not just generic leaderboard habits.
- Inference design covers latency, thresholding, fallback behavior, and failure handling.
- Online validation, rollout guardrails, and rollback conditions are specified when production use is implied.
- Output is concrete, production-oriented, and connected to business impact.
