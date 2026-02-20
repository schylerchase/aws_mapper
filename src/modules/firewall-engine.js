// Firewall/Security Group/NACL editor and analysis engine
// Manages security group rules, NACL entries, and firewall dashboards
// Extracted from index.html for modularization

// === FIREWALL EDITOR DATA MODEL ===
let _fwEdits=[];
let _fwSnapshot=null;

function _fwTakeSnapshot(){
  if(_fwSnapshot) return;
  if(!_rlCtx) return;
  _fwSnapshot={
    nacls:JSON.parse(JSON.stringify(_rlCtx.nacls||[])),
    sgs:JSON.parse(JSON.stringify(_rlCtx.sgs||[])),
    rts:JSON.parse(JSON.stringify(_rlCtx.rts||[]))
  };
}

function _fwResetAll(){
  if(!_fwSnapshot||!_rlCtx) return;
  // Restore nacls preserving array reference
  _rlCtx.nacls.length=0;
  _fwSnapshot.nacls.forEach(n=>_rlCtx.nacls.push(JSON.parse(JSON.stringify(n))));
  // Restore sgs preserving array reference
  _rlCtx.sgs.length=0;
  _fwSnapshot.sgs.forEach(s=>_rlCtx.sgs.push(JSON.parse(JSON.stringify(s))));
  // Restore rts preserving array reference
  _rlCtx.rts.length=0;
  _fwSnapshot.rts.forEach(r=>_rlCtx.rts.push(JSON.parse(JSON.stringify(r))));
  _fwRebuildLookups();
  _fwEdits=[];
  _fwSnapshot=null;
}

function _fwRebuildLookups(){
  if(!_rlCtx) return;
  // Rebuild subNacl
  const subNacl={};
  (_rlCtx.nacls||[]).forEach(n=>{
    (n.Associations||[]).forEach(a=>{if(a.SubnetId) subNacl[a.SubnetId]=n});
  });
  _rlCtx.subNacl=subNacl;
  // Rebuild subRT with main RT fallback
  const mainRT={};
  (_rlCtx.rts||[]).forEach(rt=>{
    if((rt.Associations||[]).some(a=>a.Main)) mainRT[rt.VpcId]=rt;
  });
  const subRT={};
  (_rlCtx.rts||[]).forEach(rt=>{
    (rt.Associations||[]).forEach(a=>{if(a.SubnetId) subRT[a.SubnetId]=rt});
  });
  (_rlCtx.subnets||[]).forEach(s=>{
    if(!subRT[s.SubnetId]&&mainRT[s.VpcId]) subRT[s.SubnetId]=mainRT[s.VpcId];
  });
  _rlCtx.subRT=subRT;
  // Rebuild sgByVpc
  const sgByVpc={};
  (_rlCtx.sgs||[]).forEach(sg=>{
    (sgByVpc[sg.VpcId]=sgByVpc[sg.VpcId]||[]).push(sg);
  });
  _rlCtx.sgByVpc=sgByVpc;
}

// --- Edit operations ---
function _fwUndo(){
  if(!_fwEdits.length) return null;
  const edit=_fwEdits.pop();
  if(edit.action==='add') _fwRemoveRule(edit);
  else if(edit.action==='delete') _fwRestoreRule(edit);
  else if(edit.action==='modify'){
    _fwApplyRule(edit.type, edit.resourceId, edit.direction, edit.originalRule);
  }
  _fwRebuildLookups();
  return edit;
}

function _fwRemoveRule(edit){
  if(edit.type==='nacl'){
    const nacl=(_rlCtx.nacls||[]).find(n=>n.NetworkAclId===edit.resourceId);
    if(!nacl) return;
    const isEgress=edit.direction==='egress';
    const idx=(nacl.Entries||[]).findIndex(e=>
      e.RuleNumber===edit.rule.RuleNumber && e.Egress===isEgress
    );
    if(idx>=0) nacl.Entries.splice(idx,1);
  } else if(edit.type==='sg'){
    const sg=(_rlCtx.sgs||[]).find(s=>s.GroupId===edit.resourceId);
    if(!sg) return;
    const arr=edit.direction==='ingress'?sg.IpPermissions:sg.IpPermissionsEgress;
    if(!arr) return;
    const idx=arr.findIndex(p=>_fwRuleMatch(p,edit.rule));
    if(idx>=0) arr.splice(idx,1);
  } else if(edit.type==='route'){
    const rt=(_rlCtx.rts||[]).find(r=>r.RouteTableId===edit.resourceId);
    if(!rt||!rt.Routes) return;
    const idx=rt.Routes.findIndex(r=>r.DestinationCidrBlock===edit.rule.DestinationCidrBlock);
    if(idx>=0) rt.Routes.splice(idx,1);
  }
}

function _fwRestoreRule(edit){
  if(edit.originalRule){
    _fwApplyRule(edit.type, edit.resourceId, edit.direction, edit.originalRule);
  }
}

function _fwApplyRule(type, resourceId, direction, ruleData){
  if(type==='nacl'){
    const nacl=(_rlCtx.nacls||[]).find(n=>n.NetworkAclId===resourceId);
    if(!nacl) return;
    if(!nacl.Entries) nacl.Entries=[];
    const isEgress=direction==='egress';
    const idx=nacl.Entries.findIndex(e=>
      e.RuleNumber===ruleData.RuleNumber && e.Egress===isEgress
    );
    const entry=Object.assign({}, ruleData, {Egress:isEgress});
    if(idx>=0) nacl.Entries[idx]=entry;
    else nacl.Entries.push(entry);
  } else if(type==='sg'){
    const sg=(_rlCtx.sgs||[]).find(s=>s.GroupId===resourceId);
    if(!sg) return;
    const key=direction==='ingress'?'IpPermissions':'IpPermissionsEgress';
    if(!sg[key]) sg[key]=[];
    const arr=sg[key];
    const idx=arr.findIndex(p=>_fwRuleMatch(p,ruleData));
    if(idx>=0) arr[idx]=Object.assign({},ruleData);
    else arr.push(Object.assign({},ruleData));
  } else if(type==='route'){
    const rt=(_rlCtx.rts||[]).find(r=>r.RouteTableId===resourceId);
    if(!rt) return;
    if(!rt.Routes) rt.Routes=[];
    const idx=rt.Routes.findIndex(r=>r.DestinationCidrBlock===ruleData.DestinationCidrBlock);
    if(idx>=0) rt.Routes[idx]=Object.assign({},ruleData);
    else rt.Routes.push(Object.assign({},ruleData));
  }
}

function _fwRuleMatch(a, b){
  if(!a||!b) return false;
  if(String(a.IpProtocol)!==String(b.IpProtocol)) return false;
  if((a.FromPort||0)!==(b.FromPort||0)) return false;
  if((a.ToPort||0)!==(b.ToPort||0)) return false;
  const aCidrs=(a.IpRanges||[]).map(r=>r.CidrIp).sort().join(',');
  const bCidrs=(b.IpRanges||[]).map(r=>r.CidrIp).sort().join(',');
  if(aCidrs!==bCidrs) return false;
  const aGrps=(a.UserIdGroupPairs||[]).map(g=>g.GroupId).sort().join(',');
  const bGrps=(b.UserIdGroupPairs||[]).map(g=>g.GroupId).sort().join(',');
  return aGrps===bGrps;
}

function _fwEditCount(resourceId){
  return _fwEdits.filter(e=>e.resourceId===resourceId).length;
}

// --- Validation ---
function _fwValidateCidr(cidr){
  if(!cidr||typeof cidr!=='string') return false;
  if(!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(cidr)) return false;
  const parts=cidr.split('/');
  const octets=parts[0].split('.');
  for(let i=0;i<4;i++){if(parseInt(octets[i],10)>255) return false}
  if(parseInt(parts[1],10)>32) return false;
  return true;
}

function _fwValidateNaclRule(rule, existingEntries, direction){
  const errs=[];
  const num=parseInt(rule.RuleNumber,10);
  if(isNaN(num)||num<1||num>32766) errs.push('Rule number must be 1-32766');
  const isEgress=direction==='egress';
  if(existingEntries&&!isNaN(num)){
    const dup=existingEntries.some(e=>
      e.RuleNumber===num && e.Egress===isEgress
    );
    if(dup) errs.push('Duplicate rule number '+num+' in '+direction+' direction');
  }
  if(!_fwValidateCidr(rule.CidrBlock)) errs.push('Invalid CIDR format');
  const proto=String(rule.Protocol);
  if(proto==='6'||proto==='17'){
    if(!rule.PortRange) errs.push('Port range required for TCP/UDP');
    else{
      const from=parseInt(rule.PortRange.From,10);
      const to=parseInt(rule.PortRange.To,10);
      if(isNaN(from)||isNaN(to)) errs.push('Invalid port range values');
      else{
        if(from<0||from>65535) errs.push('From port must be 0-65535');
        if(to<0||to>65535) errs.push('To port must be 0-65535');
        if(from>to) errs.push('From port must be <= To port');
      }
    }
  }
  return errs;
}

function _fwValidateSgRule(rule){
  const errs=[];
  const proto=String(rule.IpProtocol||'');
  const validProtos=['tcp','udp','icmp','-1'];
  if(!validProtos.includes(proto)) errs.push('Invalid protocol: '+proto);
  if(proto==='tcp'||proto==='udp'){
    const from=parseInt(rule.FromPort,10);
    const to=parseInt(rule.ToPort,10);
    if(isNaN(from)||isNaN(to)) errs.push('Port range required for TCP/UDP');
    else{
      if(from<0||from>65535) errs.push('FromPort must be 0-65535');
      if(to<0||to>65535) errs.push('ToPort must be 0-65535');
      if(from>to) errs.push('FromPort must be <= ToPort');
    }
  }
  const hasCidr=(rule.IpRanges||[]).some(r=>r.CidrIp);
  const hasSgRef=(rule.UserIdGroupPairs||[]).some(g=>g.GroupId);
  if(!hasCidr&&!hasSgRef) errs.push('At least one source (CIDR or SG reference) required');
  if(hasCidr){
    (rule.IpRanges||[]).forEach(r=>{
      if(r.CidrIp&&!_fwValidateCidr(r.CidrIp)) errs.push('Invalid CIDR: '+r.CidrIp);
    });
  }
  return errs;
}

function _fwValidateRoute(route, existingRoutes){
  const errs=[];
  if(!_fwValidateCidr(route.DestinationCidrBlock)) errs.push('Invalid destination CIDR');
  if(existingRoutes){
    const dup=existingRoutes.some(r=>
      r.DestinationCidrBlock===route.DestinationCidrBlock
    );
    if(dup) errs.push('Duplicate destination CIDR: '+route.DestinationCidrBlock);
  }
  const hasTarget=route.GatewayId||route.NatGatewayId||
    route.TransitGatewayId||route.VpcPeeringConnectionId||route.VpcEndpointId;
  if(!hasTarget) errs.push('Route target required');
  return errs;
}

