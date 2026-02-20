// Resource detail panel and spotlight system
// Displays detailed information for selected resources
// Extracted from index.html for modularization

// === ZOOM TO RESOURCE AND OPEN DETAIL PANEL ===
function _zoomAndShowDetail(rid){
  if(!rid||rid==='Multiple') return;
  _zoomToElement(rid);
  var type=_resolveResourceType(rid);
  if(type){
    setTimeout(function(){_openDetailForSearch(type,rid)},400);
  }
}

// === RESOURCE SPOTLIGHT (animated zoom window) ===
var _spotlightActive=false;
function _closeSpotlight(){
  _spotlightActive=false;
  var card=document.getElementById('spotlightCard');
  var backdrop=document.getElementById('spotlightBackdrop');
  if(card){card.style.opacity='0';card.style.transform='translateY(20px) scale(.95)';setTimeout(function(){card.remove()},300)}
  if(backdrop){backdrop.classList.remove('active');setTimeout(function(){backdrop.remove()},400)}
  _mapG&&_mapG.selectAll('.spotlight-ring').remove();
}
function _openResourceSpotlight(rid){
  if(!rid||!_rlCtx)return;
  _closeSpotlight();
  _spotlightActive=true;
  // Find the SVG element
  var el=_mapG.node().querySelector('[data-vpc-id="'+rid+'"],[data-subnet-id="'+rid+'"],[data-gwid="'+rid+'"],[data-id="'+rid+'"]');
  if(!el)return;
  var bb=el.getBBox();
  var cx=bb.x+bb.width/2,cy=bb.y+bb.height/2;
  var svgW=_mapSvg.node().clientWidth,svgH=_mapSvg.node().clientHeight;
  // Animated zoom - tighter zoom than normal
  var scale=Math.min(svgW/(bb.width+300),svgH/(bb.height+300),3.5);
  _mapSvg.transition().duration(900).ease(d3.easeCubicInOut)
    .call(_mapZoom.transform,d3.zoomIdentity.translate(svgW/2-cx*scale,svgH/2-cy*scale).scale(scale));
  // Add animated ring around resource in SVG
  _mapG.selectAll('.spotlight-ring').remove();
  var pad=12;
  var ring=_mapG.append('rect').attr('class','spotlight-ring')
    .attr('x',bb.x-pad).attr('y',bb.y-pad)
    .attr('width',bb.width+pad*2).attr('height',bb.height+pad*2)
    .attr('rx',8).attr('ry',8)
    .attr('fill','none').attr('stroke','#22d3ee').attr('stroke-width',2.5)
    .attr('stroke-dasharray','6,3').attr('opacity',0).attr('pointer-events','none')
    .style('animation','spotlightRingPulse 2s ease-in-out infinite');
  ring.transition().duration(500).delay(400).attr('opacity',1);
  // Gather resource info
  var info=_gatherResourceInfo(rid);
  if(!info)return;
  // Create backdrop
  var backdrop=document.createElement('div');
  backdrop.id='spotlightBackdrop';
  backdrop.className='spotlight-backdrop';
  backdrop.addEventListener('click',_closeSpotlight);
  document.body.appendChild(backdrop);
  requestAnimationFrame(function(){backdrop.classList.add('active')});
  // Build the card
  var card=document.createElement('div');
  card.id='spotlightCard';
  card.className='spotlight-card';
  var typeColors={EC2:'#f97316',RDS:'#a78bfa',Lambda:'#10b981',ALB:'#3b82f6',ECS:'#06b6d4',ElastiCache:'#ef4444',Redshift:'#ec4899',Subnet:'#22d3ee',VPC:'#60a5fa',SG:'#f59e0b',IGW:'#10b981',NAT:'#f97316',VGW:'#8b5cf6',VPCE:'#06b6d4',TGW:'#6366f1',PCX:'#a78bfa'};
  var tc=typeColors[info.type]||'#22d3ee';
  // Header
  var h='<div class="spotlight-header">';
  h+='<button class="spotlight-close" onclick="_closeSpotlight()">&times;</button>';
  h+='<span class="sl-type-badge" style="background:'+tc+'22;color:'+tc+';border:1px solid '+tc+'44">'+_escHtml(info.type)+'</span>';
  h+='<h3>'+_escHtml(info.name)+'</h3>';
  h+='<span class="sl-id" title="Click to copy" onclick="navigator.clipboard&&navigator.clipboard.writeText(\''+_escHtml(rid)+'\')">'+_escHtml(rid)+'</span>';
  h+='</div>';
  // Body
  h+='<div class="spotlight-body">';
  // Details section
  if(info.details&&info.details.length){
    h+='<div class="spotlight-section"><div class="spotlight-section-title">Details</div>';
    h+='<dl class="spotlight-kv">';
    info.details.forEach(function(d){h+='<dt>'+_escHtml(d[0])+'</dt><dd>'+_escHtml(d[1])+'</dd>'});
    h+='</dl></div>';
  }
  // Compliance findings
  if(info.findings&&info.findings.length){
    h+='<div class="spotlight-section"><div class="spotlight-section-title">Compliance ('+info.findings.length+')</div>';
    info.findings.slice(0,5).forEach(function(f){
      var sc={CRITICAL:'#ef4444',HIGH:'#f97316',MEDIUM:'#eab308',LOW:'#3b82f6'}[f.severity]||'#64748b';
      h+='<div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:10px">';
      h+='<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:'+sc+';flex-shrink:0"></span>';
      h+='<span style="color:'+sc+';font-weight:600;width:55px;flex-shrink:0">'+_escHtml(f.severity)+'</span>';
      h+='<span style="color:var(--text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_escHtml(f.message)+'</span>';
      h+='</div>';
    });
    if(info.findings.length>5) h+='<div style="font-size:9px;color:var(--text-muted);padding-top:4px">+'+(info.findings.length-5)+' more findings</div>';
    h+='</div>';
  }
  // Related resources
  if(info.related&&info.related.length){
    h+='<div class="spotlight-section"><div class="spotlight-section-title">Related Resources</div>';
    h+='<div class="spotlight-nearby">';
    info.related.forEach(function(r){
      var rc=typeColors[r.type]||'#64748b';
      h+='<div class="spotlight-nearby-item" data-spotlight-rid="'+_escHtml(r.id)+'">';
      h+='<span class="sn-badge" style="background:'+rc+'"></span>';
      h+='<span class="sn-name">'+_escHtml(r.name)+'</span>';
      h+='<span class="sn-type">'+_escHtml(r.type)+'</span>';
      h+='</div>';
    });
    h+='</div></div>';
  }
  // Nearby resources
  if(info.nearby&&info.nearby.length){
    h+='<div class="spotlight-section"><div class="spotlight-section-title">Nearby Resources</div>';
    h+='<div class="spotlight-nearby">';
    info.nearby.forEach(function(r){
      var rc=typeColors[r.type]||'#64748b';
      h+='<div class="spotlight-nearby-item" data-spotlight-rid="'+_escHtml(r.id)+'">';
      h+='<span class="sn-badge" style="background:'+rc+'"></span>';
      h+='<span class="sn-name">'+_escHtml(r.name)+'</span>';
      h+='<span class="sn-type">'+_escHtml(r.type)+'</span>';
      h+='</div>';
    });
    h+='</div></div>';
  }
  h+='</div>';
  // Actions
  h+='<div class="spotlight-actions">';
  h+='<button class="primary" data-spotlight-detail="'+_escHtml(rid)+'">Full Details</button>';
  h+='<button data-spotlight-deps="'+_escHtml(rid)+'">Dependencies</button>';
  h+='</div>';
  card.innerHTML=h;
  document.body.appendChild(card);
  // Wire events
  card.querySelectorAll('[data-spotlight-rid]').forEach(function(el){
    el.addEventListener('click',function(){
      var nrid=this.dataset.spotlightRid;
      _openResourceSpotlight(nrid);
    });
  });
  card.querySelector('[data-spotlight-detail]').addEventListener('click',function(){
    var drid=this.dataset.spotlightDetail;
    _closeSpotlight();
    var type=_resolveResourceType(drid);
    if(type) _openDetailForSearch(type,drid);
  });
  var depsBtn=card.querySelector('[data-spotlight-deps]');
  if(depsBtn) depsBtn.addEventListener('click',function(){
    var drid=this.dataset.spotlightDeps;
    _closeSpotlight();
    if(typeof showDependencies==='function') showDependencies(drid);
  });
}

