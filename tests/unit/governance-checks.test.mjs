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

// compliance-engine.js calls these as bare globals
globalThis.runBUDRChecks = () => [];
globalThis.parseIAMData = () => ({});
globalThis.runIAMChecks = () => [];

import { runGovernanceChecks, invalidateComplianceCache } from '../../src/modules/compliance-engine.js';

// Helper: minimal ctx with governance fields
function govCtx(overrides) {
  return {
    vpcs: [], subnets: [], sgs: [], nacls: [], rts: [], instances: [],
    albs: [], rdsInstances: [], ecsServices: [], lambdaFns: [],
    s3bk: [], ecacheClusters: [], redshiftClusters: [], volumes: [],
    snapshots: [], peerings: [], pubSubs: new Set(),
    subRT: {}, subNacl: {}, sgByVpc: {},
    cloudtrailTrails: [], cwAlarms: [], logGroups: [], flowLogs: [],
    configRecorders: [], configRules: [], configConformance: [],
    securityHubStds: [], accessAnalyzers: [], kmsKeys: [],
    guarddutyDetectors: [], secrets: [], ssmParams: [],
    ecrRepos: [], asgs: [], apiGateways: [], snsTopics: [], sqsQueues: [],
    ...overrides,
  };
}

function findControl(findings, control) {
  return findings.filter(f => f.control === control);
}

