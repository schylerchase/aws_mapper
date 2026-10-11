const { defineConfig } = require('@playwright/test');
const testPort = Number(process.env.AWS_MAPPER_TEST_PORT || 30821);
process.env.AWS_MAPPER_TEST_URL = `http://127.0.0.1:${testPort}/index.html`;

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
    command: `node node_modules/serve/build/main.js . -l tcp://127.0.0.1:${testPort} --no-port-switching --no-clipboard`,
    url: process.env.AWS_MAPPER_TEST_URL,
    reuseExistingServer: false,
  },
});
