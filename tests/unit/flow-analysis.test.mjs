import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// flow-analysis.js bridges to window globals for tracing
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };

// Mock trace functions — return blocked by default
globalThis._traceInternetToResource = () => ({ blocked: true, path: [] });
globalThis._traceResourceToInternet = () => ({ blocked: true, path: [] });
globalThis._traceFlowLeg = () => ({ blocked: true, path: [] });

const {
  detectBastions, classifyAllResources, findBastionChains,
  discoverTrafficFlows, findIngressPaths, findEgressPaths
} = await import('../../src/modules/flow-analysis.js');

describe('detectBastions', () => {
  it('detects instance with bastion in name', () => {
    const ctx = {
      instances: [{ InstanceId: 'i-bast', SubnetId: 'sub-1', Tags: [{ Key: 'Name', Value: 'bastion-host' }], SecurityGroups: [] }],
      subnets: [{ SubnetId: 'sub-1', VpcId: 'vpc-1' }],
      pubSubs: new Set(['sub-1']),
      sgs: []
    };
    const result = detectBastions(ctx);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'i-bast');
    assert.equal(result[0].name, 'bastion-host');
  });

  it('detects instance with jump in name', () => {
    const ctx = {
      instances: [{ InstanceId: 'i-jump', SubnetId: 'sub-1', Tags: [{ Key: 'Name', Value: 'jump-box' }], SecurityGroups: [] }],
      subnets: [{ SubnetId: 'sub-1', VpcId: 'vpc-1' }],
      pubSubs: new Set(['sub-1']),
      sgs: []
    };
    const result = detectBastions(ctx);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'i-jump');
  });

  it('skips instances in private subnets', () => {
    const ctx = {
      instances: [{ InstanceId: 'i-bast', SubnetId: 'sub-priv', Tags: [{ Key: 'Name', Value: 'bastion' }], SecurityGroups: [] }],
      subnets: [{ SubnetId: 'sub-priv', VpcId: 'vpc-1' }],
      pubSubs: new Set([]),
      sgs: []
    };
    const result = detectBastions(ctx);
    assert.equal(result.length, 0);
  });

  it('detects bastion by SSH port in SG rules', () => {
    const ctx = {
      instances: [{ InstanceId: 'i-ssh', SubnetId: 'sub-1', Tags: [{ Key: 'Name', Value: 'webserver' }],
        SecurityGroups: [{ GroupId: 'sg-1' }] }],
      subnets: [{ SubnetId: 'sub-1', VpcId: 'vpc-1' }],
      pubSubs: new Set(['sub-1']),
      sgs: [{ GroupId: 'sg-1', IpPermissions: [{ FromPort: 22, ToPort: 22 }] }]
    };
    const result = detectBastions(ctx);
    assert.equal(result.length, 1);
  });

  it('returns empty for empty infrastructure', () => {
    const ctx = { instances: [], subnets: [], pubSubs: new Set(), sgs: [] };
    const result = detectBastions(ctx);
    assert.equal(result.length, 0);
  });
});

describe('classifyAllResources', () => {
  it('classifies internet-facing instance', () => {
    const ctx = {
      instances: [{ InstanceId: 'i-web', Tags: [{ Key: 'Name', Value: 'web' }] }],
      rdsInstances: [], ecsServices: [], lambdaFns: []
    };
    const ingressPaths = [{ to: { type: 'instance', id: 'i-web' } }];
    const bastionChains = [];
    const tiers = classifyAllResources(ctx, ingressPaths, bastionChains);
    assert.equal(tiers.internetFacing.length, 1);
    assert.equal(tiers.internetFacing[0].id, 'i-web');
    assert.equal(tiers.fullyPrivate.length, 0);
  });

  it('classifies bastion-only instance', () => {
    const ctx = {
      instances: [{ InstanceId: 'i-priv', Tags: [{ Key: 'Name', Value: 'app' }] }],
      rdsInstances: [], ecsServices: [], lambdaFns: []
    };
    const ingressPaths = [];
    const bastionChains = [{ bastion: {}, targets: [{ type: 'instance', id: 'i-priv' }] }];
    const tiers = classifyAllResources(ctx, ingressPaths, bastionChains);
    assert.equal(tiers.bastionOnly.length, 1);
    assert.equal(tiers.bastionOnly[0].id, 'i-priv');
  });

  it('classifies fully private instance', () => {
    const ctx = {
      instances: [{ InstanceId: 'i-iso', Tags: [{ Key: 'Name', Value: 'isolated' }] }],
      rdsInstances: [], ecsServices: [], lambdaFns: []
    };
    const tiers = classifyAllResources(ctx, [], []);
    assert.equal(tiers.fullyPrivate.length, 1);
    assert.equal(tiers.fullyPrivate[0].id, 'i-iso');
  });

  it('classifies RDS in database tier', () => {
    const ctx = {
      instances: [],
      rdsInstances: [{ DBInstanceIdentifier: 'mydb' }],
      ecsServices: [], lambdaFns: []
    };
    const tiers = classifyAllResources(ctx, [], []);
    assert.equal(tiers.database.length, 1);
    assert.equal(tiers.database[0].id, 'mydb');
  });

  it('handles empty infrastructure', () => {
    const ctx = { instances: [], rdsInstances: [], ecsServices: [], lambdaFns: [] };
    const tiers = classifyAllResources(ctx, [], []);
    assert.equal(tiers.internetFacing.length, 0);
    assert.equal(tiers.bastionOnly.length, 0);
    assert.equal(tiers.fullyPrivate.length, 0);
    assert.equal(tiers.database.length, 0);
  });
});

describe('discoverTrafficFlows', () => {
  it('returns null for null context', () => {
    assert.equal(discoverTrafficFlows(null), null);
  });

  it('returns structure with expected keys for empty infra', () => {
    const ctx = {
      instances: [], subnets: [], igws: [], nats: [], nacls: [],
      pubSubs: new Set(), instBySub: {}, rdsInstances: [],
      ecsServices: [], lambdaFns: [], sgs: [], rdsBySub: {}
    };
    const result = discoverTrafficFlows(ctx);
    assert.ok(result);
    assert.ok(Array.isArray(result.ingressPaths));
    assert.ok(Array.isArray(result.egressPaths));
    assert.ok(result.accessTiers);
    assert.ok(Array.isArray(result.bastionChains));
    assert.ok(Array.isArray(result.bastions));
  });
});

describe('findIngressPaths', () => {
  it('returns empty for infra with no IGWs', () => {
    const ctx = { igws: [], subnets: [], pubSubs: new Set(), instBySub: {} };
    const paths = findIngressPaths(ctx);
    assert.equal(paths.length, 0);
  });
});

describe('findEgressPaths', () => {
  it('returns empty for infra with no NATs', () => {
    const ctx = {
      nats: [], subnets: [], pubSubs: new Set(),
      instBySub: {}, rdsInstances: [], rdsBySub: {}
    };
    const paths = findEgressPaths(ctx);
    assert.equal(paths.length, 0);
  });
});
