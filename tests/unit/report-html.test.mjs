import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.localStorage = {
  getItem() {
    return null;
  },
  setItem() {},
  removeItem() {}
};

const { _rptBUDRAssessmentTable, _rptInteractiveJS } =
  await import('../../src/modules/report-html.js');

describe('_rptInteractiveJS', () => {
  it('keeps expanded detail rows tied to visible parent rows', () => {
    const js = _rptInteractiveJS();
    assert.match(js, /previous\.style\.display !== "none"/);
    assert.doesNotMatch(js, /previous\.style\.display !== ""/);
  });

  it('sorts BUDR tier and strategy columns from raw row data', () => {
    const js = _rptInteractiveJS();
    assert.match(js, /function rptSortValue/);
    assert.match(js, /if \(type === "tier"\)/);
    assert.match(js, /return row\.dataset\.tier \|\| ""/);
    assert.match(js, /if \(type === "strategy"\)/);
    assert.match(js, /return row\.dataset\.strategy \|\| ""/);
  });
});

describe('_rptBUDRAssessmentTable', () => {
  it('renders raw tier and strategy attributes for filters and exported sorting', () => {
    window._loadedContexts = [];
    const html = _rptBUDRAssessmentTable([
      {
        account: '111122223333',
        type: 'RDS',
        id: 'db-prod',
        name: 'prod-db',
        profileKey: 'rds_no_backup',
        profile: { tier: 'at_risk', strategy: 'cold', rto: '~8 hr', rpo: 'total loss' },
        signals: { backups: false }
      }
    ]);

    assert.match(html, /data-tier="at_risk"/);
    assert.match(html, /data-strategy="cold"/);
    assert.match(html, /data-sort-type="tier"/);
    assert.match(html, /data-sort-type="strategy"/);
    assert.match(html, />At Risk</);
    assert.match(html, />Cold</);
  });

  it('sorts assessments from highest risk to protected, then by DR strategy', () => {
    window._loadedContexts = [];
    const html = _rptBUDRAssessmentTable([
      {
        account: 'acct',
        type: 'Lambda',
        id: 'lambda-safe',
        name: 'lambda-safe',
        profile: { tier: 'protected', strategy: 'hot', rto: '0', rpo: '0' }
      },
      {
        account: 'acct',
        type: 'EC2',
        id: 'ec2-partial',
        name: 'ec2-partial',
        profile: { tier: 'partial', strategy: 'pilot', rto: '~15 min', rpo: '~7 days' }
      },
      {
        account: 'acct',
        type: 'RDS',
        id: 'rds-risk',
        name: 'rds-risk',
        profile: { tier: 'at_risk', strategy: 'cold', rto: '~8 hr', rpo: 'total loss' }
      }
    ]);

    assert.ok(html.indexOf('rds-risk') < html.indexOf('ec2-partial'));
    assert.ok(html.indexOf('ec2-partial') < html.indexOf('lambda-safe'));
  });
});
