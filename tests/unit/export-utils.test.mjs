import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// export-utils.js imports from utils.js and state.js — set up globals
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };

const {
  toIn, xmlEsc, sanitizeName, uid,
  resetShapeState, getShapes, getPolyEdges, getIdMap, setIdMapEntry,
  PX, SUB_W
} = await import('../../src/modules/export-utils.js');

describe('toIn', () => {
  it('converts 96px to 1 inch', () => {
    assert.equal(toIn(96), 1);
  });
  it('converts 0px to 0 inches', () => {
    assert.equal(toIn(0), 0);
  });
  it('converts fractional values', () => {
    assert.equal(toIn(48), 0.5);
  });
});

describe('xmlEsc', () => {
  it('escapes ampersand', () => {
    assert.equal(xmlEsc('a&b'), 'a&amp;b');
  });
  it('escapes angle brackets', () => {
    assert.equal(xmlEsc('<div>'), '&lt;div&gt;');
  });
  it('escapes double quotes', () => {
    assert.equal(xmlEsc('a"b'), 'a&quot;b');
  });
  it('escapes all XML special chars together', () => {
    assert.equal(xmlEsc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  });
  it('handles null/undefined', () => {
    assert.equal(xmlEsc(null), '');
    assert.equal(xmlEsc(undefined), '');
  });
  it('handles empty string', () => {
    assert.equal(xmlEsc(''), '');
  });
  it('converts numbers to string', () => {
    assert.equal(xmlEsc(42), '42');
  });
});

describe('sanitizeName', () => {
  it('converts to lowercase with underscores', () => {
    assert.equal(sanitizeName('My-VPC-Name'), 'my_vpc_name');
  });
  it('replaces special characters', () => {
    assert.equal(sanitizeName('vpc.prod/main'), 'vpc_prod_main');
  });
  it('prefixes names starting with digits', () => {
    assert.equal(sanitizeName('123abc'), 'r123abc');
  });
  it('returns unnamed for null/empty', () => {
    assert.equal(sanitizeName(null), 'unnamed');
    assert.equal(sanitizeName(''), 'unnamed');
  });
  it('preserves underscores', () => {
    assert.equal(sanitizeName('my_resource'), 'my_resource');
  });
});

describe('uid', () => {
  it('returns string in {uuid} format', () => {
    const id = uid();
    assert.match(id, /^\{[0-9a-f-]{36}\}$/);
  });
  it('returns unique values', () => {
    const a = uid(), b = uid();
    assert.notEqual(a, b);
  });
});

describe('resetShapeState', () => {
  it('clears shapes, polyEdges, and idMap', () => {
    setIdMapEntry('test', 'value');
    resetShapeState();
    assert.deepEqual(getShapes(), []);
    assert.deepEqual(getPolyEdges(), []);
    assert.deepEqual(getIdMap(), {});
  });
});

describe('constants', () => {
  it('PX is 96', () => {
    assert.equal(PX, 96);
  });
  it('SUB_W is defined', () => {
    assert.equal(typeof SUB_W, 'number');
    assert.ok(SUB_W > 0);
  });
});
