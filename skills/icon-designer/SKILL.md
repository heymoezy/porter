---
name: icon-designer
description: Design UI, product, brand, and system icons with clear metaphor choices, family consistency, small-size legibility, and implementation-ready specs. Use when creating a new icon set, refining or critiquing existing icons, matching a platform style, defining iconography rules, converting product concepts into icons, or fixing readability and consistency problems across a visual system.
---

# Icon Designer

Design icons that read instantly and behave like a system, not a pile of unrelated drawings.

## Start with the icon system, not the first glyph
Lock these variables first:
- use case: navigation, actions, objects, status, or illustration-like decoration
- target sizes and contexts: toolbar, tab bar, settings list, empty state, marketing, wayfinding
- style model: outline, filled, duotone, cutout, badge, or mixed with strict rules
- production constraints: SVG, variable stroke, font icon, platform set, dark mode, localization
- family rules: grid, optical weight, corner radius, perspective, stroke caps, fill behavior, detail density

## Choose metaphors for recognition, not novelty
For every icon:
1. Define the user meaning, not just the noun.
2. Generate several metaphor routes.
3. Pick the one with the fastest recognition at the target size.
4. Check collisions with nearby concepts such as save/download, home/dashboard, alert/error, chat/comment.
5. Prefer familiar symbols unless the brand explicitly benefits from a more ownable shape.

## Normalize the family
Consistency matters more than isolated cleverness.
Review:
- silhouette weight,
- internal spacing,
- line endings,
- corner treatment,
- diagonal behavior,
- level of realism versus abstraction,
- whether icons feel built from the same geometry.

If one icon needs materially more detail than the others, simplify it or redesign the whole lane.

## Design for small sizes and real surfaces
Borrow the practical rule from mature icon systems: clarity must survive reduction.
- Test at production size, not only zoomed in.
- Remove detail that closes up, shimmers, or turns muddy.
- Use optical correction instead of geometric purity when needed.
- Reserve decorative nuance for larger supporting contexts.
- Call out when two states should rely on labels, color, or motion instead of icon shape alone.

## Produce implementation-ready output
Useful deliverables include:
- icon system principles,
- icon-by-icon concept descriptions,
- creation specs: size, stroke, radius, padding, alignment rules,
- critique with exact fixes,
- synonym and naming guidance for engineering/design libraries,
- expansion rules for future icons.

When generating prompts or handoff briefs, specify the actual distinguishing geometry, not vague adjectives.

## Adjacent skill boundaries
- Use **illustration-artist** when the work is expressive scene-making or decorative storytelling.
- Use **brand-designer** when the core task is brand identity, not iconography mechanics.
- Use **ui-designer** when icon work is secondary to screen-level interaction design.

## Guardrails
- Do not confuse icons with mini illustrations.
- Do not rely on color alone to differentiate critical meanings.
- Do not mix incompatible metaphor families without explicitly naming the exception.
- Do not recommend novelty that hurts scan speed.
- If the brief is underspecified, state the default assumptions before designing.

## Quality bar
The result should make it obvious what each icon means, why the set feels coherent, and how another designer or engineer could extend it without drift.

## References
- prompt.md
- examples/README.md
- guides/qa-checklist.md
- meta/skill.json
