import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ipToInt, intToIp, parseCIDR, cidrToString,
  splitCIDR, cidrContains, cidrOverlap, ipInCIDR
} from '../../src/modules/cidr-engine.js';

describe('ipToInt', () => {
  it('converts 10.0.0.1', () => {
    assert.equal(ipToInt('10.0.0.1'), 167772161);
  });
  it('converts 0.0.0.0', () => {
    assert.equal(ipToInt('0.0.0.0'), 0);
  });
  it('converts 255.255.255.255', () => {
    assert.equal(ipToInt('255.255.255.255'), 4294967295);
  });
  it('returns null for non-string', () => {
    assert.equal(ipToInt(null), null);
    assert.equal(ipToInt(undefined), null);
    assert.equal(ipToInt(123), null);
  });
  it('returns null for invalid format', () => {
    assert.equal(ipToInt('not-an-ip'), null);
    assert.equal(ipToInt('10.0.0'), null);
    assert.equal(ipToInt('10.0.0.256'), null);
  });
});

describe('intToIp', () => {
  it('converts 0 to 0.0.0.0', () => {
    assert.equal(intToIp(0), '0.0.0.0');
  });
  it('converts 167772161 to 10.0.0.1', () => {
    assert.equal(intToIp(167772161), '10.0.0.1');
  });
  it('round-trips with ipToInt', () => {
    const ip = '192.168.1.100';
    assert.equal(intToIp(ipToInt(ip)), ip);
  });
});

describe('parseCIDR', () => {
  it('parses 10.0.0.0/16', () => {
    const r = parseCIDR('10.0.0.0/16');
    assert.equal(r.prefix, 16);
    assert.equal(r.size, 65536);
  });
  it('parses /32 (single host)', () => {
    const r = parseCIDR('10.0.0.1/32');
    assert.equal(r.size, 1);
  });
  it('parses /0 (all IPs)', () => {
    const r = parseCIDR('0.0.0.0/0');
    assert.equal(r.prefix, 0);
  });
  it('returns null for non-aligned CIDR', () => {
    assert.equal(parseCIDR('10.0.0.1/16'), null);
  });
  it('returns null for invalid input', () => {
    assert.equal(parseCIDR(null), null);
    assert.equal(parseCIDR(''), null);
    assert.equal(parseCIDR('garbage'), null);
    assert.equal(parseCIDR('10.0.0.0/33'), null);
  });
});

describe('cidrToString', () => {
  it('formats network and prefix', () => {
    const p = parseCIDR('10.0.0.0/24');
    assert.equal(cidrToString(p.network, p.prefix), '10.0.0.0/24');
  });
});

describe('splitCIDR', () => {
  it('splits /24 into two /25s', () => {
    const halves = splitCIDR('10.0.0.0/24');
    assert.deepEqual(halves, ['10.0.0.0/25', '10.0.0.128/25']);
  });
  it('splits /16 into two /17s', () => {
    const halves = splitCIDR('172.16.0.0/16');
    assert.deepEqual(halves, ['172.16.0.0/17', '172.16.128.0/17']);
  });
  it('returns null for /32 (cannot split)', () => {
    assert.equal(splitCIDR('10.0.0.1/32'), null);
  });
  it('returns null for invalid CIDR', () => {
    assert.equal(splitCIDR('garbage'), null);
  });
});

describe('cidrContains', () => {
  it('10.0.0.0/16 contains 10.0.1.0/24', () => {
    assert.equal(cidrContains('10.0.0.0/16', '10.0.1.0/24'), true);
  });
  it('10.0.0.0/24 does not contain 10.0.1.0/24', () => {
    assert.equal(cidrContains('10.0.0.0/24', '10.0.1.0/24'), false);
  });
  it('child cannot be larger than parent', () => {
    assert.equal(cidrContains('10.0.0.0/24', '10.0.0.0/16'), false);
  });
  it('0.0.0.0/0 contains everything', () => {
    assert.equal(cidrContains('0.0.0.0/0', '192.168.0.0/16'), true);
  });
  it('returns false for invalid input', () => {
    assert.equal(cidrContains('garbage', '10.0.0.0/24'), false);
  });
});

describe('cidrOverlap', () => {
  it('overlapping CIDRs', () => {
    assert.equal(cidrOverlap('10.0.0.0/16', '10.0.1.0/24'), true);
  });
  it('non-overlapping CIDRs', () => {
    assert.equal(cidrOverlap('10.0.0.0/16', '172.16.0.0/16'), false);
  });
  it('same CIDR overlaps itself', () => {
    assert.equal(cidrOverlap('10.0.0.0/24', '10.0.0.0/24'), true);
  });
  it('returns false for invalid', () => {
    assert.equal(cidrOverlap('garbage', '10.0.0.0/24'), false);
  });
});

describe('ipInCIDR', () => {
  it('10.0.0.5 is in 10.0.0.0/24', () => {
    assert.equal(ipInCIDR('10.0.0.5', '10.0.0.0/24'), true);
  });
  it('10.0.1.5 is not in 10.0.0.0/24', () => {
    assert.equal(ipInCIDR('10.0.1.5', '10.0.0.0/24'), false);
  });
  it('any IP is in 0.0.0.0/0', () => {
    assert.equal(ipInCIDR('192.168.1.1', '0.0.0.0/0'), true);
  });
  it('returns false for invalid IP', () => {
    assert.equal(ipInCIDR('garbage', '10.0.0.0/24'), false);
  });
});
