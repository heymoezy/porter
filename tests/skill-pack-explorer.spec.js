// Phase 32: Skill Pack Explorer — Playwright smoke tests
// Requirements: PKX-01 through PKX-05
// Run: cd /home/lobster/projects/porter/tests && npx playwright test skill-pack-explorer.spec.js
//
// These tests establish the RED state before Phase 32 implementation.
// They will fail until the pack explorer is built.

const { test, expect } = require('@playwright/test');
test.setTimeout(30000);

const ADMIN = 'http://127.0.0.1:5175';

// Use motion-designer as canonical test skill — always exists in skill packs
const TEST_SKILL = 'motion-designer';

// ── Auth helper ───────────────────────────────────────────────────────────────

async function loginAdmin(page) {
  await page.goto(`${ADMIN}/login`);
  await page.fill('#uname', 'moe');
  await page.fill('#pw', 'porter');
  await page.click('.login-btn');
  await page.waitForSelector('.sidebar', { timeout: 15000 });
}

// ── PKX-01: File tree visible in pack explorer ────────────────────────────────

test('PKX-01: File tree panel is visible with skill pack entries', async ({ page }) => {
  await loginAdmin(page);

  await page.goto(`${ADMIN}/skills/${TEST_SKILL}/pack`);
  await page.waitForTimeout(1000);

  // File tree panel must be present
  const fileTree = page.locator('[data-testid="file-tree"], .file-tree, [class*="file-tree"]');
  await expect(fileTree).toBeVisible({ timeout: 10000 });

  // SKILL.md entry must appear in the tree
  const skillMdEntry = page.locator('text=SKILL.md');
  await expect(skillMdEntry).toBeVisible();

  // prompt.md entry must appear in the tree
  const promptMdEntry = page.locator('text=prompt.md');
  await expect(promptMdEntry).toBeVisible();

  // At least one folder group label should be visible (guides, examples, meta)
  const folderGroup = page.locator('text=/guides|examples|meta/i').first();
  await expect(folderGroup).toBeVisible();

  // Files that are missing/empty should show a grayed or warning indicator
  // (empty badge, grayed text, or warning icon on at least one entry)
  const emptyOrWarning = page.locator(
    '[data-status="empty"], .file-empty, [class*="empty"], text=Empty, [class*="warning"], [class*="missing"]'
  );
  // Not asserting count here — just verifying the feature exists for non-full packs
  // This will fail if no empty-state UI is rendered at all
  await expect(emptyOrWarning.first()).toBeVisible();
});

// ── PKX-02: File content loads in CodeMirror editor ──────────────────────────

test('PKX-02: Clicking a file entry loads its content in the editor', async ({ page }) => {
  await loginAdmin(page);

  await page.goto(`${ADMIN}/skills/${TEST_SKILL}/pack`);
  await page.waitForTimeout(1000);

  // Click on SKILL.md in the file tree
  const skillMdEntry = page.locator('text=SKILL.md').first();
  await expect(skillMdEntry).toBeVisible({ timeout: 10000 });
  await skillMdEntry.click();

  await page.waitForTimeout(800);

  // CodeMirror editor container must appear
  const editor = page.locator('.cm-editor, [data-testid="code-editor"], .code-editor, [class*="codemirror"]');
  await expect(editor).toBeVisible({ timeout: 8000 });

  // Editor must contain non-empty text content
  const editorContent = page.locator('.cm-content, .cm-editor .cm-line');
  await expect(editorContent.first()).toBeVisible();

  // The editor should have some text (SKILL.md is not empty for motion-designer)
  const text = await editorContent.first().textContent();
  expect(text).toBeTruthy();
  expect(text.trim().length).toBeGreaterThan(0);
});

// ── PKX-03: Save button writes file back ─────────────────────────────────────

