const { test, expect } = require('@playwright/test');
const { loadDemo, openDashTab, captureErrors } = require('./helpers');

test.describe('Export Functions', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
    // Open reports tab to make export buttons available
    await openDashTab(page, 'reports');
  });

  test('report builder shows all three export buttons', async ({ page }) => {
    await expect(page.locator('#rptExportHTML')).toBeVisible();
    await expect(page.locator('#rptExportXLSX')).toBeVisible();
    await expect(page.locator('#rptExportDOCX')).toBeVisible();
  });

  test('report builder has module toggles', async ({ page }) => {
    // Should have report module cards in the body
    const body = await page.locator('#udashBody').innerHTML();
    // Module IDs from the codebase
    const expectedModules = ['summary', 'compliance', 'budr', 'inventory'];
    for (const mod of expectedModules) {
      expect(body).toContain(mod);
    }
  });

  test('HTML report generates without errors', async ({ page }) => {
    // Enable all modules and ensure at least one is available
    const hasEnabled = await page.evaluate(() => _rptEnabledModules().length > 0);
    if (!hasEnabled) return;

    // Intercept download to prevent file dialog
    await page.evaluate(() => {
      window._testLastBlob = null;
      window._origDownloadBlob = window.downloadBlob;
      window.downloadBlob = function(blob, name) {
        window._testLastBlob = { size: blob.size, name: name, type: blob.type };
      };
    });

    const errors = await captureErrors(page, async () => {
      await page.locator('#rptExportHTML').click();
      // Wait for generation to complete
      await page.waitForFunction(
        () => document.getElementById('rptExportHTML').textContent !== 'Generating...',
        { timeout: 15000 }
      );
    });

    expect(errors).toEqual([]);

    // Verify a blob was produced
    const blob = await page.evaluate(() => window._testLastBlob);
    expect(blob).not.toBeNull();
    expect(blob.size).toBeGreaterThan(100);

    // Restore original
    await page.evaluate(() => { window.downloadBlob = window._origDownloadBlob; });
  });

  test('XLSX export generates without errors', async ({ page }) => {
    const hasEnabled = await page.evaluate(() => _rptEnabledModules().length > 0);
    if (!hasEnabled) return;

    await page.evaluate(() => {
      window._testLastBlob = null;
      window._origDownloadBlob = window.downloadBlob;
      window.downloadBlob = function(blob, name) {
        window._testLastBlob = { size: blob.size, name: name, type: blob.type };
      };
    });

    const errors = await captureErrors(page, async () => {
      await page.locator('#rptExportXLSX').click();
      await page.waitForFunction(
        () => {
          var btn = document.getElementById('rptExportXLSX');
          return btn.textContent !== 'Loading...' && btn.textContent !== 'Generating...';
        },
        { timeout: 30000 }
      );
    });

    expect(errors).toEqual([]);
    const blob = await page.evaluate(() => window._testLastBlob);
    expect(blob).not.toBeNull();
    expect(blob.size).toBeGreaterThan(1000);

    await page.evaluate(() => { window.downloadBlob = window._origDownloadBlob; });
  });

  test('DOCX export (executive tone) generates without errors', async ({ page }) => {
    const hasEnabled = await page.evaluate(() => _rptEnabledModules().length > 0);
    if (!hasEnabled) return;

    await page.evaluate(() => {
      window._testLastBlob = null;
      window._origDownloadBlob = window.downloadBlob;
      window.downloadBlob = function(blob, name) {
        window._testLastBlob = { size: blob.size, name: name, type: blob.type };
      };
    });

    // Set tone to executive
    await page.selectOption('#rptDocxTone', 'executive');

    const errors = await captureErrors(page, async () => {
      await page.locator('#rptExportDOCX').click();
      await page.waitForFunction(
        () => {
          var btn = document.getElementById('rptExportDOCX');
          return btn.textContent !== 'Generating...';
        },
        { timeout: 20000 }
      );
    });

    expect(errors).toEqual([]);
    const blob = await page.evaluate(() => window._testLastBlob);
    expect(blob).not.toBeNull();
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.name).toContain('.docx');

    await page.evaluate(() => { window.downloadBlob = window._origDownloadBlob; });
  });

  test('DOCX export (technical tone) generates without errors', async ({ page }) => {
    const hasEnabled = await page.evaluate(() => _rptEnabledModules().length > 0);
    if (!hasEnabled) return;

    await page.evaluate(() => {
      window._testLastBlob = null;
      window._origDownloadBlob = window.downloadBlob;
      window.downloadBlob = function(blob, name) {
        window._testLastBlob = { size: blob.size, name: name, type: blob.type };
      };
    });

    await page.selectOption('#rptDocxTone', 'technical');

    const errors = await captureErrors(page, async () => {
      await page.locator('#rptExportDOCX').click();
      await page.waitForFunction(
        () => {
          var btn = document.getElementById('rptExportDOCX');
          return btn.textContent !== 'Generating...';
        },
        { timeout: 30000 }
      );
    });

    expect(errors).toEqual([]);
    const blob = await page.evaluate(() => window._testLastBlob);
    expect(blob).not.toBeNull();
    // Technical should be larger than executive
    expect(blob.size).toBeGreaterThan(5000);

    await page.evaluate(() => { window.downloadBlob = window._origDownloadBlob; });
  });
});
