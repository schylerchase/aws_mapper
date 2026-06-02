// HUMIFY Unit 4 functional smoke for H-VPCE: the Landing Zone VPC-header tooltip
// referenced an undeclared `vpcVpces` (app-core.js renderLandingZoneMap mouseenter
// handler), throwing a ReferenceError on hover. The grid renderer is the default,
// so this switches to the landing-zone layout to exercise that code path.

const { test, expect } = require('@playwright/test');
const { loadDemo } = require('./helpers');

test.describe('Topology — Landing Zone VPC tooltip (Unit 4 / H-VPCE)', () => {
  test('hovering VPC headers in landing-zone mode throws no vpcVpces ReferenceError', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (t.includes('404') && t.includes('Failed to load resource')) return; // static-asset noise
      errors.push('console: ' + t);
    });

    await loadDemo(page);

    // Switch from the default grid renderer to renderLandingZoneMap and re-render.
    await page.evaluate(() => {
      const sel = document.getElementById('layoutMode');
      if (sel) sel.value = 'landingzone';
      renderMap();
    });
    // The landing-zone renderer (and only it) emits .lz-* gateway nodes.
    await page.locator('.lz-tgw-node, .lz-gw-node').first().waitFor({ state: 'attached', timeout: 15000 });

    // Fire mouseenter on every VPC group's rects — the header rect's handler is
    // where the undeclared `vpcVpces` was referenced.
    await page.evaluate(() => {
      document.querySelectorAll('.vpc-group').forEach((g) =>
        g.querySelectorAll('rect').forEach((r) =>
          r.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))));
    });
    await page.waitForTimeout(150);

    const refErrors = errors.filter((e) => /vpcVpces|is not defined|ReferenceError/.test(e));
    expect(refErrors, 'VPC header hover must not throw a ReferenceError').toEqual([]);
  });
});
