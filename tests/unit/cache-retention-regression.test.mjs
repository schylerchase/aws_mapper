import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = {};
const budr = await import('../../src/modules/budr-engine.js');

for (const retention of [0, undefined]) {
  test('a configured snapshot window does not enable backups with retention ' + retention, () => {
    const findings = budr.runBUDRChecks({ ecacheClusters: [{ CacheClusterId: 'cache-a', Engine: 'redis', NumCacheNodes: 1, SnapshotWindow: '04:00-05:00', SnapshotRetentionLimit: retention }] });
    assert.equal(budr.budrAssessments[0].signals.Snapshots, false);
    assert.equal(budr.budrAssessments[0].profile.tier, 'at_risk');
    assert.ok(findings.some(f => f.control === 'BUDR-BAK-3'));
  });
}
test('positive retention enables backup coverage even without a collected window', () => {
  const findings = budr.runBUDRChecks({ ecacheClusters: [{ CacheClusterId: 'cache-a', Engine: 'redis', NumCacheNodes: 1, SnapshotRetentionLimit: 5 }] });
  assert.equal(budr.budrAssessments[0].signals.Snapshots, true);
  assert.equal(budr.budrAssessments[0].profile.tier, 'partial');
  assert.ok(!findings.some(f => f.control === 'BUDR-BAK-3'));
});
