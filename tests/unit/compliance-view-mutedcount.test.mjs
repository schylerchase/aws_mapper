// Regression test for BUG-HUNT #11: buildComplianceView.mutedCount read the
// never-populated state.js `complianceFindings` binding (always []), so the
// "N finding(s) muted" dashboard label never appeared. The fix counts mutes
// from the pre-mute, filter-scoped working set.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };

const { buildComplianceView, muteKey, setMutedFindings } = await import('../../src/modules/compliance-view.js');

const F = (check, resource, severity, framework) => ({ check, resource, severity, framework });

describe('buildComplianceView.mutedCount (#11)', () => {
  beforeEach(() => setMutedFindings(new Set()));

  it('counts muted findings passed via opts (not the empty state binding)', () => {
    const findings = [F('c1', 'r1', 'HIGH', 'aws'), F('c2', 'r2', 'MEDIUM', 'aws'), F('c3', 'r3', 'LOW', 'aws')];
    setMutedFindings(new Set([muteKey(findings[0]), muteKey(findings[1])]));
    const view = buildComplianceView({ findings, includeMuted: false });
    assert.equal(view.mutedCount, 2, 'reports the number of muted findings');
    assert.equal(view.base.length, 1, 'muted findings removed from base (mute filter still works)');
  });

  it('respects the active framework filter when counting mutes', () => {
    const findings = [F('c1', 'r1', 'HIGH', 'cis'), F('c2', 'r2', 'MEDIUM', 'aws')];
    setMutedFindings(new Set([muteKey(findings[0]), muteKey(findings[1])]));
    // Only the cis finding is in scope; the aws mute is out of scope.
    const view = buildComplianceView({ findings, frameworks: 'cis', includeMuted: false });
    assert.equal(view.mutedCount, 1);
  });

  it('reports zero when nothing is muted', () => {
    const findings = [F('c1', 'r1', 'HIGH', 'aws')];
    const view = buildComplianceView({ findings, includeMuted: false });
    assert.equal(view.mutedCount, 0);
  });
});
