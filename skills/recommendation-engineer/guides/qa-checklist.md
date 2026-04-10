# QA Checklist — Recommendation Engineer

## 1. Problem framing
- Is the recommendation surface clearly defined?
- Are users, items, actions, and context explicit?
- Is a recommendation system justified over simple rules?

## 2. Architecture quality
- Are candidate generation, filtering, ranking, and re-ranking separated?
- Are constraints such as policy, inventory, geography, or eligibility captured?
- Is the proposed design feasible for the available data and team maturity?

## 3. Signal quality
- Are user, item, and contextual features plausible?
- Are negative feedback, saturation, and recency considered?
- Are cold-start and sparse-data cases addressed concretely?

## 4. Evaluation quality
- Do offline and online metrics match the actual product objective?
- Are guardrails included beyond engagement?
- Are success thresholds or experiment comparisons specified?

## 5. Risk handling
- Are popularity bias, position bias, and feedback loops discussed?
- Are fairness or exposure concerns surfaced where relevant?
- Are gaming or supplier-manipulation risks addressed?

## 6. Rollout quality
- Is there a baseline, fallback, or feature-flag path?
- Are monitoring signals named explicitly?
- Would an engineering or product team know how to test this safely?

## 7. Final bar
- Does the output balance relevance, business control, and operational realism?
- Does it avoid overclaiming what the available data can support?
- Would this design still make sense six months after launch, not just on day one?
