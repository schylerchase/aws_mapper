import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = {};
globalThis.document = { getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const iam = await import('../../src/modules/iam-engine.js');
const governance = await import('../../src/modules/governance.js');
const tracing = await import('../../src/modules/flow-tracing.js');
const multiAccount = await import('../../src/modules/multi-account.js');
const utils = await import('../../src/modules/utils.js');

const ownArn = 'arn:aws:iam::111111111111:role/MfaRequired';
const rootA = 'arn:aws:iam::222222222222:root';
const rootB = 'arn:aws:iam::333333333333:root';
const allowTrust = () => ({ Effect:'Allow', Principal:{AWS:rootA}, Action:'sts:AssumeRole',
  Condition:{StringEquals:{'sts:ExternalId':'integration'}} });
const denyMfa = () => ({ Effect:'Deny', Principal:'*', Action:'sts:AssumeRole',
  Condition:{BoolIfExists:{'aws:MultiFactorAuthPresent':'false'}} });
function mfaFindings(statements) {
  const data = iam.parseIAMData({RoleDetailList:[{RoleName:'MfaRequired',Arn:ownArn,
    AssumeRolePolicyDocument:{Statement:statements}}]});
  return iam.runIAMChecks(data).filter(f => f.control === 'IAM-3');
}

describe('R2-02 applicable explicit MFA Deny', () => {
  it('recognizes the recommended Deny for string and Boolean false', () => {
    assert.equal(mfaFindings([allowTrust(),denyMfa()]).length,0);
    const deny = denyMfa();
    deny.Condition.BoolIfExists['aws:MultiFactorAuthPresent'] = false;
    deny.Action = 'sts:*';
    assert.equal(mfaFindings([allowTrust(),deny]).length,0);
  });
  it('retains findings for unguarded or MFA-false Allow statements', () => {
    assert.equal(mfaFindings([allowTrust()]).length,1);
    const allow = allowTrust();
    allow.Condition.Bool = {'aws:MultiFactorAuthPresent':'false'};
    assert.equal(mfaFindings([allow]).length,1);
  });
  it('ignores Deny statements for another principal, action or role', () => {
    const wrongPrincipal = {...denyMfa(),Principal:{AWS:rootB}};
    const wrongAction = {...denyMfa(),Action:'sts:TagSession'};
    const wrongRole = {...denyMfa(),Resource:'arn:aws:iam::111111111111:role/Other'};
    for (const deny of [wrongPrincipal,wrongAction,wrongRole])
      assert.equal(mfaFindings([allowTrust(),deny]).length,1);
  });
  it('does not let narrower Deny conditions hide exposure', () => {
    const deny = denyMfa();
    deny.Condition.StringEquals = {'aws:SourceVpc':'vpc-only-one'};
    assert.equal(mfaFindings([allowTrust(),deny]).length,1);
    deny.Condition.StringEquals = {'sts:ExternalId':'other'};
    assert.equal(mfaFindings([allowTrust(),deny]).length,1);
  });
  it('accepts extra Deny conditions guaranteed by the applicable Allow', () => {
    const deny = denyMfa();
    deny.Condition.StringEquals = {'sts:ExternalId':'integration'};
    deny.Principal = {AWS:rootA};
    deny.Resource = ownArn;
    assert.equal(mfaFindings([allowTrust(),deny]).length,0);
  });
  it('requires every cross-account principal to be protected', () => {
    const allow = {...allowTrust(),Principal:{AWS:[rootA,rootB]}};
    const denyA = {...denyMfa(),Principal:{AWS:rootA}};
    const denyB = {...denyMfa(),Principal:{AWS:rootB}};
    assert.equal(mfaFindings([allow,denyA]).length,1);
    assert.equal(mfaFindings([allow,denyA,denyB]).length,0);
  });
  it('does not count Bool-false Deny as guarding absent MFA, and preserves strict Allows', () => {
    const deny = {...denyMfa(),Condition:{Bool:{'aws:MultiFactorAuthPresent':'false'}}};
    assert.equal(mfaFindings([allowTrust(),deny]).length,1);
    const allow = {...allowTrust(),Condition:{Bool:{'aws:MultiFactorAuthPresent':['true']}}};
    assert.equal(mfaFindings([allow]).length,0);
  });
});

describe('R2-08 prototype-named user tag keys', () => {
  it('discovers each key without inheriting metadata or mutating Object.prototype', () => {
    const hadCount = Object.prototype.hasOwnProperty.call(Object.prototype,'count');
    const oldCount = Object.prototype.count;
    for (const key of ['Owner','constructor','__proto__','toString']) {
      const tags = governance._discoverTagKeys({instances:[{InstanceId:'i-safe',Tags:[{Key:key,Value:'team'}]}]});
      assert.equal(tags[key].count,1);
      assert.deepEqual(tags[key].samples,['team']);
      assert.deepEqual(tags[key].types,['EC2']);
    }
    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype,'count'),hadCount);
    assert.equal(Object.prototype.count,oldCount);
  });
  it('preserves prototype-named tag values for classification rules', () => {
    const resource = {InstanceId:'i-safe',Tags:[{Key:'__proto__',Value:'team'}]};
    const tags = governance._getTagMap(resource);
    assert.equal(tags.__proto__,'team');
    const result = governance._scoreClassification('i-safe','instance','',
      [{pattern:'^team$',scope:'tag:__proto__',weight:10,tier:'high'}],tags);
    assert.equal(result.tier,'high');
    governance.setClassificationOverrides({});
    assert.doesNotThrow(() => governance.runClassificationEngine({instances:[resource]}));
  });
});

