const { test, expect } = require('@playwright/test');
const { loadDemo, clickSubnet, captureErrors } = require('./helpers');

test.describe('Detail Panel (Subnet)', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
  });

  test('clicking a subnet opens the detail panel', async ({ page }) => {
    const errors = await captureErrors(page, async () => {
      await clickSubnet(page, 0);
    });
    expect(errors).toEqual([]);
    await expect(page.locator('#detailPanel')).toHaveClass(/open/);
  });

  test('detail panel shows subnet title', async ({ page }) => {
    await clickSubnet(page, 0);
    const title = await page.locator('#dpTitle').textContent();
    expect(title.length).toBeGreaterThan(3);
  });

  test('detail panel has collapsible sections', async ({ page }) => {
    await clickSubnet(page, 0);
    const sections = await page.locator('.dp-sec-hdr').count();
    expect(sections).toBeGreaterThan(0);
  });

  test('detail panel auto-opens in fullscreen', async ({ page }) => {
    await clickSubnet(page, 0);
    await expect(page.locator('#detailPanel')).toHaveClass(/fullscreen/);
  });

  test('fullscreen toggle works', async ({ page }) => {
    await clickSubnet(page, 0);
    await expect(page.locator('#detailPanel')).toHaveClass(/fullscreen/);

    // Click fullscreen toggle to exit
    await page.locator('#dpFullscreen').click();
    await expect(page.locator('#detailPanel')).not.toHaveClass(/fullscreen/);

    // Click again to re-enter (button clipped in narrow non-fullscreen panel, use JS click)
    await page.locator('#dpFullscreen').dispatchEvent('click');
    await expect(page.locator('#detailPanel')).toHaveClass(/fullscreen/);
  });

  test('closing detail panel removes open class', async ({ page }) => {
    await clickSubnet(page, 0);
    await page.locator('#dpClose').click();
    await expect(page.locator('#detailPanel')).not.toHaveClass(/open/);
  });

  test('clicking different subnets updates panel content', async ({ page }) => {
    const subnetCount = await page.evaluate(() =>
      document.querySelectorAll('.subnet-node').length
    );
    if (subnetCount < 2) return;

    await clickSubnet(page, 0);
    const title1 = await page.locator('#dpTitle').textContent();

    // Close and open different subnet
    await page.locator('#dpClose').click();
    await page.locator('#detailPanel').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    await clickSubnet(page, 1);
    const title2 = await page.locator('#dpTitle').textContent();

    expect(title1).not.toEqual(title2);
  });

  test('section collapse/expand toggles without crashing', async ({ page }) => {
    await clickSubnet(page, 0);
    const headerCount = await page.locator('.dp-sec-hdr').count();
    if (headerCount === 0) return;

    // Click first section header to toggle
    await page.locator('.dp-sec-hdr').first().click();
    // Panel should still be open (no crash)
    await expect(page.locator('#detailPanel')).toHaveClass(/open/);
  });
});
