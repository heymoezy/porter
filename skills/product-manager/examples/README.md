# Product Manager — Example Output Shapes

## Example 1 — V1 scope memo
**Input:** We should add customer analytics. What belongs in v1?

**Good output shape:**
- decision to make now
- target user and core job
- problem evidence and business reason now
- recommended V1 capabilities
- explicit non-goals / later-phase ideas
- success metric + guardrails
- top risks and next validation step

## Example 2 — Prioritization decision
**Input:** Choose between onboarding cleanup, referrals, and a new admin dashboard.

**Good output shape:**
| Option | User problem severity | Business upside | Confidence | Effort / dependency | Recommendation |
|---|---|---|---|---|---|
| Onboarding cleanup | High | High | Medium | Medium | Do now |
| Referrals | Medium | Medium | Low | Medium | Validate first |
| Admin dashboard | Low | Low | High | Low | Defer |

Then add:
- why the winner wins now
- what is being postponed and the cost of waiting
- what signal would change the ranking

## Example 3 — Product brief
**Input:** Draft a one-page brief for a shared team inbox.

**Good output shape:**
- objective
- user and pain statement
- constraints / assumptions
- in-scope workflows
- non-goals
- acceptance criteria
- metrics
- launch blockers

## Example 4 — Launch recommendation
**Input:** Are we ready to release the new pricing page?

**Good output shape:**
- recommendation: go / no-go / conditional
- strongest evidence for readiness
- unresolved risks by severity
- monitoring plan for first week
- exact blocker list if launch is conditional or no-go
