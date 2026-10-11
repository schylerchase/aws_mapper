import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as rules from '../../src/modules/network-rules.js';
const app = fs.readFileSync(new URL('../../src/app-core.js', import.meta.url), 'utf8');
const inline = vm.createContext({ window: { AppModules: rules }, _protoMatch: rules.protoMatch, _portInRange: rules.portInRange, _ipFromCidr: rules.ipFromCidr, _cidrContains: rules.cidrContains, _protoName: rules.protoName });
for (const name of ['evaluateSG', 'evaluateNACL']) {
  const start = app.indexOf('function ' + name + '('), end = app.indexOf('\nfunction ', start + 1);
  vm.runInContext(app.slice(start, end), inline);
}
for (const [label, api] of [['module', rules], ['live inline', inline]]) {
  test(label + ' uses ICMP type/code instead of a port range', () => {
    const groups = [{ GroupId: 'sg-a', IpPermissions: [{ IpProtocol: '1', FromPort: 8, ToPort: -1, IpRanges: [{ CidrIp: '0.0.0.0/0' }] }] }];
    assert.equal(api.evaluateSG(groups, 'inbound', 'icmp', 8, '198.51.100.1/32').action, 'allow');
    assert.equal(api.evaluateSG(groups, 'inbound', 'icmp', 3, '198.51.100.1/32').action, 'deny');
    groups[0].IpPermissions[0].ToPort = 0;
    assert.equal(api.evaluateSG(groups, 'inbound', 'icmp', 8, '198.51.100.1/32', { icmpCode: 1 }).action, 'deny');
  });
  test(label + ' checks NACL ICMP type/code and first-match ordering', () => {
    const entries = [
      { Egress: false, RuleNumber: 100, Protocol: '1', IcmpTypeCode: { Type: 3, Code: -1 }, CidrBlock: '0.0.0.0/0', RuleAction: 'deny' },
      { Egress: false, RuleNumber: 200, Protocol: '1', IcmpTypeCode: { Type: 8, Code: 0 }, CidrBlock: '0.0.0.0/0', RuleAction: 'allow' }
    ];
    assert.equal(api.evaluateNACL({ Entries: entries }, 'inbound', 'icmp', 8, '198.51.100.1/32').action, 'allow');
    assert.equal(api.evaluateNACL({ Entries: entries }, 'inbound', 'icmp', 3, '198.51.100.1/32').action, 'deny');
  });
  test(label + ' preserves normal TCP port-range behavior', () => {
    const groups = [{ IpPermissions: [{ IpProtocol: 'tcp', FromPort: 80, ToPort: 81, IpRanges: [{ CidrIp: '0.0.0.0/0' }] }] }];
    assert.equal(api.evaluateSG(groups, 'inbound', 'tcp', 80, '198.51.100.1/32').action, 'allow');
    assert.equal(api.evaluateSG(groups, 'inbound', 'tcp', 443, '198.51.100.1/32').action, 'deny');
  });
}
