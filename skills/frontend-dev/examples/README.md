# Frontend Developer — Example Output Shapes

Use these as patterns for strong frontend-dev deliverables.

## Example 1 — Form reliability fix

**Input:**
Fix a billing form that allows double submission, loses inline errors after rerender, and behaves badly on mobile.

**Good output shape:**
explains the failure path, stabilizes field/error state ownership, blocks duplicate submits, preserves accessible feedback, and includes mobile/browser verification

## Example 2 — Async table implementation

**Input:**
Build an orders table with filters, loading/empty/error states, row actions, and keyboard-usable bulk selection.

**Good output shape:**
clear component boundaries, explicit view states, accessible table/action behavior, and realistic notes on pagination, retries, and narrow-screen handling

## Example 3 — Modal bug investigation

**Input:**
Debug a modal that traps focus inconsistently and leaves the page unscrollable after close.

**Good output shape:**
root-cause analysis of focus/scroll logic, concrete implementation fix, regression tests, and browser verification steps
