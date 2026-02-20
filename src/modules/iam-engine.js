// IAM analysis and policy assessment engine
// Analyzes IAM principals, policies, and access patterns
// Extracted from index.html for modularization

// === IAM OVERLAY ===
// Helpers: ensure Statement is always an array; safe JSON parse for policy docs
function _stmtArr(s){return Array.isArray(s)?s:s?[s]:[]}
function _safePolicyParse(s){if(typeof s!=='string')return s||{};try{return JSON.parse(s)}catch(e){return {}}}
let _iamData=null;
let _showIAM=false;
function parseIAMData(raw){
  if(!raw)return null;
  const data={roles:[],users:[],policies:[]};
  if(raw.RoleDetailList)data.roles=raw.RoleDetailList;
  else if(raw.Roles)data.roles=raw.Roles;
  if(raw.UserDetailList)data.users=raw.UserDetailList;
  if(raw.Policies)data.policies=raw.Policies;
  if(raw.PasswordPolicy)data.passwordPolicy=raw.PasswordPolicy;
  if(raw.AccountPasswordPolicy)data.passwordPolicy=raw.AccountPasswordPolicy;
  // OPTIMIZED: Pre-index policies for O(1) lookup
  const policyMap=new Map();
  data.policies.forEach(dp=>{if(dp.Arn)policyMap.set(dp.Arn,dp);if(dp.PolicyName)policyMap.set(dp.PolicyName,dp)});
  // Helper: resolve a policy entry to its document statements
  function _resolvePolicyDoc(p){
    // Inline policy with PolicyDocument
    if(p.PolicyDocument){const doc=_safePolicyParse(p.PolicyDocument);return _stmtArr(doc.Statement)}
    if(p.Document){const doc=_safePolicyParse(p.Document);return _stmtArr(doc.Statement)}
    // Managed policy reference: look up from policyMap (O(1) instead of O(n))
    if(p.PolicyArn||p.PolicyName){
      const pol=policyMap.get(p.PolicyArn)||policyMap.get(p.PolicyName);
      if(pol){const ver=(pol.PolicyVersionList||[]).find(v=>v.IsDefaultVersion);if(ver){let dd=ver.Document;if(typeof dd==='string'){try{dd=JSON.parse(dd)}catch(e){dd={}}}return _stmtArr(dd.Statement)}}
    }
    return[];
  }
  // Analyze each role for VPC-scoped conditions
  data.roles.forEach(role=>{
    role._vpcAccess=[];role._isAdmin=false;role._hasWildcard=false;
    const policies=[...(role.RolePolicyList||[]),...(role.AttachedManagedPolicies||[])];
    policies.forEach(p=>{
      const stmts=_resolvePolicyDoc(p);
      stmts.forEach(stmt=>{
        if(stmt.Effect!=='Allow')return;
        const actions=Array.isArray(stmt.Action)?stmt.Action:[stmt.Action||''];
        const resources=Array.isArray(stmt.Resource)?stmt.Resource:[stmt.Resource||''];
        const hasWildAction=actions.some(a=>a==='*'||a==='*:*');
        const hasWildResource=resources.some(r=>r==='*');
        if(hasWildAction&&hasWildResource)role._isAdmin=true;
        if(hasWildResource)role._hasWildcard=true;
        // Check for VPC conditions
        const cond=stmt.Condition||{};
        Object.values(cond).forEach(cv=>{
          if(cv['aws:SourceVpc'])role._vpcAccess.push(...(Array.isArray(cv['aws:SourceVpc'])?cv['aws:SourceVpc']:[cv['aws:SourceVpc']]));
          if(cv['ec2:Vpc'])role._vpcAccess.push(...(Array.isArray(cv['ec2:Vpc'])?cv['ec2:Vpc']:[cv['ec2:Vpc']]));
        });
        // Check for EC2/VPC actions
        if(actions.some(a=>a.startsWith('ec2:'))||actions.some(a=>a==='ec2:*')){
          resources.forEach(r=>{if(r.includes(':vpc/')||r.includes(':subnet/'))role._vpcAccess.push(r)});
        }
      });
    });
  });
  return data;
}
function getIAMAccessForVpc(iamData,vpcId){
  if(!iamData)return[];
  return iamData.roles.filter(r=>r._isAdmin||r._hasWildcard||r._vpcAccess.some(v=>v===vpcId||v.includes(vpcId)||v==='*'));
}
function runIAMChecks(iamData){
  const f=[];if(!iamData)return f;
  // OPTIMIZED: Pre-index policies to avoid O(roles × policies) nested find()
  const policyByArn=new Map();
  (iamData.policies||[]).forEach(p=>{if(p.Arn)policyByArn.set(p.Arn,p);if(p.PolicyName)policyByArn.set(p.PolicyName,p)});
  // Derive own account ID from first role/user ARN to detect cross-account trusts
  var _iamOwnAccountId='';
  var _firstArn=(iamData.roles||[]).concat(iamData.users||[]).find(r=>r.Arn);
  if(_firstArn){var _am=_firstArn.Arn.match(/arn:aws:iam::(\d+):/);if(_am)_iamOwnAccountId=_am[1]}
  (iamData.roles||[]).forEach(role=>{
    if(role._isAdmin)f.push({severity:'CRITICAL',control:'IAM-1',framework:'IAM',resource:role.RoleName||role.Arn||'',resourceName:role.RoleName||'',message:'Role has admin (*:*) permissions',remediation:'Apply least-privilege: scope actions and resources'});
    if(role._hasWildcard&&!role._isAdmin)f.push({severity:'HIGH',control:'IAM-2',framework:'IAM',resource:role.RoleName||role.Arn||'',resourceName:role.RoleName||'',message:'Role has wildcard Resource: "*"',remediation:'Scope Resource ARNs to specific resources'});
    // Check for cross-account trust without MFA condition
    if(role.AssumeRolePolicyDocument){
      const trust=_safePolicyParse(role.AssumeRolePolicyDocument);
      const stmts=_stmtArr(trust.Statement);
      const crossAccount=stmts.some(s=>{const p=s.Principal||{};const aws=p.AWS||'';return(Array.isArray(aws)?aws:[aws]).some(a=>{if(!a||!a.includes(':root'))return false;const m=a.match(/arn:aws:iam::(\d+):/);return m&&m[1]!==_iamOwnAccountId})});
      const hasMFA=stmts.some(s=>JSON.stringify(s.Condition||{}).includes('aws:MultiFactorAuth'));
      if(crossAccount&&!hasMFA)f.push({severity:'MEDIUM',control:'IAM-3',framework:'IAM',resource:role.RoleName||'',resourceName:role.RoleName||'',message:'Cross-account role without MFA condition',remediation:'Add Condition with aws:MultiFactorAuthPresent'});
    }
    // IAM-4: Service wildcard actions (s3:*, ec2:* but not *) — scan both inline and managed
    const allStmts4=[];
    (role.RolePolicyList||[]).forEach(p=>{_stmtArr((_safePolicyParse(p.PolicyDocument)).Statement).forEach(s=>allStmts4.push(s))});
    (role.AttachedManagedPolicies||[]).forEach(mp=>{const pol=policyByArn.get(mp.PolicyArn)||policyByArn.get(mp.PolicyName);if(pol){const ver=(pol.PolicyVersionList||[]).find(v=>v.IsDefaultVersion);if(ver){_stmtArr((_safePolicyParse(ver.Document)).Statement).forEach(s=>allStmts4.push(s))}}});
    var hasIAM4=false;
    allStmts4.forEach(stmt=>{
      if(hasIAM4)return;
      if(stmt.Effect!=='Allow')return;
      const acts=Array.isArray(stmt.Action)?stmt.Action:[stmt.Action||''];
      if(acts.some(a=>/^[a-z0-9]+:\*$/i.test(a))){hasIAM4=true;f.push({severity:'MEDIUM',control:'IAM-4',framework:'IAM',resource:role.RoleName||'',resourceName:role.RoleName||'',message:'Role uses service-level wildcard actions (e.g. s3:*)',remediation:'Scope actions to specific API calls needed'})}
    });
    // IAM-5: Unused role (>90 days or never used)
    const lastUsed=role.RoleLastUsed?.LastUsedDate;
    if(!lastUsed||(Date.now()-new Date(lastUsed).getTime())>90*86400000)f.push({severity:'LOW',control:'IAM-5',framework:'IAM',resource:role.RoleName||'',resourceName:role.RoleName||'',message:'Role unused for >90 days or never used',remediation:'Review and remove unused roles'});
    // IAM-6: Cross-account without ExternalId
    if(role.AssumeRolePolicyDocument){
      const tr6=_safePolicyParse(role.AssumeRolePolicyDocument);
      _stmtArr(tr6.Statement).forEach(s=>{
        const pr=s.Principal||{};const awsPr=pr.AWS||'';const awsList=Array.isArray(awsPr)?awsPr:[awsPr];
        const isCross=awsList.some(a=>{if(!a||!a.includes(':root'))return false;const m=a.match(/arn:aws:iam::(\d+):/);return m&&m[1]!==_iamOwnAccountId});
        const hasExtId=s.Condition&&(s.Condition.StringEquals?.['sts:ExternalId']||s.Condition.StringLike?.['sts:ExternalId']);
        if(isCross&&!hasExtId)f.push({severity:'HIGH',control:'IAM-6',framework:'IAM',resource:role.RoleName||'',resourceName:role.RoleName||'',message:'Cross-account trust without ExternalId condition',remediation:'Add sts:ExternalId condition to assume role policy'});
      });
    }
    // IAM-7: Inline policies
    if(role.RolePolicyList?.length>0)f.push({severity:'LOW',control:'IAM-7',framework:'IAM',resource:role.RoleName||'',resourceName:role.RoleName||'',message:'Role uses inline policies instead of managed',remediation:'Convert inline policies to managed policies for reusability'});
    // IAM-8: Admin/wildcard without permission boundary
    if((role._isAdmin||role._hasWildcard)&&!role.PermissionsBoundary)f.push({severity:'MEDIUM',control:'IAM-8',framework:'IAM',resource:role.RoleName||'',resourceName:role.RoleName||'',message:'Privileged role without permission boundary',remediation:'Attach a permission boundary to limit effective permissions'});
  });
  // User checks
  (iamData.users||[]).forEach(user=>{
    // Parse user policies for admin/wildcard detection
    let uIsAdmin=false,uHasWildcard=false;
    const uPolicies=[...(user.UserPolicyList||[]),...(user.AttachedManagedPolicies||[])];
    uPolicies.forEach(p=>{
      const doc=_safePolicyParse(p.PolicyDocument);const stmts=_stmtArr(doc.Statement);
      stmts.forEach(stmt=>{
        if(stmt.Effect!=='Allow')return;
        const acts=Array.isArray(stmt.Action)?stmt.Action:[stmt.Action||''];
        const res=Array.isArray(stmt.Resource)?stmt.Resource:[stmt.Resource||''];
        const uHasWildAct=acts.some(a=>a==='*'||a==='*:*');
        const uHasWildRes=res.some(r=>r==='*');
        if(uHasWildAct&&uHasWildRes)uIsAdmin=true;
        if(uHasWildRes)uHasWildcard=true;
      });
    });
    // Check managed policies for admin
    (user.AttachedManagedPolicies||[]).forEach(mp=>{
      const pol=(iamData.policies||[]).find(p=>p.Arn===mp.PolicyArn||p.PolicyName===mp.PolicyName);
      if(pol){
        const ver=(pol.PolicyVersionList||[]).find(v=>v.IsDefaultVersion);
        if(ver){const dd=_safePolicyParse(ver.Document);_stmtArr(dd.Statement).forEach(s=>{
          if(s.Effect==='Allow'){const a=Array.isArray(s.Action)?s.Action:[s.Action||''];const r=Array.isArray(s.Resource)?s.Resource:[s.Resource||''];if(a.some(x=>x==='*')&&r.some(x=>x==='*'))uIsAdmin=true;if(r.some(x=>x==='*'))uHasWildcard=true}
        })}
      }
    });
    if(uIsAdmin)f.push({severity:'CRITICAL',control:'IAM-1',framework:'IAM',resource:user.UserName||'',resourceName:user.UserName||'',message:'User has admin (*:*) permissions',remediation:'Apply least-privilege: scope actions and resources'});
    if(uHasWildcard&&!uIsAdmin)f.push({severity:'HIGH',control:'IAM-2',framework:'IAM',resource:user.UserName||'',resourceName:user.UserName||'',message:'User has wildcard Resource: "*"',remediation:'Scope Resource ARNs to specific resources'});
    if(!(user.MFADevices||[]).length)f.push({severity:'HIGH',control:'IAM-3',framework:'IAM',resource:user.UserName||'',resourceName:user.UserName||'',message:'User has no MFA device configured',remediation:'Enable MFA for all IAM users'});
    if(user.UserPolicyList?.length>0)f.push({severity:'LOW',control:'IAM-7',framework:'IAM',resource:user.UserName||'',resourceName:user.UserName||'',message:'User uses inline policies instead of managed',remediation:'Convert inline policies to managed policies'});
    // Service wildcard check for users — scan both inline and managed
    const uStmts=[];(user.UserPolicyList||[]).forEach(p=>{_stmtArr((_safePolicyParse(p.PolicyDocument)).Statement).forEach(s=>uStmts.push(s))});
    (user.AttachedManagedPolicies||[]).forEach(mp=>{const pol=(iamData.policies||[]).find(p=>p.Arn===mp.PolicyArn||p.PolicyName===mp.PolicyName);if(pol){const ver=(pol.PolicyVersionList||[]).find(v=>v.IsDefaultVersion);if(ver){_stmtArr((_safePolicyParse(ver.Document)).Statement).forEach(s=>uStmts.push(s))}}});
    var uHasIAM4=false;uStmts.forEach(stmt=>{if(uHasIAM4)return;if(stmt.Effect==='Allow'){const acts=Array.isArray(stmt.Action)?stmt.Action:[stmt.Action||''];if(acts.some(a=>/^[a-z0-9]+:\*$/i.test(a))){uHasIAM4=true;f.push({severity:'MEDIUM',control:'IAM-4',framework:'IAM',resource:user.UserName||'',resourceName:user.UserName||'',message:'User uses service-level wildcard actions',remediation:'Scope actions to specific API calls needed'})}}});
    // IAM-9: Access key age >90 days
    (user.AccessKeys||[]).forEach(ak=>{
      if(ak.Status==='Active'&&ak.CreateDate){const cd=new Date(ak.CreateDate);if(isNaN(cd.getTime()))return;const age=(Date.now()-cd.getTime())/86400000;
        if(age>90)f.push({severity:'MEDIUM',control:'IAM-9',framework:'IAM',resource:user.UserName||'',resourceName:user.UserName||'',message:'Access key '+ak.AccessKeyId+' is '+ Math.floor(age)+' days old',remediation:'Rotate access keys every 90 days; use IAM roles for EC2/Lambda instead'})}
    });
    // IAM-10: Multiple active access keys
    const activeKeys=(user.AccessKeys||[]).filter(ak=>ak.Status==='Active');
    if(activeKeys.length>1)f.push({severity:'LOW',control:'IAM-10',framework:'IAM',resource:user.UserName||'',resourceName:user.UserName||'',message:'User has '+activeKeys.length+' active access keys',remediation:'Maintain only one active key; rotate and deactivate old keys'});
    // IAM-11: Console password without MFA
    if(user.LoginProfile&&!(user.MFADevices||[]).length)f.push({severity:'CRITICAL',control:'IAM-11',framework:'IAM',resource:user.UserName||'',resourceName:user.UserName||'',message:'Console login enabled without MFA',remediation:'Enable MFA immediately; enforce MFA via IAM policy condition'});
    // IAM-12: Excessive managed policy attachments (>10)
    if((user.AttachedManagedPolicies||[]).length>10)f.push({severity:'LOW',control:'IAM-12',framework:'IAM',resource:user.UserName||'',resourceName:user.UserName||'',message:'User has '+(user.AttachedManagedPolicies||[]).length+' managed policies attached',remediation:'Consolidate policies; use groups with managed policies instead'});
  });
  // IAM-13: Password policy checks (account-level)
  if(iamData.passwordPolicy){
    const pp=iamData.passwordPolicy;
    if(!pp.RequireUppercaseCharacters||!pp.RequireLowercaseCharacters||!pp.RequireNumbers||!pp.RequireSymbols)
      f.push({severity:'MEDIUM',control:'IAM-13',framework:'IAM',resource:'AccountPasswordPolicy',resourceName:'Password Policy',message:'Password policy does not require all character types',remediation:'Require uppercase, lowercase, numbers, and symbols'});
    if((pp.MinimumPasswordLength||0)<14)
      f.push({severity:'MEDIUM',control:'IAM-13',framework:'IAM',resource:'AccountPasswordPolicy',resourceName:'Password Policy',message:'Minimum password length is '+(pp.MinimumPasswordLength||'not set')+' (should be 14+)',remediation:'Set MinimumPasswordLength to at least 14 characters'});
    if((pp.MaxPasswordAge||0)>90||!pp.MaxPasswordAge)
      f.push({severity:'MEDIUM',control:'IAM-13',framework:'IAM',resource:'AccountPasswordPolicy',resourceName:'Password Policy',message:'Password max age is '+(pp.MaxPasswordAge||'unlimited')+' days',remediation:'Set MaxPasswordAge to 90 days or less'});
  }
  return f;
}

