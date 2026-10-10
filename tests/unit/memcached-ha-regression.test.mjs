import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = {};
const budr = await import('../../src/modules/budr-engine.js');

for (const NumCacheNodes of [1, 3]) {
  test('node-based Memcached with ' + NumCacheNodes + ' nodes does not imply replicated HA', () => {
    const findings = budr.runBUDRChecks({ ecacheClusters: [{ CacheClusterId: 'cache-a', Engine: 'memcached', NumCacheNodes }] });
    const assessment = budr.budrAssessments[0];
    assert.equal(assessment.profile.tier, 'at_risk');
    assert.equal(assessment.profile, budr._BUDR_RTO_RPO.ecache_no_snap);
    assert.equal(assessment.signals.MultiNode, NumCacheNodes > 1);
    assert.match(findings.find(f => f.control === 'BUDR-HA-4').message, /without replication/);
    assert.ok(!findings.some(f => /Enable automatic snapshots/.test(f.remediation)));
  });
}
test('the existing Redis snapshot recovery path remains available', () => {
  budr.runBUDRChecks({ ecacheClusters: [{ CacheClusterId: 'cache-a', Engine: 'redis', NumCacheNodes: 1, SnapshotRetentionLimit: 5 }] });
  assert.equal(budr.budrAssessments[0].profile.tier, 'partial');
});