function _gatherResourceInfo(rid){
  if(!_rlCtx) return null;
  var info={id:rid,name:rid,type:'Unknown',details:[],findings:[],related:[],nearby:[]};
  var gn2=function(obj,fallback){return obj&&obj.Tags?((obj.Tags.find(function(t){return t.Key==='Name'})||{}).Value||fallback):fallback};
  // Determine type and gather details
  if(rid.startsWith('i-')){
    var inst=(_rlCtx.instances||[]).find(function(i){return i.InstanceId===rid});
    if(!inst) return null;
    info.type='EC2';info.name=gn2(inst,rid);
    info.details=[['Type',inst.InstanceType||'—'],['State',(inst.State||{}).Name||'—'],['Private IP',inst.PrivateIpAddress||'—'],['Public IP',inst.PublicIpAddress||'—'],['AZ',(inst.Placement||{}).AvailabilityZone||'—'],['Subnet',inst.SubnetId||'—'],['VPC',inst.VpcId||'—']];
    // Related: SGs, subnet, VPC
    (inst.SecurityGroups||[]).forEach(function(sg){info.related.push({id:sg.GroupId,name:sg.GroupName||sg.GroupId,type:'SG'})});
    if(inst.SubnetId){var sub=(_rlCtx.subnets||[]).find(function(s){return s.SubnetId===inst.SubnetId});if(sub) info.related.push({id:sub.SubnetId,name:gn2(sub,sub.SubnetId),type:'Subnet'})}
    // Nearby: other instances in same subnet
    (_rlCtx.instances||[]).filter(function(i){return i.SubnetId===inst.SubnetId&&i.InstanceId!==rid}).slice(0,6).forEach(function(i){info.nearby.push({id:i.InstanceId,name:gn2(i,i.InstanceId),type:'EC2'})});
    // Also add RDS, ALBs in same subnet
    (_rlCtx.rdsInstances||[]).forEach(function(db){var subs=(db.DBSubnetGroup&&db.DBSubnetGroup.Subnets||[]).map(function(s){return s.SubnetIdentifier});if(subs.indexOf(inst.SubnetId)!==-1) info.nearby.push({id:db.DBInstanceIdentifier,name:db.DBInstanceIdentifier,type:'RDS'})});
  } else if(rid.startsWith('subnet-')){
    var sub=(_rlCtx.subnets||[]).find(function(s){return s.SubnetId===rid});
    if(!sub) return null;
    info.type='Subnet';info.name=gn2(sub,rid);
    var isPub=_rlCtx.pubSubs&&_rlCtx.pubSubs.has(rid);
    info.details=[['CIDR',sub.CidrBlock||'—'],['AZ',sub.AvailabilityZone||'—'],['Type',isPub?'Public':'Private'],['VPC',sub.VpcId||'—'],['Available IPs',''+(sub.AvailableIpAddressCount||0)]];
    // Nearby: resources in this subnet
    (_rlCtx.instances||[]).filter(function(i){return i.SubnetId===rid}).slice(0,8).forEach(function(i){info.nearby.push({id:i.InstanceId,name:gn2(i,i.InstanceId),type:'EC2'})});
    // Related: VPC, route table
    info.related.push({id:sub.VpcId,name:sub.VpcId,type:'VPC'});
  } else if(rid.startsWith('vpc-')){
    var vpc=(_rlCtx.vpcs||[]).find(function(v){return v.VpcId===rid});
    if(!vpc) return null;
    info.type='VPC';info.name=gn2(vpc,rid);
    var vpcSubs=(_rlCtx.subnets||[]).filter(function(s){return s.VpcId===rid});
    info.details=[['CIDR',vpc.CidrBlock||'—'],['State',vpc.State||'—'],['Subnets',''+vpcSubs.length],['Instances',''+(_rlCtx.instances||[]).filter(function(i){return vpcSubs.some(function(s){return s.SubnetId===i.SubnetId})}).length]];
    vpcSubs.slice(0,8).forEach(function(s){info.nearby.push({id:s.SubnetId,name:gn2(s,s.SubnetId),type:'Subnet'})});
  } else if(rid.startsWith('sg-')){
    var sg=(_rlCtx.sgs||[]).find(function(s){return s.GroupId===rid});
    if(!sg) return null;
    info.type='SG';info.name=sg.GroupName||rid;
    info.details=[['Group ID',rid],['Description',sg.Description||'—'],['VPC',sg.VpcId||'—'],['Inbound Rules',''+(sg.IpPermissions||[]).length],['Outbound Rules',''+(sg.IpPermissionsEgress||[]).length]];
    if(sg.VpcId) info.related.push({id:sg.VpcId,name:sg.VpcId,type:'VPC'});
    // Instances using this SG
    (_rlCtx.instances||[]).filter(function(i){return(i.SecurityGroups||[]).some(function(s){return s.GroupId===rid})}).slice(0,6).forEach(function(i){info.nearby.push({id:i.InstanceId,name:gn2(i,i.InstanceId),type:'EC2'})});
  } else if(rid.startsWith('igw-')){
    var igw=(_rlCtx.igws||[]).find(function(g){return g.InternetGatewayId===rid});
    if(!igw) return null;
    info.type='IGW';info.name=gn2(igw,rid);
    var attachedVpcs=(igw.Attachments||[]).map(function(a){return a.VpcId});
    info.details=[['Gateway ID',rid],['Attached VPCs',attachedVpcs.join(', ')||'None']];
    attachedVpcs.forEach(function(v){info.related.push({id:v,name:v,type:'VPC'})});
  } else if(rid.startsWith('nat-')){
    var nat=(_rlCtx.nats||[]).find(function(g){return g.NatGatewayId===rid});
    if(!nat) return null;
    info.type='NAT';info.name=gn2(nat,rid);
    info.details=[['Gateway ID',rid],['State',nat.State||'—'],['Subnet',nat.SubnetId||'—'],['VPC',nat.VpcId||'—']];
    if(nat.VpcId) info.related.push({id:nat.VpcId,name:nat.VpcId,type:'VPC'});
    if(nat.SubnetId) info.related.push({id:nat.SubnetId,name:nat.SubnetId,type:'Subnet'});
  } else {
    // Try RDS, Lambda, etc. by name lookup
    var rds=(_rlCtx.rdsInstances||[]).find(function(d){return d.DBInstanceIdentifier===rid});
    if(rds){
      info.type='RDS';info.name=rds.DBInstanceIdentifier;
      info.details=[['Engine',(rds.Engine||'')+' '+(rds.EngineVersion||'')],['Class',rds.DBInstanceClass||'—'],['Status',rds.DBInstanceStatus||'—'],['Multi-AZ',rds.MultiAZ?'Yes':'No'],['Storage',(rds.AllocatedStorage||'?')+' GB'],['Encrypted',rds.StorageEncrypted?'Yes':'No']];
      var rdsVpc=rds.DBSubnetGroup?rds.DBSubnetGroup.VpcId:'';
      if(rdsVpc) info.related.push({id:rdsVpc,name:rdsVpc,type:'VPC'});
    } else {
      var lam=(_rlCtx.lambdaFns||[]).find(function(f){return f.FunctionName===rid});
      if(lam){
        info.type='Lambda';info.name=lam.FunctionName;
        info.details=[['Runtime',lam.Runtime||'—'],['Memory',(lam.MemorySize||'?')+' MB'],['Timeout',(lam.Timeout||'?')+' sec'],['Handler',lam.Handler||'—'],['Code Size',((lam.CodeSize||0)/1024).toFixed(1)+' KB']];
        var lamVpc=lam.VpcConfig?lam.VpcConfig.VpcId:'';
        if(lamVpc) info.related.push({id:lamVpc,name:lamVpc,type:'VPC'});
      } else {
        return null;
      }
    }
  }
  // Gather compliance findings for this resource
  (_complianceFindings||[]).forEach(function(f){
    if(f.resource===rid&&!_isMuted(f)) info.findings.push(f);
  });
  return info;
}