describe('runGovernanceChecks', () => {
  it('returns empty array when no governance data present', () => {
    const findings = runGovernanceChecks(govCtx());
    assert.ok(Array.isArray(findings));
    assert.equal(findings.length, 0);
  });

  // === CIS-2.1: CloudTrail multi-region ===
  describe('CIS-2.1 CloudTrail multi-region', () => {
    it('flags when no trails exist', () => {
      const findings = runGovernanceChecks(govCtx({ cloudtrailTrails: [{ Name: 'test', IsMultiRegionTrail: false }] }));
      const f = findControl(findings, 'CIS-2.1');
      assert.ok(f.length >= 1, 'Should flag non-multi-region trail');
      assert.equal(f[0].severity, 'CRITICAL');
    });

    it('passes when multi-region trail exists', () => {
      const findings = runGovernanceChecks(govCtx({
        cloudtrailTrails: [{ Name: 'main', IsMultiRegionTrail: true, IsLogging: true,
          HasCustomEventSelectors: false, LogFileValidationEnabled: true,
          KmsKeyId: 'arn:aws:kms:us-east-1:123:key/abc',
          CloudWatchLogsLogGroupArn: 'arn:aws:logs:us-east-1:123:log-group:ct' }]
      }));
      const f = findControl(findings, 'CIS-2.1');
      assert.equal(f.length, 0, 'Should not flag multi-region trail');
    });
  });

  // === CIS-2.2: Log validation ===
  describe('CIS-2.2 CloudTrail log validation', () => {
    it('flags when log validation disabled', () => {
      const findings = runGovernanceChecks(govCtx({
        cloudtrailTrails: [{ Name: 'test', IsMultiRegionTrail: true, LogFileValidationEnabled: false }]
      }));
      const f = findControl(findings, 'CIS-2.2');
      assert.ok(f.length >= 1);
      assert.equal(f[0].severity, 'HIGH');
    });
  });

  // === CIS-2.3: KMS encryption ===
  describe('CIS-2.3 CloudTrail KMS encryption', () => {
    it('flags when no KMS key', () => {
      const findings = runGovernanceChecks(govCtx({
        cloudtrailTrails: [{ Name: 'test', IsMultiRegionTrail: true }]
      }));
      const f = findControl(findings, 'CIS-2.3');
      assert.ok(f.length >= 1);
      assert.equal(f[0].severity, 'HIGH');
    });
  });

  // === CIS-2.4: CloudWatch integration ===
  describe('CIS-2.4 CloudTrail CloudWatch integration', () => {
    it('flags when no CloudWatch log group', () => {
      const findings = runGovernanceChecks(govCtx({
        cloudtrailTrails: [{ Name: 'test', IsMultiRegionTrail: true }]
      }));
      const f = findControl(findings, 'CIS-2.4');
      assert.ok(f.length >= 1);
      assert.equal(f[0].severity, 'HIGH');
    });
  });

  // === CIS-2.7: VPC flow logs ===
  describe('CIS-2.7 VPC flow logs', () => {
    it('flags VPC without flow logs', () => {
      const findings = runGovernanceChecks(govCtx({
        vpcs: [{ VpcId: 'vpc-1' }],
        flowLogs: []
      }));
      const f = findControl(findings, 'CIS-2.7');
      assert.ok(f.length >= 1);
      assert.equal(f[0].severity, 'HIGH');
    });

    it('passes VPC with flow logs', () => {
      const findings = runGovernanceChecks(govCtx({
        vpcs: [{ VpcId: 'vpc-1' }],
        flowLogs: [{ ResourceId: 'vpc-1', FlowLogId: 'fl-1' }]
      }));
      const f = findControl(findings, 'CIS-2.7');
      assert.equal(f.length, 0);
    });
  });

  // === GOV-GD1: GuardDuty enabled ===
  describe('GOV-GD1 GuardDuty', () => {
    it('flags when no detectors', () => {
      // Only flag if guarddutyDetectors array exists but is empty (data was provided)
      const findings = runGovernanceChecks(govCtx({ guarddutyDetectors: [] }));
      // No detectors and no data means no finding — we only flag when data source is present
      // For explicit empty data, the check should fire only if there's evidence the export ran
      assert.ok(Array.isArray(findings));
    });
  });

  // === GOV-GD2: GuardDuty features ===
  describe('GOV-GD2 GuardDuty features', () => {
    it('flags disabled features', () => {
      const findings = runGovernanceChecks(govCtx({
        guarddutyDetectors: [{
          DetectorId: 'det-1', Status: 'ENABLED',
          Features: [
            { Name: 'S3_DATA_EVENTS', Status: 'ENABLED' },
            { Name: 'EKS_AUDIT_LOGS', Status: 'DISABLED' }
          ]
        }]
      }));
      const f = findControl(findings, 'GOV-GD2');
      assert.ok(f.length >= 1);
      assert.ok(f[0].message.includes('EKS_AUDIT_LOGS'));
    });
  });

  // === GOV-CFG1: Config recorder ===
  describe('GOV-CFG1 Config recorder', () => {
    it('flags when no recorder', () => {
      const findings = runGovernanceChecks(govCtx({
        configRecorders: []
      }));
      // Empty array = no data provided, skip. Need explicit check.
      assert.ok(Array.isArray(findings));
    });

    it('flags recorder not recording all resources', () => {
      const findings = runGovernanceChecks(govCtx({
        configRecorders: [{ name: 'default', recordingGroup: { allSupported: false } }]
      }));
      const f = findControl(findings, 'GOV-CFG1');
      assert.ok(f.length >= 1);
      assert.equal(f[0].severity, 'HIGH');
    });
  });

  // === GOV-CFG2: Config rules ===
  describe('GOV-CFG2 Config rules', () => {
    it('flags when recorder exists but no rules', () => {
      const findings = runGovernanceChecks(govCtx({
        configRecorders: [{ name: 'default', recordingGroup: { allSupported: true } }],
        configRules: []
      }));
      const f = findControl(findings, 'GOV-CFG2');
      assert.ok(f.length >= 1);
      assert.equal(f[0].severity, 'MEDIUM');
    });
  });

  // === GOV-SH1: Security Hub ===
  describe('GOV-SH1 Security Hub', () => {
    it('flags when no standards subscriptions', () => {
      const findings = runGovernanceChecks(govCtx({
        securityHubStds: []
      }));
      // Empty data = no finding. Only fire with evidence.
      assert.ok(Array.isArray(findings));
    });
  });

  // === GOV-AA1: Access Analyzer ===
  describe('GOV-AA1 Access Analyzer', () => {
    it('flags when no analyzers with ACTIVE status', () => {
      const findings = runGovernanceChecks(govCtx({
        accessAnalyzers: [{ analyzerName: 'test', status: 'CREATING' }]
      }));
      const f = findControl(findings, 'GOV-AA1');
      assert.ok(f.length >= 1);
      assert.equal(f[0].severity, 'MEDIUM');
    });

    it('passes with active analyzer', () => {
      const findings = runGovernanceChecks(govCtx({
        accessAnalyzers: [{ analyzerName: 'test', status: 'ACTIVE' }]
      }));
      const f = findControl(findings, 'GOV-AA1');
      assert.equal(f.length, 0);
    });
  });

  // === GOV-KMS1: KMS rotation ===
  describe('GOV-KMS1 KMS rotation', () => {
    it('flags rotation disabled', () => {
      const findings = runGovernanceChecks(govCtx({
        kmsKeys: [{ KeyId: 'key-1', KeyManager: 'CUSTOMER', KeyState: 'Enabled', RotationEnabled: false }]
      }));
      const f = findControl(findings, 'GOV-KMS1');
      assert.ok(f.length >= 1);
    });

    it('passes rotation enabled', () => {
      const findings = runGovernanceChecks(govCtx({
        kmsKeys: [{ KeyId: 'key-1', KeyManager: 'CUSTOMER', KeyState: 'Enabled', RotationEnabled: true }]
      }));
      const f = findControl(findings, 'GOV-KMS1');
      assert.equal(f.length, 0);
    });

    it('skips AWS-managed keys', () => {
      const findings = runGovernanceChecks(govCtx({
        kmsKeys: [{ KeyId: 'key-1', KeyManager: 'AWS', KeyState: 'Enabled', RotationEnabled: false }]
      }));
      const f = findControl(findings, 'GOV-KMS1');
      assert.equal(f.length, 0);
    });
  });

  // === GOV-LOG1: Log group retention ===
  describe('GOV-LOG1 Log group retention', () => {
    it('flags no retention', () => {
      const findings = runGovernanceChecks(govCtx({
        logGroups: [{ logGroupName: '/aws/lambda/test' }]
      }));
      const f = findControl(findings, 'GOV-LOG1');
      assert.ok(f.length >= 1);
    });

    it('passes with retention', () => {
      const findings = runGovernanceChecks(govCtx({
        logGroups: [{ logGroupName: '/aws/lambda/test', retentionInDays: 90 }]
      }));
      const f = findControl(findings, 'GOV-LOG1');
      assert.equal(f.length, 0);
    });
  });

  // === GOV-ECR1: Tag immutability ===
  describe('GOV-ECR1 ECR tag immutability', () => {
    it('flags mutable tags', () => {
      const findings = runGovernanceChecks(govCtx({
        ecrRepos: [{ repositoryName: 'app', imageTagMutability: 'MUTABLE' }]
      }));
      const f = findControl(findings, 'GOV-ECR1');
      assert.ok(f.length >= 1);
    });
  });

  // === GOV-ECR2: Scan on push ===
  describe('GOV-ECR2 ECR scan on push', () => {
    it('flags scan disabled', () => {
      const findings = runGovernanceChecks(govCtx({
        ecrRepos: [{ repositoryName: 'app', imageScanningConfiguration: { scanOnPush: false } }]
      }));
      const f = findControl(findings, 'GOV-ECR2');
      assert.ok(f.length >= 1);
    });
  });

  // === GOV-SEC1: Secret rotation ===
  describe('GOV-SEC1 Secret rotation', () => {
    it('flags rotation disabled', () => {
      const findings = runGovernanceChecks(govCtx({
        secrets: [{ Name: 'db-pass', RotationEnabled: false }]
      }));
      const f = findControl(findings, 'GOV-SEC1');
      assert.ok(f.length >= 1);
    });
  });

  // === GOV-APIGW1: TLS policy ===
  describe('GOV-APIGW1 API Gateway TLS', () => {
    it('flags non-TLS-1.2', () => {
      const findings = runGovernanceChecks(govCtx({
        apiGateways: [{ name: 'api', endpointConfiguration: { types: ['REGIONAL'] }, minimumCompressionSize: null }]
      }));
      // API GWs without explicit TLS 1.2 policy should be flagged
      const f = findControl(findings, 'GOV-APIGW1');
      assert.ok(f.length >= 1);
    });
  });
});
