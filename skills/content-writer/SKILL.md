---
name: content-writer
description: Draft and rewrite general-purpose editorial, business, product, support, and internal written content when no more specialized writing skill is the better fit. Use when the main task is producing a clear, audience-aware first draft or clean rewrite for general communications, explainers, summaries, newsletters, product education, internal memos, or mixed-format content. Treat this as a broad editorial drafting skill, not the default for conversion copy, blog strategy, technical documentation, or UX microcopy.
---

# Content Writer

Write clear, useful content that matches audience, channel, and goal.

This skill is the general editorial drafting fallback for the catalog. It exists for solid first drafts, clean rewrites, and mixed-format writing tasks that do not clearly belong to a more specialized writing skill. It should not cannibalize copywriting, blog writing, documentation, technical writing, or UX microcopy.

## Scope

Use this skill for:
- general-purpose articles and explainers that are not strongly blog- or SEO-led
- newsletters and updates with moderate persuasion needs
- product education and support-style content outside strict documentation systems
- executive summaries and internal written communications
- clean rewrites of messy source material
- outline-to-draft conversion for mixed business/editorial content
- concise business or editorial drafts that need clarity more than deep format specialization

## Do not use this skill for

Do not use this skill for:
- conversion-focused messaging, offers, or persuasion-heavy copy; use **copywriter**
- blog posts where long-form editorial angle, thesis, or SEO format is central; use **blog-writer**
- technical docs, README work, runbooks, or information-architecture-heavy docs work; use **documentation-writer**
- precision-heavy technical explanation artifacts; use **technical-writer**
- product microcopy inside interfaces; use **ux-writer**
- legal or regulated content requiring specialist review

## Routing rules

Route to **content-writer** when the main need is:
- a strong general draft or rewrite
- audience-appropriate structure and clarity
- mixed-format or business/editorial writing without a sharper specialist fit
- practical content production rather than deep persuasion, documentation architecture, or technical explanation

If a more specific writing format clearly fits, prefer that specialist skill.
`content-writer` should be the fallback, not the default winner.

## Inputs to gather

Before drafting, identify:
- target audience
- reader outcome or communication goal
- channel and format
- key points, source material, or facts
- voice and tone constraints
- CTA, if any
- required sections, word-count, or formatting limits

If important details are missing, make minimal assumptions and surface them.

## Output expectations

Return outputs such as:
- complete first draft
- structured outline plus opening sections for larger pieces
- rewrite of supplied material
- headline and subhead options where useful
- concise variants adapted to channel constraints

Aim for a draft that can be reviewed or sent, not a placeholder.

## Working method

### 1. Define the communication job
Clarify:
- what should the reader know, feel, or do?
- how informed is the audience already?
- where will this be read?
- what would make this draft successful?

### 2. Build structure before polishing
Decide the backbone first:
- title or subject line
- section order
- narrative or logical flow
- proof points, examples, or FAQs
- CTA placement if relevant

Structure usually matters more than wordsmithing.

### 3. Write for scanability and momentum
Default to:
- clear openings
- short paragraphs
- informative subheads
- concrete language
- examples where abstraction would slow understanding

### 4. Match tone to context
Tune voice based on use case:
- product/support: clear and reassuring
- editorial: informative and credible
- internal comms: direct and aligned
- business writing: concise and decision-useful

### 5. Preserve factual discipline
Use only supported facts from provided context or trusted sources.
If facts are missing, use placeholders or caveats instead of inventing specifics.

### 6. Tighten for usefulness
Remove:
- throat-clearing intros
- repeated claims
- generic adjectives
- unnecessary jargon
- sections that do not advance the reader toward the goal

## Heuristics

Prefer:
- strong structure
- audience-aware clarity
- practical, reviewable drafts
- concise language with enough substance
- explicit uncertainty where facts are incomplete

Avoid:
- trying to out-specialize specialist writing skills
- generic filler or empty polish
- unsupported claims
- overproducing options when one strong draft will do
- drifting into copywriting, blogging, docs architecture, or UI microcopy without need

## Adjacent skill boundaries

- **copywriter**: stronger persuasion and conversion pressure
- **blog-writer**: long-form editorial and SEO-led post structure
- **documentation-writer**: task-oriented technical docs and docs-system execution
- **technical-writer**: precision-heavy explanation of complex technical material
- **ux-writer**: interface microcopy and in-product language
- **content-auditor**: reviews and prioritizes content issues rather than drafting the content itself

## Quick routing examples

Use **content-writer** for:
- rewriting an internal memo into a clean executive update
- drafting a product explainer that is not a technical doc or a conversion page
- turning rough notes into a readable customer or team communication
- writing a mixed-format newsletter or update with moderate promotional pressure

Do **not** use **content-writer** for:
- optimizing a landing page to drive signup; use **copywriter**
- writing a thesis-driven SEO article; use **blog-writer**
- restructuring a README, runbook, or migration guide; use **documentation-writer**
- writing button labels and error-state copy; use **ux-writer**

## Quality bar

A strong result should:
- fit the audience and channel
- have clear structure and flow
- avoid fluff and unsupported claims
- move the reader toward the intended outcome
- stay in its lane instead of swallowing specialist writing work

## References to use

Use `prompt.md` for drafting stance and response shape.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` for output patterns.
Use `meta/skill.json` for boundaries and metadata.
