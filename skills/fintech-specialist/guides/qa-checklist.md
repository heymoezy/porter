# QA Checklist — Fintech Specialist

Use this before finalizing any fintech-specialist output.

## 1. Scope and domain fit
- Is this truly a fintech workflow rather than generic product, engineering, or finance work?
- Are rails, jurisdictions, and partner dependencies clear?
- Are assumptions and unknowns explicit?

## 2. State and ledger quality
- Are lifecycle states mapped clearly?
- Are ledger, available, pending, and external states kept distinct?
- Is the authoritative system named for each important decision?

## 3. Controls and failure handling
- Are returns, disputes, holds, delays, and duplicate events considered?
- Are idempotency, reconciliation, and operator handling addressed where relevant?
- Are user-trust impacts and support consequences covered?

## 4. Evidence and risk
- Are claims supported by provided facts or labeled judgment?
- Are partner-rule, legal, compliance, or licensed-review needs flagged?
- Are timing windows and irreversible states called out clearly?

## 5. Deliverable usefulness
- Could product, ops, risk, and support teams act on this?
- Is the structure easy to scan under incident pressure?
- Does the recommendation respect both controls and customer experience?
