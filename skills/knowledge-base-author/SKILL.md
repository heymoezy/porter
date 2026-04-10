---
name: knowledge-base-author
description: Create or improve help-center, support, operations, onboarding, and internal knowledge-base content that people can scan and use under pressure. Use when the work is writing or restructuring articles, SOPs, FAQs, troubleshooting guides, runbooks, how-tos, navigation/taxonomy within a knowledge base, or converting ticket/SME knowledge into durable docs. Do not use for broad knowledge-governance strategy, search-system implementation, or one-off marketing copy.
---

# Knowledge Base Author

Turn scattered know-how into maintainable articles that reduce repeat questions and help readers finish a task fast.

## Focus
This skill is for authoring or rewriting **knowledge-base content itself**: individual articles, article sets, templates, SOPs, troubleshooting flows, onboarding docs, and support-facing documentation.

Use adjacent skills instead when the main need is:
- **knowledge-manager**: governance, ownership, repository structure, lifecycle, and operating model
- **faq-builder**: high-volume FAQ set creation from repeated questions
- **documentation-writer**: broader product or technical documentation outside KB/support operations
- **customer-support / helpdesk-agent**: handling live cases rather than codifying reusable answers

## Gather first
- Audience: customer, support, ops, partner, internal specialist, new hire
- Reader goal: what they are trying to complete, fix, decide, or recover from
- Source truth: tickets, transcripts, existing docs, SME notes, UI labels, runbooks, policies
- Failure paths: common confusion, edge cases, prerequisites, permissions, dependencies
- Publishing constraints: template, voice, screenshots, metadata, localization, approval owner

## Deliverables
Provide some combination of:
- A rewritten article or article set
- Clear title, summary, and search-friendly phrasing
- Prerequisites, steps, expected result, and recovery path
- Troubleshooting section with observable checks
- Cross-link, tag, owner, and review-cadence suggestions
- Explicit gaps needing SME or policy confirmation

## Working method
1. Define the user job and the moment of need.
2. Separate verified facts from assumptions and stale carryover text.
3. Choose the right article shape: how-to, troubleshooting, FAQ, reference, SOP, onboarding, or decision guide.
4. Lead with the fastest path to success, then add branches only where they matter.
5. Use exact product labels, permissions, and system states readers will actually see.
6. Add escalation guidance when the reader cannot proceed safely alone.
7. Finish with maintenance metadata so the article stays trustworthy.

## Writing rules
- Optimize for scanability before elegance.
- Prefer task-first headings over internal jargon.
- Keep paragraphs short; use steps, bullets, tables, and decision branches.
- Distinguish symptoms, causes, checks, and fixes.
- Avoid duplicate answers across multiple articles; point to one canonical source.
- Name assumptions, unsupported claims, and pending confirmations explicitly.
- Write what to do when the happy path fails.

## Strong article patterns
### How-to
Use for repeatable user actions.
- Who this is for
- Before you begin
- Steps
- Expected result
- If it doesn’t work
- Related articles

### Troubleshooting
Use for failure recovery.
- Symptom
- Likely causes
- Quick checks
- Resolution paths
- Escalate when

### SOP / internal process
Use for operational consistency.
- Trigger / scope
- Preconditions
- Procedure
- Decision points
- Escalation / exception handling
- Audit notes / ownership

## Quality bar
A strong deliverable lets a stressed reader answer five questions fast:
1. Am I in the right article?
2. What do I need before I start?
3. What exact step do I take next?
4. How do I know it worked?
5. What do I do if it fails?

## Final check
Before finishing, read `guides/qa-checklist.md`, align the response structure with `prompt.md`, and sanity-check the deliverable against `examples/README.md`.