// --- Conflict warnings ---
function _fwCheckNaclShadow(nacl, direction){
  if(!nacl||!nacl.Entries) return [];
  const isEgress=direction==='egress';
  const entries=(nacl.Entries||[])
    .filter(e=>e.Egress===isEgress && e.RuleNumber!==32767)
    .sort((a,b)=>a.RuleNumber-b.RuleNumber);
  const warnings=[];
  for(let i=1;i<entries.length;i++){
    for(let j=0;j<i;j++){
      const hi=entries[i], lo=entries[j];
      const sameCidr=(hi.CidrBlock||'')===(lo.CidrBlock||'');
      const sameProto=(hi.Protocol||'')===(lo.Protocol||'') || lo.Protocol==='-1';
      if(sameCidr&&sameProto&&hi.RuleAction!==lo.RuleAction){
        warnings.push(
          'Rule #'+hi.RuleNumber+' ('+hi.RuleAction+') is shadowed by #'+
          lo.RuleNumber+' ('+lo.RuleAction+') — same CIDR '+
          (hi.CidrBlock||'any')+', evaluated first'
        );
      }
    }
  }
  return warnings;
}

// --- CLI generation ---
function _fwGenerateCli(edits){
  const list=edits||_fwEdits;
  const cmds=[];
  list.forEach(edit=>{
    if(edit.type==='nacl') _fwGenNaclCli(edit, cmds);
    else if(edit.type==='sg') _fwGenSgCli(edit, cmds);
    else if(edit.type==='route') _fwGenRouteCli(edit, cmds);
  });
  return cmds;
}

function _fwGenNaclCli(edit, cmds){
  const id=edit.resourceId;
  const dirFlag=edit.direction==='egress'?'--egress':'--ingress';
  if(edit.action==='add'){
    cmds.push(_fwNaclEntryCmd('create-network-acl-entry', id, edit.rule, dirFlag));
  } else if(edit.action==='modify'){
    cmds.push(_fwNaclEntryCmd('replace-network-acl-entry', id, edit.rule, dirFlag));
  } else if(edit.action==='delete'){
    cmds.push(
      'aws ec2 delete-network-acl-entry --network-acl-id '+id+
      ' --rule-number '+edit.rule.RuleNumber+' '+dirFlag
    );
  }
}

function _fwNaclEntryCmd(verb, naclId, rule, dirFlag){
  let cmd='aws ec2 '+verb+' --network-acl-id '+naclId+
    ' --rule-number '+rule.RuleNumber+' '+dirFlag+
    ' --protocol '+rule.Protocol+
    ' --cidr-block '+rule.CidrBlock;
  if(rule.PortRange){
    cmd+=' --port-range From='+rule.PortRange.From+',To='+rule.PortRange.To;
  }
  cmd+=' --rule-action '+rule.RuleAction;
  return cmd;
}

function _fwGenSgCli(edit, cmds){
  const id=edit.resourceId;
  const suffix=edit.direction==='ingress'?'ingress':'egress';
  if(edit.action==='add'){
    cmds.push(_fwSgRuleCmd('authorize-security-group-'+suffix, id, edit.rule));
  } else if(edit.action==='delete'){
    cmds.push(_fwSgRuleCmd('revoke-security-group-'+suffix, id, edit.rule));
  } else if(edit.action==='modify'){
    // Modify = revoke old, authorize new
    if(edit.originalRule){
      cmds.push(_fwSgRuleCmd('revoke-security-group-'+suffix, id, edit.originalRule));
    }
    cmds.push(_fwSgRuleCmd('authorize-security-group-'+suffix, id, edit.rule));
  }
}

function _fwSgRuleCmd(verb, sgId, rule){
  let cmd='aws ec2 '+verb+' --group-id '+sgId+
    ' --protocol '+rule.IpProtocol;
  if(rule.FromPort!==undefined&&rule.FromPort!==-1){
    cmd+=' --port '+rule.FromPort;
    if(rule.ToPort!==undefined&&rule.ToPort!==rule.FromPort){
      cmd+='-'+rule.ToPort;
    }
  }
  const cidrs=(rule.IpRanges||[]).map(r=>r.CidrIp).filter(Boolean);
  const sgRefs=(rule.UserIdGroupPairs||[]).map(g=>g.GroupId).filter(Boolean);
  if(cidrs.length) cmd+=' --cidr '+cidrs[0];
  else if(sgRefs.length) cmd+=' --source-group '+sgRefs[0];
  return cmd;
}

function _fwGenRouteCli(edit, cmds){
  const id=edit.resourceId;
  if(edit.action==='add'){
    cmds.push(_fwRouteCmd('create-route', id, edit.rule));
  } else if(edit.action==='modify'){
    cmds.push(_fwRouteCmd('replace-route', id, edit.rule));
  } else if(edit.action==='delete'){
    cmds.push(
      'aws ec2 delete-route --route-table-id '+id+
      ' --destination-cidr-block '+edit.rule.DestinationCidrBlock
    );
  }
}

function _fwRouteCmd(verb, rtId, route){
  let cmd='aws ec2 '+verb+' --route-table-id '+rtId+
    ' --destination-cidr-block '+route.DestinationCidrBlock;
  if(route.GatewayId) cmd+=' --gateway-id '+route.GatewayId;
  else if(route.NatGatewayId) cmd+=' --nat-gateway-id '+route.NatGatewayId;
  else if(route.TransitGatewayId) cmd+=' --transit-gateway-id '+route.TransitGatewayId;
  else if(route.VpcPeeringConnectionId) cmd+=' --vpc-peering-connection-id '+route.VpcPeeringConnectionId;
  else if(route.VpcEndpointId) cmd+=' --vpc-endpoint-id '+route.VpcEndpointId;
  return cmd;
}

// === FIREWALL EDITOR RENDERING ===

function _fwProtoLabel(proto){
  var p=String(proto);
  if(p==='6') return 'TCP';
  if(p==='17') return 'UDP';
  if(p==='1') return 'ICMP';
  if(p==='-1') return 'ALL';
  return p;
}

function _fwRenderNaclInline(nacl, sub){
  var naclId=nacl.NetworkAclId;
  var ec=_fwEditCount(naclId);
  var h='<div class="dp-kv"><span class="k">ID</span><span class="v">'+naclId+(ec?'<span class="fw-badge edits">'+ec+' edit'+(ec>1?'s':'')+'</span>':'')+'</span></div>';
  h+='<div class="dp-kv"><span class="k">Name</span><span class="v">'+gn(nacl,naclId)+'</span></div>';
  h+=_fwRenderNaclDirection(nacl, (nacl.Entries||[]).filter(function(e){return !e.Egress}).sort(function(a,b){return a.RuleNumber-b.RuleNumber}), 'ingress', sub);
  h+=_fwRenderNaclDirection(nacl, (nacl.Entries||[]).filter(function(e){return e.Egress}).sort(function(a,b){return a.RuleNumber-b.RuleNumber}), 'egress', sub);
  var iWarn=_fwCheckNaclShadow(nacl,'ingress');
  var eWarn=_fwCheckNaclShadow(nacl,'egress');
  var allWarn=iWarn.concat(eWarn);
  if(allWarn.length){
    h+='<div style="margin-top:6px;padding:4px 6px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:4px;font-size:calc(8px * var(--txt-scale) * var(--dp-txt-scale));font-family:\'IBM Plex Mono\',monospace">';
    h+='<div style="color:var(--accent-orange);font-weight:600;margin-bottom:2px">Shadow Warnings</div>';
    allWarn.forEach(function(w){h+='<div style="color:var(--text-muted);margin:1px 0">'+_escHtml(w)+'</div>'});
    h+='</div>';
  }
  h+='<div class="fw-toolbar">';
  h+='<button data-fw-action="full-editor" data-nacl-id="'+naclId+'">Full Editor</button>';
  h+='<button data-fw-action="export-cli" data-fw-type="nacl" data-nacl-id="'+naclId+'">Export CLI</button>';
  h+='<button data-fw-action="undo">Undo</button>';
  h+='<button data-fw-action="reset">Reset</button>';
  h+='</div>';
  return h;
}

function _fwRenderNaclDirection(nacl, entries, direction, sub){
  var naclId=nacl.NetworkAclId;
  var label=direction==='ingress'?'INBOUND RULES':'OUTBOUND RULES';
  var isEgress=direction==='egress';
  var h='<div style="margin-top:6px"><div class="dp-row"><span class="lbl">'+label+'</span></div>';
  var userRules=entries.filter(function(e){return e.RuleNumber!==32767});
  userRules.forEach(function(e){
    var cls=e.RuleAction==='allow'?'allow':'deny';
    var proto=_fwProtoLabel(e.Protocol);
    var port=(e.PortRange)?e.PortRange.From+'-'+e.PortRange.To:'ALL';
    h+='<div class="fw-edit-row">';
    h+='<div class="fw-arrow '+cls+'"><div class="fw-arrow-line"></div><div class="fw-arrow-head"></div></div>';
    h+='<span class="fw-proto">'+proto+'</span>';
    h+='<span class="fw-port '+cls+'">#'+e.RuleNumber+' '+port+'</span>';
    h+='<span class="fw-src">'+(e.CidrBlock||'any')+'</span>';
    h+='<span style="margin-left:auto;display:flex;gap:2px">';
    h+='<button class="fw-edit-btn edit" data-fw-action="edit-nacl" data-nacl-id="'+naclId+'" data-rule-num="'+e.RuleNumber+'" data-egress="'+isEgress+'" data-direction="'+direction+'" title="Edit">&#9998;</button>';
    h+='<button class="fw-edit-btn del" data-fw-action="delete-nacl" data-nacl-id="'+naclId+'" data-rule-num="'+e.RuleNumber+'" data-egress="'+isEgress+'" data-direction="'+direction+'" title="Delete">&#10005;</button>';
    h+='</span></div>';
  });
  h+='<div class="fw-edit-row" style="opacity:.4">';
  h+='<div class="fw-arrow deny"><div class="fw-arrow-line"></div><div class="fw-arrow-head"></div></div>';
  h+='<span class="fw-proto">ALL</span>';
  h+='<span class="fw-port deny">#* ALL</span>';
  h+='<span class="fw-src">0.0.0.0/0</span>';
  h+='</div>';
  h+='<button class="fw-edit-btn add" data-fw-action="add-nacl" data-nacl-id="'+naclId+'" data-egress="'+isEgress+'" data-direction="'+direction+'">+ Add Rule</button>';
  h+='</div>';
  return h;
}

