---
name: faq-builder
description: Build or repair FAQ systems from docs, policies, release notes, support tickets, search logs, and stakeholder inputs. Use when the job is to decide which questions belong in an FAQ, cluster overlapping questions, draft direct answers, improve help-center findability, or maintain launch / onboarding / internal-ops FAQs. Do not use for long-form documentation, chatbot conversation design, SEO article production, or policy/legal approval that needs specialist sign-off.
---

# FAQ Builder

Build FAQ content that resolves real questions fast.

## Gather inputs first

Collect or infer:
- audience, channel, and moment of use
- source materials: docs, policies, release notes, transcripts, tickets, search queries
- top user intents, misconceptions, blockers, and edge cases
- brand, tone, and compliance constraints
- answer owners for unresolved policy or product gaps

If source quality is weak, say so early.

## Decide whether FAQ is the right format

Use an FAQ when users need quick answers to recurring questions.

Do not force FAQ structure onto work that should be:
- step-by-step documentation
- troubleshooting decision trees
- chatbot flows
- policy review or legal interpretation
- marketing pages disguised as support content

Recommend the better format when FAQ is the wrong container.

## Build the question set

### 1. Start from user language
Use the phrasing users actually search, ask, or complain about. Prefer external wording over internal product jargon.

### 2. Cluster duplicates before drafting
Merge near-identical questions. Split only when the answer materially changes by persona, plan, region, or workflow.

### 3. Prioritize by friction
Order questions by likelihood and urgency:
- blockers to signup, setup, billing, access, or trust
- high-volume support issues
- launch-specific confusion
- important edge cases
- nice-to-know clarifications

### 4. Keep the set tight
A smaller, sharper FAQ beats a bloated one. If a question does not meaningfully reduce confusion or support load, cut it.

## Write answers for scan speed

For each answer:
1. Lead with the direct answer in the first sentence.
2. Add steps, limits, exceptions, or links only after the core answer is clear.
3. Use short paragraphs, bullets, and concrete terms.
4. State conditions explicitly: who qualifies, when it applies, what happens next.
5. Avoid evasive phrasing, hype, and internal shorthand.

When a definitive answer is unavailable, say what is known, what is unknown, and who must confirm it.

## Surface gaps instead of hiding them

Flag:
- conflicting source materials
- undocumented edge cases
- policy ambiguity
- stale release information
- ownership gaps for future maintenance

Do not invent certainty to make the FAQ sound polished.

## Optimize for maintenance

Deliver structure that can survive updates:
- stable categories
- reusable answer patterns
- links to source-of-truth docs when appropriate
- owner/follow-up notes for unresolved items
- suggested review triggers after launches, pricing changes, or policy updates

## Strong outputs

Return some combination of:
- recommended FAQ architecture
- prioritized question list
- draft or rewritten FAQ entries
- duplicate/merge recommendations
- gaps, contradictions, and approval flags
- maintenance notes and update triggers

## Boundaries

Prefer adjacent skills when the core request is actually about:
- `technical-writer` for full procedural docs
- `customer-support` for live support responses and case handling
- `ux-writer` for in-product microcopy
- `knowledge-base-author` for broader help-center systems beyond FAQ format

## Use supporting files

- Use `prompt.md` for operating stance and response shape.
- Use `examples/README.md` for deliverable patterns.
- Use `guides/qa-checklist.md` before finalizing.
- Use `meta/skill.json` for metadata, aliases, and boundaries.
