// Characterization test for HUMIFY Unit 3 / BUG-HUNT #1: the XLSX Inventory
// sheet must honour the report account filter for ALL resource types, including
// the 7 that previously iterated raw arrays (peerings, zones, wafAcls,
// cfDistributions, vpns, tgwAttachments, tgs). The fix routes them through _af();
// this locks that account-filtering via the extracted pure buildInventoryRows().

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
// Free globals exports-xlsx.js resolves from the window bridge at call time.
globalThis._rptAccountLabel = a => a || '';           // identity => column 0 is the _accountId
globalThis._rptTagName = r => (r && (r.Name || r.GroupName)) || '';

const { buildInventoryRows } = await import('../../src/exports/exports-xlsx.js');

// ctx carrying ONLY the 7 previously-unfiltered types, one item per account.
function ctx() {
  const A = '111111111111', B = '222222222222';
  const two = (mk) => [mk(A), mk(B)];
  return {
    peerings: two(acct => ({ _accountId: acct, VpcPeeringConnectionId: 'pcx-' + acct, RequesterVpcInfo: { VpcId: 'vpc-' + acct, CidrBlock: '10.0.0.0/16' }, AccepterVpcInfo: { CidrBlock: '10.1.0.0/16' }, Status: { Code: 'active' } })),
    zones: two(acct => ({ _accountId: acct, Id: 'z-' + acct, Name: acct + '.example.com', Config: { PrivateZone: false } })),
    wafAcls: two(acct => ({ _accountId: acct, Id: 'w-' + acct, Name: 'waf-' + acct, Rules: [] })),
    cfDistributions: two(acct => ({ _accountId: acct, Id: 'cf-' + acct, DomainName: acct + '.cloudfront.net', Status: 'Deployed' })),
    vpns: two(acct => ({ _accountId: acct, VpnConnectionId: 'vpn-' + acct, Type: 'ipsec.1', State: 'available' })),
    tgwAttachments: two(acct => ({ _accountId: acct, TransitGatewayAttachmentId: 'tgwa-' + acct, ResourceType: 'vpc', State: 'available' })),
    tgs: two(acct => ({ _accountId: acct, TargetGroupName: 'tg-' + acct, Protocol: 'HTTP', Port: 80, TargetType: 'instance' })),
  };
}

const A = '111111111111', B = '222222222222';

describe('buildInventoryRows — account filter applies to all 7 trailing types (#1 / Unit 3)', () => {
  it('includes both accounts when the filter is "all"', () => {
    const rows = buildInventoryRows(ctx(), 'all');
    assert.equal(rows.length, 14, '7 types x 2 accounts');
    assert.ok(rows.some(r => r[0] === A) && rows.some(r => r[0] === B));
  });

  it('drops the other account for every one of the 7 types when a single account is selected', () => {
    const rows = buildInventoryRows(ctx(), A);
    assert.equal(rows.length, 7, 'exactly the 7 type rows for account A');
    assert.ok(rows.every(r => r[0] === A), 'no foreign-account rows leak through');
    // Each of the 7 types is represented exactly once.
    const types = rows.map(r => r[3]).sort();
    assert.deepEqual(types, ['CloudFront', 'Route 53', 'TGW Attachment', 'Target Group', 'VPC Peering', 'VPN', 'WAF']);
  });
});
