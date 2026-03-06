const { test, expect } = require('@playwright/test');
const { loadDemo, openDashTab, captureErrors } = require('./helpers');

test.describe('Dashboard Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
  });

  const tabs = [
    { id: 'compliance', button: '#compDashBtn', expects: 'finding' },
    { id: 'budr', button: '#budrBtn', expects: 'tier' },
    { id: 'inventory', button: '#inventoryBtn', expects: 'resource' },
    { id: 'classification', button: '#govBtn', expects: 'rule' },
    { id: 'reports', button: '#reportsBtn', expects: 'report' },
  ];

  for (const tab of tabs) {
    test(`${tab.id} tab opens without errors`, async ({ page }) => {
      const errors = await captureErrors(page, async () => {
        // Some buttons may be in overflow menu; use evaluate for reliable click
        await page.evaluate((sel) => document.querySelector(sel).click(), tab.button);
        await page.locator('#udash.open').waitFor({ state: 'visible', timeout: 5000 });
      });
      expect(errors).toEqual([]);
      // Dashboard body should have content
      const bodyText = await page.locator('#udashBody').textContent();
      expect(bodyText.length).toBeGreaterThan(10);
    });
  }

  test('tab switching preserves dashboard panel', async ({ page }) => {
    // Open compliance (use evaluate for reliable click)
    await page.evaluate(() => document.getElementById('compDashBtn').click());
    await page.locator('#udash.open').waitFor({ state: 'visible', timeout: 5000 });
    const compText = await page.locator('#udashBody').textContent();

    // Switch to inventory
    await openDashTab(page, 'inventory');
    const invText = await page.locator('#udashBody').textContent();

    // Content should be different (regression: tabs sometimes show stale content)
    expect(compText).not.toEqual(invText);

    // Switch back to compliance
    await openDashTab(page, 'compliance');
    const compText2 = await page.locator('#udashBody').textContent();
    // Should re-render compliance content
    expect(compText2.length).toBeGreaterThan(10);
  });

  test('compliance tab shows finding counts', async ({ page }) => {
    await openDashTab(page, 'compliance');
    // Should have stat badges or finding count somewhere in the toolbar or body
    const toolbar = await page.locator('#udashToolbar').textContent();
    const body = await page.locator('#udashBody').textContent();
    const combined = toolbar + body;
    // Demo generates ~6000 findings — should see numbers
    expect(combined).toMatch(/\d+/);
  });

  test('inventory tab renders resource table', async ({ page }) => {
    await openDashTab(page, 'inventory');
    // Should contain a table or grid with resource types
    const body = await page.locator('#udashBody').innerHTML();
    expect(body).toContain('EC2');
  });

  test('closing dashboard removes open class', async ({ page }) => {
    await page.evaluate(() => document.getElementById('compDashBtn').click());
    await page.locator('#udash.open').waitFor({ state: 'visible', timeout: 5000 });

    // Close it
    await page.evaluate(() => closeUnifiedDash());
    await expect(page.locator('#udash')).not.toHaveClass(/open/);
  });
});
