# Operations Manager — Example Output Shapes

Use these as patterns for operations-focused outputs.

## Example 1 — Queue and escalation redesign

**Input:**
Our support and implementation requests sit in one queue. Urgent issues get buried and escalations are inconsistent.

**Good output shape:**
| Stage | Owner | Entry criteria | Target time | Escalation trigger | Fallback |
|---|---|---|---|---|---|
| Intake | ops coordinator | request submitted | immediate | missing required fields | return to requester with template |
| Triage | queue lead | valid request | 30 min | severity unclear | duty manager review |
| Assignment | team lead | tagged request | 15 min | no qualified owner | overflow pool |
| Resolution | assigned specialist | full context present | by priority tier | blocked > 4 hrs | escalate to functional lead |
| QA / close | QA owner | work completed | same day | defect found | reopen and retrain if pattern repeats |

Then add:
- top failure modes today
- proposed severity definitions
- KPI cadence for backlog age, first response, and breach rate

## Example 2 — SOP / runbook pack

**Input:**
Create an SOP for handling supplier onboarding requests across procurement, finance, and compliance.

**Good output shape:**
- Purpose and scope
- Request types and required inputs
- Intake and triage rules
- Step-by-step workflow by owner
- Approval / escalation thresholds
- Definition of done
- Exceptions and fallback path
- Weekly metrics and review owner

## Example 3 — KPI and review rhythm

**Input:**
What should our revenue operations team track every week?

**Good output shape:**
| KPI | Why it matters | Owner | Review rhythm | Threshold | Action if off target |
|---|---|---|---|---|---|
| Lead routing time | speed from inbound to seller action | revops manager | daily | > 30 min | inspect routing rules and staffing |
| SLA attainment | service reliability | team lead | weekly | < 95% | review breach root causes |
| Rework rate | quality leakage | QA owner | weekly | > 8% | tighten checklist and retrain |
| Backlog age > 7 days | stuck work | queue owner | daily | any critical item | rebalance assignments |

## Example 4 — Lightweight operating model

**Input:**
We need a simple operating model for a 6-person customer operations team.

**Good output shape:**
- service promise and work lanes
- role ownership and decision rights
- daily / weekly / monthly operating rhythm
- queue rules and escalation path
- staffing assumptions and coverage windows
- first 30-day rollout plan
