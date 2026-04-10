# QA Checklist — Fullstack Developer

Use this before finalizing any fullstack-dev output.

## 1. Scope and fit
- Are at least two layers materially complex?
- Is the coupling between layers part of the real difficulty?
- Would a specialist skill be a better fit if one layer were removed?

## 2. Cross-layer quality
- Is the user journey defined end to end?
- Are contracts, validation rules, and error semantics explicit?
- Are frontend and backend responsibilities kept clear?
- Are persistence, side effects, and state transitions handled honestly?

## 3. Safe change and rollout
- Are migration order, backward compatibility, and partial deployment risks considered?
- Are idempotency, retries, stale state, and eventual consistency addressed where relevant?
- Are observability, analytics, and audit implications considered if they matter to the flow?

## 4. Evidence and verification
- Are claims tied to actual code, schema, tests, repro steps, or behavior?
- Are unverified assumptions labeled clearly?
- Is there verification at the layers that changed, including the real user journey?

## 5. Deliverable usefulness
- Can another operator see what changed across layers and why?
- Are rollout risks, follow-ups, and ownership boundaries explicit?
- Is the result concise without hand-waving the coupling?
