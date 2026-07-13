/**
 * Porter admin SELF-QA — screenshot a page so you can SEE what you built.
 *
 * ymc has had this for a while (backend/scripts/screenshot-admin.mjs) and Porter did not,
 * which is why Porter UI kept getting shipped on "it compiled". It compiles is not it works.
 *
 * Mints a SHORT-LIVED (5 min) admin session directly in the sessions table, drives headless
 * Chrome to the page, and writes a PNG you then Read. Also reports any JS console error —
 * a page that renders blank because a bundle threw is exactly what this is here to catch.
 *
 *   node scripts/screenshot-admin.mjs /vault storage/qa/vault.png [width] [height]
 *
 * The session is deleted on the way out, always.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import puppeteer from 'puppeteer';

const path = process.argv[2] || '/dashboard';
const out = resolve(process.argv[3] || 'storage/qa/admin.png');
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 1000);

const BASE = process.env.PORTER_ADMIN_URL || 'https://askporter.app';
const ADMIN_USER = 'moe';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const token = randomBytes(24).toString('hex');
const now = Date.now() / 1000;

let browser;
try {
  await pool.query(
    `INSERT INTO sessions (token, username, expires, created_at, last_seen_at, user_agent)
     VALUES ($1, $2, $3, $4, $4, 'porter-selfqa')`,
    [token, ADMIN_USER, now + 300, now],
  );

  mkdirSync(dirname(out), { recursive: true });

  // ONE copy of every tool on this box. Porter OWNS the canonical tool registry precisely so
  // nothing re-downloads its own Chrome into a new cache — ask the registry, don't guess and
  // don't install. (The puppeteer library itself is symlinked to the single shared install.)
  const { rows } = await pool.query(
    `SELECT canonical_path FROM environment_tools WHERE tool_key = 'puppeteer' AND detected = 1`,
  );
  const executablePath = rows[0]?.canonical_path || undefined;
  if (!executablePath) {
    throw new Error("Porter's tool registry has no detected 'puppeteer' — run the tool detector; do not install a second copy.");
  }
  console.log(`[qa] chrome (from Porter's registry): ${executablePath}`);

  browser = await puppeteer.launch({
    headless: 'new',
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  const { hostname } = new URL(BASE);
  await page.setCookie(
    { name: 'porter_session', value: token, domain: hostname, path: '/' },
    { name: 'porter_admin_session', value: token, domain: hostname, path: '/' },
  );

  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2500)); // let the queries settle

  // Optional: click a control by its visible text before shooting, so tabbed/hidden state
  // can be QA'd too. A tab you never opened is a tab you never verified.
  // A click SEQUENCE (separated by '||') so tabbed + drill-in state can be QA'd:
  //   QA_CLICK_TEXT='Inspector||00-MASTER-DOSSIER'
  // A tab you never opened, or a row you never selected, is a surface you never verified.
  const clickText = process.env.QA_CLICK_TEXT;
  if (clickText) {
    for (const step of clickText.split('||').map((t) => t.trim()).filter(Boolean)) {
      const clicked = await page.evaluate((t) => {
        const el = [...document.querySelectorAll('button, a')].find((n) =>
          (n.textContent || '').trim().toLowerCase().includes(t.toLowerCase()),
        );
        if (el) { el.click(); return true; }
        return false;
      }, step);
      if (!clicked) throw new Error(`QA_CLICK_TEXT: no control matching "${step}"`);
      await new Promise((r) => setTimeout(r, 2200));
    }
  }

  const text = await page.evaluate(() => document.body.innerText.trim());
  await page.screenshot({ path: out, fullPage: true });

  console.log(`[qa] ${path} -> ${out}`);
  console.log(`[qa] rendered ${text.length} chars`);
  if (text.length < 120) {
    console.log('[qa] ✗ PAGE IS EFFECTIVELY BLANK');
    process.exitCode = 1;
  }
  if (errors.length) {
    console.log(`[qa] ✗ ${errors.length} JS error(s):`);
    for (const e of errors.slice(0, 5)) console.log('      ' + e.slice(0, 160));
    process.exitCode = 1;
  } else {
    console.log('[qa] ✓ no JS errors');
  }
} catch (e) {
  console.error('[qa] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await pool.query('DELETE FROM sessions WHERE token = $1', [token]).catch(() => {});
  await pool.end();
}
