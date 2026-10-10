import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = {};
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { _collectStatements, summarizePermissions } = await import('../../src/modules/governance.js');
const name = 'AdministratorAccess';
const localArn = 'arn:aws:iam::111111111111:policy/AdministratorAccess';
function policy(Arn, Action) {
  return { Arn, PolicyName: name, PolicyVersionList: [{ IsDefaultVersion: true, Document: { Statement: [{ Effect: 'Allow', Action, Resource: '*' }] } }] };
}
const policies = [policy('arn:aws:iam::aws:policy/AdministratorAccess', '*'), policy(localArn, 's3:GetObject')];
function principal(reference) { return { AttachedManagedPolicies: [reference] }; }
test('exact customer ARN wins over an earlier same-name AWS policy', () => {
  const role = principal({ PolicyArn: localArn, PolicyName: name });
  assert.equal(_collectStatements(role, { policies })[0].Action, 's3:GetObject');
  assert.equal(summarizePermissions(role, { policies }).isAdmin, false);
});
test('an unavailable explicit ARN does not borrow a same-name policy', () => {
  assert.deepEqual(_collectStatements(principal({ PolicyArn: localArn + '-missing', PolicyName: name }), { policies }), []);
});
test('name-only references resolve only an unambiguous collected policy', () => {
  assert.deepEqual(_collectStatements(principal({ PolicyName: name }), { policies }), []);
  assert.equal(_collectStatements(principal({ PolicyName: name }), { policies: [policies[1]] })[0].Action, 's3:GetObject');
});
