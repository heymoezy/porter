// Porter UI regression tests
// Run: cd /home/lobster/documents/porter/tests && npx playwright test
//
// These tests catch the exact classes of bugs we've been hitting:
// - Elements visible when they shouldn't be (banner, searchCountBar)
// - Missing headers/titles on tabs
// - Inconsistent padding/inset
// - Visual consistency across all tabs

const { test, expect } = require('@playwright/test');

// ── Auth helper ──────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto('/login');
  await page.fill('#uname', 'admin');
  await page.fill('#pw', 'porter');
  await page.click('.login-btn');
  await page.waitForSelector('.sidebar', { timeout: 5000 });
}

// ── Helper: switch to a module tab ───────────────────────────────────────────

async function switchTab(page, tabId) {
  await page.click(`#mnav-${tabId}`);
  await page.waitForTimeout(500); // allow JS to render
}

// ── Helper: get computed style ───────────────────────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Auth', () => {
  test('can log in and reach main app', async ({ page }) => {
    await login(page);
    expect(await page.locator('.sidebar').isVisible()).toBe(true);
  });
});

test.describe('Tab Headers — every tab must have a title', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const moduleTabs = [
    { id: 'overview', title: 'Chat', selector: '#overview-module .module-title' },
    { id: 'agents', title: 'Orchestration', selector: '#agents-module .module-title' },
    { id: 'projects', title: 'Projects', selector: '#projects-module .module-title' },
    { id: 'locations', title: 'Locations', selector: '#locations-module .module-title' },
    { id: 'capabilities', title: 'Extensions', selector: '#capabilities-module .module-title' },
  ];

  for (const tab of moduleTabs) {
    test(`${tab.title} tab has module-title`, async ({ page }) => {
      await switchTab(page, tab.id);
      const titleEl = page.locator(tab.selector);
      await expect(titleEl).toBeVisible();
      await expect(titleEl).toHaveText(tab.title);
    });
  }

  test('Files tab has title in toolbar', async ({ page }) => {
    await switchTab(page, 'files');
    const titleEl = page.locator('#mainToolbar .module-title');
    await expect(titleEl).toBeVisible();
    await expect(titleEl).toHaveText('Files');
  });
});

test.describe('Files tab — home view layout', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchTab(page, 'files');
  });

  test('shows device home view with first mount auto-expanded', async ({ page }) => {
    // Home view should auto-select first mount, showing fhome-entry elements
    await page.waitForTimeout(1000); // allow selectMount to load
    const device = page.locator('.fhome-device').first();
    await expect(device).toBeVisible({ timeout: 5000 });
    // First mount should be expanded with file entries visible
    const entry = page.locator('.fhome-entry').first();
    await expect(entry).toBeVisible({ timeout: 5000 });
  });

  test('list-header is hidden on file home view', async ({ page }) => {
    const headerVisible = await isVisible(page, '.list-header');
    expect(headerVisible).toBe(false);
  });

  test('searchCountBar is NOT visible when no search is active', async ({ page }) => {
    const barVisible = await isVisible(page, '#searchCountBar');
    expect(barVisible).toBe(false);
  });

  test('selectionToolbar is NOT visible by default', async ({ page }) => {
    const selVisible = await isVisible(page, '#selectionToolbar');
    expect(selVisible).toBe(false);
  });

  test('toolbar is visible', async ({ page }) => {
    const toolbarVisible = await isVisible(page, '#mainToolbar');
    expect(toolbarVisible).toBe(true);
  });

  test('fileArea is visible', async ({ page }) => {
    const areaVisible = await isVisible(page, '#fileArea');
    expect(areaVisible).toBe(true);
  });

  test('search input is NOT in toolbar', async ({ page }) => {
    const searchExists = await page.locator('#searchInput').count();
    expect(searchExists).toBe(0);
  });
});

test.describe('Header alignment — all headers same height', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('all module-hdr elements have consistent height', async ({ page }) => {
    const tabs = ['agents', 'projects', 'locations', 'capabilities'];
    const heights = [];
    for (const tab of tabs) {
      await switchTab(page, tab);
      const h = await page.evaluate((id) => {
        const hdr = document.querySelector(`#${id}-module .module-hdr`);
        return hdr ? hdr.getBoundingClientRect().height : null;
      }, tab);
      heights.push({ tab, height: h });
    }
    // All module-hdr should be the same height (min-height ensures this)
    const unique = new Set(heights.map(h => h.height));
    expect(unique.size, `Headers should all be same height: ${JSON.stringify(heights)}`).toBe(1);
  });
});

