// Run this once to create auth state: node setup-auth.js <password>
// It saves browser cookies to auth.json for tests to reuse

const { chromium } = require('playwright');

(async () => {
  const password = process.argv[2];
  if (!password) {
    console.error('Usage: node setup-auth.js <password>');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:3001/login');
  // Refreshed v4.x selectors: #email / #password / role=button (old #uname/#pw/.login-btn stale).
  await page.waitForSelector('#email', { timeout: 5000 });
  await page.fill('#email', 'moe@askporter.app');
  await page.fill('#password', password);
  await page.getByRole('button', { name: /sign in/i }).click();

  try {
    await page.waitForSelector('aside nav, .sidebar, [class*="sidebar"]', { timeout: 5000 });
    await context.storageState({ path: './auth.json' });
    console.log('Auth saved to auth.json');
  } catch (e) {
    console.error('Login failed — check password');
    await page.screenshot({ path: './screenshots/login-failed.png' });
  }

  await browser.close();
})();
