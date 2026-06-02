import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// multi-account.js imports from utils.js / state.js and bridges to window.
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };

const { buildRlCtxFromData } = await import('../../src/modules/multi-account.js');

describe('buildRlCtxFromData governance fields (HUMIFY H-GOV)', () => {
  it('parses and returns all governance/compliance/integration fields (not silently dropped)', () => {
    // Regression: buildRlCtxFromData omitted every governance field from parsing AND its
    // return object, so any account context built via this module path (multi-account
    // merge) silently lost all compliance/audit/security data. app-core's data parser
    // (_buildRlCtxFromData) parses and returns these; the module must match.
    const ctx = buildRlCtxFromData({
      in_vpcs: JSON.stringify({ Vpcs: [{ VpcId: 'vpc-1', OwnerId: '111111111111' }] }),
      in_cloudtrail: JSON.stringify({ trailList: [{ Name: 'trail-1' }] }),
      in_cwalarms: JSON.stringify({ MetricAlarms: [{ AlarmName: 'a1' }] }),
      in_loggroups: JSON.stringify({ logGroups: [{ logGroupName: 'lg1' }] }),
      in_flowlogs: JSON.stringify({ FlowLogs: [{ FlowLogId: 'fl1' }] }),
      in_configrecorders: JSON.stringify({ ConfigurationRecorders: [{ name: 'r1' }] }),
      in_configrules: JSON.stringify({ ConfigRules: [{ ConfigRuleName: 'cr1' }] }),
      in_configconformance: JSON.stringify({ ConformancePackDetails: [{ ConformancePackName: 'cp1' }] }),
      in_securityhub: JSON.stringify({ StandardsSubscriptions: [{ StandardsArn: 's1' }] }),
      in_accessanalyzer: JSON.stringify({ analyzers: [{ name: 'aa1' }] }),
      in_kmskeys: JSON.stringify({ Keys: [{ KeyId: 'k1' }] }),
      in_guardduty: JSON.stringify({ Detectors: ['det1'] }),
      in_secrets: JSON.stringify({ SecretList: [{ Name: 'sec1' }] }),
      in_ssmparams: JSON.stringify({ Parameters: [{ Name: 'p1' }] }),
      in_ecr: JSON.stringify({ repositories: [{ repositoryName: 'ecr1' }] }),
      in_asg: JSON.stringify({ AutoScalingGroups: [{ AutoScalingGroupName: 'asg1' }] }),
      in_apigw: JSON.stringify({ items: [{ id: 'api1' }] }),
      in_sns: JSON.stringify({ Topics: [{ TopicArn: 'sns1' }] }),
      in_sqs: JSON.stringify({ QueueUrls: ['https://sqs/q1'] }),
    }, 'acct-prod');

    assert.ok(ctx, 'context built');
    const expected = {
      cloudtrailTrails: 1, cwAlarms: 1, logGroups: 1, flowLogs: 1,
      configRecorders: 1, configRules: 1, configConformance: 1,
      securityHubStds: 1, accessAnalyzers: 1, kmsKeys: 1, guarddutyDetectors: 1,
      secrets: 1, ssmParams: 1, ecrRepos: 1, asgs: 1, apiGateways: 1, snsTopics: 1, sqsQueues: 1,
    };
    for (const [field, count] of Object.entries(expected)) {
      assert.ok(Array.isArray(ctx[field]), `ctx.${field} must be an array (was ${typeof ctx[field]})`);
      assert.equal(ctx[field].length, count, `ctx.${field} should have ${count} item(s)`);
    }
  });

  it('returns empty arrays (not undefined) for governance fields when input is absent', () => {
    const ctx = buildRlCtxFromData({ in_vpcs: JSON.stringify({ Vpcs: [{ VpcId: 'vpc-1' }] }) }, 'acct-prod');
    assert.ok(ctx);
    for (const field of ['cloudtrailTrails', 'kmsKeys', 'guarddutyDetectors', 'configRecorders', 'accessAnalyzers']) {
      assert.deepEqual(ctx[field], [], `ctx.${field} should default to []`);
    }
  });
});
