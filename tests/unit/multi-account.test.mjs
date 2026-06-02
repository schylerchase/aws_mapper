import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// multi-account.js imports from utils.js and state.js
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };

const {
  detectRegionFromCtx, buildRlCtxFromData, mergeContexts
} = await import('../../src/modules/multi-account.js');

describe('mergeContexts _multiAccount derivation', () => {
  const mkCtx = (accountId, region) => ({
    visible: true,
    accountId,
    accountLabel: accountId,
    _isRegion: true,
    region,
    rlCtx: { vpcs: [], _accounts: new Set([accountId]), _regions: new Set([region]) }
  });

  it('single account across multiple regions is NOT multi-account', () => {
    // Regression: mergeContexts hardcoded _multiAccount:true and never recomputed it,
    // so single-account multi-region merges falsely rendered multi-account UI.
    const merged = mergeContexts([
      mkCtx('111111111111', 'us-east-1'),
      mkCtx('111111111111', 'us-west-2')
    ]);
    assert.equal(merged._multiAccount, false, 'one account across two regions => not multi-account');
    assert.equal(merged._multiRegion, true, 'two regions => multi-region');
  });

  it('distinct accounts ARE multi-account', () => {
    const merged = mergeContexts([
      mkCtx('111111111111', 'us-east-1'),
      mkCtx('222222222222', 'us-east-1')
    ]);
    assert.equal(merged._multiAccount, true);
    assert.equal(merged._multiRegion, false);
  });
});

describe('detectRegionFromCtx', () => {
  it('detects region from subnet AvailabilityZone', () => {
    const ctx = { subnets: [{ AvailabilityZone: 'us-east-1a' }] };
    assert.equal(detectRegionFromCtx(ctx), 'us-east-1');
  });

  it('detects region with multi-char AZ suffix', () => {
    const ctx = { subnets: [{ AvailabilityZone: 'eu-west-2b' }] };
    assert.equal(detectRegionFromCtx(ctx), 'eu-west-2');
  });

  it('returns unknown for null context', () => {
    assert.equal(detectRegionFromCtx(null), 'unknown');
  });

  it('returns unknown for empty subnets', () => {
    assert.equal(detectRegionFromCtx({ subnets: [] }), 'unknown');
  });

  it('returns unknown when subnet has no AZ', () => {
    assert.equal(detectRegionFromCtx({ subnets: [{}] }), 'unknown');
  });
});

describe('buildRlCtxFromData', () => {
  it('returns empty context when no VPCs provided', () => {
    const result = buildRlCtxFromData({}, 'test');
    assert.ok(result);
    assert.equal(result.vpcs.length, 0);
    assert.equal(result.subnets.length, 0);
  });

  it('builds context from VPC JSON string', () => {
    const textareas = {
      in_vpcs: JSON.stringify({ Vpcs: [{ VpcId: 'vpc-123', CidrBlock: '10.0.0.0/16', Tags: [{ Key: 'Name', Value: 'main' }] }] }),
      in_subnets: JSON.stringify({ Subnets: [{ SubnetId: 'sub-1', VpcId: 'vpc-123', CidrBlock: '10.0.1.0/24', AvailabilityZone: 'us-east-1a' }] })
    };
    const result = buildRlCtxFromData(textareas, 'myaccount');
    assert.ok(result);
    assert.equal(result.vpcs.length, 1);
    assert.equal(result.vpcs[0].VpcId, 'vpc-123');
    assert.equal(result.subnets.length, 1);
  });

  it('builds context from pre-parsed objects', () => {
    const textareas = {
      in_vpcs: { Vpcs: [{ VpcId: 'vpc-456', CidrBlock: '172.16.0.0/16', Tags: [] }] }
    };
    const result = buildRlCtxFromData(textareas, '');
    assert.ok(result);
    assert.equal(result.vpcs.length, 1);
    assert.equal(result.vpcs[0].VpcId, 'vpc-456');
  });

  it('preserves account label in context', () => {
    const textareas = {
      in_vpcs: { Vpcs: [{ VpcId: 'vpc-1', CidrBlock: '10.0.0.0/16', Tags: [] }] }
    };
    const result = buildRlCtxFromData(textareas, 'prod-account');
    assert.ok(result);
    // account info is stored in _accounts Set
    assert.ok(result._accounts);
  });

  it('builds instBySub index', () => {
    const textareas = {
      in_vpcs: { Vpcs: [{ VpcId: 'vpc-1', CidrBlock: '10.0.0.0/16', Tags: [] }] },
      in_subnets: { Subnets: [{ SubnetId: 'sub-1', VpcId: 'vpc-1', CidrBlock: '10.0.1.0/24' }] },
      in_ec2: { Reservations: [{ Instances: [{ InstanceId: 'i-1', SubnetId: 'sub-1', Tags: [] }] }] }
    };
    const result = buildRlCtxFromData(textareas, '');
    assert.ok(result);
    assert.ok(result.instBySub);
    assert.ok(result.instBySub['sub-1']);
    assert.equal(result.instBySub['sub-1'].length, 1);
  });
});
