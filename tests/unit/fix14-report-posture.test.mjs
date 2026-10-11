import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.window = { _loadedContexts: [] };
globalThis.document = { getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { _rptSecurityPosture } = await import('../../src/modules/report-html.js');
const configured = { IsMultiRegionTrail: true, LogFileValidationEnabled: true,
  KmsKeyId: 'example-key', CloudWatchLogsLogGroupArn: 'example-log-group' };
const row = trails => _rptSecurityPosture({ cloudtrailTrails: trails }, {})
  .match(/<tr><td>CloudTrail<\/td>[\s\S]*?<\/tr>/)[0];

test('a stopped configured CloudTrail fails while preserving configuration evidence', () => {
  const result = row([{ ...configured, IsLogging: false }]);
  assert.match(result, />FAIL</);
  assert.doesNotMatch(result, /PASS|PARTIAL/);
  assert.match(result, /1 with multi-region, validation, KMS and CloudWatch configured/);
  assert.match(result, /0 logging, 1 stopped/);
});

test('configuration-only CloudTrail data cannot claim verified logging', () => {
  for (const IsLogging of [undefined, null]) {
    const result = row([{ ...configured, IsLogging }]);
    assert.match(result, />PARTIAL</);
    assert.doesNotMatch(result, /PASS/);
    assert.match(result, /1 logging status unknown/);
  }
});

test('only a currently logging and fully configured trail passes', () => {
  assert.match(row([{ ...configured, IsLogging: true }]), />PASS</);
  const incomplete = row([{ ...configured, IsLogging: true, KmsKeyId: undefined }]);
  assert.match(incomplete, />PARTIAL</);
  assert.doesNotMatch(incomplete, /PASS/);
  const mixed = row([{ ...configured, IsLogging: false }, { IsLogging: true }]);
  assert.match(mixed, />PARTIAL</);
  assert.doesNotMatch(mixed, /PASS/);
  assert.match(row([]), />FAIL</);
});

test('another account logging cannot make the selected stopped account pass', () => {
  window._loadedContexts = [{ accountId: '111111111111' }, { accountId: '222222222222' }];
  document.getElementById = id => id === 'rptAccountFilter' ? { value: '111111111111' } : null;
  try {
    const result = row([
      { ...configured, _accountId: '111111111111', IsLogging: false },
      { ...configured, _accountId: '222222222222', IsLogging: true }
    ]);
    assert.match(result, />FAIL</);
    assert.match(result, /1 trail\(s\)/);
    assert.doesNotMatch(result, /PASS/);
  } finally { document.getElementById = () => null; }
});
