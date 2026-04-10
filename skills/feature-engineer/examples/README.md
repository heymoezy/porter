# Feature Engineer — Example Output Shapes

Use these as patterns for strong deliverables.

## Example 1 — Progressive rollout feature

**Input:**
Implement a new admin approval flow that touches UI, API validation, audit logs, and notifications, with release behind a feature flag.

**Strong output shape:**
- behavior summary and non-goals
- layer-by-layer implementation plan or completed changes
- permission and audit considerations
- verification notes for happy path, rejection path, and rollback/disable path
- rollout criteria for expanding the flag

## Example 2 — Product workflow addition

**Input:**
Ship a self-serve invite flow for team workspaces with seat enforcement and analytics.

**Strong output shape:**
- user journey from invite creation to acceptance
- coordinated frontend/backend/data updates
- seat-limit and permission edge cases
- event definitions and post-launch checks

## Example 3 — Migration-sensitive feature

**Input:**
Add saved filters to a reporting page where existing accounts already have legacy preferences stored.

**Strong output shape:**
- smallest compatible release slice
- storage and migration decision notes
- error/empty-state behavior
- verification plan for backward compatibility and support impact
