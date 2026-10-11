const { test, expect } = require('@playwright/test');
const BASE = process.env.AWS_MAPPER_TEST_URL || 'http://localhost:8377/index.html';
const baseline = { _format: 'awsmap', textareas: { in_vpcs: { Vpcs: [
  { VpcId: 'vpc-base', CidrBlock: '10.0.0.0/16', OwnerId: '111111111111' }
] } } };
async function openApp(page) {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
  await page.goto(BASE);
  await page.waitForFunction(() => typeof _loadProjectData === 'function');
}

test('merged projects restore saved designs after the merged baseline is ready', async ({ page }) => {
  await openApp(page);
  await page.evaluate(data => _loadProjectData(data), baseline);
  await page.waitForFunction(() => _rlCtx?.vpcs?.length === 1);
  await page.evaluate(() => {
    ['a', 'b'].forEach((id, i) => addAccountContext({ textareas: { in_vpcs: JSON.stringify({ Vpcs: [
      { VpcId: 'vpc-' + id, CidrBlock: '10.' + (i + 1) + '.0.0/16', OwnerId: i ? '222222222222' : '111111111111' }
    ] }) } }, 'Account ' + id));
    enterMultiView();
  });
  await page.waitForFunction(() => _rlCtx?.vpcs?.length === 2 && JSON.parse(document.getElementById('in_vpcs').value).Vpcs.length === 2);
  await page.evaluate(() => {
    enterDesignMode();
    addDesignChange({ action: 'add_vpc', params: { VpcId: 'vpc-plan', CidrBlock: '10.20.0.0/16', Name: 'Plan' } });
  });
  await page.waitForFunction(() => _rlCtx?.vpcs?.some(v => v.VpcId === 'vpc-plan'));
  const saved = await page.evaluate(async () => {
    let blob; const old = downloadBlob; downloadBlob = value => blob = value;
    try { saveProject(); return JSON.parse(await blob.text()); } finally { downloadBlob = old; }
  });
  expect(saved.designChanges).toHaveLength(1);
  expect(saved.multiViewMode).toBe(true);
  await page.reload();
  await page.waitForFunction(() => typeof _loadProjectData === 'function');
  // Account data is sufficient even when the optional display textareas are absent.
  saved.textareas = {};
  await page.evaluate(data => _loadProjectData(data), saved);
  await page.waitForFunction(() => _designMode && _rlCtx?.vpcs?.length === 3);
  expect(await page.evaluate(() => ({ changes: _designChanges.length, invalid: _designChanges.some(c => c._invalid), baseline: JSON.parse(_designBaseline.in_vpcs).Vpcs.length })))
    .toEqual({ changes: 1, invalid: false, baseline: 2 });
  await page.evaluate(() => exitDesignMode());
  await page.waitForFunction(() => _rlCtx?.vpcs?.length === 2);
});

test('removing a planned VPC invalidates its surviving subnet instead of applying an orphan', async ({ page }) => {
  await openApp(page);
  await page.evaluate(data => _loadProjectData(data), baseline);
  await page.waitForFunction(() => _rlCtx?.vpcs?.length === 1);
  await page.evaluate(() => {
    enterDesignMode();
    addDesignChange({ action: 'add_vpc', params: { VpcId: 'vpc-parent', CidrBlock: '10.20.0.0/16' } });
  });
  await page.waitForFunction(() => _rlCtx?.vpcs?.length === 2);
  await page.evaluate(() => addDesignChange({ action: 'add_subnet', params: { VpcId: 'vpc-parent', SubnetId: 'subnet-child', CidrBlock: '10.20.1.0/24', AZ: 'us-east-1a' } }));
  await page.waitForFunction(() => _rlCtx?.subnets?.some(s => s.SubnetId === 'subnet-child'));
  await page.locator('#changeLog .cl-undo').first().click();
  await page.waitForFunction(() => _rlCtx?.vpcs?.length === 1 && _rlCtx?.subnets?.length === 0);
  const state = await page.evaluate(() => ({ invalid: _designChanges[0]._invalid, errors: _designChanges[0]._validation.errors, valid: _lastDesignValidation.valid }));
  expect(state.invalid).toBe(true);
  expect(state.errors).toContain('VPC vpc-parent not found');
  expect(state.valid).toBe(false);
});

test('live design routes use the AWS field for each route target', async ({ page }) => {
  await openApp(page);
  const data = JSON.parse(JSON.stringify(baseline));
  data.textareas.in_rts = { RouteTables: [{ RouteTableId: 'rtb-base', VpcId: 'vpc-base', Routes: [], Associations: [{ Main: true }] }] };
  await page.evaluate(value => _loadProjectData(value), data);
  await page.waitForFunction(() => _rlCtx?.rts?.some(rt => rt.RouteTableId === 'rtb-base'));
  const targets = [ ['nat-test', 'NatGatewayId'], ['tgw-test', 'TransitGatewayId'], ['pcx-test', 'VpcPeeringConnectionId'], ['igw-test', 'GatewayId'] ];
  await page.evaluate(items => {
    enterDesignMode();
    items.forEach(([TargetId], i) => {
      addDesignChange({ action: 'add_route', target: { RouteTableId: 'rtb-base', VpcId: 'vpc-base' }, params: { DestinationCidrBlock: '10.' + (30 + i) + '.0.0/16', TargetId } }, _buildRlCtxFromTextareas());
      applyDesignChanges();
    });
    clearTimeout(_designDebounce);
  }, targets);
  await page.waitForFunction(() => _rlCtx?.rts?.find(rt => rt.RouteTableId === 'rtb-base')?.Routes?.length === 4);
  const routes = await page.evaluate(() => _rlCtx.rts.find(rt => rt.RouteTableId === 'rtb-base').Routes);
  targets.forEach(([id, field], i) => {
    expect(routes[i][field]).toBe(id);
    if (field !== 'GatewayId') expect(routes[i].GatewayId).toBeUndefined();
  });
  const exports = await page.evaluate(() => ({ tf: generateTerraform(_rlCtx, { mode: 'create' }).code, cfn: JSON.parse(generateCloudFormation(_rlCtx, { format: 'json' }).code) }));
  expect(exports.tf).toContain('nat_gateway_id = ');
  expect(exports.tf).toContain('transit_gateway_id = ');
  expect(exports.tf).toContain('vpc_peering_connection_id = ');
  const cfnRoutes = Object.values(exports.cfn.Resources).filter(r => r.Type === 'AWS::EC2::Route');
  targets.forEach(([id, field]) => expect(cfnRoutes.some(r => r.Properties[field] === id)).toBe(true));
});
