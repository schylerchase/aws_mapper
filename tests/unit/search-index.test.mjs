// Characterization tests for the search index/match helpers extracted from
// app-core.js (Humify decomposition slice). Every assertion pins current behavior.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchIndex, matchSearchIndex } from '../../src/modules/search-index.js';

const ctx = () => ({
  vpcs: [{ VpcId: 'vpc-1', CidrBlock: '10.0.0.0/16', Tags: [{ Key: 'Name', Value: 'Prod' }] }],
  subnets: [{ SubnetId: 'subnet-1', CidrBlock: '10.0.1.0/24', AvailabilityZone: 'us-east-1a' }],
  instances: [{ InstanceId: 'i-1', InstanceType: 't3.micro', Tags: [{ Key: 'Name', Value: 'Web' }] }],
  sgs: [{ GroupId: 'sg-1', GroupName: 'web-sg', VpcId: 'vpc-1' }],
  rdsInstances: [{ DBInstanceIdentifier: 'db-1', Engine: 'postgres' }],
  lambdaFns: [{ FunctionName: 'fn-1' }],
});

describe('buildSearchIndex', () => {
  const idx = buildSearchIndex(ctx());
  it('indexes each resource type', () => {
    const types = idx.map(e => e.type);
    for (const t of ['VPC', 'Subnet', 'EC2', 'SG', 'RDS', 'Lambda']) assert.ok(types.includes(t), `missing ${t}`);
  });
  it('uses the Name tag when present, falls back to id / GroupName', () => {
    assert.equal(idx.find(e => e.type === 'VPC').name, 'Prod');        // Name tag
    assert.equal(idx.find(e => e.type === 'Subnet').name, 'subnet-1'); // no Name tag -> id
    assert.equal(idx.find(e => e.type === 'EC2').name, 'Web');
    assert.equal(idx.find(e => e.type === 'SG').name, 'web-sg');       // GroupName
  });
  it('builds a lowercase searchStr including id and cidr', () => {
    const vpc = idx.find(e => e.type === 'VPC');
    assert.equal(vpc.id, 'vpc-1');
    assert.ok(vpc.searchStr.includes('prod') && vpc.searchStr.includes('vpc-1') && vpc.searchStr.includes('10.0.0.0/16'));
    assert.equal(vpc.searchStr, vpc.searchStr.toLowerCase());
  });
  it('returns [] for an empty context', () => {
    assert.deepEqual(buildSearchIndex({}), []);
  });
});

describe('matchSearchIndex', () => {
  const idx = buildSearchIndex(ctx());
  it('returns entries whose searchStr includes the (pre-lowercased) query', () => {
    assert.equal(matchSearchIndex(idx, 'prod', 30).length, 1);
    assert.equal(matchSearchIndex(idx, 'sg-1', 30).length, 1);
    assert.equal(matchSearchIndex(idx, 'zzz-none', 30).length, 0);
  });
  it('caps results at the limit', () => {
    const many = buildSearchIndex({ vpcs: Array.from({ length: 10 }, (_, i) => ({ VpcId: 'vpc-' + i, CidrBlock: '10.0.0.0/16' })) });
    assert.equal(matchSearchIndex(many, 'vpc', 3).length, 3);
  });
});
