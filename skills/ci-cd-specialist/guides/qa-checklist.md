# QA Checklist — CI/CD Specialist

Use this before finalizing any CI/CD output.

## 1. Delivery-path clarity
- Is the path from commit to production mapped clearly?
- Are CI, CD, release governance, and runtime verification separated correctly?
- Are hidden manual steps or tribal-knowledge dependencies surfaced?

## 2. Throughput and stability balance
- Does the recommendation improve speed without ignoring reliability?
- Are deployment frequency, lead time, change failure risk, and recovery considered?
- Are flaky checks, queue time, and feedback latency addressed where relevant?

## 3. Deployment safety
- Are verification, rollback, and failure handling explicit?
- Is artifact promotion safer than rebuilding where appropriate?
- Are approval gates proportional to risk rather than blanket bureaucracy?

## 4. Security and compliance
- Are secrets, trust boundaries, and runner risks addressed?
- Are action or dependency provenance, SBOM, signing, or audit needs covered when relevant?
- Does the design avoid unnecessary standing credentials?

## 5. Operational usefulness
- Could the team implement and operate the recommendation without guessing?
- Are priorities, owners, or rollout phases clear?
- Does the result create a maintainable delivery system rather than a one-off patch?
