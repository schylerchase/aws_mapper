import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = {};
globalThis.document = { getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const utils = await import('../../src/modules/utils.js');
const iam = await import('../../src/modules/iam-engine.js');
const governance = await import('../../src/modules/governance.js');
const budr = await import('../../src/modules/budr-engine.js');
const tracing = await import('../../src/modules/flow-tracing.js');
const rules = await import('../../src/modules/network-rules.js');

beforeEach(() => {
  governance.setClassificationOverrides({});
  governance.setClassificationData([]);
  budr.setBudrOverrides({});
  budr.setBudrAssessments([]);
  window.runClassificationEngine = governance.runClassificationEngine;
});

function database(account = '111111111111', region = 'us-east-1', id = 'shared-db') {
  return { DBInstanceIdentifier: id, DBInstanceArn: `arn:aws:rds:${region}:${account}:db:${id}`,
    _accountId: account, _region: region, DBSubnetGroup: { VpcId: 'vpc-a' },
    MultiAZ: true, BackupRetentionPeriod: 7, StorageEncrypted: true, DeletionProtection: true };
}

describe('IAM cross-account MFA requirements', () => {
  function findings(statements) {
    const data = iam.parseIAMData({ RoleDetailList: [{ RoleName: 'example',
      Arn: 'arn:aws:iam::111111111111:role/example', AssumeRolePolicyDocument: { Statement: statements } }] });
    return iam.runIAMChecks(data).filter(f => f.control === 'IAM-3');
  }
  const trust = condition => ({ Effect: 'Allow', Principal: { AWS: 'arn:aws:iam::222222222222:root' },
    Action: 'sts:AssumeRole', ...(condition ? { Condition: condition } : {}) });
  it('flags MFA explicitly false and BoolIfExists true', () => {
    assert.equal(findings([trust({ Bool: { 'aws:MultiFactorAuthPresent': 'false' } })]).length, 1);
    assert.equal(findings([trust({ BoolIfExists: { 'aws:MultiFactorAuthPresent': 'true' } })]).length, 1);
  });
  it('does not let another statement protect unguarded cross-account trust', () => {
    const protectedStatement = trust({ Bool: { 'aws:MultiFactorAuthPresent': 'true' } });
    protectedStatement.Principal.AWS = 'arn:aws:iam::111111111111:root';
    assert.equal(findings([trust(), protectedStatement]).length, 1);
  });
  it('accepts MFA required on each cross-account Allow, and ignores Deny trust', () => {
    assert.equal(findings([trust({ Bool: { 'aws:MultiFactorAuthPresent': 'true' } })]).length, 0);
    assert.equal(findings([{ ...trust(), Effect: 'Deny' }]).length, 0);
    assert.equal(findings([trust({ NumericLessThan: { 'aws:MultiFactorAuthAge': 300 } })]).length, 0);
  });
});

describe('resource override identities and compatibility', () => {
  it('separates account, region and type, and preserves normalized identity', () => {
    const raw = database();
    const key = utils.resourceOverrideKey(raw, 'rds', raw.DBInstanceIdentifier);
    assert.notEqual(key, utils.resourceOverrideKey(database('222222222222'), 'RDS', 'shared-db'));
    assert.notEqual(key, utils.resourceOverrideKey(database('111111111111', 'us-west-2'), 'RDS', 'shared-db'));
    assert.notEqual(key, utils.resourceOverrideKey(raw, 'Lambda', 'shared-db'));
    assert.equal(key, utils.resourceOverrideKey({ id: 'shared-db', type: 'RDS', _raw: raw }));
    assert.equal(key, utils.resourceOverrideKey({ id: 'shared-db', type: 'RDS', overrideKey: key }));
  });
  it('keeps classification overrides scoped to the actual raw resource', () => {
    const a = database(), b = database('222222222222'), c = database('111111111111', 'us-west-2');
    const key = utils.resourceOverrideKey(a, 'RDS', a.DBInstanceIdentifier);
    governance.setClassificationOverrides({ [key]: 'low', 'shared-db': 'medium' });
    const rows = governance.runClassificationEngine({ rdsInstances: [a,b,c] });
    assert.deepEqual(rows.map(r => r._accountId), [a._accountId,b._accountId,c._accountId]);
    assert.deepEqual(rows.map(r => r._region), [a._region,b._region,c._region]);
    assert.deepEqual(rows.map(r => r.tier), ['low','critical','critical']);
    assert.equal(new Set(rows.map(r => r.overrideKey)).size, 3);
  });
  it('does not fan a legacy classification name across resource types', () => {
    governance.setClassificationOverrides({ 'shared-db': 'low' });
    const rows = governance.runClassificationEngine({ rdsInstances: [database()],
      lambdaFns: [{ FunctionName: 'shared-db', _accountId: '111111111111', _region: 'us-east-1' }] });
    assert.ok(rows.every(r => r.auto));
  });
  it('retains and resets unique legacy classification overrides', () => {
    governance.setClassificationOverrides({ 'shared-db': 'low' });
    const context = { rdsInstances: [database()] };
    const row = governance.runClassificationEngine(context)[0];
    assert.equal(row.tier, 'low');
    governance.resetClassificationOverride(row.overrideKey);
    assert.equal(governance.runClassificationEngine(context)[0].auto, true);
  });
  it('handles prototype names and rejects inherited or invalid tiers', () => {
    const context = { rdsInstances: [database(undefined, undefined, 'constructor')],
      lambdaFns: [{ FunctionName: 'toString' }] };
    assert.doesNotThrow(() => governance.runClassificationEngine(context));
    governance.setClassificationOverrides(Object.create({ constructor: 'low', toString: 'low' }));
    assert.ok(governance.runClassificationEngine(context).every(r => r.auto));
    governance.setClassificationOverrides({ ['constructor']: 'invalid-tier', toString: 'low' });
    const rows = governance.runClassificationEngine(context);
    assert.equal(rows[0].auto, true);
    assert.equal(rows[1].tier, 'low');
    assert.doesNotThrow(() => budr.runBUDRChecks(context));
  });
  it('applies BUDR RTO-only edits to one resource without changing shared profiles', () => {
    const a = database(), b = database('222222222222');
    const key = utils.resourceOverrideKey(a, 'RDS', a.DBInstanceIdentifier);
    budr.setBudrOverrides({ [key]: { rto: 'manual target' } });
    budr.runBUDRChecks({ rdsInstances: [a,b] });
    assert.equal(budr.budrAssessments[0].profile.rto, 'manual target');
    assert.notEqual(budr.budrAssessments[1].profile.rto, 'manual target');
    assert.deepEqual(budr.budrAssessments.map(r => r.account), [a._accountId,b._accountId]);
    budr.resetBUDROverride(key);
    assert.ok(budr.budrAssessments.every(r => !r.overridden && r.profile.rto !== 'manual target'));
  });
  it('ignores ambiguous BUDR legacy names but preserves unique legacy edits', () => {
    const a = database(), b = database('222222222222');
    budr.setBudrOverrides({ 'shared-db': { rto: 'legacy target' } });
    budr.runBUDRChecks({ rdsInstances: [a,b] });
    assert.ok(budr.budrAssessments.every(r => !r.overridden));
    budr.runBUDRChecks({ rdsInstances: [a] });
    assert.equal(budr.budrAssessments[0].profile.rto, 'legacy target');
    budr.resetBUDROverride(budr.budrAssessments[0].overrideKey);
    assert.equal(budr.budrAssessments[0].overridden, false);
  });
  it('joins classification and BUDR by scope rather than duplicate name', () => {
    const a = database(), b = database('222222222222');
    governance.setClassificationOverrides({ [utils.resourceOverrideKey(a, 'RDS', a.DBInstanceIdentifier)]: 'low' });
    budr.runBUDRChecks({ rdsInstances: [a,b] });
    assert.deepEqual(budr.budrAssessments.map(r => r.classTier), ['low','critical']);
  });
});

function flowContext(crossVpc = false) {
  const source = { InstanceId:'i-a',SubnetId:'subnet-a',VpcId:'vpc-a',PrivateIpAddress:'10.0.1.10',SecurityGroups:[{GroupId:'sg-a'}] };
  const target = { InstanceId:'i-b',SubnetId:'subnet-b',VpcId:crossVpc?'vpc-b':'vpc-a',PrivateIpAddress:crossVpc?'10.1.2.20':'10.0.2.20',SecurityGroups:[{GroupId:'sg-a'}] };
  const permission = {IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]};
  return {instances:[source,target],instBySub:{'subnet-a':[source],'subnet-b':[target]},
    subnets:[{SubnetId:'subnet-a',VpcId:'vpc-a',CidrBlock:'10.0.1.0/24'},{SubnetId:'subnet-b',VpcId:target.VpcId,CidrBlock:crossVpc?'10.1.2.0/24':'10.0.2.0/24'}],
    sgs:[{GroupId:'sg-a',GroupName:'all',IpPermissions:[permission],IpPermissionsEgress:[permission]}],
    subRT:{'subnet-a':{Routes:[crossVpc?{DestinationCidrBlock:'10.1.0.0/16',TransitGatewayId:'tgw-a',State:'active'}:{DestinationCidrBlock:'10.0.0.0/16',GatewayId:'local',State:'active'}]},
      'subnet-b':{Routes:[crossVpc?{DestinationCidrBlock:'10.0.0.0/16',TransitGatewayId:'tgw-a',State:'active'}:{DestinationCidrBlock:'10.0.0.0/16',GatewayId:'local',State:'active'}]}},
    subNacl:{}, tgwAttachments:crossVpc?[{ResourceId:'vpc-a',TransitGatewayId:'tgw-a',State:'available'},{ResourceId:'vpc-b',TransitGatewayId:'tgw-a',State:'available'}]:[]};
}
const sourceRef = {type:'instance',id:'i-a'}, targetRef = {type:'instance',id:'i-b'};
function acl(egress, from, to, protocol = '6') {
  return {RuleNumber:100,Egress:egress,Protocol:protocol,RuleAction:'allow',CidrBlock:'0.0.0.0/0',PortRange:{From:from,To:to}};
}
function responseAcls(context, sourcePorts = [50000,50000], targetPorts = [50000,50000]) {
  context.subNacl = {
    'subnet-a':{Entries:[acl(true,443,443),acl(false,...sourcePorts)]},
    'subnet-b':{Entries:[acl(false,443,443),acl(true,...targetPorts)]}
  };
  return context;
}

