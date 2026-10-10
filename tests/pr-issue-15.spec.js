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

test('merged design changes appear in the active map and revert on exit', async ({ page }) => {
  await openApp(page);
  await loadProjectData(page, project('vpc-original'));
  await page.evaluate(() => { ['a', 'b'].forEach((id, i) => addAccountContext({ textareas: { in_vpcs: JSON.stringify({ Vpcs: [{ VpcId: 'vpc-' + id, CidrBlock: '10.' + i + '.0.0/16', OwnerId: i ? '222222222222' : '111111111111' }] }) } }, 'Account ' + id)); enterMultiView(); });
  await page.waitForFunction(() => _rlCtx?.vpcs?.length === 2 && JSON.parse(document.getElementById('in_vpcs').value).Vpcs?.length === 2);
  await page.evaluate(() => { enterDesignMode(); addDesignChange({ action: 'add_vpc', params: { VpcId: 'vpc-plan', CidrBlock: '10.20.0.0/16', Name: 'Plan' } }); });
  await page.waitForFunction(() => _rlCtx?.vpcs?.length === 3);
  await expect(page.locator('[data-vpc-id="vpc-plan"]')).toBeAttached();
  await page.evaluate(() => exitDesignMode());
  await page.waitForFunction(() => _rlCtx?.vpcs?.length === 2);
  expect(await page.evaluate(() => _multiViewMode)).toBe(true);
  await expect(page.locator('[data-vpc-id="vpc-plan"]')).toHaveCount(0);
});
