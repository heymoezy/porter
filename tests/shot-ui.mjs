import { chromium } from 'playwright';
const routes = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addCookies([{ name: 'porter_session', value: process.env.PORTER_COOKIE, domain: '127.0.0.1', path: '/' }]);
for (const r of routes) {
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:3001${r}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.error(r, 'nav:', e.message));
  await page.waitForTimeout(1500);
  const name = r.replace(/\//g, '_') || '_root';
  await page.screenshot({ path: `/tmp/porter-ui/${name}.png` });
  console.log('shot', r);
  await page.close();
}
await browser.close();
