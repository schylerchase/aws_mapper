// Characterization + fix tests for CloudFormation security-group rule emission
// (Humify plan units C2 -> F3).
//
// A single IpPermission can carry multiple IpRanges, Ipv6Ranges, and
// UserIdGroupPairs. CloudFormation inline/standalone SG rules take ONE source
// each, so each source must become its own rule. The live emitters
// `_cfnSGRule`/`_cfnSGRuleProps` previously kept only `cidrs[0]`/`sgRefs[0]` and
// ignored IPv6 entirely, silently dropping rules; the correct expansion already
// existed in `_ckExpandRules`. These tests pin the complete fan-out.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// exports-iac.js siblings touch window/document at import; stub them.
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };

const { _cfnSGRule, _cfnSGRuleProps, generateCloudFormation } = await import('../../src/exports/exports-iac.js');

// One permission carrying every kind of source (2 CIDR, 1 IPv6, 2 SG refs).
const multiSourceRule = () => ({
  IpProtocol: 'tcp', FromPort: 443, ToPort: 443,
  IpRanges: [{ CidrIp: '203.0.113.10/32', Description: 'a' }, { CidrIp: '198.51.100.0/24' }],
  Ipv6Ranges: [{ CidrIpv6: '2001:db8::/32' }],
  UserIdGroupPairs: [{ GroupId: 'sg-aaa' }, { GroupId: 'sg-bbb' }],
});

describe('_cfnSGRule — fans out every source into its own inline rule', () => {
  it('emits one rule per CIDR, IPv6 range, and SG ref (5 total)', () => {
    const rules = _cfnSGRule(multiSourceRule());
    assert.ok(Array.isArray(rules), 'returns an array of rules');
    assert.equal(rules.length, 5);
    assert.deepEqual(rules.filter(r => r.CidrIp).map(r => r.CidrIp).sort(), ['198.51.100.0/24', '203.0.113.10/32']);
    assert.deepEqual(rules.filter(r => r.CidrIpv6).map(r => r.CidrIpv6), ['2001:db8::/32']);
    assert.deepEqual(rules.filter(r => r.SourceSecurityGroupId).map(r => r.SourceSecurityGroupId).sort(), ['sg-aaa', 'sg-bbb']);
    rules.forEach(r => { assert.equal(r.IpProtocol, 'tcp'); assert.equal(r.FromPort, 443); assert.equal(r.ToPort, 443); });
  });

  it('emits a single protocol/port rule when there is no source (e.g. allow-all egress)', () => {
    const rules = _cfnSGRule({ IpProtocol: '-1' });
    assert.deepEqual(rules, [{ IpProtocol: '-1' }]);
  });
});

describe('_cfnSGRuleProps — fans out every source for standalone (cyclic) rules', () => {
  it('emits one prop set per source, without IpProtocol (added by caller)', () => {
    const props = _cfnSGRuleProps(multiSourceRule());
    assert.ok(Array.isArray(props));
    assert.equal(props.length, 5);
    props.forEach(p => assert.equal(p.IpProtocol, undefined));
    assert.equal(props.filter(p => p.CidrIp).length, 2);
    assert.equal(props.filter(p => p.CidrIpv6).length, 1);
    assert.equal(props.filter(p => p.SourceSecurityGroupId).length, 2);
  });
});

describe('generateCloudFormation — security group keeps all ingress sources', () => {
  it('does not drop multiple CIDRs / IPv6 / multiple SG refs', () => {
    const ctx = {
      vpcs: [{ VpcId: 'vpc-1', CidrBlock: '10.0.0.0/16', Tags: [{ Key: 'Name', Value: 'V' }] }],
      sgs: [{
        GroupId: 'sg-app', VpcId: 'vpc-1', Description: 'app',
        Tags: [{ Key: 'Name', Value: 'App' }],
        IpPermissions: [multiSourceRule()], IpPermissionsEgress: [],
      }],
    };
    const { code } = generateCloudFormation(ctx, { format: 'json' });
    const tpl = JSON.parse(code);
    const sg = Object.values(tpl.Resources).find(r => r.Type === 'AWS::EC2::SecurityGroup');
    const ingress = sg.Properties.SecurityGroupIngress;
    assert.equal(ingress.length, 5, 'all five sources are emitted');
    assert.deepEqual(ingress.filter(x => x.CidrIp).map(x => x.CidrIp).sort(), ['198.51.100.0/24', '203.0.113.10/32']);
    assert.deepEqual(ingress.filter(x => x.CidrIpv6).map(x => x.CidrIpv6), ['2001:db8::/32']);
    assert.deepEqual(ingress.filter(x => x.SourceSecurityGroupId).map(x => x.SourceSecurityGroupId).sort(), ['sg-aaa', 'sg-bbb']);
  });
});
