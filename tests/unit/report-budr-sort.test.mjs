// Regression test for BUG-HUNT #13: report-html.js _rptBUDRAssessmentTable
// secondary (within-tier) sort used `_BUDR_STRATEGY_ORDER[strategy] || 9`, and
// since hot===0 is falsy the strongest-DR (hot) rows were pushed to the BOTTOM
// of each tier. The fix uses `?? 9` so 0 is preserved.
//
// (Sibling falsy-bug #7 in exports-xlsx.js _rptBuildXlsxBUDR is the same class of
// defect but that function is not node-importable — it needs SheetJS + DOM
// globals — so it is fixed by mirroring the correct ternary; this test locks the
// importable twin's ordering contract.)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
// Module reads these off window at generation time (single-account => no toolbar accounts).
globalThis._loadedContexts = [];
globalThis._rlCtx = {};

const { _rptBUDRAssessmentTable } = await import('../../src/modules/report-html.js');

describe('_rptBUDRAssessmentTable — within-tier strategy ordering (#13)', () => {
  it('sorts hot (strongest DR) before cold within the same tier', () => {
    const hot = { id: 'r-hot', type: 'EC2', name: 'hot', profile: { tier: 'at_risk', strategy: 'hot', rto: '0', rpo: '0' } };
    const cold = { id: 'r-cold', type: 'EC2', name: 'cold', profile: { tier: 'at_risk', strategy: 'cold', rto: '24h', rpo: '24h' } };
    // Pass cold first so the assertion proves the SORT (not input order) decides.
    const html = _rptBUDRAssessmentTable([cold, hot]);
    assert.ok(html.indexOf('r-hot') < html.indexOf('r-cold'), 'hot must sort before cold within a tier');
  });

  it('keeps the primary tier ordering at_risk < protected', () => {
    const risk = { id: 'r-risk', type: 'EC2', name: 'risk', profile: { tier: 'at_risk', strategy: 'cold', rto: '24h', rpo: '24h' } };
    const prot = { id: 'r-prot', type: 'EC2', name: 'prot', profile: { tier: 'protected', strategy: 'hot', rto: '0', rpo: '0' } };
    const html = _rptBUDRAssessmentTable([prot, risk]);
    assert.ok(html.indexOf('r-risk') < html.indexOf('r-prot'), 'at_risk tier sorts before protected');
  });
});
