# Design QA — Example Output Shapes

Use these patterns to make fidelity findings easy to fix.

## Example 1 — Single-screen audit

**Input:**
Check the implemented settings page against Figma.

**Good output shape:**
- Source of truth:
  - Figma file, frame, and revision
- Environment:
  - staging URL, Chrome, 1440px and 390px widths
- Findings table:
  - section header spacing mismatch
  - incorrect font weight on subsection titles
  - disabled button color token mismatch
- Severity:
  - one blocker, two medium issues
- Recommendation:
  - no-ship until blocker is fixed

## Example 2 — Responsive regression review

**Input:**
Something breaks on tablet view. Audit it.

**Good output shape:**
- breakpoints tested
- components affected
- wrapping, overflow, and clipping issues
- expected vs actual details
- likely shared layout rule causing multiple defects
- prioritized fix order

## Example 3 — Component library state audit

**Input:**
Validate the form component library before release.

**Good output shape:**
- components covered
- states tested:
  - default, hover, focus, error, success, disabled, loading
- defects by component
- systemic token inconsistencies
- release recommendation with residual risk

## Example 4 — Launch sign-off summary

**Input:**
Are we good to ship the new onboarding flow from a design QA standpoint?

**Good output shape:**
- scope checked
- blockers
- non-blocking issues
- areas not yet verified
- confidence statement
- ship / no-ship call

## Example 5 — Screenshot plus behavior mismatch

**Input:**
The modal looks fine in screenshots but feels wrong in use. Audit it.

**Good output shape:**
- static fidelity notes
- interaction defects:
  - delayed focus
  - off-spec animation timing
  - incorrect close affordance behavior
- severity by user impact
- likely component-level fix path
