const { test, expect } = require('@playwright/test');
const { BASE } = require('./helpers');

const base = { _format: 'awsmap', textareas: { in_vpcs: { Vpcs: [{ VpcId: 'vpc-base', CidrBlock: '10.0.0.0/16', OwnerId: '111111111111' }] } } };
const merged = { _format: 'awsmap', _version: '2.0', textareas: {}, multiViewMode: true, accounts: ['a', 'b'].map((name, i) => ({
  id: i ? '222222222222' : '111111111111', label: 'Account ' + name,
  textareas: { in_vpcs: { Vpcs: [{ VpcId: 'vpc-' + name, CidrBlock: '10.' + (i + 1) + '.0.0/16', OwnerId: i ? '222222222222' : '111111111111' }] } }
})) };

async function open(page, data) {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof _loadProjectData === 'function');
  await page.evaluate(value => _loadProjectData(value), data);
  await page.waitForFunction(() => _rlCtx && document.getElementById('loadingOverlay').style.display === 'none');
}
async function save(page) {
  return page.evaluate(async () => {
    let blob; const previous = downloadBlob; downloadBlob = value => { blob = value; };
    try { saveProject(); return JSON.parse(await blob.text()); } finally { downloadBlob = previous; }
  });
}

for (const scenario of ['main-public', 'explicit-private', 'main-blackhole']) {
  test('NAT design uses effective route table: ' + scenario, async ({ page }) => {
    const data = structuredClone(base);
    data.textareas.in_subnets = { Subnets: [{ SubnetId: 'subnet-plan', VpcId: 'vpc-base', CidrBlock: '10.0.1.0/24', AvailabilityZone: 'us-east-1a' }] };
    data.textareas.in_rts = { RouteTables: [{ RouteTableId: 'rtb-main', VpcId: 'vpc-base', Associations: [{ Main: true }], Routes: [{ DestinationCidrBlock: '0.0.0.0/0', GatewayId: 'igw-base', State: scenario === 'main-blackhole' ? 'blackhole' : 'active' }] }] };
    if (scenario === 'explicit-private') data.textareas.in_rts.RouteTables.push({ RouteTableId: 'rtb-private', VpcId: 'vpc-base', Associations: [{ SubnetId: 'subnet-plan' }], Routes: [{ DestinationCidrBlock: '10.0.0.0/16', GatewayId: 'local', State: 'active' }] });
    data.textareas.in_igws = { InternetGateways: [{ InternetGatewayId: 'igw-base', Attachments: [{ VpcId: 'vpc-base', State: 'available' }] }] };
    await open(page, data);
    const contexts = await page.evaluate(ta => {
      const fromInputs = _buildRlCtxFromTextareas(), fromData = _buildRlCtxFromData(ta, '');
      return [fromInputs, fromData].map(c => ({ public: c.pubSubs.has('subnet-plan'), route: c.subRT['subnet-plan']?.RouteTableId }));
    }, data.textareas);
    const isPublic = scenario === 'main-public';
    expect(contexts).toEqual(Array(2).fill({ public: isPublic, route: scenario === 'explicit-private' ? 'rtb-private' : 'rtb-main' }));
    await page.evaluate(() => {
      enterDesignMode();
      addDesignChange({ action: 'add_gateway', params: { GatewayType: 'NAT', VpcId: 'vpc-base', SubnetId: 'subnet-plan', Name: 'Planned NAT' } });
      clearTimeout(_designDebounce); applyDesignChanges();
    });
    await expect.poll(() => page.evaluate(() => _rlCtx.nats.length)).toBe(isPublic ? 1 : 0);
    expect(await page.evaluate(() => _designChanges[0]._invalid)).toBe(!isPublic);
  });
}

test('removing a planned subnet invalidates its EC2 addition and omits it from saved design', async ({ page }) => {
  await open(page, base);
  await page.evaluate(() => { enterDesignMode(); addDesignChange({ action: 'add_subnet', params: { VpcId: 'vpc-base', SubnetId: 'subnet-plan', CidrBlock: '10.0.1.0/24', AZ: 'us-east-1a' } }); });
  await page.waitForFunction(() => _rlCtx.subnets.some(s => s.SubnetId === 'subnet-plan'));
  await page.evaluate(() => addDesignChange({ action: 'add_resource', params: { ResourceType: 'EC2', ResourceId: 'i-plan', VpcId: 'vpc-base', SubnetId: 'subnet-plan', InstanceType: 't3.micro' } }));
  await page.waitForFunction(() => _rlCtx.instances.some(i => i.InstanceId === 'i-plan'));
  await page.locator('#changeLog .cl-undo').first().click();
  await page.waitForFunction(() => _rlCtx.subnets.length === 0 && _designChanges.length === 1);
  expect(await page.evaluate(() => ({ invalid: _designChanges[0]._invalid, errors: _designChanges[0]._validation.errors, valid: _lastDesignValidation.valid, count: _rlCtx.instances.length }))).toEqual({ invalid: true, errors: ['Subnet subnet-plan not found'], valid: false, count: 0 });
  expect((await save(page)).designChanges).toEqual([]);
});

