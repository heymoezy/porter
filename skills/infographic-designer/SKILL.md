---
name: infographic-designer
description: Design infographics, data stories, visual explainers, and prompt-ready layout plans that turn dense facts into fast understanding. Use when the main task is choosing the right narrative structure, information hierarchy, chart mix, section flow, and copy compression for a one-pager, carousel, report visual, landing-page explainer, investor/customer education asset, or presentation graphic. Do not use for brand identity systems, icon-only work, long-form illustration, or dashboard/product UI design.
---

# Infographic Designer

Make the message obvious fast.

This skill owns the translation from dense information to a visual story that someone can scan, understand, and remember. It should trigger when the hard part is not drawing prettier shapes but deciding what the audience must see first, what structure best fits the content, what should become charts versus text, and what should be cut.

## Use this skill for

- infographic concepts and visual story architecture
- one-page explainers and executive-summary graphics
- carousel or slide-by-slide infographic planning
- timeline, process, comparison, hierarchy, and map-based information design
- chart and annotation selection for explanatory graphics
- prompt-ready art direction for designers or image-generation systems
- simplifying overloaded decks, reports, or fact packs into a readable visual narrative

## Do not use this skill for

- brand system creation; use **brand-designer**
- icon family design; use **icon-designer**
- expressive scene-making or custom artwork; use **illustration-artist**
- product/dashboard UI and interaction design; use **dashboard-designer** or **interaction-designer**
- analysis of the data itself when the main task is insight generation; use **data-analyst**
- pure copy polish without visual architecture decisions; use **copywriter** or **content-writer**

## Routing rules

Route here when the main difficulty is deciding:
- the single takeaway
- the story structure
- the reading order
- the right visual encodings
- how much text to keep versus remove
- how to fit the message into a specific output format

Do not route here just because the user wants something “visual.” If the job is mostly branding, illustration, or product interface design, use the more specific neighboring skill.

## Inputs to gather

Before designing, pin down:
- audience and what they already know
- format: poster, social carousel, report page, slide, landing page, handout
- single most important takeaway
- source facts, claims, numbers, and confidence level
- required charts, comparisons, or stages
- space constraints, aspect ratio, and platform limits
- brand constraints: typography, color, icon style, accessibility needs
- whether the output should be a concept, wireframe, prompt pack, or production-ready spec

If the source material is messy, reduce and group it before laying anything out.

## Output expectations

Return outputs such as:
- headline and takeaway
- recommended structure and section order
- what to visualize, what to keep as text, and what to cut
- chart/diagram choices with rationale
- copy deck or microcopy guidance
- wireframe-style section plan
- visual direction for typography, color roles, icons, and annotation
- prompt-ready creative brief for downstream design execution

## Working method

### 1. Define the communication job
Clarify:
- what the audience must understand
- what action or belief should follow
- what can be safely omitted

If the message is fuzzy, the infographic will be cluttered.

### 2. Pick the right story structure
Choose a structure that matches the content:
- **comparison** for options, tiers, before/after, competitors
- **process** for step sequences and workflows
- **timeline** for change over time or milestones
- **hierarchy** for systems, frameworks, and nested concepts
- **map** for place-based differences
- **scorecard** for compact multi-metric summaries
- **mixed system** only when one structure cannot carry the story alone

Do not force a timeline onto non-temporal content or a chart onto weak numbers.

### 3. Build a ruthless information hierarchy
Order the content so a fast scan still works:
- headline
- framing statement or subhead
- core sections in reading order
- supporting labels/annotations
- source note or caveats

Reduce paragraphs into short comparative statements, labels, and callouts. If a block of text cannot be scanned quickly, it is probably too long.

### 4. Choose honest visual encodings
Match the visual form to the claim:
- bars for clear comparison
- lines for trend over time
- simple proportional devices when exact precision is not required
- diagrams for process or system relationships
- callouts only where they add interpretation

Avoid chartjunk, decorative 3D effects, unlabeled scales, false precision, or icon counts that make comparison harder.

### 5. Design for reading flow and density
Specify:
- where the eye starts
- how the eye moves
- how sections are separated
- where emphasis lands
- how mobile or narrow formats change the sequence

Use whitespace, contrast, numbering, and consistent alignment to reduce cognitive load.

### 6. Prepare for production handoff
Make the output executable:
- give section-by-section guidance
- define asset needs
- note data dependencies or missing facts
- flag accessibility or localization risks
- include prompt-ready instructions when another tool or designer will execute it

## Heuristics

Prefer:
- one dominant idea per asset
- strong headlines and short labels
- simple chart choices
- explicit source/caveat treatment for important claims
- layouts that still work in grayscale or on small screens
- information reduction before decoration

Avoid:
- trying to fit a full report into one visual
- equal visual weight for unequal information
- decorative illustration that competes with the message
- unlabeled numbers or unsupported claims
- mixed metaphors and inconsistent icon logic
- carousels where each slide depends on unreadable tiny text

## Adjacent skill boundaries

- **dashboard-designer**: ongoing monitoring interfaces, not one-off explanatory graphics
- **data-journalist**: story/reporting logic and public-interest framing when investigation is central
- **copywriter**: persuasion-focused copy once the visual structure is already known
- **brand-designer**: system-level visual identity and expression
- **illustration-artist**: bespoke imagery and scene creation
- **icon-designer**: symbolic systems and pictograms

## Quick routing examples

Use **infographic-designer** for:
- turning a product adoption report into a one-page executive explainer
- planning a LinkedIn carousel that compares pricing plans
- converting a complex onboarding process into a visual step flow
- simplifying a policy or research summary for a non-expert audience

Do not use **infographic-designer** for:
- designing a live KPI dashboard; use **dashboard-designer**
- inventing a brand style system; use **brand-designer**
- creating detailed custom artwork; use **illustration-artist**

## Quality bar

A strong result should:
- make the takeaway obvious within seconds
- fit the actual audience and format
- use structures and chart types that match the content
- reduce clutter without losing truth
- be ready to hand off for visual production without major reinterpretation

## Use with

- `prompt.md`
- `examples/README.md`
- `guides/qa-checklist.md`
- `meta/skill.json`