test.describe('CSS consistency — horizontal padding', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('file-area has 28px horizontal padding', async ({ page }) => {
    await switchTab(page, 'files');
    const pl = await getStyle(page, '.file-area', 'paddingLeft');
    const pr = await getStyle(page, '.file-area', 'paddingRight');
    expect(pl).toBe('28px');
    expect(pr).toBe('28px');
  });

  test('toolbar has 28px horizontal padding', async ({ page }) => {
    await switchTab(page, 'files');
    const pl = await getStyle(page, '.toolbar', 'paddingLeft');
    const pr = await getStyle(page, '.toolbar', 'paddingRight');
    expect(pl).toBe('28px');
    expect(pr).toBe('28px');
  });

  test('toolbar has NO background color (inherits --bg)', async ({ page }) => {
    await switchTab(page, 'files');
    const bg = await getStyle(page, '.toolbar', 'backgroundColor');
    const bodyBg = await getStyle(page, 'body', 'backgroundColor');
    // Toolbar bg should match body bg (both --bg) or be transparent
    expect(bg === bodyBg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent').toBe(true);
  });

  test('module-panel has 28px horizontal padding', async ({ page }) => {
    await switchTab(page, 'overview');
    const pl = await getStyle(page, '#overview-module', 'paddingLeft');
    const pr = await getStyle(page, '#overview-module', 'paddingRight');
    expect(pl).toBe('28px');
    expect(pr).toBe('28px');
  });
});

test.describe('CSS variables — all referenced vars are defined', () => {
  test('critical CSS variables are defined in :root', async ({ page }) => {
    await login(page);
    const vars = ['--bg', '--surface', '--raised', '--border', '--border2',
                  '--accent', '--text', '--text2', '--text3', '--danger',
                  '--bg1', '--bg2', '--bg3', '--panel', '--surface2'];
    for (const v of vars) {
      const val = await page.evaluate((varName) =>
        getComputedStyle(document.documentElement).getPropertyValue(varName).trim(),
        v
      );
      expect(val, `CSS variable ${v} should be defined`).not.toBe('');
    }
  });
});

test.describe('Projects tab', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchTab(page, 'projects');
  });

  test('has module-title "Projects"', async ({ page }) => {
    await expect(page.locator('#projects-module .module-title')).toHaveText('Projects');
  });

  test('no "New Project" button in header (refresh allowed)', async ({ page }) => {
    // Refresh button exists, but no "New Project" / "Create" button
    const allBtns = page.locator('#projects-module .module-hdr button');
    const createBtn = page.locator('#projects-module .module-hdr button:has-text("New"), #projects-module .module-hdr button:has-text("Create")');
    await expect(createBtn).toHaveCount(0);
  });

  test('proj-row grid has exactly 3 columns', async ({ page }) => {
    // Only testable if projects exist; skip if no projects
    const rowCount = await page.locator('.proj-row').count();
    if (rowCount > 0) {
      const cols = await getStyle(page, '.proj-row', 'gridTemplateColumns');
      const colCount = cols.split(/\s+/).length;
      expect(colCount).toBe(3);
    }
  });
});

test.describe('Locations tab', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchTab(page, 'locations');
    await page.waitForTimeout(500); // allow render
  });

  test('no redundant "Devices" section label', async ({ page }) => {
    const devicesLabel = await page.evaluate(() => {
      const els = document.querySelectorAll('#loc-list div');
      for (const el of els) {
        if (el.textContent.trim() === 'Devices') return true;
      }
      return false;
    });
    expect(devicesLabel).toBe(false);
  });
});

test.describe('Tab switching — no stale elements', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('switching away from Files hides all Files elements', async ({ page }) => {
    await switchTab(page, 'files');
    await switchTab(page, 'overview');

    expect(await isVisible(page, '#mainToolbar')).toBe(false);
    expect(await isVisible(page, '#fileArea')).toBe(false);
    expect(await isVisible(page, '#banner')).toBe(false);
    expect(await isVisible(page, '#searchCountBar')).toBe(false);
    expect(await isVisible(page, '#file-results-footer')).toBe(false);
  });

  test('only one module-panel is active at a time', async ({ page }) => {
    const tabs = ['overview', 'agents', 'projects', 'locations', 'capabilities'];
    for (const tab of tabs) {
      await switchTab(page, tab);
      const activeCount = await page.evaluate(() =>
        document.querySelectorAll('.module-panel.active').length
      );
      expect(activeCount, `Tab ${tab} should have exactly 1 active panel`).toBe(1);
    }
  });
});

test.describe('Nav regression — all tabs render content', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const allTabs = ['overview', 'agents', 'memory', 'capabilities', 'projects', 'workflows', 'locations', 'admin'];

  test('every tab shows content when clicked', async ({ page }) => {
    for (const tab of allTabs) {
      await switchTab(page, tab);
      const panelActive = await page.evaluate((id) => {
        const panel = document.getElementById(id + '-module');
        if (!panel) return 'panel-not-found';
        return panel.classList.contains('active') ? 'active' : 'inactive';
      }, tab);
      expect(panelActive, `${tab} module-panel should be active`).toBe('active');
    }
  });

  test('no JS errors on tab switch', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    for (const tab of allTabs) {
      await switchTab(page, tab);
    }
    expect(errors.length, `JS errors found: ${errors.join('; ')}`).toBe(0);
  });
});

test.describe('Screenshot baseline', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // Take screenshots of every tab for visual review
  const tabs = [
    { id: 'overview', name: 'command-center' },
    { id: 'agents', name: 'agents' },
    { id: 'projects', name: 'projects' },
    { id: 'files', name: 'files' },
    { id: 'locations', name: 'locations' },
    { id: 'capabilities', name: 'extensions' },
  ];

  for (const tab of tabs) {
    test(`capture ${tab.name}`, async ({ page }) => {
      await switchTab(page, tab.id);
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `./screenshots/${tab.name}.png`,
        fullPage: false,
      });
    });
  }
});
