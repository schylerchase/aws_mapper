const { test, expect } = require('@playwright/test');
const { BASE, loadDemo, countElements, captureErrors } = require('./helpers');

test.describe('App Load & Demo Data', () => {

  test('landing page renders with demo button', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
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

  test('Explore Demo paints the map without expand or collapse', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('#landingDemo').click();
    await page.locator('#landingDash').waitFor({ state: 'hidden', timeout: 15000 });
    await page.waitForFunction(() => {
      const svg = document.getElementById('mapSvg');
      const root = svg && svg.querySelector('.map-root');
      const firstVpc = svg && svg.querySelector('.vpc-group');
      if (!svg || !root || !firstVpc) return false;
      const svgBox = svg.getBoundingClientRect();
      const vpcBox = firstVpc.getBoundingClientRect();
      const transform = root.getAttribute('transform') || '';
      const hasFiniteTransform = !/NaN|Infinity/.test(transform);
      const inViewport = vpcBox.right > svgBox.left && vpcBox.left < svgBox.right && vpcBox.bottom > svgBox.top && vpcBox.top < svgBox.bottom;
      return hasFiniteTransform && svgBox.width > 0 && svgBox.height > 0 && vpcBox.width > 0 && vpcBox.height > 0 && inViewport;
    }, null, { timeout: 15000 });
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

  test('peering lines expose hover hit areas', async ({ page }) => {
    await loadDemo(page);
    const hitareas = page.locator('.peering-hitarea');
    await expect(hitareas.first()).toBeAttached({ timeout: 10000 });
    const tooltipShown = await page.evaluate(() => {
      const hitarea = document.querySelector('.peering-hitarea');
      if (!hitarea) return false;
      hitarea.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: 520, clientY: 320 }));
      const tooltip = document.getElementById('tooltip');
      return tooltip && tooltip.style.display === 'block' && tooltip.textContent.includes('VPC Peering');
    });
    expect(tooltipShown).toBe(true);
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