// === SEARCH → DETAIL PANEL DISPATCH ===
function _openDetailForSearch(type,id){
  if(!_rlCtx) return;
  const dp=document.getElementById('detailPanel');
  const dpTitle=document.getElementById('dpTitle');
  const dpSub=document.getElementById('dpSub');
  const dpBody=document.getElementById('dpBody');
  _navStack=[];_lastRlType=null;

  if(type==='Subnet'){
    const sub=(_rlCtx.subnets||[]).find(s=>s.SubnetId===id);
    if(sub){
      openSubnetPanel(sub,sub.VpcId,{pubSubs:_rlCtx.pubSubs,subRT:_rlCtx.subRT,subNacl:_rlCtx.subNacl,instBySub:_rlCtx.instBySub,eniBySub:_rlCtx.eniBySub,albBySub:_rlCtx.albBySub,sgByVpc:_rlCtx.sgByVpc,volByInst:_rlCtx.volByInst,enis:_rlCtx.enis,snapByVol:_rlCtx.snapByVol,tgByAlb:_rlCtx.tgByAlb,wafByAlb:_rlCtx.wafByAlb,rdsBySub:_rlCtx.rdsBySub,ecsBySub:_rlCtx.ecsBySub,lambdaBySub:_rlCtx.lambdaBySub,ecacheByVpc:_rlCtx.ecacheByVpc,redshiftByVpc:_rlCtx.redshiftByVpc,cfByAlb:_rlCtx.cfByAlb});
      return;
    }
  }
  if(type==='IGW'||type==='NAT'||type==='VGW'||type==='VPCE'||type==='TGW'||type==='PCX'){
    const gwType=type;
    openGatewayPanel(id,gwType,{gwNames:gwNames,igws:_rlCtx.igws,nats:_rlCtx.nats,vpns:_rlCtx.vpns,vpces:_rlCtx.vpces,peerings:_rlCtx.peerings,rts:_rlCtx.rts,subnets:_rlCtx.subnets,subRT:_rlCtx.subRT,pubSubs:_rlCtx.pubSubs,vpcs:_rlCtx.vpcs,tgwAttachments:_rlCtx.tgwAttachments||[]});
    return;
  }

  // Generic detail panel for VPC, EC2, RDS, Lambda, SG, Note
  let h='';
  if(type==='VPC'){
    const vpc=(_rlCtx.vpcs||[]).find(v=>v.VpcId===id);
    if(!vpc) return;
    const nm=gn(vpc,vpc.VpcId);
    const subs=(_rlCtx.subnets||[]).filter(s=>s.VpcId===id);
    const pubCount=subs.filter(s=>_rlCtx.pubSubs&&_rlCtx.pubSubs.has(s.SubnetId)).length;
    const gws=[];
    (_rlCtx.igws||[]).forEach(g=>{if((g.Attachments||[]).some(a=>a.VpcId===id))gws.push({type:'IGW',id:g.InternetGatewayId,name:gn(g,g.InternetGatewayId)})});
    (_rlCtx.nats||[]).forEach(g=>{if(g.VpcId===id)gws.push({type:'NAT',id:g.NatGatewayId,name:gn(g,g.NatGatewayId)})});
    const sgs=(_rlCtx.sgs||[]).filter(s=>s.VpcId===id);
    const insts=(_rlCtx.instances||[]).filter(i=>subs.some(s=>s.SubnetId===i.SubnetId));
    dpTitle.innerHTML=_escHtml(nm);
    dpSub.innerHTML='<span class="copyable" data-copy="'+esc(id)+'">'+esc(id)+'</span> &middot; '+esc(vpc.CidrBlock||'');
    h+='<div class="dp-section"><div class="dp-sec-hdr" onclick="this.classList.toggle(\'collapsed\');this.nextElementSibling.classList.toggle(\'hidden\')"><span class="dp-sec-title">Overview</span><span class="dp-sec-arr">&#9660;</span></div><div class="dp-sec-body">';
    h+='<table class="dp-kv"><tr><td>CIDR</td><td>'+esc(vpc.CidrBlock||'—')+'</td></tr>';
    h+='<tr><td>Subnets</td><td>'+subs.length+' ('+pubCount+' public, '+(subs.length-pubCount)+' private)</td></tr>';
    h+='<tr><td>Gateways</td><td>'+gws.length+'</td></tr>';
    h+='<tr><td>Security Groups</td><td>'+sgs.length+'</td></tr>';
    h+='<tr><td>Instances</td><td>'+insts.length+'</td></tr>';
    h+='<tr><td>State</td><td>'+esc(vpc.State||'—')+'</td></tr></table></div></div>';
    if(subs.length){
      h+='<div class="dp-section"><div class="dp-sec-hdr" onclick="this.classList.toggle(\'collapsed\');this.nextElementSibling.classList.toggle(\'hidden\')"><span class="dp-sec-title">Subnets</span><span><span class="dp-sec-count">'+subs.length+'</span><span class="dp-sec-arr">&#9660;</span></span></div><div class="dp-sec-body">';
      subs.forEach(s=>{
        const sn=gn(s,s.SubnetId);const isPub=_rlCtx.pubSubs&&_rlCtx.pubSubs.has(s.SubnetId);
        h+='<div style="padding:4px 0;cursor:pointer;color:var(--accent-cyan);font-size:calc(11px * var(--dp-txt-scale,1))" onclick="_openDetailForSearch(\'Subnet\',\''+esc(s.SubnetId)+'\');_zoomToElement(\''+esc(s.SubnetId)+'\')">'+_escHtml(sn)+' <span style="color:var(--text-muted);font-size:9px">'+(isPub?'PUB':'PRV')+' '+esc(s.CidrBlock||'')+'</span></div>';
      });
      h+='</div></div>';
    }
    if(gws.length){
      h+='<div class="dp-section"><div class="dp-sec-hdr" onclick="this.classList.toggle(\'collapsed\');this.nextElementSibling.classList.toggle(\'hidden\')"><span class="dp-sec-title">Gateways</span><span><span class="dp-sec-count">'+gws.length+'</span><span class="dp-sec-arr">&#9660;</span></span></div><div class="dp-sec-body">';
      gws.forEach(g=>{
        h+='<div style="padding:4px 0;cursor:pointer;color:'+gcv(g.type)+';font-size:calc(11px * var(--dp-txt-scale,1))" onclick="_openDetailForSearch(\''+g.type+'\',\''+esc(g.id)+'\')">'+g.type+': '+_escHtml(g.name)+'</div>';
      });
      h+='</div></div>';
    }
  } else if(type==='EC2'){
    const inst=(_rlCtx.instances||[]).find(i=>i.InstanceId===id);
    if(!inst) return;
    const nm=gn(inst,inst.InstanceId);
    dpTitle.innerHTML=_escHtml(nm);
    dpSub.innerHTML='<span class="copyable" data-copy="'+esc(id)+'">'+esc(id)+'</span> &middot; '+esc(inst.InstanceType||'');
    h+='<table class="dp-kv">';
    h+='<tr><td>Type</td><td>'+esc(inst.InstanceType||'—')+'</td></tr>';
    h+='<tr><td>State</td><td>'+esc((inst.State||{}).Name||'—')+'</td></tr>';
    h+='<tr><td>AZ</td><td>'+esc(inst.Placement&&inst.Placement.AvailabilityZone||'—')+'</td></tr>';
    h+='<tr><td>Private IP</td><td>'+esc(inst.PrivateIpAddress||'—')+'</td></tr>';
    h+='<tr><td>Public IP</td><td>'+esc(inst.PublicIpAddress||'—')+'</td></tr>';
    h+='<tr><td>Subnet</td><td><span style="cursor:pointer;color:var(--accent-cyan)" onclick="_openDetailForSearch(\'Subnet\',\''+esc(inst.SubnetId)+'\');_zoomToElement(\''+esc(inst.SubnetId)+'\')">'+esc(inst.SubnetId||'—')+'</span></td></tr>';
    h+='<tr><td>VPC</td><td><span style="cursor:pointer;color:var(--accent-cyan)" onclick="_openDetailForSearch(\'VPC\',\''+esc(inst.VpcId)+'\')">'+esc(inst.VpcId||'—')+'</span></td></tr>';
    h+='<tr><td>AMI</td><td>'+esc(inst.ImageId||'—')+'</td></tr>';
    h+='<tr><td>Key</td><td>'+esc(inst.KeyName||'—')+'</td></tr>';
    const sgIds=(inst.SecurityGroups||[]).map(s=>s.GroupId);
    if(sgIds.length){h+='<tr><td>SGs</td><td>'+sgIds.map(s=>'<span style="cursor:pointer;color:var(--accent-cyan)" onclick="_openDetailForSearch(\'SG\',\''+esc(s)+'\')">'+esc(s)+'</span>').join(', ')+'</td></tr>';}
    h+='</table>';
  } else if(type==='RDS'){
    const db=(_rlCtx.rdsInstances||[]).find(d=>d.DBInstanceIdentifier===id);
    if(!db) return;
    dpTitle.innerHTML=_escHtml(db.DBInstanceIdentifier);
    dpSub.innerHTML=esc(db.Engine||'')+' &middot; '+esc(db.DBInstanceClass||'');
    h+='<table class="dp-kv">';
    h+='<tr><td>Engine</td><td>'+esc(db.Engine||'—')+' '+esc(db.EngineVersion||'')+'</td></tr>';
    h+='<tr><td>Class</td><td>'+esc(db.DBInstanceClass||'—')+'</td></tr>';
    h+='<tr><td>Status</td><td>'+esc(db.DBInstanceStatus||'—')+'</td></tr>';
    h+='<tr><td>Multi-AZ</td><td>'+(db.MultiAZ?'Yes':'No')+'</td></tr>';
    h+='<tr><td>Storage</td><td>'+esc(db.AllocatedStorage||'—')+' GB '+esc(db.StorageType||'')+'</td></tr>';
    h+='<tr><td>Endpoint</td><td>'+esc(db.Endpoint&&db.Endpoint.Address||'—')+'</td></tr>';
    h+='<tr><td>Encrypted</td><td>'+(db.StorageEncrypted?'Yes':'No')+'</td></tr>';
    h+='<tr><td>Backup</td><td>'+esc(db.BackupRetentionPeriod||0)+' days</td></tr>';
    h+='<tr><td>Del Protection</td><td>'+(db.DeletionProtection?'Yes':'No')+'</td></tr>';
    h+='</table>';
  } else if(type==='Lambda'){
    const fn=(_rlCtx.lambdaFns||[]).find(f=>f.FunctionName===id);
    if(!fn) return;
    dpTitle.innerHTML=_escHtml(fn.FunctionName);
    dpSub.innerHTML=esc(fn.Runtime||'')+ ' &middot; '+esc(fn.Handler||'');
    h+='<table class="dp-kv">';
    h+='<tr><td>Runtime</td><td>'+esc(fn.Runtime||'—')+'</td></tr>';
    h+='<tr><td>Memory</td><td>'+esc(fn.MemorySize||'—')+' MB</td></tr>';
    h+='<tr><td>Timeout</td><td>'+esc(fn.Timeout||'—')+' sec</td></tr>';
    h+='<tr><td>Handler</td><td>'+esc(fn.Handler||'—')+'</td></tr>';
    h+='<tr><td>Code Size</td><td>'+((fn.CodeSize||0)/1024).toFixed(1)+' KB</td></tr>';
    h+='<tr><td>Last Modified</td><td>'+esc(fn.LastModified||'—')+'</td></tr>';
    const vpcCfg=fn.VpcConfig;
    if(vpcCfg&&vpcCfg.VpcId){
      h+='<tr><td>VPC</td><td><span style="cursor:pointer;color:var(--accent-cyan)" onclick="_openDetailForSearch(\'VPC\',\''+esc(vpcCfg.VpcId)+'\')">'+esc(vpcCfg.VpcId)+'</span></td></tr>';
      h+='<tr><td>Subnets</td><td>'+(vpcCfg.SubnetIds||[]).map(s=>'<span style="cursor:pointer;color:var(--accent-cyan)" onclick="_openDetailForSearch(\'Subnet\',\''+esc(s)+'\');_zoomToElement(\''+esc(s)+'\')">'+esc(s)+'</span>').join(', ')+'</td></tr>';
    }
    h+='</table>';
  } else if(type==='SG'){
    const sg=(_rlCtx.sgs||[]).find(s=>s.GroupId===id);
    if(!sg) return;
    dpTitle.innerHTML=_escHtml(sg.GroupName||sg.GroupId);
    dpSub.innerHTML='<span class="copyable" data-copy="'+esc(id)+'">'+esc(id)+'</span> &middot; '+esc(sg.VpcId||'');
    h+='<table class="dp-kv"><tr><td>Description</td><td>'+esc(sg.Description||'—')+'</td></tr>';
    h+='<tr><td>VPC</td><td><span style="cursor:pointer;color:var(--accent-cyan)" onclick="_openDetailForSearch(\'VPC\',\''+esc(sg.VpcId)+'\')">'+esc(sg.VpcId||'—')+'</span></td></tr></table>';
    const inRules=sg.IpPermissions||[];const outRules=sg.IpPermissionsEgress||[];
    if(inRules.length){
      h+='<div class="dp-section"><div class="dp-sec-hdr" onclick="this.classList.toggle(\'collapsed\');this.nextElementSibling.classList.toggle(\'hidden\')"><span class="dp-sec-title">Inbound Rules</span><span><span class="dp-sec-count">'+inRules.length+'</span><span class="dp-sec-arr">&#9660;</span></span></div><div class="dp-sec-body"><table class="dp-tbl"><tr><th>Proto</th><th>Port</th><th>Source</th></tr>';
      inRules.forEach(r=>{
        const proto=r.IpProtocol==='-1'?'All':r.IpProtocol;
        const port=r.FromPort===r.ToPort?(r.FromPort===-1?'All':r.FromPort):r.FromPort+'-'+r.ToPort;
        const src=(r.IpRanges||[]).map(x=>x.CidrIp).concat((r.UserIdGroupPairs||[]).map(x=>x.GroupId)).join(', ')||'—';
        h+='<tr><td>'+esc(proto)+'</td><td>'+esc(port)+'</td><td>'+esc(src)+'</td></tr>';
      });
      h+='</table></div></div>';
    }
    if(outRules.length){
      h+='<div class="dp-section"><div class="dp-sec-hdr collapsed" onclick="this.classList.toggle(\'collapsed\');this.nextElementSibling.classList.toggle(\'hidden\')"><span class="dp-sec-title">Outbound Rules</span><span><span class="dp-sec-count">'+outRules.length+'</span><span class="dp-sec-arr">&#9660;</span></span></div><div class="dp-sec-body hidden"><table class="dp-tbl"><tr><th>Proto</th><th>Port</th><th>Dest</th></tr>';
      outRules.forEach(r=>{
        const proto=r.IpProtocol==='-1'?'All':r.IpProtocol;
        const port=r.FromPort===r.ToPort?(r.FromPort===-1?'All':r.FromPort):r.FromPort+'-'+r.ToPort;
        const dst=(r.IpRanges||[]).map(x=>x.CidrIp).concat((r.UserIdGroupPairs||[]).map(x=>x.GroupId)).join(', ')||'—';
        h+='<tr><td>'+esc(proto)+'</td><td>'+esc(port)+'</td><td>'+esc(dst)+'</td></tr>';
      });
      h+='</table></div></div>';
    }
  } else if(type==='Note'){
    // For notes, just zoom — no extra panel
    return;
  } else {
    return; // Unknown type, no panel
  }
  dpBody.innerHTML=h;
  dp.classList.add('open');
}

