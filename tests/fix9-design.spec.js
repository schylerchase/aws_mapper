const { test, expect } = require('@playwright/test');
const { BASE } = require('./helpers');

async function open(page, textareas, layout) {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof _loadProjectData === 'function');
  await page.evaluate(data => _loadProjectData(data), { _format: 'awsmap', textareas, ...(layout ? { layout } : {}) });
  await page.waitForFunction(() => _rlCtx && document.getElementById('loadingOverlay').style.display === 'none');
}

async function exportPlan(page) {
  return page.evaluate(async () => {
    let blob; const previous = downloadBlob; downloadBlob = value => { blob = value; };
    try { exportDesignPlan(); return JSON.parse(await blob.text()); } finally { downloadBlob = previous; }
  });
}

test('planned IGW and security group become blocked when their VPC creation is undone', async ({ page }) => {
  await open(page, { in_vpcs: { Vpcs: [{ VpcId: 'vpc-base', CidrBlock: '10.0.0.0/16', OwnerId: '111111111111' }] } });
  await page.evaluate(() => {
    enterDesignMode();
    addDesignChange({ action: 'add_vpc', params: { VpcId: 'vpc-plan', CidrBlock: '10.20.0.0/16' } });
    clearTimeout(_designDebounce); applyDesignChanges();
  });
  await page.waitForFunction(() => _rlCtx.vpcs.some(v => v.VpcId === 'vpc-plan'));
  await page.evaluate(() => {
    addDesignChange({ action: 'add_gateway', params: { GatewayType: 'IGW', VpcId: 'vpc-plan', GatewayId: 'igw-plan' } });
    addDesignChange({ action: 'add_security_group', params: { VpcId: 'vpc-plan', GroupId: 'sg-plan', Name: 'planned-group' } });
    clearTimeout(_designDebounce); applyDesignChanges();
  });
  await page.waitForFunction(() => _rlCtx.igws.some(g => g.InternetGatewayId === 'igw-plan') && _rlCtx.sgs.some(g => g.GroupId === 'sg-plan'));
  const valid = await exportPlan(page);
  expect(valid.validation.status).toBe('valid');
  expect(valid.blocked_changes).toHaveLength(0);
  expect(valid.aws_cli.some(command => command.includes('attach-internet-gateway') && command.includes('vpc-plan'))).toBe(true);
  expect(valid.aws_cli.some(command => command.includes('create-security-group') && command.includes('vpc-plan'))).toBe(true);
  await page.locator('#changeLog .cl-undo').first().click();
  await page.waitForFunction(() => _rlCtx.vpcs.length === 1 && !_rlCtx.igws.some(g => g.InternetGatewayId === 'igw-plan') && !_rlCtx.sgs.some(g => g.GroupId === 'sg-plan'));
  const invalid = await exportPlan(page);
  expect(invalid.validation.status).toBe('errors');
  expect(invalid.changes).toHaveLength(0);
  expect(invalid.blocked_changes.map(change => change.action)).toEqual(['add_gateway', 'add_security_group']);
  expect(invalid.blocked_changes.every(change => change.errors.includes('VPC vpc-plan not found'))).toBe(true);
  expect(invalid.aws_cli).toHaveLength(0);
});

test('Executive layout live NAT Internet trace uses echo reply types for both response ACL directions', async ({ page }) => {
  const aclEntry = (number, outbound, type, cidr) => ({ RuleNumber: number, Egress: outbound, Protocol: '1', RuleAction: 'allow', CidrBlock: cidr, IcmpTypeCode: { Type: type, Code: 0 } });
  await open(page, {
    in_vpcs: { Vpcs: [{ VpcId: 'vpc-base', CidrBlock: '10.0.0.0/16', OwnerId: '111111111111' }] },
    in_subnets: { Subnets: [{ SubnetId: 'subnet-client', VpcId: 'vpc-base', CidrBlock: '10.0.1.0/24' }, { SubnetId: 'subnet-nat', VpcId: 'vpc-base', CidrBlock: '10.0.2.0/24' }] },
    in_ec2: { Reservations: [{ Instances: [{ InstanceId: 'i-client', VpcId: 'vpc-base', SubnetId: 'subnet-client', PrivateIpAddress: '10.0.1.10', SecurityGroups: [{ GroupId: 'sg-all' }] }] }] },
    in_sgs: { SecurityGroups: [{ GroupId: 'sg-all', VpcId: 'vpc-base', GroupName: 'all', IpPermissionsEgress: [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }] }] },
    in_rts: { RouteTables: [{ RouteTableId: 'rtb-client', VpcId: 'vpc-base', Associations: [{ SubnetId: 'subnet-client' }], Routes: [{ DestinationCidrBlock: '0.0.0.0/0', NatGatewayId: 'nat-plan', State: 'active' }] }] },
    in_nats: { NatGateways: [{ NatGatewayId: 'nat-plan', SubnetId: 'subnet-nat', VpcId: 'vpc-base', State: 'available' }] },
    in_nacls: { NetworkAcls: [{ NetworkAclId: 'acl-nat', VpcId: 'vpc-base', Associations: [{ SubnetId: 'subnet-nat' }], Entries: [
      aclEntry(100, false, 8, '10.0.1.0/24'), aclEntry(110, false, 0, '0.0.0.0/0'),
      aclEntry(100, true, 8, '0.0.0.0/0'), aclEntry(110, true, 0, '10.0.1.0/24')
    ] }] }
  }, 'executive');
  await expect(page.locator('#layoutMode')).toHaveValue('executive');
  const observed = await page.evaluate(() => {
    const position = _resolveNetworkPosition('instance', 'i-client', _rlCtx);
    const sg = evaluateSG(position.sgs, 'outbound', 'icmp', 8, '0.0.0.0/0');
    const trace = () => _traceResourceToInternet({ type: 'instance', id: 'i-client' }, { protocol: 'icmp', port: 8 }, _rlCtx);
    const valid = trace();
    const entries = _rlCtx.subNacl['subnet-nat'].Entries;
    entries[1].IcmpTypeCode.Type = 8;
    const inboundDenied = trace();
    entries[1].IcmpTypeCode.Type = 0;
    entries[3].IcmpTypeCode.Type = 8;
    const outboundDenied = trace();
    return { sg: sg.action, valid: valid.blocked, inbound: inboundDenied.blocked?.reason, outbound: outboundDenied.blocked?.reason };
  });
  expect(observed.sg).toBe('allow');
  expect(observed.valid).toBeNull();
  expect(observed.inbound).toContain('inbound response from Internet');
  expect(observed.outbound).toContain('outbound response to client');
});
