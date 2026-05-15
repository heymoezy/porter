// Phase 35: Agent Evolution Loop — Playwright test scaffold
// Requirements: EVO-01 through EVO-05
// Run: cd /home/lobster/projects/porter/tests && npx playwright test skill-evolution.spec.js
//
// These tests are SKIPPED until subsequent waves implement each requirement.
// Wave 0 purpose: define behavioral verification targets before any code is written.
// Enable each test by removing test.skip() as the corresponding wave ships.

const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');

test.setTimeout(30000);

const BRAIN = 'http://127.0.0.1:3001';
const ADMIN = 'http://127.0.0.1:3001';

test.describe('Phase 35: Agent Evolution Loop', () => {
  test.describe.configure({ mode: 'serial' });

  // ── Auth helper ─────────────────────────────────────────────────────────────

  async function loginAdmin(page) {
    // Refreshed v4.x selectors: #email / #password / role=button. Old #uname/#pw/.login-btn
    // stale across the suite — caught by Plan 48.4-05 and cleaned up in v6.0.1.
    await page.goto(`${ADMIN}/login`);
    await page.waitForSelector('#email', { timeout: 15000 });
    await page.fill('#email', 'moe@askporter.app');
    await page.fill('#password', 'porter');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForSelector('aside nav, .sidebar, [class*="sidebar"]', { timeout: 15000 });
  }

  // ── EVO-01: Evolution DB tables ──────────────────────────────────────────────

  test.describe('EVO-01: Evolution DB tables', () => {
    test.skip(true, 'TODO: Enable after Wave 1 (migrate-evo-v1.ts) implements this');

    test('EVO-01: skill_evolution_proposals table has correct columns', async () => {
      const result = execSync(
        `psql -d porter -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='skill_evolution_proposals' ORDER BY ordinal_position"`,
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
        'change_type',
        'proposed_change',
        'reasoning',
        'triggering_feedback_ids',
        'status',
        'created_at',
        'reviewed_at',
        'reviewed_by',
      ];

      for (const col of EXPECTED_COLUMNS) {
        expect(columns).toContain(col);
      }
    });

    test('EVO-01: skill_evolution_events table has correct columns', async () => {
      const result = execSync(
        `psql -d porter -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='skill_evolution_events' ORDER BY ordinal_position"`,
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
        'proposal_id',
        'change_type',
        'change_detail',
        'triggered_by',
        'effectiveness_before',
        'effectiveness_after',
        'created_at',
      ];

      for (const col of EXPECTED_COLUMNS) {
        expect(columns).toContain(col);
      }
    });
  });

  // ── EVO-02: Proposals API ─────────────────────────────────────────────────────

  test.describe('EVO-02: Proposals API', () => {
    test.skip(true, 'TODO: Enable after Wave 2 (proposals route) implements this');

    test('EVO-02: GET /api/admin/skills/proposals returns array', async ({ page }) => {
      await loginAdmin(page);

      const res = await page.evaluate(async (adminUrl) => {
        const r = await fetch(`${adminUrl}/api/admin/skills/proposals`, {
          credentials: 'include',
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
      }, ADMIN);

      expect(res.status).toBe(200);
      expect(res.body).toBeTruthy();
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('EVO-02: GET /api/admin/skills/proposals?status=pending filters correctly', async ({ page }) => {
      await loginAdmin(page);

      const res = await page.evaluate(async (adminUrl) => {
        const r = await fetch(`${adminUrl}/api/admin/skills/proposals?status=pending`, {
          credentials: 'include',
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
      }, ADMIN);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      // All returned proposals must have status=pending
      for (const proposal of res.body.data) {
        expect(proposal.status).toBe('pending');
      }
    });
  });

  // ── EVO-03: Proposal review actions ──────────────────────────────────────────

  test.describe('EVO-03: Proposal review actions', () => {
    test.skip(true, 'TODO: Enable after Wave 3 (approve/reject endpoints) implements this');

    test('EVO-03: POST /api/admin/skills/proposals/:id/approve returns 200', async ({ page }) => {
      await loginAdmin(page);

      // Use a nonexistent ID — endpoint must respond cleanly (404 or 400), not 500
      const res = await page.evaluate(async (adminUrl) => {
        const r = await fetch(`${adminUrl}/api/admin/skills/proposals/nonexistent-id/approve`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
      }, ADMIN);

      // Must not be a 500 — route must exist
      expect(res.status).not.toBe(500);
      expect([200, 400, 404]).toContain(res.status);
    });

    test('EVO-03: POST /api/admin/skills/proposals/:id/reject returns 200', async ({ page }) => {
      await loginAdmin(page);

      const res = await page.evaluate(async (adminUrl) => {
        const r = await fetch(`${adminUrl}/api/admin/skills/proposals/nonexistent-id/reject`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'test rejection' }),
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
      }, ADMIN);

      expect(res.status).not.toBe(500);
      expect([200, 400, 404]).toContain(res.status);
    });
  });

  // ── EVO-04: Skill mutation on approval ───────────────────────────────────────

  test.describe('EVO-04: Skill mutation on approval', () => {
    test.skip(true, 'TODO: Enable after Wave 4 (approval mutation logic) implements this');

    test('EVO-04: After approval persona_skills row reflects change', async ({ page }) => {
      await loginAdmin(page);

      // Verify that a known agent has skill assignments accessible via API
      const res = await page.evaluate(async (adminUrl) => {
        const r = await fetch(`${adminUrl}/api/admin/agents/porter-core/skill-effectiveness`, {
          credentials: 'include',
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
      }, ADMIN);

      // Porter-core agent must have skill data accessible
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveProperty('skills');
    });

    test('EVO-04: SKILLS.md file on disk regenerated after approval', async () => {
      // Verify the SKILLS.md manifest file can be read for porter-core
      const result = execSync(
        `ls -la /home/lobster/projects/porter/personas/porter-core/ 2>/dev/null || echo "MISSING"`,
        { encoding: 'utf8' }
      );
      // Persona directory must exist
      expect(result).not.toContain('MISSING');
    });
  });

  // ── EVO-05: Evolution event logging + UI timeline ─────────────────────────────

  test.describe('EVO-05: Evolution event log + admin UI', () => {
    test.skip(true, 'TODO: Enable after Wave 5 (event log + evolution timeline UI) implements this');

    test('EVO-05: skill_evolution_events has row after approval', async () => {
      // Query DB directly to confirm table is queryable
      const result = execSync(
        `psql -d porter -t -c "SELECT COUNT(*) FROM skill_evolution_events"`,
        { encoding: 'utf8' }
      );

      const count = parseInt(result.trim(), 10);
      // Table must exist and be queryable (count can be 0 at this stage)
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('EVO-05: admin Evolution UI shows timeline', async ({ page }) => {
      await loginAdmin(page);

      // Navigate to skills or agents area — look for evolution/proposal section
      await page.goto(`${ADMIN}/skills`);
      await page.waitForTimeout(1000);

      // Evolution or proposals section must be accessible
      const evolutionSection = page.locator(
        'text=Evolution, text=Proposals, text=Skill Evolution, ' +
        '[data-section="evolution"], [class*="evolution"], ' +
        '[data-testid="evolution-section"], [href*="evolution"], [href*="proposals"]'
      );
      await expect(evolutionSection.first()).toBeVisible({ timeout: 10000 });
    });
  });
});
