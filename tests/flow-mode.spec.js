const { test, expect } = require('@playwright/test');
const { loadDemo, captureErrors } = require('./helpers');

test.describe('Flow Mode', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
  });

  test('entering flow mode shows banner and adds flow-selecting class', async ({ page }) => {
    const errors = await captureErrors(page, async () => {
      await page.evaluate(() => enterFlowMode());
    });
    expect(errors).toEqual([]);
    await expect(page.locator('#flowBanner')).toBeVisible();
    await expect(page.locator('.main')).toHaveClass(/flow-selecting/);
  });

  test('exiting flow mode removes banner and classes', async ({ page }) => {
    await page.evaluate(() => enterFlowMode());
    await expect(page.locator('#flowBanner')).toBeVisible();

    await page.evaluate(() => exitFlowMode());
    await expect(page.locator('#flowBanner')).not.toBeVisible();
    await expect(page.locator('.main')).not.toHaveClass(/flow-selecting/);
    await expect(page.locator('.main')).not.toHaveClass(/flow-active/);
  });

  test('flow mode toggle via Shift+T', async ({ page }) => {
    await page.keyboard.press('Shift+T');
    await expect(page.locator('#flowBanner')).toBeVisible();

    await page.keyboard.press('Shift+T');
    await expect(page.locator('#flowBanner')).not.toBeVisible();
  });

  test('clicking subnet in flow mode selects it as source', async ({ page }) => {
    await page.evaluate(() => enterFlowMode());

    // Dispatch click on first subnet node via JS (SVG elements)
    await page.evaluate(() => {
      const node = document.querySelector('.subnet-node');
      if (node) node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const hasSource = await page.evaluate(() => !!_flowSource);
    expect(hasSource).toBe(true);

    const selecting = await page.evaluate(() => _flowSelecting);
    expect(selecting).toBe('target');
  });

  test('entering flow mode from executive layout is blocked', async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById('layoutMode').value = 'executive';
    });
    await page.evaluate(() => enterFlowMode());
    const inFlow = await page.evaluate(() => _flowMode);
    expect(inFlow).toBe(false);
  });

  test('flow mode re-entry after exit clears previous state', async ({ page }) => {
    await page.evaluate(() => enterFlowMode());

    // Select a source subnet
    await page.evaluate(() => {
      const node = document.querySelector('.subnet-node');
      if (node) node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await page.evaluate(() => exitFlowMode());
    await page.evaluate(() => enterFlowMode());

    const source = await page.evaluate(() => _flowSource);
    const target = await page.evaluate(() => _flowTarget);
    expect(source).toBeNull();
    expect(target).toBeNull();
  });

  test('flow trace creates SVG flow elements', async ({ page }) => {
    await page.evaluate(() => enterFlowMode());

    // Select source
    await page.evaluate(() => {
      const node = document.querySelector('.subnet-node');
      if (node) node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Select target (different subnet)
    const subnetCount = await page.evaluate(() =>
      document.querySelectorAll('.subnet-node').length
    );
    if (subnetCount >= 2) {
      await page.evaluate(() => {
        const nodes = document.querySelectorAll('.subnet-node');
        nodes[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await page.waitForTimeout(500);

      const hasFlowElements = await page.evaluate(() => {
        const svg = document.getElementById('mapSvg');
        const markers = svg.querySelectorAll('defs marker');
        const flowPaths = svg.querySelectorAll('[class*="flow-"]');
        return markers.length > 0 || flowPaths.length > 0;
      });
      expect(hasFlowElements).toBe(true);
    }
  });

  test('no console errors during full flow lifecycle', async ({ page }) => {
    const errors = await captureErrors(page, async () => {
      await page.evaluate(() => enterFlowMode());

      await page.evaluate(() => {
        const node = document.querySelector('.subnet-node');
        if (node) node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const count = await page.evaluate(() =>
        document.querySelectorAll('.subnet-node').length
      );
      if (count >= 2) {
        await page.evaluate(() => {
          const nodes = document.querySelectorAll('.subnet-node');
          nodes[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(500);
      }

      await page.evaluate(() => exitFlowMode());
    });

    expect(errors).toEqual([]);
  });
});
