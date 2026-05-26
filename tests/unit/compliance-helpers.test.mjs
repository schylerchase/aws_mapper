import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  annotateCheckovIds,
  buildFinding,
  getTaggedName,
  hasEnvironmentVariablesWithoutKms,
  hasOpenCidr,
  hasPort,
  naclCoversPort
} from '../../src/modules/compliance-helpers.js';

describe('compliance helper predicates', () => {
  it('detects open IPv4 and IPv6 CIDR ranges', () => {
    assert.equal(hasOpenCidr({ IpRanges: [{ CidrIp: '0.0.0.0/0' }] }), true);
    assert.equal(hasOpenCidr({ Ipv6Ranges: [{ CidrIpv6: '::/0' }] }), true);
    assert.equal(hasOpenCidr({ IpRanges: [{ CidrIp: '10.0.0.0/16' }] }), false);
  });

  it('matches TCP/UDP ports and all-protocol rules', () => {
    assert.equal(hasPort({ IpProtocol: '-1' }, 443), true);
    assert.equal(hasPort({ IpProtocol: 'tcp', FromPort: 80, ToPort: 443 }, 443), true);
    assert.equal(hasPort({ IpProtocol: 'udp', FromPort: 53, ToPort: 53 }, 443), false);
    assert.equal(hasPort({ IpProtocol: 'icmp', FromPort: 0, ToPort: 0 }, 443), false);
  });

  it('matches NACL protocol and port ranges', () => {
    assert.equal(naclCoversPort({ Protocol: '-1' }, 22), true);
    assert.equal(naclCoversPort({ Protocol: '6', PortRange: { From: 20, To: 22 } }, 22), true);
    assert.equal(naclCoversPort({ Protocol: '17', PortRange: { From: 53, To: 53 } }, 22), false);
  });

  it('detects Lambda environment variables without a KMS key', () => {
    assert.equal(
      hasEnvironmentVariablesWithoutKms({
        Environment: { Variables: { SECRET_NAME: 'db-password' } }
      }),
      true
    );
    assert.equal(
      hasEnvironmentVariablesWithoutKms({
        Environment: { Variables: { SECRET_NAME: 'db-password' } },
        KMSKeyArn: 'arn:aws:kms:us-east-1:111122223333:key/example'
      }),
      false
    );
  });
});

describe('compliance finding helpers', () => {
  it('builds a normalized finding object', () => {
    assert.deepEqual(
      buildFinding({
        severity: 'HIGH',
        code: 'CIS 5.2',
        framework: 'CIS',
        resource: 'sg-123',
        resourceName: 'web',
        message: 'SG allows SSH',
        remediation: 'Restrict SSH'
      }),
      {
        severity: 'HIGH',
        control: 'CIS 5.2',
        framework: 'CIS',
        resource: 'sg-123',
        resourceName: 'web',
        message: 'SG allows SSH',
        remediation: 'Restrict SSH'
      }
    );
  });

  it('adds Checkov IDs without changing unmapped findings', () => {
    const findings = [
      buildFinding({
        severity: 'HIGH',
        code: 'CIS 5.2',
        framework: 'CIS',
        resource: 'sg-123',
        resourceName: 'web',
        message: 'SG allows SSH',
        remediation: 'Restrict SSH'
      }),
      buildFinding({
        severity: 'LOW',
        code: 'CUSTOM-1',
        framework: 'CUSTOM',
        resource: 'custom',
        resourceName: 'custom',
        message: 'Custom finding',
        remediation: 'Review manually'
      })
    ];

    annotateCheckovIds(findings);

    assert.equal(findings[0].ckv, 'CKV_AWS_24');
    assert.equal(Object.hasOwn(findings[1], 'ckv'), false);
  });

  it('returns Name tag values with fallback IDs', () => {
    assert.equal(getTaggedName({ Tags: [{ Key: 'Name', Value: 'database' }] }, 'db-1'), 'database');
    assert.equal(getTaggedName({ Tags: [] }, 'db-1'), 'db-1');
    assert.equal(getTaggedName(null, 'db-1'), 'db-1');
  });
});
