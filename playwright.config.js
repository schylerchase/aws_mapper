const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '*.spec.js',
  testIgnore: process.env.CI ? ['unit/**', '**/visual*'] : 'unit/**',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1400, height: 900 },
  },
  webServer: {
    command: 'npx serve . -l 8377 --no-clipboard',
    port: 8377,
    reuseExistingServer: true,
  },
});
