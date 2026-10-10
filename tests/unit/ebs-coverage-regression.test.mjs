import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = {};
const budr = await import('../../src/modules/budr-engine.js');

function context(snaps, volumes = ['vol-root', 'vol-data']) {
  return { instances: [{ InstanceId: 'i-a', BlockDeviceMappings: volumes.map(VolumeId => ({ Ebs: { VolumeId } })) }], snapByVol: snaps };
}
const snapshot = (days = 0, State = 'completed') => ({ State, StartTime: new Date(Date.now() - days * 864e5).toISOString() });
test('one backed-up volume cannot cover another unsnapshotted volume', () => {
  const findings = budr.runBUDRChecks(context({ 'vol-root': [snapshot()] }));
  assert.equal(budr.budrAssessments[0].signals.Snapshots, false);
  assert.equal(budr.budrAssessments[0].profile.tier, 'at_risk');
  assert.ok(findings.some(f => f.control === 'BUDR-BAK-2'));
});
test('every attached volume needs a completed snapshot', () => {
  for (const State of ['pending', 'error']) {
    budr.runBUDRChecks(context({ 'vol-root': [snapshot()], 'vol-data': [snapshot(0, State)] }));
    assert.equal(budr.budrAssessments[0].signals.Snapshots, false);
  }
  budr.runBUDRChecks(context({ 'vol-root': [snapshot()], 'vol-data': [snapshot()] }));
  assert.equal(budr.budrAssessments[0].signals.Snapshots, true);
});
test('backup age uses the least recent completed volume coverage', () => {
  const findings = budr.runBUDRChecks(context({ 'vol-root': [snapshot()], 'vol-data': [snapshot(10), snapshot(0, 'pending')] }));
  assert.equal(budr.budrAssessments[0].signals.SnapAgeDays, 10);
  assert.ok(findings.some(f => f.control === 'BUDR-AGE-1'));
});
test('an instance without collected volumes cannot gain snapshot coverage vacuously', () => {
  budr.runBUDRChecks(context({}, []));
  assert.equal(budr.budrAssessments[0].signals.Snapshots, false);
});
