import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window=globalThis;
globalThis.document={getElementById:()=>null};
const live=await import('../../src/exports/exports-iac.js');
const legacy=await import('../../src/modules/iac-generator.js');
function context(){
  return {
    vpcs:[{VpcId:'vpc-a',CidrBlock:'10.0.0.0/16'},{VpcId:'vpc-b',CidrBlock:'10.1.0.0/16'}],
    sgs:[{GroupId:'sg-a',VpcId:'vpc-a'},{GroupId:'sg-b',VpcId:'vpc-b'}],
    ecacheClusters:[
      {CacheClusterId:'selected-cache',CacheSubnetGroupName:'cache-a',SecurityGroups:[{SecurityGroupId:'sg-a'}]},
      {CacheClusterId:'foreign-cache',CacheSubnetGroupName:'cache-b',SecurityGroups:[{SecurityGroupId:'sg-b'}]},
      {CacheClusterId:'unknown-cache',CacheSubnetGroupName:'unknown'},
      {CacheClusterId:'tagged-cache',CacheSubnetGroupName:'tagged',_vpcId:'vpc-a'},
      {CacheClusterId:'explicit-foreign',CacheSubnetGroupName:'cache-b',VpcId:'vpc-b',SecurityGroups:[{SecurityGroupId:'sg-a'}]}
    ],
    redshiftClusters:[
      {ClusterIdentifier:'selected-warehouse',ClusterSubnetGroupName:'redshift-a',VpcId:'vpc-a'},
      {ClusterIdentifier:'foreign-warehouse',ClusterSubnetGroupName:'redshift-b',VpcId:'vpc-b'}
    ]
  };
}
it('keeps the production UI generator scoped to the selected VPC',()=>{
  const env={window:{}};
  vm.createContext(env);
  vm.runInContext(fs.readFileSync('dist/core.bundle.js','utf8'),env);
  const {code}=env.window._core.generateTerraform(context(),{mode:'import',scopeVpcId:'vpc-a'});
  assert.match(code,/selected-cache/);
  assert.doesNotMatch(code,/foreign-cache|foreign-warehouse|unknown-cache/);
});
for(const [name,api] of [['live',live],['legacy',legacy]]){
  describe(name+' Terraform cluster scope',()=>{
    it('limits resource blocks and import IDs to selected VPC membership',()=>{
      const ctx=context(),original=structuredClone(ctx);
      const {code}=api.generateTerraform(ctx,{mode:'import',scopeVpcId:'vpc-a'});
      assert.match(code,/cluster_id\s+= "selected-cache"/);
      assert.match(code,/cluster_id\s+= "tagged-cache"/);
      assert.match(code,/cluster_identifier\s+= "selected-warehouse"/);
      assert.match(code,/id = "selected-cache"/);
      assert.doesNotMatch(code,/foreign-cache|foreign-warehouse|explicit-foreign|unknown-cache/);
      assert.deepEqual(ctx,original);
    });
    it('keeps all clusters in the unscoped export, including unknown affiliation',()=>{
      const {code}=api.generateTerraform(context(),{mode:'import'});
      for(const id of ['selected-cache','foreign-cache','unknown-cache','selected-warehouse','foreign-warehouse']){
        assert.ok(code.includes(id),id);
      }
    });
    it('resolves legacy Redshift membership through its VPC security groups',()=>{
      const ctx=context();
      ctx.redshiftClusters=[{ClusterIdentifier:'sg-warehouse',ClusterSubnetGroupName:'group-a',VpcSecurityGroups:[{VpcSecurityGroupId:'sg-a'}]}];
      assert.match(api.generateTerraform(ctx,{mode:'create',scopeVpcId:'vpc-a'}).code,/sg-warehouse/);
      assert.doesNotMatch(api.generateTerraform(ctx,{mode:'create',scopeVpcId:'vpc-b'}).code,/sg-warehouse/);
    });
  });
}
