// tests/dreams.spec.js — Phase 48.4 Review Surface Playwright scaffold
// Covers RVS-08..RVS-13. Each test starts as test.skip() so the file passes
// Wave 1 unchanged. As Plans 03/04/05 land, the per-test .skip flips off:
//   - Plan 03 enables RVS-08 (nav + route), RVS-09 (list + filter)
//   - Plan 04 enables RVS-10/10b (drawer + accept/reject + confirm modal),
//                  RVS-11 (run-history sidebar), RVS-12 (failure-mode toasts)
//   - Plan 05 enables RVS-13 (full E2E loop: dispatch → SSE → accept → DB)
//
// CommonJS module shape mirrors tests/skill-evolution.spec.js (the canonical
// scaffold-then-enable predecessor). Auth uses the same #uname / #pw / .login-btn
// selectors as the rest of the suite. DB probes use execSync('psql -d porter -tAc').

const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');

test.setTimeout(30000);

const ADMIN = 'http://127.0.0.1:3001';
const SMOKE_SILO = 'software-smoke-48.4';

function psql(sql) {
  return execSync(
    `psql -d porter -tAc "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8' }
  ).trim();
}

async function loginAdmin(page) {
  await page.goto(`${ADMIN}/login`);
  await page.fill('#uname', 'moe');
  await page.fill('#pw', 'porter');
  await page.click('.login-btn');
  await page.waitForSelector('.sidebar', { timeout: 15000 });
}

test.describe('Phase 48.4: Review Surface', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    // Seed smoke silo + fixtures so each test is deterministic.
    // Pre-implementation: fixture insert may fail because schema rows from 48.3
    // don't exist or smoke silo can't be created — non-fatal; per-test .skip
    // keeps the file passing.
    try {
      execSync('psql -d porter -f tests/fixtures/dreams-mock-proposals.sql', { stdio: 'pipe' });
    } catch (e) {
      // intentionally swallowed — tests are .skip()'d in Wave 1
    }
  });

  test.afterEach(async () => {
    // Clean up smoke silo rows; mirror smoke-48.4.sh cleanup() shape.
    try {
      execSync(`psql -d porter -c "DELETE FROM memory_proposals WHERE silo_id='${SMOKE_SILO}' OR id LIKE 'mp-smoke-48.4-%'"`, { stdio: 'pipe' });
      execSync(`psql -d porter -c "DELETE FROM dream_runs WHERE silo_id='${SMOKE_SILO}' OR id LIKE 'dr-smoke-48.4-%'"`, { stdio: 'pipe' });
      execSync(`psql -d porter -c "DELETE FROM directives WHERE scope='silo' AND scope_id='${SMOKE_SILO}'"`, { stdio: 'pipe' });
      execSync(`psql -d porter -c "DELETE FROM silos WHERE id='${SMOKE_SILO}'"`, { stdio: 'pipe' });
      execSync(`psql -d porter -c "DELETE FROM intellect_events WHERE details_json->>'silo_id'='${SMOKE_SILO}' OR details_json->>'proposal_id' LIKE 'mp-smoke-48.4-%'"`, { stdio: 'pipe' });
    } catch (e) {
      // intentionally swallowed
    }
  });

  // ── RVS-08: Frontend route /dreams loads with sidebar nav entry ──────────
  test.describe('RVS-08: sidebar nav + /dreams route', () => {
    test('RVS-08: /dreams route loads with Dreams heading and sidebar entry', async ({ page }) => {
      await loginAdmin(page);
      await page.goto(`${ADMIN}/dreams`);
      await expect(page).toHaveURL(/\/dreams/);
      await expect(page.getByRole('heading', { name: /Dreams/i })).toBeVisible();
      // Sidebar nav item exists (with Moon icon per RESEARCH § Frontend Route + Nav Placement)
      await expect(page.locator('aside, .sidebar').getByText(/Dreams/i).first()).toBeVisible();
    });
  });

  // ── RVS-09: Dreams list renders with filters + table ──────────────────────
  test.describe('RVS-09: Dreams list page filters + table', () => {
    test('RVS-09: list page renders filters, table rows, Run Now button, count badges', async ({ page }) => {
      await loginAdmin(page);
      await page.goto(`${ADMIN}/dreams`);

      // Silo filter present (default 'software') — Radix Select renders as a
      // combobox button; interact via role rather than .fill() (textbox).
      const siloFilter = page.locator('#silo-filter');
      await expect(siloFilter).toBeVisible();
      // Status filter present (default 'pending')
      const statusFilter = page.locator('#status-filter');
      await expect(statusFilter).toBeVisible();

      // Switch silo filter to smoke silo via Radix Select pattern: click trigger,
      // then click the option in the rendered SelectContent portal.
      await siloFilter.click();
      await page.getByRole('option', { name: /software-smoke-48\.4/i }).click();

      // 7 seeded rows in fixture: 1 new_directive + 2 supersede + 2 merge + 2 delete.
      await expect(page.locator('table tbody tr')).toHaveCount(7, { timeout: 10000 });

      // Run Now button present
      await expect(page.getByRole('button', { name: /Run Now/i })).toBeVisible();
      // Count badges (pending = 7 in smoke silo)
      await expect(page.getByText(/\d+ pending/i)).toBeVisible();
    });
  });

  // ── RVS-10: Detail drawer + accept mutation ───────────────────────────────
  test.describe('RVS-10: proposal detail drawer + accept flow', () => {
    test.skip(true, 'TODO: Enable in Plan 04 (drawer + accept/reject mutations)');

    test('RVS-10: clicking row opens drawer with full content + Accept lands directive', async ({ page }) => {
      await loginAdmin(page);
      await page.goto(`${ADMIN}/dreams`);
      await page.getByLabel(/Silo/i).fill(SMOKE_SILO);

      // Click the new_directive row
      await page.locator('tr', { hasText: 'Always restart porter-fastify' }).click();
      // Drawer opens with full content + accept/reject buttons
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText('Always restart porter-fastify after frontend rebuild')).toBeVisible();
      // Accept (new_directive — no confirmation modal)
      await page.getByRole('button', { name: /^Accept$/i }).click();
      // Toast confirmation
      await expect(page.getByText(/accepted|directive landed/i)).toBeVisible({ timeout: 5000 });

      // DB assertion: new directive landed
      const dirCount = psql(
        `SELECT count(*) FROM directives WHERE scope_id='${SMOKE_SILO}' AND content LIKE 'Always restart%'`
      );
      expect(parseInt(dirCount, 10)).toBeGreaterThanOrEqual(1);
    });
  });

  // ── RVS-10b: delete kind requires confirmation modal ──────────────────────
  test.describe('RVS-10b: delete kind confirmation modal', () => {
    test.skip(true, 'TODO: Enable in Plan 04 (delete-kind confirmation modal)');

    test('RVS-10b: accept of delete-kind opens confirmation modal before archiving', async ({ page }) => {
      await loginAdmin(page);
      await page.goto(`${ADMIN}/dreams`);
      await page.getByLabel(/Silo/i).fill(SMOKE_SILO);

      await page.locator('tr', { hasText: 'Stale: no reinforcement signal' }).click();
      await page.getByRole('button', { name: /^Accept$/i }).click();
      // Confirmation modal opens (delete kind only)
      await expect(page.getByText(/Archive this directive/i)).toBeVisible();
      await page.getByRole('button', { name: /Archive/i }).click();
      await expect(page.getByText(/archived|deleted/i)).toBeVisible({ timeout: 5000 });
    });
  });

  // ── RVS-11: Run-history sidebar lists recent runs ─────────────────────────
  test.describe('RVS-11: dream-runs sidebar tab', () => {
    test.skip(true, 'TODO: Enable in Plan 04 (run-history sidebar)');

    test('RVS-11: recent runs section lists seeded run with status/model/counts', async ({ page }) => {
      await loginAdmin(page);
      await page.goto(`${ADMIN}/dreams`);
      await page.getByLabel(/Silo/i).fill(SMOKE_SILO);

      // Recent runs block visible
      await expect(page.getByText(/Recent runs|Dream runs/i)).toBeVisible();
      // Our seeded run-1 row visible
      await expect(page.getByText('dr-smoke-48.4-run-1')).toBeVisible();
    });
  });

  // ── RVS-12: Failure-mode toasts ───────────────────────────────────────────
  test.describe('RVS-12: failure-mode toasts', () => {
    test.skip(true, 'TODO: Enable in Plan 04 (failure-mode toast surfacing)');

    test('RVS-12: SEALED_SEED accept attempt surfaces error toast and leaves seed active', async ({ page }) => {
      await loginAdmin(page);
      await page.goto(`${ADMIN}/dreams`);
      await page.getByLabel(/Silo/i).fill(SMOKE_SILO);

      await page.locator('tr', { hasText: 'Targets a sealed-seed directive' }).click();
      await page.getByRole('button', { name: /^Accept$/i }).click();
      // Toast surfaces SEALED_SEED message
      await expect(page.getByText(/sealed|seed|protected/i)).toBeVisible({ timeout: 5000 });
      // DB invariant: the seed is still active
      const seedStatus = psql(`SELECT status FROM directives WHERE id='mp-smoke-48.4-seed-1'`);
      expect(seedStatus).toBe('active');
    });
  });

  // ── RVS-13: Full E2E loop — dispatch → SSE → list update → accept → DB ───
  test.describe('RVS-13: full E2E dream cycle', () => {
    test.skip(true, 'TODO: Enable in Plan 05 (full E2E live verification)');

    test('RVS-13: dispatch → SSE invalidate → accept → directive lands in DB', async ({ page, request }) => {
      await loginAdmin(page);

      // Kick a dream run via the 48.3 v1 endpoint
      const resp = await request.post(`${ADMIN}/api/v1/intellect/dream-run`, {
        data: { silo_id: SMOKE_SILO, sample_size_override: 5000 },
      });
      expect([200, 202]).toContain(resp.status());
      const body = await resp.json();
      const runId = body.data?.dream_run_id || body.dream_run_id;
      expect(runId).toBeTruthy();

      // Navigate to Dreams page; SSE-driven invalidation should surface run + proposals once complete
      await page.goto(`${ADMIN}/dreams`);
      await page.getByLabel(/Silo/i).fill(SMOKE_SILO);

      // Wait for the dream-run to complete (poll up to 30s)
      let completed = false;
      for (let i = 0; i < 60; i++) {
        const status = psql(`SELECT status FROM dream_runs WHERE id='${runId}'`);
        if (status === 'completed' || status === 'failed') { completed = true; break; }
        await page.waitForTimeout(500);
      }
      expect(completed).toBeTruthy();

      // Accept first proposal (if any)
      const propCount = parseInt(
        psql(`SELECT count(*) FROM memory_proposals WHERE dream_run_id='${runId}' AND status='pending'`),
        10
      );
      if (propCount === 0) {
        // Doctrine fired or empty corpus — legitimate end-state for this E2E
        test.info().annotations.push({
          type: 'note',
          description: 'Dream run produced 0 pending proposals (legitimate doctrine outcome)',
        });
        return;
      }
      await page.locator('table tbody tr').first().click();
      await page.getByRole('button', { name: /^Accept$/i }).click();
      await expect(page.getByText(/accepted|directive landed/i)).toBeVisible({ timeout: 10000 });

      // DB invariant: at least one directive landed for this silo from this run
      const finalDirs = parseInt(
        psql(`SELECT count(*) FROM directives WHERE scope_id='${SMOKE_SILO}' AND source_type='dream_worker' AND status='active'`),
        10
      );
      expect(finalDirs).toBeGreaterThanOrEqual(1);
    });
  });
});