function _fwShowNaclEditForm(naclId, ruleNum, egress, container){
  var nacl=(_rlCtx.nacls||[]).find(function(n){return n.NetworkAclId===naclId});
  if(!nacl) return;
  var isEgress=(egress==='true'||egress===true);
  var direction=isEgress?'egress':'ingress';
  var existing=null;
  if(ruleNum!==null&&ruleNum!==undefined){
    var rn=parseInt(ruleNum,10);
    existing=(nacl.Entries||[]).find(function(e){return e.RuleNumber===rn&&e.Egress===isEgress});
  }
  var proto=existing?String(existing.Protocol):'-1';
  var portFrom=existing&&existing.PortRange?existing.PortRange.From:'';
  var portTo=existing&&existing.PortRange?existing.PortRange.To:'';
  var cidr=existing?existing.CidrBlock||'':'0.0.0.0/0';
  var rAction=existing?existing.RuleAction:'allow';
  var rNum=existing?existing.RuleNumber:'';
  var disablePorts=(proto==='-1'||proto==='1')?'disabled':'';
  var row=document.createElement('div');
  row.className='fw-edit-row new-rule';
  row.setAttribute('data-fw-form','nacl');
  var formHtml=
    '<input class="fw-input" data-field="ruleNum" type="number" min="1" max="32766" placeholder="#" value="'+rNum+'" style="width:48px" title="Rule Number">'+
    '<select class="fw-select" data-field="action" title="Action">'+
      '<option value="allow"'+(rAction==='allow'?' selected':'')+'>Allow</option>'+
      '<option value="deny"'+(rAction==='deny'?' selected':'')+'>Deny</option>'+
    '</select>'+
    '<select class="fw-select" data-field="protocol" title="Protocol">'+
      '<option value="6"'+(proto==='6'?' selected':'')+'>TCP</option>'+
      '<option value="17"'+(proto==='17'?' selected':'')+'>UDP</option>'+
      '<option value="1"'+(proto==='1'?' selected':'')+'>ICMP</option>'+
      '<option value="-1"'+(proto==='-1'?' selected':'')+'>ALL</option>'+
    '</select>'+
    '<input class="fw-input" data-field="portFrom" type="number" min="0" max="65535" placeholder="From" value="'+portFrom+'" style="width:52px" '+disablePorts+'>'+
    '<input class="fw-input" data-field="portTo" type="number" min="0" max="65535" placeholder="To" value="'+portTo+'" style="width:52px" '+disablePorts+'>'+
    '<input class="fw-input" data-field="cidr" placeholder="CIDR" value="'+_escHtml(cidr)+'" style="width:100px">'+
    '<button class="fw-edit-btn save" data-fw-action="save-nacl" data-nacl-id="'+naclId+'" data-egress="'+isEgress+'" data-direction="'+direction+'"'+(existing?' data-editing="'+rNum+'"':'')+'>Save</button>'+
    '<button class="fw-edit-btn cancel" data-fw-action="cancel-edit">Cancel</button>';
  row.innerHTML=formHtml;
  container.appendChild(row);
  var protoSel=row.querySelector('[data-field="protocol"]');
  protoSel.addEventListener('change',function(){
    var v=protoSel.value;
    var pfEl=row.querySelector('[data-field="portFrom"]');
    var ptEl=row.querySelector('[data-field="portTo"]');
    if(v==='-1'||v==='1'){pfEl.disabled=true;ptEl.disabled=true;pfEl.value='';ptEl.value=''}
    else{pfEl.disabled=false;ptEl.disabled=false}
  });
}

function _fwRenderSgInline(sg){
  var sgId=sg.GroupId;
  var ec=_fwEditCount(sgId);
  var h='<div style="margin-bottom:8px;padding:6px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:4px">';
  h+='<div class="dp-kv"><span class="k">'+_escHtml(sg.GroupName)+'</span><span class="v">'+sgId+(ec?'<span class="fw-badge edits">'+ec+' edit'+(ec>1?'s':'')+'</span>':'')+'</span></div>';
  if(sg.Description) h+='<div style="font-size:calc(8px * var(--txt-scale) * var(--dp-txt-scale));color:var(--text-muted);margin-bottom:4px">'+_escHtml(sg.Description)+'</div>';
  h+=_fwRenderSgDirection(sg,'ingress');
  h+=_fwRenderSgDirection(sg,'egress');
  h+='<div class="fw-toolbar">';
  h+='<button data-fw-action="full-editor" data-sg-id="'+sgId+'">Full Editor</button>';
  h+='<button data-fw-action="export-cli" data-fw-type="sg" data-sg-id="'+sgId+'">Export CLI</button>';
  h+='<button data-fw-action="undo">Undo</button>';
  h+='<button data-fw-action="reset">Reset</button>';
  h+='</div></div>';
  return h;
}

function _fwRenderSgDirection(sg, direction){
  var sgId=sg.GroupId;
  var label=direction==='ingress'?'INBOUND':'OUTBOUND';
  var rules=direction==='ingress'?(sg.IpPermissions||[]):(sg.IpPermissionsEgress||[]);
  var h='<div style="margin-top:4px"><div class="dp-row"><span class="lbl">'+label+'</span></div>';
  rules.forEach(function(p,idx){
    var proto=p.IpProtocol==='-1'?'ALL':p.IpProtocol.toUpperCase();
    var port=p.IpProtocol==='-1'?'ALL':p.FromPort===p.ToPort?(p.FromPort||'ALL'):(p.FromPort||'*')+'-'+(p.ToPort||'*');
    var sources=(p.IpRanges||[]).map(function(r){return r.CidrIp}).concat((p.UserIdGroupPairs||[]).map(function(g){return g.GroupId}));
    var srcStr=sources.length?sources.join(', '):'any';
    h+='<div class="fw-edit-row">';
    h+='<div class="fw-arrow allow"><div class="fw-arrow-line"></div><div class="fw-arrow-head"></div></div>';
    h+='<span class="fw-proto">'+proto+'</span>';
    h+='<span class="fw-port allow">'+port+'</span>';
    h+='<span class="fw-src">'+_escHtml(srcStr)+'</span>';
    h+='<span style="margin-left:auto;display:flex;gap:2px">';
    h+='<button class="fw-edit-btn edit" data-fw-action="edit-sg" data-sg-id="'+sgId+'" data-rule-idx="'+idx+'" data-direction="'+direction+'" title="Edit">&#9998;</button>';
    h+='<button class="fw-edit-btn del" data-fw-action="delete-sg" data-sg-id="'+sgId+'" data-rule-idx="'+idx+'" data-direction="'+direction+'" title="Delete">&#10005;</button>';
    h+='</span></div>';
  });
  h+='<button class="fw-edit-btn add" data-fw-action="add-sg" data-sg-id="'+sgId+'" data-direction="'+direction+'">+ Add Rule</button>';
  h+='</div>';
  return h;
}

function _fwShowSgEditForm(sgId, ruleIdx, direction, container){
  var sg=(_rlCtx.sgs||[]).find(function(s){return s.GroupId===sgId});
  if(!sg) return;
  var rules=direction==='ingress'?(sg.IpPermissions||[]):(sg.IpPermissionsEgress||[]);
  var existing=(ruleIdx!==null&&ruleIdx!==undefined)?rules[parseInt(ruleIdx,10)]:null;
  var proto=existing?String(existing.IpProtocol):'tcp';
  var portFrom=existing&&existing.FromPort!==undefined&&existing.FromPort!==-1?existing.FromPort:'';
  var portTo=existing&&existing.ToPort!==undefined&&existing.ToPort!==-1?existing.ToPort:'';
  var source='0.0.0.0/0';
  if(existing){
    var cidrs=(existing.IpRanges||[]).map(function(r){return r.CidrIp}).filter(Boolean);
    var sgRefs=(existing.UserIdGroupPairs||[]).map(function(g){return g.GroupId}).filter(Boolean);
    if(cidrs.length) source=cidrs[0];
    else if(sgRefs.length) source=sgRefs[0];
  }
  var disablePorts=(proto==='-1'||proto==='icmp')?'disabled':'';
  var row=document.createElement('div');
  row.className='fw-edit-row new-rule';
  row.setAttribute('data-fw-form','sg');
  var formHtml=
    '<select class="fw-select" data-field="protocol" title="Protocol">'+
      '<option value="tcp"'+(proto==='tcp'?' selected':'')+'>TCP</option>'+
      '<option value="udp"'+(proto==='udp'?' selected':'')+'>UDP</option>'+
      '<option value="icmp"'+(proto==='icmp'?' selected':'')+'>ICMP</option>'+
      '<option value="-1"'+(proto==='-1'?' selected':'')+'>ALL</option>'+
    '</select>'+
    '<input class="fw-input" data-field="portFrom" type="number" min="0" max="65535" placeholder="From" value="'+portFrom+'" style="width:52px" '+disablePorts+'>'+
    '<input class="fw-input" data-field="portTo" type="number" min="0" max="65535" placeholder="To" value="'+portTo+'" style="width:52px" '+disablePorts+'>'+
    '<input class="fw-input" data-field="source" placeholder="CIDR or sg-xxx" value="'+_escHtml(source)+'" style="width:110px">'+
    '<button class="fw-edit-btn save" data-fw-action="save-sg" data-sg-id="'+sgId+'" data-direction="'+direction+'"'+(existing?' data-editing="'+ruleIdx+'"':'')+'>Save</button>'+
    '<button class="fw-edit-btn cancel" data-fw-action="cancel-edit">Cancel</button>';
  row.innerHTML=formHtml;
  container.appendChild(row);
  var protoSel=row.querySelector('[data-field="protocol"]');
  protoSel.addEventListener('change',function(){
    var v=protoSel.value;
    var pfEl=row.querySelector('[data-field="portFrom"]');
    var ptEl=row.querySelector('[data-field="portTo"]');
    if(v==='-1'||v==='icmp'){pfEl.disabled=true;ptEl.disabled=true;pfEl.value='';ptEl.value=''}
    else{pfEl.disabled=false;ptEl.disabled=false}
  });
}

function _fwRenderRtInline(rt, vpcId, lk){
  var rtId=rt.RouteTableId;
  var ec=_fwEditCount(rtId);
  var h='<div class="dp-kv"><span class="k">ID</span><span class="v">'+rtId+(ec?'<span class="fw-badge edits">'+ec+' edit'+(ec>1?'s':'')+'</span>':'')+'</span></div>';
  h+='<div class="dp-kv"><span class="k">Name</span><span class="v">'+gn(rt,rtId)+'</span></div>';
  (rt.Routes||[]).forEach(function(r,idx){
    var dest=r.DestinationCidrBlock||r.DestinationPrefixListId||'?';
    var tgt=r.GatewayId||r.NatGatewayId||r.TransitGatewayId||r.VpcPeeringConnectionId||r.VpcEndpointId||'local';
    var isLocal=(tgt==='local');
    h+='<div class="fw-edit-row">';
    h+='<span style="color:var(--text-primary);min-width:100px">'+_escHtml(dest)+'</span>';
    h+='<span class="p" style="margin:0 4px">-&gt;</span>';
    h+='<span>'+routeTgtHtml(tgt)+'</span>';
    if(!isLocal){
      h+='<span style="margin-left:auto;display:flex;gap:2px">';
      h+='<button class="fw-edit-btn edit" data-fw-action="edit-rt" data-rt-id="'+rtId+'" data-rule-idx="'+idx+'" title="Edit">&#9998;</button>';
      h+='<button class="fw-edit-btn del" data-fw-action="delete-rt" data-rt-id="'+rtId+'" data-rule-idx="'+idx+'" title="Delete">&#10005;</button>';
      h+='</span>';
    }
    h+='</div>';
  });
  h+='<button class="fw-edit-btn add" data-fw-action="add-rt" data-rt-id="'+rtId+'">+ Add Route</button>';
  h+='<div class="fw-toolbar">';
  h+='<button data-fw-action="full-editor" data-rt-id="'+rtId+'">Full Editor</button>';
  h+='<button data-fw-action="export-cli" data-fw-type="route" data-rt-id="'+rtId+'">Export CLI</button>';
  h+='<button data-fw-action="undo">Undo</button>';
  h+='<button data-fw-action="reset">Reset</button>';
  h+='</div>';
  return h;
}

