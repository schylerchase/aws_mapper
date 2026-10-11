import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
const { validateDesignState, _designApplyFns, _generateCLI } = await import('../../src/modules/design-mode.js');
const { generateTerraform, generateCloudFormation, _ckRts } = await import('../../src/modules/iac-generator.js');

test('full design validation reports missing subnet parents and invalid surviving changes', () => {
  assert.equal(validateDesignState([], { vpcs: [], subnets: [{ SubnetId: 'subnet-child', VpcId: 'vpc-missing', CidrBlock: '10.0.1.0/24' }] }).valid, false);
  const ch = { action: 'add_subnet', _invalid: true, _validation: { errors: ['VPC vpc-missing not found'] } };
  assert.deepEqual(validateDesignState([ch], { vpcs: [], subnets: [] }).errors, ch._validation.errors);
  assert.equal(validateDesignState([], { vpcs: [{ VpcId: 'vpc-parent' }], subnets: [{ SubnetId: 'subnet-child', VpcId: 'vpc-parent', CidrBlock: '10.0.1.0/24' }] }).valid, true);
});

for (const [id, field, flag] of [ ['nat-test', 'NatGatewayId', 'nat-gateway-id'], ['tgw-test', 'TransitGatewayId', 'transit-gateway-id'], ['pcx-test', 'VpcPeeringConnectionId', 'vpc-peering-connection-id'], ['igw-test', 'GatewayId', 'gateway-id'] ]) {
  test('designed ' + id + ' route retains its target type in stored JSON and CLI', () => {
    let value = JSON.stringify({ RouteTables: [{ RouteTableId: 'rtb-test', Routes: [] }] });
    const ch = { action: 'add_route', target: { RouteTableId: 'rtb-test' }, params: { TargetId: id, DestinationCidrBlock: '10.20.0.0/16' } };
    _designApplyFns.add_route(ch, () => value, (_, next) => value = next);
    const route = JSON.parse(value).RouteTables[0].Routes[0];
    assert.equal(route[field], id);
    if (field !== 'GatewayId') assert.equal(route.GatewayId, undefined);
    assert.ok(_generateCLI(ch)[0].includes('--' + flag + ' ' + id));
    const ctx = { vpcs: [{ VpcId: 'vpc-test', CidrBlock: '10.0.0.0/16' }], rts: [{ RouteTableId: 'rtb-test', VpcId: 'vpc-test', Routes: [route] }] };
    const tfField = field.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    assert.ok(generateTerraform(ctx, { mode: 'create' }).code.includes(tfField + ' = '));
    const cfnRoutes = Object.values(JSON.parse(generateCloudFormation(ctx, { format: 'json' }).code).Resources).filter(r => r.Type === 'AWS::EC2::Route');
    assert.equal(cfnRoutes[0].Properties[field], id);
    const checkov = {}; _ckRts(ctx.rts, checkov, new Set());
    assert.equal(Object.values(checkov).find(r => r.Type === 'AWS::EC2::Route').Properties[field], id);
  });
}
