// Characterization tests for the firewall validators extracted from app-core.js
// (Humify decomposition slice). Every assertion pins current behavior.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _fwRuleMatch, _fwValidateCidr, _fwValidateNaclRule, _fwValidateSgRule, _fwValidateRoute } from '../../src/modules/firewall-validate.js';

describe('_fwValidateCidr', () => {
  it('accepts valid IPv4 CIDRs, rejects malformed / out-of-range', () => {
    assert.equal(_fwValidateCidr('10.0.0.0/16'), true);
    assert.equal(_fwValidateCidr('0.0.0.0/0'), true);
    assert.equal(_fwValidateCidr('256.0.0.0/8'), false); // octet > 255
    assert.equal(_fwValidateCidr('10.0.0.0/33'), false); // prefix > 32
    assert.equal(_fwValidateCidr('10.0.0.0'), false);    // no prefix
    assert.equal(_fwValidateCidr(''), false);
    assert.equal(_fwValidateCidr(null), false);
  });
});

describe('_fwRuleMatch', () => {
  const base = { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '10.0.0.0/16' }], UserIdGroupPairs: [] };
  it('matches identical rules regardless of CIDR/group order', () => {
    assert.equal(_fwRuleMatch(base, { ...base, IpRanges: [{ CidrIp: '10.0.0.0/16' }] }), true);
    const a = { ...base, IpRanges: [{ CidrIp: 'a' }, { CidrIp: 'b' }] };
    const b = { ...base, IpRanges: [{ CidrIp: 'b' }, { CidrIp: 'a' }] };
    assert.equal(_fwRuleMatch(a, b), true);
  });
  it('differs on protocol/port/source', () => {
    assert.equal(_fwRuleMatch(base, { ...base, ToPort: 80 }), false);
    assert.equal(_fwRuleMatch(base, { ...base, IpProtocol: 'udp' }), false);
    assert.equal(_fwRuleMatch(null, base), false);
  });
});

describe('_fwValidateSgRule', () => {
  it('passes a valid tcp rule with a CIDR source', () => {
    assert.deepEqual(_fwValidateSgRule({ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '10.0.0.0/16' }] }), []);
  });
  it('flags invalid protocol, bad ports, missing source, bad CIDR', () => {
    assert.ok(_fwValidateSgRule({ IpProtocol: 'foo' }).some(e => e.includes('Invalid protocol')));
    assert.ok(_fwValidateSgRule({ IpProtocol: 'tcp', FromPort: 500, ToPort: 100, IpRanges: [{ CidrIp: '10.0.0.0/16' }] }).some(e => e.includes('<= ToPort')));
    assert.ok(_fwValidateSgRule({ IpProtocol: '-1' }).some(e => e.includes('At least one source')));
    assert.ok(_fwValidateSgRule({ IpProtocol: '-1', IpRanges: [{ CidrIp: 'bad' }] }).some(e => e.includes('Invalid CIDR')));
  });
});

describe('_fwValidateNaclRule', () => {
  it('passes a valid entry; flags bad rule number, duplicate, bad ports', () => {
    assert.deepEqual(_fwValidateNaclRule({ RuleNumber: 100, CidrBlock: '10.0.0.0/16', Protocol: '-1' }, [], 'ingress'), []);
    assert.ok(_fwValidateNaclRule({ RuleNumber: 99999, CidrBlock: '10.0.0.0/16', Protocol: '-1' }, [], 'ingress').some(e => e.includes('1-32766')));
    const dup = _fwValidateNaclRule({ RuleNumber: 100, CidrBlock: '10.0.0.0/16', Protocol: '-1' }, [{ RuleNumber: 100, Egress: false }], 'ingress');
    assert.ok(dup.some(e => e.includes('Duplicate rule number')));
    assert.ok(_fwValidateNaclRule({ RuleNumber: 100, CidrBlock: '10.0.0.0/16', Protocol: '6', PortRange: { From: 80, To: 20 } }, [], 'ingress').some(e => e.includes('<= To port')));
  });
});

describe('_fwValidateRoute', () => {
  it('passes a valid route; flags bad CIDR, duplicate, missing target', () => {
    assert.deepEqual(_fwValidateRoute({ DestinationCidrBlock: '0.0.0.0/0', GatewayId: 'igw-1' }, []), []);
    assert.ok(_fwValidateRoute({ DestinationCidrBlock: 'bad', GatewayId: 'igw-1' }, []).some(e => e.includes('Invalid destination CIDR')));
    assert.ok(_fwValidateRoute({ DestinationCidrBlock: '0.0.0.0/0' }, []).some(e => e.includes('Route target required')));
    const dup = _fwValidateRoute({ DestinationCidrBlock: '0.0.0.0/0', GatewayId: 'igw-1' }, [{ DestinationCidrBlock: '0.0.0.0/0' }]);
    assert.ok(dup.some(e => e.includes('Duplicate destination CIDR')));
  });
});
