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

test('ordinary folder imports write recovery data without input events', async ({ page }) => {
  await openApp(page);
  await page.evaluate(data => importFolder({ _structure: 'flat', files: { 'vpcs.json': data } }), project('vpc-folder').textareas.in_vpcs);
  await page.waitForFunction(() => sessionStorage.getItem(_SAVE_KEY));
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem(_SAVE_KEY)));
  expect(JSON.parse(saved.in_vpcs).Vpcs[0].VpcId).toBe('vpc-folder');
});
test('merged folder recovery waits for all textarea writes', async ({ page }) => {
  await openApp(page);
  await page.evaluate(data => importFolder(data), { _structure: 'multi-region', regions: {
    'us-east-1': { 'vpcs.json': project('vpc-east').textareas.in_vpcs },
    'us-west-2': { 'vpcs.json': { Vpcs: [{ VpcId: 'vpc-west', CidrBlock: '10.1.0.0/16', OwnerId: '111111111111' }] }, 'lambda.json': { Functions: [{ FunctionName: 'recovery-function', FunctionArn: 'arn:aws:lambda:us-west-2:111111111111:function:recovery-function', Runtime: 'python3.12', VpcConfig: { VpcId: 'vpc-west', SubnetIds: [], SecurityGroupIds: [] } }] } }
  } });
  await page.waitForFunction(() => { const raw = sessionStorage.getItem(_SAVE_KEY); return raw && JSON.parse(raw).in_lambda?.includes('recovery-function'); });
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem(_SAVE_KEY)));
  expect(JSON.parse(saved.in_vpcs).Vpcs.map(v => v.VpcId).sort()).toEqual(['vpc-east', 'vpc-west']);
});
