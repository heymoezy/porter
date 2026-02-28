// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  timeout: 15000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:8877',
    headless: true,
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  reporter: [['list']],
  outputDir: './test-results',
});
