# Release Manager — Example Output Shapes

## Example 1 — Product deployment

**Input:**
Prepare the release plan for v2.4 of our billing platform.

**Good output shape:**
- scope, exclusions, and release owner
- dependency tracker covering migrations, flags, support prep, and analytics
- preflight checklist with clear go/no-go conditions
- deployment sequence by environment and timing
- rollback path with named owner and stop triggers
- post-release verification using dashboards and transaction checks

## Example 2 — Multi-team launch

**Input:**
Coordinate launch of a new help center, email campaign, and in-app announcement.

**Good output shape:**
- launch calendar and milestone gates
- content, approvals, and audience segmentation dependencies
- communications plan by internal and external audience
- contingency actions if one asset misses readiness
- support enablement and post-launch monitoring

## Example 3 — High-risk infrastructure change

**Input:**
Plan release of a database migration that affects checkout.

**Good output shape:**
- explicit blast-radius statement
- migration prerequisites and rollback constraints
- canary or staged rollout logic
- stop conditions and escalation contacts
- success verification using error rate, latency, and order-completion checks
