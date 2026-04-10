# QA Checklist — Service Level Monitor

Use this before finalizing any service-level deliverable.

## 1. Definition integrity
- Is the SLA/SLO target stated precisely?
- Are scope, window, clocks, and exclusions clear?
- Is the distinction between contractual and internal targets explicit?

## 2. Measurement quality
- Is current performance compared to the target, not just recent history?
- Are percentiles, error rates, queue clocks, or availability windows used appropriately?
- Are data-quality caveats stated when relevant?

## 3. Breach foresight
- Does the analysis surface burn-rate or near-breach risk early?
- Are sustained degradations separated from isolated spikes?
- Are leading indicators or watch conditions included?

## 4. Actionability
- Does the summary imply clear action?
- Are escalation and communication triggers specified?
- Would an operator, manager, or customer owner know what to do next?

## 5. Trustworthiness
- Is the reporting transparent and non-evasive?
- Does it avoid misleading averages or selective windows?
- Would a customer or exec trust the summary?

## 6. Writing quality
- Is the conclusion obvious quickly?
- Are service commitments understandable in plain language?
- Is the output concise enough for real operational use?
