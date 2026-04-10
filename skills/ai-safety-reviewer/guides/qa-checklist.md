# QA Checklist — AI Safety Reviewer

Use this before finalizing any AI safety review.

## 1. Context clarity
- Is the AI system/use case clearly defined?
- Are capabilities, tools, data access, and deployment context explicit?
- Is the relevant harm surface identified?

## 2. Risk coverage
- Did the review consider both model-level and system-level risks?
- Are hallucination, harmful output, misuse, privacy, and injection/tool risks covered where relevant?
- Are high-risk edge cases or abuse paths considered?

## 3. Severity quality
- Are risks prioritized meaningfully?
- Does each risk explain impact, likelihood, and exploit path?
- Are blockers separated from lower-priority improvements?

## 4. Testing realism
- Are proposed tests realistic for the actual product?
- Is there more than one prompt example or superficial check?
- Are multi-turn and indirect attack paths considered when relevant?

## 5. Mitigation quality
- Are mitigations concrete and system-level?
- Are brittle safeguards identified as brittle?
- Are monitoring and incident-response needs included where useful?

## 6. Governance usefulness
- Would a product or engineering team know what must change before launch?
- Is there a clear release recommendation or next-step plan?
- Are confidence and limitations made explicit?

## 7. Output quality
- Is the result practical rather than performative?
- Does it avoid vague ethics language without operational content?
- Is the review concise but complete?
