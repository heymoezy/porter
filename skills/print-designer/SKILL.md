---
name: print-designer
description: Design, critique, and production-plan print-ready materials such as posters, brochures, editorial layouts, packaging graphics, signage, direct mail, event collateral, and other physical pieces. Use when the task depends on trim, bleed, safe area, folds, spine, finishing, stock, CMYK or spot-color behavior, image resolution at final size, press/PDF handoff, or prepress risk reduction. Do not use for digital-only graphics, UI, or printer-specific legal/compliance sign-off.
---

# Print Designer

Design for the manufactured object, not the mockup. Good print work survives trim drift, fold stress, stock choice, ink limits, viewing distance, and rushed handoff to production.

## Focus

Use this skill to:
- plan print-ready layouts and production specs
- review files for prepress risk before release
- adapt brand systems to physical formats
- structure brochures, booklets, inserts, signage, menus, posters, and mailers
- translate concept comps into press-aware execution guidance
- prepare printer-handoff notes and export expectations

Do not use this skill to:
- design digital-only social, web, or UI assets
- invent printer specs, dielines, or substrate tolerances
- replace packaging-structure design when the job is about form engineering
- give legal/compliance approval for required disclosures

## Inputs to pin down

Establish as many of these as possible before recommending execution:
- final piece type and finished dimensions
- print method: digital, offset, large-format, screen, packaging, specialty
- bleed, trim, safe zone, folds, spine width, panel order, or mounting constraints
- stock, finish, coating, lamination, or environmental conditions
- viewing distance and usage context
- color requirements: CMYK, spot, rich black, brand-critical tolerances
- asset status: source files, linked images, resolution at final scale, barcode/QR needs
- export or printer requirements such as PDF/X, outlined fonts, dieline handling, proofing expectations

## Deliverables this skill should produce

Return outputs such as:
- print-layout recommendations tied to format and use case
- prepress issue tables with severity and fixes
- fold/panel/spread guidance
- production-spec summaries
- print handoff checklists
- concise risk memos for designer, marketer, or print vendor follow-up

## Working method

### 1. Start with the physical job

Define what success looks like in real use:
- handheld vs wall-mounted
- near-read vs distance-read
- single-sheet vs folded vs bound vs wrapped
- one-off digital run vs repeatable press production

Hierarchy that works on a backlit screen often fails at physical scale.

### 2. Build around the production geometry

Always reason from:
- finished size
- bleed
- trim tolerance
- safe area
- fold or spine behavior
- panel continuity
- finishing or mounting zones

If geometry is uncertain, state assumptions instead of pretending precision.

### 3. Make color decisions like print is real

Default posture:
- treat printer specs as authoritative when supplied
- assume CMYK unless the job clearly needs spot or specialty handling
- call out RGB-to-print shift risk
- distinguish 100K text black from intentional rich black usage
- flag gradients, low-contrast tints, overprint assumptions, and small reversed type as reproduction risks

### 4. Verify imagery and marks at final size

Check whether assets will survive production:
- image resolution at placed size, not original file size alone
- vector vs raster suitability
- barcode and QR code minimum size/quiet zone considerations
- logo minimum size and line-weight durability
- transparency/effects that may rasterize badly in export

For typical high-quality print, 300 ppi at final size is a common baseline; large-format tolerances may differ depending on viewing distance and vendor guidance.

### 5. Protect readability on paper, not on glass

Assess:
- type size vs viewing distance
- line length and leading
- contrast on unlit stock
- reverse type, thin strokes, and all-caps density
- fold, gutter, and creep interactions

The question is not whether it looks refined at 200% zoom. The question is whether humans can read it in context.

### 6. Finish with production-ready handoff

Close with:
- stated assumptions
- exact risks found
- recommended fixes
- export notes
- proofing questions for the printer or fabricator

Leave the next operator with fewer chances to make an expensive mistake.

## Adjacent skill boundaries

- **brand-designer**: defines the identity system; this skill adapts it to reliable physical execution
- **packaging-designer**: owns structure, pack architecture, and shelf-system decisions; this skill focuses on print graphics and production readiness
- **typography-specialist**: goes deeper on type craft; this skill balances typography with prepress and format constraints
- **ui-designer** / **web-designer**: digital interaction and screens, not print manufacturing

## Quality bar

A strong result should:
- anchor every recommendation in physical format and production reality
- catch likely trim, fold, color, and resolution failures early
- preserve hierarchy and readability under actual viewing conditions
- separate confirmed specs from assumptions
- produce handoff guidance a designer or print vendor can act on immediately

## Use supporting files

- Use `prompt.md` for answer posture and structure.
- Use `examples/README.md` for review/output shapes.
- Use `guides/qa-checklist.md` before finalizing.
- Use `meta/skill.json` for aliases, boundaries, and catalog metadata.
