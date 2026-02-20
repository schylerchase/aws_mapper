// Search overlay and resource search functionality
// Handles global search across all AWS resources
// Extracted from index.html for modularization

// === SEARCH ===
function openSearch(){const ov=document.getElementById('searchOverlay');ov.style.display='block';
  const inp=document.getElementById('searchInput');inp.value='';inp.focus();document.getElementById('searchResults').innerHTML=''}
function closeSearch(){document.getElementById('searchOverlay').style.display='none'}
document.getElementById('searchBtn').addEventListener('click',openSearch);
document.getElementById('searchBackdrop').addEventListener('click',closeSearch);
document.getElementById('searchInput').addEventListener('input',function(){
  const q=this.value.toLowerCase().trim();const res=document.getElementById('searchResults');
  if(!q||!_rlCtx){res.innerHTML='';return}
  const matches=[];const isMA=_rlCtx._multiAccount;
  const add=(type,name,id,extra,acct)=>{if(matches.length<30)matches.push({type,name,id,extra,acct:acct||''})};
  (_rlCtx.vpcs||[]).forEach(v=>{const n=gn(v,v.VpcId);if((n+' '+v.VpcId+' '+(v.CidrBlock||'')).toLowerCase().includes(q))add('VPC',n,v.VpcId,v.CidrBlock,v._accountLabel||v._accountId)});
  (_rlCtx.subnets||[]).forEach(s=>{const n=gn(s,s.SubnetId);if((n+' '+s.SubnetId+' '+(s.CidrBlock||'')+' '+(s.AvailabilityZone||'')).toLowerCase().includes(q))add('Subnet',n,s.SubnetId,s.CidrBlock,s._accountLabel||s._accountId)});
  (_rlCtx.instances||[]).forEach(i=>{const n=gn(i,i.InstanceId);if((n+' '+i.InstanceId+' '+(i.InstanceType||'')).toLowerCase().includes(q))add('EC2',n,i.InstanceId,i.InstanceType,i._accountLabel||i._accountId)});
  (_rlCtx.igws||[]).forEach(g=>{const n=gn(g,g.InternetGatewayId);if((n+' '+g.InternetGatewayId).toLowerCase().includes(q))add('IGW',n,g.InternetGatewayId,'',g._accountLabel||g._accountId)});
  (_rlCtx.nats||[]).forEach(g=>{const n=gn(g,g.NatGatewayId);if((n+' '+g.NatGatewayId).toLowerCase().includes(q))add('NAT',n,g.NatGatewayId,'',g._accountLabel||g._accountId)});
  (_rlCtx.rdsInstances||[]).forEach(d=>{if(d.DBInstanceIdentifier.toLowerCase().includes(q))add('RDS',d.DBInstanceIdentifier,d.DBInstanceIdentifier,d.Engine,d._accountLabel||d._accountId)});
  (_rlCtx.lambdaFns||[]).forEach(f=>{if(f.FunctionName.toLowerCase().includes(q))add('Lambda',f.FunctionName,f.FunctionName,f.Runtime,f._accountLabel||f._accountId)});
  (_rlCtx.sgs||[]).forEach(s=>{const n=s.GroupName||s.GroupId;if((n+' '+s.GroupId).toLowerCase().includes(q))add('SG',n,s.GroupId,s.VpcId,s._accountLabel||s._accountId)});
  _getAllNotes().forEach(n=>{if((n.text||'').toLowerCase().includes(q)||(_getResourceName(n.resourceId)||'').toLowerCase().includes(q))add('Note',n.text.slice(0,50),n.resourceId,n.category)});
  let h='';matches.forEach(m=>{const acctBadge=isMA&&m.acct&&m.acct!=='default'?'<span style="font-size:8px;padding:1px 5px;border-radius:3px;background:'+( getAccountColor(m.acct)||'var(--bg-tertiary)')+';color:#000;font-weight:600;white-space:nowrap">'+esc(m.acct)+'</span>':'';h+='<div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px" onclick="closeSearch();_zoomToElement(\''+esc(m.id)+'\');_openDetailForSearch(\''+esc(m.type)+'\',\''+esc(m.id)+'\')"><span style="font-size:9px;color:var(--accent-cyan);font-weight:600;width:50px">'+m.type+'</span><span style="flex:1;font-size:12px;color:var(--text-primary)">'+esc(m.name)+'</span>'+acctBadge+'<span style="font-size:10px;color:var(--text-muted)">'+esc(m.extra)+'</span></div>'});
  if(!matches.length)h='<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">No results</div>';
  res.innerHTML=h;
});
function _zoomToElement(id){
  if(!_mapSvg||!_mapZoom||!_mapG)return;
  var el=_mapG.node().querySelector('[data-vpc-id="'+id+'"],[data-subnet-id="'+id+'"],[data-gwid="'+id+'"],[data-id="'+id+'"]');
  // Fallback: SGs don't have SVG nodes — zoom to their VPC instead
  if(!el&&id&&_rlCtx){
    var sg=(_rlCtx.sgs||[]).find(function(s){return s.GroupId===id});
    if(sg&&sg.VpcId) el=_mapG.node().querySelector('[data-vpc-id="'+sg.VpcId+'"]');
  }
  if(!el)return;const bb=el.getBBox();const cx=bb.x+bb.width/2,cy=bb.y+bb.height/2;
  const svgW=_mapSvg.node().clientWidth,svgH=_mapSvg.node().clientHeight;
  const scale=Math.min(svgW/(bb.width+200),svgH/(bb.height+200),2.5);
  _mapSvg.transition().duration(750).call(_mapZoom.transform,d3.zoomIdentity.translate(svgW/2-cx*scale,svgH/2-cy*scale).scale(scale));
  // Highlight the target element with a pulsing outline
  _highlightElement(el,bb);
}
function _highlightElement(el,bb){
  // Remove any previous highlight
  _mapG.selectAll('.zoom-highlight').remove();
  const pad=8;
  const rect=_mapG.append('rect').attr('class','zoom-highlight')
    .attr('x',bb.x-pad).attr('y',bb.y-pad)
    .attr('width',bb.width+pad*2).attr('height',bb.height+pad*2)
    .attr('rx',6).attr('ry',6)
    .attr('fill','none').attr('stroke','#22d3ee').attr('stroke-width',3)
    .attr('stroke-dasharray','8,4').attr('opacity',0)
    .attr('pointer-events','none');
  // Fade in, pulse 3 times, then fade out
  rect.transition().duration(300).attr('opacity',1)
    .transition().duration(400).attr('stroke-width',5).attr('stroke','#06b6d4')
    .transition().duration(400).attr('stroke-width',3).attr('stroke','#22d3ee')
    .transition().duration(400).attr('stroke-width',5).attr('stroke','#06b6d4')
    .transition().duration(400).attr('stroke-width',3).attr('stroke','#22d3ee')
    .transition().duration(400).attr('stroke-width',5).attr('stroke','#06b6d4')
    .transition().duration(1500).attr('opacity',0)
    .on('end',function(){d3.select(this).remove()});
}

// === RESOLVE RESOURCE TYPE FROM ID ===
function _resolveResourceType(rid){
  if(!rid||!_rlCtx) return null;
  if(rid.startsWith('subnet-')) return 'Subnet';
  if(rid.startsWith('vpc-')) return 'VPC';
  if(rid.startsWith('i-')) return 'EC2';
  if(rid.startsWith('sg-')) return 'SG';
  if(rid.startsWith('igw-')) return 'IGW';
  if(rid.startsWith('nat-')) return 'NAT';
  if(rid.startsWith('vgw-')) return 'VGW';
  if(rid.startsWith('vpce-')) return 'VPCE';
  if(rid.startsWith('tgw-')) return 'TGW';
  if(rid.startsWith('pcx-')) return 'PCX';
  // Check by lookup in context
  if((_rlCtx.rdsInstances||[]).find(function(d){return d.DBInstanceIdentifier===rid})) return 'RDS';
  if((_rlCtx.lambdaFns||[]).find(function(f){return f.FunctionName===rid})) return 'Lambda';
  if((_rlCtx.sgs||[]).find(function(s){return s.GroupId===rid})) return 'SG';
  return null;
}

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

