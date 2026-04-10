# Project Operator — Example Output Shapes

## Example 1 — Weekly delivery update

**Input:**
Create a useful weekly update format for this feature launch.

**Good output shape:**
- Goal for this week
- Progress by workstream/owner
- Blockers needing help
- Decisions pending
- Next 5 actions with owners and dates
- Launch risk level

## Example 2 — Meeting readout

**Input:**
Turn these messy notes into an execution readout.

**Good output shape:**
| Type | Item | Owner | Due / Next review |
|---|---|---|---|
| Decision | launch slips one week pending security review | PM | confirmed today |
| Action | finalize onboarding copy | Jane | Thu |
| Blocker | vendor API rate limit unclear | Dev lead | escalate Wed |

## Example 3 — Blocker log

**Input:**
What’s the right blocker format for a migration project?

**Good output shape:**
- blocker
- impact
- owner
- dependent work
- next escalation trigger
- target resolution date

## Example 4 — Launch runbook

**Input:**
Create a lightweight runbook for release day.

**Good output shape:**
- pre-launch checks
- owner by step
- go / no-go decision point
- communication steps
- rollback or contingency notes
- first 24-hour monitoring actions
