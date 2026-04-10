# QA Checklist — Database Administrator

Use this before finalizing any database-administration output.

## 1. Safety and correctness
- Did you protect integrity before performance?
- Are transaction, constraint, and concurrency implications addressed?
- Would the recommendation preserve correct behavior under load?

## 2. Workload awareness
- Are engine/version assumptions clear?
- Did you account for access patterns, table size, growth, and concurrency?
- Are selectivity, lock, or replication assumptions explicit?

## 3. Operational discipline
- Is there a rollback or abort path?
- Are validation and monitoring steps included?
- Are lock risk, maintenance-window needs, and blast radius explained?

## 4. Security and access
- Does the guidance follow least privilege?
- Are credential, expiration, and audit concerns covered when relevant?
- Did you avoid normalizing broad access?

## 5. Recovery posture
- Are backup and restore implications covered when relevant?
- Is restore readiness distinguished from backup existence?
- Are RPO and RTO assumptions explicit where needed?

## 6. Practicality
- Is the recommendation evidence-based rather than folklore?
- Are tradeoffs stated clearly?
- Could an operator execute the plan safely from this guidance?