test('saved project preserves manual classification and a legacy project clears it', async ({ page, context }) => {
  const data = structuredClone(base);
  data.textareas.in_rds = { DBInstances: [{ DBInstanceIdentifier: 'prod-orders', DBInstanceArn: 'arn:aws:rds:us-east-1:111111111111:db:prod-orders', DBInstanceClass: 'db.t3.medium', Engine: 'postgres', DBSubnetGroup: { VpcId: 'vpc-base', Subnets: [] } }] };
  await open(page, data);
  await page.evaluate(() => { runClassificationEngine(_rlCtx); openUnifiedDash('classification'); });
  const before = await page.evaluate(() => _classificationData.find(r => r.id === 'prod-orders').tier);
  const chosen = before === 'low' ? 'critical' : 'low';
  await page.locator('.gov-override-select[data-res-id="prod-orders"]').selectOption(chosen);
  const saved = await save(page);
  expect(Object.values(saved.classificationOverrides)).toContain(chosen);
  const restored = await context.newPage();
  try {
    await open(restored, saved);
    expect(await restored.evaluate(() => { runClassificationEngine(_rlCtx); const r = _classificationData.find(r => r.id === 'prod-orders'); return { tier: r.tier, auto: r.auto }; })).toEqual({ tier: chosen, auto: false });
    await restored.evaluate(value => _loadProjectData(value), data);
    await restored.waitForFunction(() => _rlCtx?.rdsInstances?.length === 1);
    expect(await restored.evaluate(() => { runClassificationEngine(_rlCtx); return Object.keys(_classificationOverrides); })).toEqual([]);
  } finally { await restored.close(); }
});

test('saved merged project preserves hidden accounts and defaults legacy visibility to true', async ({ page, context }) => {
  await open(page, merged);
  await page.evaluate(() => toggleAccountVisibility(1));
  await page.waitForFunction(() => _rlCtx.vpcs.length === 1);
  const saved = await save(page);
  expect(saved.accounts.map(a => a.visible)).toEqual([true, false]);
  const restored = await context.newPage();
  try {
    await open(restored, saved);
    expect(await restored.evaluate(() => ({ visible: _loadedContexts.map(c => c.visible), vpcs: _rlCtx.vpcs.map(v => v.VpcId) }))).toEqual({ visible: [true, false], vpcs: ['vpc-a'] });
    await restored.evaluate(() => toggleAccountVisibility(1));
    await restored.waitForFunction(() => _rlCtx.vpcs.length === 2);
    expect(await restored.evaluate(() => _loadedContexts.map(c => c.visible))).toEqual([true, true]);
  } finally { await restored.close(); }
  const legacy = await context.newPage();
  try { await open(legacy, merged); expect(await legacy.evaluate(() => _loadedContexts.map(c => c.visible))).toEqual([true, true]); } finally { await legacy.close(); }
});

test('hiding all accounts clears active resources and permits revealing them again', async ({ page, context }) => {
  await open(page, merged);
  await page.evaluate(() => toggleAccountVisibility(1));
  await page.waitForFunction(() => _rlCtx.vpcs.length === 1 && document.querySelector('#mapSvg [data-vpc-id="vpc-a"]'));
  await page.evaluate(() => toggleAccountVisibility(0));
  await page.waitForFunction(() => _rlCtx.vpcs.length === 0 && !document.querySelector('#mapSvg [data-vpc-id]'));
  expect(await page.evaluate(() => ({ visible: _loadedContexts.map(c => c.visible), ta: document.getElementById('in_vpcs').value, classifications: _classificationData.length, budr: _budrAssessments.length }))).toEqual({ visible: [false, false], ta: '', classifications: 0, budr: 0 });
  const saved = await save(page);
  const restored = await context.newPage();
  try { await open(restored, saved); expect(await restored.evaluate(() => _rlCtx.vpcs.length)).toBe(0); } finally { await restored.close(); }
  await page.evaluate(() => toggleAccountVisibility(1));
  await page.waitForFunction(() => _rlCtx.vpcs.length === 1 && !!document.querySelector('#mapSvg [data-vpc-id="vpc-b"]'));
  expect(await page.evaluate(() => _rlCtx.vpcs[0].VpcId)).toBe('vpc-b');
});