function dataInput() {
  const permission = {IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]};
  return {
    in_vpcs:{Vpcs:[{VpcId:'vpc-a',OwnerId:'111111111111'},{VpcId:'vpc-b',OwnerId:'111111111111'}]},
    in_subnets:{Subnets:[{SubnetId:'subnet-a',VpcId:'vpc-a',CidrBlock:'10.0.1.0/24',AvailabilityZone:'us-east-1a'},
      {SubnetId:'subnet-b',VpcId:'vpc-b',CidrBlock:'10.1.2.0/24',AvailabilityZone:'us-east-1a'}]},
    in_ec2:{Reservations:[{Instances:[{InstanceId:'i-a',VpcId:'vpc-a',SubnetId:'subnet-a',PrivateIpAddress:'10.0.1.10',SecurityGroups:[{GroupId:'sg-all'}]},
      {InstanceId:'i-b',VpcId:'vpc-b',SubnetId:'subnet-b',PrivateIpAddress:'10.1.2.20',SecurityGroups:[{GroupId:'sg-all'}]}]}]},
    in_sgs:{SecurityGroups:[{GroupId:'sg-all',GroupName:'all',IpPermissions:[permission],IpPermissionsEgress:[permission]}]},
    in_rts:{RouteTables:[{RouteTableId:'rtb-a',VpcId:'vpc-a',Associations:[{SubnetId:'subnet-a'}],Routes:[{DestinationCidrBlock:'10.1.0.0/16',TransitGatewayId:'tgw-a',State:'active'}]},
      {RouteTableId:'rtb-b',VpcId:'vpc-b',Associations:[{SubnetId:'subnet-b'}],Routes:[{DestinationCidrBlock:'10.0.0.0/16',TransitGatewayId:'tgw-a',State:'active'}]}]},
    in_tgwatt:{TransitGatewayAttachments:[{TransitGatewayAttachmentId:'tgw-attach-a',ResourceId:'vpc-a',TransitGatewayId:'tgw-a',State:'available'},
      {TransitGatewayAttachmentId:'tgw-attach-b',ResourceId:'vpc-b',TransitGatewayId:'tgw-a',State:'available'}]}
  };
}
const inlineSource = fs.readFileSync(new URL('../../src/app-core.js',import.meta.url),'utf8');
function inlineFunction(name) {
  const start = inlineSource.indexOf('function '+name+'(');
  const next = /\r?\nfunction\s/.exec(inlineSource.slice(start+1));
  return inlineSource.slice(start,start+1+next.index);
}
const sandbox = {console,safeParse:utils.safeParse,ext:utils.ext,
  detectAccountId:r => r.OwnerId || '111111111111',detectRegion:r => r.AvailabilityZone?.replace(/[a-z]$/,'') || 'us-east-1',
  window:{AppModules:{FlowTracing:tracing}}};
vm.createContext(sandbox);
vm.runInContext(inlineFunction('_buildRlCtxFromData')+'\n'+inlineFunction('traceFlow'),sandbox);

