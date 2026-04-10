# Prototype Builder — Example Output Shapes

## Example 1 — Clickable prototype for workflow learning

**Input:**
Create a prototype for an AI meeting-prep assistant so we can test it with sales reps next week.

**Good output shape:**
- decision to inform: whether reps understand and trust the prep flow
- recommended artifact: clickable prototype with one end-to-end prep journey
- realistic customer/account sample data
- in-scope: upload brief, generate prep, adjust talking points
- out-of-scope: CRM sync, permissions, team analytics
- moderated test script
- success criteria tied to comprehension, trust, and task completion
- next step if signal is positive

## Example 2 — Wizard-of-Oz AI concept test

**Input:**
Prototype an AI concierge that routes urgent legal requests to the right specialist.

**Good output shape:**
- primary uncertainty: whether intake questions capture enough context and feel trustworthy
- prototype type: Wizard-of-Oz, with human routing behind the scenes
- operator playbook for the hidden human step
- user-facing flow and expected response timings
- guardrails to keep the manual simulation consistent
- test success and failure signals
- explicit warning not to treat operator performance as automation readiness

## Example 3 — Technical feasibility spike

**Input:**
Figure out whether we can summarize 90-minute support calls within 30 seconds and acceptable cost.

**Good output shape:**
- feasibility question and thresholds
- thin spike design with representative inputs
- metrics to capture: latency, failure rate, output quality, cost
- test matrix for transcript size and model settings
- stop / continue criteria
- recommendation on whether to proceed to a user-facing prototype
