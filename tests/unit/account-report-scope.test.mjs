import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { describe, it } from 'node:test';

const A='111111111111',B='222222222222';
const account=(id)=>({_accountId:id,_region:id===A?'us-east-1':'us-west-2'});
function context(){
  const rows=(factory)=>[A,B].map(id=>({...account(id),...factory(id)}));
  return {
    _regions:new Set(['us-east-1','us-west-2']),
    vpcs:rows(id=>({VpcId:'vpc-'+id,CidrBlock:'10.0.0.0/16'})),
    instances:rows(id=>({InstanceId:'i-'+id})),
    peerings:rows(id=>({VpcPeeringConnectionId:'pcx-'+id})),
    zones:rows(id=>({Id:'Z-'+id,Name:'dns-'+id+'.example.'})),
    wafAcls:rows(id=>({Id:'waf-'+id,Name:'waf-'+id})),
    cfDistributions:rows(id=>({Id:'CF-'+id,DomainName:'cdn-'+id+'.example.'})),
    vpns:rows(id=>({VpnConnectionId:'vpn-'+id})),
    tgwAttachments:rows(id=>({TransitGatewayAttachmentId:'tgw-'+id})),
    tgs:rows(id=>({TargetGroupName:'tg-'+id,Protocol:'HTTPS',Port:443})),
    flowLogs:[{...account(A),ResourceId:'vpc-'+A}],
    logGroups:rows(id=>({logGroupName:'log-'+id,retentionInDays:id===B?30:undefined}))
  };
}
function sandbox(selected){
  const env={console,Date,Blob,ArrayBuffer,Set,setTimeout,atob,btoa,
    document:{getElementById:id=>id==='rptAccountFilter'?{value:selected}:null},
    _rlCtx:context(),_loadedContexts:[{accountId:A},{accountId:B}],
    _complianceFindings:[],_budrAssessments:[],_iamReviewData:[],_inventoryData:[],
    _rptState:{title:'Account Report',author:'',date:'2026-10-10',logo:null},
    _rptEnabledModules:()=>['inventory'],_RPT_MODULES:[{id:'exec-summary',name:'Executive Summary'}],
    _rptGetAccountFilter:()=>selected,
    _rptFilterByAccount:(rows,id)=>!id||id==='all'?rows:rows.filter(row=>row._accountId===id),
    _rptAccountLabel:id=>id||'',_rptTagName:r=>r.Name||'',_awsConsoleUrl:()=>'',
    _rptSlugify:()=>'',_showToast(){},downloadBlob(blob){env.download=blob}
  };
  env.window=env;
  vm.createContext(env);
  return env;
}
describe('selected-account report scope',()=>{
  for(const selected of [A,B,'all']){
    it('serializes only '+selected+' inventory and overview in the public XLSX exporter',async()=>{
      const env=sandbox(selected),before=structuredClone(env._rlCtx);
      vm.runInContext(fs.readFileSync('libs/xlsx.bundle.min.js','utf8'),env);
      vm.runInContext(fs.readFileSync('src/exports/exports-xlsx.js','utf8').replace(/export\s+(?=(?:async\s+)?function)/g,''),env);
      vm.runInContext('_sheetJSLoaded=true; XLSX.write=(wb)=>{inventory=XLSX.utils.sheet_to_json(wb.Sheets.Inventory);summary=XLSX.utils.sheet_to_json(wb.Sheets.Summary,{header:1});return new ArrayBuffer(0)};_xlsxPostProcess=async()=>({})',env);
      await vm.runInContext('generateXlsx()',env);
      assert.ok(env.download,'public exporter completed');
      assert.equal(env.inventory.length,selected==='all'?18:9);
      assert.ok(env.inventory.every(row=>selected==='all'||row.Account===selected));
      assert.equal(env.summary.find(row=>row[0]==='VPCs')[1],selected==='all'?2:1);
      const region=env.summary.find(row=>row[0]==='Regions')[1];
      assert.equal(region,selected==='all'?'us-east-1, us-west-2':selected===A?'us-east-1':'us-west-2');
      assert.deepEqual(env._rlCtx,before);
    });
  }
  it('scopes the live HTML posture and executive overview before computing coverage',async()=>{
    const env=sandbox(A);
    globalThis.window=env;
    globalThis.document=env.document;
    globalThis.localStorage={getItem:()=>null,setItem(){}};
    const report=await import('../../src/modules/report-html.js');
    const selected=report._rptSecurityPosture(env._rlCtx,{});
    const flow=selected.match(/<tr><td>VPC Flow Logs<\/td>[\s\S]*?<\/tr>/)[0];
    const logs=selected.match(/<tr><td>Log Groups<\/td>[\s\S]*?<\/tr>/)[0];
    assert.match(flow,/PASS/);
    assert.match(flow,/1 of 1 VPCs/);
    assert.match(logs,/FAIL/);
    assert.match(logs,/0 of 1 with retention/);
    const overview=report._rptExecSummary(env._rlCtx,{});
    assert.match(overview,/<span class="val">1<\/span><span class="lbl">VPCs/);
    env.document.getElementById=()=>({value:'all'});
    const all=report._rptSecurityPosture(env._rlCtx,{});
    assert.match(all,/1 of 2 VPCs/);
    assert.match(all,/1 of 2 with retention/);
  });
  it('scopes public executive DOCX counts and region narrative without changing source data',async()=>{
    for(const selected of [A,'all']){
      const env=sandbox(selected),before=structuredClone(env._rlCtx);
      env._rptEnabledModules=()=>['exec-summary'];
      env.JSZip=class{
        file(name,value){if(name==='word/document.xml')env.xml=value;return this}
        async generateAsync(){return env.xml}
      };
      vm.runInContext(fs.readFileSync('src/exports/exports-docx.js','utf8').replace('export async function','async function'),env);
      await vm.runInContext("generateDocx('executive')",env);
      assert.ok(env.download,'public DOCX exporter completed');
      assert.match(env.download,selected==='all'?/2 region\(s\) with 2 VPC\(s\) hosting 2 compute/:/1 region\(s\) with 1 VPC\(s\) hosting 1 compute/);
      assert.deepEqual(env._rlCtx,before);
    }
  });
});
it('scopes reports generated by the production web bundles',async()=>{
  const env=sandbox(A);
  env.location={hostname:'localhost'};
  env.navigator={userAgent:'offline-test'};
  env.localStorage={getItem:()=>null,setItem(){}};
  env.structuredClone=structuredClone;
  env.clearTimeout=clearTimeout;
  env.addEventListener=()=>{};
  Object.assign(env.document,{querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},
    documentElement:{style:{setProperty(){}}},createElement:()=>({}),head:{appendChild:script=>script.onload()}});
  vm.runInContext(fs.readFileSync('dist/app.bundle.js','utf8'),env);
  env.downloadBlob=blob=>{env.download=blob};
  env._rlCtx=context();env._loadedContexts=[{accountId:A},{accountId:B}];
  const posture=env._rptSecurityPosture(env._rlCtx,{});
  assert.match(posture,/1 of 1 VPCs/);
  assert.match(posture,/0 of 1 with retention/);
  env.JSZip=class{
    file(name,value){if(name==='word/document.xml')env.xml=value;return this}
    async generateAsync(){return env.xml}
    static async loadAsync(){return {file:()=>null,generateAsync:async()=>({})}}
  };
  vm.runInContext(fs.readFileSync('libs/xlsx.bundle.min.js','utf8'),env);
  vm.runInContext(fs.readFileSync('dist/core.bundle.js','utf8'),env);
  env.XLSX.write=wb=>{env.inventory=env.XLSX.utils.sheet_to_json(wb.Sheets.Inventory);return new ArrayBuffer(0)};
  await env._core.generateXlsx();
  assert.equal(env.inventory.length,9);
  assert.ok(env.inventory.every(row=>row.Account===A));
  env._rptEnabledModules=()=>['exec-summary'];
  await env._core.generateDocx('executive');
  assert.match(env.download,/1 region\(s\) with 1 VPC\(s\) hosting 1 compute/);
});
