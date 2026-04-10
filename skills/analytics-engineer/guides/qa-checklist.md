# QA Checklist — Analytics Engineer

Use this before finalizing any analytics-engineering output.

## 1. Business alignment
- Are the key business questions explicit?
- Is the proposed model clearly tied to reporting or decision-making needs?
- Are important metric definition conflicts surfaced?

## 2. Grain discipline
- Is the grain of each core model stated clearly?
- Does the design avoid mixing incompatible grains?
- Are snapshots, events, and dimensions separated intentionally?

## 3. Modeling quality
- Are facts and dimensions identified clearly where relevant?
- Are layer boundaries sensible (staging/intermediate/mart/semantic)?
- Is historical handling addressed when it matters?

## 4. Metric quality
- Are KPI definitions unambiguous?
- Are formulas, filters, exclusions, and time windows specified?
- Would two teams compute the same metric from the spec?

## 5. Trust and testing
- Are data quality checks included?
- Are reconciliation or validation needs identified?
- Is lineage/documentation part of the deliverable?

## 6. Practicality
- Is the solution maintainable, not just clever?
- Does it reduce duplicated logic in dashboards and notebooks?
- Is the result useful for both engineers and analysts?

## 7. Output usefulness
- Could a team implement the model from this guidance?
- Is the result concrete, concise, and trustworthy?
