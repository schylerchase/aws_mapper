import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  _stmtArr, _safePolicyParse,
  parseIAMData, getIAMAccessForVpc, runIAMChecks
} from '../../src/modules/iam-engine.js';

describe('_stmtArr', () => {
  it('wraps single statement in array', () => {
    const s = { Effect: 'Allow' };
    assert.deepEqual(_stmtArr(s), [s]);
  });
  it('returns array as-is', () => {
    const s = [{ Effect: 'Allow' }];
    assert.deepEqual(_stmtArr(s), s);
  });
  it('returns empty array for null', () => {
    assert.deepEqual(_stmtArr(null), []);
  });
  it('returns empty array for undefined', () => {
    assert.deepEqual(_stmtArr(undefined), []);
  });
});

describe('_safePolicyParse', () => {
  it('parses valid JSON string', () => {
    assert.deepEqual(_safePolicyParse('{"a":1}'), { a: 1 });
  });
  it('returns object as-is if not string', () => {
    const obj = { a: 1 };
    assert.deepEqual(_safePolicyParse(obj), obj);
  });
  it('returns empty object for invalid JSON', () => {
    assert.deepEqual(_safePolicyParse('not json'), {});
  });
  it('returns empty object for null', () => {
    assert.deepEqual(_safePolicyParse(null), {});
  });
});

describe('parseIAMData', () => {
  it('returns null for null input', () => {
    assert.equal(parseIAMData(null), null);
  });
  it('parses roles from RoleDetailList', () => {
    const raw = { RoleDetailList: [{ RoleName: 'test-role', RolePolicyList: [], AttachedManagedPolicies: [] }], Policies: [] };
    const data = parseIAMData(raw);
    assert.equal(data.roles.length, 1);
    assert.equal(data.roles[0].RoleName, 'test-role');
  });
  it('parses users from UserDetailList', () => {
    const raw = { UserDetailList: [{ UserName: 'alice' }], Policies: [] };
    const data = parseIAMData(raw);
    assert.equal(data.users.length, 1);
  });
  it('detects admin role with *:* permissions', () => {
    const raw = {
      RoleDetailList: [{
        RoleName: 'admin-role',
        RolePolicyList: [{
          PolicyDocument: JSON.stringify({
            Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }]
          })
        }],
        AttachedManagedPolicies: []
      }],
      Policies: []
    };
    const data = parseIAMData(raw);
    assert.equal(data.roles[0]._isAdmin, true);
  });
});

describe('getIAMAccessForVpc', () => {
  it('returns empty for null iamData', () => {
    assert.deepEqual(getIAMAccessForVpc(null, 'vpc-123'), []);
  });
  it('returns admin roles', () => {
    const iamData = {
      roles: [
        { RoleName: 'admin', _isAdmin: true, _hasWildcard: true, _vpcAccess: [] },
        { RoleName: 'limited', _isAdmin: false, _hasWildcard: false, _vpcAccess: ['vpc-other'] }
      ]
    };
    const result = getIAMAccessForVpc(iamData, 'vpc-123');
    assert.equal(result.length, 1);
    assert.equal(result[0].RoleName, 'admin');
  });
  it('returns roles with matching VPC access', () => {
    const iamData = {
      roles: [
        { RoleName: 'vpc-role', _isAdmin: false, _hasWildcard: false, _vpcAccess: ['vpc-123'] }
      ]
    };
    const result = getIAMAccessForVpc(iamData, 'vpc-123');
    assert.equal(result.length, 1);
  });
});

describe('runIAMChecks', () => {
  it('returns empty for null', () => {
    assert.deepEqual(runIAMChecks(null), []);
  });
  it('flags admin role', () => {
    const iamData = {
      roles: [{
        RoleName: 'admin', _isAdmin: true, _hasWildcard: true, _vpcAccess: [],
        RolePolicyList: [], AttachedManagedPolicies: []
      }],
      users: [], policies: []
    };
    const findings = runIAMChecks(iamData);
    assert.ok(findings.some(f => f.control === 'IAM-1'));
  });
  it('flags user without MFA', () => {
    const iamData = {
      roles: [], policies: [],
      users: [{
        UserName: 'bob', MFADevices: [],
        UserPolicyList: [], AttachedManagedPolicies: []
      }]
    };
    const findings = runIAMChecks(iamData);
    assert.ok(findings.some(f => f.control === 'IAM-3' && f.resource === 'bob'));
  });
  it('flags console login without MFA', () => {
    const iamData = {
      roles: [], policies: [],
      users: [{
        UserName: 'carol', MFADevices: [], LoginProfile: { CreateDate: '2024-01-01' },
        UserPolicyList: [], AttachedManagedPolicies: []
      }]
    };
    const findings = runIAMChecks(iamData);
    assert.ok(findings.some(f => f.control === 'IAM-11'));
  });
});
