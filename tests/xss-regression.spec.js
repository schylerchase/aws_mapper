const { test, expect } = require('@playwright/test');
const { BASE, loadDemo } = require('./helpers');

// Regression coverage for the inline-onclick -> delegated-listener security refactor
// (app-core.js / modules/detail-panel.js / modules/search.js).
//
// The refactor replaced  onclick="_fn('+esc(id)+'')"  -- where a resource id containing a
// quote could break out of the handler string even after esc() (inline-handler attributes are
// HTML-decoded *before* JS parse, so &#39; decodes back to ') -- with data-* attributes read
// via .dataset, which are never parsed as code. These tests pin that behavior: nothing guarded
// it before, so a revert, or drift between the duplicated function copies, would ship silently.
//
// Each test feeds a payload through a surface the refactor touched and asserts it (a) injects no
// live node, (b) never executes, (c) survives as inert escaped text (proving it was rendered,
// not merely stripped). Mirrors the contract in security.spec.js.

// Auto-firing payload: the onerror runs the instant an <img> is parsed into the DOM -- no hover
// or click needed -- so a failed escape trips the sentinel during the test run.
const PAYLOAD = '<img src=x onerror="window.__xssFired=true">';
// Attribute-breakout id: if esc() failed to encode " < >, this escapes the data-* attribute and
// the tag, injecting a fresh auto-firing <img>.
const ID_BREAKOUT = 'subnet-evil"><img src=x onerror="window.__xssFired=true">';

async function assertNoXss(page, container) {
  await expect(page.locator(container + ' img')).toHaveCount(0); // no node injected
  expect(await page.evaluate(() => window.__xssFired === true)).toBe(false); // never executed
}

test.describe('XSS regression -- inline-handler -> delegated-listener refactor', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
  });

  // Covers app-core.js _openDetailForSearch (the live copy) + detail-panel.js dp-link rows.
  test('_openDetailForSearch escapes VPC name and breakout subnet id', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('#landingDash').waitFor({ state: 'visible', timeout: 10000 });

    await page.evaluate(({ payload, idBreakout }) => {
      window.__xssFired = false;
      // Seed the resource-list context the detail panel reads from (var _rlCtx is a real global).
      _rlCtx = {
        vpcs: [{ VpcId: 'vpc-xss', CidrBlock: '10.0.0.0/16', State: 'available',
                 Tags: [{ Key: 'Name', Value: payload }] }],
        // Subnet name carries an HTML payload; SubnetId carries an attribute-breakout payload.
        subnets: [{ SubnetId: idBreakout, VpcId: 'vpc-xss', CidrBlock: '10.0.1.0/24',
                    Tags: [{ Key: 'Name', Value: payload }] }],
        pubSubs: new Set(), igws: [], nats: [], sgs: [], instances: [],
      };
      _openDetailForSearch('VPC', 'vpc-xss');
    }, { payload: PAYLOAD, idBreakout: ID_BREAKOUT });

    await page.locator('#detailPanel.open').waitFor({ state: 'visible', timeout: 5000 });
    await assertNoXss(page, '#dpBody');
    await expect(page.locator('#dpTitle img')).toHaveCount(0);
    await expect(page.locator('#dpBody')).toContainText('<img src=x onerror=');
  });

  // Covers search.js result rendering (now createElement + textContent; guards against innerHTML revert).
  test('search results render resource names as inert text', async ({ page }) => {
    await loadDemo(page);

    await page.evaluate((payload) => {
      window.__xssFired = false;
      // The search handler calls _getAllNotes() before rendering; the app-core notes global is
      // only initialised on first notes access (demo render never touches it), so seed it here to
      // avoid Object.entries(undefined) aborting the handler before it renders results.
      window._annotations = {};
      window._notesLoaded = true;
      const vpc = (_rlCtx.vpcs || [])[0];
      if (!vpc) return;
      vpc.Tags = [{ Key: 'Name', Value: payload }];
      if (typeof _invalidateSearchIndex === 'function') _invalidateSearchIndex();
    }, PAYLOAD);

    await page.evaluate(() => openSearch());
    await page.locator('#searchInput').fill('img');
    await page.waitForTimeout(250);
    await page.locator('#searchResults > div').first().waitFor({ state: 'attached', timeout: 5000 });
    await assertNoXss(page, '#searchResults');
    await expect(page.locator('#searchResults')).toContainText('<img src=x onerror=');
  });

  // Covers app-core.js _openResourceSpotlight (the live copy). Needs the rendered map -- spotlight
  // bails if the resource's SVG node is absent -- so load demo, then poison a real VPC's name.
  test('_openResourceSpotlight escapes resource name', async ({ page }) => {
    await loadDemo(page);

    const result = await page.evaluate((payload) => {
      window.__xssFired = false;
      const node = document.querySelector('[data-vpc-id]');
      if (!node) return 'no-vpc-node';
      const vid = node.getAttribute('data-vpc-id');
      const vpc = (_rlCtx.vpcs || []).find(v => v.VpcId === vid);
      if (!vpc) return 'no-vpc-ctx';
      vpc.Tags = [{ Key: 'Name', Value: payload }];
      _openResourceSpotlight(vid);
      return 'opened';
    }, PAYLOAD);
    expect(result).toBe('opened');

    await page.locator('#spotlightCard').waitFor({ state: 'visible', timeout: 5000 });
    await assertNoXss(page, '#spotlightCard');
    await expect(page.locator('#spotlightCard h3')).toContainText('<img src=x onerror=');
  });
});
