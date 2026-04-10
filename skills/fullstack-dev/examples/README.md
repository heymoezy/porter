# Fullstack Developer — Example Output Shapes

Use these as patterns for strong fullstack-dev deliverables.

## Example 1 — Contract mismatch bug

**Input:**
Fix a signup flow where the client accepts weak passwords, the API rejects them, and analytics still log success.

**Good output shape:**
explains the user-journey failure, aligns validation and error semantics, corrects success-state handling across UI and backend, and includes browser/API verification

## Example 2 — End-to-end feature slice

**Input:**
Ship saved filters for an analytics page, including UI controls, persistence, sharing rules, and restore-on-load behavior.

**Good output shape:**
one coherent vertical slice covering state model, API contract, storage semantics, rollout notes, and tests across relevant layers

## Example 3 — Admin workflow implementation

**Input:**
Add approval status editing with optimistic UI, audit logs, permission checks, and retry-safe updates.

**Good output shape:**
clear responsibility split between UI feedback and backend truth, explicit state transitions, idempotency notes, and end-to-end verification
