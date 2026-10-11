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

function distributions(...ids) { return { DistributionList: { Items: ids.map(Id => ({ Id, ARN: 'arn:aws:cloudfront::111111111111:distribution/' + Id, Enabled: true, Origins: { Items: [] } })) } }; }
test('regional folder global files survive merge and project saving', async ({ page }) => {
  await openApp(page);
  await page.evaluate(data => importFolder(data), { _structure: 'multi-region', regions: { 'us-east-1': { 'vpcs.json': project('vpc-region').textareas.in_vpcs, 'cloudfront.json': distributions('REGIONAL') } }, files: { 'cloudfront.json': distributions('GLOBAL'), 's3.json': { Buckets: [{ Name: 'global-bucket' }] } } });
  await page.waitForFunction(() => _rlCtx?.cfDistributions?.length === 2 && document.getElementById('in_cf').value.includes('GLOBAL'));
  expect(await page.evaluate(() => _rlCtx.cfDistributions.map(d => d.Id).sort())).toEqual(['GLOBAL', 'REGIONAL']);
  expect(await page.evaluate(() => _rlCtx.s3bk.map(b => b.Name))).toContain('global-bucket');
  expect(await page.evaluate(() => JSON.stringify(_loadedContexts[0].textareas))).toContain('GLOBAL');
});
test('profile-level globals stay with their owning profile', async ({ page }) => {
  await openApp(page);
  await page.evaluate(data => importFolder(data), { _structure: 'multi-profile', profiles: {
    alpha: { regions: { 'us-east-1': { 'vpcs.json': project('vpc-a').textareas.in_vpcs } }, files: { 'cloudfront.json': distributions('ALPHA') } },
    beta: { regions: { 'us-west-2': { 'vpcs.json': { Vpcs: [{ VpcId: 'vpc-b', CidrBlock: '10.1.0.0/16', OwnerId: '222222222222' }] } } }, files: { 's3.json': { Buckets: [{ Name: 'beta-bucket' }] } } }
  } });
  await page.waitForFunction(() => _rlCtx?.cfDistributions?.length === 1 && _rlCtx?.s3bk?.length === 1);
  const contextData = await page.evaluate(() => _loadedContexts.map(c => ({ label: c.accountLabel, data: JSON.stringify(c.textareas) })));
  expect(contextData[0].data).toContain('ALPHA');
  expect(contextData[1].data).not.toContain('ALPHA');
  expect(contextData[1].data).toContain('beta-bucket');
});
