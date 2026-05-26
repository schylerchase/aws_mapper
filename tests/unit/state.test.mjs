import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearMapRefs,
  getComplianceFindings,
  getMapRefs,
  getRenderContext,
  resetAppState,
  setComplianceFindings,
  setMapRefs,
  setRenderContext
} from '../../src/modules/state.js';

describe('shared app state facade', () => {
  beforeEach(() => {
    resetAppState();
  });

  it('stores and clears the active render context', () => {
    const ctx = { vpcs: [{ VpcId: 'vpc-1' }] };

    setRenderContext(ctx);
    assert.equal(getRenderContext(), ctx);

    resetAppState();
    assert.equal(getRenderContext(), null);
  });

  it('stores map references as one readable group', () => {
    const refs = { svg: { id: 'svg' }, zoom: { id: 'zoom' }, g: { id: 'g' } };

    setMapRefs(refs);
    assert.deepEqual(getMapRefs(), refs);

    clearMapRefs();
    assert.deepEqual(getMapRefs(), { svg: null, zoom: null, g: null });
  });

  it('stores compliance findings without cloning module-owned arrays', () => {
    const findings = [{ control: 'CIS 5.2' }];

    setComplianceFindings(findings);
    assert.equal(getComplianceFindings(), findings);
  });
});
