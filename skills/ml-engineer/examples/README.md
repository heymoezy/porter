# ML Engineer — Example Output Shapes

## Example 1 — Churn prediction system

**Input:**
Design a churn model for a B2B SaaS product.

**Good output shape:**
- intervention the score should trigger
- prediction window and label definition
- baseline rules to beat
- candidate features and leakage risks
- evaluation metrics and threshold policy
- rollout plan with monitoring

## Example 2 — Model-family decision

**Input:**
Should we use gradient boosting or deep learning for structured fraud detection?

**Good output shape:**
| Option | Best when | Strengths | Risks | Recommendation |
|---|---|---|---|---|
| gradient boosting | medium-scale tabular data | strong baseline, fast iteration | limited representation power | start here |
| deep model | very high scale or rich sequential signals | can learn richer patterns | heavier ops burden, tuning complexity | use only with evidence |

## Example 3 — Offline strong, online weak

**Input:**
Our model has good AUC offline but no business lift in production.

**Good output shape:**
- likely causes ranked by probability
- signals to inspect for each cause
- fastest validation experiments
- threshold or workflow changes
- monitoring additions to prevent recurrence
