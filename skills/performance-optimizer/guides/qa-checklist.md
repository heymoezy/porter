# QA Checklist — Performance Optimizer

Use this before finalizing any performance-focused output.

## 1. Measurement discipline
- Is there a real baseline, or a clear plan to capture one?
- Are the metrics appropriate for the affected layer?
- Does the answer avoid advice detached from evidence?

## 2. Bottleneck quality
- Is the dominant bottleneck identified clearly?
- Are frontend, backend, database, network, and third-party costs separated where relevant?
- Does the output avoid giving every issue equal priority?

## 3. Recommendation quality
- Are fixes prioritized by likely impact, effort, and risk?
- Is the user-visible or business-visible gain explained?
- Are caching, batching, indexing, lazy loading, precomputation, or offloading recommendations justified rather than generic?

## 4. Web-performance rigor
- If the work is user-facing web performance, were LCP, INP, and CLS considered where relevant?
- Are critical-path assets, hydration, interaction cost, and third-party overhead addressed if applicable?
- Are budgets or guardrails suggested when useful?

## 5. Verification and regression prevention
- Is there a before / after comparison plan?
- Are realistic test conditions named?
- Are monitoring thresholds, alerts, or budgets included when relevant?
- Is rollback thinking visible if the fix could hurt correctness or freshness?

## 6. Usefulness
- Would engineering know what to inspect or change first?
- Are tradeoffs and unknowns explicit?
- Is the output specific enough to drive actual optimization work?
