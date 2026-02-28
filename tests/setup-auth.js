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

  await page.goto('http://127.0.0.1:8877');
  await page.fill('#uname', 'admin');
  await page.fill('#pw', password);
  await page.click('.login-btn');

  try {
    await page.waitForSelector('.sidebar', { timeout: 5000 });
    await context.storageState({ path: './auth.json' });
    console.log('Auth saved to auth.json');
  } catch (e) {
    console.error('Login failed — check password');
    await page.screenshot({ path: './screenshots/login-failed.png' });
  }

  await browser.close();
})();
