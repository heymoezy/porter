const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const input = 'file://' + path.resolve('/home/lobster/documents/porter/porter-openclaw-architecture-slide.html');
  const output = path.resolve('/home/lobster/documents/porter/porter-openclaw-architecture.pdf');
  await page.goto(input, { waitUntil: 'load' });
  await page.pdf({ path: output, printBackground: true, width: '1366px', height: '768px', margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  await browser.close();
  console.log(output);
})();
