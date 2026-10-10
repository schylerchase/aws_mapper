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

test('saved designs retain the baseline and can undo a reloaded addition', async ({ page }) => {
  await openApp(page);
  await loadProjectData(page, project('vpc-original'));
  await page.evaluate(() => { enterDesignMode(); addDesignChange({ action: 'add_vpc', params: { VpcId: 'vpc-planned', CidrBlock: '10.20.0.0/16', Name: 'Plan' } }); });
  await page.waitForFunction(() => _rlCtx?.vpcs?.length === 2);
  const saved = await page.evaluate(async () => { let blob; const old = downloadBlob; downloadBlob = value => blob = value; try { saveProject(); return JSON.parse(await blob.text()); } finally { downloadBlob = old; } });
  expect(saved.textareas.in_vpcs.Vpcs.map(v => v.VpcId)).toEqual(['vpc-original']);
  await page.reload();
  await page.waitForFunction(() => typeof _loadProjectData === 'function');
  await page.evaluate(data => _loadProjectData(data), saved);
  await page.waitForFunction(() => _designMode && _rlCtx?.vpcs?.length === 2);
  expect(await page.evaluate(() => _designChanges.some(c => c._invalid))).toBe(false);
  await page.evaluate(() => undoLastChange());
  await page.waitForFunction(() => _rlCtx?.vpcs?.length === 1);
  expect(await page.evaluate(() => _rlCtx.vpcs[0].VpcId)).toBe('vpc-original');
});
test('dependent design changes replay against each preceding change', async ({ page }) => {
  await openApp(page);
  const data = project('vpc-original', { designChanges: [
    { action: 'add_vpc', params: { VpcId: 'vpc-planned', CidrBlock: '10.20.0.0/16', Name: 'Plan' } },
    { action: 'add_subnet', params: { VpcId: 'vpc-planned', SubnetId: 'subnet-planned', CidrBlock: '10.20.1.0/24', AZ: 'us-east-1a' } }
  ] });
  await page.evaluate(value => _loadProjectData(value), data);
  await page.waitForFunction(() => _rlCtx?.subnets?.some(s => s.SubnetId === 'subnet-planned'));
  expect(await page.evaluate(() => _designChanges.every(c => !c._invalid))).toBe(true);
  await page.evaluate(() => exitDesignMode());
  await page.waitForFunction(() => _rlCtx?.vpcs?.length === 1 && _rlCtx?.subnets?.length === 0);
});
