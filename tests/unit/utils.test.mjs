import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeParse, ext, esc, gn, sid, clsGw, isShared, gcv, gch } from '../../src/modules/utils.js';

describe('safeParse', () => {
  it('parses valid JSON', () => {
    assert.deepEqual(safeParse('{"a":1}'), { a: 1 });
  });
  it('parses JSON array', () => {
    assert.deepEqual(safeParse('[1,2,3]'), [1, 2, 3]);
  });
  it('returns null for empty/null input', () => {
    assert.equal(safeParse(null), null);
    assert.equal(safeParse(''), null);
    assert.equal(safeParse('   '), null);
  });
  it('extracts JSON objects from mixed text', () => {
    const result = safeParse('junk {"a":1} more junk {"b":2}');
    assert.deepEqual(result, [{ a: 1 }, { b: 2 }]);
  });
  it('returns null for completely invalid text', () => {
    assert.equal(safeParse('no json here'), null);
  });
});

describe('ext', () => {
  it('extracts nested properties', () => {
    const r = { IpPermissions: [{ FromPort: 80 }], IpPermissionsEgress: [{ FromPort: 443 }] };
    const result = ext(r, ['IpPermissions', 'IpPermissionsEgress']);
    assert.equal(result.length, 2);
  });
  it('handles array of resources', () => {
    const resources = [{ Tags: [{ Key: 'Name' }] }, { Tags: [{ Key: 'Env' }] }];
    const result = ext(resources, ['Tags']);
    assert.equal(result.length, 2);
  });
  it('returns empty array for null', () => {
    assert.deepEqual(ext(null, ['Tags']), []);
  });
});

describe('esc', () => {
  it('escapes HTML entities', () => {
    assert.equal(esc('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });
  it('escapes ampersand', () => {
    assert.equal(esc('a & b'), 'a &amp; b');
  });
  it('escapes single quotes', () => {
    assert.equal(esc("it's"), 'it&#39;s');
  });
  it('handles null/undefined', () => {
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
  });
});

describe('gn', () => {
  it('returns Name tag value', () => {
    const resource = { Tags: [{ Key: 'Name', Value: 'my-vpc' }] };
    assert.equal(gn(resource, 'vpc-123'), 'my-vpc');
  });
  it('returns fallback when no Name tag', () => {
    const resource = { Tags: [{ Key: 'Env', Value: 'prod' }] };
    assert.equal(gn(resource, 'vpc-123'), 'vpc-123');
  });
  it('returns fallback when no Tags', () => {
    assert.equal(gn({}, 'vpc-123'), 'vpc-123');
  });
  it('escapes the returned value', () => {
    const resource = { Tags: [{ Key: 'Name', Value: '<b>bold</b>' }] };
    assert.equal(gn(resource, ''), '&lt;b&gt;bold&lt;/b&gt;');
  });
});

describe('sid', () => {
  it('shortens vpc-abcdef12345', () => {
    assert.equal(sid('vpc-abcdef12345'), 'abcdef1234');
  });
  it('shortens subnet-abc', () => {
    assert.equal(sid('subnet-abc'), 'abc');
  });
  it('returns empty for null', () => {
    assert.equal(sid(null), '');
  });
});

describe('clsGw', () => {
  it('classifies igw-', () => assert.equal(clsGw('igw-123'), 'IGW'));
  it('classifies vgw-', () => assert.equal(clsGw('vgw-123'), 'VGW'));
  it('classifies vpce-', () => assert.equal(clsGw('vpce-123'), 'VPCE'));
  it('classifies pcx-', () => assert.equal(clsGw('pcx-123'), 'PCX'));
  it('defaults to GW for unknown', () => assert.equal(clsGw('xyz-123'), 'GW'));
});

describe('isShared', () => {
  it('TGW is shared', () => assert.equal(isShared('TGW'), true));
  it('PCX is shared', () => assert.equal(isShared('PCX'), true));
  it('IGW is not shared', () => assert.equal(isShared('IGW'), false));
});

describe('gcv', () => {
  it('returns CSS var for IGW', () => assert.equal(gcv('IGW'), 'var(--igw-color)'));
  it('returns muted for unknown', () => assert.equal(gcv('UNKNOWN'), 'var(--text-muted)'));
});

describe('gch', () => {
  it('returns hex for IGW', () => assert.equal(gch('IGW'), '#10b981'));
  it('returns default hex for unknown', () => assert.equal(gch('UNKNOWN'), '#4a5e80'));
});
