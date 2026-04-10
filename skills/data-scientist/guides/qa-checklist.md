# QA Checklist — Data Scientist

Use this before finalizing any data-science output.

## 1. Decision framing
- Is the actual business or operational decision explicit?
- Are the target outcome, unit of analysis, and time window defined?
- Did you state what success or inconclusive results would mean?

## 2. Data realism
- Did you surface missingness, coverage, leakage, or label-quality risks?
- Does validation timing match real deployment conditions?
- Are important assumptions and blind spots explicit?

## 3. Method discipline
- Is there a credible baseline?
- Is the method justified relative to complexity, interpretability, and risk?
- Did you separate descriptive, predictive, and causal claims correctly?

## 4. Evaluation quality
- Do the metrics map to the decision the business must make?
- Are threshold tradeoffs, calibration, or segment failures addressed when relevant?
- Did you avoid over-relying on a single abstract metric?

## 5. Communication quality
- Are facts separated from interpretation and recommendation?
- Are uncertainty and limitations stated plainly?
- Could a non-specialist understand the practical implication?

## 6. Actionability
- Does the output end with a clear recommendation or next experiment?
- Is it clear what additional data or validation is needed?
- Could a team act from this guidance without guessing what comes next?
