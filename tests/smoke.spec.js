const { test, expect } = require('@playwright/test');
const { BASE, loadDemo, countElements, captureErrors } = require('./helpers');

test.describe('App Load & Demo Data', () => {

  test('landing page renders with demo button', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('aws_mapper_onboarded', '1'));
    await expect(page.locator('#landingDash')).toBeVisible();
    await expect(page.locator('#ctaDemo')).toBeVisible();
    await expect(page.locator('#landingDemo')).toBeVisible();
  });

  test('demo data loads without console errors', async ({ page }) => {
    const errors = await captureErrors(page, async () => {
      await loadDemo(page);
    });
    expect(errors).toEqual([]);
  });

  test('SVG contains VPC groups after demo load', async ({ page }) => {
    await loadDemo(page);
    const vpcCount = await countElements(page, '.vpc-group');
    expect(vpcCount).toBeGreaterThan(0);
  });

  test('SVG contains subnet nodes inside VPCs', async ({ page }) => {
    await loadDemo(page);
    const subCount = await countElements(page, '.subnet-node');
    expect(subCount).toBeGreaterThan(0);
  });

  test('toolbar dock buttons are visible', async ({ page }) => {
    await loadDemo(page);
    // Primary toolbar buttons are visible; overflow buttons exist but may be hidden
    const primaryButtons = ['#compDashBtn', '#inventoryBtn', '#reportsBtn', '#flowBtn'];
    for (const sel of primaryButtons) {
      await expect(page.locator(sel)).toBeVisible();
    }
    // Overflow buttons exist in DOM and are clickable via JS
    const overflowExists = await page.evaluate(() => !!document.getElementById('budrBtn'));
    expect(overflowExists).toBe(true);
  });

  test('VPC groups render with distinct bounding boxes', async ({ page }) => {
    await loadDemo(page);
    const boxes = await page.evaluate(() => {
      const groups = document.querySelectorAll('.vpc-group');
      return Array.from(groups).map((g) => {
        const rect = g.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
      });
    });
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    // At least some VPCs should have different x or y positions
    const uniqueKeys = new Set(boxes.map(b => `${b.x},${b.y}`));
    expect(uniqueKeys.size).toBeGreaterThan(1);
  });
});
