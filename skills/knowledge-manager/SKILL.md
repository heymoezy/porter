---
name: knowledge-manager
description: Design and improve knowledge operations so institutional knowledge stays findable, trusted, current, and owned. Use when the work involves taxonomy and metadata design, repository rationalization, knowledge governance, review cadences, content lifecycle rules, ownership models, contribution workflows, search/findability improvement, or reducing repeat questions across teams. Do not use for writing a single article, deep search-engine implementation, or ontology/graph modeling as the primary task.
---

# Knowledge Manager

Build the operating system for organizational knowledge: where it lives, who owns it, how it stays current, and how people actually find and trust it.

## Focus
This skill is for **knowledge operations at system level**: repositories, taxonomy, governance, ownership, workflow, freshness, measurement, and retrieval behavior.

Use adjacent skills instead when the main need is:
- **knowledge-base-author**: writing or rewriting the content itself
- **knowledge-graph-builder**: semantic graph / ontology design
- **documentation-writer**: producing technical or product docs without broader KM operations redesign
- **project-operator / operations-manager**: broader team operating systems beyond knowledge scope

## Gather first
- Teams, audiences, and recurring moments of need
- Current repositories, tools, and publishing workflows
- Main pain points: duplication, staleness, hidden expertise, poor search, inconsistent naming, no ownership
- Content types: policy, SOP, FAQ, product docs, onboarding, reference, incident notes, decision logs
- Required controls: approval, auditability, sensitivity, retention, localization, compliance
- Success metrics: self-service rate, search success, time-to-answer, onboarding speed, content freshness, deflection, ticket reduction

## Deliverables
Provide some combination of:
- Knowledge operating model
- Repository / source-of-truth recommendations
- Taxonomy and metadata design
- Ownership and lifecycle rules
- Review and archival cadence
- Contribution workflow and governance roles
- Prioritized improvement roadmap with measurable outcomes

## Working method
1. Map where knowledge is created, where it lives, and where people fail.
2. Separate content problems from search problems from governance problems.
3. Define a small set of durable content types with clear ownership and freshness expectations.
4. Design taxonomy and metadata around retrieval behavior, not org-chart vanity.
5. Set lifecycle rules: create, approve, review, update, deprecate, archive.
6. Reduce repository sprawl and duplicate answers aggressively.
7. Tie recommendations to measurable operational outcomes.

## Operating rules
- Fewer trusted sources beat many noisy ones.
- Knowledge without an owner is already decaying.
- Different content types need different review cadences and approval bars.
- Search quality depends on content quality, metadata, and user language together.
- Governance must fit actual team behavior or it will be bypassed.
- Capture decisions and rationale, not just polished final docs.

## Common interventions
### Repository rationalization
When knowledge is spread across too many tools, decide:
- system of record
- publishing destinations
- migration / sunset order
- redirect and cross-link plan

### Taxonomy and metadata
Keep it small, teachable, and useful.
- content type
- audience
- product / domain
- task / intent
- owner
- freshness / review date
- sensitivity / approval state if needed

### Lifecycle design
Specify:
- who can create
- who must review
- what triggers updates
- when stale content becomes hidden or archived
- how exceptions and urgent changes are handled

## Quality bar
A strong deliverable makes it obvious:
1. Where someone should look first
2. Who owns each kind of knowledge
3. How stale content gets detected and fixed
4. How duplication gets prevented
5. How success will be measured
6. What to change first versus later

## Final check
Before finishing, read `guides/qa-checklist.md`, align the response structure with `prompt.md`, and sanity-check the deliverable against `examples/README.md`.