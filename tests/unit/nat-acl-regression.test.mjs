import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as flow from '../../src/modules/flow-tracing.js';
import { evaluateSG, evaluateNACL } from '../../src/modules/network-rules.js';
const source = { type: 'instance', id: 'i-a' }, config = { protocol: 'tcp', port: 443 };
function network(entries) {
  const instance = { InstanceId: 'i-a', SubnetId: 'sub-client', VpcId: 'vpc-a', PrivateIpAddress: '10.0.1.10', SecurityGroups: [{ GroupId: 'sg-a' }] };
  return { instances: [instance], instBySub: { 'sub-client': [instance] }, subnets: [{ SubnetId: 'sub-client', VpcId: 'vpc-a', CidrBlock: '10.0.1.0/24' }], sgs: [{ GroupId: 'sg-a', IpPermissionsEgress: [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }] }], nats: [{ NatGatewayId: 'nat-a', SubnetId: 'sub-nat' }], subRT: { 'sub-client': { Routes: [{ DestinationCidrBlock: '0.0.0.0/0', NatGatewayId: 'nat-a' }] } }, subNacl: { 'sub-nat': { NetworkAclId: 'acl-nat', Entries: entries } } };
}
const entry = (Egress, From, To, RuleAction = 'allow', CidrBlock = '0.0.0.0/0') => ({ Egress, Protocol: '6', RuleNumber: From, PortRange: { From, To }, RuleAction, CidrBlock });
const open = [entry(false, 443, 443), entry(true, 443, 443), entry(false, 1024, 65535), entry(true, 1024, 65535)];
const app = fs.readFileSync(new URL('../../src/app-core.js', import.meta.url), 'utf8');
const start = app.indexOf('function _traceResourceToInternet('), end = app.indexOf('\nfunction ', start + 1);
const inline = vm.createContext({ window: { AppModules: { FlowTracing: flow } }, _resolveNetworkPosition: flow.resolveNetworkPosition, evaluateSG, evaluateNACL });
vm.runInContext(app.slice(start, end), inline);
for (const [name, trace] of [['module', flow.traceResourceToInternet], ['live inline', inline._traceResourceToInternet]]) {
  test(name + ' blocks a NAT subnet denying every request', () => {
    const ctx = network([entry(false, 0, 65535, 'deny'), entry(true, 0, 65535, 'deny')]);
    assert.match(trace(source, config, ctx).blocked.reason, /NAT subnet ACL/);
  });
  test(name + ' requires each NAT request and response direction', () => {
    for (let index = 0; index < open.length; index++) {
      assert.ok(trace(source, config, network(open.filter((_, i) => i !== index))).blocked, 'missing direction ' + index);
    }
  });
  test(name + ' permits a complete request and response ACL', () => {
    assert.equal(trace(source, config, network(open)).blocked, null);
  });
}

test('an explicit privileged client source port remains valid on the private side', () => {
  const ctx = network([...open, entry(true, 99, 99)]);
  assert.equal(flow.traceResourceToInternet(source, { ...config, sourcePort: 99 }, ctx).blocked, null);
});
