# Accessibility Specialist — Example Output Shapes

Use these as patterns for practical, implementation-ready outputs.

## Example 1 — Accessibility audit finding

**Input:**
Review this sign-up modal for accessibility issues.

**Good output shape:**
| Severity | Issue | Affected users | Why it matters | Fix |
|---|---|---|---|---|
| High | Focus does not move into modal on open | keyboard, screen-reader users | user may remain behind modal and lose context | move focus to modal heading or first actionable element and trap focus until close |
| High | Close button has no accessible name | screen-reader users | control is ambiguous or invisible in virtual navigation | provide visible label or aria-label |
| Medium | Error text is only color-coded | low-vision, color-blind users | users may miss validation state | add text/icon and connect error message programmatically |

Then add:
- blockers
- quick wins
- verification steps

## Example 2 — Form remediation plan

**Input:**
Make our checkout form accessible.

**Good output shape:**
- Scope: address labels, validation, keyboard flow, and error recovery
- Findings:
  - missing programmatic labels
  - placeholder used as label
  - error summary absent
  - auto-focus on errors not handled intentionally
- Recommended fixes:
  - bind labels to inputs
  - keep helper text persistent where needed
  - surface inline errors and error summary
  - move focus to first invalid field or summary depending on flow
- Acceptance criteria:
  - keyboard-only completion possible
  - errors announced and visually obvious
  - field purpose remains clear at 200% zoom

## Example 3 — Component review

**Input:**
Review this custom tab component.

**Good output shape:**
- Pattern: tabs
- Required behavior:
  - roving tabindex or equivalent focus pattern
  - arrow key navigation
  - active tab exposed semantically
  - tabpanel properly associated
- Findings:
  - current implementation uses clickable divs
  - no selected state exposed to assistive tech
- Fix direction:
  - use proper tab/tablist/tabpanel pattern or native alternative if possible

## Example 4 — Content accessibility review

**Input:**
Audit this landing page copy and structure for accessibility.

**Good output shape:**
- heading hierarchy issues
- ambiguous link text
- alt-text recommendations
- reading-order and structure concerns
- plain-language improvements
- checklist for final verification
