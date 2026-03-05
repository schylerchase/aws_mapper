import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  _DIFF_KEYS, _DIFF_VOLATILE, _DIFF_STRUCTURAL,
  normalizeResource, normalizeSG, classifyChange, _fieldDiff, computeDiff
} from '../../src/core/diff-logic.js';

describe('constants', () => {
  it('_DIFF_KEYS has expected resource types', () => {
    assert.ok(_DIFF_KEYS.vpcs);
    assert.ok(_DIFF_KEYS.subnets);
    assert.ok(_DIFF_KEYS.instances);
    assert.ok(_DIFF_KEYS.sgs);
  });
  it('_DIFF_VOLATILE contains LaunchTime', () => {
    assert.ok(_DIFF_VOLATILE.has('LaunchTime'));
  });
  it('_DIFF_STRUCTURAL contains CidrBlock', () => {
    assert.ok(_DIFF_STRUCTURAL.has('CidrBlock'));
  });
});

describe('normalizeResource', () => {
  it('strips volatile fields', () => {
    const r = { VpcId: 'vpc-1', LaunchTime: '2024-01-01', CidrBlock: '10.0.0.0/16' };
    const n = normalizeResource(r);
    assert.equal(n.VpcId, 'vpc-1');
    assert.equal(n.CidrBlock, '10.0.0.0/16');
    assert.equal(n.LaunchTime, undefined);
  });
  it('sorts object keys deterministically', () => {
    const r = { Z: 1, A: 2, M: 3 };
    const n = normalizeResource(r);
    assert.deepEqual(Object.keys(n), ['A', 'M', 'Z']);
  });
  it('sorts arrays', () => {
    const r = { Tags: [{ Key: 'Z' }, { Key: 'A' }] };
    const n = normalizeResource(r);
    assert.equal(JSON.parse(JSON.stringify(n.Tags[0])).Key, 'A');
  });
  it('does not mutate original', () => {
    const r = { VpcId: 'vpc-1', LaunchTime: '2024' };
    normalizeResource(r);
    assert.equal(r.LaunchTime, '2024');
  });
});

describe('normalizeSG', () => {
  it('sorts IpPermissions by port range', () => {
    const sg = {
      GroupId: 'sg-1',
      IpPermissions: [
        { FromPort: 443, ToPort: 443, IpProtocol: '6', IpRanges: [{ CidrIp: '0.0.0.0/0' }] },
        { FromPort: 80, ToPort: 80, IpProtocol: '6', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }
      ]
    };
    const n = normalizeSG(sg);
    assert.ok(n.IpPermissions);
  });
});

describe('classifyChange', () => {
  it('CidrBlock is structural', () => assert.equal(classifyChange('CidrBlock'), 'structural'));
  it('InstanceType is structural', () => assert.equal(classifyChange('InstanceType'), 'structural'));
  it('Tags is metadata', () => assert.equal(classifyChange('Tags'), 'metadata'));
  it('Description is metadata', () => assert.equal(classifyChange('Description'), 'metadata'));
  it('unknown field defaults to structural', () => assert.equal(classifyChange('SomeNewField'), 'structural'));
});

describe('_fieldDiff', () => {
  it('returns empty for identical objects', () => {
    const a = { x: 1, y: 'hello' };
    const b = { x: 1, y: 'hello' };
    assert.deepEqual(_fieldDiff(a, b, ''), []);
  });
  it('detects changed value', () => {
    const a = { InstanceType: 't3.micro' };
    const b = { InstanceType: 't3.large' };
    const d = _fieldDiff(a, b, '');
    assert.equal(d.length, 1);
    assert.equal(d[0].field, 'InstanceType');
    assert.equal(d[0].kind, 'structural');
  });
  it('detects added field', () => {
    const a = { x: 1 };
    const b = { x: 1, Tags: [{ Key: 'Name' }] };
    const d = _fieldDiff(a, b, '');
    assert.equal(d.length, 1);
    assert.equal(d[0].field, 'Tags');
  });
  it('detects removed field', () => {
    const a = { x: 1, y: 2 };
    const b = { x: 1 };
    const d = _fieldDiff(a, b, '');
    assert.equal(d.length, 1);
  });
});

describe('computeDiff', () => {
  it('returns empty results for identical snapshots', () => {
    const snap = {
      vpcs: [{ VpcId: 'vpc-1', CidrBlock: '10.0.0.0/16' }],
      subnets: []
    };
    const r = computeDiff(snap, snap);
    assert.equal(r.total.added, 0);
    assert.equal(r.total.removed, 0);
    assert.equal(r.total.modified, 0);
    assert.equal(r.total.unchanged, 1);
  });

  it('detects added resource', () => {
    const baseline = { vpcs: [], subnets: [] };
    const current = { vpcs: [{ VpcId: 'vpc-new', CidrBlock: '10.0.0.0/16' }], subnets: [] };
    const r = computeDiff(baseline, current);
    assert.equal(r.total.added, 1);
    assert.equal(r.added[0].key, 'vpc-new');
  });

  it('detects removed resource', () => {
    const baseline = { vpcs: [{ VpcId: 'vpc-old', CidrBlock: '10.0.0.0/16' }], subnets: [] };
    const current = { vpcs: [], subnets: [] };
    const r = computeDiff(baseline, current);
    assert.equal(r.total.removed, 1);
    assert.equal(r.removed[0].key, 'vpc-old');
  });

  it('detects modified resource', () => {
    const baseline = { vpcs: [{ VpcId: 'vpc-1', CidrBlock: '10.0.0.0/16' }], subnets: [] };
    const current = { vpcs: [{ VpcId: 'vpc-1', CidrBlock: '10.1.0.0/16' }], subnets: [] };
    const r = computeDiff(baseline, current);
    assert.equal(r.total.modified, 1);
    assert.ok(r.modified[0].hasStructural);
  });

  it('ignores volatile fields in diff', () => {
    const baseline = { vpcs: [{ VpcId: 'vpc-1', CidrBlock: '10.0.0.0/16', LaunchTime: '2024-01-01' }], subnets: [] };
    const current = { vpcs: [{ VpcId: 'vpc-1', CidrBlock: '10.0.0.0/16', LaunchTime: '2025-01-01' }], subnets: [] };
    const r = computeDiff(baseline, current);
    assert.equal(r.total.unchanged, 1);
    assert.equal(r.total.modified, 0);
  });
});
