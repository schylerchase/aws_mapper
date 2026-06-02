// Characterization tests for the firewall CLI generators extracted from
// app-core.js (Humify decomposition slice). Pins current behavior, including
// the H002 single-CIDR limitation (to be fixed in a later defect slice).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { genFirewallCli } from '../../src/modules/firewall-cli.js';

describe('genFirewallCli', () => {
  it('returns [] for empty/undefined edits', () => {
    assert.deepEqual(genFirewallCli([]), []);
    assert.deepEqual(genFirewallCli(undefined), []);
  });

  it('builds a NACL create-entry command', () => {
    const cmd = genFirewallCli([{ type: 'nacl', resourceId: 'acl-1', direction: 'ingress', action: 'add',
      rule: { RuleNumber: 100, Protocol: '6', CidrBlock: '10.0.0.0/16', PortRange: { From: 80, To: 80 }, RuleAction: 'allow' } }])[0];
    assert.ok(cmd.startsWith('aws ec2 create-network-acl-entry --network-acl-id acl-1'));
    assert.ok(cmd.includes('--rule-number 100') && cmd.includes('--ingress') && cmd.includes('--cidr-block 10.0.0.0/16'));
    assert.ok(cmd.includes('--port-range From=80,To=80') && cmd.includes('--rule-action allow'));
  });

  it('builds an SG authorize command (single port collapses)', () => {
    const cmd = genFirewallCli([{ type: 'sg', resourceId: 'sg-1', direction: 'ingress', action: 'add',
      rule: { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '10.0.0.0/16' }] } }])[0];
    assert.ok(cmd.startsWith('aws ec2 authorize-security-group-ingress --group-id sg-1'));
    assert.ok(cmd.includes('--protocol tcp') && cmd.includes('--port 443') && cmd.includes('--cidr 10.0.0.0/16'));
    assert.ok(!cmd.includes('443-443'));
  });

  it('pins H002: SG rule with multiple CIDRs emits only the first', () => {
    const cmd = genFirewallCli([{ type: 'sg', resourceId: 'sg-1', direction: 'ingress', action: 'add',
      rule: { IpProtocol: 'tcp', FromPort: 80, ToPort: 80, IpRanges: [{ CidrIp: '10.1.0.0/16' }, { CidrIp: '10.2.0.0/16' }] } }])[0];
    assert.ok(cmd.includes('--cidr 10.1.0.0/16'));
    assert.ok(!cmd.includes('10.2.0.0/16')); // dropped (H002)
  });

  it('builds a route create command and an SG revoke on delete', () => {
    const route = genFirewallCli([{ type: 'route', resourceId: 'rtb-1', action: 'add',
      rule: { DestinationCidrBlock: '0.0.0.0/0', GatewayId: 'igw-1' } }])[0];
    assert.ok(route.startsWith('aws ec2 create-route --route-table-id rtb-1'));
    assert.ok(route.includes('--destination-cidr-block 0.0.0.0/0') && route.includes('--gateway-id igw-1'));
    const del = genFirewallCli([{ type: 'sg', resourceId: 'sg-1', direction: 'egress', action: 'delete',
      rule: { IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] } }])[0];
    assert.ok(del.startsWith('aws ec2 revoke-security-group-egress'));
  });
});