function _fwShowRtEditForm(rtId, routeIdx, container, vpcId, lk){
  if(!lk) lk={igws:[],nats:[],vpces:[],peerings:[],tgwAttachments:[]};
  var rt=(_rlCtx.rts||[]).find(function(r){return r.RouteTableId===rtId});
  if(!rt) return;
  var existing=(routeIdx!==null&&routeIdx!==undefined)?(rt.Routes||[])[parseInt(routeIdx,10)]:null;
  var dest=existing?existing.DestinationCidrBlock||'':'';
  var selTgt='';
  if(existing){
    selTgt=existing.GatewayId||existing.NatGatewayId||existing.TransitGatewayId||existing.VpcPeeringConnectionId||existing.VpcEndpointId||'';
  }
  var opts='<option value="">-- select target --</option>';
  opts+='<option value="local"'+(selTgt==='local'?' selected':'')+'>local</option>';
  (lk.igws||[]).forEach(function(g){
    var att=(g.Attachments||[]);
    if(att.some(function(a){return a.VpcId===vpcId})){
      var sel=selTgt===g.InternetGatewayId?' selected':'';
      opts+='<option value="'+g.InternetGatewayId+'"'+sel+'>'+g.InternetGatewayId+' (IGW)</option>';
    }
  });
  (lk.nats||[]).forEach(function(n){
    if(n.VpcId===vpcId){
      var sel=selTgt===n.NatGatewayId?' selected':'';
      opts+='<option value="'+n.NatGatewayId+'"'+sel+'>'+n.NatGatewayId+' (NAT)</option>';
    }
  });
  (lk.vpces||[]).forEach(function(v){
    if(v.VpcId===vpcId){
      var sel=selTgt===v.VpcEndpointId?' selected':'';
      opts+='<option value="'+v.VpcEndpointId+'"'+sel+'>'+v.VpcEndpointId+' (VPCE)</option>';
    }
  });
  (lk.peerings||[]).forEach(function(p){
    var req=p.RequesterVpcInfo||{};
    var acc=p.AccepterVpcInfo||{};
    if(req.VpcId===vpcId||acc.VpcId===vpcId){
      var sel=selTgt===p.VpcPeeringConnectionId?' selected':'';
      opts+='<option value="'+p.VpcPeeringConnectionId+'"'+sel+'>'+p.VpcPeeringConnectionId+' (PCX)</option>';
    }
  });
  (lk.tgwAttachments||[]).forEach(function(t){
    if(t.VpcId===vpcId&&t.TransitGatewayId){
      var sel=selTgt===t.TransitGatewayId?' selected':'';
      opts+='<option value="'+t.TransitGatewayId+'"'+sel+'>'+t.TransitGatewayId+' (TGW)</option>';
    }
  });
  var row=document.createElement('div');
  row.className='fw-edit-row new-rule';
  row.setAttribute('data-fw-form','route');
  var formHtml=
    '<input class="fw-input" data-field="dest" placeholder="Dest CIDR" value="'+_escHtml(dest)+'" style="width:110px">'+
    '<span class="p" style="margin:0 4px">-&gt;</span>'+
    '<select class="fw-select" data-field="target" style="width:160px" title="Target">'+opts+'</select>'+
    '<button class="fw-edit-btn save" data-fw-action="save-rt" data-rt-id="'+rtId+'"'+(existing?' data-editing="'+routeIdx+'"':'')+'>Save</button>'+
    '<button class="fw-edit-btn cancel" data-fw-action="cancel-edit">Cancel</button>';
  row.innerHTML=formHtml;
  container.appendChild(row);
}

// === FIREWALL FULL PANEL EDITOR ===
var _fwFpType=null, _fwFpResId=null, _fwFpSub=null, _fwFpVpcId=null, _fwFpLk=null, _fwFpDir='ingress';

function _fwOpenFullEditor(type, resourceId, sub, vpcId, lk){
  _fwFpType=type;
  _fwFpResId=resourceId;
  _fwFpSub=sub;
  _fwFpVpcId=vpcId;
  _fwFpLk=lk;
  _fwFpDir='ingress';

  var titleEl=document.getElementById('fwFpTitle');
  var label=type==='nacl'?'NACL':type==='sg'?'Security Group':'Route Table';
  var name='';
  if(type==='nacl'){
    var nacl=(_rlCtx.nacls||[]).find(function(n){return n.NetworkAclId===resourceId});
    if(nacl) name=gn(nacl,resourceId);
  } else if(type==='sg'){
    var sg=(_rlCtx.sgs||[]).find(function(s){return s.GroupId===resourceId});
    if(sg) name=sg.GroupName||gn(sg,resourceId);
  } else if(type==='route'){
    var rt=(_rlCtx.rts||[]).find(function(r){return r.RouteTableId===resourceId});
    if(rt) name=gn(rt,resourceId);
  }
  var vpcObj=vpcId?(_rlCtx.vpcs||[]).find(function(v){return v.VpcId===vpcId}):null;
  var vpcLabel=vpcObj?gn(vpcObj,vpcId):(vpcId||'');
  titleEl.innerHTML=esc(label+': '+(name||resourceId))+
    (vpcId?' <span class="fw-link" id="fwFpVpcLink" style="font-size:10px;font-weight:400">'+esc(vpcLabel)+'</span>':'');
  var vpcLink=document.getElementById('fwFpVpcLink');
  if(vpcLink){vpcLink.addEventListener('click',function(e){
    e.stopPropagation();
    document.getElementById('fwFullPanel').classList.remove('open');
    closeUnifiedDash();
    setTimeout(function(){_zoomToElement(vpcId)},250);
  })}

  // Show/hide tabs: route tables don't have direction
  var tabsEl=document.getElementById('fwFpTabs');
  tabsEl.style.display=(type==='route')?'none':'flex';

  // Show retrace button if flow trace is active
  var retraceBtn=document.getElementById('fwFpRetrace');
  retraceBtn.style.display=_flowMode?'inline-block':'none';

  _fwRefreshFullPanel();
  document.getElementById('fwFullPanel').classList.add('open');
}

