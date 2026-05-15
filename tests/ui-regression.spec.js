// Porter UI regression tests
// Run: cd /home/lobster/projects/porter/tests && npx playwright test
//
// These tests catch the exact classes of bugs we've been hitting:
// - Elements visible when they shouldn't be
// - Missing headers/titles on tabs
// - Inconsistent padding/inset
// - Visual consistency across all tabs

const { test, expect } = require('@playwright/test');
test.setTimeout(30000);

// ── Auth helper ──────────────────────────────────────────────────────────────

async function login(page) {
  // Refreshed v4.x selectors: #email / #password / role=button. Old #uname/#pw/.login-btn
  // stale across the suite — caught by Plan 48.4-05 and cleaned up in v6.0.1.
  // Post-login shell uses <aside>/<nav> (.sidebar class also retired in the v4.x refresh).
  await page.goto('/login');
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', 'moe@askporter.app');
  await page.fill('#password', 'porter');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForSelector('aside nav, .sidebar, [class*="sidebar"]', { timeout: 15000 });
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
    // v4.x admin shell uses <aside> with <nav> inside (no .sidebar class anymore).
    const shellVisible =
      (await page.locator('aside nav').isVisible().catch(() => false)) ||
      (await page.locator('.sidebar').isVisible().catch(() => false));
    expect(shellVisible).toBe(true);
  });
});

test.describe('Tab Headers — every tab must have a title', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const moduleTabs = [
    { id: 'agents', title: 'AI Agents', selector: '#agents-module .module-title' },
    { id: 'projects', title: 'Projects', selector: '#projects-module .module-title' },
    { id: 'people', title: 'People', selector: '#people-module .module-title' },
    { id: 'tools', title: 'Tools', selector: '#tools-module .module-title' },
    { id: 'models', title: 'Models', selector: '#models-module .module-title' },
  ];

  for (const tab of moduleTabs) {
    test(`${tab.title} tab has module-title`, async ({ page }) => {
      await switchTab(page, tab.id);
      const titleEl = page.locator(tab.selector);
      await expect(titleEl).toBeVisible();
      await expect(titleEl).toHaveText(tab.title);
    });
  }
});

