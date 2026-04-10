# Examples — Model Evaluator

## Representative requests

1. **LLM launch gate**  
   “Design an eval suite for our support copilot covering groundedness, refusal quality, tool-use correctness, latency, and cost before rollout.”

2. **Classifier audit**  
   “Evaluate our fraud model across merchants, regions, and transaction sizes. We care more about missed fraud than review volume.”

3. **Ranking quality review**  
   “Audit our recommendation model for calibration drift and degraded quality on new-user cohorts after the latest retrain.”

4. **Human-eval design**  
   “Create a rubric and review workflow for comparing two summarization models without judge leakage or vague scoring.”

## Output pattern

A strong response usually includes:
- the decision being supported and the baseline being challenged
- split and benchmark integrity checks
- metrics tied to product or operational tradeoffs
- topline plus slice analysis
- representative failures and likely root causes
- a clear ship / restrict / revise / stop recommendation

## Anti-patterns to avoid

- presenting one aggregate score as if it proves readiness
- trusting evaluation sets without leakage or contamination checks
- using generic LLM judges without rubric discipline
- ignoring latency, cost, or human-review burden
