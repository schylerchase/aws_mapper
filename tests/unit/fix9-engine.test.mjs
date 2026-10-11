import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = {};
globalThis.document = { getElementById: () => null };
const design = await import('../../src/modules/design-mode.js');
const tracing = await import('../../src/modules/flow-tracing.js');
const rules = await import('../../src/modules/network-rules.js');
const multiAccount = await import('../../src/modules/multi-account.js');
const source = fs.readFileSync(new URL('../../src/app-core.js', import.meta.url), 'utf8');
function inlineFunction(name) {
  const start = source.indexOf('function ' + name + '(');
  const end = source.indexOf('\n}', start) + 2;
  assert.ok(start >= 0 && end > start, 'Active function exists: ' + name);
  return source.slice(start, end);
}

const parent = { VpcId: 'vpc-plan', CidrBlock: '10.20.0.0/16' };
const gatewayChange = () => ({ action: 'add_gateway', params: { GatewayType: 'IGW', VpcId: parent.VpcId, GatewayId: 'igw-plan' } });
const sgChange = () => ({ action: 'add_security_group', params: { VpcId: parent.VpcId, GroupId: 'sg-plan', Name: 'planned-group' } });

describe('R3-02 parent VPC validation', () => {
  for (const [name, change] of [['IGW', gatewayChange], ['security group', sgChange]]) {
    it('rejects ' + name + ' creation without the selected parent', () => {
      for (const context of [null, { vpcs: [] }, { vpcs: [{ VpcId: 'vpc-other' }] }]) {
        const result = design.validateDesignChange(change(), context);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(error => error.includes('VPC vpc-plan not found')));
      }
    });
    it('accepts ' + name + ' creation with an existing parent', () => {
      assert.equal(design.validateDesignChange(change(), { vpcs: [parent] }).valid, true);
    });
  }
  it('reports orphan IGW attachments and security groups in final validation', () => {
    const ctx = { vpcs: [], igws: [{ InternetGatewayId: 'igw-plan', Attachments: [{ VpcId: parent.VpcId }] }],
      sgs: [{ GroupId: 'sg-plan', VpcId: parent.VpcId }] };
    const result = design.validateDesignState([], ctx);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.includes('igw-plan') && error.includes('vpc-plan')));
    assert.ok(result.errors.some(error => error.includes('sg-plan') && error.includes('vpc-plan')));
    ctx.vpcs = [parent];
    assert.equal(design.validateDesignState([], ctx).valid, true);
  });
  it('keeps unattached IGWs valid without inventing a parent', () => {
    assert.equal(design.validateDesignState([], { vpcs: [], igws: [{ InternetGatewayId: 'igw-unattached', Attachments: [] }] }).valid, true);
  });
  it('active design replay removes dependent preview resources after their planned VPC is undone', () => {
    const baseline = { in_vpcs: JSON.stringify({ Vpcs: [{ VpcId: 'vpc-base', CidrBlock: '10.0.0.0/16' }] }) };
    let values;
    const sandbox = {
      _designBaseline: baseline, _designChanges: [], _lastDesignValidation: null,
      _restoreTextareas: data => { values = { ...data }; },
      _buildRlCtxFromTextareas: () => multiAccount.buildRlCtxFromData({ ...values }, '111111111111'),
      validateDesignChange: design.validateDesignChange, validateDesignState: design.validateDesignState,
      _designApplyFns: Object.fromEntries(Object.entries(design._designApplyFns).map(([name, apply]) =>
        [name, ch => apply(ch, id => values[id] || '', (id, value) => { values[id] = value; })])),
      renderChangeLog: () => {}, renderMap: () => {}, setTimeout: () => {}
    };
    vm.createContext(sandbox);
    vm.runInContext(inlineFunction('applyDesignChanges'), sandbox);
    const plannedVpc = { action: 'add_vpc', params: { ...parent } };
    sandbox._designChanges = [plannedVpc, gatewayChange(), sgChange()];
    sandbox.applyDesignChanges();
    assert.ok(sandbox._designChanges.every(ch => !ch._invalid));
    assert.equal(JSON.parse(values.in_igws).InternetGateways.length, 1);
    sandbox._designChanges.shift();
    sandbox.applyDesignChanges();
    assert.ok(sandbox._designChanges.every(ch => ch._invalid));
    assert.equal(sandbox._lastDesignValidation.valid, false);
    assert.equal(values.in_igws, undefined);
    assert.equal(values.in_sgs, undefined);
  });
});

const entry = (number, outbound, protocol, type, cidr) => ({ RuleNumber: number, Egress: outbound,
  Protocol: protocol, RuleAction: 'allow', CidrBlock: cidr, IcmpTypeCode: { Type: type, Code: 0 } });