function _fwRefreshFullPanel(){
  if(!_fwFpType||!_fwFpResId) return;
  var bodyEl=document.getElementById('fwFpBody');
  var visualEl=document.getElementById('fwFpVisual');
  var cliEl=document.getElementById('fwFpCli');
  var h='';

  // Update tab active state
  var tabs=document.querySelectorAll('#fwFpTabs .fw-fp-tab');
  tabs.forEach(function(t){
    t.classList.toggle('active', t.getAttribute('data-dir')===_fwFpDir);
  });

  if(_fwFpType==='nacl'){
    var nacl=(_rlCtx.nacls||[]).find(function(n){return n.NetworkAclId===_fwFpResId});
    if(!nacl){ bodyEl.innerHTML='<div style="color:var(--text-muted);padding:12px">NACL not found</div>'; return; }
    var isEgress=_fwFpDir==='egress';
    var entries=(nacl.Entries||[]).filter(function(e){return isEgress?e.Egress:!e.Egress}).sort(function(a,b){return a.RuleNumber-b.RuleNumber});
    h+=_fwRenderNaclDirection(nacl, entries, _fwFpDir, _fwFpSub);
    // Shadow warnings for this direction
    var warns=_fwCheckNaclShadow(nacl, _fwFpDir);
    if(warns.length){
      h+='<div style="margin-top:6px;padding:4px 6px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:4px;font-size:10px;font-family:\'IBM Plex Mono\',monospace">';
      h+='<div style="color:var(--accent-orange);font-weight:600;margin-bottom:2px">Shadow Warnings</div>';
      warns.forEach(function(w){h+='<div style="color:var(--text-muted);margin:1px 0">'+_escHtml(w)+'</div>'});
      h+='</div>';
    }
  } else if(_fwFpType==='sg'){
    var sg=(_rlCtx.sgs||[]).find(function(s){return s.GroupId===_fwFpResId});
    if(!sg){ bodyEl.innerHTML='<div style="color:var(--text-muted);padding:12px">Security Group not found</div>'; return; }
    h+=_fwRenderSgDirection(sg, _fwFpDir);
  } else if(_fwFpType==='route'){
    var rt=(_rlCtx.rts||[]).find(function(r){return r.RouteTableId===_fwFpResId});
    if(!rt){ bodyEl.innerHTML='<div style="color:var(--text-muted);padding:12px">Route Table not found</div>'; return; }
    // Route tables: render all routes (no direction concept)
    var rtId=rt.RouteTableId;
    (rt.Routes||[]).forEach(function(r,idx){
      var dest=r.DestinationCidrBlock||r.DestinationPrefixListId||'?';
      var tgt=r.GatewayId||r.NatGatewayId||r.TransitGatewayId||r.VpcPeeringConnectionId||r.VpcEndpointId||'local';
      var isLocal=(tgt==='local');
      h+='<div class="fw-edit-row">';
      h+='<span style="color:var(--text-primary);min-width:100px">'+_escHtml(dest)+'</span>';
      h+='<span class="p" style="margin:0 4px">-&gt;</span>';
      h+='<span>'+routeTgtHtml(tgt)+'</span>';
      if(!isLocal){
        h+='<span style="margin-left:auto;display:flex;gap:2px">';
        h+='<button class="fw-edit-btn edit" data-fw-action="edit-rt" data-rt-id="'+rtId+'" data-rule-idx="'+idx+'" title="Edit">&#9998;</button>';
        h+='<button class="fw-edit-btn del" data-fw-action="delete-rt" data-rt-id="'+rtId+'" data-rule-idx="'+idx+'" title="Delete">&#10005;</button>';
        h+='</span>';
      }
      h+='</div>';
    });
    h+='<button class="fw-edit-btn add" data-fw-action="add-rt" data-rt-id="'+rt.RouteTableId+'">+ Add Route</button>';
  }

  // Compliance findings for this resource
  var _fpCompLookup=_buildComplianceLookup();
  var _fpResComp=_fpCompLookup[_fwFpResId];
  if(_fpResComp&&_fpResComp.findings.length){
    h+='<div class="fw-fp-compliance">';
    h+='<div style="font-size:11px;font-weight:600;color:var(--accent-orange);margin-bottom:8px">Compliance Findings ('+_fpResComp.count+')</div>';
    _fpResComp.findings.forEach(function(f){
      h+='<div class="fw-fp-finding sev-'+f.severity+'">';
      h+='<span class="sev-badge sev-'+f.severity+'" style="font-size:8px;padding:1px 5px;margin-right:6px">'+f.severity+'</span>';
      h+='<span class="fw-finding-ctrl" data-fw-ctrl="'+_escHtml(f.control)+'">'+_escHtml(f.control)+'</span>';
      if(f.ckv) h+=' <span style="opacity:.5;font-size:8px">('+_escHtml(f.ckv)+')</span>';
      h+='<div style="margin:4px 0 2px;color:var(--text-secondary);font-size:10px">'+_escHtml(f.message)+'</div>';
      h+='<div style="color:var(--text-muted);font-size:9px">Remediation: '+_escHtml(f.remediation)+'</div>';
      h+='</div>';
    });
    h+='</div>';
  }

  bodyEl.innerHTML=h;

  // Wire compliance control clicks -> switch to compliance tab
  bodyEl.querySelectorAll('.fw-finding-ctrl').forEach(function(el){
    el.addEventListener('click',function(e){
      e.stopPropagation();
      var ctrl=this.dataset.fwCtrl;
      document.getElementById('fwFullPanel').classList.remove('open');
      _compDashState={sevFilter:'ALL',fwFilter:'all',search:ctrl,sort:'severity',showMuted:false,execSummary:false,view:_compDashState.view||'action'};
      _compToolbarTab=null;
      _switchUdashTab('compliance');
    });
  });

  // Click delegation for edit actions within the full panel body
  // _fwHandleAction handles full panel refresh after data-modifying actions
  bodyEl.onclick=function(ev){
    if(ev.target.closest('.fw-finding-ctrl'))return; // already handled above
    _fwHandleAction(ev, _fwFpSub, _fwFpVpcId, _fwFpLk);
  };

  // Render visual pane: show arrow visualization for current direction
  var vH='';
  if(_fwFpType==='nacl'){
    var vNacl=(_rlCtx.nacls||[]).find(function(n){return n.NetworkAclId===_fwFpResId});
    if(vNacl){
      var vIsEgress=_fwFpDir==='egress';
      var vEntries=(vNacl.Entries||[]).filter(function(e){return vIsEgress?e.Egress:!e.Egress}).sort(function(a,b){return a.RuleNumber-b.RuleNumber});
      var vLabel=_fwFpDir==='ingress'?'INBOUND':'OUTBOUND';
      vH+='<div style="font-size:10px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;font-family:\'IBM Plex Mono\',monospace">'+vLabel+' FLOW</div>';
      vEntries.filter(function(e){return e.RuleNumber!==32767}).forEach(function(e){
        var cls=e.RuleAction==='allow'?'allow':'deny';
        var proto=_fwProtoLabel(e.Protocol);
        var port=(e.PortRange)?e.PortRange.From+'-'+e.PortRange.To:'ALL';
        vH+='<div class="fw-edit-row" style="padding:2px 0">';
        vH+='<div class="fw-arrow '+cls+'"><div class="fw-arrow-line"></div><div class="fw-arrow-head"></div></div>';
        vH+='<span style="font-size:9px;color:var(--text-muted)">#'+e.RuleNumber+' '+proto+' '+port+' '+(e.RuleAction==='allow'?'ALLOW':'DENY')+'</span>';
        vH+='</div>';
      });
      vH+='<div class="fw-edit-row" style="padding:2px 0;opacity:.4"><div class="fw-arrow deny"><div class="fw-arrow-line"></div><div class="fw-arrow-head"></div></div><span style="font-size:9px;color:var(--text-muted)">#* DENY ALL</span></div>';
    }
  } else if(_fwFpType==='sg'){
    var vSg=(_rlCtx.sgs||[]).find(function(s){return s.GroupId===_fwFpResId});
    if(vSg){
      var vRules=_fwFpDir==='ingress'?(vSg.IpPermissions||[]):(vSg.IpPermissionsEgress||[]);
      var vLabel2=_fwFpDir==='ingress'?'INBOUND':'OUTBOUND';
      vH+='<div style="font-size:10px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;font-family:\'IBM Plex Mono\',monospace">'+vLabel2+' FLOW</div>';
      vRules.forEach(function(p){
        var proto=p.IpProtocol==='-1'?'ALL':p.IpProtocol.toUpperCase();
        var port=p.IpProtocol==='-1'?'ALL':p.FromPort===p.ToPort?(p.FromPort||'ALL'):(p.FromPort||'*')+'-'+(p.ToPort||'*');
        var sources=(p.IpRanges||[]).map(function(r){return r.CidrIp}).concat((p.UserIdGroupPairs||[]).map(function(g){return g.GroupId}));
        var srcStr=sources.length?sources.join(', '):'any';
        vH+='<div class="fw-edit-row" style="padding:2px 0">';
        vH+='<div class="fw-arrow allow"><div class="fw-arrow-line"></div><div class="fw-arrow-head"></div></div>';
        vH+='<span style="font-size:9px;color:var(--text-muted)">'+proto+' '+port+' from '+_escHtml(srcStr)+'</span>';
        vH+='</div>';
      });
      if(!vRules.length){
        vH+='<div style="font-size:9px;color:var(--text-muted);padding:4px 0">No rules</div>';
      }
    }
  } else if(_fwFpType==='route'){
    var vRt=(_rlCtx.rts||[]).find(function(r){return r.RouteTableId===_fwFpResId});
    if(vRt){
      vH+='<div style="font-size:10px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;font-family:\'IBM Plex Mono\',monospace">ROUTE FLOW</div>';
      (vRt.Routes||[]).forEach(function(r){
        var dest=r.DestinationCidrBlock||r.DestinationPrefixListId||'?';
        var tgt=r.GatewayId||r.NatGatewayId||r.TransitGatewayId||r.VpcPeeringConnectionId||r.VpcEndpointId||'local';
        vH+='<div class="fw-edit-row" style="padding:2px 0">';
        vH+='<div class="fw-arrow allow"><div class="fw-arrow-line"></div><div class="fw-arrow-head"></div></div>';
        vH+='<span style="font-size:9px;color:var(--text-muted)">'+_escHtml(dest)+' &rarr; '+_escHtml(tgt)+'</span>';
        vH+='</div>';
      });
    }
  }
  visualEl.innerHTML=vH;

  // Render CLI pane: filtered edits for this resource
  var filtered=_fwEdits.filter(function(ed){return ed.resourceId===_fwFpResId});
  var cmds=_fwGenerateCli(filtered);
  if(cmds.length){
    cliEl.textContent=cmds.join('\n');
  } else {
    cliEl.innerHTML='<span style="color:var(--text-muted);font-style:italic">No pending edits</span>';
  }
}

// === FIREWALL EVENT HANDLER ===