for (const [name,build,trace] of [['canonical modules',input => multiAccount.buildRlCtxFromData(input,'111111111111'),tracing.traceFlow],
  ['active builder and flow caller',input => sandbox._buildRlCtxFromData(input,'111111111111'),sandbox.traceFlow]]) {
  describe(`R2-03/04 actual TGW and return connectivity: ${name}`, () => {
    const src = {type:'instance',id:'i-a'}, dst = {type:'instance',id:'i-b'}, config = {protocol:'tcp',port:443,sourcePort:50000};
    it('allows both real attachments and both route directions', () => {
      assert.equal(trace(src,dst,config,build(dataInput())).blocked,null);
    });
    it('rejects route pseudo-records when real target attachment is deleted or absent', () => {
      for (const deleted of [true,false]) {
        const input = dataInput();
        if (deleted) input.in_tgwatt.TransitGatewayAttachments[1].State = 'deleted';
        else input.in_tgwatt.TransitGatewayAttachments.pop();
        input.in_rts.RouteTables[1].Routes[0].State = 'blackhole';
        const context = build(input);
        assert.ok(context.tgwAttachments.some(a => a._routeDerived && a.VpcId === 'vpc-b'));
        assert.match(trace(src,dst,config,context).blocked.reason,/No connectivity/);
      }
    });
    it('preserves native VpcId-shaped attachment records with explicit identity/status', () => {
      const input = dataInput(), attachment = input.in_tgwatt.TransitGatewayAttachments[1];
      attachment.VpcId = attachment.ResourceId;
      delete attachment.ResourceId;
      assert.equal(trace(src,dst,config,build(input)).blocked,null);
      delete attachment.TransitGatewayAttachmentId;
      assert.ok(trace(src,dst,config,build(input)).blocked);
    });
    it('rejects unknown status and pseudo provenance even with matching IDs', () => {
      const input = dataInput();
      delete input.in_tgwatt.TransitGatewayAttachments[1].State;
      assert.ok(trace(src,dst,config,build(input)).blocked);
      const context = build(dataInput());
      context.tgwAttachments.find(a => a.ResourceId === 'vpc-b')._routeDerived = true;
      assert.ok(trace(src,dst,config,context).blocked);
    });
    it('blocks missing, blackholed and disconnected return routes', () => {
      for (const route of [{DestinationCidrBlock:'10.1.0.0/16',GatewayId:'local',State:'active'},
        {DestinationCidrBlock:'10.0.0.0/16',TransitGatewayId:'tgw-a',State:'blackhole'},
        {DestinationCidrBlock:'10.0.0.0/16',TransitGatewayId:'tgw-other',State:'active'}]) {
        const input = dataInput();
        input.in_rts.RouteTables[1].Routes = [route];
        assert.match(trace(src,dst,config,build(input)).blocked.reason,/return route/);
      }
    });
    it('retains valid peering forward and return paths', () => {
      const input = dataInput();
      for (const table of input.in_rts.RouteTables) {
        delete table.Routes[0].TransitGatewayId;
        table.Routes[0].VpcPeeringConnectionId = 'pcx-a';
      }
      input.in_peer = {VpcPeeringConnections:[{VpcPeeringConnectionId:'pcx-a',Status:{Code:'active'},
        RequesterVpcInfo:{VpcId:'vpc-a'},AccepterVpcInfo:{VpcId:'vpc-b'}}]};
      assert.equal(trace(src,dst,config,build(input)).blocked,null);
    });
    it('uses an inherited main route table but gives explicit private association precedence', () => {
      const input = dataInput();
      input.in_rts.RouteTables = [{RouteTableId:'rtb-main',VpcId:'vpc-a',Associations:[{Main:true}],
        Routes:[{DestinationCidrBlock:'10.0.0.0/16',GatewayId:'local',State:'active'},{DestinationCidrBlock:'0.0.0.0/0',GatewayId:'igw-a',State:'active'}]}];
      const publicContext = build(input);
      assert.equal(publicContext.subRT['subnet-a'].RouteTableId,'rtb-main');
      assert.equal(publicContext.pubSubs.has('subnet-a'),true);
      input.in_rts.RouteTables.push({RouteTableId:'rtb-private',VpcId:'vpc-a',Associations:[{SubnetId:'subnet-a'}],
        Routes:[{DestinationCidrBlock:'10.0.0.0/16',GatewayId:'local',State:'active'}]});
      const privateContext = build(input);
      assert.equal(privateContext.subRT['subnet-a'].RouteTableId,'rtb-private');
      assert.equal(privateContext.pubSubs.has('subnet-a'),false);
    });
  });
}
