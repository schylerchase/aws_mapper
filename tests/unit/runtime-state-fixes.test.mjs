import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const tempParent=path.resolve(process.env.TEMP||os.tmpdir());
const createTemp=()=>fs.mkdtempSync(path.join(tempParent,'aws-runtime-state-'));
async function cleanup(dir) {
  assert.ok(path.relative(tempParent,dir) && !path.relative(tempParent,dir).startsWith('..'));
  // Windows may release watcher/service handles shortly after child.close.
  await fs.promises.rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:100});
}
async function waitFor(check) {
  const deadline=Date.now()+10000;
  while(Date.now()<deadline) { if(check()) return; await new Promise(resolve=>setTimeout(resolve,100)); }
  assert.fail('Timed out waiting for watch rebuild');
}

test('watch rebuilds transitive export modules and refreshes their HTML cache hash',async()=>{
  const dir=createTemp(); let child;
  try {
    const files={'package.json':'{"version":"2.8.7"}','index.html':'<script src="dist/app.bundle.js?v=old"></script><script src="dist/core.bundle.js?v=old"></script><script src="dist/app-core.js?v=old"></script>',
      'src/main.js':'window.AppModules={};','src/app-core.js':'var core=1;',
      'src/exports/index.js':'import {value} from "./value.js"; window.watchValue=value;',
      'src/exports/value.js':'export const value="before";'};
    for(const [name,data] of Object.entries(files)) { const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data); }
    fs.mkdirSync(path.join(dir,'dist'));
    fs.copyFileSync(path.join(ROOT,'build.js'),path.join(dir,'build.js'));
    child=spawn(process.execPath,['build.js','--watch'],{cwd:dir,env:{...process.env,NODE_PATH:path.join(ROOT,'node_modules')},stdio:'ignore'});
    const bundle=path.join(dir,'dist/core.bundle.js');
    const html=()=>fs.readFileSync(path.join(dir,'index.html'),'utf8');
    const hash=()=>crypto.createHash('md5').update(fs.readFileSync(bundle)).digest('hex').slice(0,8);
    await waitFor(()=>fs.existsSync(bundle)&&fs.readFileSync(bundle,'utf8').includes('before'));
    const previousHash=hash();
    fs.writeFileSync(path.join(dir,'src/exports/value.js'),'export const value="after";');
    await waitFor(()=>fs.readFileSync(bundle,'utf8').includes('after')&&html().includes(`core.bundle.js?v=${hash()}`));
    assert.notEqual(hash(),previousHash);
  } finally {
    if(child&&child.exitCode===null&&child.signalCode===null) { const closed=new Promise(resolve=>child.once('close',resolve));child.kill();await closed; }
    await cleanup(dir);
  }
});

for(const mode of ['renew','invalid','mfa']) {
  test(`onboarding ${mode} handles credential tokens and authentication truthfully`,async()=>{
    const dir=createTemp();
    try {
      const receipt=path.join(dir,'receipt.json');
      const result=spawnSync('pwsh',['-NoProfile','-File',path.join(ROOT,'tests/runtime_onboard_state.ps1'),'-SourceRoot',ROOT,'-Mode',mode,'-Receipt',receipt],
        {encoding:'utf8',env:{...process.env,AWS_SHARED_CREDENTIALS_FILE:path.join(dir,'credentials'),AWS_CONFIG_FILE:path.join(dir,'config')}});
      assert.equal(result.status,0,result.stdout+result.stderr);
      const state=JSON.parse(fs.readFileSync(receipt,'utf8').replace(/^\uFEFF/,''));
      assert.equal(state.realAwsCalls,0);
      if(mode==='renew') {
        assert.equal(state.failed,false); assert.equal(state.ready,true);
        assert.equal(state.profile.aws_access_key_id,'NEW-MOCK-IAM-KEY');
        assert.equal(state.profile.aws_session_token,'');
        assert.ok(state.writes.some(write=>write.key==='aws_session_token'&&write.value===''&&write.profile==='mock-profile'));
      } else if(mode==='invalid') {
        assert.equal(state.failed,true); assert.equal(state.ready,false);
      } else {
        assert.equal(state.failed,false); assert.equal(state.ready,true);
        assert.equal(state.profile.aws_session_token,'VALID-TOKEN');
        assert.ok(state.writes.some(write=>write.key==='aws_session_token'&&write.value==='VALID-TOKEN'&&write.profile==='mock-profile'));
      }
    } finally { await cleanup(dir); }
  });
}