function natCase(protocol = 'icmp', requestType = 8, responseType = 0) {
  const numeric = ['icmpv6', '58'].includes(protocol) ? '58' : '1';
  const nacl = { Entries: [
    entry(100, false, numeric, requestType, '10.0.1.0/24'),
    entry(110, false, numeric, responseType, '0.0.0.0/0'),
    entry(100, true, numeric, requestType, '0.0.0.0/0'),
    entry(110, true, numeric, responseType, '10.0.1.0/24')
  ] };
  const instance = { InstanceId: 'i-client', SubnetId: 'subnet-client', VpcId: 'vpc-a', PrivateIpAddress: '10.0.1.10', SecurityGroups: [{ GroupId: 'sg-all' }] };
  const ctx = {
    instBySub: { 'subnet-client': [instance] },
    subnets: [{ SubnetId: 'subnet-client', VpcId: 'vpc-a', CidrBlock: '10.0.1.0/24' }, { SubnetId: 'subnet-nat', VpcId: 'vpc-a', CidrBlock: '10.0.2.0/24' }],
    sgs: [{ GroupId: 'sg-all', IpPermissionsEgress: [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }] }],
    subRT: { 'subnet-client': { Routes: [{ DestinationCidrBlock: '0.0.0.0/0', NatGatewayId: 'nat-a', State: 'active' }] } },
    nats: [{ NatGatewayId: 'nat-a', SubnetId: 'subnet-nat', VpcId: 'vpc-a', State: 'available' }],
    subNacl: { 'subnet-nat': nacl }
  };
  return { nacl, ctx, nat: ctx.nats[0], config: { protocol, port: requestType } };
}
describe('R3-03 NAT ICMP return types', () => {
  for (const [protocol, requestType, responseType] of [['icmp', 8, 0], ['1', 8, 0], ['icmpv6', 128, 129], ['58', 128, 129]]) {
    it('allows request and correct echo reply for ' + protocol, () => {
      const { nat, ctx, config } = natCase(protocol, requestType, responseType);
      const result = tracing.evaluateNatSubnetACLs(nat, { ip: '10.0.1.10' }, config, ctx);
      assert.equal(result.action, 'allow');
      assert.ok(result.checks.every(check => check.result.action === 'allow'));
    });
    for (const [direction, index] of [['inbound', 1], ['outbound', 3]]) {
      it('rejects request-only ' + direction + ' response rules for ' + protocol, () => {
        const { nat, ctx, config, nacl } = natCase(protocol, requestType, responseType);
        nacl.Entries[index].IcmpTypeCode.Type = requestType;
        const result = tracing.evaluateNatSubnetACLs(nat, { ip: '10.0.1.10' }, config, ctx);
        assert.equal(result.action, 'deny');
        assert.match(result.rule, new RegExp(direction + ' response'));
      });
    }
  }
  it('retains discovery assumption when an ICMP response direction has no rules', () => {
    const { nat, ctx, config, nacl } = natCase();
    nacl.Entries = [];
    assert.equal(tracing.evaluateNatSubnetACLs(nat, { ip: '10.0.1.10' }, config, ctx, { assumeAllow: true }).action, 'allow');
  });
  it('retains explicit TCP NAT and client response ports', () => {
    const { nat, ctx } = natCase();
    ctx.subNacl['subnet-nat'].Entries = [[false, 443, '10.0.1.0/24'], [true, 443, '0.0.0.0/0'], [false, 40000, '0.0.0.0/0'], [true, 50000, '10.0.1.0/24']]
      .map(([egress, port, cidr], i) => ({ RuleNumber: 100 + i, Egress: egress, Protocol: '6', RuleAction: 'allow', CidrBlock: cidr, PortRange: { From: port, To: port } }));
    const config = { protocol: 'tcp', port: 443, sourcePort: 50000, natSourcePort: 40000 };
    assert.equal(tracing.evaluateNatSubnetACLs(nat, { ip: '10.0.1.10' }, config, ctx).action, 'allow');
    config.sourcePort = 50001;
    assert.equal(tracing.evaluateNatSubnetACLs(nat, { ip: '10.0.1.10' }, config, ctx).action, 'deny');
  });
  it('active Internet tracer accepts valid replies and blocks request-only reply rules', () => {
    const { nacl, ctx, config } = natCase();
    const sandbox = { window: { AppModules: { FlowTracing: tracing } },
      _resolveNetworkPosition: tracing.resolveNetworkPosition, evaluateNACL: rules.evaluateNACL, evaluateSG: rules.evaluateSG };
    vm.createContext(sandbox);
    vm.runInContext(inlineFunction('_traceResourceToInternet'), sandbox);
    const src = { type: 'instance', id: 'i-client' };
    assert.equal(sandbox._traceResourceToInternet(src, config, ctx).blocked, null);
    nacl.Entries[1].IcmpTypeCode.Type = 8;
    assert.match(sandbox._traceResourceToInternet(src, config, ctx).blocked.reason, /inbound response from Internet/);
  });
});
