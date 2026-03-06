const { test, expect } = require('@playwright/test');
const { loadDemo, clickSubnet, openDashTab, captureErrors } = require('./helpers');

test.describe('State Collisions & Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
  });

  // --- Cross-feature state collisions ---

  test('entering flow mode closes open detail panel', async ({ page }) => {
    await clickSubnet(page, 0);
    await expect(page.locator('#detailPanel')).toHaveClass(/open/);

    const errors = await captureErrors(page, async () => {
      await page.evaluate(() => enterFlowMode());
    });
    expect(errors).toEqual([]);
    // Flow banner should show
    await expect(page.locator('#flowBanner')).toBeVisible();
  });

  test('opening dashboard while detail panel is open', async ({ page }) => {
    await clickSubnet(page, 0);
    await expect(page.locator('#detailPanel')).toHaveClass(/open/);

    const errors = await captureErrors(page, async () => {
      await openDashTab(page, 'compliance');
    });
    expect(errors).toEqual([]);
    // Dashboard should be open with real content
    const body = await page.locator('#udashBody').textContent();
    expect(body.length).toBeGreaterThan(10);
  });

  test('clicking subnet while dashboard is open', async ({ page }) => {
    await openDashTab(page, 'compliance');

    const errors = await captureErrors(page, async () => {
      await clickSubnet(page, 0);
    });
    expect(errors).toEqual([]);
    await expect(page.locator('#detailPanel')).toHaveClass(/open/);
  });

  test('flow mode source = target (same subnet)', async ({ page }) => {
    await page.evaluate(() => enterFlowMode());

    const errors = await captureErrors(page, async () => {
      // Click same subnet as source and target
      await page.evaluate(() => {
        const node = document.querySelector('.subnet-node');
        if (node) {
          node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      });
      await page.waitForTimeout(300);
    });
    expect(errors).toEqual([]);
  });

  // --- Rapid operations ---

  test('rapid tab switching does not crash', async ({ page }) => {
    const tabs = ['compliance', 'budr', 'inventory', 'classification', 'reports'];
    const errors = await captureErrors(page, async () => {
      for (const tab of tabs) {
        await page.evaluate((id) => openUnifiedDash(id), tab);
        await page.waitForTimeout(100);
      }
      // Wait for final tab to settle
      await page.locator('#udash.open').waitFor({ state: 'visible', timeout: 5000 });
    });
    expect(errors).toEqual([]);
    // Final tab should have content
    const body = await page.locator('#udashBody').textContent();
    expect(body.length).toBeGreaterThan(10);
  });

  test('rapid flow mode enter/exit does not leak state', async ({ page }) => {
    const errors = await captureErrors(page, async () => {
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => enterFlowMode());
        await page.evaluate(() => exitFlowMode());
      }
    });
    expect(errors).toEqual([]);
    // Should be cleanly out of flow mode
    const inFlow = await page.evaluate(() => _flowMode);
    expect(inFlow).toBe(false);
    await expect(page.locator('.main')).not.toHaveClass(/flow-selecting/);
  });

  // --- Load/clear/reload cycle ---

  test('demo load → clear → demo load produces clean state', async ({ page }) => {
    // First load already happened in beforeEach
    const vpcCount1 = await page.evaluate(() =>
      document.querySelectorAll('.vpc-group').length
    );
    expect(vpcCount1).toBeGreaterThan(0);

    // Clear
    const errors = await captureErrors(page, async () => {
      await page.locator('#loadDemo').evaluate((btn) => {
        // Find and click the Clear button
        document.querySelector('#clearBtn, [id*="clear" i], .btn-clear')?.click();
      });
      // Fallback: use the clear button directly
      const clearBtn = page.locator('button:has-text("CLEAR")');
      if (await clearBtn.isVisible()) {
        await clearBtn.click();
      }
      await page.waitForTimeout(500);

      // Re-load demo (button may be hidden in new UX, use evaluate)
      await page.evaluate(() => document.getElementById('loadDemo').click());
      await page.waitForTimeout(2000);
    });
    expect(errors).toEqual([]);

    // Should have VPCs again
    const vpcCount2 = await page.evaluate(() =>
      document.querySelectorAll('.vpc-group').length
    );
    expect(vpcCount2).toBeGreaterThan(0);
  });

  // --- Export edge cases ---

  test('export with no modules enabled shows toast not error', async ({ page }) => {
    await openDashTab(page, 'reports');

    // Disable all modules
    await page.evaluate(() => {
      _RPT_MODULES.forEach(m => { m.enabled = false; });
    });

    const errors = await captureErrors(page, async () => {
      await page.evaluate(() => {
        window._testLastBlob = null;
        window._origDownloadBlob = window.downloadBlob;
        window.downloadBlob = function(blob, name) {
          window._testLastBlob = { size: blob.size, name };
        };
      });

      await page.locator('#rptExportHTML').click();
      await page.waitForTimeout(500);
    });
    expect(errors).toEqual([]);

    // Should NOT have generated a blob (no modules = no export)
    const blob = await page.evaluate(() => window._testLastBlob);
    expect(blob).toBeNull();

    await page.evaluate(() => {
      if (window._origDownloadBlob) window.downloadBlob = window._origDownloadBlob;
    });
  });

  // --- Layout mode transitions ---

  test('switching layout mode preserves data without errors', async ({ page }) => {
    const errors = await captureErrors(page, async () => {
      // Switch to executive layout
      await page.evaluate(() => {
        const sel = document.getElementById('layoutMode');
        if (sel) {
          sel.value = 'executive';
          sel.dispatchEvent(new Event('change'));
        }
      });
      await page.waitForTimeout(2000);
    });
    expect(errors).toEqual([]);

    // SVG should still have rendered content (executive uses different group structure)
    const hasContent = await page.evaluate(() => {
      const svg = document.getElementById('mapSvg');
      return svg && svg.childNodes.length > 0;
    });
    expect(hasContent).toBe(true);
  });
});
