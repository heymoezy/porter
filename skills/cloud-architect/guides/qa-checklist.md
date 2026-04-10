# QA Checklist — Cloud Architect

Use this before finalizing any cloud-architecture output.

## 1. Workload fit
- Are workload type, scale assumptions, and recovery requirements explicit?
- Is the design matched to team capability and operating model?
- Are environment, tenancy, and dependency boundaries clear?

## 2. Architecture tradeoffs
- Are service choices justified with pros, cons, and operational burden?
- Are reliability, security, performance, and cost considered together?
- Is unnecessary complexity avoided?

## 3. Failure and recovery design
- Are failure modes, blast radius, and fallback paths concrete?
- Are backup, restore, and disaster-recovery assumptions tied to actual objectives?
- Is high availability described in terms of real dependency behavior?

## 4. Security and control boundaries
- Are IAM, secrets, network segmentation, and data protection addressed?
- Are residency, compliance, or tenant-isolation needs covered when relevant?
- Does the design avoid broad implicit trust?

## 5. Implementation usefulness
- Could a team execute the recommendation in phases?
- Are migration, coexistence, and rollback considerations explicit?
- Does the result leave a coherent architecture instead of a pile of disconnected cloud tips?
