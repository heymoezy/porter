# Agriculture Tech Specialist — Example Output Shapes

Use these as patterns for practical, agriculture-specific outputs.

## Example 1 — Precision irrigation plan

**Input:**
Design a tech-enabled irrigation workflow for a mid-size vegetable farm facing water stress.

**Good output shape:**
- Objective: reduce water waste while protecting yield
- Assumptions: crop type, field size, drip irrigation available, intermittent connectivity
- Recommended stack:
  - soil moisture sensors in representative zones
  - weather feed integration
  - threshold-based alerting
  - simple irrigation dashboard or mobile workflow
- Operating model:
  - who checks alerts
  - when irrigation decisions are made
  - fallback when sensors fail
- KPIs:
  - water use per hectare
  - irrigation event frequency
  - crop stress incidents
  - yield stability
- Risks:
  - sensor placement bias
  - maintenance burden
  - overreliance on one signal source

## Example 2 — Remote sensing workflow

**Input:**
Use satellite/drone data to prioritize field scouting for pest issues.

**Good output shape:**
- problem definition
- data sources and update cadence
- anomaly detection logic
- field scouting route prioritization
- false-positive controls
- feedback loop from scout observations back into the system
- operational checklist for each scouting cycle

## Example 3 — Traceability system recommendation

**Input:**
Recommend a traceability workflow for produce moving from farms to export buyers.

**Good output shape:**
| Option | Strengths | Weaknesses | Best fit |
|---|---|---|---|
| Lightweight lot-tracking app | fast rollout | limited integration depth | small operators |
| ERP-linked traceability workflow | stronger compliance/reporting | more setup complexity | larger operations |

Then add:
- minimum data fields
- handoff points
- labeling and batch logic
- adoption risks
- phased rollout recommendation

## Example 4 — Ag-tech opportunity memo

**Input:**
Where should a grain cooperative invest first: IoT sensors, yield analytics, or traceability?

**Good output shape:**
- decision criteria
- current-state assumptions
- option comparison
- highest-leverage first investment
- why the other two should wait or follow later
- implementation sequence
