# Release Discipline and Versioning Policy (Mandatory)

## Problem
Implementation is shipping, but release notes and version bumps are inconsistently updated.

## Policy
No feature/fix is considered complete unless versioning and release notes are updated in the same change set.

## Required release actions per delivery
1. Update semantic/app version in source of truth.
2. Add CHANGELOG entry with:
   - version
   - date
   - summary
   - breaking changes (if any)
   - migration notes
3. Add tests/regression note for impacted areas.
4. Include release metadata in final handoff report.

## Commit discipline
- Prefer one commit for code changes and one commit for release notes/version bump, or one combined commit containing both.
- Never merge feature commits without release artifacts.

## PR/Review gate
A run is blocked if any are missing:
- [ ] version updated
- [ ] changelog updated
- [ ] migration notes (if needed)
- [ ] tests listed with results

## Automation recommendation
- Add a CI check that fails if code files changed but CHANGELOG/version files did not.
- Add a "release-check" script and run it at end of every Claude cycle.

## Claude output format (mandatory)
At end of each cycle Claude must return:
1. version changed to
2. changelog section added
3. commits
4. tests run and pass/fail
5. migration notes
