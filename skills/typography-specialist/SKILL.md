---
name: typography-specialist
description: Design, critique, and systematize typography for product UI, editorial layouts, brand systems, decks, and marketing assets with strong readability, hierarchy, rhythm, and accessibility. Use when the hard part is choosing type pairings, defining scales, fixing spacing and line-length issues, improving legibility, or creating implementation-ready typography guidance. Do not use for broader visual identity strategy or full screen layout design when typography is only one small part.
---

# typography-specialist

Make type do the work.

This skill owns typography judgment: selecting and pairing typefaces, building hierarchy, setting scale, controlling rhythm, and improving readability across real surfaces. Use it when the output needs type decisions that are clear enough to implement, not vague aesthetic commentary.

## Scope

Use this skill for:
- typeface selection and pairing
- typography critique of existing screens, decks, pages, or brand materials
- modular scales and text-style systems
- line length, line height, spacing, and rhythm guidance
- responsive typography behavior across devices and densities
- accessibility-aware typography decisions
- editorial polish for hierarchy, scanability, and reading comfort
- implementation-ready type specs for designers or engineers

## Do not use this skill for

Do not use this skill for:
- full brand identity systems where typography is just one part; use **brand-designer**
- overall screen composition, component layout, or visual UI polish beyond type; use **ui-designer**
- copy editing, messaging, or tone-of-voice work; use **copywriter** or **ux-writer**
- design-system architecture beyond typography tokens and text styles; use **design-system-architect**
- print-production setup details like prepress and packaging dielines as the main problem; use **print-designer** or **packaging-designer**

## Routing rules

Route to **typography-specialist** when the main difficulty is deciding:
- which typefaces fit the job without hurting legibility
- how hierarchy should be built through type, spacing, and weight
- what text styles, sizes, and rhythms should become the system
- why a layout feels dense, weak, noisy, or hard to scan because of type treatment
- how typography should adapt across breakpoints, long content, or accessibility settings

Do **not** route here just because a task mentions fonts.
If the real problem is the whole visual system, page composition, or brand direction, another design skill is the better owner.

## Inputs to gather

Before making recommendations, identify:
- medium: UI, web, editorial, slide deck, brand asset, report, app, signage, or mixed
- audience, reading context, and likely device conditions
- tone: neutral, premium, technical, playful, institutional, etc.
- language coverage and localization pressure
- content density and dominant text lengths
- accessibility constraints, especially low vision, zoom, and spacing overrides
- implementation constraints such as web-safe availability, licensing, variable-font support, or existing brand rules

If the request lacks medium or audience, say the recommendation quality is limited by missing context.

## Output expectations

Return outputs such as:
- recommended type pairings with rationale and tradeoffs
- text-style systems with role, size, weight, line height, and letter spacing
- critique of hierarchy, density, and readability problems
- responsive typography guidance
- accessibility notes and remediation suggestions
- implementation handoff notes for tokens, CSS, or design-system styles

Prefer concrete specs over “modern / clean / elegant” adjectives.

## Working method

### 1. Define the reading job
Clarify what the type must do:
- support long reading
- drive fast scanning
- highlight actions
- convey brand tone
- survive dense data or small screens

### 2. Audit the current hierarchy
Check:
- size contrast
- weight contrast
- line length
- line height
- paragraph spacing
- alignment consistency
- use of all caps, italics, and decorative styles

Weak hierarchy usually comes from poor role separation, not from missing style flourishes.

### 3. Build the system
Specify:
- families and fallback stacks
- text roles and naming
- sizes and scale logic
- line heights
- letter spacing where it matters
- weight usage rules
- spacing between headings, paragraphs, captions, and lists

Keep the number of text roles disciplined.

### 4. Stress-test edge cases
Test against:
- tiny labels and dense tables
- long headings and wrapping behavior
- mobile widths and desktop reading widths
- localization expansion
- zoom, user font overrides, and accessibility spacing adjustments

### 5. Hand off decisions clearly
State:
- which choices are required vs flexible
- what to avoid
- how engineers should implement the styles
- where the system might fail under unusual content

## Heuristics

Prefer:
- readability before novelty
- fewer, stronger text roles
- generous but controlled spacing rhythm
- line lengths that match reading intent
- contrast through hierarchy, not decoration
- variable fonts when they simplify performance and weight ranges

Avoid:
- pairing fonts that fight for attention
- using size alone to solve hierarchy
- overly tight line height in long reading blocks
- long line lengths with weak spacing
- excessive text-style proliferation
- decorative typography that damages clarity

## Adjacent skill boundaries

- **ui-designer** owns overall screen layout and visual composition
- **brand-designer** owns broader identity systems and expression
- **design-system-architect** owns reusable system governance across components and tokens
- **ux-writer** owns interface copy clarity, tone, and microcopy
- **print-designer** owns print execution details when production is the main issue

## Quick routing examples

Use **typography-specialist** for:
- choosing a web type system for a SaaS product with dense dashboards and docs
- fixing a marketing page whose headings feel loud but the body text is hard to read
- defining heading, body, caption, and label styles for a design system
- critiquing a slide deck whose hierarchy collapses under dense information

Do **not** use **typography-specialist** for:
- redesigning the full dashboard layout and component arrangement; use **ui-designer**
- creating the brand identity platform from scratch; use **brand-designer**
- rewriting unclear button labels and empty states; use **ux-writer**

## Quality bar

A strong result should:
- improve legibility, hierarchy, and scanability
- explain tradeoffs between tone, performance, and accessibility
- provide specific, implementable text-style guidance
- account for responsive and dense-content realities
- reduce ambiguity for designers and engineers

## Use with

- `prompt.md` for execution posture and response style
- `examples/README.md` for representative requests and output shape
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