function _fwHandleAction(e, sub, vpcId, lk){
  var el=e.target.closest('[data-fw-action]');
  if(!el) return;
  e.stopPropagation();
  var action=el.getAttribute('data-fw-action');
  var _inFullPanel=!!el.closest('#fwFpBody');
  var dpBody=_inFullPanel?document.getElementById('fwFpBody'):document.getElementById('dpBody');

  if(action==='cancel-edit'){
    var form=el.closest('[data-fw-form]');
    if(form) form.remove();
    return;
  }
  if(action==='undo'){
    _fwUndo();
    if(sub && lk) openSubnetPanel(sub, vpcId, lk);
    if(typeof _fwDashRender==='function' && _udashTab==='firewall' && document.getElementById('udash') && document.getElementById('udash').classList.contains('open')) _fwDashRender();
    if(document.getElementById('fwFullPanel').classList.contains('open')) _fwRefreshFullPanel();
    return;
  }
  if(action==='reset'){
    _fwResetAll();
    if(sub && lk) openSubnetPanel(sub, vpcId, lk);
    if(typeof _fwDashRender==='function' && _udashTab==='firewall' && document.getElementById('udash') && document.getElementById('udash').classList.contains('open')) _fwDashRender();
    if(document.getElementById('fwFullPanel').classList.contains('open')) _fwRefreshFullPanel();
    return;
  }
  if(action==='export-cli'){
    var fwType=el.getAttribute('data-fw-type');
    var resId=el.getAttribute('data-nacl-id')||el.getAttribute('data-sg-id')||el.getAttribute('data-rt-id');
    var filtered=_fwEdits.filter(function(ed){return ed.type===fwType&&ed.resourceId===resId});
    var cmds=_fwGenerateCli(filtered);
    if(cmds.length){
      var txt=cmds.join('\n');
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(txt).then(function(){
          el.textContent='Copied!';
          setTimeout(function(){el.textContent='Export CLI'},1500);
        }).catch(function(){el.textContent='Copy failed';setTimeout(function(){el.textContent='Export CLI'},1500)});
      } else {
        el.textContent=cmds.length+' cmd(s)';
        setTimeout(function(){el.textContent='Export CLI'},1500);
      }
    } else {
      el.textContent='No edits';
      setTimeout(function(){el.textContent='Export CLI'},1500);
    }
    return;
  }
  if(action==='full-editor'){
    var feNaclId=el.getAttribute('data-nacl-id');
    var feSgId=el.getAttribute('data-sg-id');
    var feRtId=el.getAttribute('data-rt-id');
    var feType=feNaclId?'nacl':feSgId?'sg':'route';
    var feId=feNaclId||feSgId||feRtId;
    _fwOpenFullEditor(feType, feId, sub, vpcId, lk);
    return;
  }

  // NACL actions
  if(action==='edit-nacl'){
    dpBody.querySelectorAll('[data-fw-form]').forEach(function(f){f.remove()});
    var naclId=el.getAttribute('data-nacl-id');
    var ruleNum=el.getAttribute('data-rule-num');
    var egress=el.getAttribute('data-egress');
    var parentRow=el.closest('.fw-edit-row');
    var insertAfter=parentRow||el.closest('.dp-row');
    if(insertAfter&&insertAfter.parentNode){
      _fwShowNaclEditForm(naclId, ruleNum, egress, insertAfter.parentNode);
    }
    return;
  }
  if(action==='add-nacl'){
    dpBody.querySelectorAll('[data-fw-form]').forEach(function(f){f.remove()});
    var naclId2=el.getAttribute('data-nacl-id');
    var egress2=el.getAttribute('data-egress');
    var parent2=el.parentNode;
    if(parent2){
      _fwShowNaclEditForm(naclId2, null, egress2, parent2);
    }
    return;
  }
  if(action==='delete-nacl'){
    var dNaclId=el.getAttribute('data-nacl-id');
    var dRuleNum=parseInt(el.getAttribute('data-rule-num'),10);
    var dEgress=el.getAttribute('data-egress')==='true';
    var dDirection=dEgress?'egress':'ingress';
    var dNacl=(_rlCtx.nacls||[]).find(function(n){return n.NetworkAclId===dNaclId});
    if(!dNacl) return;
    var dEntry=(dNacl.Entries||[]).find(function(en){return en.RuleNumber===dRuleNum&&en.Egress===dEgress});
    if(!dEntry) return;
    _fwTakeSnapshot();
    var dIdx=(dNacl.Entries||[]).findIndex(function(en){return en.RuleNumber===dRuleNum&&en.Egress===dEgress});
    if(dIdx>=0) dNacl.Entries.splice(dIdx,1);
    _fwEdits.push({type:'nacl',resourceId:dNaclId,direction:dDirection,action:'delete',rule:Object.assign({},dEntry),originalRule:Object.assign({},dEntry)});
    _fwRebuildLookups();
    if(sub && lk) openSubnetPanel(sub, vpcId, lk);
    if(typeof _fwDashRender==='function' && _udashTab==='firewall' && document.getElementById('udash') && document.getElementById('udash').classList.contains('open')) _fwDashRender();
    if(document.getElementById('fwFullPanel').classList.contains('open')) _fwRefreshFullPanel();
    return;
  }
  if(action==='save-nacl'){
    var sNaclId=el.getAttribute('data-nacl-id');
    var sEgress=el.getAttribute('data-egress')==='true';
    var sDirection=el.getAttribute('data-direction');
    var sEditing=el.getAttribute('data-editing');
    var formRow=el.closest('[data-fw-form]');
    if(!formRow) return;
    var rn=parseInt(formRow.querySelector('[data-field="ruleNum"]').value,10);
    var act=formRow.querySelector('[data-field="action"]').value;
    var proto=formRow.querySelector('[data-field="protocol"]').value;
    var pf=formRow.querySelector('[data-field="portFrom"]').value;
    var pt=formRow.querySelector('[data-field="portTo"]').value;
    var cidr=formRow.querySelector('[data-field="cidr"]').value.trim();
    var ruleObj={
      RuleNumber:rn,
      Protocol:proto,
      RuleAction:act,
      CidrBlock:cidr,
      Egress:sEgress
    };
    if(proto==='6'||proto==='17'){
      ruleObj.PortRange={From:parseInt(pf,10)||0,To:parseInt(pt,10)||0};
    }
    var sNacl=(_rlCtx.nacls||[]).find(function(n){return n.NetworkAclId===sNaclId});
    var otherEntries=sNacl?(sNacl.Entries||[]).filter(function(en){
      if(sEditing!==null&&sEditing!==undefined&&en.RuleNumber===parseInt(sEditing,10)&&en.Egress===sEgress) return false;
      return true;
    }):[];
    var errs=_fwValidateNaclRule(ruleObj, otherEntries, sDirection);
    formRow.querySelectorAll('.fw-input,.fw-select').forEach(function(inp){inp.classList.remove('invalid')});
    if(errs.length){
      errs.forEach(function(er){
        if(er.indexOf('Rule number')>=0) formRow.querySelector('[data-field="ruleNum"]').classList.add('invalid');
        if(er.indexOf('CIDR')>=0) formRow.querySelector('[data-field="cidr"]').classList.add('invalid');
        if(er.indexOf('Port')>=0||er.indexOf('port')>=0){
          var pfEl=formRow.querySelector('[data-field="portFrom"]');
          var ptEl=formRow.querySelector('[data-field="portTo"]');
          if(pfEl) pfEl.classList.add('invalid');
          if(ptEl) ptEl.classList.add('invalid');
        }
      });
      return;
    }
    _fwTakeSnapshot();
    var editAction='add';
    var origRule=null;
    if(sEditing!==null&&sEditing!==undefined){
      var editRn=parseInt(sEditing,10);
      origRule=(sNacl.Entries||[]).find(function(en){return en.RuleNumber===editRn&&en.Egress===sEgress});
      if(origRule) origRule=Object.assign({},origRule);
      var oldIdx=(sNacl.Entries||[]).findIndex(function(en){return en.RuleNumber===editRn&&en.Egress===sEgress});
      if(oldIdx>=0) sNacl.Entries.splice(oldIdx,1);
      editAction='modify';
    }
    _fwApplyRule('nacl', sNaclId, sDirection, ruleObj);
    var editObj={type:'nacl',resourceId:sNaclId,direction:sDirection,action:editAction,rule:Object.assign({},ruleObj)};
    if(origRule) editObj.originalRule=origRule;
    _fwEdits.push(editObj);
    _fwRebuildLookups();
    if(sub && lk) openSubnetPanel(sub, vpcId, lk);
    if(typeof _fwDashRender==='function' && _udashTab==='firewall' && document.getElementById('udash') && document.getElementById('udash').classList.contains('open')) _fwDashRender();
    if(document.getElementById('fwFullPanel').classList.contains('open')) _fwRefreshFullPanel();
    return;
  }

  // SG actions
  if(action==='edit-sg'){
    dpBody.querySelectorAll('[data-fw-form]').forEach(function(f){f.remove()});
    var sgId3=el.getAttribute('data-sg-id');
    var rIdx3=el.getAttribute('data-rule-idx');
    var dir3=el.getAttribute('data-direction');
    var parentRow3=el.closest('.fw-edit-row');
    if(parentRow3&&parentRow3.parentNode){
      _fwShowSgEditForm(sgId3, rIdx3, dir3, parentRow3.parentNode);
    }
    return;
  }
  if(action==='add-sg'){
    dpBody.querySelectorAll('[data-fw-form]').forEach(function(f){f.remove()});
    var sgId4=el.getAttribute('data-sg-id');
    var dir4=el.getAttribute('data-direction');
    var parent4=el.parentNode;
    if(parent4){
      _fwShowSgEditForm(sgId4, null, dir4, parent4);
    }
    return;
  }
  if(action==='delete-sg'){
    var dSgId=el.getAttribute('data-sg-id');
    var dRIdx=parseInt(el.getAttribute('data-rule-idx'),10);
    var dDir=el.getAttribute('data-direction');
    var dSg=(_rlCtx.sgs||[]).find(function(s){return s.GroupId===dSgId});
    if(!dSg) return;
    var dArr=dDir==='ingress'?dSg.IpPermissions:dSg.IpPermissionsEgress;
    if(!dArr||dRIdx>=dArr.length) return;
    var dRule=JSON.parse(JSON.stringify(dArr[dRIdx]));
    _fwTakeSnapshot();
    dArr.splice(dRIdx,1);
    _fwEdits.push({type:'sg',resourceId:dSgId,direction:dDir,action:'delete',rule:dRule,originalRule:dRule});
    _fwRebuildLookups();
    if(sub && lk) openSubnetPanel(sub, vpcId, lk);
    if(typeof _fwDashRender==='function' && _udashTab==='firewall' && document.getElementById('udash') && document.getElementById('udash').classList.contains('open')) _fwDashRender();
    if(document.getElementById('fwFullPanel').classList.contains('open')) _fwRefreshFullPanel();
    return;
  }
  if(action==='save-sg'){
    var sSgId=el.getAttribute('data-sg-id');
    var sDir=el.getAttribute('data-direction');
    var sEditIdx=el.getAttribute('data-editing');
    var sgForm=el.closest('[data-fw-form]');
    if(!sgForm) return;
    var sgProto=sgForm.querySelector('[data-field="protocol"]').value;
    var sgPf=sgForm.querySelector('[data-field="portFrom"]').value;
    var sgPt=sgForm.querySelector('[data-field="portTo"]').value;
    var sgSrc=sgForm.querySelector('[data-field="source"]').value.trim();
    var sgRule={IpProtocol:sgProto};
    if(sgProto==='tcp'||sgProto==='udp'){
      sgRule.FromPort=parseInt(sgPf,10)||0;
      sgRule.ToPort=parseInt(sgPt,10)||0;
    } else if(sgProto==='-1'){
      sgRule.FromPort=-1;
      sgRule.ToPort=-1;
    }
    if(sgSrc.startsWith('sg-')){
      sgRule.UserIdGroupPairs=[{GroupId:sgSrc}];
      sgRule.IpRanges=[];
    } else {
      sgRule.IpRanges=[{CidrIp:sgSrc}];
      sgRule.UserIdGroupPairs=[];
    }
    var sgErrs=_fwValidateSgRule(sgRule);
    sgForm.querySelectorAll('.fw-input,.fw-select').forEach(function(inp){inp.classList.remove('invalid')});
    if(sgErrs.length){
      sgErrs.forEach(function(er){
        if(er.indexOf('protocol')>=0) sgForm.querySelector('[data-field="protocol"]').classList.add('invalid');
        if(er.indexOf('Port')>=0||er.indexOf('port')>=0){
          var spf=sgForm.querySelector('[data-field="portFrom"]');
          var spt=sgForm.querySelector('[data-field="portTo"]');
          if(spf) spf.classList.add('invalid');
          if(spt) spt.classList.add('invalid');
        }
        if(er.indexOf('source')>=0||er.indexOf('CIDR')>=0) sgForm.querySelector('[data-field="source"]').classList.add('invalid');
      });
      return;
    }
    _fwTakeSnapshot();
    var sgEditAct='add';
    var sgOrig=null;
    var sSg=(_rlCtx.sgs||[]).find(function(s){return s.GroupId===sSgId});
    if(sEditIdx!==null&&sEditIdx!==undefined&&sSg){
      var eIdx=parseInt(sEditIdx,10);
      var sArr=sDir==='ingress'?sSg.IpPermissions:sSg.IpPermissionsEgress;
      if(sArr&&eIdx<sArr.length){
        sgOrig=JSON.parse(JSON.stringify(sArr[eIdx]));
        sArr.splice(eIdx,1);
        sgEditAct='modify';
      }
    }
    _fwApplyRule('sg', sSgId, sDir, sgRule);
    var sgEdit={type:'sg',resourceId:sSgId,direction:sDir,action:sgEditAct,rule:JSON.parse(JSON.stringify(sgRule))};
    if(sgOrig) sgEdit.originalRule=sgOrig;
    _fwEdits.push(sgEdit);
    _fwRebuildLookups();
    if(sub && lk) openSubnetPanel(sub, vpcId, lk);
    if(typeof _fwDashRender==='function' && _udashTab==='firewall' && document.getElementById('udash') && document.getElementById('udash').classList.contains('open')) _fwDashRender();
    if(document.getElementById('fwFullPanel').classList.contains('open')) _fwRefreshFullPanel();
    return;
  }

  // Route Table actions
  if(action==='edit-rt'){
    dpBody.querySelectorAll('[data-fw-form]').forEach(function(f){f.remove()});
    var rtId5=el.getAttribute('data-rt-id');
    var rIdx5=el.getAttribute('data-rule-idx');
    var parentRow5=el.closest('.fw-edit-row');
    if(parentRow5&&parentRow5.parentNode){
      _fwShowRtEditForm(rtId5, rIdx5, parentRow5.parentNode, vpcId, lk);
    }
    return;
  }
  if(action==='add-rt'){
    dpBody.querySelectorAll('[data-fw-form]').forEach(function(f){f.remove()});
    var rtId6=el.getAttribute('data-rt-id');
    var parent6=el.parentNode;
    if(parent6){
      _fwShowRtEditForm(rtId6, null, parent6, vpcId, lk);
    }
    return;
  }
  if(action==='delete-rt'){
    var dRtId=el.getAttribute('data-rt-id');
    var dRtIdx=parseInt(el.getAttribute('data-rule-idx'),10);
    var dRt=(_rlCtx.rts||[]).find(function(r){return r.RouteTableId===dRtId});
    if(!dRt||!dRt.Routes||dRtIdx>=dRt.Routes.length) return;
    var dRoute=Object.assign({},dRt.Routes[dRtIdx]);
    _fwTakeSnapshot();
    dRt.Routes.splice(dRtIdx,1);
    _fwEdits.push({type:'route',resourceId:dRtId,direction:'egress',action:'delete',rule:dRoute,originalRule:dRoute});
    _fwRebuildLookups();
    if(sub && lk) openSubnetPanel(sub, vpcId, lk);
    if(typeof _fwDashRender==='function' && _udashTab==='firewall' && document.getElementById('udash') && document.getElementById('udash').classList.contains('open')) _fwDashRender();
    if(document.getElementById('fwFullPanel').classList.contains('open')) _fwRefreshFullPanel();
    return;
  }
  if(action==='save-rt'){
    var sRtId=el.getAttribute('data-rt-id');
    var sRtEdit=el.getAttribute('data-editing');
    var rtForm=el.closest('[data-fw-form]');
    if(!rtForm) return;
    var rtDest=rtForm.querySelector('[data-field="dest"]').value.trim();
    var rtTgt=rtForm.querySelector('[data-field="target"]').value;
    var routeObj={DestinationCidrBlock:rtDest};
    if(rtTgt==='local') routeObj.GatewayId='local';
    else if(rtTgt.startsWith('igw-')) routeObj.GatewayId=rtTgt;
    else if(rtTgt.startsWith('nat-')) routeObj.NatGatewayId=rtTgt;
    else if(rtTgt.startsWith('vpce-')) routeObj.VpcEndpointId=rtTgt;
    else if(rtTgt.startsWith('pcx-')) routeObj.VpcPeeringConnectionId=rtTgt;
    else if(rtTgt.startsWith('tgw-')) routeObj.TransitGatewayId=rtTgt;
    else routeObj.GatewayId=rtTgt;
    var sRt=(_rlCtx.rts||[]).find(function(r){return r.RouteTableId===sRtId});
    var otherRoutes=sRt?(sRt.Routes||[]).filter(function(r,ri){
      if(sRtEdit!==null&&sRtEdit!==undefined&&ri===parseInt(sRtEdit,10)) return false;
      return true;
    }):[];
    var rtErrs=_fwValidateRoute(routeObj, otherRoutes);
    rtForm.querySelectorAll('.fw-input,.fw-select').forEach(function(inp){inp.classList.remove('invalid')});
    if(rtErrs.length){
      rtErrs.forEach(function(er){
        if(er.indexOf('destination')>=0||er.indexOf('CIDR')>=0) rtForm.querySelector('[data-field="dest"]').classList.add('invalid');
        if(er.indexOf('target')>=0) rtForm.querySelector('[data-field="target"]').classList.add('invalid');
      });
      return;
    }
    _fwTakeSnapshot();
    var rtEditAct='add';
    var rtOrig=null;
    if(sRtEdit!==null&&sRtEdit!==undefined&&sRt){
      var rtEIdx=parseInt(sRtEdit,10);
      if(sRt.Routes&&rtEIdx<sRt.Routes.length){
        rtOrig=Object.assign({},sRt.Routes[rtEIdx]);
        sRt.Routes.splice(rtEIdx,1);
        rtEditAct='modify';
      }
    }
    _fwApplyRule('route', sRtId, 'egress', routeObj);
    var rtEditObj={type:'route',resourceId:sRtId,direction:'egress',action:rtEditAct,rule:Object.assign({},routeObj)};
    if(rtOrig) rtEditObj.originalRule=rtOrig;
    _fwEdits.push(rtEditObj);
    _fwRebuildLookups();
    if(sub && lk) openSubnetPanel(sub, vpcId, lk);
    if(typeof _fwDashRender==='function' && _udashTab==='firewall' && document.getElementById('udash') && document.getElementById('udash').classList.contains('open')) _fwDashRender();
    if(document.getElementById('fwFullPanel').classList.contains('open')) _fwRefreshFullPanel();
    return;
  }
}

