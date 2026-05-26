import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProjectSnapshot,
  collectProjectTextareas,
  getProjectDownloadName,
  isProjectFile
} from '../../src/modules/project-files.js';

describe('project file helpers', () => {
  it('collects non-empty textarea values and parses JSON where possible', () => {
    const textareas = [
      { id: 'in_vpcs', value: ' [{"VpcId":"vpc-1"}] ' },
      { id: 'in_notes', value: 'not json' },
      { id: 'in_empty', value: '   ' }
    ];

    assert.deepEqual(collectProjectTextareas(textareas), {
      in_vpcs: [{ VpcId: 'vpc-1' }],
      in_notes: 'not json'
    });
  });

  it('builds the current single-account project shape', () => {
    const project = buildProjectSnapshot({
      accountLabel: 'Prod Account',
      layout: 'executive',
      hubVpcName: 'core-vpc',
      textareas: { in_vpcs: [] },
      preferences: { detailLevel: 2 },
      designMode: true,
      designRegion: 'us-east-2',
      designChanges: [
        { id: 'ok', action: 'add', target: 'subnet', params: { name: 'web' }, timestamp: 1 },
        { id: 'bad', action: 'add', target: 'vpc', params: {}, timestamp: 2, _invalid: true }
      ],
      annotations: { 'vpc-1': [{ text: 'owner' }] },
      budrOverrides: { db: { tier: 'critical' } }
    });

    assert.equal(project._format, 'awsmap');
    assert.equal(project._version, '1.0');
    assert.equal(project.accountLabel, 'Prod Account');
    assert.equal(project.layout, 'executive');
    assert.deepEqual(project.designChanges, [
      { id: 'ok', action: 'add', target: 'subnet', params: { name: 'web' }, timestamp: 1 }
    ]);
    assert.deepEqual(project.budrOverrides, { db: { tier: 'critical' } });
  });

  it('builds multi-account project payloads when more than one context is loaded', () => {
    const project = buildProjectSnapshot({
      loadedContexts: [
        {
          accountId: '111111111111',
          accountLabel: 'Prod',
          region: 'us-east-1',
          textareas: { in_vpcs: [] }
        },
        {
          accountId: '222222222222',
          accountLabel: 'Dev',
          region: 'us-west-2',
          textareas: { in_subnets: [] }
        }
      ],
      multiViewMode: true
    });

    assert.equal(project._version, '2.0');
    assert.equal(project.multiViewMode, true);
    assert.deepEqual(project.accounts, [
      { id: '111111111111', label: 'Prod', region: 'us-east-1', textareas: { in_vpcs: [] } },
      { id: '222222222222', label: 'Dev', region: 'us-west-2', textareas: { in_subnets: [] } }
    ]);
  });

  it('sanitizes download names and recognizes project file payloads', () => {
    assert.equal(getProjectDownloadName('Prod / Shared: East'), 'Prod___Shared__East.awsmap');
    assert.equal(getProjectDownloadName(''), 'aws-project.awsmap');
    assert.equal(isProjectFile({ textareas: {} }), true);
    assert.equal(isProjectFile({ _format: 'awsmap' }), true);
    assert.equal(isProjectFile({ random: true }), false);
  });
});
