import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mock window globals before importing
globalThis.window = globalThis.window || {};
globalThis.window._classificationData = [];
globalThis.window.runClassificationEngine = () => {};

import {
  _BUDR_STRATEGY, _BUDR_RTO_RPO, _BUDR_EST_MINUTES, _TIER_TARGETS,
  runBUDRChecks, _budrTierCompliance, _fmtMin,
  _getBUDRTierCounts, _getBudrComplianceCounts,
  budrAssessments,
} from '../../src/modules/budr-engine.js';

function cleanCtx() {
  return {
    rdsInstances: [], instances: [], ecsServices: [], lambdaFns: [],
    albs: [], ecacheClusters: [], redshiftClusters: [], s3bk: [],
    volumes: [], snapshots: [],
  };
}

describe('BUDR constants', () => {
  it('has strategy definitions', () => {
    assert.ok(_BUDR_STRATEGY.hot);
    assert.ok(_BUDR_STRATEGY.warm);
    assert.ok(_BUDR_STRATEGY.cold);
  });

  it('has RTO/RPO profiles for all resource types', () => {
    const expected = ['rds_multi_az', 'rds_single_backup', 'rds_no_backup',
      'ec2_asg', 'ec2_ami_snap', 'ec2_standalone', 'lambda', 's3'];
    expected.forEach(k => {
      assert.ok(_BUDR_RTO_RPO[k], `Missing profile: ${k}`);
      assert.ok(_BUDR_RTO_RPO[k].rto, `${k} missing rto`);
      assert.ok(_BUDR_RTO_RPO[k].tier, `${k} missing tier`);
    });
  });

  it('has tier targets for all classification levels', () => {
    assert.ok(_TIER_TARGETS.critical);
    assert.ok(_TIER_TARGETS.high);
    assert.ok(_TIER_TARGETS.medium);
    assert.ok(_TIER_TARGETS.low);
  });
});

describe('_fmtMin', () => {
  it('formats zero', () => assert.equal(_fmtMin(0), '0'));
  it('formats infinity', () => assert.equal(_fmtMin(Infinity), '∞'));
  it('formats minutes', () => assert.equal(_fmtMin(30), '30 min'));
  it('formats hours', () => assert.equal(_fmtMin(120), '2 hr'));
  it('formats days', () => assert.equal(_fmtMin(2880), '2 days'));
});

describe('_budrTierCompliance', () => {
  it('returns pass for protected resource in low tier', () => {
    const r = _budrTierCompliance('rds_multi_az', 'low');
    assert.equal(r.status, 'pass');
    assert.equal(r.issues.length, 0);
  });

  it('returns fail for at-risk resource in critical tier', () => {
    const r = _budrTierCompliance('rds_no_backup', 'critical');
    assert.equal(r.status, 'fail');
    assert.ok(r.issues.length > 0);
    assert.ok(r.issues.some(i => i.severity === 'critical'));
  });

  it('returns unknown for missing inputs', () => {
    assert.equal(_budrTierCompliance(null, 'low').status, 'unknown');
    assert.equal(_budrTierCompliance('rds_multi_az', null).status, 'unknown');
  });
});

describe('runBUDRChecks', () => {
  it('returns empty findings for empty infrastructure', () => {
    const findings = runBUDRChecks(cleanCtx());
    assert.ok(Array.isArray(findings));
    assert.equal(findings.length, 0);
  });

  it('flags RDS without backups as CRITICAL', () => {
    const ctx = cleanCtx();
    ctx.rdsInstances = [{
      DBInstanceIdentifier: 'mydb',
      DBInstanceClass: 'db.t3.medium',
      BackupRetentionPeriod: 0,
      MultiAZ: false,
      Tags: [],
    }];
    const findings = runBUDRChecks(ctx);
    const bak = findings.filter(f => f.control === 'BUDR-BAK-1');
    assert.ok(bak.length >= 1, 'Should flag no-backup RDS');
    assert.equal(bak[0].severity, 'CRITICAL');
  });

  it('flags RDS without Multi-AZ', () => {
    const ctx = cleanCtx();
    ctx.rdsInstances = [{
      DBInstanceIdentifier: 'mydb',
      DBInstanceClass: 'db.t3.medium',
      BackupRetentionPeriod: 7,
      MultiAZ: false,
      Tags: [],
    }];
    const findings = runBUDRChecks(ctx);
    const ha = findings.filter(f => f.control === 'BUDR-HA-1');
    assert.ok(ha.length >= 1, 'Should flag single-AZ RDS');
  });

  it('does not flag RDS Multi-AZ with backups', () => {
    const ctx = cleanCtx();
    ctx.rdsInstances = [{
      DBInstanceIdentifier: 'mydb',
      DBInstanceClass: 'db.t3.medium',
      BackupRetentionPeriod: 7,
      MultiAZ: true,
      DeletionProtection: true,
      Tags: [],
    }];
    const findings = runBUDRChecks(ctx);
    const ha = findings.filter(f => f.control === 'BUDR-HA-1');
    const bak = findings.filter(f => f.control === 'BUDR-BAK-1');
    assert.equal(ha.length, 0, 'Should not flag Multi-AZ RDS');
    assert.equal(bak.length, 0, 'Should not flag RDS with backups');
  });

  it('assesses EC2 standalone instances', async () => {
    const ctx = cleanCtx();
    ctx.instances = [{
      InstanceId: 'i-test',
      InstanceType: 't3.medium',
      SubnetId: 'sub-1',
      Tags: [{ Key: 'Name', Value: 'web-server' }],
      BlockDeviceMappings: [],
    }];
    ctx.snapshots = [];
    runBUDRChecks(ctx);
    // budrAssessments is a live ES module binding updated by runBUDRChecks
    const { budrAssessments: assessments } = await import('../../src/modules/budr-engine.js');
    const ec2 = assessments.filter(a => a.type === 'EC2');
    assert.ok(ec2.length >= 1, 'Should assess EC2 instance');
  });

  it('assesses Lambda functions as protected', async () => {
    const ctx = cleanCtx();
    ctx.lambdaFns = [{
      FunctionName: 'my-func',
      Runtime: 'nodejs18.x',
      VpcConfig: { VpcId: 'vpc-1', SubnetIds: ['sub-1'] },
    }];
    runBUDRChecks(ctx);
    const { budrAssessments: assessments } = await import('../../src/modules/budr-engine.js');
    const lam = assessments.filter(a => a.type === 'Lambda');
    assert.ok(lam.length >= 1, 'Should assess Lambda');
    assert.equal(lam[0].profile.tier, 'protected');
  });
});
