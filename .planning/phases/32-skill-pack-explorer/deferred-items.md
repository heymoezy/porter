# Deferred Items — Phase 32 Skill Pack Explorer

## PKX-04 / PKX-05 Playwright Test Failures (plan 32-00 scaffold issue)

**Discovery:** Plan 32-03 execution — Playwright tests for PKX-04 and PKX-05 fail at login step
**Root cause:** Tests use `#uname` / `#pw` / `.login-btn` / `.sidebar` selectors which were written for the old porter.py HTML admin page. The current React admin login uses email/password fields without those IDs.
**Status:** Pre-existing issue from plan 32-00 test scaffold — NOT caused by plan 32-03 changes.
**Action needed:** Update `loginAdmin()` helper in `tests/skill-pack-explorer.spec.js` to use React admin selectors:
- Email field: `input[type="email"]` or `input[name="email"]`
- Password field: `input[type="password"]`
- Submit button: `button[type="submit"]`
- Wait condition: React app auth state instead of `.sidebar`

**Deferred to:** Next phase planning or dedicated test fix pass
