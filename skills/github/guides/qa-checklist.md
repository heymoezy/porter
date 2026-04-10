# QA Checklist — GitHub

## 1. State accuracy
- Did you verify the repo, branch, PR number, base/head, and current metadata?
- Are facts clearly separated from recommendations?

## 2. Review and protection logic
- Did you account for approvals, requested reviewers, CODEOWNERS, and branch protection when relevant?
- Did you distinguish merge blockers from optional cleanup?

## 3. Check interpretation
- Did you identify which failing checks are truly blocking?
- Did you call out stale, flaky, optional, or unrelated failures separately?

## 4. Signal quality
- Did you summarize the important changes instead of dumping the full diff?
- Are the highest-risk files, checks, or decisions obvious?

## 5. Decision usefulness
- Is there a clear verdict, diagnosis, or recommended next action?
- Could a maintainer act immediately after reading it?

## 6. Scope discipline
- Did you stay in GitHub/repo-operations scope instead of drifting into coding or broad issue-program management?

## 7. Finish quality
- Is the output concise, current, and easy to scan?
- Does it reduce coordination friction rather than add noise?