const inlineSource = fs.readFileSync(new URL('../../src/app-core.js', import.meta.url), 'utf8');
const functionStart = inlineSource.indexOf('function traceFlow(');
const nextFunction = /\r?\nfunction\s/.exec(inlineSource.slice(functionStart + 1));
const activeFunction = inlineSource.slice(functionStart, functionStart + 1 + nextFunction.index);
const sandbox = {window:{AppModules:{FlowTracing:tracing}},evaluateRouteTable:rules.evaluateRouteTable,
  evaluateSG:rules.evaluateSG,evaluateNACL:rules.evaluateNACL,_resolveNetworkPosition:tracing.resolveNetworkPosition};
vm.createContext(sandbox);
vm.runInContext(activeFunction,sandbox);

for (const [name,trace] of [['canonical module',tracing.traceFlow],['active inline caller',sandbox.traceFlow]]) {
  describe(`return ACL and TGW checks: ${name}`, () => {
    const config = {protocol:'tcp',port:443,sourcePort:50000};
    it('blocks response traffic denied at either subnet', () => {
      for (const subnet of ['subnet-a','subnet-b']) {
        const context = responseAcls(flowContext());
        context.subNacl[subnet].Entries[1].RuleAction = 'deny';
        assert.match(trace(sourceRef,targetRef,config,context).blocked.reason,/response traffic/);
      }
    });
    it('allows a common explicit/default response port and blocks disjoint ranges', () => {
      assert.equal(trace(sourceRef,targetRef,config,responseAcls(flowContext())).blocked,null);
      assert.equal(trace(sourceRef,targetRef,{protocol:'tcp',port:443},responseAcls(flowContext())).blocked,null);
      const disjoint = responseAcls(flowContext(),[40000,41000],[50000,51000]);
      assert.ok(trace(sourceRef,targetRef,{protocol:'tcp',port:443},disjoint).blocked);
    });
    it('applies response checks across VPCs while preserving same-subnet behavior', () => {
      const context = responseAcls(flowContext(true));
      context.subNacl['subnet-b'].Entries[1].RuleAction = 'deny';
      assert.match(trace(sourceRef,targetRef,config,context).blocked.reason,/response traffic/);
      const sameSubnet = flowContext();
      sameSubnet.instances[1].SubnetId = 'subnet-a';
      sameSubnet.instBySub = {'subnet-a':sameSubnet.instances};
      sameSubnet.subNacl = {'subnet-a':{Entries:[]}};
      assert.equal(trace(sourceRef,targetRef,config,sameSubnet).blocked,null);
    });
    it('requires both available attachments to the route-selected TGW', () => {
      const context = flowContext(true);
      assert.equal(trace(sourceRef,targetRef,config,context).blocked,null);
      for (const attachments of [[context.tgwAttachments[0]],[context.tgwAttachments[1]],
        [context.tgwAttachments[0],{...context.tgwAttachments[1],TransitGatewayId:'tgw-other'}],
        [context.tgwAttachments[0],{...context.tgwAttachments[1],State:'deleted'}]]) {
        assert.ok(trace(sourceRef,targetRef,config,{...context,tgwAttachments:attachments}).blocked);
      }
    });
    it('retains SG denial and evaluates ICMP echo response type separately', () => {
      const denied = flowContext();
      denied.sgs[0].IpPermissions = [];
      assert.match(trace(sourceRef,targetRef,config,denied).blocked.reason,/security group/);
      const icmp = flowContext();
      const entry = (egress,type) => ({RuleNumber:100,Egress:egress,Protocol:'1',RuleAction:'allow',CidrBlock:'0.0.0.0/0',IcmpTypeCode:{Type:type,Code:0}});
      icmp.subNacl = {'subnet-a':{Entries:[entry(true,8),entry(false,0)]},'subnet-b':{Entries:[entry(false,8),entry(true,0)]}};
      assert.equal(trace(sourceRef,targetRef,{protocol:'icmp',port:8},icmp).blocked,null);
      icmp.subNacl['subnet-b'].Entries[1].IcmpTypeCode.Type = 3;
      assert.match(trace(sourceRef,targetRef,{protocol:'icmp',port:8},icmp).blocked.reason,/response traffic/);
    });
  });
}
