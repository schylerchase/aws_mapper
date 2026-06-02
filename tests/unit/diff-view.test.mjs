// Characterization tests for the diff-view pipeline extracted from app-core.js
// (Humify decomposition slice). Every assertion pins current behavior.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDiffVal, fmtDiffValFull, diffTypeLabel, buildDiffFlatRows, filterSortDiffRows } from '../../src/modules/diff-view.js';

describe('fmtDiffVal — compact value formatting', () => {
  it('formats primitives', () => {
    assert.equal(fmtDiffVal(undefined), '∅');
    assert.equal(fmtDiffVal(null), 'null');
    assert.equal(fmtDiffVal(true), 'true');
    assert.equal(fmtDiffVal(false), 'false');
    assert.equal(fmtDiffVal(42), '42');
    assert.equal(fmtDiffVal('short'), 'short');
  });
  it('truncates strings longer than 40 chars to 37 + ellipsis', () => {
    assert.equal(fmtDiffVal('x'.repeat(50)), 'x'.repeat(37) + '...');
    assert.equal(fmtDiffVal('x'.repeat(40)), 'x'.repeat(40));
  });
  it('formats arrays: empty, short JSON, and count when long', () => {
    assert.equal(fmtDiffVal([]), '[]');
    assert.equal(fmtDiffVal([1, 2]), '[1,2]');
    assert.equal(fmtDiffVal(Array(30).fill(0)), '[30 items]');
  });
  it('formats objects: short JSON, {...} when long', () => {
    assert.equal(fmtDiffVal({ a: 1 }), '{"a":1}');
    assert.equal(fmtDiffVal({ long: 'x'.repeat(60) }), '{...}');
  });
});

describe('fmtDiffValFull — full value formatting (no truncation)', () => {
  it('returns full strings and pretty JSON', () => {
    assert.equal(fmtDiffValFull(undefined), '∅');
    assert.equal(fmtDiffValFull(null), 'null');
    assert.equal(fmtDiffValFull('x'.repeat(50)), 'x'.repeat(50));
    assert.equal(fmtDiffValFull([1, 2]), JSON.stringify([1, 2], null, 1));
    assert.equal(fmtDiffValFull({ a: 1 }), JSON.stringify({ a: 1 }, null, 1));
  });
});

describe('diffTypeLabel — resource type to label', () => {
  it('maps known types and passes through unknown', () => {
    assert.equal(diffTypeLabel('vpcs'), 'VPC');
    assert.equal(diffTypeLabel('sgs'), 'Security Group');
    assert.equal(diffTypeLabel('rdsInstances'), 'RDS Instance');
    assert.equal(diffTypeLabel('somethingNew'), 'somethingNew');
  });
});

const sampleDiff = () => ({
  added: [{ type: 'vpcs', key: 'vpc-1', name: 'Prod', resource: { VpcId: 'vpc-1' } }],
  removed: [{ type: 'sgs', key: 'sg-9', name: 'OldSG', resource: { GroupId: 'sg-9' } }],
  modified: [{ type: 'subnets', key: 'subnet-1', name: 'Web', fields: [{ field: 'CidrBlock', kind: 'structural' }], hasStructural: true, resource: {}, baseline: {} }],
  unchanged: [{ type: 'igws', key: 'igw-1', name: 'IGW' }],
});

describe('buildDiffFlatRows — flatten computeDiff output', () => {
  it('returns [] for null', () => {
    assert.deepEqual(buildDiffFlatRows(null, () => ({ id: '', name: '' })), []);
  });
  it('maps each category with the resolveVpc callback', () => {
    const rows = buildDiffFlatRows(sampleDiff(), () => ({ id: 'vpc-1', name: 'ProdVPC' }));
    assert.equal(rows.length, 4);
    const added = rows.find(r => r.category === 'added');
    assert.equal(added.type, 'vpcs');
    assert.equal(added.vpcName, 'ProdVPC');
    assert.deepEqual(added.fields, []);
    assert.equal(added.baseline, null);
    const modified = rows.find(r => r.category === 'modified');
    assert.equal(modified.hasStructural, true);
    assert.equal(modified.fields.length, 1);
    const removed = rows.find(r => r.category === 'removed');
    assert.equal(removed.resource, null);
    assert.ok(removed.baseline);
  });
});

const baseState = (over = {}) => Object.assign(
  { catFilter: 'all', typeFilter: 'all', vpcFilter: 'all', kindFilter: 'all', search: '', sort: 'none', sortDir: 'asc' },
  over,
);

describe('filterSortDiffRows — filter/search/sort pipeline', () => {
  const rows = buildDiffFlatRows(sampleDiff(), () => ({ id: 'vpc-1', name: 'ProdVPC' }));

  it('returns [] for null rows', () => {
    assert.deepEqual(filterSortDiffRows(null, baseState()), []);
  });
  it('passes all rows through with default state', () => {
    assert.equal(filterSortDiffRows(rows, baseState()).length, 4);
  });
  it('filters by category', () => {
    const r = filterSortDiffRows(rows, baseState({ catFilter: 'modified' }));
    assert.equal(r.length, 1);
    assert.equal(r[0].category, 'modified');
  });
  it('filters by type and by kind (modified-only structural)', () => {
    assert.equal(filterSortDiffRows(rows, baseState({ typeFilter: 'vpcs' })).length, 1);
    const k = filterSortDiffRows(rows, baseState({ kindFilter: 'structural' }));
    assert.equal(k.length, 1);
    assert.equal(k[0].type, 'subnets');
  });
  it('searches across name/key/type/vpcName/fields', () => {
    assert.equal(filterSortDiffRows(rows, baseState({ search: 'cidrblock' })).length, 1); // modified row's field
    assert.equal(filterSortDiffRows(rows, baseState({ search: 'oldsg' })).length, 1);     // removed row's name
    assert.equal(filterSortDiffRows(rows, baseState({ search: 'prod' })).length, 4);      // every row's vpcName is 'ProdVPC'
    assert.equal(filterSortDiffRows(rows, baseState({ search: 'zzz-none' })).length, 0);
  });
  it('sorts by status order, respecting sortDir (pins the `||9` quirk: added=0 sorts last)', () => {
    // _CAT_ORDER.added===0, and `0 || 9` evaluates to 9, so 'added' sorts LAST.
    // Pinned as current behavior — NOT changed in this behavior-preserving extraction.
    const asc = filterSortDiffRows(rows, baseState({ sort: 'status', sortDir: 'asc' })).map(r => r.category);
    assert.deepEqual(asc, ['removed', 'modified', 'unchanged', 'added']);
    const desc = filterSortDiffRows(rows, baseState({ sort: 'status', sortDir: 'desc' })).map(r => r.category);
    assert.deepEqual(desc, ['added', 'unchanged', 'modified', 'removed']);
  });
});
