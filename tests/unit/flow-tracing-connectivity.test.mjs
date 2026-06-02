// Regression tests for two flow-tracing.js connectivity bugs (BUG-HUNT #3, #17).
// These exercise the importable module twin; the live app-core.js inline copies
// carry the identical logic and are patched in lockstep.
//
// #3: cross-VPC TGW reachability used OR — tgwRoute=true if EITHER VPC was
//     attached to ANY transit gateway, so two VPCs on DIFFERENT TGWs (or only
//     one attached) were falsely reported reachable. Correct rule: both VPCs
//     must share the same TransitGatewayId.
// #17: findAlternatePaths skipped only the TARGET ALB, not the SOURCE ALB, so
//      an ALB source could be offered as a "via itself" alternate path.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };

const { traceFlow, findAlternatePaths } = await import('../../src/modules/flow-tracing.js');

// Allow-all SG (every protocol/port from anywhere, both directions).
const openSg = id => ({
  GroupId: id, GroupName: 'open',
  IpPermissions: [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }],
  IpPermissionsEgress: [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }],
});

// Two instances in two VPCs, attachments parameterised by TGW id.
function tgwCtx(srcTgwId, tgtTgwId, includeTgt = true) {
  const att = [{ ResourceId: 'vpc-1', TransitGatewayId: srcTgwId }];
  if (includeTgt) att.push({ ResourceId: 'vpc-2', TransitGatewayId: tgtTgwId });
  return {
    instBySub: {
      'subnet-1': [{ InstanceId: 'i-src', SubnetId: 'subnet-1', VpcId: 'vpc-1', PrivateIpAddress: '10.0.1.10', SecurityGroups: [{ GroupId: 'sg-1' }] }],
      'subnet-2': [{ InstanceId: 'i-tgt', SubnetId: 'subnet-2', VpcId: 'vpc-2', PrivateIpAddress: '10.1.1.10', SecurityGroups: [{ GroupId: 'sg-2' }] }],
    },
    subnets: [
      { SubnetId: 'subnet-1', VpcId: 'vpc-1', CidrBlock: '10.0.1.0/24' },
      { SubnetId: 'subnet-2', VpcId: 'vpc-2', CidrBlock: '10.1.1.0/24' },
    ],
    sgs: [openSg('sg-1'), openSg('sg-2')],
    peerings: [],
    tgwAttachments: att,
  };
}

const CFG = { protocol: 'tcp', port: 443 };
const SRC = { type: 'instance', id: 'i-src' };
const TGT = { type: 'instance', id: 'i-tgt' };

describe('traceFlow cross-VPC TGW — requires both VPCs on the same TGW (#3)', () => {
  it('allows when both VPCs are attached to the SAME transit gateway', () => {
    const r = traceFlow(SRC, TGT, CFG, tgwCtx('tgw-shared', 'tgw-shared'));
    assert.equal(r.blocked, null, 'shared-TGW path should be reachable');
    assert.ok(r.path.some(h => h.type === 'tgw' && h.action === 'allow'), 'emits a tgw allow hop');
  });

  it('blocks when the two VPCs are on DIFFERENT transit gateways', () => {
    const r = traceFlow(SRC, TGT, CFG, tgwCtx('tgw-a', 'tgw-b'));
    assert.ok(r.blocked, 'different TGWs must NOT be reported reachable');
    assert.equal(r.blocked.reason, 'No connectivity between VPCs');
  });

  it('blocks when only the source VPC is TGW-attached', () => {
    const r = traceFlow(SRC, TGT, CFG, tgwCtx('tgw-a', null, false));
    assert.ok(r.blocked, 'single-sided attachment is not connectivity');
    assert.equal(r.blocked.reason, 'No connectivity between VPCs');
  });
});

describe('findAlternatePaths — never routes via the source ALB itself (#17)', () => {
  function albCtx() {
    const albSource = { LoadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:111:loadbalancer/app/src-alb/abc123', LoadBalancerName: 'src-alb', SecurityGroups: ['sg-alb'] };
    const tgtInst = { InstanceId: 'i-tgt', SubnetId: 'subnet-1', VpcId: 'vpc-1', PrivateIpAddress: '10.0.1.20', SecurityGroups: [{ GroupId: 'sg-inst' }] };
    return {
      ctx: {
        albBySub: { 'subnet-1': [albSource] },
        instBySub: { 'subnet-1': [tgtInst] },
        instances: [tgtInst],
        subnets: [{ SubnetId: 'subnet-1', VpcId: 'vpc-1', CidrBlock: '10.0.1.0/24' }],
        sgs: [openSg('sg-alb'), openSg('sg-inst')],
        pubSubs: new Set(['subnet-1']),
      },
      sourceAlbId: 'abc123',
    };
  }

  it('does not return the source ALB as an intermediary hop', () => {
    const { ctx, sourceAlbId } = albCtx();
    const results = findAlternatePaths({ type: 'alb', id: sourceAlbId }, { type: 'instance', id: 'i-tgt' }, CFG, ctx);
    assert.ok(results.every(r => r.via.id !== sourceAlbId), 'source ALB must never be its own alternate path');
  });
});
