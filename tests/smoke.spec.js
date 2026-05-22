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

  test('zoom controls keep map transform finite', async ({ page }) => {
    await loadDemo(page);
    const root = page.locator('#mapSvg .map-root');
    const before = await root.getAttribute('transform');
    await page.locator('#zoomIn').click();
    await page.waitForFunction((initial) => {
      const rootEl = document.querySelector('#mapSvg .map-root');
      const transform = rootEl && rootEl.getAttribute('transform');
      return transform && transform !== initial && !/NaN|Infinity/.test(transform);
    }, before, { timeout: 5000 });
    await expect(page.locator('#zoomLevel')).toContainText('%');
  });

  test('route lines keep animated dash flow', async ({ page }) => {
    await loadDemo(page);
    const animatedLines = await page.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.route-trunk.animated,.route-line.route-structural,.peering-line'));
      return lines.filter((line) => {
        const style = window.getComputedStyle(line);
        return style.animationName && style.animationName !== 'none' && style.animationDuration !== '0s';
      }).length;
    });
    expect(animatedLines).toBeGreaterThan(0);
  });

  test('map motion pauses expensive SVG animations without removing them', async ({ page }) => {
    await loadDemo(page);
    const state = await page.evaluate(() => {
      const line = document.querySelector('.route-trunk.animated,.route-line.route-structural,.peering-line');
      const main = document.querySelector('.main');
      if (!line || !main) return null;
      const before = getComputedStyle(line).animationName;
      main.classList.add('map-moving');
      const moving = getComputedStyle(line).animationPlayState;
      main.classList.remove('map-moving');
      const after = getComputedStyle(line).animationName;
      return { before, moving, after };
    });
    expect(state).not.toBeNull();
    expect(state.before).not.toBe('none');
    expect(state.moving).toBe('paused');
    expect(state.after).toBe(state.before);
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

  test('line hit areas use Safari-compatible strokes', async ({ page }) => {
    await loadDemo(page);
    await expect(page.locator('.route-hitarea').first()).toBeAttached({ timeout: 10000 });
    await expect(page.locator('.peering-hitarea').first()).toBeAttached({ timeout: 10000 });
    const styles = await page.evaluate(() => ['.route-hitarea', '.peering-hitarea'].map((selector) => {
      const el = document.querySelector(selector);
      const style = window.getComputedStyle(el);
      return {
        selector,
        stroke: style.stroke,
        strokeOpacity: Number.parseFloat(style.strokeOpacity || '1'),
        pointerEvents: style.pointerEvents,
        vectorEffect: style.vectorEffect
      };
    }));
    for (const style of styles) {
      expect(style.stroke).not.toBe('none');
      expect(style.stroke).not.toBe('transparent');
      expect(style.stroke).not.toContain('rgba(0, 0, 0, 0)');
      expect(style.strokeOpacity).toBeGreaterThan(0);
      expect(style.pointerEvents).toBe('stroke');
      expect(style.vectorEffect).toBe('non-scaling-stroke');
    }
  });

  test('Safari pinch gesture events zoom the map', async ({ page }) => {
    await loadDemo(page);
    const root = page.locator('#mapSvg .map-root');
    const before = await root.getAttribute('transform');
    await page.evaluate(() => {
      const svg = document.getElementById('mapSvg');
      const rect = svg.getBoundingClientRect();
      const fireGesture = (type, scale) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperties(event, {
          clientX: { value: rect.left + rect.width / 2 },
          clientY: { value: rect.top + rect.height / 2 },
          scale: { value: scale }
        });
        svg.dispatchEvent(event);
      };
      fireGesture('gesturestart', 1);
      fireGesture('gesturechange', 1.3);
      fireGesture('gestureend', 1.3);
    });
    await page.waitForFunction((initial) => {
      const rootEl = document.querySelector('#mapSvg .map-root');
      const transform = rootEl && rootEl.getAttribute('transform');
      return transform && transform !== initial && !/NaN|Infinity/.test(transform);
    }, before, { timeout: 5000 });
    const gestureScale = await page.evaluate(() => window._mapGestureScale(1.3));
    expect(gestureScale).toBeGreaterThan(1.35);
  });

  test('trackpad pinch wheel delta is sensitive but capped', async ({ page }) => {
    await loadDemo(page);
    const delta = await page.evaluate(() => window._mapWheelDelta({ deltaY: -2, deltaMode: 0, ctrlKey: true }));
    const capped = await page.evaluate(() => window._mapWheelDelta({ deltaY: -100, deltaMode: 0, ctrlKey: true }));
    expect(delta).toBeGreaterThan(0.035);
    expect(capped).toBeCloseTo(0.32, 2);
  });

  test('sidebar data detector avoids reparsing textarea JSON', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
    await page.goto(BASE, { waitUntil: 'load' });
    const result = await page.evaluate(async () => {
      const originalParse = JSON.parse;
      let parseCalls = 0;
      JSON.parse = function(...args) {
        parseCalls += 1;
        return originalParse.apply(this, args);
      };
      const input = document.getElementById('in_vpcs');
      input.value = '{"Vpcs":[{"VpcId":"vpc-test"}]}';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 650));
      JSON.parse = originalParse;
      return {
        parseCalls,
        ctaDisplay: document.getElementById('sidebarCta').style.display,
        bodyDisplay: document.getElementById('sidebarBody').style.display
      };
    });
    expect(result.parseCalls).toBe(0);
    expect(result.ctaDisplay).toBe('none');
    expect(result.bodyDisplay).toBe('');
  });

  test('resource compliance badges stay clear of service labels', async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => {
      if (!document.querySelector('.res-node[data-id]')) document.getElementById('btnExpand').click();
    });
    await page.waitForSelector('.res-node[data-id]', { timeout: 5000 });
    const placement = await page.evaluate(() => {
      const node = document.querySelector('.res-node[data-id]');
      if (!node) return null;
      const rid = node.getAttribute('data-id');
      window._complianceFindings = [{ resource: rid, severity: 'CRITICAL', framework: 'test', control: 'test', message: 'test finding' }];
      window._renderComplianceBadges();
      const badge = document.querySelector('.comp-badge');
      const transform = badge && badge.getAttribute('transform');
      const match = String(transform || '').match(/translate\(([-\d.]+),([-\d.]+)\)/);
      const bb = window._measureSvgNodeFast(node);
      return match && bb ? { badgeX: Number(match[1]), badgeY: Number(match[2]), nodeX: bb.x, nodeY: bb.y } : null;
    });
    expect(placement).not.toBeNull();
    expect(placement.badgeX).toBeLessThanOrEqual(placement.nodeX);
    expect(placement.badgeY).toBeLessThanOrEqual(placement.nodeY);
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