test.describe('Header alignment — all headers same height', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('all module-hdr elements have consistent height', async ({ page }) => {
    const tabs = ['agents', 'projects', 'tools', 'people'];
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

  test('module-panel has 28px horizontal padding', async ({ page }) => {
    await switchTab(page, 'agents');
    const pl = await getStyle(page, '#agents-module', 'paddingLeft');
    const pr = await getStyle(page, '#agents-module', 'paddingRight');
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

test.describe('People tab', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchTab(page, 'people');
  });

  test('has module-title "People"', async ({ page }) => {
    await expect(page.locator('#people-module .module-title')).toHaveText('People');
  });

  test('has filter chips', async ({ page }) => {
    await expect(page.locator('.crm-chip[data-filter="all"]')).toBeVisible();
    await expect(page.locator('.crm-chip[data-filter="people"]')).toBeVisible();
    await expect(page.locator('.crm-chip[data-filter="companies"]')).toBeVisible();
  });

  test('shows people cards in unified directory', async ({ page }) => {
    await page.waitForSelector('.people-card', { timeout: 8000 });
    const cardCount = await page.locator('.people-card').count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
  });

  test('people card shows display name', async ({ page }) => {
    await page.waitForSelector('.people-card-name', { timeout: 10000 });
    const nameEl = page.locator('.people-card-name').first();
    await expect(nameEl).toBeVisible();
    const name = await nameEl.textContent();
    expect(name.length).toBeGreaterThan(0);
  });
});

test.describe('Tab switching — no stale elements', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('only one module-panel is active at a time', async ({ page }) => {
    const tabs = ['agents', 'projects', 'tools', 'connections', 'people', 'models'];
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

  // Current visible nav tabs (for operator role — admin hidden, logs visible)
  const allTabs = ['agents', 'projects', 'models', 'people', 'tools', 'connections', 'logs'];

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

// ═══════════════════════════════════════════════════════════════════════════════
// NAV BAR REGRESSION — ensure sidebar nav structure is never broken
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Nav bar structure', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // Current visible nav items (for operator role — Logs visible)
  const expectedNavItems = [
    'Projects', 'Files', 'People', 'AI Agents', 'Models', 'Tools', 'Connections', 'Memory', 'Logs'
  ];

  test('sidebar contains all expected nav buttons', async ({ page }) => {
    const navLabels = await page.evaluate(() => {
      const btns = document.querySelectorAll('.sidebar nav button .mnav-label');
      return Array.from(btns).map(b => b.textContent.trim());
    });
    for (const item of expectedNavItems) {
      expect(navLabels, `Nav should contain "${item}"`).toContain(item);
    }
  });

  test('sidebar is visible after login', async ({ page }) => {
    const sidebarVisible = await isVisible(page, '.sidebar');
    expect(sidebarVisible).toBe(true);
  });

  test('nav group labels are present', async ({ page }) => {
    const groups = await page.evaluate(() => {
      const labels = document.querySelectorAll('.sidebar nav .mnav-group-label');
      return Array.from(labels).map(l => l.textContent.trim());
    });
    expect(groups.length).toBeGreaterThanOrEqual(3);
  });

  test('clicking each visible nav item does not cause JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    const navButtons = await page.$$('.sidebar nav button.mnav-item');
    for (const btn of navButtons) {
      const visible = await btn.isVisible();
      if (!visible) continue;
      await btn.click();
      await page.waitForTimeout(300);
    }
    expect(errors.length, `JS errors during nav clicks: ${errors.join('; ')}`).toBe(0);
  });

  test('version badge shows in sidebar', async ({ page }) => {
    const versionText = await page.evaluate(() => {
      const els = document.querySelectorAll('.sidebar *');
      for (const el of els) {
        if (el.textContent.includes('PORTER v') && el.children.length === 0) {
          return el.textContent.trim();
        }
      }
      return null;
    });
    expect(versionText).not.toBeNull();
    expect(versionText).toMatch(/PORTER v\d+\.\d+\.\d+/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FILES TAB — toolbar and file list render
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Files tab', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchTab(page, 'files');
  });

  test('has module-title "Files"', async ({ page }) => {
    await expect(page.locator('#allfiles-module .module-title')).toHaveText('Files');
  });

  test('has upload button and file area', async ({ page }) => {
    const uploadLabel = page.locator('#allfiles-module label', { hasText: 'Upload' });
    await expect(uploadLabel).toBeVisible();
    const fileArea = page.locator('#allfiles-list');
    await expect(fileArea).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AGENTS TAB — cards render
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Agents tab', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchTab(page, 'agents');
  });

  test('has persona cards rendered', async ({ page }) => {
    await page.waitForSelector('.persona-card', { timeout: 8000 });
    const cardCount = await page.locator('.persona-card').count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY + LOGS — basic title checks
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Memory tab', () => {
  test('has module-title "Memory"', async ({ page }) => {
    await login(page);
    await switchTab(page, 'memory');
    await expect(page.locator('#memory-module .module-title')).toHaveText('Memory');
  });
});

test.describe('Logs tab', () => {
  test('has title "Logs"', async ({ page }) => {
    await login(page);
    await switchTab(page, 'logs');
    await expect(page.locator('#logs-module .mc-title')).toHaveText('Logs');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT DETAIL — clicking a project opens the detail view
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Project detail', () => {
  test('clicking project card opens detail page', async ({ page }) => {
    await login(page);
    await switchTab(page, 'projects');
    await page.waitForSelector('.project-card', { timeout: 8000 });
    const cardCount = await page.locator('.project-card').count();
    if (cardCount > 0) {
      await page.locator('.project-card').first().click();
      await page.waitForTimeout(800);
      const detailVisible = await page.evaluate(() => {
        const el = document.getElementById('proj-detail-content');
        return el && el.innerHTML.trim().length > 0;
      });
      expect(detailVisible).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POPUP CHAT — opens and closes
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Popup chat', () => {
  test('opens on slash-hint click and closes on X', async ({ page }) => {
    await login(page);
    // Switch to agents tab first — Projects auto-opens popup which hides .slash-hint
    await switchTab(page, 'agents');
    // Close popup if open (Projects auto-opened it)
    await page.evaluate(() => {
      const el = document.getElementById('porter-popup-chat');
      if (el) el.classList.remove('open');
    });
    await page.waitForTimeout(200);
    // Click the "/" Ask Porter hint
    await page.locator('.slash-hint').click();
    await page.waitForTimeout(300);
    const popupOpen = await page.evaluate(() => {
      const el = document.getElementById('porter-popup-chat');
      return el && el.classList.contains('open');
    });
    expect(popupOpen).toBe(true);
    // Close it
    await page.locator('.porter-popup-close').click();
    await page.waitForTimeout(200);
    const popupClosed = await page.evaluate(() => {
      const el = document.getElementById('porter-popup-chat');
      return !el || !el.classList.contains('open');
    });
    expect(popupClosed).toBe(true);
  });
});

test.describe('Screenshot baseline', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const tabs = [
    { id: 'agents', name: 'agents' },
    { id: 'projects', name: 'projects' },
    { id: 'people', name: 'people' },
    { id: 'connections', name: 'connections' },
    { id: 'models', name: 'models' },
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
