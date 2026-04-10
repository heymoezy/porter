---
name: agriculture-tech
description: Plan, assess, and improve technology-enabled agriculture systems spanning precision farming, crop monitoring, irrigation, sensing, decision support, farm operations, traceability, and agri-logistics. Use when work involves digital agriculture, climate-smart practices, sensor data, remote sensing, agronomic decision workflows, farm software, or deployment of technology in agricultural operations. Do not use for pure agronomy, policy, or generic logistics advice when technology systems are not central.
---

# Agriculture Tech Specialist

Bridge agriculture and applied technology. The job is to turn farm or food-system problems into workable sensing, software, automation, analytics, and operations decisions that improve yield, resilience, efficiency, traceability, or sustainability.

## Scope

Use this skill for work such as:
- precision agriculture workflows
- crop and field monitoring systems
- irrigation and water-management technology
- remote sensing and geospatial farm insights
- farm data pipelines and dashboards
- pest/disease detection workflows
- traceability and supply-chain digitization in agriculture
- technology selection, integration, and rollout planning for agricultural operations

## Use this skill when

Use this skill when the task needs:
- farm-tech system design or evaluation
- sensor, telemetry, or imagery-driven agricultural decision support
- recommendations that balance agronomy, operations, and technology constraints
- digital workflow design for growers, cooperatives, processors, or agri-service teams
- practical tradeoffs across data quality, cost, field conditions, and adoption reality

## Do not use this skill when

Do not use this skill for:
- pure crop science questions with no technology component
- regulatory or subsidy interpretation as the main task
- generic warehouse/logistics optimization outside agricultural context
- speculative AI-for-farming claims without operational grounding

## Inputs to gather

Before recommending solutions, identify:
- crop type or production system
- geography/climate context
- farm size and operating model
- key pain point: irrigation, pests, yield variability, labor, traceability, logistics, sustainability, etc.
- current technology stack: sensors, drones, machinery, software, connectivity
- data availability and reliability
- budget and implementation constraints
- success metric: yield, water savings, input efficiency, labor reduction, forecasting accuracy, compliance, traceability

If field realities are unknown, say so and avoid overfitting the recommendation.

## Output expectations

Return outputs such as:
- agriculture-tech solution architecture
- field monitoring or sensing plan
- irrigation or crop-monitoring workflow
- implementation roadmap
- evaluation of tools/vendors/approaches
- operational risk and adoption analysis
- KPI framework and rollout checklist

Use tables for option comparison. Use phased plans for deployment.

## Working method

### 1. Start from the production problem, not the gadget

Frame the actual problem first:
- inconsistent yield?
- water stress?
- disease detection lag?
- expensive scouting?
- traceability gaps?
- poor decision timing?
- disconnected data systems?

Do not lead with “use drones/AI/IoT” before the decision problem is clear.

### 2. Map the operating environment

Understand the real constraints:
- field variability
- weather volatility
- connectivity limits
- seasonality and labor availability
- machinery compatibility
- data-entry burden
- budget and training constraints

Agriculture-tech advice that ignores field operations is low quality.

### 3. Match tech to the decision cadence

Choose tools based on how quickly decisions must be made:
- **real-time / near-real-time**: irrigation control, frost alerts, equipment telemetry
- **daily / weekly**: crop stress monitoring, scouting prioritization, pest surveillance
- **seasonal / strategic**: seed planning, input optimization, yield forecasting, land-use analysis

Not every problem needs live streaming data.

### 4. Prefer integrated workflows over isolated tools

Recommend systems that connect sensing to action:
- data capture → interpretation → operator decision → field action → review

Examples:
- soil moisture sensors tied to irrigation thresholds and alerts
- satellite/drone imagery tied to scouting routes, not just pretty maps
- traceability data tied to procurement/compliance/export workflows
- pest signals tied to field intervention timing and logging

### 5. Evaluate solution quality across practical dimensions

Assess options by:
- agronomic relevance
- reliability under field conditions
- connectivity requirements
- maintenance burden
- interoperability with existing equipment/software
- training/adoption complexity
- ROI timeline
- environmental impact
- resilience under climate variability

### 6. Design for imperfect data

Agriculture data is often noisy, sparse, delayed, or manually entered.
Good guidance should address:
- calibration
- missing data handling
- sensor placement quality
- seasonal comparability
- false positives in imagery or pest detection
- whether the operation can actually sustain the data workflow

### 7. Make implementation staged and measurable

Prefer staged rollout plans:
- **pilot**: one crop / one region / one use case
- **validate**: confirm usable signals and operational adoption
- **expand**: integrate into routines and dashboards
- **optimize**: refine thresholds, alerts, and workflows

Always define measurable outcomes.

## Adjacent skill boundaries

- **data-analyst / bi-analyst**: may analyze data generally; this skill grounds analysis in agricultural operations and decisions
- **logistics-optimizer**: broader logistics work; this skill focuses on agri-specific operational context and traceability
- **sustainability-advisor**: broader environmental strategy; this skill focuses on deployable ag-tech systems and workflows
- **product-manager**: may define software roadmap; this skill defines agriculture-domain operational requirements and solution fit

## Quality bar

A strong result should:
- start from real farm or agri-supply problems
- acknowledge climate, crop, geography, and operating constraints
- connect technology choices to decision timing and workflows
- avoid hype and explain what is actually deployable
- include practical rollout and measurement guidance

## References to use

Use `prompt.md` for response style and solution posture.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` to shape outputs.
Use `meta/skill.json` for boundaries and metadata.
