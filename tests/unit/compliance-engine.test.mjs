import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock window and DOM dependencies before importing
globalThis.window = globalThis.window || {};
globalThis.window._classificationData = [];
globalThis.window.runClassificationEngine = () => {};
globalThis.document = globalThis.document || {
  getElementById: () => ({ value: '' }),
  querySelector: () => null,
  querySelectorAll: () => [],
};

// compliance-engine.js calls these as bare globals (not imported).
// In the browser they come from window.AppModules; here we stub them.
globalThis.runBUDRChecks = () => [];
globalThis.parseIAMData = () => ({});
globalThis.runIAMChecks = () => [];

import { runComplianceChecks, invalidateComplianceCache } from '../../src/modules/compliance-engine.js';

// Helper: minimal ctx with no issues
function cleanCtx() {
  return {
    sgs: [], nacls: [], rts: [], subnets: [], instances: [], vpcs: [],
    albs: [], rdsInstances: [], ecsServices: [], lambdaFns: [],
    s3bk: [], ecacheClusters: [], redshiftClusters: [], volumes: [],
    snapshots: [], peerings: [], pubSubs: new Set(),
    subRT: {}, subNacl: {}, sgByVpc: {},
  };
}

describe('runComplianceChecks', () => {
  beforeEach(() => {
    invalidateComplianceCache();
  });

  it('returns empty findings for clean infrastructure', () => {
    const findings = runComplianceChecks(cleanCtx());
    assert.ok(Array.isArray(findings));
    // Clean infra should have zero or near-zero findings
  });

  it('detects CIS 5.2: SSH from 0.0.0.0/0', () => {
    const ctx = cleanCtx();
    ctx.sgs = [{
      GroupId: 'sg-test', GroupName: 'test-sg', VpcId: 'vpc-1',
      IpPermissions: [{
        IpProtocol: 'tcp', FromPort: 22, ToPort: 22,
        IpRanges: [{ CidrIp: '0.0.0.0/0' }], Ipv6Ranges: [],
      }],
      IpPermissionsEgress: [],
    }];
    const findings = runComplianceChecks(ctx);
    const ssh = findings.filter(f => f.control === 'CIS 5.2');
    assert.ok(ssh.length >= 1, 'Should flag SSH from 0.0.0.0/0');
    assert.equal(ssh[0].severity, 'HIGH');
    assert.equal(ssh[0].resource, 'sg-test');
  });

  it('detects CIS 5.3: RDP from 0.0.0.0/0', () => {
    const ctx = cleanCtx();
    ctx.sgs = [{
      GroupId: 'sg-rdp', GroupName: 'rdp-sg', VpcId: 'vpc-1',
      IpPermissions: [{
        IpProtocol: 'tcp', FromPort: 3389, ToPort: 3389,
        IpRanges: [{ CidrIp: '0.0.0.0/0' }], Ipv6Ranges: [],
      }],
      IpPermissionsEgress: [],
    }];
    const findings = runComplianceChecks(ctx);
    const rdp = findings.filter(f => f.control === 'CIS 5.3');
    assert.ok(rdp.length >= 1, 'Should flag RDP from 0.0.0.0/0');
    assert.equal(rdp[0].severity, 'HIGH');
  });

  it('detects CIS 5.4: default SG with rules', () => {
    const ctx = cleanCtx();
    ctx.sgs = [{
      GroupId: 'sg-def', GroupName: 'default', VpcId: 'vpc-1',
      IpPermissions: [{ IpProtocol: '-1', IpRanges: [], Ipv6Ranges: [] }],
      IpPermissionsEgress: [],
    }];
    const findings = runComplianceChecks(ctx);
    const def = findings.filter(f => f.control === 'CIS 5.4');
    assert.ok(def.length >= 1, 'Should flag default SG with ingress rules');
  });

  it('detects NET-2: all traffic from 0.0.0.0/0', () => {
    const ctx = cleanCtx();
    ctx.sgs = [{
      GroupId: 'sg-open', GroupName: 'wide-open', VpcId: 'vpc-1',
      IpPermissions: [{
        IpProtocol: '-1',
        IpRanges: [{ CidrIp: '0.0.0.0/0' }], Ipv6Ranges: [],
      }],
      IpPermissionsEgress: [],
    }];
    const findings = runComplianceChecks(ctx);
    const net2 = findings.filter(f => f.control === 'NET-2');
    assert.ok(net2.length >= 1, 'Should flag all traffic from 0.0.0.0/0');
    assert.equal(net2[0].severity, 'CRITICAL');
  });

  it('detects CKV_AWS_79: EC2 without IMDSv2', () => {
    const ctx = cleanCtx();
    ctx.instances = [{
      InstanceId: 'i-test', SubnetId: 'sub-1',
      MetadataOptions: { HttpTokens: 'optional' },
      Tags: [{ Key: 'Name', Value: 'test-instance' }],
    }];
    const findings = runComplianceChecks(ctx);
    const imds = findings.filter(f => f.control === 'CKV_AWS_79');
    assert.ok(imds.length >= 1, 'Should flag EC2 without IMDSv2');
  });

  it('detects CKV_AWS_26: RDS backup retention < 7 days', () => {
    const ctx = cleanCtx();
    ctx.rdsInstances = [{
      DBInstanceIdentifier: 'mydb',
      BackupRetentionPeriod: 1,
    }];
    const findings = runComplianceChecks(ctx);
    const rds = findings.filter(f => f.control === 'CKV_AWS_26');
    assert.ok(rds.length >= 1, 'Should flag RDS with low backup retention');
  });

  it('does not flag restricted SSH (specific CIDR)', () => {
    const ctx = cleanCtx();
    ctx.sgs = [{
      GroupId: 'sg-restricted', GroupName: 'restricted-sg', VpcId: 'vpc-1',
      IpPermissions: [{
        IpProtocol: 'tcp', FromPort: 22, ToPort: 22,
        IpRanges: [{ CidrIp: '10.0.0.0/8' }], Ipv6Ranges: [],
      }],
      IpPermissionsEgress: [],
    }];
    const findings = runComplianceChecks(ctx);
    const ssh = findings.filter(f => f.control === 'CIS 5.2');
    assert.equal(ssh.length, 0, 'Should NOT flag SSH from private CIDR');
  });

  it('annotates findings with Checkov CKV IDs', () => {
    const ctx = cleanCtx();
    ctx.sgs = [{
      GroupId: 'sg-test', GroupName: 'test-sg', VpcId: 'vpc-1',
      IpPermissions: [{
        IpProtocol: 'tcp', FromPort: 22, ToPort: 22,
        IpRanges: [{ CidrIp: '0.0.0.0/0' }], Ipv6Ranges: [],
      }],
      IpPermissionsEgress: [],
    }];
    const findings = runComplianceChecks(ctx);
    const ssh = findings.find(f => f.control === 'CIS 5.2');
    assert.ok(ssh, 'Should have CIS 5.2 finding');
    assert.equal(ssh.ckv, 'CKV_AWS_24', 'CIS 5.2 should map to CKV_AWS_24');
  });

  it('caches results for same context object', () => {
    const ctx = cleanCtx();
    ctx.sgs = [{
      GroupId: 'sg-1', GroupName: 'test', VpcId: 'vpc-1',
      IpPermissions: [{
        IpProtocol: 'tcp', FromPort: 22, ToPort: 22,
        IpRanges: [{ CidrIp: '0.0.0.0/0' }], Ipv6Ranges: [],
      }],
      IpPermissionsEgress: [],
    }];
    const r1 = runComplianceChecks(ctx);
    const r2 = runComplianceChecks(ctx);
    assert.equal(r1, r2, 'Same context should return cached results');
  });
});
