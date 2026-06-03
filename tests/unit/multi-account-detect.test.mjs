// Characterization test for detectAccountId / detectRegion (HUMIFY monolith
// Phase 1.1). These were pure functions buried in the app-core.js init region;
// this pins their behaviour so the extraction into multi-account.js is provably
// behaviour-preserving and gives them their first-ever direct unit test (C2).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };

const { detectAccountId, detectRegion } = await import('../../src/modules/multi-account.js');

describe('detectAccountId', () => {
  it('reads a 12-digit OwnerId', () => {
    assert.equal(detectAccountId({ OwnerId: '123456789012' }), '123456789012');
  });
  it('ignores a non-12-digit OwnerId', () => {
    assert.equal(detectAccountId({ OwnerId: '12345' }), null);
  });
  it('parses the account from an ARN field', () => {
    assert.equal(detectAccountId({ LoadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:111122223333:loadbalancer/app/x/y' }), '111122223333');
  });
  it('falls back to RequesterVpcInfo.OwnerId', () => {
    assert.equal(detectAccountId({ RequesterVpcInfo: { OwnerId: '444455556666' } }), '444455556666');
  });
  it('returns null when nothing matches, and for null input', () => {
    assert.equal(detectAccountId({}), null);
    assert.equal(detectAccountId(null), null);
  });
});

describe('detectRegion', () => {
  it('parses the region from an ARN field', () => {
    assert.equal(detectRegion({ DBInstanceArn: 'arn:aws:rds:eu-west-1:111122223333:db:mydb' }), 'eu-west-1');
  });
  it('strips the AZ suffix from AvailabilityZone', () => {
    assert.equal(detectRegion({ AvailabilityZone: 'us-east-1a' }), 'us-east-1');
    assert.equal(detectRegion({ Placement: { AvailabilityZone: 'ap-south-1b' } }), 'ap-south-1');
  });
  it('maps S3 LocationConstraint (EU alias, null => us-east-1)', () => {
    assert.equal(detectRegion({ Name: 'b', CreationDate: '2020', LocationConstraint: 'EU' }), 'eu-west-1');
    assert.equal(detectRegion({ Name: 'b', CreationDate: '2020', LocationConstraint: 'ap-southeast-2' }), 'ap-southeast-2');
    assert.equal(detectRegion({ Name: 'b', CreationDate: '2020' }), 'us-east-1');
  });
  it('returns null when nothing matches, and for null input', () => {
    assert.equal(detectRegion({}), null);
    assert.equal(detectRegion(null), null);
  });
});