// === TIME-SERIES SNAPSHOTS ===
const _SNAP_KEY='aws_mapper_snapshots';
const _MAX_SNAPSHOTS=30;
let _snapshots=[];
let _viewingHistory=false;
let _currentSnapshot=null;// saved current state when viewing history
try{const s=localStorage.getItem(_SNAP_KEY);if(s)_snapshots=JSON.parse(s)}catch(e){_snapshots=[]}
function _saveSnapshots(){try{localStorage.setItem(_SNAP_KEY,JSON.stringify(_snapshots))}catch(e){
  // If storage full, trim oldest half
  if(_snapshots.length>4){_snapshots=_snapshots.slice(Math.floor(_snapshots.length/2));try{localStorage.setItem(_SNAP_KEY,JSON.stringify(_snapshots))}catch(e2){}}
}}
function _computeChecksum(textareas){
  let s='';Object.keys(textareas).sort().forEach(k=>s+=k+':'+String(textareas[k]).length+';');
  let h=0;for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0}return h;
}
function takeSnapshot(label,auto){
  const textareas={};
  document.querySelectorAll('.ji').forEach(el=>{const v=el.value.trim();if(v)textareas[el.id]=v});
  if(!Object.keys(textareas).length)return null;
  const checksum=_computeChecksum(textareas);
  // Skip if identical to last snapshot
  if(_snapshots.length>0&&_snapshots[_snapshots.length-1].checksum===checksum)return null;
  const snap={
    id:'snap-'+Date.now(),
    timestamp:new Date().toISOString(),
    label:label||(auto?'Auto':'Manual'),
    auto:!!auto,
    checksum:checksum,
    accountLabel:(document.getElementById('accountLabel')||{}).value||'',
    layout:(document.getElementById('layoutMode')||{}).value||'grid',
    textareas:textareas,
    annotations:JSON.parse(JSON.stringify(_annotations||{}))
  };
  _snapshots.push(snap);
  while(_snapshots.length>_MAX_SNAPSHOTS)_snapshots.shift();
  _saveSnapshots();
  _renderTimeline();
  if(!auto)_showToast('Snapshot saved: '+(label||'Manual'));
  return snap;
}
function _renderTimeline(){
  const container=document.getElementById('timelineDots');if(!container)return;
  container.innerHTML='';
  if(!_snapshots.length){document.getElementById('timelineLabel').textContent='No snapshots';return}
  document.getElementById('timelineLabel').textContent=_snapshots.length+' snap'+((_snapshots.length!==1)?'s':'');
  const w=container.clientWidth||400;
  if(_snapshots.length===1){
    _addTimelineDot(container,_snapshots[0],w/2,0);
    return;
  }
  const t0=new Date(_snapshots[0].timestamp).getTime();
  const t1=new Date(_snapshots[_snapshots.length-1].timestamp).getTime();
  const span=t1-t0||1;
  _snapshots.forEach((snap,i)=>{
    const t=new Date(snap.timestamp).getTime();
    const x=((t-t0)/span)*(w-20)+10;
    _addTimelineDot(container,snap,x,i);
  });
}
function _addTimelineDot(container,snap,x,idx){
  const dot=document.createElement('div');
  dot.className='timeline-dot'+(snap.auto?' auto':'');
  dot.style.left=x+'px';
  const d=new Date(snap.timestamp);
  const timeStr=d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  dot.innerHTML='<div class="timeline-tooltip">'+esc(snap.label)+' - '+timeStr+'</div>';
  dot.addEventListener('click',()=>_viewSnapshot(idx));
  dot.addEventListener('contextmenu',function(ev){ev.preventDefault();if(typeof _compareWithSnapshot==='function')_compareWithSnapshot(snap)});
  dot.title='Click: view | Right-click: compare with current';
  container.appendChild(dot);
}
function _viewSnapshot(idx){
  const snap=_snapshots[idx];if(!snap)return;
  if(!_viewingHistory){
    // Save current state
    _currentSnapshot={};
    document.querySelectorAll('.ji').forEach(el=>{_currentSnapshot[el.id]=el.value});
    _currentSnapshot._accountLabel=(document.getElementById('accountLabel')||{}).value||'';
    _currentSnapshot._layout=(document.getElementById('layoutMode')||{}).value||'grid';
    _currentSnapshot._annotations=JSON.parse(JSON.stringify(_annotations||{}));
  }
  _viewingHistory=true;
  // Load snapshot data
  document.querySelectorAll('.ji').forEach(el=>{el.value='';el.className='ji'});
  Object.entries(snap.textareas||{}).forEach(([id,val])=>{
    const el=document.getElementById(id);
    if(el){el.value=val;try{JSON.parse(val);el.className='ji valid'}catch(e){el.className='ji invalid'}}
  });
  if(snap.accountLabel){const al=document.getElementById('accountLabel');if(al)al.value=snap.accountLabel}
  if(snap.annotations)_annotations=JSON.parse(JSON.stringify(snap.annotations));
  renderMap();
  // Show history banner
  const d=new Date(snap.timestamp);
  document.getElementById('historyLabel').textContent='VIEWING: '+snap.label+' - '+d.toLocaleDateString()+' '+d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  document.getElementById('historyBanner').style.display='flex';
  // Highlight active dot
  document.querySelectorAll('.timeline-dot').forEach((d,i)=>d.classList.toggle('active',i===idx));
  // Disable inputs
  document.querySelectorAll('.ji').forEach(el=>el.readOnly=true);
}
function _returnToCurrent(){
  if(!_viewingHistory||!_currentSnapshot)return;
  _viewingHistory=false;
  document.querySelectorAll('.ji').forEach(el=>{
    el.value=_currentSnapshot[el.id]||'';
    el.readOnly=false;
    if(el.value.trim()){try{JSON.parse(el.value);el.className='ji valid'}catch(e){el.className='ji invalid'}}else{el.className='ji'}
  });
  if(_currentSnapshot._accountLabel){const al=document.getElementById('accountLabel');if(al)al.value=_currentSnapshot._accountLabel}
  if(_currentSnapshot._annotations)_annotations=JSON.parse(JSON.stringify(_currentSnapshot._annotations));
  document.getElementById('historyBanner').style.display='none';
  document.querySelectorAll('.timeline-dot').forEach(d=>d.classList.remove('active'));
  _currentSnapshot=null;
  renderMap();
}
function _restoreSnapshot(){
  if(!_viewingHistory)return;
  _viewingHistory=false;
  _currentSnapshot=null;
  document.getElementById('historyBanner').style.display='none';
  document.querySelectorAll('.ji').forEach(el=>el.readOnly=false);
  document.querySelectorAll('.timeline-dot').forEach(d=>d.classList.remove('active'));
  _showToast('Snapshot restored as current state');
  renderMap();
}
function openTimeline(){document.getElementById('timelineBar').classList.add('open');_renderTimeline()}
function closeTimeline(){document.getElementById('timelineBar').classList.remove('open')}
// Auto-snapshot on render (with 2-min minimum interval)
let _lastAutoSnap=0;
const _origRenderMap=typeof renderMap==='function'?null:null;// renderMap defined elsewhere, hook via event
// Hook: take auto-snapshot after successful render
// We add this at the end of the stats bar rendering