// === FIREWALL DASHBOARD ===
var _fwDashFilter='all';
var _fwDashState={search:'',vpcFilter:'all',sort:'type',sortDir:'asc',cardFilter:null};

function openFirewallDash(){
  _fwDashState={search:'',vpcFilter:'all',sort:'type',sortDir:'asc',cardFilter:null};
  _fwDashFilter='all';
  openUnifiedDash('firewall');
}

function _renderFirewallTab(){
  var tb=document.getElementById('udashToolbar');
  if(!_rlCtx){tb.innerHTML='<span style="color:var(--text-muted)">No data loaded</span>';return}
  var sgs=_rlCtx.sgs||[],nacls=_rlCtx.nacls||[],rts=_rlCtx.rts||[];
  var vpcOpts='<option value="all">All VPCs</option>';
  (_rlCtx.vpcs||[]).forEach(function(v){
    vpcOpts+='<option value="'+esc(v.VpcId)+'">'+esc(gn(v,v.VpcId))+'</option>';
  });
  var sortOpts=[{k:'type',l:'Sort: Type'},{k:'name',l:'Sort: Name'},{k:'severity',l:'Sort: Severity'},{k:'rules',l:'Sort: Rules'}];
  var sortHtml='';sortOpts.forEach(function(o){sortHtml+='<option value="'+o.k+'"'+(_fwDashState.sort===o.k?' selected':'')+'>'+o.l+'</option>'});
  tb.innerHTML='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'+
    '<input id="fwDashSearch" type="text" placeholder="Search resources..." value="'+_escHtml(_fwDashState.search)+'" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:4px 10px;border-radius:4px;font-size:11px;font-family:IBM Plex Mono,monospace;width:180px">'+
    '<select id="fwDashVpcFilter" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-secondary);padding:4px 8px;border-radius:4px;font-size:10px;font-family:IBM Plex Mono,monospace">'+vpcOpts+'</select>'+
    '<select id="fwDashSort" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-secondary);padding:4px 8px;border-radius:4px;font-size:10px;font-family:IBM Plex Mono,monospace">'+sortHtml+'</select>'+
    '<div id="fwDashPills" style="display:flex;gap:4px;margin-left:auto"></div>'+
    '</div>';
  document.getElementById('fwDashVpcFilter').value=_fwDashState.vpcFilter;
  var pills=document.getElementById('fwDashPills');
  [{t:'all',l:'All'},{t:'sg',l:'SG'},{t:'nacl',l:'NACL'},{t:'route',l:'RT'}].forEach(function(p){
    var el=document.createElement('span');el.className='fw-dash-pill'+(p.t===_fwDashFilter?' active':'');
    el.dataset.type=p.t;el.textContent=p.l;
    el.addEventListener('click',function(){
      _fwDashFilter=p.t;_fwDashState.cardFilter=null;
      pills.querySelectorAll('.fw-dash-pill').forEach(function(x){x.classList.remove('active')});el.classList.add('active');
      _fwDashRender();
    });
    pills.appendChild(el);
  });
  document.getElementById('fwDashSearch').addEventListener('input',function(){
    _fwDashState.search=this.value.toLowerCase();_fwDashRender();
  });
  document.getElementById('fwDashVpcFilter').addEventListener('change',function(){
    _fwDashState.vpcFilter=this.value;_fwDashRender();
  });
  document.getElementById('fwDashSort').addEventListener('change',function(){
    _fwDashState.sort=this.value;_fwDashRender();
  });
  _fwDashRender();
}

