// Characterization harness for flow-tracing.js resolveNetworkPosition (HUMIFY Unit 1 / H-FLOW).
//
// Pins the module's security-group resolution BEFORE any move that would kill
// the app-core `_sgById` global-cache drift (audit C4/H-FLOW). The module copy
// resolves SGs from `ctx.sgs`; these tests lock that contract so a future
// unification of the two copies is behaviour-preserving and verifiable.
//
// Behaviour-preserving: this file adds tests only — no source changes.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// flow-tracing.js bridges to window globals at import; stub them.
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };

const { resolveNetworkPosition } = await import('../../src/modules/flow-tracing.js');

// Minimal deterministic ctx: one instance in one subnet, parameterised SG refs.
// resolveNetworkPosition's `instance` branch reads ctx.instBySub (subnetId -> [inst]).
function makeCtx(groupIds) {
  return {
    instBySub: {
      'subnet-a': [{
        InstanceId: 'i-web',
        SubnetId: 'subnet-a',
        VpcId: 'vpc-1',
        PrivateIpAddress: '10.0.0.0',
        SecurityGroups: groupIds.map(g => ({ GroupId: g })),
        Tags: [{ Key: 'Name', Value: 'web-1' }],
      }],
    },
    subnets: [{ SubnetId: 'subnet-a', VpcId: 'vpc-1', CidrBlock: '10.0.0.5/24' }],
    sgs: [
      { GroupId: 'sg-a', GroupName: 'app', VpcId: 'vpc-1' },
      { GroupId: 'sg-b', GroupName: 'db', VpcId: 'vpc-1' },
      { GroupId: 'sg-c', GroupName: 'web', VpcId: 'vpc-1' },
    ],
  };
}

describe('resolveNetworkPosition — SG resolution from ctx.sgs (Unit 1 / H-FLOW)', () => {
  it('resolves all three SGs from ctx.sgs for an instance with 3 groups', () => {
    const ctx = makeCtx(['sg-a', 'sg-b', 'sg-c']);
    const pos = resolveNetworkPosition('instance', 'i-web', ctx);
    assert.ok(pos, 'returns a position');
    assert.equal(pos.subnetId, 'subnet-a');
    assert.equal(pos.vpcId, 'vpc-1');
    assert.equal(pos.ip, '10.0.0.0');
    assert.equal(pos.cidr, '10.0.0.0/32');
    assert.equal(pos.name, 'web-1');
    assert.equal(pos.sgs.length, 3);
    assert.deepEqual(pos.sgs.map(s => s.GroupId).sort(), ['sg-a', 'sg-b', 'sg-c']);
    // Resolved to the FULL sg objects from ctx.sgs (identity), not the {GroupId} stubs.
    assert.equal(pos.sgs.find(s => s.GroupId === 'sg-b'), ctx.sgs.find(s => s.GroupId === 'sg-b'));
    assert.equal(pos.sgs.find(s => s.GroupId === 'sg-b').GroupName, 'db');
  });

  it('returns an empty sgs array for an instance with no SGs', () => {
    const pos = resolveNetworkPosition('instance', 'i-web', makeCtx([]));
    assert.ok(pos);
    assert.deepEqual(pos.sgs, []);
  });

  it('filters out a referenced SG missing from ctx.sgs without crashing', () => {
    const pos = resolveNetworkPosition('instance', 'i-web', makeCtx(['sg-a', 'sg-missing', 'sg-c']));
    assert.ok(pos);
    assert.equal(pos.sgs.length, 2);
    assert.deepEqual(pos.sgs.map(s => s.GroupId).sort(), ['sg-a', 'sg-c']);
  });

  it('returns null for a null ctx', () => {
    assert.equal(resolveNetworkPosition('instance', 'i-web', null), null);
  });

  it('returns null for an unknown instance id', () => {
    assert.equal(resolveNetworkPosition('instance', 'i-nope', makeCtx(['sg-a'])), null);
  });
});
