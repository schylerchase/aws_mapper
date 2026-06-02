// Regression tests for two governance.js correctness bugs (BUG-HUNT #10, #14).
//
// #10: prepareIAMReviewData flagged a role's OWN account as cross-account
//      because it pushed every 12-digit principal account without excluding
//      the role's own account (the iam-engine IAM-3/IAM-6 guards already do).
// #14: summarizePermissions kept only the LAST Resource per action (string
//      overwrite), truncating multi-resource statements in the Effective
//      Permissions panel.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };

const { prepareIAMReviewData, summarizePermissions } = await import('../../src/modules/governance.js');

describe('prepareIAMReviewData — own-account :root trust is not cross-account (#10)', () => {
  const iamData = {
    roles: [
      {
        RoleName: 'AdminRole',
        Arn: 'arn:aws:iam::111222333444:role/AdminRole',
        AssumeRolePolicyDocument: { Statement: [{ Effect: 'Allow', Principal: { AWS: 'arn:aws:iam::111222333444:root' } }] },
      },
      {
        RoleName: 'CrossAccountRole',
        Arn: 'arn:aws:iam::111222333444:role/CrossAccountRole',
        AssumeRolePolicyDocument: { Statement: [{ Effect: 'Allow', Principal: { AWS: 'arn:aws:iam::555666777888:root' } }] },
      },
      {
        RoleName: 'ServiceRole',
        Arn: 'arn:aws:iam::111222333444:role/ServiceRole',
        AssumeRolePolicyDocument: { Statement: [{ Effect: 'Allow', Principal: { Service: 'ecs.amazonaws.com' } }] },
      },
    ],
    users: [],
    policies: [],
  };

  it('excludes the role own account from crossAccounts', () => {
    const items = prepareIAMReviewData(iamData);
    const admin = items.find(i => i.name === 'AdminRole');
    assert.deepEqual(admin.crossAccounts, [], 'same-account :root trust is not cross-account');
  });

  it('still reports a genuine cross-account trust', () => {
    const items = prepareIAMReviewData(iamData);
    const cross = items.find(i => i.name === 'CrossAccountRole');
    assert.deepEqual(cross.crossAccounts, ['555666777888']);
  });

  it('reports no cross-account for a service-principal trust', () => {
    const items = prepareIAMReviewData(iamData);
    const svc = items.find(i => i.name === 'ServiceRole');
    assert.deepEqual(svc.crossAccounts, []);
  });
});

describe('summarizePermissions — keeps every Resource per action (#14)', () => {
  it('retains all resources of a multi-resource Allow statement (deduped)', () => {
    const principal = {
      RolePolicyList: [{
        PolicyName: 'p',
        PolicyDocument: { Statement: [{ Effect: 'Allow', Action: 's3:GetObject', Resource: ['arn:aws:s3:::b', 'arn:aws:s3:::b/*'] }] },
      }],
    };
    const out = summarizePermissions(principal, { policies: [] });
    assert.ok(out.services.s3, 's3 service present');
    assert.deepEqual(out.services.s3.resources.GetObject, ['arn:aws:s3:::b', 'arn:aws:s3:::b/*'],
      'both resources retained as an array, not overwritten to the last');
  });

  it('dedupes a resource repeated across statements', () => {
    const principal = {
      RolePolicyList: [{
        PolicyName: 'p',
        PolicyDocument: {
          Statement: [
            { Effect: 'Allow', Action: 's3:GetObject', Resource: 'arn:aws:s3:::b' },
            { Effect: 'Allow', Action: 's3:GetObject', Resource: ['arn:aws:s3:::b', 'arn:aws:s3:::c'] },
          ],
        },
      }],
    };
    const out = summarizePermissions(principal, { policies: [] });
    assert.deepEqual(out.services.s3.resources.GetObject, ['arn:aws:s3:::b', 'arn:aws:s3:::c']);
  });
});
