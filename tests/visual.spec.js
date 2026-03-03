const { test, expect } = require('@playwright/test');
const { BASE, loadDemo, openDashTab, clickSubnet } = require('./helpers');

// Visual regression: screenshot comparisons catch unintentional CSS/layout changes.
// Update baselines: npx playwright test tests/visual.spec.js --update-snapshots

test.describe('Visual Regression', () => {

  test('landing page', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('#landingDash').waitFor({ state: 'visible', timeout: 10000 });
    await expect(page).toHaveScreenshot('landing.png', { maxDiffPixelRatio: 0.01 });
  });

  test('topology view', async ({ page }) => {
    await loadDemo(page);
    // Wait for layout to stabilize
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('topology.png', { maxDiffPixelRatio: 0.02 });
  });

  test('compliance tab', async ({ page }) => {
    await loadDemo(page);
    await openDashTab(page, 'compliance');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('compliance.png', { maxDiffPixelRatio: 0.01 });
  });

  test('BUDR tab', async ({ page }) => {
    await loadDemo(page);
    await openDashTab(page, 'budr');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('budr.png', { maxDiffPixelRatio: 0.01 });
  });

  test('inventory tab', async ({ page }) => {
    await loadDemo(page);
    await openDashTab(page, 'inventory');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('inventory.png', { maxDiffPixelRatio: 0.01 });
  });

  test('reports tab', async ({ page }) => {
    await loadDemo(page);
    await openDashTab(page, 'reports');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('reports.png', { maxDiffPixelRatio: 0.01 });
  });

  test('detail panel', async ({ page }) => {
    await loadDemo(page);
    await clickSubnet(page, 0);
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('detail-panel.png', { maxDiffPixelRatio: 0.01 });
  });

  test('classification tab', async ({ page }) => {
    await loadDemo(page);
    await openDashTab(page, 'classification');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('classification.png', { maxDiffPixelRatio: 0.01 });
  });

});
