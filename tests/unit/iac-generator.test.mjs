import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// iac-generator.js imports from state.js, utils.js, export-utils.js
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };

const {
  _tfName, _tfRef, detectCircularSGs, _writeTags, _writeSGRule,
  setTfIdMap
} = await import('../../src/modules/iac-generator.js');

describe('_tfName', () => {
  it('returns sanitized Name tag value', () => {
    const res = { Tags: [{ Key: 'Name', Value: 'My-VPC' }] };
    assert.equal(_tfName(res, 'vpc'), 'my_vpc');
  });
  it('falls back to VpcId when no Name tag', () => {
    const res = { VpcId: 'vpc-abc123', Tags: [] };
    assert.equal(_tfName(res, 'vpc'), 'vpc_abc123');
  });
  it('falls back to SubnetId', () => {
    const res = { SubnetId: 'subnet-def456' };
    assert.equal(_tfName(res, 'subnet'), 'subnet_def456');
  });
  it('falls back to prefix when no identifiable fields', () => {
    const res = {};
    assert.equal(_tfName(res, 'myprefix'), 'myprefix');
  });
  it('falls back to res when no prefix', () => {
    const res = {};
    assert.equal(_tfName(res), 'res');
  });
});

describe('_tfRef', () => {
  it('returns mapped reference when ID is known', () => {
    setTfIdMap({ 'sg-123': 'aws_security_group.web' });
    assert.equal(_tfRef('sg-123', 'id'), 'aws_security_group.web.id');
  });
  it('returns quoted literal for unknown ID', () => {
    setTfIdMap({});
    assert.equal(_tfRef('sg-unknown', 'id'), '"sg-unknown"');
  });
});

describe('detectCircularSGs', () => {
  it('detects simple A->B->A cycle', () => {
    const sgs = [
      { GroupId: 'sg-a', IpPermissions: [{ UserIdGroupPairs: [{ GroupId: 'sg-b' }] }], IpPermissionsEgress: [] },
      { GroupId: 'sg-b', IpPermissions: [{ UserIdGroupPairs: [{ GroupId: 'sg-a' }] }], IpPermissionsEgress: [] }
    ];
    const cycles = detectCircularSGs(sgs);
    assert.ok(cycles.length > 0);
    // At least one cycle should contain both sg-a and sg-b
    const hasCycle = cycles.some(c => c.includes('sg-a') && c.includes('sg-b'));
    assert.ok(hasCycle, 'Should detect cycle between sg-a and sg-b');
  });
  it('returns empty for independent SGs', () => {
    const sgs = [
      { GroupId: 'sg-a', IpPermissions: [{ UserIdGroupPairs: [{ GroupId: 'sg-b' }] }], IpPermissionsEgress: [] },
      { GroupId: 'sg-b', IpPermissions: [], IpPermissionsEgress: [] }
    ];
    const cycles = detectCircularSGs(sgs);
    assert.equal(cycles.length, 0);
  });
  it('handles SGs with no rules', () => {
    const sgs = [
      { GroupId: 'sg-a', IpPermissions: [], IpPermissionsEgress: [] }
    ];
    const cycles = detectCircularSGs(sgs);
    assert.equal(cycles.length, 0);
  });
  it('ignores self-references', () => {
    const sgs = [
      { GroupId: 'sg-a', IpPermissions: [{ UserIdGroupPairs: [{ GroupId: 'sg-a' }] }], IpPermissionsEgress: [] }
    ];
    const cycles = detectCircularSGs(sgs);
    assert.equal(cycles.length, 0);
  });
});

describe('_writeTags', () => {
  it('generates valid HCL tags block', () => {
    const lines = [];
    _writeTags(lines, { Tags: [{ Key: 'Name', Value: 'test' }, { Key: 'Env', Value: 'prod' }] });
    const output = lines.join('\n');
    assert.ok(output.includes('tags = {'));
    assert.ok(output.includes('Name = "test"'));
    assert.ok(output.includes('Env = "prod"'));
  });
  it('escapes special chars in tag values', () => {
    const lines = [];
    _writeTags(lines, { Tags: [{ Key: 'Desc', Value: 'has "quotes" and \\backslash' }] });
    const output = lines.join('\n');
    assert.ok(output.includes('\\"quotes\\"'));
    assert.ok(output.includes('\\\\backslash'));
  });
  it('quotes non-identifier tag keys', () => {
    const lines = [];
    _writeTags(lines, { Tags: [{ Key: 'aws:tag-name', Value: 'val' }] });
    const output = lines.join('\n');
    assert.ok(output.includes('"aws:tag-name"'));
  });
  it('skips when no tags', () => {
    const lines = [];
    _writeTags(lines, { Tags: [] });
    assert.equal(lines.length, 0);
  });
  it('skips when Tags undefined', () => {
    const lines = [];
    _writeTags(lines, {});
    assert.equal(lines.length, 0);
  });
});

describe('_writeSGRule', () => {
  it('generates protocol, port range, and CIDR blocks', () => {
    const lines = [];
    _writeSGRule(lines, {
      IpProtocol: 'tcp', FromPort: 443, ToPort: 443,
      IpRanges: [{ CidrIp: '0.0.0.0/0' }],
      Ipv6Ranges: [], UserIdGroupPairs: []
    });
    const output = lines.join('\n');
    assert.ok(output.includes('protocol    = "tcp"'));
    assert.ok(output.includes('from_port   = 443'));
    assert.ok(output.includes('to_port     = 443'));
    assert.ok(output.includes('cidr_blocks = ["0.0.0.0/0"]'));
  });
  it('handles all-traffic rule (-1)', () => {
    const lines = [];
    _writeSGRule(lines, {
      IpProtocol: '-1',
      IpRanges: [{ CidrIp: '10.0.0.0/8' }],
      Ipv6Ranges: [], UserIdGroupPairs: []
    });
    const output = lines.join('\n');
    assert.ok(output.includes('protocol    = "-1"'));
    assert.ok(output.includes('from_port   = 0'));
  });
  it('includes SG references', () => {
    setTfIdMap({ 'sg-ref': 'aws_security_group.ref' });
    const lines = [];
    _writeSGRule(lines, {
      IpProtocol: 'tcp', FromPort: 80, ToPort: 80,
      IpRanges: [], Ipv6Ranges: [],
      UserIdGroupPairs: [{ GroupId: 'sg-ref' }]
    });
    const output = lines.join('\n');
    assert.ok(output.includes('aws_security_group.ref.id'));
  });
});
