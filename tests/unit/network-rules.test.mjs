import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ipToNum, ipFromCidr, cidrContains, protoMatch, portInRange, protoName,
  evaluateRouteTable, evaluateNACL, evaluateSG
} from '../../src/modules/network-rules.js';

describe('ipToNum', () => {
  it('converts 10.0.0.1', () => assert.equal(ipToNum('10.0.0.1'), 167772161));
  it('converts 0.0.0.0', () => assert.equal(ipToNum('0.0.0.0'), 0));
  it('returns null for null', () => assert.equal(ipToNum(null), null));
  it('returns null for invalid', () => assert.equal(ipToNum('abc'), null));
});

describe('ipFromCidr', () => {
  it('extracts IP from CIDR', () => assert.equal(ipFromCidr('10.0.0.0/24'), '10.0.0.0'));
  it('returns null for null', () => assert.equal(ipFromCidr(null), null));
});

describe('cidrContains', () => {
  it('0.0.0.0/0 contains any IP', () => assert.equal(cidrContains('0.0.0.0/0', '192.168.1.1'), true));
  it('10.0.0.0/24 contains 10.0.0.5', () => assert.equal(cidrContains('10.0.0.0/24', '10.0.0.5'), true));
  it('10.0.0.0/24 does not contain 10.0.1.5', () => assert.equal(cidrContains('10.0.0.0/24', '10.0.1.5'), false));
  it('returns false for null inputs', () => assert.equal(cidrContains(null, '10.0.0.1'), false));
});

describe('protoMatch', () => {
  it('-1 matches anything', () => assert.equal(protoMatch('-1', 'tcp'), true));
  it('all matches anything', () => assert.equal(protoMatch('all', 'udp'), true));
  it('6 matches tcp', () => assert.equal(protoMatch('6', 'tcp'), true));
  it('17 matches udp', () => assert.equal(protoMatch('17', 'udp'), true));
  it('1 matches icmp', () => assert.equal(protoMatch('1', 'icmp'), true));
  it('tcp matches 6', () => assert.equal(protoMatch('tcp', '6'), true));
  it('tcp does not match udp', () => assert.equal(protoMatch('tcp', 'udp'), false));
});

describe('portInRange', () => {
  it('443 is in range 443-443', () => assert.equal(portInRange(443, 443, 443), true));
  it('80 is not in range 443-443', () => assert.equal(portInRange(80, 443, 443), false));
  it('any port matches 0-65535', () => assert.equal(portInRange(8080, 0, 65535), true));
  it('any port matches -1 to -1 (all)', () => assert.equal(portInRange(443, -1, -1), true));
  it('returns true when no range defined', () => assert.equal(portInRange(443, undefined, undefined), true));
});

describe('protoName', () => {
  it('-1 → ALL', () => assert.equal(protoName('-1'), 'ALL'));
  it('6 → TCP', () => assert.equal(protoName('6'), 'TCP'));
  it('17 → UDP', () => assert.equal(protoName('17'), 'UDP'));
  it('1 → ICMP', () => assert.equal(protoName('1'), 'ICMP'));
  it('unknown → uppercase', () => assert.equal(protoName('58'), '58'));
});

describe('evaluateRouteTable', () => {
  it('returns local for null RT', () => {
    const r = evaluateRouteTable(null, '10.0.0.0/24');
    assert.equal(r.type, 'local');
  });

  it('finds IGW route for internet traffic', () => {
    const rt = {
      Routes: [
        { DestinationCidrBlock: '0.0.0.0/0', GatewayId: 'igw-123' },
        { DestinationCidrBlock: '10.0.0.0/16', GatewayId: 'local' }
      ]
    };
    const r = evaluateRouteTable(rt, '8.8.8.8');
    assert.equal(r.type, 'igw');
    assert.equal(r.target, 'igw-123');
  });

  it('prefers most specific route (longest prefix)', () => {
    const rt = {
      Routes: [
        { DestinationCidrBlock: '0.0.0.0/0', GatewayId: 'igw-123' },
        { DestinationCidrBlock: '10.0.0.0/16', GatewayId: 'local' }
      ]
    };
    const r = evaluateRouteTable(rt, '10.0.1.5');
    assert.equal(r.type, 'local');
  });

  it('detects NAT gateway route', () => {
    const rt = {
      Routes: [
        { DestinationCidrBlock: '0.0.0.0/0', NatGatewayId: 'nat-abc' },
        { DestinationCidrBlock: '10.0.0.0/16', GatewayId: 'local' }
      ]
    };
    const r = evaluateRouteTable(rt, '8.8.4.4');
    assert.equal(r.type, 'nat');
  });

  it('detects blackhole route', () => {
    const rt = {
      Routes: [
        { DestinationCidrBlock: '10.1.0.0/16', State: 'blackhole', VpcPeeringConnectionId: 'pcx-dead' }
      ]
    };
    const r = evaluateRouteTable(rt, '10.1.0.5');
    assert.equal(r.type, 'blackhole');
  });

  it('detects peering connection route', () => {
    const rt = {
      Routes: [
        { DestinationCidrBlock: '10.1.0.0/16', VpcPeeringConnectionId: 'pcx-123' }
      ]
    };
    const r = evaluateRouteTable(rt, '10.1.0.5');
    assert.equal(r.type, 'pcx');
  });

  it('returns blackhole when no routes match', () => {
    const rt = {
      Routes: [
        { DestinationCidrBlock: '10.0.0.0/16', GatewayId: 'local' }
      ]
    };
    const r = evaluateRouteTable(rt, '172.16.0.1');
    assert.equal(r.type, 'blackhole');
  });
});

