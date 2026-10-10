import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window=globalThis;
globalThis.localStorage={getItem:()=>null,setItem(){}};
const {aggregateTopResources,buildComplianceView}=await import('../../src/modules/compliance-view.js');
describe('compliance summary resource names',()=>{
  for(const name of ['__proto__','constructor','toString','hasOwnProperty']){
    it('treats '+name+' as a normal resource in the live summary view',()=>{
      const findings=[{resource:name,resourceName:name,severity:'HIGH',framework:'CIS',control:'CIS-2.1'},
        {resource:name,resourceName:name,severity:'LOW',framework:'CIS',control:'CIS-2.2'}];
      const before=Object.getOwnPropertyDescriptors(Object.prototype);
      const view=buildComplianceView({findings,includeMuted:false});
      const rows=aggregateTopResources(view.base,8);
      assert.equal(rows.length,1);
      assert.equal(rows[0][0],name);
      assert.equal(rows[0][1].count,2);
      assert.equal(rows[0][1].worst,'HIGH');
      assert.deepEqual(rows[0][1].sevs,{HIGH:1,LOW:1});
      assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype),before);
    });
  }
  it('preserves ranking, limits and empty-resource exclusions',()=>{
    const rows=aggregateTopResources([
      {resource:'low',severity:'LOW'},{resource:'high',severity:'HIGH'},
      {resource:'high',severity:'LOW'},{resource:'critical',severity:'CRITICAL'},
      {resource:'Multiple',severity:'CRITICAL'},{resource:'',severity:'CRITICAL'}
    ],2);
    assert.deepEqual(rows.map(([name])=>name),['critical','high']);
    assert.deepEqual(aggregateTopResources([],8),[]);
  });
});
it('runs the fixed live view and aggregation in the production app bundle',()=>{
  const env={console,structuredClone,setTimeout,clearTimeout,location:{hostname:'localhost'},
    localStorage:{getItem:()=>null,setItem(){}},navigator:{userAgent:'offline-test'},
    document:{getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null,
      addEventListener(){},documentElement:{style:{setProperty(){}}}}};
  env.window=env;env.addEventListener=()=>{};
  vm.createContext(env);
  vm.runInContext(fs.readFileSync('dist/app.bundle.js','utf8'),env);
  const view=env._buildComplianceView({findings:[{resource:'__proto__',severity:'HIGH',framework:'CIS',control:'CIS-2.1'}]});
  const rows=env._aggregateTopResources(view.base,8);
  assert.equal(rows[0][0],'__proto__');
  assert.equal(rows[0][1].count,1);
});
