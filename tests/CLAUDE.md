# Tests — CLAUDE.md

## Test Stack
- **Framework:** Playwright (Node.js)
- **Run:** `cd /home/lobster/projects/porter/tests && npx playwright test`
- **Config:** `playwright.config.js` — headless Chromium, base URL `http://127.0.0.1:3001`
- **Current count:** 35 tests

## Rules
- All 35 tests must pass before any commit to porter.py
- Never modify tests to make them pass — fix the source code instead
- Screenshots go in `tests/screenshots/` — do not commit unless intentionally updating baselines
- Login creds for tests: `moe` / `porter`

## Test Structure
- `ui-regression.spec.js` — single test file covering:
  - Auth (login flow)
  - Tab headers (every tab has a title)
  - Files tab layout (toolbar, fileArea, hidden elements)
  - Header alignment (consistent heights)
  - CSS consistency (28px padding, no toolbar bg)
  - CSS variables (all --vars defined)
  - Projects tab specifics
  - Tab switching (no stale elements, single active panel)
  - Nav regression (all tabs render, no JS errors)
  - Nav bar structure (buttons, groups, version badge)
  - Screenshot baselines (5 tabs captured)

## Adding Tests
- Use `login(page)` helper for auth
- Use `switchTab(page, tabId)` to navigate — `tabId` matches `#mnav-{id}`
- Use `isVisible(page, selector)` for display checks
- Use `getStyle(page, selector, prop)` for CSS assertions
- `waitForTimeout(500)` after tab switch to allow JS render