describe('evaluateNACL', () => {
  it('returns allow for null NACL', () => {
    const r = evaluateNACL(null, 'inbound', 'tcp', 443, '10.0.0.1/32');
    assert.equal(r.action, 'allow');
  });

  it('matches allow rule by number order', () => {
    const nacl = {
      Entries: [
        { RuleNumber: 100, Egress: false, Protocol: '6', PortRange: { From: 443, To: 443 }, CidrBlock: '0.0.0.0/0', RuleAction: 'allow' },
        { RuleNumber: 200, Egress: false, Protocol: '6', PortRange: { From: 443, To: 443 }, CidrBlock: '0.0.0.0/0', RuleAction: 'deny' }
      ]
    };
    const r = evaluateNACL(nacl, 'inbound', 'tcp', 443, '10.0.0.1/32');
    assert.equal(r.action, 'allow');
    assert.equal(r.ruleNum, 100);
  });

  it('deny rule takes precedence if lower number', () => {
    const nacl = {
      Entries: [
        { RuleNumber: 50, Egress: false, Protocol: '6', PortRange: { From: 22, To: 22 }, CidrBlock: '0.0.0.0/0', RuleAction: 'deny' },
        { RuleNumber: 100, Egress: false, Protocol: '6', PortRange: { From: 22, To: 22 }, CidrBlock: '0.0.0.0/0', RuleAction: 'allow' }
      ]
    };
    const r = evaluateNACL(nacl, 'inbound', 'tcp', 22, '10.0.0.1/32');
    assert.equal(r.action, 'deny');
  });

  it('default deny when no rules match', () => {
    const nacl = {
      Entries: [
        { RuleNumber: 100, Egress: false, Protocol: '6', PortRange: { From: 80, To: 80 }, CidrBlock: '10.0.0.0/24', RuleAction: 'allow' }
      ]
    };
    const r = evaluateNACL(nacl, 'inbound', 'tcp', 443, '172.16.0.1/32');
    assert.equal(r.action, 'deny');
  });

  it('filters by direction (egress vs inbound)', () => {
    const nacl = {
      Entries: [
        { RuleNumber: 100, Egress: true, Protocol: '6', PortRange: { From: 443, To: 443 }, CidrBlock: '0.0.0.0/0', RuleAction: 'allow' }
      ]
    };
    // Inbound should not match egress rule
    const r = evaluateNACL(nacl, 'inbound', 'tcp', 443, '10.0.0.1/32');
    assert.equal(r.action, 'deny');
  });
});

describe('evaluateSG', () => {
  it('deny when no SGs', () => {
    const r = evaluateSG([], 'inbound', 'tcp', 443, '10.0.0.1/32');
    assert.equal(r.action, 'deny');
  });

  it('allow with assumeAllow when no SGs', () => {
    const r = evaluateSG([], 'inbound', 'tcp', 443, '10.0.0.1/32', { assumeAllow: true });
    assert.equal(r.action, 'allow');
  });

  it('matches inbound rule', () => {
    const sgs = [{
      GroupId: 'sg-123', GroupName: 'web',
      IpPermissions: [{ IpProtocol: '6', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '0.0.0.0/0' }], Ipv6Ranges: [], UserIdGroupPairs: [] }],
      IpPermissionsEgress: []
    }];
    const r = evaluateSG(sgs, 'inbound', 'tcp', 443, '10.0.0.1/32');
    assert.equal(r.action, 'allow');
    assert.equal(r.matchedSg, 'sg-123');
  });

  it('deny when port does not match', () => {
    const sgs = [{
      GroupId: 'sg-123', GroupName: 'web',
      IpPermissions: [{ IpProtocol: '6', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '0.0.0.0/0' }], Ipv6Ranges: [], UserIdGroupPairs: [] }],
      IpPermissionsEgress: []
    }];
    const r = evaluateSG(sgs, 'inbound', 'tcp', 22, '10.0.0.1/32');
    assert.equal(r.action, 'deny');
  });

  it('matches SG-to-SG reference', () => {
    const sgs = [{
      GroupId: 'sg-123', GroupName: 'app',
      IpPermissions: [{ IpProtocol: '6', FromPort: 3306, ToPort: 3306, IpRanges: [], Ipv6Ranges: [], UserIdGroupPairs: [{ GroupId: 'sg-web' }] }],
      IpPermissionsEgress: []
    }];
    const r = evaluateSG(sgs, 'inbound', 'tcp', 3306, '10.0.0.1/32', { sourceSgIds: ['sg-web'] });
    assert.equal(r.action, 'allow');
  });

  it('deny SG-to-SG when source SG does not match', () => {
    const sgs = [{
      GroupId: 'sg-123', GroupName: 'app',
      IpPermissions: [{ IpProtocol: '6', FromPort: 3306, ToPort: 3306, IpRanges: [], Ipv6Ranges: [], UserIdGroupPairs: [{ GroupId: 'sg-web' }] }],
      IpPermissionsEgress: []
    }];
    const r = evaluateSG(sgs, 'inbound', 'tcp', 3306, '10.0.0.1/32', { sourceSgIds: ['sg-other'] });
    assert.equal(r.action, 'deny');
  });
});
