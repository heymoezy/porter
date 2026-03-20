# Testing Patterns

**Analysis Date:** 2026-03-20

## Test Framework

**Runner:**
- Playwright (`^1.58.2`)
- Config: `/home/lobster/documents/porter/tests/playwright.config.js`
- Base URL: `http://127.0.0.1:8877`
- Headless Chromium
- Timeout: 15 seconds per test

**Assertion Library:**
- Playwright's native assertions (`expect()`)

**Run Commands:**
```bash
cd /home/lobster/documents/porter/tests && npx playwright test  # Run all tests
cd /home/lobster/documents/porter/tests && npx playwright test --headed  # Headed mode
cd /home/lobster/documents/porter/tests && npx playwright test --debug  # Debug mode
```

**Test Results:**
- Output: `./tests/test-results/`
- Screenshots on failure: `./tests/screenshots/`
- Current count: 35 tests (all E2E UI regression)

## Test File Organization

**Location:**
- Single file: `tests/ui-regression.spec.js`
- Python tests (legacy): `tests/test_p0_p1.py`

**Naming:**
- Test spec file: `<feature>.spec.js`
- Login credentials stored: `tests/auth.json`

**Directory Structure:**
```
/home/lobster/documents/porter/tests/
├── playwright.config.js         # Config
├── ui-regression.spec.js        # Main test suite (35 tests)
├── test_p0_p1.py                # Legacy Python tests
├── setup-auth.js                # Auth bootstrap helper
├── package.json                 # Dependencies
├── node_modules/                # @playwright/test
├── screenshots/                 # Baseline screenshots
└── test-results/                # Failure artifacts
```

## Test Structure

**Suite Organization:**
```javascript
test.describe('Suite Name', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('specific behavior', async ({ page }) => {
    // Arrange
    await switchTab(page, 'agents');

    // Act
    const result = await page.locator('.selector').isVisible();

    // Assert
    expect(result).toBe(true);
  });
});
```

**Patterns:**
- Setup: `test.beforeEach()` — shared auth and navigation
- Async page fixture: Playwright injects page instance
- Navigation: `switchTab(page, tabId)` helper
- Assertions: Playwright's `expect()` with matchers

**Test Count by Category:**
- Auth: 1 test
- Tab headers: 5 tests
- CSS consistency: 3 tests
- Tab switching: 2 tests
- Navigation: 4 tests
- Feature-specific: 15 tests (Projects, People, Agents, Memory, Logs, Files)
- Screenshot baselines: 5 tests

## Mocking

**Framework:** None — Tests are E2E/UI-focused

**Approach:**
- Real backend required (porter.py running on http://127.0.0.1:8877)
- No unit test mocking
- Playwright's page object handles browser automation

**What to Test (E2E):**
- DOM presence and visibility
- Tab switching and state
- CSS layout (padding, height, grid)
- Navigation flow
- Screenshot baselines for regressions

## Fixtures and Factories

**Test Data:**
- Hardcoded login credentials: `moe` / `porter` (in `auth.json`)
- No database factories or fixtures
- Tests depend on baseline data in running Porter instance

**Helper Functions in ui-regression.spec.js:**
```javascript
async function login(page) {
  await page.goto('/login');
  await page.fill('#uname', 'moe');
  await page.fill('#pw', 'porter');
  await page.click('.login-btn');
  await page.waitForSelector('.sidebar', { timeout: 15000 });
}

async function switchTab(page, tabId) {
  await page.click(`#mnav-${tabId}`);
  await page.waitForTimeout(500); // allow JS render
}

async function getStyle(page, selector, prop) {
  return page.evaluate(([sel, p]) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return window.getComputedStyle(el)[p];
  }, [selector, prop]);
}

