// Characterization tests for the AWS-export file classifier (`matchFile`).
//
// `matchFile` (src/modules/file-classify.js, a verbatim snapshot of
// app-core.js:18664-18792) is the sole authority deciding which AWS bucket each
// uploaded file lands in, and it silently drops files by returning `null`. The
// Playwright suite injects JSON straight into textareas and never exercises it,
// so these tests pin every routing branch BEFORE the inline copy in app-core.js
// is replaced by a delegating call (Humify plan unit EXT1). Every assertion
// documents CURRENT behavior; none should change.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileMap, matchFile } from '../../src/modules/file-classify.js';

describe('fileMap table', () => {
  it('every entry has an id and a non-empty pattern list', () => {
    for (const entry of fileMap) {
      assert.equal(typeof entry.id, 'string');
      assert.ok(entry.id.startsWith('in_'), `${entry.id} should start with in_`);
      assert.ok(Array.isArray(entry.patterns) && entry.patterns.length > 0);
    }
  });
});

describe('matchFile — exact filename match (highest priority, runs before content)', () => {
  it('routes a plain resource filename to its bucket', () => {
    assert.equal(matchFile('vpc.json'), 'in_vpcs');
    assert.equal(matchFile('vpcs.json'), 'in_vpcs');
    assert.equal(matchFile('subnet.json'), 'in_subnets');
    assert.equal(matchFile('instances.json'), 'in_ec2');
  });

  it('matches the naive plural rule (base === pattern + "s") when the plural is not itself a pattern', () => {
    // in_enis has pattern 'eni' (no 'enis'); in_vols has 'vol' (no 'vols').
    assert.equal(matchFile('enis.json'), 'in_enis');
    assert.equal(matchFile('vols.json'), 'in_vols');
  });

  it('strips the .json extension case-insensitively and lowercases before matching', () => {
    assert.equal(matchFile('VPC.JSON'), 'in_vpcs');
  });

  it('exact match wins even when content would otherwise override (override only runs on the contains path)', () => {
    // base 'instances' is an exact in_ec2 pattern, so content is never consulted.
    assert.equal(matchFile('instances.json', { DBInstances: [{}] }), 'in_ec2');
  });
});

describe('matchFile — contains match (longest pattern wins)', () => {
  it('prefers the longest matching pattern over a shorter one', () => {
    // base 'prod-vpc-endpoints-use1' contains both 'vpc' (3) and 'vpc-endpoint' (12).
    assert.equal(matchFile('prod-vpc-endpoints-use1.json'), 'in_vpces');
  });

  it('sanitizes spaces and punctuation before the contains scan', () => {
    // 'my vpcs!.json' -> base 'myvpcs' (contains 'vpcs').
    assert.equal(matchFile('my vpcs!.json'), 'in_vpcs');
  });
});

describe('matchFile — content override on the contains path', () => {
  it('reclassifies a misnamed EC2 file to RDS when content has DBInstances and no Reservations', () => {
    // base 'ec2-prod-dump' contains-matches in_ec2 (not exact), so override applies.
    assert.equal(matchFile('ec2-prod-dump.json', { DBInstances: [{}] }), 'in_rds');
  });

  it('reclassifies a misnamed EC2 file to ElastiCache when content has CacheClusters', () => {
    assert.equal(matchFile('ec2-prod-dump.json', { CacheClusters: [{}] }), 'in_elasticache');
  });

  it('keeps EC2 classification when content actually has Reservations', () => {
    assert.equal(matchFile('ec2-prod-dump.json', { Reservations: [{}] }), 'in_ec2');
  });
});

describe('matchFile — expectedKey rejection returns null (silent drop)', () => {
  it('returns null when a critical bucket match is contradicted by content', () => {
    // base 'vpc-config-2024' contains-matches in_vpcs, but content lacks "Vpcs".
    assert.equal(matchFile('vpc-config-2024.json', { Foo: 1 }), null);
  });

  it('returns the bucket when the expected AWS key is present', () => {
    assert.equal(matchFile('vpc-config-2024.json', { Vpcs: [] }), 'in_vpcs');
  });
});

describe('matchFile — content-based fallback (no filename match)', () => {
  it('classifies by JSON keys when the filename matches nothing (object content)', () => {
    assert.equal(matchFile('dump.json', { Reservations: [{}] }), 'in_ec2');
    assert.equal(matchFile('dump.json', { SecurityGroups: [] }), 'in_sgs');
  });

  it('classifies by JSON keys for raw string content via the first-500-char scan', () => {
    assert.equal(matchFile('dump.json', '{"Vpcs":[{}]}'), 'in_vpcs');
  });

  it('honors fallback precedence: Reservations is checked before DBInstances', () => {
    assert.equal(matchFile('dump.json', { Reservations: [{}], DBInstances: [{}] }), 'in_ec2');
  });
});

describe('matchFile — null when nothing matches', () => {
  it('returns null for an unrecognized filename with no content', () => {
    assert.equal(matchFile('readme.json', null), null);
  });

  it('returns null for an unrecognized filename with unrecognized content', () => {
    assert.equal(matchFile('readme.json', { Nonsense: true }), null);
  });
});