function _fwDashRender(){
  var body=document.getElementById('udashBody');if(body)body.scrollTop=0;
  if(!_rlCtx){if(body)body.innerHTML='<div style="padding:40px;text-align:center;color:var(--text-muted)">No data loaded</div>';return}
  var sgs=_rlCtx.sgs||[],nacls=_rlCtx.nacls||[],rts=_rlCtx.rts||[];
  var compLookup=_buildComplianceLookup();
  var sevOrder={CRITICAL:1,HIGH:2,MEDIUM:3,LOW:4};

  // Build unified rows
  var rows=[];
  sgs.forEach(function(sg){
    var name=sg.GroupName||gn(sg,sg.GroupId);
    var inCount=(sg.IpPermissions||[]).length;var outCount=(sg.IpPermissionsEgress||[]).length;
    var ec=_fwEditCount(sg.GroupId);
    var cf=compLookup[sg.GroupId]||null;
    var hasOpen=false;
    (sg.IpPermissions||[]).forEach(function(p){
      (p.IpRanges||[]).forEach(function(r){if(r.CidrIp==='0.0.0.0/0')hasOpen=true});
      (p.Ipv6Ranges||[]).forEach(function(r){if(r.CidrIpv6==='::/0')hasOpen=true});
    });
    rows.push({type:'sg',id:sg.GroupId,name:name,vpc:sg.VpcId,rules:inCount+outCount,rulesLabel:inCount+' in / '+outCount+' out',edits:ec,desc:sg.Description||'',obj:sg,comp:cf,openIngress:hasOpen});
  });
  nacls.forEach(function(n){
    var name=gn(n,n.NetworkAclId);
    var entries=n.Entries||[];
    var inCount=entries.filter(function(e){return !e.Egress&&e.RuleNumber!==32767}).length;
    var outCount=entries.filter(function(e){return e.Egress&&e.RuleNumber!==32767}).length;
    var ec=_fwEditCount(n.NetworkAclId);
    var cf=compLookup[n.NetworkAclId]||null;
    rows.push({type:'nacl',id:n.NetworkAclId,name:name,vpc:n.VpcId,rules:inCount+outCount,rulesLabel:inCount+' in / '+outCount+' out',edits:ec,desc:'',obj:n,comp:cf,openIngress:false});
  });
  rts.forEach(function(r){
    var name=gn(r,r.RouteTableId);
    var rc=(r.Routes||[]).length;
    var ec=_fwEditCount(r.RouteTableId);
    var cf=compLookup[r.RouteTableId]||null;
    rows.push({type:'route',id:r.RouteTableId,name:name,vpc:r.VpcId,rules:rc,rulesLabel:rc+' routes',edits:ec,desc:'',obj:r,comp:cf,openIngress:false});
  });

  // Compute summary card metrics (before filtering)
  var totalFindings=0,worstSev='LOW',openIngress=0,totalEdits=_fwEdits?_fwEdits.length:0;
  rows.forEach(function(r){
    if(r.comp){totalFindings+=r.comp.count;if((sevOrder[r.comp.worst]||9)<(sevOrder[worstSev]||9))worstSev=r.comp.worst}
    if(r.openIngress)openIngress++;
  });

  // Summary cards HTML
  var cf=_fwDashState.cardFilter;
  var h='<div class="fw-summary-cards">';
  h+='<div class="fw-summary-card'+(cf==='resources'?' active':'')+'">';
  h+='<div class="fw-card-count">'+(sgs.length+nacls.length+rts.length)+'</div>';
  h+='<div class="fw-card-label">Resources</div>';
  h+='<div class="fw-card-sub">'+sgs.length+' SG / '+nacls.length+' NACL / '+rts.length+' RT</div></div>';
  var findCls=totalFindings?'severity-'+worstSev.toLowerCase():'clean';
  h+='<div class="fw-summary-card '+findCls+(cf==='findings'?' active':'')+'" data-card="findings">';
  h+='<div class="fw-card-count">'+totalFindings+'</div>';
  h+='<div class="fw-card-label">Findings</div>';
  h+='<div class="fw-card-sub">'+(totalFindings?worstSev+' worst':'All clear')+'</div></div>';
  var openCls=openIngress?'severity-critical':'clean';
  h+='<div class="fw-summary-card '+openCls+(cf==='open'?' active':'')+'" data-card="open">';
  h+='<div class="fw-card-count">'+openIngress+'</div>';
  h+='<div class="fw-card-label">Open 0.0.0.0/0</div>';
  h+='<div class="fw-card-sub">'+(openIngress?'Unrestricted ingress':'None detected')+'</div></div>';
  var editCls=totalEdits?'severity-medium':'clean';
  h+='<div class="fw-summary-card '+editCls+(cf==='edits'?' active':'')+'" data-card="edits">';
  h+='<div class="fw-card-count">'+totalEdits+'</div>';
  h+='<div class="fw-card-label">Pending Edits</div>';
  h+='<div class="fw-card-sub">'+(totalEdits?totalEdits+' rule'+(totalEdits>1?'s':'')+' modified':'No changes')+'</div></div>';
  h+='</div>';

  // Apply card filter
  var filtered=rows.slice();
  if(cf==='findings') filtered=filtered.filter(function(r){return r.comp});
  if(cf==='open') filtered=filtered.filter(function(r){return r.openIngress});
  if(cf==='edits') filtered=filtered.filter(function(r){return r.edits>0});
  // Apply toolbar filters
  if(_fwDashFilter!=='all') filtered=filtered.filter(function(r){return r.type===_fwDashFilter});
  if(_fwDashState.vpcFilter!=='all') filtered=filtered.filter(function(r){return r.vpc===_fwDashState.vpcFilter});
  if(_fwDashState.search) filtered=filtered.filter(function(r){return (r.name+' '+r.id+' '+r.vpc+' '+r.desc).toLowerCase().indexOf(_fwDashState.search)!==-1});

  // Sort
  var sortBy=_fwDashState.sort;var dir=_fwDashState.sortDir==='asc'?1:-1;
  filtered.sort(function(a,b){
    if(sortBy==='type') return (a.type.localeCompare(b.type)||a.name.localeCompare(b.name))*dir;
    if(sortBy==='name') return a.name.localeCompare(b.name)*dir;
    if(sortBy==='rules') return (b.rules-a.rules)*dir;
    if(sortBy==='severity'){var sa=a.comp?(sevOrder[a.comp.worst]||9):99;var sb=b.comp?(sevOrder[b.comp.worst]||9):99;return (sa-sb)*dir}
    return 0;
  });

  // Empty state
  if(!filtered.length){
    var emptyMsg=cf==='edits'?'No resources with pending edits':
      cf==='findings'?'No resources with compliance findings':
      cf==='open'?'No SGs with open 0.0.0.0/0 ingress':
      _fwDashState.search?'No resources match "'+_escHtml(_fwDashState.search)+'"':
      'No firewall resources found';
    body.innerHTML=h+'<div style="padding:60px 20px;text-align:center;color:var(--text-muted);font-family:IBM Plex Mono,monospace;font-size:12px">'+emptyMsg+'</div>';
    _fwWireCards(body);_fwRenderFooter(filtered.length,rows.length);
    return;
  }

  // Build table
  var cols=[{k:'type',l:'Type'},{k:'name',l:'Name'},{k:'vpc',l:'VPC'},{k:'rules',l:'Rules'},{k:'severity',l:'Compliance'},{k:'edits',l:'Edits',nosort:true}];
  h+='<table class="fw-dash-table"><thead><tr>';
  cols.forEach(function(c){
    var cls='';if(!c.nosort&&_fwDashState.sort===c.k) cls=_fwDashState.sortDir==='asc'?' sort-asc':' sort-desc';
    h+='<th'+(c.nosort?'':' data-fw-sort="'+c.k+'"')+' class="'+cls+'">'+c.l+'</th>';
  });
  h+='</tr></thead><tbody>';

  filtered.forEach(function(r,idx){
    var trCls='';if(r.edits)trCls+=' has-edits';if(r.comp)trCls+=' has-findings';
    var sevColor=r.comp?({CRITICAL:'#dc2626',HIGH:'#f59e0b',MEDIUM:'#3b82f6',LOW:'#10b981'}[r.comp.worst]||'transparent'):'transparent';
    h+='<tr class="'+trCls+'" style="cursor:pointer;border-left-color:'+sevColor+'" data-fw-idx="'+idx+'">';
    // Type badge
    h+='<td><span class="fw-type-badge '+r.type+'">'+(r.type==='sg'?'SG':r.type==='nacl'?'NACL':'RT')+'</span></td>';
    // Name link
    h+='<td><span class="fw-link" data-fw-action="open" data-fw-type="'+r.type+'" data-fw-id="'+esc(r.id)+'" data-fw-vpc="'+esc(r.vpc||'')+'">'+esc(r.name)+'</span>';
    if(r.desc) h+='<br><span style="font-size:9px;color:var(--text-muted)">'+esc(r.desc.substring(0,60))+'</span>';
    h+='</td>';
    // VPC link
    var vpcObj=(_rlCtx.vpcs||[]).find(function(v){return v.VpcId===r.vpc});
    var vpcLabel=vpcObj?gn(vpcObj,r.vpc):(r.vpc||'--');
    h+='<td><span class="fw-link" data-fw-action="zoom-vpc" data-fw-vpc="'+esc(r.vpc||'')+'">'+esc(vpcLabel)+'</span></td>';
    // Rules
    h+='<td style="font-size:10px">'+r.rulesLabel+'</td>';
    // Compliance
    if(r.comp){
      h+='<td><span class="sev-badge sev-'+r.comp.worst+'" style="font-size:8px;padding:1px 5px">'+r.comp.worst+'</span> <span style="font-size:9px;color:var(--text-muted)">'+r.comp.count+'</span></td>';
    } else {
      h+='<td><span style="color:var(--text-muted);font-size:9px">--</span></td>';
    }
    // Edits
    if(r.edits){
      h+='<td><span class="fw-edit-badge">'+r.edits+'</span></td>';
    } else {
      h+='<td></td>';
    }
    h+='</tr>';
  });
  h+='</tbody></table>';

  body.innerHTML=h;

  // Wire card clicks
  _fwWireCards(body);

  // Wire sortable headers
  body.querySelectorAll('.fw-dash-table th[data-fw-sort]').forEach(function(th){
    th.addEventListener('click',function(){
      var col=this.dataset.fwSort;
      if(_fwDashState.sort===col){_fwDashState.sortDir=_fwDashState.sortDir==='asc'?'desc':'asc'}
      else{_fwDashState.sort=col;_fwDashState.sortDir='asc'}
      _fwDashRender();
    });
  });

  // Wire link clicks via event delegation (use onclick to avoid accumulating listeners on re-render)
  body.onclick=function(e){
    var link=e.target.closest('[data-fw-action]');
    if(!link)return;
    e.stopPropagation();
    var action=link.dataset.fwAction;
    if(action==='open'){
      _fwOpenFullEditor(link.dataset.fwType,link.dataset.fwId,null,link.dataset.fwVpc,null);
    } else if(action==='zoom-vpc'){
      var vid=link.dataset.fwVpc;if(!vid)return;
      closeUnifiedDash();
      setTimeout(function(){_zoomToElement(vid)},250);
    }
  };

  // Wire row clicks
  body.querySelectorAll('.fw-dash-table tbody tr[data-fw-idx]').forEach(function(tr){
    tr.addEventListener('click',function(e){
      if(e.target.closest('[data-fw-action]'))return;
      var idx=parseInt(this.dataset.fwIdx);
      var r=filtered[idx];if(!r)return;
      _fwOpenFullEditor(r.type,r.id,null,r.vpc,null);
    });
  });

  _fwRenderFooter(filtered.length,rows.length);
}

function _fwWireCards(container){
  container.querySelectorAll('.fw-summary-card').forEach(function(card){
    card.addEventListener('click',function(){
      var f=this.dataset.card;
      _fwDashState.cardFilter=(_fwDashState.cardFilter===f)?null:f;
      _fwDashRender();
    });
  });
}

function _fwRenderFooter(shown,total){
  var totalEdits=_fwEdits?_fwEdits.length:0;
  var footer=document.getElementById('udashFooter');
  footer.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;width:100%">'+
    '<span style="font-size:10px;color:var(--text-muted)">'+(totalEdits?totalEdits+' edit'+(totalEdits>1?'s':'')+' pending':'No pending edits')+
    ' | '+shown+' of '+total+' resources</span>'+
    '<div style="display:flex;gap:6px">'+
      '<button id="fwDashExportAll" style="background:rgba(34,211,238,.1);border:1px solid var(--accent-cyan);color:var(--accent-cyan);padding:4px 10px;border-radius:4px;font-size:9px;font-family:IBM Plex Mono,monospace;cursor:pointer">Export All CLI</button>'+
      '<button id="fwDashResetAll" style="background:rgba(239,68,68,.1);border:1px solid var(--accent-red);color:var(--accent-red);padding:4px 10px;border-radius:4px;font-size:9px;font-family:IBM Plex Mono,monospace;cursor:pointer">Reset All</button>'+
    '</div></div>';
  document.getElementById('fwDashExportAll').addEventListener('click',function(){
    if(!_fwEdits||!_fwEdits.length){alert('No edits to export');return}
    var cmds=_fwGenerateCli(_fwEdits);
    if(cmds.length&&navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(cmds.join('\n')).then(function(){
        var btn=document.getElementById('fwDashExportAll');if(!btn)return;btn.textContent='Copied!';setTimeout(function(){if(btn.parentNode)btn.textContent='Export All CLI'},1500);
      }).catch(function(){var btn=document.getElementById('fwDashExportAll');if(!btn)return;btn.textContent='Copy failed';setTimeout(function(){if(btn.parentNode)btn.textContent='Export All CLI'},1500)});
    }
  });
  document.getElementById('fwDashResetAll').addEventListener('click',function(){
    if(!_fwEdits||!_fwEdits.length){alert('No edits to reset');return}
    if(!confirm('Reset all '+_fwEdits.length+' firewall edits?'))return;
    _fwResetAll();_fwDashRender();
  });
}

document.getElementById('firewallBtn').addEventListener('click',openFirewallDash);

