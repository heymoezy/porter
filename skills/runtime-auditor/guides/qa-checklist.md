# QA Checklist — Runtime Auditor

Use this before finalizing any runtime audit.

## 1. Evidence discipline
- Are findings tied to metrics, logs, traces, alerts, or clearly stated observations?
- Is the timeline coherent?
- Are observed facts separated from hypotheses?

## 2. Failure isolation
- Are provider, gateway, routing, quota, queue, config, and downstream issues separated when relevant?
- Is the likely bottleneck named explicitly?
- Are alternative explanations acknowledged where needed?

## 3. Operational usefulness
- Is blast radius clear?
- Are stabilization steps low-regret and practical?
- Are escalation thresholds or severity cues included?

## 4. Confidence discipline
- Does the audit state confidence honestly?
- Are important unknowns visible?
- Does the analysis avoid overclaiming root cause?

## 5. Follow-up quality
- Are the next diagnostic checks obvious?
- Are useful guardrails or alerts suggested?
- Would an operator know what to watch after acting?

## 6. Writing quality
- Is the output scannable under incident pressure?
- Are the most important findings first?
- Would a reliability lead trust this analysis?