const { test, expect } = require('@playwright/test');
const BASE = process.env.AWS_MAPPER_TEST_URL || 'http://localhost:8377/index.html';
async function openApp(page) {
  await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof _loadProjectData === 'function');
}
function project(id, extra = {}) {
  return { _format: 'awsmap', textareas: { in_vpcs: { Vpcs: [{ VpcId: id, CidrBlock: '10.0.0.0/16', OwnerId: '111111111111' }] } }, ...extra };
}
async function loadProjectData(page, data) {
  await page.evaluate(value => _loadProjectData(value), data);
  await page.waitForFunction(id => _rlCtx?.vpcs?.some(v => v.VpcId === id), data.textareas.in_vpcs.Vpcs[0].VpcId);
}

test('clear discards design state and queued mutations permanently', async ({ page }) => {
  await openApp(page);
  await loadProjectData(page, project('vpc-original'));
  await page.evaluate(() => { enterDesignMode(); addDesignChange({ action: 'add_vpc', params: { VpcId: 'vpc-plan', CidrBlock: '10.20.0.0/16' } }); document.getElementById('clearBtn').click(); });
  await expect(page.locator('#landingDash')).toBeVisible();
  expect(await page.evaluate(() => ({ mode: _designMode, baseline: _designBaseline, changes: _designChanges.length, queued: _designDebounce }))).toEqual({ mode: false, baseline: null, changes: 0, queued: null });
  await page.waitForTimeout(450);
  expect(await page.evaluate(() => ({ input: document.getElementById('in_vpcs').value, ctx: _rlCtx }))).toEqual({ input: '', ctx: null });
  await page.evaluate(() => { document.getElementById('designToggle').click(); document.getElementById('designToggle').click(); });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.getElementById('in_vpcs').value)).toBe('');
});