async function isVisible(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0;
  }, selector);
}
```

## Coverage

**Requirements:** All 35 tests must pass before committing to `porter.py`

**Areas Covered:**
- Auth flow (login)
- Module tab headers and titles
- CSS variable presence and values
- Padding/height consistency
- DOM visibility and state
- Navigation structure and functionality
- Tab-specific features (Projects 3-col grid, People cards, Agents personas, Files toolbar)
- Popup chat open/close
- Screenshot baselines for 5 major tabs
- No JavaScript errors during navigation

**Not Tested:**
- Backend API contract tests
- Unit tests (no test framework configured)
- Component-level assertions
- Data mutations or CRUD operations

## Test Types

**E2E (UI Regression Tests):**
- Scope: Full app workflow from login through tab navigation
- Approach: Playwright via Chromium headless
- Focus: Visual consistency, DOM structure, CSS, navigation flow
- Assertion: `expect(locator).toBeVisible()`, `toHaveText()`, style checks

**Visual Regression:**
- Scope: 5 major tabs (agents, projects, people, connections, models)
- Capture: Screenshots stored in `./screenshots/`
- Comparison: Manual baseline comparison (no auto-diff detected)
- File location: `tests/screenshots/agents.png`, `projects.png`, etc.

**Error Detection:**
- JS errors: Monitored via `page.on('pageerror', err => errors.push(err.message))`
- Assertion: `expect(errors.length).toBe(0)` after nav clicks

**Example Test:**
```javascript
test('every tab shows content when clicked', async ({ page }) => {
  for (const tab of ['agents', 'projects', 'tools']) {
    await switchTab(page, tab);
    const panelActive = await page.evaluate((id) => {
      const panel = document.getElementById(id + '-module');
      return panel?.classList.contains('active') ? 'active' : 'inactive';
    }, tab);
    expect(panelActive).toBe('active');
  }
});
```

## Common Patterns

**Async Testing:**
```javascript
test('async operation completes', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#uname', 'moe');
  await page.click('.login-btn');
  await page.waitForSelector('.sidebar', { timeout: 15000 });
  expect(await page.locator('.sidebar').isVisible()).toBe(true);
});
```

**Computed Style Assertions:**
```javascript
test('module-panel has correct padding', async ({ page }) => {
  const pl = await getStyle(page, '#agents-module', 'paddingLeft');
  const pr = await getStyle(page, '#agents-module', 'paddingRight');
  expect(pl).toBe('28px');
  expect(pr).toBe('28px');
});
```

**DOM Visibility Checks:**
```javascript
test('sidebar is visible after login', async ({ page }) => {
  const sidebarVisible = await isVisible(page, '.sidebar');
  expect(sidebarVisible).toBe(true);
});
```

**Error Monitoring:**
```javascript
test('no JS errors on tab switch', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  for (const tab of ['agents', 'projects', 'tools']) {
    await switchTab(page, tab);
  }
  expect(errors.length).toBe(0);
});
```

**Loop-based Parameterized Tests:**
```javascript
const moduleTabs = [
  { id: 'agents', title: 'AI Agents', selector: '#agents-module .module-title' },
  { id: 'projects', title: 'Projects', selector: '#projects-module .module-title' },
];

for (const tab of moduleTabs) {
  test(`${tab.title} tab has module-title`, async ({ page }) => {
    await switchTab(page, tab.id);
    await expect(page.locator(tab.selector)).toHaveText(tab.title);
  });
}
```

## Adding Tests

**New Tab Test Template:**
```javascript
test.describe('New Feature Tab', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchTab(page, 'newtab');  // tabId from #mnav-newtab
  });

  test('has module-title "New Feature"', async ({ page }) => {
    await expect(page.locator('#newtab-module .module-title')).toHaveText('New Feature');
  });

  test('key element is visible', async ({ page }) => {
    const visible = await isVisible(page, '#newtab-module .key-element');
    expect(visible).toBe(true);
  });

  test('no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    expect(errors.length).toBe(0);
  });
});
```

**Checklist for PR:**
- [ ] New test file or added to `ui-regression.spec.js`
- [ ] Helpers defined or reused (`login`, `switchTab`, `getStyle`, `isVisible`)
- [ ] All 35 tests pass: `cd tests && npx playwright test`
- [ ] No new test breakage
- [ ] Screenshots updated if visual baseline changed

---

*Testing analysis: 2026-03-20*
