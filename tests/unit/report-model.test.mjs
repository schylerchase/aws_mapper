import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReportDataBlob,
  getEnabledReportModuleIds,
  normalizeReportContexts,
  stripPrivateInventoryFields
} from '../../src/modules/report-model.js';

describe('report model helpers', () => {
  it('orders and filters enabled report module ids', () => {
    const modules = [
      { id: 'summary', enabled: true, available: () => true },
      { id: 'compliance', enabled: false, available: () => true },
      { id: 'budr', enabled: true, available: () => false },
      { id: 'inventory', enabled: true, available: () => true }
    ];

    assert.deepEqual(getEnabledReportModuleIds(modules, ['inventory', 'summary', 'missing']), [
      'inventory',
      'summary'
    ]);
  });

  it('normalizes loaded contexts for embedded report data', () => {
    assert.deepEqual(
      normalizeReportContexts([
        { accountId: '111111111111', accountLabel: 'Prod', region: 'us-east-1', textareas: {} }
      ]),
      [{ accountId: '111111111111', accountLabel: 'Prod', region: 'us-east-1' }]
    );
  });

  it('removes private inventory fields before embedding report data', () => {
    assert.deepEqual(
      stripPrivateInventoryFields([
        { name: 'vpc', _raw: { secret: true }, _related: ['x'], type: 'VPC' }
      ]),
      [{ name: 'vpc', type: 'VPC' }]
    );
  });

  it('builds the embedded report data blob shape', () => {
    const blob = buildReportDataBlob({
      title: 'Assessment',
      author: 'Team',
      date: '2026-05-24',
      enabledModules: ['summary'],
      contexts: [{ accountId: '111111111111', accountLabel: 'Prod', region: 'us-east-1' }],
      findings: [{ severity: 'HIGH' }],
      budrAssessments: [{ type: 'RDS' }],
      budrFindings: [{ severity: 'LOW' }],
      inventoryData: [{ name: 'vpc', _raw: true }],
      iamReviewData: [{ name: 'Admin', _raw: true, created: new Date('2026-05-24T12:00:00Z') }],
      appRegistry: [{ name: 'Core' }]
    });

    assert.equal(blob._rptFormat, 'awsmapper-report');
    assert.equal(blob.title, 'Assessment');
    assert.deepEqual(blob.inventoryData, [{ name: 'vpc' }]);
    assert.deepEqual(blob.iamReviewData, [{ name: 'Admin', created: '2026-05-24' }]);
  });
});
