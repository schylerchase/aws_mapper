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

for (const type of ['Lambda', 'RDS']) {
  test('search opens the selected account ' + type + ' with the correct map target', async ({ page }) => {
    await openApp(page);
    const data = { _format: 'awsmap', textareas: {
      in_vpcs: { Vpcs: ['111111111111', '222222222222'].map((OwnerId, i) => ({ VpcId: 'vpc-' + i, CidrBlock: '10.' + i + '.0.0/16', OwnerId })) },
      in_subnets: { Subnets: [0, 1].map(i => ({ SubnetId: 'subnet-' + i, VpcId: 'vpc-' + i, CidrBlock: '10.' + i + '.0.0/24', AvailabilityZone: 'us-east-1a' })) }
    } };
    if (type === 'Lambda') data.textareas.in_lambda = { Functions: ['111111111111', '222222222222'].map((a, i) => ({ FunctionName: 'shared-name', FunctionArn: 'arn:aws:lambda:us-east-1:' + a + ':function:shared-name', Runtime: i ? 'nodejs22.x' : 'python3.12', MemorySize: i ? 1024 : 128, VpcConfig: { VpcId: 'vpc-' + i, SubnetIds: ['subnet-' + i], SecurityGroupIds: [] } })) };
    else data.textareas.in_rds = { DBInstances: ['111111111111', '222222222222'].map((a, i) => ({ DBInstanceIdentifier: 'shared-name', DBInstanceArn: 'arn:aws:rds:us-east-1:' + a + ':db:shared-name', Engine: i ? 'postgres' : 'mysql', DBInstanceClass: 'db.t3.micro', DBSubnetGroup: { VpcId: 'vpc-' + i, Subnets: [{ SubnetIdentifier: 'subnet-' + i }] } })) };
    await page.evaluate(value => { _showNested = true; _detailLevel = 1; _loadProjectData(value); }, data);
    await page.waitForFunction(() => _rlCtx?.vpcs?.length === 2);
    await expect(page.locator('#mapSvg [data-id="shared-name"]')).toHaveCount(2);
    await page.evaluate(() => { window._testZoomVpc = ''; _zoomToElement = (id, node) => { const subnetId = node?.closest('[data-subnet-id]')?.getAttribute('data-subnet-id'); window._testZoomVpc = node?.closest('[data-vpc-id]')?.getAttribute('data-vpc-id') || _rlCtx.subnets.find(s => s.SubnetId === subnetId)?.VpcId || ''; }; openSearch(); });
    await page.locator('#searchInput').fill('shared-name');
    await page.locator('#searchResults > div').filter({ hasText: '222222222222' }).click();
    await expect(page.locator('#dpSub')).toContainText(type === 'Lambda' ? 'nodejs22.x' : 'postgres');
    if (type === 'Lambda') await expect(page.locator('#dpBody')).toContainText('vpc-1');
    expect(await page.evaluate(() => window._testZoomVpc)).toBe('vpc-1');
  });
}
