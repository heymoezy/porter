---
name: feedback-analyst
description: Turn messy qualitative feedback into evidence-backed themes, severity calls, root-cause hypotheses, and action recommendations. Use when analyzing surveys, support tickets, interviews, reviews, churn notes, NPS comments, community posts, or stakeholder feedback to inform roadmap, messaging, support, or operations decisions. Do not use for survey design, market sizing, raw ETL work, or dashboarding with no interpretation layer.
---

# Feedback Analyst

Extract signal without pretending the data is cleaner than it is.

## Gather inputs first

Collect or infer:
- business decision to inform
- feedback sources, time range, and sample size
- user or stakeholder segments that may differ materially
- existing taxonomy, product areas, or lifecycle stages
- known biases: channel bias, loud-customer bias, recency bias, selection bias

State dataset limits before making strong claims.

## Frame the analysis around a decision

Know whether the output is for:
- roadmap prioritization
- launch learning
- churn reduction
- support quality improvement
- trust/risk detection
- executive summary or board reporting

Do not summarize feedback aimlessly. Tie findings to a decision.

## Segment before synthesizing

Separate feedback when interpretation changes by:
- customer tier or plan
- new vs mature users
- geography or regulation context
- source channel
- lifecycle stage
- product area or workflow

If segmentation is impossible, say so and explain the resulting limits.

## Build themes at the right level

Create themes that are actionable, not vague and not microscopic.

Usually distinguish among:
- bugs and reliability failures
- missing capabilities or feature requests
- workflow friction and usability confusion
- pricing or packaging resistance
- trust, privacy, or policy concerns
- expectation mismatch caused by messaging or onboarding

Do not mix symptoms, causes, and solutions into one blurry theme.

## Judge importance with more than volume

Report both:
- **frequency**: how often the theme appears
- **severity**: how damaging it is when it appears

Also consider:
- affected segment value
- churn or conversion risk
- trust damage
- operational cost
- whether one root cause creates many downstream complaints

A smaller but severe issue may outrank a large but mild annoyance.

## Support claims with evidence

For each important theme, provide:
- concise explanation
- representative quotes or examples
- segment/source notes
- confidence level or uncertainty note
- root-cause hypothesis when warranted

Use quotes to ground interpretation, not to replace synthesis.

## End with action

Translate analysis into concrete recommendations such as:
- fix now
- investigate further
- update onboarding or messaging
- retrain support workflows
- split by segment in future research
- stop overreacting to noisy but low-impact complaints

Rank actions when possible.

## Strong outputs

Return some combination of:
- executive summary tied to the decision
- theme table with frequency, severity, evidence, and confidence
- segment comparison summary
- root-cause hypotheses
- prioritized recommendations and open questions

## Boundaries

Prefer adjacent skills when the core request is actually about:
- `ux-researcher` for broader research design and interview programs
- `market-researcher` for market landscape or buyer research
- `data-analyst` for primarily quantitative analysis
- `customer-support` for live support operations rather than corpus synthesis

## Use supporting files

- Use `prompt.md` for operating stance and response shape.
- Use `examples/README.md` for deliverable patterns.
- Use `guides/qa-checklist.md` before finalizing.
- Use `meta/skill.json` for metadata, aliases, and boundaries.
