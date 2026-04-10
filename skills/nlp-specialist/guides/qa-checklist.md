# QA Checklist — NLP Specialist

Use this before finalizing any NLP-focused output.

## 1. Task clarity
- Is the actual language task explicit?
- Is the business or operational consequence of failure clear?
- Are assumptions about inputs, outputs, and users named?

## 2. Data realism
- Did the output account for real text quality, ambiguity, and noise?
- Are representative examples or likely edge cases considered?
- If labels or taxonomy matter, are their weaknesses addressed?

## 3. Approach selection
- Is the chosen approach justified against simpler alternatives?
- Is the recommendation matched to latency, cost, and interpretability constraints?
- If using retrieval, prompting, or fine-tuning, is the rationale concrete?

## 4. Output reliability
- Is the output contract or schema explicit?
- Are validation, abstention, repair, or human-review paths defined where needed?
- Would a downstream system know how to safely consume the result?

## 5. Evaluation quality
- Are baselines included?
- Are realistic evaluation slices named?
- Are failure modes, not just aggregate metrics, part of the plan?

## 6. Production readiness
- Are privacy, security, or compliance risks surfaced where relevant?
- Are monitoring and logging tied to likely failure modes?
- Are rollout or verification steps concrete enough to execute?

## 7. Output usefulness
- Is the answer specific and decision-ready?
- Are tradeoffs explicit?
- Would a team know what to build, test, or change next?
