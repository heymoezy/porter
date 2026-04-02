// Phase 34: Feedback Telemetry — Playwright test scaffold
// Requirements: FBK-01 through FBK-05
// Run: cd /home/lobster/projects/porter/tests && npx playwright test skill-feedback.spec.js
//
// These tests are SKIPPED until subsequent waves implement each requirement.
// Wave 0 purpose: define behavioral verification targets before any code is written.
// Enable each test by removing test.skip() as the corresponding wave ships.

const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');

test.setTimeout(30000);

const BRAIN = 'http://127.0.0.1:3001';
const ADMIN = 'http://127.0.0.1:5175';

test.describe('Phase 34: Feedback Telemetry', () => {
  test.describe.configure({ mode: 'serial' });

  // ── Auth helper ─────────────────────────────────────────────────────────────

  async function loginAdmin(page) {
    await page.goto(`${ADMIN}/login`);
    await page.fill('#uname', 'moe');
    await page.fill('#pw', 'porter');
    await page.click('.login-btn');
    await page.waitForSelector('.sidebar', { timeout: 15000 });
  }

  // ── FBK-01: skill_feedback_events table ─────────────────────────────────────

  test.describe('FBK-01: skill_feedback_events table', () => {
    test.skip(true, 'TODO: Enable after Wave 1 (migrate-fbk-v1.ts) implements this');

    test('FBK-01: skill_feedback_events table has correct columns', async () => {
      // Verify via psql that the table exists with all expected columns
      // Expected: id, persona_id, skill_id, dispatch_id, event_type, note, created_at
      const result = execSync(
        `psql -d porter -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='skill_feedback_events' ORDER BY ordinal_position"`,
        { encoding: 'utf8' }
      );

      const columns = result
        .split('\n')
        .map(c => c.trim())
        .filter(Boolean);

      const EXPECTED_COLUMNS = [
        'id',
        'persona_id',
        'skill_id',
        'dispatch_id',
        'event_type',
        'note',
        'created_at',
      ];

      for (const col of EXPECTED_COLUMNS) {
        expect(columns).toContain(col);
      }
    });
  });

  // ── FBK-02: persona_skills counter columns ───────────────────────────────────

  test.describe('FBK-02: persona_skills counter columns', () => {
    test.skip(true, 'TODO: Enable after Wave 1 (migrate-fbk-v1.ts) implements this');

    test('FBK-02: persona_skills has feedback counter columns', async () => {
      // Verify via psql that persona_skills has all 6 new counter columns
      const result = execSync(
        `psql -d porter -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='persona_skills' AND column_name IN ('times_selected','times_completed','positive_feedback_count','negative_feedback_count','last_used_at','effectiveness_score')"`,
        { encoding: 'utf8' }
      );

      const columns = result
        .split('\n')
        .map(c => c.trim())
        .filter(Boolean);

      const EXPECTED_COLUMNS = [
        'times_selected',
        'times_completed',
        'positive_feedback_count',
        'negative_feedback_count',
        'last_used_at',
        'effectiveness_score',
      ];

      expect(columns.length).toBe(EXPECTED_COLUMNS.length);
      for (const col of EXPECTED_COLUMNS) {
        expect(columns).toContain(col);
      }
    });
  });

  // ── FBK-03: Feedback endpoint + thumbs UI ────────────────────────────────────

  test.describe('FBK-03: Feedback endpoint and thumbs UI', () => {
    test.skip(true, 'TODO: Enable after Wave 2 (feedback.ts route + chat-panel.tsx thumbs) implements this');

    test('FBK-03: POST /api/v1/feedback/:dispatchId returns structured response', async ({ request }) => {
      // Unauthenticated request to a nonexistent dispatch ID
      // Must return 401 (no auth) or 404 (dispatch not found) — NOT 500
      const res = await request.post(`${BRAIN}/api/v1/feedback/nonexistent-dispatch-id`, {
        data: { event_type: 'positive' },
        failOnStatusCode: false,
      });

      // Must not be a 500 server error
      expect(res.status()).not.toBe(500);

      // Must be either auth failure or not-found — not a routing miss
      expect([400, 401, 403, 404]).toContain(res.status());

      // Response must be valid JSON
      const body = await res.json().catch(() => null);
      expect(body).not.toBeNull();
    });

    test('FBK-03: Chat panel shows thumbs-up/down buttons on assistant messages', async ({ page }) => {
      // Login and navigate to a project chat page with existing messages
      await loginAdmin(page);

      // Navigate to chat — use the home/root chat
      await page.goto(`${ADMIN}/`);
      await page.waitForTimeout(1500);

      // Thumbs-up button must be present on at least one assistant message
      const thumbsUp = page.locator('[title="Good response"], [aria-label="Good response"], button:has(svg[class*="thumb"]):has-text("")');
      // Use broader selector first — look for lucide ThumbsUp icon or feedback buttons
      const feedbackButtons = page.locator(
        '[data-feedback="positive"], [data-feedback="negative"], ' +
        '.feedback-btn, [class*="feedback-btn"], ' +
        '[title*="Good"], [title*="Poor"], [title*="helpful"], ' +
        '[aria-label*="feedback"], [aria-label*="thumbs"]'
      );
      await expect(feedbackButtons.first()).toBeVisible({ timeout: 10000 });
    });
  });

  // ── FBK-04: Effectiveness API endpoints ──────────────────────────────────────

  test.describe('FBK-04: Effectiveness API endpoints', () => {
    test.skip(true, 'TODO: Enable after Wave 3 (admin route extensions) implements this');

    test('FBK-04: GET /api/admin/skills/:id/effectiveness returns data', async ({ page }) => {
      // Login first to get session cookie for admin API calls
      await loginAdmin(page);

      const res = await page.evaluate(async (adminUrl) => {
        const r = await fetch(`${adminUrl}/api/admin/skills/motion-designer/effectiveness`, {
          credentials: 'include',
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
      }, ADMIN);

      // Must return 200 with ok envelope
      expect(res.status).toBe(200);
      expect(res.body).toBeTruthy();
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toBeTruthy();
      expect(res.body.data).toHaveProperty('skillId');
      expect(res.body.data).toHaveProperty('agents');
      expect(Array.isArray(res.body.data.agents)).toBe(true);
    });

    test('FBK-04: GET /api/admin/agents/:id/skill-effectiveness returns data', async ({ page }) => {
      await loginAdmin(page);

      // Get a real agent ID first
      const agentsRes = await page.evaluate(async (adminUrl) => {
        const r = await fetch(`${adminUrl}/api/admin/agents?limit=1`, {
          credentials: 'include',
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
      }, ADMIN);

      // Use first agent id (or a known id if listing fails)
      const agentId =
        agentsRes.body?.data?.[0]?.id ||
        agentsRes.body?.agents?.[0]?.id ||
        'porter-core';

      const res = await page.evaluate(async ({ adminUrl, id }) => {
        const r = await fetch(`${adminUrl}/api/admin/agents/${id}/skill-effectiveness`, {
          credentials: 'include',
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
      }, { adminUrl: ADMIN, id: agentId });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveProperty('agentId');
      expect(res.body.data).toHaveProperty('skills');
      expect(Array.isArray(res.body.data.skills)).toBe(true);
    });

    test('FBK-04: GET /api/admin/templates/:id/skill-effectiveness returns data', async ({ page }) => {
      await loginAdmin(page);

      // Get a real template ID
      const templatesRes = await page.evaluate(async (adminUrl) => {
        const r = await fetch(`${adminUrl}/api/admin/templates?limit=1`, {
          credentials: 'include',
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
      }, ADMIN);

      const templateId =
        templatesRes.body?.data?.[0]?.id ||
        templatesRes.body?.templates?.[0]?.id ||
        'motion-designer';

      const res = await page.evaluate(async ({ adminUrl, id }) => {
        const r = await fetch(`${adminUrl}/api/admin/templates/${id}/skill-effectiveness`, {
          credentials: 'include',
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
      }, { adminUrl: ADMIN, id: templateId });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveProperty('templateId');
      expect(res.body.data).toHaveProperty('skills');
      expect(Array.isArray(res.body.data.skills)).toBe(true);
    });
  });

  // ── FBK-05: Admin pages show effectiveness section ────────────────────────────

  test.describe('FBK-05: Admin effectiveness UI', () => {
    test.skip(true, 'TODO: Enable after Wave 4 (admin UI extensions) implements this');

    test('FBK-05: Skill detail page has effectiveness section', async ({ page }) => {
      await loginAdmin(page);

      // Navigate to a known skill's detail page
      await page.goto(`${ADMIN}/skills/motion-designer`);
      await page.waitForTimeout(1000);

      // Effectiveness section must be visible
      const effectivenessSection = page.locator(
        'text=Effectiveness, text=Skill Effectiveness, ' +
        '[data-section="effectiveness"], [class*="effectiveness"], ' +
        '[data-testid="effectiveness-section"]'
      );
      await expect(effectivenessSection.first()).toBeVisible({ timeout: 10000 });
    });

    test('FBK-05: Agent detail page shows skill effectiveness data', async ({ page }) => {
      await loginAdmin(page);

      // Navigate to an agent that has skills
      await page.goto(`${ADMIN}/agents/porter-core`);
      await page.waitForTimeout(1000);

      // Switch to Skills tab
      const skillsTab = page.locator(
        '[data-tab="skills"], button:has-text("Skills"), [role="tab"]:has-text("Skills"), #tab-skills'
      );
      await expect(skillsTab).toBeVisible({ timeout: 10000 });
      await skillsTab.click();
      await page.waitForTimeout(600);

      // Effectiveness column or section must be visible on skills tab
      const effectivenessIndicator = page.locator(
        'text=Effectiveness, text=Score, text=Feedback, ' +
        '[class*="effectiveness"], [data-testid*="effectiveness"]'
      );
      await expect(effectivenessIndicator.first()).toBeVisible({ timeout: 8000 });
    });

    test('FBK-05: Template detail page shows skill effectiveness data', async ({ page }) => {
      await loginAdmin(page);

      // Navigate to a template with skills
      await page.goto(`${ADMIN}/templates/motion-designer`);
      await page.waitForTimeout(1000);

      // Skills tab or section with effectiveness
      const skillsSection = page.locator(
        'button:has-text("Skills"), [role="tab"]:has-text("Skills"), text=Skills'
      );
      if (await skillsSection.first().isVisible()) {
        await skillsSection.first().click();
        await page.waitForTimeout(600);
      }

      const effectivenessIndicator = page.locator(
        'text=Effectiveness, text=Score, ' +
        '[class*="effectiveness"], [data-testid*="effectiveness"]'
      );
      await expect(effectivenessIndicator.first()).toBeVisible({ timeout: 8000 });
    });
  });
});
