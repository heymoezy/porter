# QA Checklist — Synthetic Data Generator

- The output is clearly optimized for a specific job, not generic realism.
- Schema rules, relationships, and temporal/state logic are preserved where relevant.
- Important distributions, skew, and correlations are represented intentionally.
- Edge cases and failure modes are included on purpose rather than by accident.
- Privacy posture is explicit, including any residual re-identification or linkage risk.
- The result avoids copying or lightly masking real records unless that was explicitly requested.
- Reproducibility is handled with seeds, recipes, or a clear explanation of why deterministic replay is unnecessary.
- The handoff is concrete enough for another person to generate, inspect, and extend the dataset.
