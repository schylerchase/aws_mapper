import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { resourceOverrideKey } from '../../src/modules/utils.js';

const A='111111111111',B='222222222222';
const contexts=[{accountId:A,accountLabel:'Account A'},{accountId:B,accountLabel:'Account B'}];
const row=(account,region,type,id)=>({account,region,type,id,profile:{tier:'protected'},overrideKey:resourceOverrideKey({_accountId:account,_region:region},type,id)});
const source=fs.readFileSync(new URL('../../src/app-core.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function _budrScopeIdentity('),source.indexOf('function openBUDRDash('));
function env(rows){
  const state={resourceOverrideKey,_loadedContexts:contexts,_budrAssessments:rows,_budrFindings:[],_budrOverrides:{},_udashAcctFilter:A};
  state._udashFilterByAccount=items=>state._udashAcctFilter==='all'?items:items.filter(r=>(r._accountId||r.account)===state._udashAcctFilter);
  vm.createContext(state);vm.runInContext(helpers,state);return state;
}

test('BUDR cards use declared account, region and type and reject ambiguous legacy findings',()=>{
  const rows=[row(A,'us-east-1','RDS','shared'),row(A,'us-west-2','RDS','shared'),row(B,'us-west-2','RDS','shared'),row(A,'us-east-1','ECS','shared'),row('Account A','us-east-1','EC2','unique')];
  const state=env(rows);
  const finding={resource:'shared',resourceType:'RDS',_accountId:A,_region:'us-east-1'};
  assert.deepEqual(rows.map(a=>state._budrFindingMatchesAssessment(finding,a)),[true,false,false,false,false]);
  assert.ok(rows.every(a=>!state._budrFindingMatchesAssessment({resource:'shared'},a)));
  assert.equal(state._budrFindingMatchesAssessment({resource:'unique'},rows[4]),true);
  assert.equal(state._budrFindingMatchesAssessment({resource:'unique',_accountId:A,_region:'us-east-1',resourceType:'EC2'},rows[4]),true);
});

test('scoped BUDR exports omit foreign and ambiguous overrides while preserving all-account output',()=>{
  const rows=[row(A,'us-east-1','RDS','shared'),row(B,'us-west-2','RDS','shared'),row(A,'us-east-1','EC2','unique')];
  const state=env(rows);
  state._budrOverrides={[rows[0].overrideKey]:{rto:'A'},[rows[1].overrideKey]:{rto:'B'},shared:{rto:'ambiguous'},unique:{rto:'legacy'}};
  state._budrFindings=[{resource:'shared',_accountId:A,_region:'us-east-1'},{resource:'shared',_accountId:B,_region:'us-west-2'},{resource:'shared'}];
  const scoped=state._budrExportData();
  assert.equal(scoped.assessments.length,2);assert.equal(scoped.summary.protected,2);
  assert.equal(scoped.findings.length,1);assert.equal(scoped.findings[0]._accountId,A);
  assert.deepEqual(Object.keys(scoped.overrides).sort(),[rows[0].overrideKey,'unique'].sort());
  state._udashAcctFilter='all';const all=state._budrExportData();
  assert.equal(all.assessments.length,3);assert.equal(all.summary.protected,3);
  assert.equal(all.findings.length,3);assert.equal(Object.keys(all.overrides).length,4);
});

test('application report scope filters matched resources and omits foreign-only apps',async()=>{
  let selected=A;
  globalThis.localStorage={getItem:()=>null,setItem(){}};
  globalThis.document={getElementById:()=>({value:selected})};
  const a={name:'A_RESOURCE',_accountId:A},b={name:'B_RESOURCE',_accountId:B};
  globalThis.window={_loadedContexts:contexts,_appRegistry:[{name:'A_APP'},{name:'B_APP'},{name:'SHARED_APP'},{name:'EMPTY_APP'}],_matchAppResources:app=>app.name==='A_APP'?[a]:app.name==='B_APP'?[b]:app.name==='SHARED_APP'?[a,b]:[]};
  const {_rptScopedAppRows}=await import('../../src/modules/report-html.js');
  const scoped=_rptScopedAppRows();
  assert.deepEqual(scoped.map(r=>r.app.name),['A_APP','SHARED_APP']);
  assert.ok(scoped.every(r=>r.matched.length===1&&r.matched[0]._accountId===A));
  selected='all';const all=_rptScopedAppRows();
  assert.deepEqual(all.map(r=>r.app.name),['A_APP','B_APP','SHARED_APP','EMPTY_APP']);
  assert.equal(all.find(r=>r.app.name==='SHARED_APP').matched.length,2);
});