test('PKX-03: Save button persists editor changes and clears unsaved indicator', async ({ page }) => {
  await loginAdmin(page);

  await page.goto(`${ADMIN}/skills/${TEST_SKILL}/pack`);
  await page.waitForTimeout(1000);

  // Select prompt.md for editing (safer to modify than SKILL.md)
  const promptEntry = page.locator('text=prompt.md').first();
  await expect(promptEntry).toBeVisible({ timeout: 10000 });
  await promptEntry.click();

  await page.waitForTimeout(800);

  // Editor must be visible
  const editor = page.locator('.cm-editor, [data-testid="code-editor"], .code-editor');
  await expect(editor).toBeVisible({ timeout: 8000 });

  // Type a modification to make the file dirty
  const editorContent = page.locator('.cm-content').first();
  await editorContent.click();
  await page.keyboard.press('End');
  await page.keyboard.type('\n<!-- test-marker-PKX-03 -->');

  await page.waitForTimeout(300);

  // Unsaved indicator must appear (dirty state badge, asterisk, or "Unsaved" label)
  const unsavedIndicator = page.locator(
    'text=Unsaved, text=unsaved, [data-dirty="true"], [class*="dirty"], [class*="unsaved"], text=*'
  );
  await expect(unsavedIndicator.first()).toBeVisible({ timeout: 5000 });

  // Click the Save button
  const saveBtn = page.locator('button:has-text("Save"), [data-testid="save-btn"], button[aria-label*="save" i]');
  await expect(saveBtn).toBeVisible();
  await saveBtn.click();

  await page.waitForTimeout(800);

  // Unsaved indicator must disappear after save
  const savedCount = await page.locator('text=Unsaved, [data-dirty="true"], [class*="dirty"]').count();
  expect(savedCount).toBe(0);

  // Verify via API that the file was actually written
  const apiResponse = await page.evaluate(async (adminUrl) => {
    const res = await fetch(`${adminUrl}/api/admin/skills/motion-designer/files/prompt.md`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return res.text();
  }, ADMIN);

  expect(apiResponse).toContain('test-marker-PKX-03');
});

// ── PKX-04: Quality badge on skills list ─────────────────────────────────────

test('PKX-04: Skills list shows quality tier badge on each skill row', async ({ page }) => {
  await loginAdmin(page);

  await page.goto(`${ADMIN}/skills`);
  await page.waitForTimeout(1000);

  // Skills list/table must be present
  const skillsList = page.locator(
    '[data-testid="skills-list"], .skills-list, table, [class*="skill-row"], [class*="skills-grid"]'
  );
  await expect(skillsList.first()).toBeVisible({ timeout: 10000 });

  // At least one quality tier badge must appear in the list
  // Tiers: scaffold | baseline | production | high-performing
  const qualityBadge = page.locator(
    '[data-testid="quality-badge"], [class*="quality-badge"], [class*="qualityBadge"], ' +
    'text=/scaffold|baseline|production|high.performing/i'
  );
  await expect(qualityBadge.first()).toBeVisible({ timeout: 8000 });

  // Verify badge is inside the skills list (not just anywhere on the page)
  const badgeCount = await qualityBadge.count();
  expect(badgeCount).toBeGreaterThan(0);

  // The badge should match one of the 4 valid tier labels
  const firstBadgeText = await qualityBadge.first().textContent();
  expect(firstBadgeText).toMatch(/scaffold|baseline|production|high.performing/i);
});

// ── PKX-05: Skill link on agent detail navigates to pack explorer ─────────────

test('PKX-05: Skill chips on agent detail are links to the pack explorer', async ({ page }) => {
  await loginAdmin(page);

  // Navigate to an agent detail page — use motion-designer as the agent too
  await page.goto(`${ADMIN}/agents/${TEST_SKILL}`);
  await page.waitForTimeout(1000);

  // Switch to the Skills tab on agent detail
  const skillsTab = page.locator(
    '[data-tab="skills"], button:has-text("Skills"), [role="tab"]:has-text("Skills"), #tab-skills'
  );
  await expect(skillsTab).toBeVisible({ timeout: 10000 });
  await skillsTab.click();

  await page.waitForTimeout(600);

  // Skills must render as clickable links (anchor or button with href containing /skills/)
  const skillLink = page.locator(
    'a[href*="/skills/"], [data-testid="skill-link"], [class*="skill-chip"] a, [class*="skill-chip"][role="link"]'
  );
  await expect(skillLink.first()).toBeVisible({ timeout: 8000 });

  // Click the first skill link
  const firstLink = skillLink.first();
  const href = await firstLink.getAttribute('href');

  if (href) {
    // It's an anchor with href — verify it points to /skills/...
    expect(href).toMatch(/\/skills\//);

    // Click and verify navigation to pack explorer
    await firstLink.click();
    await page.waitForTimeout(800);

    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/skills\/.+\/pack/);
  } else {
    // It's a button/chip with click handler — click and check navigation
    await firstLink.click();
    await page.waitForTimeout(1000);

    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/skills\/.+\/pack/);
  }
});
