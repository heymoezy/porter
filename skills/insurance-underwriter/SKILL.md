---
name: insurance-underwriter
description: Evaluate insurance submissions, exposure quality, control effectiveness, coverage fit, pricing posture, and underwriting rationale for personal or commercial risks. Use when the main task is deciding whether a risk fits appetite, what terms or conditions are needed, what missing information matters, how to compare applicants, or how to draft a disciplined underwriting memo. Do not use for actuarial reserving, legal coverage interpretation, claims handling, or general financial analysis detached from underwriting decisions.
---

# Insurance Underwriter

Turn exposure detail into a defensible risk decision.

This skill owns underwriting judgment: identifying what drives loss potential, separating known facts from missing information, assessing control quality, comparing risk to appetite, and translating all of that into a decision posture such as quote, condition, refer, reprice, or decline. It should trigger when the task is not just summarizing an applicant but deciding how the risk should be treated.

## Use this skill for

- screening insurance submissions
- identifying material exposures and control gaps
- comparing applicants or renewal accounts
- drafting underwriting memos and referral notes
- explaining acceptance, declination, or conditional quote logic
- assessing coverage fit versus exposure profile
- flagging adverse selection, aggregation, or concentration concerns
- defining information requests needed before binding

## Do not use this skill for

- actuarial pricing model development, reserving, or capital modeling
- legal policy interpretation, coverage litigation, or regulatory advice
- claims investigation or claims negotiation
- generic business risk analysis without an underwriting decision context
- compliance-only review detached from risk acceptance decisions

## Routing rules

Route here when the main difficulty is deciding:
- whether the risk fits appetite
- what exposures are truly material
- whether controls meaningfully change expected loss quality
- how to treat thin, inconsistent, or suspicious submission data
- whether to accept, refer, restrict, reprice, or decline
- what subjectivities, deductibles, exclusions, or limits should be considered

Do not route here merely because the topic involves insurance. If the real problem is claims, legal interpretation, or actuarial modeling, use the more specific skill.

## Inputs to gather

Before making a recommendation, identify:
- line of business and requested coverage
- applicant operations, geography, revenue/payroll/units, and exposure basis
- prior losses: frequency, severity, recency, and causation
- controls, safeguards, training, and management quality
- occupancy/process/technology characteristics relevant to the class
- concentration or catastrophe exposure where relevant
- broker narrative and how complete or credible the submission appears
- requested limits, deductibles, endorsements, and special terms
- portfolio/appetite constraints and referral triggers

If the submission is incomplete, say exactly what is missing and why it matters.

## Output expectations

Return outputs such as:
- underwriting summary or memo
- key exposure and control assessment
- appetite fit assessment
- decision posture: quote, condition, refer, reprice, or decline
- rationale for terms, deductibles, limits, exclusions, or subjectivities
- list of required additional information
- comparison across applicants or renewal scenarios
- clear assumptions, caveats, and escalation flags

## Working method

### 1. Define the risk class and decision context
Clarify:
- new business, renewal, endorsement, or exception request
- line(s) of coverage involved
- requested terms versus standard appetite
- whether the task is triage, full assessment, or referral support

Underwriting logic depends on the exact decision being made.

### 2. Separate facts, missing data, and broker framing
Distinguish:
- verified exposure facts
- claimed controls not yet evidenced
- narrative spin from measurable indicators
- material unknowns that change the loss view

Do not reward incomplete submissions with optimistic assumptions.

### 3. Assess exposure through frequency, severity, and volatility
Evaluate:
- what causes losses in this class
- likely frequency drivers
- potential severity drivers
- concentration/aggregation exposure
- tail-risk or shock-loss scenarios
- whether recent controls genuinely change the profile

A good underwriting view explains both expected losses and ugly-loss potential.

### 4. Judge control quality and management credibility
Look for:
- prevention controls
- detection/monitoring controls
- incident response or continuity readiness
- training and enforcement discipline
- maintenance, housekeeping, or vendor oversight
- signs that controls exist on paper but not in operation

Controls matter only if they are credible and consistently executed.

### 5. Translate risk into a decision posture
Be explicit about whether the account should be:
- **quoted as-is**
- **quoted with conditions/subjectivities**
- **repriced or restricted**
- **referred for higher authority or specialist review**
- **declined**

Tie the decision to appetite, exposure, controls, and uncertainty.

### 6. Explain terms and information requests precisely
If recommending conditions, state:
- what additional information is required
- what must be improved before bind
- what limits, deductibles, exclusions, or warranties should be considered
- what specialist review is needed
- what would change the decision materially

Make the memo auditable and easy for the next underwriter to follow.

## Heuristics

Prefer:
- explicit exposure/control reasoning
- disciplined treatment of missing information
- appetite-first judgment
- practical subjectivities tied to real risk reduction
- comparison against similar risks when useful
- language that distinguishes observed facts from assumptions

Avoid:
- false precision on pricing with thin data
- confusing good storytelling with good risk
- overlooking adverse selection signals
- mixing claims, legal, and actuarial logic into one blurry answer
- vague “high risk / low risk” labels without drivers
- recommending terms that are not connected to the exposure profile

## Adjacent skill boundaries

- **financial-analyst**: business performance and forecasting, not underwriting decisions
- **risk-assessor**: broader enterprise risk framing outside insurer acceptance/pricing logic
- **compliance-officer**: regulatory/control adherence where underwriting acceptance is not central
- **contract-reviewer**: policy wording or contract language analysis
- **legal-researcher**: legal/regulatory interpretation

## Quick routing examples

Use **insurance-underwriter** for:
- deciding whether a cyber submission should be quoted with controls-based conditions
- comparing two commercial property applicants for account quality
- drafting an underwriting memo for a renewal with worsening loss trends
- identifying the key missing information before a property or casualty account can be bound

Do not use **insurance-underwriter** for:
- setting actuarial indications or reserve assumptions
- analyzing a disputed claim after a loss has occurred
- interpreting policy wording for litigation risk

## Quality bar

A strong result should:
- identify the material exposures and credible controls
- separate facts from gaps and assumptions
- state a clear underwriting posture
- connect terms and pricing posture to actual risk drivers
- leave an auditable rationale another underwriter can follow

## Use with

- `prompt.md`
- `examples/README.md`
- `guides/qa-checklist.md`
- `meta/skill.json`
