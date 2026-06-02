// Correctness characterization tests for `runIAMChecks` cross-account trust and
// IAM-5 unused-role date handling (Humify plan units C3 -> F2).
//
// Findings match on the stable message tail (the sibling iam-engine.test.mjs
// matches on the category-code field; here we avoid coupling to it).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runIAMChecks } from '../../src/modules/iam-engine.js';

const hasMsg = (findings, sub) => findings.some(f => (f.message || '').includes(sub));
const IAM3_CROSS = 'without MFA condition'; // role cross-account IAM-3
const IAM6_EXTID = 'without ExternalId';    // IAM-6
const IAM5_UNUSED = 'unused for';           // IAM-5

const trust = (awsPrincipal) => JSON.stringify({
  Version: '2012-10-17',
  Statement: [{ Effect: 'Allow', Principal: { AWS: awsPrincipal }, Action: 'sts:AssumeRole' }],
});

describe('runIAMChecks — cross-account trust requires a known own-account', () => {
  it('does NOT flag IAM-3/IAM-6 when the role has no Arn (own account unknown)', () => {
    // Without role.Arn, _acctFromArn returns '' and every :root principal reads
    // as cross-account ('<acct>' !== '') — a false positive. Suppress it.
    const role = { RoleName: 'noArnRole', AssumeRolePolicyDocument: trust('arn:aws:iam::123456789012:root') };
    const findings = runIAMChecks({ roles: [role], users: [], policies: [] });
    assert.equal(hasMsg(findings, IAM3_CROSS), false, 'no cross-account IAM-3 when own account is unknown');
    assert.equal(hasMsg(findings, IAM6_EXTID), false, 'no IAM-6 when own account is unknown');
  });

  it('still flags IAM-3/IAM-6 for a genuine cross-account :root trust (Arn present)', () => {
    const role = {
      RoleName: 'crossRole',
      Arn: 'arn:aws:iam::111111111111:role/crossRole',
      AssumeRolePolicyDocument: trust('arn:aws:iam::999999999999:root'),
    };
    const findings = runIAMChecks({ roles: [role], users: [], policies: [] });
    assert.equal(hasMsg(findings, IAM3_CROSS), true, 'cross-account IAM-3 still fires');
    assert.equal(hasMsg(findings, IAM6_EXTID), true, 'IAM-6 still fires');
  });

  it('does NOT flag a same-account :root trust', () => {
    const role = {
      RoleName: 'sameRole',
      Arn: 'arn:aws:iam::111111111111:role/sameRole',
      AssumeRolePolicyDocument: trust('arn:aws:iam::111111111111:root'),
    };
    const findings = runIAMChecks({ roles: [role], users: [], policies: [] });
    assert.equal(hasMsg(findings, IAM3_CROSS), false, 'same-account trust is not cross-account');
    assert.equal(hasMsg(findings, IAM6_EXTID), false, 'same-account trust has no IAM-6');
  });
});

describe('runIAMChecks — IAM-5 unused role date handling', () => {
  it('flags IAM-5 when LastUsedDate is present but unparseable', () => {
    // new Date('not-a-date').getTime() is NaN; `NaN > 90d` is false, so without an
    // isNaN guard the role is silently treated as recently used.
    const role = {
      RoleName: 'staleRole',
      Arn: 'arn:aws:iam::111111111111:role/staleRole',
      RoleLastUsed: { LastUsedDate: 'not-a-date' },
    };
    const findings = runIAMChecks({ roles: [role], users: [], policies: [] });
    assert.equal(hasMsg(findings, IAM5_UNUSED), true, 'unparseable date should flag IAM-5');
  });

  it('does NOT flag IAM-5 for a role used recently', () => {
    const recent = new Date(Date.now() - 5 * 86400000).toISOString();
    const role = {
      RoleName: 'freshRole',
      Arn: 'arn:aws:iam::111111111111:role/freshRole',
      RoleLastUsed: { LastUsedDate: recent },
    };
    const findings = runIAMChecks({ roles: [role], users: [], policies: [] });
    assert.equal(hasMsg(findings, IAM5_UNUSED), false, 'recently-used role is not unused');
  });

  it('flags IAM-5 when the role was never used (no RoleLastUsed)', () => {
    const role = { RoleName: 'neverRole', Arn: 'arn:aws:iam::111111111111:role/neverRole' };
    const findings = runIAMChecks({ roles: [role], users: [], policies: [] });
    assert.equal(hasMsg(findings, IAM5_UNUSED), true, 'never-used role flags IAM-5');
  });
});
