# Project Architect — Example Output Shapes

## Example 1 — New initiative structure
**Input:** We need to launch a customer-facing analytics feature but the work feels huge.

**Good output shape:**
- primary objective
- in-scope vs out-of-scope for phase 1
- workstreams and owners
- sequence of phases with entry / exit conditions
- critical dependencies and top risks
- next 3 actions

## Example 2 — Migration decomposition
**Input:** Break this platform migration into executable stages.

**Good output shape:**
| Phase | Objective | Critical dependency | Exit condition |
|---|---|---|---|
| 0 | inventory and success criteria | stakeholder access | migration map approved |
| 1 | foundation / environment readiness | infra + data prerequisites | pilot environment ready |
| 2 | pilot migration | phase 1 complete | first workload proven |
| 3 | scaled rollout | pilot success | majority of critical workloads moved |
| 4 | cleanup / retirement | rollout stability | legacy path decommissioned |

## Example 3 — Ownership-lane map
**Input:** Split this initiative into clean owner lanes.

**Good output shape:**
- lane name
- primary owner
- outputs
- inbound dependencies
- outbound handoffs
- decision points

## Example 4 — Pre-build blocker analysis
**Input:** What can sink this project before engineering even starts?

**Good output shape:**
- blocker
- why it matters now
- evidence / confidence
- mitigation or validation step
- whether it should block phase 1
