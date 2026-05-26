import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAccountStripeLabel,
  buildSubnetHeaderLabels,
  buildVpcHeaderLabels,
  formatAzSeparatorLabel
} from '../../src/modules/render-labels.js';

const nameOf = (resource, fallback) => resource.Name || fallback;

describe('render label helpers', () => {
  it('builds VPC header text and constrained name length', () => {
    const labels = buildVpcHeaderLabels({
      vpc: {
        VpcId: 'vpc-123',
        CidrBlock: '10.0.0.0/16',
        Name: 'production-network',
        _accountId: '111122223333'
      },
      width: 300,
      region: 'us-east-1',
      isMultiAccount: true,
      nameOf,
      nameLengthRatio: 0.7,
      accountSeparator: ' | '
    });

    assert.equal(labels.name, 'production-network');
    assert.equal(labels.cidrLine, '10.0.0.0/16 | us-east-1 [111122223333]');
    assert.equal(labels.nameTextLength, 144);
  });

  it('omits default account IDs and blank regions from VPC header text', () => {
    const labels = buildVpcHeaderLabels({
      vpc: { VpcId: 'vpc-123', CidrBlock: '10.0.0.0/16', _accountId: 'default' },
      width: 120,
      region: '',
      isMultiAccount: true,
      nameOf
    });

    assert.equal(labels.name, 'vpc-123');
    assert.equal(labels.cidrLine, '10.0.0.0/16');
    assert.equal(labels.nameTextLength, 56);
  });

  it('truncates account stripe labels to the available vertical space', () => {
    assert.equal(
      buildAccountStripeLabel({
        accountId: '111122223333',
        accountLabel: 'production-security-account',
        height: 56
      }),
      'produ...'
    );
  });

  it('formats AZ and subnet header labels consistently', () => {
    assert.equal(formatAzSeparatorLabel('us-east-1a'), 'AZ: 1A');

    assert.deepEqual(
      buildSubnetHeaderLabels({
        subnet: {
          SubnetId: 'subnet-123',
          CidrBlock: '10.0.1.0/24',
          AvailabilityZone: 'us-east-1a',
          Name: 'app-a'
        },
        isPublic: true,
        nameOf,
        exposureStyle: 'short'
      }),
      {
        name: 'app-a',
        cidrLine: '10.0.1.0/24 1a',
        exposureLabel: 'PUB'
      }
    );

    assert.equal(
      buildSubnetHeaderLabels({
        subnet: {
          SubnetId: 'subnet-123',
          CidrBlock: '10.0.1.0/24',
          AvailabilityZone: 'us-east-1a'
        },
        isPublic: false,
        nameOf,
        exposureStyle: 'long'
      }).cidrLine,
      '10.0.1.0/24  1a'
    );
  });
});
