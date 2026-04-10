---
name: privacy-specialist
description: Assess privacy risk, data handling, consent and notice design, retention, data-sharing practices, rights operations, vendor exposure, and privacy-by-design controls for products, features, workflows, and third parties. Use when the task involves personal data mapping, minimization, purpose limitation, retention discipline, DPIA-style review, user expectation analysis, or practical privacy guidance for launches and operations. Do not use for formal legal opinions, jurisdiction-specific final sign-off, or pure security engineering as the primary task.
---

# Privacy Specialist

Do privacy work from the data outward. Map what is collected, why it exists, who can touch it, how long it stays, and what a user would reasonably expect. Good privacy guidance reduces risk by changing the design, not by layering vague policy language on top.

## Focus

Use this skill to:
- review features, products, workflows, and vendors for privacy risk
- map personal-data lifecycles and exposure points
- challenge unnecessary collection, inference, sharing, and retention
- critique consent, notice, and preference-management flows
- prepare DPIA-style risk summaries and mitigation plans
- translate privacy concerns into actionable product, ops, and governance controls

Do not use this skill to:
- issue formal legal advice or final regulatory conclusions
- substitute for counsel on jurisdiction-specific obligations
- perform deep security architecture review when privacy is not the core question
- draft policy prose without first understanding actual data use

## Inputs to pin down

Identify as much of this as possible before advising:
- what personal or sensitive data is collected, generated, inferred, or received
- the business purpose for each category of data
- who the data subjects are and what they likely expect
- where data flows: product surfaces, systems, vendors, subprocessors, countries, teams
- retention and deletion behavior, including logs, backups, and derived data
- user controls: notice, consent, opt-out, access, correction, deletion, export, objection
- who internally can view, act on, or combine the data
- whether the feature creates heightened sensitivity through surveillance, profiling, or hidden inference

## Deliverables this skill should produce

Return outputs such as:
- privacy risk reviews for launches or existing workflows
- data minimization and retention recommendations
- consent and notice critiques
- vendor privacy diligence summaries
- rights-operations gap memos
- prioritized control plans with owners and open legal questions

## Working method

### 1. Map the full data lifecycle

Trace the lifecycle clearly:
- collection
- creation or inference
- storage
- internal access
- sharing or transfer
- retention
- deletion, suppression, or de-identification

If the data map is fuzzy, the privacy advice will be fuzzy too.

### 2. Test necessity, not just permissibility

For each data element, ask:
- Why do we need this now?
- Could we collect less?
- Could we delay collection until value is proven?
- Could we reduce granularity, identifiability, or retention duration?
- Could the feature work with aggregation or local processing instead?

Minimization is one of the highest-leverage privacy controls because it shrinks future risk automatically.

### 3. Judge the design against user expectations

Assess whether a reasonable user would understand:
- what is happening
- why it is happening
- what choices exist
- what the consequence of each choice is
- who else receives the data
- how long the data remains in play

A technically lawful-looking flow can still be a privacy failure if it is surprising, coercive, or obscured.

### 4. Check rights and operational reality

Good privacy guidance must survive operations. Evaluate whether the design supports:
- access, correction, deletion, export, and objection workflows where relevant
- retention enforcement rather than aspirational retention statements
- auditability of data sources, sharing, and downstream copies
- vendor offboarding and deletion confirmation
- ownership, escalation, and incident handling

### 5. Separate privacy from security, but connect them properly

Security reduces privacy risk by protecting data from unauthorized access. Privacy also covers:
- purpose limitation
- fairness and expectation alignment
- minimization
- retention discipline
- transparency
- user agency
- governance over sharing and reuse

Do not collapse privacy into access controls alone.

### 6. End with a prioritized control plan

For each meaningful issue, provide:
- risk
- why it matters
- affected users or data flows
- severity or priority
- recommended control or product change
- owner or function likely to act
- open question for legal, security, or operations if needed

## Adjacent skill boundaries

- **policy-drafter**: turns settled decisions into formal policy language; this skill diagnoses privacy risk and control needs first
- **security-auditor** / **security-engineer**: focus on technical protection; this skill centers on data use, user impact, retention, and governance
- **procurement-specialist**: owns commercial vendor selection; this skill supplies privacy diligence criteria and risk interpretation
- **compliance-officer**: covers broader control and regulatory programs; this skill stays anchored on privacy-by-design decisions

## Quality bar

A strong result should:
- make the data flow understandable enough to reason about real exposure
- cut through vague compliance language and identify concrete privacy risk
- challenge unnecessary collection, inference, sharing, and retention
- connect user expectations to design and governance controls
- leave product, ops, legal, and security with a practical next-step list

## Use supporting files

- Use `prompt.md` for posture and answer structure.
- Use `examples/README.md` for output shapes.
- Use `guides/qa-checklist.md` before finalizing.
- Use `meta/skill.json` for aliases, boundaries, and catalog metadata.
