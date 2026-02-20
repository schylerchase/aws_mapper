// Traffic flow visualization and auto-discovery engine
// Traces network paths and simulates traffic flows
// Extracted from index.html for modularization

// === TRAFFIC FLOW VISUALIZATION ===
let _flowMode=false;
let _flowSource=null;
let _flowTarget=null;
let _flowConfig={protocol:'tcp',port:443};
let _flowPath=null;
let _flowBlocked=null;
let _flowStepIndex=-1;
let _flowSelecting=null;
// Multi-hop waypoint state
let _flowWaypoints=[];       // [{ref:{type,id}, config:{protocol,port}}]
let _flowLegs=[];            // [{source,target,config,result:{path,blocked}}]
let _flowActiveLeg=-1;       // which leg is expanded in detail, -1=all
let _flowSelectingWaypoint=-1; // insert position for new waypoint
let _flowSuggestions=[];     // [{via:{type,id,name}, leg1Result, leg2Result, leg1Config}]

function _suggestPort(targetType, targetResource){
  if(targetType==='rds') return (targetResource&&targetResource.Endpoint&&targetResource.Endpoint.Port)||3306;
  if(targetType==='ecache') return 6379;
  if(targetType==='alb') return 443;
  if(targetType==='instance') return 22;
  if(targetType==='lambda') return 443;
  if(targetType==='ecs') return 443;
  return 443;
}

function _cidrContains(cidr, ip){
  if(!cidr||!ip) return false;
  if(cidr==='0.0.0.0/0') return true;
  const parts=cidr.split('/');
  if(parts.length!==2) return false;
  const mask=parseInt(parts[1],10);
  const cidrNum=_ipToNum(parts[0]);
  const ipNum=_ipToNum(ip);
  if(cidrNum===null||ipNum===null) return false;
  const shift=32-mask;
  return (cidrNum>>>shift)===(ipNum>>>shift);
}

function _ipToNum(ip){
  if(!ip) return null;
  const p=ip.split('.');
  if(p.length!==4) return null;
  return ((parseInt(p[0])<<24)|(parseInt(p[1])<<16)|(parseInt(p[2])<<8)|parseInt(p[3]))>>>0;
}

function _ipFromCidr(cidr){
  if(!cidr) return null;
  return cidr.split('/')[0];
}

function _protoMatch(ruleProto, queryProto){
  if(ruleProto==='-1'||ruleProto==='all') return true;
  const rp=String(ruleProto).toLowerCase();
  const qp=String(queryProto).toLowerCase();
  if(rp===qp) return true;
  if(rp==='6'&&qp==='tcp') return true;
  if(rp==='17'&&qp==='udp') return true;
  if(rp==='1'&&qp==='icmp') return true;
  if(qp==='6'&&rp==='tcp') return true;
  if(qp==='17'&&rp==='udp') return true;
  return false;
}

function _portInRange(port, from, to){
  if(from===undefined&&to===undefined) return true;
  if(from===0&&to===65535) return true;
  if(from===-1&&to===-1) return true;
  const p=parseInt(port,10);
  return p>=parseInt(from,10)&&p<=parseInt(to,10);
}

function evaluateRouteTable(rt, destCidr){
  if(!rt||!rt.Routes) return {target:'local',type:'local'};
  const dest=_ipFromCidr(destCidr)||destCidr;
  let bestMatch=null;
  let bestMask=-1;
  rt.Routes.forEach(function(r){
    const rCidr=r.DestinationCidrBlock||r.DestinationIpv6CidrBlock;
    if(!rCidr) return;
    const mask=parseInt(rCidr.split('/')[1],10)||0;
    if(_cidrContains(rCidr, dest)&&mask>bestMask){
      bestMask=mask;
      bestMatch=r;
    }
  });
  if(!bestMatch) return {target:'blackhole',type:'blackhole',detail:'No matching route'};
  if(bestMatch.State==='blackhole') return {target:'blackhole',type:'blackhole',detail:'Route is blackholed'};
  if(bestMatch.GatewayId&&bestMatch.GatewayId.startsWith('igw-')) return {target:bestMatch.GatewayId,type:'igw'};
  if(bestMatch.NatGatewayId) return {target:bestMatch.NatGatewayId,type:'nat'};
  if(bestMatch.VpcPeeringConnectionId) return {target:bestMatch.VpcPeeringConnectionId,type:'pcx'};
  if(bestMatch.TransitGatewayId) return {target:bestMatch.TransitGatewayId,type:'tgw'};
  if(bestMatch.GatewayId==='local') return {target:'local',type:'local'};
  if(bestMatch.VpcEndpointId) return {target:bestMatch.VpcEndpointId,type:'vpce'};
  if(bestMatch.GatewayId&&bestMatch.GatewayId.startsWith('vgw-')) return {target:bestMatch.GatewayId,type:'vgw'};
  return {target:'local',type:'local'};
}

function evaluateNACL(nacl, direction, protocol, port, sourceCidr, opts){
  if(!nacl||!nacl.Entries) return {action:'allow',rule:'Default allow (no NACL)',ruleNum:'-'};
  const entries=(nacl.Entries||[])
    .filter(function(e){return e.Egress===(direction==='outbound')})
    .sort(function(a,b){return a.RuleNumber-b.RuleNumber});
  // Discovery mode: if no entries for this direction, assume allow (missing data)
  if(entries.length===0&&opts&&opts.assumeAllow) return {action:'allow',rule:'No '+direction+' rules defined (assumed allow)',ruleNum:'-'};
  for(var i=0;i<entries.length;i++){
    var e=entries[i];
    if(e.RuleNumber===32767) continue;
    var protoOk=_protoMatch(e.Protocol, protocol);
    if(!protoOk) continue;
    var portOk=true;
    if(e.PortRange){
      portOk=_portInRange(port, e.PortRange.From, e.PortRange.To);
    }
    if(!portOk) continue;
    var cidrOk=false;
    if(e.CidrBlock) cidrOk=_cidrContains(e.CidrBlock, _ipFromCidr(sourceCidr));
    if(!cidrOk&&e.Ipv6CidrBlock){
      // IPv6 rules: match ::/0 as catch-all, skip others for IPv4 traffic
      if(e.Ipv6CidrBlock==='::/0') cidrOk=true;
      else continue;
    }
    if(!cidrOk) continue;
    var act=e.RuleAction==='allow'?'allow':'deny';
    var cidrLabel=e.CidrBlock||e.Ipv6CidrBlock||'';
    return {action:act,rule:'Rule #'+e.RuleNumber+' '+act.toUpperCase()+' '+_protoName(e.Protocol)+' port '+(e.PortRange?e.PortRange.From+'-'+e.PortRange.To:'all')+' from '+cidrLabel,ruleNum:e.RuleNumber};
  }
  return {action:'deny',rule:'Default deny (no matching rule)',ruleNum:'*'};
}

function _protoName(p){
  if(p==='-1'||p==='all') return 'ALL';
  if(p==='6') return 'TCP';
  if(p==='17') return 'UDP';
  if(p==='1') return 'ICMP';
  return String(p).toUpperCase();
}

function evaluateSG(sgs, direction, protocol, port, sourceCidr, opts){
  if(!sgs||sgs.length===0) return {action:(opts&&opts.assumeAllow)?'allow':'deny',rule:'No security groups attached',matchedSg:null};
  for(var si=0;si<sgs.length;si++){
    var sg=sgs[si];
    var rules=direction==='inbound'?(sg.IpPermissions||[]):(sg.IpPermissionsEgress||[]);
    for(var ri=0;ri<rules.length;ri++){
      var r=rules[ri];
      var protoOk=_protoMatch(String(r.IpProtocol), protocol);
      if(!protoOk) continue;
      var portOk=true;
      if(r.FromPort!==undefined&&r.FromPort!==-1){
        portOk=_portInRange(port, r.FromPort, r.ToPort);
      }
      if(!portOk) continue;
      var cidrOk=false;
      (r.IpRanges||[]).forEach(function(ipr){
        if(_cidrContains(ipr.CidrIp, _ipFromCidr(sourceCidr))) cidrOk=true;
      });
      (r.Ipv6Ranges||[]).forEach(function(ipr){
        if(ipr.CidrIpv6==='::/0') cidrOk=true;
      });
      // SG-to-SG references: validate source SG IDs if provided, else assume allow
      if(!cidrOk&&(r.UserIdGroupPairs||[]).length>0){
        var srcSgIds=opts&&opts.sourceSgIds;
        if(srcSgIds){(r.UserIdGroupPairs||[]).forEach(function(gp){if(gp.GroupId&&srcSgIds.indexOf(gp.GroupId)!==-1)cidrOk=true})}
        else{(r.UserIdGroupPairs||[]).forEach(function(gp){if(gp.GroupId)cidrOk=true})}
      }
      if(cidrOk){
        var desc=sg.GroupName+': '+_protoName(String(r.IpProtocol))+' port '+(r.FromPort!==-1&&r.FromPort!==undefined?r.FromPort+'-'+r.ToPort:'all');
        return {action:'allow',rule:desc,matchedSg:sg.GroupId||sg.GroupName};
      }
    }
  }
  return {action:'deny',rule:'No matching SG rule for '+protocol+'/'+port,matchedSg:null};
}

function _resolveNetworkPosition(type, id, ctx){
  if(!ctx) return null;
  if(type==='internet') return {subnetId:null,vpcId:null,cidr:'0.0.0.0/0',sgs:[],name:'Internet',ip:'0.0.0.0'};
  if(type==='subnet'){
    var sub=(ctx.subnets||[]).find(function(s){return s.SubnetId===id});
    if(!sub) return null;
    var sgs2=[];
    return {subnetId:sub.SubnetId,vpcId:sub.VpcId,cidr:sub.CidrBlock,sgs:sgs2,name:sub.Tags?((sub.Tags.find(function(t){return t.Key==='Name'})||{}).Value||sub.SubnetId):sub.SubnetId};
  }
  if(type==='instance'){
    var inst=null;
    Object.keys(ctx.instBySub||{}).forEach(function(sid){
      (ctx.instBySub[sid]||[]).forEach(function(i){
        if(i.InstanceId===id) inst=i;
      });
    });
    if(!inst) return null;
    var iSgs=(inst.SecurityGroups||[]).map(function(s){return s.GroupId});
    var fullSgs=iSgs.map(function(gid){return (ctx.sgs||[]).find(function(s){return s.GroupId===gid})}).filter(Boolean);
    return {subnetId:inst.SubnetId,vpcId:inst.VpcId||((ctx.subnets||[]).find(function(s){return s.SubnetId===inst.SubnetId})||{}).VpcId,cidr:inst.PrivateIpAddress?inst.PrivateIpAddress+'/32':null,sgs:fullSgs,name:inst.Tags?((inst.Tags.find(function(t){return t.Key==='Name'})||{}).Value||inst.InstanceId):inst.InstanceId,ip:inst.PrivateIpAddress};
  }
  if(type==='rds'){
    var rds2=null;var rSid=null;
    Object.keys(ctx.rdsBySub||{}).forEach(function(sid){
      (ctx.rdsBySub[sid]||[]).forEach(function(d){
        if(d.DBInstanceIdentifier===id){rds2=d;rSid=sid}
      });
    });
    if(!rds2) return null;
    var rVpc=((ctx.subnets||[]).find(function(s){return s.SubnetId===rSid})||{}).VpcId;
    var rSgs2=(rds2.VpcSecurityGroups||[]).map(function(s){return (ctx.sgs||[]).find(function(sg){return sg.GroupId===s.VpcSecurityGroupId})}).filter(Boolean);
    var rSubCidr=rSid?((ctx.subnets||[]).find(function(s){return s.SubnetId===rSid})||{}).CidrBlock:null;
    return {subnetId:rSid,vpcId:rVpc,cidr:rSubCidr,sgs:rSgs2,name:rds2.DBInstanceIdentifier};
  }
  if(type==='alb'){
    var alb2=null;var aSid=null;
    Object.keys(ctx.albBySub||{}).forEach(function(sid){
      (ctx.albBySub[sid]||[]).forEach(function(a){
        var aid=a.LoadBalancerArn?a.LoadBalancerArn.split('/').pop():'';
        if(aid===id||a.LoadBalancerName===id) {alb2=a;aSid=sid}
      });
    });
    if(!alb2) return null;
    var aVpc=((ctx.subnets||[]).find(function(s){return s.SubnetId===aSid})||{}).VpcId;
    var aSgs=(alb2.SecurityGroups||[]).map(function(gid){return (ctx.sgs||[]).find(function(sg){return sg.GroupId===gid})}).filter(Boolean);
    return {subnetId:aSid,vpcId:aVpc,cidr:null,sgs:aSgs,name:alb2.LoadBalancerName||id};
  }
  if(type==='lambda'){
    var fn2=null;var fSid=null;
    Object.keys(ctx.lambdaBySub||{}).forEach(function(sid){
      (ctx.lambdaBySub[sid]||[]).forEach(function(f){
        if(f.FunctionName===id){fn2=f;fSid=sid}
      });
    });
    if(!fn2) return null;
    var fVpc=((ctx.subnets||[]).find(function(s){return s.SubnetId===fSid})||{}).VpcId;
    var fSgs2=((fn2.VpcConfig||{}).SecurityGroupIds||[]).map(function(gid){return (ctx.sgs||[]).find(function(sg){return sg.GroupId===gid})}).filter(Boolean);
    return {subnetId:fSid,vpcId:fVpc,cidr:null,sgs:fSgs2,name:fn2.FunctionName};
  }
  if(type==='ecs'){
    var ecs2=null;var eSid=null;
    Object.keys(ctx.ecsBySub||{}).forEach(function(sid){
      (ctx.ecsBySub[sid]||[]).forEach(function(s){
        if(s.serviceName===id){ecs2=s;eSid=sid}
      });
    });
    if(!ecs2) return null;
    var eVpc=((ctx.subnets||[]).find(function(s){return s.SubnetId===eSid})||{}).VpcId;
    var eNc=(ecs2.networkConfiguration||{}).awsvpcConfiguration||{};
    var eSgs2=(eNc.securityGroups||[]).map(function(gid){return (ctx.sgs||[]).find(function(sg){return sg.GroupId===gid})}).filter(Boolean);
    return {subnetId:eSid,vpcId:eVpc,cidr:null,sgs:eSgs2,name:ecs2.serviceName||id};
  }
  if(type==='ecache'){
    var ec2=null;var ecVpc=null;
    (ctx.ecacheClusters||[]).forEach(function(c){if(c.CacheClusterId===id) ec2=c});
    if(!ec2) return null;
    // Find VPC from ecacheByVpc (can be Map or plain object)
    var ecMap=ctx.ecacheByVpc||{};
    var ecKeys=ecMap instanceof Map?Array.from(ecMap.keys()):Object.keys(ecMap);
    ecKeys.forEach(function(vid){var arr=ecMap instanceof Map?ecMap.get(vid):ecMap[vid];(arr||[]).forEach(function(c){if(c.CacheClusterId===id) ecVpc=vid})});
    // ElastiCache SGs stored as SecurityGroups array
    var ecSgs=((ec2.SecurityGroups||[]).map(function(s){return (ctx.sgs||[]).find(function(sg){return sg.GroupId===(s.SecurityGroupId||s)})}).filter(Boolean));
    // Find subnet via VPC — pick first private subnet in that VPC
    var ecSid=null;
    if(ecVpc)(ctx.subnets||[]).forEach(function(s){if(!ecSid&&s.VpcId===ecVpc&&!(ctx.pubSubs&&ctx.pubSubs.has(s.SubnetId))) ecSid=s.SubnetId});
    if(!ecSid&&ecVpc)(ctx.subnets||[]).forEach(function(s){if(!ecSid&&s.VpcId===ecVpc) ecSid=s.SubnetId});
    var ecSubCidr=ecSid?((ctx.subnets||[]).find(function(s){return s.SubnetId===ecSid})||{}).CidrBlock:null;
    return {subnetId:ecSid,vpcId:ecVpc,cidr:ecSubCidr,sgs:ecSgs,name:ec2.CacheClusterId};
  }
  if(type==='redshift'){
    var rs2=null;var rsVpc=null;
    (ctx.redshiftClusters||[]).forEach(function(c){if(c.ClusterIdentifier===id) rs2=c});
    if(!rs2) return null;
    var rsMap=ctx.redshiftByVpc||{};
    var rsKeys=rsMap instanceof Map?Array.from(rsMap.keys()):Object.keys(rsMap);
    rsKeys.forEach(function(vid){var arr=rsMap instanceof Map?rsMap.get(vid):rsMap[vid];(arr||[]).forEach(function(c){if(c.ClusterIdentifier===id) rsVpc=vid})});
    var rsSgs=((rs2.VpcSecurityGroups||[]).map(function(s){return (ctx.sgs||[]).find(function(sg){return sg.GroupId===(s.VpcSecurityGroupId||s)})}).filter(Boolean));
    var rsSid=null;
    if(rsVpc)(ctx.subnets||[]).forEach(function(s){if(!rsSid&&s.VpcId===rsVpc&&!(ctx.pubSubs&&ctx.pubSubs.has(s.SubnetId))) rsSid=s.SubnetId});
    if(!rsSid&&rsVpc)(ctx.subnets||[]).forEach(function(s){if(!rsSid&&s.VpcId===rsVpc) rsSid=s.SubnetId});
    var rsSubCidr=rsSid?((ctx.subnets||[]).find(function(s){return s.SubnetId===rsSid})||{}).CidrBlock:null;
    return {subnetId:rsSid,vpcId:rsVpc,cidr:rsSubCidr,sgs:rsSgs,name:rs2.ClusterIdentifier};
  }
  return null;
}

function _resolveClickTarget(el){
  if(!_rlCtx) return null;
  // Internet globe node
  var inetNode=el.closest('.internet-node');
  if(inetNode) return {type:'internet',id:'internet'};
  var resNode=el.closest('.res-node');
  var subNode=el.closest('.subnet-node');
  var gwNode=el.closest('.gw-node')||el.closest('.lz-gw-node');
  if(resNode&&subNode){
    var subId=subNode.getAttribute('data-subnet-id');
    var resIdx=Array.from(subNode.querySelectorAll('.res-node')).indexOf(resNode);
    var tree=buildResTree(subId,_rlCtx);
    if(tree&&tree[resIdx]){
      var res=tree[resIdx];
      if(res.type==='EC2') return {type:'instance',id:res.rid||''};
      if(res.type==='ALB') return {type:'alb',id:res.rid||res.name};
      if(res.type==='RDS') return {type:'rds',id:res.rid||res.name};
      if(res.type==='FN') return {type:'lambda',id:res.rid||res.name};
      if(res.type==='ECS') return {type:'ecs',id:res.rid||res.name};
      if(res.type==='CACHE') return {type:'ecache',id:res.rid||res.name};
      if(res.type==='RS') return {type:'redshift',id:res.rid||res.name};
      if(res.type==='ENI') return {type:'subnet',id:subId};
    }
    return {type:'subnet',id:subId};
  }
  if(subNode){
    return {type:'subnet',id:subNode.getAttribute('data-subnet-id')};
  }
  return null;
}

// --- Internet ↔ Resource trace functions ---
function _traceInternetToResource(target, config, ctx, opts){
  var path=[];var hopN=1;
  var tgtPos=_resolveNetworkPosition(target.type, target.id, ctx);
  if(!tgtPos) return {path:[{hop:1,type:'error',id:'-',action:'block',detail:'Cannot resolve target'}],blocked:{hop:1,reason:'Target not found'}};
  path.push({hop:hopN++,type:'source',id:'Internet',action:'allow',detail:'Source: Internet (0.0.0.0/0)'});
  // Check IGW exists for this VPC
  var vpcId=tgtPos.vpcId;
  var igw=(ctx.igws||[]).find(function(g){return (g.Attachments||[]).some(function(a){return a.VpcId===vpcId})});
  if(!igw){
    path.push({hop:hopN++,type:'igw-check',id:'No IGW',action:'block',detail:'No Internet Gateway attached to VPC '+vpcId});
    path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Target unreachable',subnetId:tgtPos.subnetId});
    return {path:path,blocked:{hop:2,reason:'No Internet Gateway in target VPC',suggestion:'Attach an Internet Gateway to VPC '+vpcId}};
  }
  path.push({hop:hopN++,type:'igw-check',id:igw.InternetGatewayId||'IGW',action:'allow',detail:'Internet Gateway '+igw.InternetGatewayId+' attached to VPC'});
  // Check target in public subnet (has IGW route)
  var isPublic=ctx.pubSubs&&ctx.pubSubs.has(tgtPos.subnetId);
  if(!isPublic){
    path.push({hop:hopN++,type:'route-table',id:'No IGW route',action:'block',detail:'Target subnet '+tgtPos.subnetId+' has no route to IGW (private subnet)'});
    path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Target in private subnet',subnetId:tgtPos.subnetId});
    return {path:path,blocked:{hop:hopN-2,reason:'Target is in a private subnet with no IGW route',suggestion:'Move resource to a public subnet or use an ALB/NAT'}};
  }
  path.push({hop:hopN++,type:'route-table',id:'IGW route',action:'allow',detail:'Target subnet has route to Internet Gateway'});
  // NACL inbound check
  var tgtNacl=(ctx.subNacl||{})[tgtPos.subnetId];
  var naclOpts=opts&&opts.discovery?{assumeAllow:true}:null;
  var naclIn=evaluateNACL(tgtNacl,'inbound',config.protocol,config.port,'0.0.0.0/0',naclOpts);
  path.push({hop:hopN++,type:'nacl-inbound',id:tgtNacl?(tgtNacl.NetworkAclId||'NACL'):'Default NACL',action:naclIn.action,detail:'Target subnet NACL inbound from Internet',rule:naclIn.rule});
  if(naclIn.action==='deny'){
    path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Blocked by NACL',subnetId:tgtPos.subnetId});
    return {path:path,blocked:{hop:hopN-2,reason:'NACL denies inbound from Internet',suggestion:'Add NACL inbound rule allowing '+config.protocol+'/'+config.port+' from 0.0.0.0/0'}};
  }
  // SG inbound check — in discovery mode, skip SG when no SG data attached
  var sgOpts=opts&&opts.discovery?{assumeAllow:true}:null;
  var sgIn=evaluateSG(tgtPos.sgs,'inbound',config.protocol,config.port,'0.0.0.0/0',sgOpts);
  path.push({hop:hopN++,type:'sg-inbound',id:'Target SG',action:sgIn.action,detail:'Security Group inbound from Internet',rule:sgIn.rule});
  if(sgIn.action==='deny'){
    path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Blocked by SG',subnetId:tgtPos.subnetId});
    return {path:path,blocked:{hop:hopN-2,reason:'Security group denies inbound '+config.protocol+'/'+config.port+' from Internet',suggestion:'Add SG inbound rule allowing '+config.protocol+'/'+config.port+' from 0.0.0.0/0'}};
  }
  path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'allow',detail:'Target: '+(tgtPos.name||target.id)+' ('+target.type+')',subnetId:tgtPos.subnetId});
  return {path:path,blocked:null};
}

function _traceResourceToInternet(source, config, ctx, opts){
  var path=[];var hopN=1;
  var srcPos=_resolveNetworkPosition(source.type, source.id, ctx);
  if(!srcPos) return {path:[{hop:1,type:'error',id:'-',action:'block',detail:'Cannot resolve source'}],blocked:{hop:1,reason:'Source not found'}};
  path.push({hop:hopN++,type:'source',id:srcPos.name||source.id,action:'allow',detail:'Source: '+(srcPos.name||source.id)+' ('+source.type+')',subnetId:srcPos.subnetId});
  // SG outbound check — in discovery mode, skip SG when no SG data attached
  var sgOpts=opts&&opts.discovery?{assumeAllow:true}:null;
  var sgOut=evaluateSG(srcPos.sgs,'outbound',config.protocol,config.port,'0.0.0.0/0',sgOpts);
  path.push({hop:hopN++,type:'sg-outbound',id:'Source SG',action:sgOut.action,detail:'SG outbound to Internet',rule:sgOut.rule});
  if(sgOut.action==='deny'){
    path.push({hop:hopN++,type:'target',id:'Internet',action:'block',detail:'Blocked by SG'});
    return {path:path,blocked:{hop:2,reason:'Security group denies outbound',suggestion:'Add SG outbound rule allowing '+config.protocol+'/'+config.port+' to 0.0.0.0/0'}};
  }
  // NACL outbound check
  var srcNacl=(ctx.subNacl||{})[srcPos.subnetId];
  var naclOpts=opts&&opts.discovery?{assumeAllow:true}:null;
  var naclOut=evaluateNACL(srcNacl,'outbound',config.protocol,config.port,'0.0.0.0/0',naclOpts);
  path.push({hop:hopN++,type:'nacl-outbound',id:srcNacl?(srcNacl.NetworkAclId||'NACL'):'Default NACL',action:naclOut.action,detail:'Source subnet NACL outbound to Internet',rule:naclOut.rule});
  if(naclOut.action==='deny'){
    path.push({hop:hopN++,type:'target',id:'Internet',action:'block',detail:'Blocked by NACL'});
    return {path:path,blocked:{hop:hopN-2,reason:'NACL denies outbound to Internet',suggestion:'Add NACL outbound rule allowing '+config.protocol+'/'+config.port}};
  }
  // Route table check for IGW or NAT route
  var srcRT=(ctx.subRT||{})[srcPos.subnetId];
  var hasIgwRoute=false;var hasNatRoute=false;var routeTarget='';
  if(srcRT&&srcRT.Routes){
    srcRT.Routes.forEach(function(r){
      if(r.GatewayId&&r.GatewayId.startsWith('igw-')){hasIgwRoute=true;routeTarget=r.GatewayId}
      if(r.NatGatewayId){hasNatRoute=true;routeTarget=r.NatGatewayId}
    });
  }
  if(hasIgwRoute||hasNatRoute){
    path.push({hop:hopN++,type:'route-table',id:srcRT?(srcRT.RouteTableId||'RT'):'RT',action:'allow',detail:'Route to Internet via '+(hasIgwRoute?'IGW':'NAT')+' ('+routeTarget+')',rule:'0.0.0.0/0 → '+routeTarget});
  } else {
    path.push({hop:hopN++,type:'route-table',id:'No route',action:'block',detail:'No route to Internet (no IGW or NAT Gateway route in route table)'});
    path.push({hop:hopN++,type:'target',id:'Internet',action:'block',detail:'No Internet route'});
    return {path:path,blocked:{hop:hopN-2,reason:'No route to Internet in route table',suggestion:'Add a route 0.0.0.0/0 → IGW or NAT Gateway'}};
  }
  path.push({hop:hopN++,type:'target',id:'Internet',action:'allow',detail:'Target: Internet (0.0.0.0/0)'});
  return {path:path,blocked:null};
}

function _traceFlowLeg(source, target, config, ctx, opts){
  if(source.type==='internet') return _traceInternetToResource(target, config, ctx, opts);
  if(target.type==='internet') return _traceResourceToInternet(source, config, ctx, opts);
  return traceFlow(source, target, config, ctx);
}

function traceFlow(source, target, config, ctx){
  var path=[];
  var srcPos=_resolveNetworkPosition(source.type, source.id, ctx);
  var tgtPos=_resolveNetworkPosition(target.type, target.id, ctx);
  if(!srcPos){return {path:[{hop:1,type:'error',id:'-',action:'block',detail:'Cannot resolve source position'}],blocked:{hop:1,reason:'Source not found'}}}
  if(!tgtPos){return {path:[{hop:1,type:'error',id:'-',action:'block',detail:'Cannot resolve target position'}],blocked:{hop:1,reason:'Target not found'}}}
  var hopN=1;
  var srcCidr=srcPos.ip||srcPos.cidr||((ctx.subnets||[]).find(function(s){return s.SubnetId===srcPos.subnetId})||{}).CidrBlock||'10.0.0.0/8';
  var tgtCidr=tgtPos.ip||tgtPos.cidr||((ctx.subnets||[]).find(function(s){return s.SubnetId===tgtPos.subnetId})||{}).CidrBlock||'10.0.0.0/8';
  path.push({hop:hopN++,type:'source',id:srcPos.name||source.id,action:'allow',detail:'Source: '+(srcPos.name||source.id)+' ('+source.type+') in subnet '+srcPos.subnetId,subnetId:srcPos.subnetId});
  var srcSgIds=srcPos.sgs.map(function(s){return s.GroupId}).filter(Boolean);
  var tgtSgIds=tgtPos.sgs.map(function(s){return s.GroupId}).filter(Boolean);
  if(srcPos.subnetId===tgtPos.subnetId){
    var sgOut=evaluateSG(srcPos.sgs,'outbound',config.protocol,config.port,tgtCidr,{sourceSgIds:tgtSgIds});
    path.push({hop:hopN++,type:'sg-outbound',id:'Source SG',action:sgOut.action,detail:'Security Group outbound check',rule:sgOut.rule});
    if(sgOut.action==='deny'){
      var sgInSkip=evaluateSG(tgtPos.sgs,'inbound',config.protocol,config.port,srcCidr,{sourceSgIds:srcSgIds});
      path.push({hop:hopN++,type:'sg-inbound',id:'Target SG',action:'skip',detail:'Skipped (blocked upstream)',rule:sgInSkip.rule});
      path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Target: '+(tgtPos.name||target.id),subnetId:tgtPos.subnetId});
      return {path:path,blocked:{hop:2,reason:'Source security group denies outbound '+config.protocol+'/'+config.port,suggestion:'Add outbound rule to source SG allowing '+config.protocol+'/'+config.port+' to '+tgtCidr}};
    }
    var sgIn=evaluateSG(tgtPos.sgs,'inbound',config.protocol,config.port,srcCidr,{sourceSgIds:srcSgIds});
    path.push({hop:hopN++,type:'sg-inbound',id:'Target SG',action:sgIn.action,detail:'Security Group inbound check',rule:sgIn.rule});
    if(sgIn.action==='deny'){
      path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Target: '+(tgtPos.name||target.id),subnetId:tgtPos.subnetId});
      return {path:path,blocked:{hop:hopN-2,reason:'Target security group denies inbound '+config.protocol+'/'+config.port,suggestion:'Add inbound rule to target SG allowing '+config.protocol+'/'+config.port+' from '+(srcCidr||'source CIDR')}};
    }
    path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'allow',detail:'Target: '+(tgtPos.name||target.id)+' ('+target.type+')',subnetId:tgtPos.subnetId});
    return {path:path,blocked:null};
  }
  if(srcPos.vpcId===tgtPos.vpcId){
    var srcRT=(ctx.subRT||{})[srcPos.subnetId];
    var rtResult=evaluateRouteTable(srcRT, tgtCidr);
    path.push({hop:hopN++,type:'route-table',id:srcRT?(srcRT.RouteTableId||'RT'):'Main RT',action:rtResult.type==='blackhole'?'block':'allow',detail:'Route table lookup for '+tgtCidr+' => '+rtResult.type+(rtResult.target!=='local'?' ('+rtResult.target+')':''),rule:'Route: '+rtResult.type+(rtResult.target!=='local'?' via '+rtResult.target:'')});
    if(rtResult.type==='blackhole'){
      path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Target unreachable',subnetId:tgtPos.subnetId});
      return {path:path,blocked:{hop:hopN-2,reason:'Route table has no route to destination',suggestion:'Add a route to '+tgtCidr+' in the source subnet route table'}};
    }
    var srcNacl=(ctx.subNacl||{})[srcPos.subnetId];
    var naclOut=evaluateNACL(srcNacl,'outbound',config.protocol,config.port,tgtCidr);
    path.push({hop:hopN++,type:'nacl-outbound',id:srcNacl?(srcNacl.NetworkAclId||'NACL'):'Default NACL',action:naclOut.action,detail:'Source subnet NACL outbound',rule:naclOut.rule});
    if(naclOut.action==='deny'){
      path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Blocked by NACL',subnetId:tgtPos.subnetId});
      return {path:path,blocked:{hop:hopN-2,reason:'Source NACL denies outbound traffic',suggestion:'Add NACL outbound rule allowing '+config.protocol+'/'+config.port}};
    }
    var sgOut2=evaluateSG(srcPos.sgs,'outbound',config.protocol,config.port,tgtCidr,{sourceSgIds:tgtSgIds});
    path.push({hop:hopN++,type:'sg-outbound',id:'Source SG',action:sgOut2.action,detail:'Source SG outbound',rule:sgOut2.rule});
    if(sgOut2.action==='deny'){
      path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Blocked by SG',subnetId:tgtPos.subnetId});
      return {path:path,blocked:{hop:hopN-2,reason:'Source security group denies outbound',suggestion:'Add SG outbound rule for '+config.protocol+'/'+config.port}};
    }
    var tgtNacl=(ctx.subNacl||{})[tgtPos.subnetId];
    var naclIn=evaluateNACL(tgtNacl,'inbound',config.protocol,config.port,srcCidr);
    path.push({hop:hopN++,type:'nacl-inbound',id:tgtNacl?(tgtNacl.NetworkAclId||'NACL'):'Default NACL',action:naclIn.action,detail:'Target subnet NACL inbound',rule:naclIn.rule});
    if(naclIn.action==='deny'){
      path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Blocked by NACL',subnetId:tgtPos.subnetId});
      return {path:path,blocked:{hop:hopN-2,reason:'Target NACL denies inbound traffic',suggestion:'Add NACL inbound rule allowing '+config.protocol+'/'+config.port+' from '+srcCidr}};
    }
    var sgIn2=evaluateSG(tgtPos.sgs,'inbound',config.protocol,config.port,srcCidr,{sourceSgIds:srcSgIds});
    path.push({hop:hopN++,type:'sg-inbound',id:'Target SG',action:sgIn2.action,detail:'Target SG inbound',rule:sgIn2.rule});
    if(sgIn2.action==='deny'){
      path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Blocked by SG',subnetId:tgtPos.subnetId});
      return {path:path,blocked:{hop:hopN-2,reason:'Target security group denies inbound',suggestion:'Add SG inbound rule for '+config.protocol+'/'+config.port+' from source'}};
    }
    path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'allow',detail:'Target: '+(tgtPos.name||target.id)+' ('+target.type+')',subnetId:tgtPos.subnetId});
    return {path:path,blocked:null};
  }
  // Cross-VPC: evaluate source-side controls first (NACL-out, SG-out, route table)
  var srcRTx=(ctx.subRT||{})[srcPos.subnetId];
  var rtResultX=evaluateRouteTable(srcRTx, tgtCidr);
  path.push({hop:hopN++,type:'route-table',id:srcRTx?(srcRTx.RouteTableId||'RT'):'Main RT',action:rtResultX.type==='blackhole'?'block':'allow',detail:'Route table lookup for '+tgtCidr+' => '+rtResultX.type+(rtResultX.target!=='local'?' ('+rtResultX.target+')':''),rule:'Route: '+rtResultX.type+(rtResultX.target!=='local'?' via '+rtResultX.target:'')});
  if(rtResultX.type==='blackhole'){
    path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Target unreachable',subnetId:tgtPos.subnetId});
    return {path:path,blocked:{hop:hopN-2,reason:'Route table has no route to destination',suggestion:'Add a route to '+tgtCidr+' via peering or TGW'}};
  }
  var srcNaclX=(ctx.subNacl||{})[srcPos.subnetId];
  var naclOutX=evaluateNACL(srcNaclX,'outbound',config.protocol,config.port,tgtCidr);
  path.push({hop:hopN++,type:'nacl-outbound',id:srcNaclX?(srcNaclX.NetworkAclId||'NACL'):'Default NACL',action:naclOutX.action,detail:'Source subnet NACL outbound',rule:naclOutX.rule});
  if(naclOutX.action==='deny'){
    path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Blocked by NACL',subnetId:tgtPos.subnetId});
    return {path:path,blocked:{hop:hopN-2,reason:'Source NACL denies outbound traffic',suggestion:'Add NACL outbound rule allowing '+config.protocol+'/'+config.port}};
  }
  var sgOutX=evaluateSG(srcPos.sgs,'outbound',config.protocol,config.port,tgtCidr,{sourceSgIds:tgtSgIds});
  path.push({hop:hopN++,type:'sg-outbound',id:'Source SG',action:sgOutX.action,detail:'Source SG outbound',rule:sgOutX.rule});
  if(sgOutX.action==='deny'){
    path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Blocked by SG',subnetId:tgtPos.subnetId});
    return {path:path,blocked:{hop:hopN-2,reason:'Source security group denies outbound',suggestion:'Add SG outbound rule for '+config.protocol+'/'+config.port}};
  }
  // Cross-VPC connectivity check (peering or TGW)
  var peeringRoute=null;
  (ctx.peerings||[]).forEach(function(p){
    var req=p.RequesterVpcInfo||{};
    var acc=p.AccepterVpcInfo||{};
    if((req.VpcId===srcPos.vpcId&&acc.VpcId===tgtPos.vpcId)||(acc.VpcId===srcPos.vpcId&&req.VpcId===tgtPos.vpcId)){
      peeringRoute=p;
    }
  });
  if(peeringRoute){
    path.push({hop:hopN++,type:'peering',id:peeringRoute.VpcPeeringConnectionId||'PCX',action:'allow',detail:'VPC Peering connection between '+srcPos.vpcId+' and '+tgtPos.vpcId,rule:'Peering: '+peeringRoute.VpcPeeringConnectionId});
  } else {
    var tgwRoute=false;
    (ctx.tgwAttachments||[]).forEach(function(att){
      if(att.ResourceId===srcPos.vpcId||att.ResourceId===tgtPos.vpcId) tgwRoute=true;
    });
    if(tgwRoute){
      path.push({hop:hopN++,type:'tgw',id:'Transit Gateway',action:'allow',detail:'Transit Gateway route between VPCs'});
    } else {
      path.push({hop:hopN++,type:'cross-vpc',id:'No route',action:'block',detail:'No peering or TGW connection between VPCs'});
      path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Target unreachable',subnetId:tgtPos.subnetId});
      return {path:path,blocked:{hop:hopN-2,reason:'No connectivity between VPCs',suggestion:'Create a VPC peering connection or Transit Gateway attachment'}};
    }
  }
  // Target-side controls (NACL-in, SG-in)
  var tgtNaclX=(ctx.subNacl||{})[tgtPos.subnetId];
  var naclInX=evaluateNACL(tgtNaclX,'inbound',config.protocol,config.port,srcCidr);
  path.push({hop:hopN++,type:'nacl-inbound',id:tgtNaclX?(tgtNaclX.NetworkAclId||'NACL'):'Default NACL',action:naclInX.action,detail:'Target subnet NACL inbound',rule:naclInX.rule});
  if(naclInX.action==='deny'){
    path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Blocked by NACL',subnetId:tgtPos.subnetId});
    return {path:path,blocked:{hop:hopN-2,reason:'Target NACL denies inbound traffic',suggestion:'Add NACL inbound rule allowing '+config.protocol+'/'+config.port+' from '+srcCidr}};
  }
  var sgIn3=evaluateSG(tgtPos.sgs,'inbound',config.protocol,config.port,srcCidr,{sourceSgIds:srcSgIds});
  path.push({hop:hopN++,type:'sg-inbound',id:'Target SG',action:sgIn3.action,detail:'Target SG inbound (cross-VPC)',rule:sgIn3.rule});
  if(sgIn3.action==='deny'){
    path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'block',detail:'Blocked by SG',subnetId:tgtPos.subnetId});
    return {path:path,blocked:{hop:hopN-2,reason:'Target SG denies inbound from cross-VPC source',suggestion:'Add SG inbound rule for '+config.protocol+'/'+config.port}};
  }
  path.push({hop:hopN++,type:'target',id:tgtPos.name||target.id,action:'allow',detail:'Target: '+(tgtPos.name||target.id)+' ('+target.type+')',subnetId:tgtPos.subnetId});
  return {path:path,blocked:null};
}

function _flowBannerHTML(state,srcName,tgtName,info){
  var s1='<span class="flow-step-num'+(state>=1?' done':state===0?' active':'')+'">1</span>';
  var s2='<span class="flow-step-num'+(state>=2?' done':state===1?' active':'')+'">2</span>';
  var s3='<span class="flow-step-num'+(state>=3?' done':state===2?' active':'')+'">3</span>';
  if(state===0) return s1+'Click a source resource &nbsp; '+s2+'<span style="color:var(--text-muted)">Target</span> &nbsp; '+s3+'<span style="color:var(--text-muted)">Results</span>';
  if(state===1) return s1+'Source: <span id="flowSrcName" style="text-decoration:underline;cursor:pointer" title="Click to re-select source">'+esc(srcName)+'</span> &nbsp; '+s2+'Click a target';
  return s1+esc(srcName)+' &nbsp; '+s2+esc(tgtName)+' &nbsp; '+s3+(info||'');
}

function enterFlowMode(presetSource){
  if(!_rlCtx){alert('Load a map first');return}
  if(document.getElementById('layoutMode').value==='executive') return;
  if(_flowMode) return;
  _flowMode=true;
  _flowSelecting=presetSource?'target':'source';
  _flowSource=presetSource||null;
  _flowTarget=null;
  _flowPath=null;
  _flowBlocked=null;
  _flowStepIndex=-1;
  _flowWaypoints=[];_flowLegs=[];_flowActiveLeg=-1;_flowSelectingWaypoint=-1;_flowSuggestions=[];
  var banner=document.getElementById('flowBanner');
  banner.style.display='flex';
  document.getElementById('flowStatus').textContent='';
  document.getElementById('flowStatus').className='flow-status';
  document.getElementById('flowStepBack').style.display='none';
  document.getElementById('flowStepFwd').style.display='none';
  var mainEl=document.querySelector('.main');
  if(mainEl){mainEl.classList.add('flow-selecting');mainEl.classList.add('flow-active');}
  var svg=document.getElementById('mapSvg');
  svg.addEventListener('click',_flowClickHandler,true);
  svg.addEventListener('contextmenu',_flowRightClickHandler,true);
  if(presetSource){
    var srcPos=_resolveNetworkPosition(presetSource.type, presetSource.id, _rlCtx);
    var srcName=srcPos?srcPos.name:presetSource.id;
    document.getElementById('flowLabel').innerHTML=_flowBannerHTML(1,srcName);
    document.getElementById('flowSrcName')?.addEventListener('click',function(e){e.stopPropagation();_flowResetToSource();});
    _highlightFlowNode(presetSource,'source');
  } else {
    document.getElementById('flowLabel').innerHTML=_flowBannerHTML(0);
  }
}
function _flowResetToSource(){
  _flowSelecting='source';_flowSource=null;_clearFlowHighlights();_clearFlowOverlay();
  document.getElementById('flowLabel').innerHTML=_flowBannerHTML(0);
  var m=document.querySelector('.main');if(m)m.classList.add('flow-selecting');
}
function _flowRightClickHandler(event){
  if(!_flowMode) return;
  if(_flowSelecting==='target'){event.preventDefault();_flowResetToSource();}
}

function exitFlowMode(){
  _flowMode=false;
  _flowSelecting=null;
  _flowSource=null;
  _flowTarget=null;
  _flowPath=null;
  _flowBlocked=null;
  _flowStepIndex=-1;
  _flowWaypoints=[];_flowLegs=[];_flowActiveLeg=-1;_flowSelectingWaypoint=-1;_flowSuggestions=[];
  if(typeof _cancelTracePick==='function') _cancelTracePick();
  var banner=document.getElementById('flowBanner');
  banner.style.display='none';
  var mainEl=document.querySelector('.main');
  if(mainEl){mainEl.classList.remove('flow-selecting');mainEl.classList.remove('flow-active');}
  var svg=document.getElementById('mapSvg');
  svg.removeEventListener('click',_flowClickHandler,true);
  svg.removeEventListener('contextmenu',_flowRightClickHandler,true);
  _clearFlowOverlay();_clearFlowHighlights();
  var dp=document.getElementById('detailPanel');
  if(dp.classList.contains('open')){
    var dpBody=document.getElementById('dpBody');
    if(dpBody&&dpBody.querySelector('.flow-panel')) dp.classList.remove('open');
  }
}

function _flowClickHandler(event){
  if(!_flowMode||!_flowSelecting) return;
  var target=_resolveClickTarget(event.target);
  if(!target) return;
  event.stopPropagation();
  event.preventDefault();
  if(_flowSelecting==='source'){
    _flowSource=target;
    _flowSelecting='target';
    _clearFlowHighlights();
    var srcPos=_resolveNetworkPosition(target.type, target.id, _rlCtx);
    var srcName=srcPos?srcPos.name:target.id;
    document.getElementById('flowLabel').innerHTML=_flowBannerHTML(1,srcName);
    document.getElementById('flowSrcName')?.addEventListener('click',function(e){e.stopPropagation();_flowResetToSource();});
    _highlightFlowNode(target,'source');
    // If a preset target was set via right-click context menu, auto-fill it
    if(_flowCtxPresetTarget){
      var presetTgt=_flowCtxPresetTarget;
      _flowCtxPresetTarget=null;
      _flowTarget=presetTgt;
      _flowSelecting=null;
      var mainEl2=document.querySelector('.main');
      if(mainEl2) mainEl2.classList.remove('flow-selecting');
      var tgtPos2=_resolveNetworkPosition(presetTgt.type, presetTgt.id, _rlCtx);
      _flowConfig.port=_suggestPort(presetTgt.type, tgtPos2);
      _highlightFlowNode(presetTgt,'target');
      _executeTrace();
      return;
    }
  } else if(_flowSelecting==='target'){
    if(target.type===(_flowSource||{}).type&&target.id===(_flowSource||{}).id) return;
    _flowTarget=target;
    _flowSelecting=null;
    var mainEl=document.querySelector('.main');
    if(mainEl) mainEl.classList.remove('flow-selecting');
    var tgtPos=_resolveNetworkPosition(target.type, target.id, _rlCtx);
    var sugPort=_suggestPort(target.type, tgtPos);
    _flowConfig.port=sugPort;
    _highlightFlowNode(target,'target');
    _executeTrace();
  } else if(_flowSelecting==='waypoint'){
    // Prevent waypoint that equals source or target
    if((target.type===(_flowSource||{}).type&&target.id===(_flowSource||{}).id)||(target.type===(_flowTarget||{}).type&&target.id===(_flowTarget||{}).id)) return;
    // Prevent duplicate waypoints
    if(_flowWaypoints.some(function(wp){return wp.ref.type===target.type&&wp.ref.id===target.id})) return;
    // Insert waypoint into chain
    _flowSelecting=null;
    var mainEl2=document.querySelector('.main');
    if(mainEl2) mainEl2.classList.remove('flow-selecting');
    var wpPos=_resolveNetworkPosition(target.type, target.id, _rlCtx);
    var wpPort=_suggestPort(target.type, wpPos);
    var insertAt=_flowSelectingWaypoint>=0?_flowSelectingWaypoint:_flowWaypoints.length-1;
    _flowWaypoints.splice(insertAt,0,{ref:target,config:{protocol:'tcp',port:wpPort}});
    // Update the config of the prior waypoint to use the waypoint's suggested port
    _flowSelectingWaypoint=-1;
    _highlightFlowNode(target,'waypoint');
    _executeMultiTrace();
  }
}
function _clearFlowHighlights(){
  d3.select('#mapSvg').selectAll('.subnet-node rect, .res-node rect, .internet-node circle').each(function(){d3.select(this).style('filter',null)});
}

function _highlightFlowNode(ref, role){
  var svg=d3.select('#mapSvg');
  var color=role==='source'?'#22d3ee':role==='waypoint'?'#f59e0b':'#ef4444';
  if(ref.type==='internet'){
    svg.selectAll('.internet-node circle').each(function(){
      d3.select(this).style('filter','drop-shadow(0 0 10px '+color+')');
    });
    return;
  }
  if(ref.type==='subnet'){
    svg.selectAll('.subnet-node[data-subnet-id="'+ref.id+'"] rect').each(function(){
      d3.select(this).style('filter','drop-shadow(0 0 8px '+color+')');
    });
    return;
  }
  // Fallback: resolve resource to its containing subnet and highlight that
  var pos=_resolveNetworkPosition(ref.type, ref.id, _rlCtx);
  if(pos&&pos.subnetId){
    svg.selectAll('.subnet-node[data-subnet-id="'+pos.subnetId+'"] rect').each(function(){
      d3.select(this).style('filter','drop-shadow(0 0 8px '+color+')');
    });
  }
}

function _executeTrace(){
  if(!_flowSource||!_flowTarget||!_rlCtx) return;
  // Use _traceFlowLeg for internet support
  var result=_traceFlowLeg(_flowSource, _flowTarget, _flowConfig, _rlCtx);
  _flowPath=result.path;
  _flowBlocked=result.blocked;
  _flowStepIndex=-1;
  _flowSuggestions=[];
  // If blocked, find alternate paths via intermediaries
  if(_flowBlocked) _flowSuggestions=_findAlternatePaths(_flowSource,_flowTarget,_flowConfig,_rlCtx);
  var srcPos=_resolveNetworkPosition(_flowSource.type, _flowSource.id, _rlCtx);
  var tgtPos=_resolveNetworkPosition(_flowTarget.type, _flowTarget.id, _rlCtx);
  var srcName=srcPos?srcPos.name:_flowSource.id;
  var tgtName=tgtPos?tgtPos.name:_flowTarget.id;
  document.getElementById('flowLabel').innerHTML=_flowBannerHTML(3,srcName,tgtName,_flowConfig.protocol.toUpperCase()+'/'+_flowConfig.port+' · '+_flowPath.length+' hops');
  var statusEl=document.getElementById('flowStatus');
  if(_flowBlocked){
    statusEl.textContent='BLOCKED';
    statusEl.className='flow-status blocked';
  } else {
    statusEl.textContent='ALLOWED';
    statusEl.className='flow-status allowed';
  }
  document.getElementById('flowStepBack').style.display='';
  document.getElementById('flowStepFwd').style.display='';
  _renderFlowPath();
  _renderFlowDetail();
}

function _clearFlowOverlay(){
  var svg=d3.select('#mapSvg');
  svg.selectAll('.flow-overlay-g').remove();
  svg.selectAll('.subnet-node rect').style('filter',null);
}

function _renderFlowPath(){
  _clearFlowOverlay();
  if(!_flowPath||_flowPath.length<2) return;
  var g=d3.select('#mapSvg').select('g');
  if(g.empty()) g=d3.select('#mapSvg');
  var flowG=g.append('g').attr('class','flow-overlay-g');
  var coords=[];
  _flowPath.forEach(function(hop){
    var c=_getHopCoords(hop);
    if(c) coords.push({x:c.x,y:c.y,hop:hop});
  });
  if(coords.length<2) return;
  var line=d3.line().x(function(d){return d.x}).y(function(d){return d.y}).curve(d3.curveBasis);
  var isBlocked=!!_flowBlocked;
  flowG.append('path')
    .attr('class','flow-path'+(isBlocked?' blocked':''))
    .attr('d',line(coords));
  coords.forEach(function(c,i){
    if(_flowStepIndex!==-1&&i>_flowStepIndex) return;
    var isBlockedHop=c.hop.action==='block'||c.hop.action==='deny';
    var hopG=flowG.append('g').attr('class','flow-hop '+(isBlockedHop?'flow-hop-block':'flow-hop-allow'));
    hopG.append('circle').attr('cx',c.x).attr('cy',c.y).attr('r',10);
    hopG.append('text').attr('x',c.x).attr('y',c.y).text(i+1);
  });
}

function _getInternetCoords(){
  var inetEl=document.querySelector('.internet-node circle');
  if(!inetEl) return null;
  return {x:parseFloat(inetEl.getAttribute('cx'))||0,y:parseFloat(inetEl.getAttribute('cy'))||0};
}

function _getHopCoords(hop){
  // Internet node hops
  if(hop.type==='source'&&hop.id==='Internet') return _getInternetCoords();
  if(hop.type==='target'&&hop.id==='Internet') return _getInternetCoords();
  if(hop.type==='igw-check'){
    // Position between internet node and target subnet
    var ic=_getInternetCoords();
    var tPos=_flowTarget?_resolveNetworkPosition(_flowTarget.type, _flowTarget.id, _rlCtx):null;
    var tc=tPos?_getSubnetCenter(tPos.subnetId):null;
    if(ic&&tc) return {x:ic.x+(tc.x-ic.x)*0.35,y:ic.y+(tc.y-ic.y)*0.35};
    return ic;
  }
  var subId=hop.subnetId;
  if(!subId){
    if(hop.type==='route-table'||hop.type==='nacl-outbound'||hop.type==='sg-outbound'){
      var srcPos=_flowSource?_resolveNetworkPosition(_flowSource.type, _flowSource.id, _rlCtx):null;
      subId=srcPos?srcPos.subnetId:null;
    }
    if(hop.type==='nacl-inbound'||hop.type==='sg-inbound'){
      var tgtPos=_flowTarget?_resolveNetworkPosition(_flowTarget.type, _flowTarget.id, _rlCtx):null;
      subId=tgtPos?tgtPos.subnetId:null;
    }
  }
  if(subId){
    var subEl=document.querySelector('.subnet-node[data-subnet-id="'+subId+'"] rect');
    if(subEl){
      var x=parseFloat(subEl.getAttribute('x'))||0;
      var y=parseFloat(subEl.getAttribute('y'))||0;
      var w=parseFloat(subEl.getAttribute('width'))||100;
      var h=parseFloat(subEl.getAttribute('height'))||60;
      var offsetX=0;
      if(hop.type==='source') offsetX=-w*0.35;
      else if(hop.type==='target') offsetX=w*0.35;
      else if(hop.type==='route-table') offsetX=-w*0.2;
      else if(hop.type==='nacl-outbound') offsetX=-w*0.05;
      else if(hop.type==='sg-outbound') offsetX=w*0.08;
      else if(hop.type==='sg-inbound') offsetX=w*0.2;
      else if(hop.type==='nacl-inbound') offsetX=w*0.33;
      return {x:x+w/2+offsetX,y:y+h/2};
    }
  }
  if(hop.type==='peering'||hop.type==='tgw'||hop.type==='cross-vpc'){
    var srcPos2=_resolveNetworkPosition(_flowSource.type, _flowSource.id, _rlCtx);
    var tgtPos2=_resolveNetworkPosition(_flowTarget.type, _flowTarget.id, _rlCtx);
    var c1=_getSubnetCenter(srcPos2?srcPos2.subnetId:null);
    var c2=_getSubnetCenter(tgtPos2?tgtPos2.subnetId:null);
    if(c1&&c2) return {x:(c1.x+c2.x)/2,y:(c1.y+c2.y)/2-20};
  }
  return null;
}

function _getSubnetCenter(subId){
  if(!subId) return null;
  var subEl=document.querySelector('.subnet-node[data-subnet-id="'+subId+'"] rect');
  if(!subEl) return null;
  return {x:parseFloat(subEl.getAttribute('x'))+(parseFloat(subEl.getAttribute('width'))||100)/2,y:parseFloat(subEl.getAttribute('y'))+(parseFloat(subEl.getAttribute('height'))||60)/2};
}

function _renderFlowDetail(){
  if(!_flowPath) return;
  var dp=document.getElementById('detailPanel');
  var dpTitle=document.getElementById('dpTitle');
  var dpSub=document.getElementById('dpSub');
  var dpBody=document.getElementById('dpBody');
  dpTitle.textContent='Traffic Flow Trace';
  dpSub.textContent=_flowConfig.protocol.toUpperCase()+'/'+_flowConfig.port+(_flowBlocked?' \u2014 BLOCKED':' \u2014 ALLOWED');
  var h='<div class="flow-panel">';
  h+='<h4>Hop-by-Hop Trace</h4>';
  h+='<div style="margin-bottom:10px;font-size:10px;color:var(--text-muted)">Protocol: <span style="color:var(--accent-cyan)">'+_flowConfig.protocol.toUpperCase()+'</span> &nbsp; Port: <span style="color:var(--accent-cyan)">'+_flowConfig.port+'</span></div>';
  h+='<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">';
  h+='<label style="font-size:9px;color:var(--text-muted)">Protocol:</label>';
  h+='<select id="flowProtoSel" style="background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;padding:2px 6px;font-size:10px;font-family:\'IBM Plex Mono\',monospace">';
  ['tcp','udp','icmp'].forEach(function(p){
    h+='<option value="'+p+'"'+(p===_flowConfig.protocol?' selected':'')+'>'+p.toUpperCase()+'</option>';
  });
  h+='</select>';
  h+='<label style="font-size:9px;color:var(--text-muted)">Port:</label>';
  h+='<input id="flowPortInput" type="number" min="1" max="65535" value="'+_flowConfig.port+'" style="width:60px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;padding:2px 6px;font-size:10px;font-family:\'IBM Plex Mono\',monospace">';
  h+='<button id="flowRetraceBtn" style="background:var(--accent-cyan);color:#000;border:none;border-radius:3px;padding:2px 10px;font-size:10px;font-family:\'IBM Plex Mono\',monospace;cursor:pointer;font-weight:600">Re-trace</button>';
  h+='</div>';
  // Quick port buttons
  var quickPorts=[{label:'SSH',port:22},{label:'HTTP',port:80},{label:'HTTPS',port:443},{label:'MySQL',port:3306},{label:'Postgres',port:5432},{label:'Redis',port:6379},{label:'RDP',port:3389}];
  h+='<div class="flow-quick-ports">';
  quickPorts.forEach(function(qp){
    var isActive=_flowConfig.port===qp.port&&_flowConfig.protocol==='tcp';
    h+='<button class="flow-port-btn'+(isActive?' active':'')+'" data-qp-port="'+qp.port+'">'+qp.label+' '+qp.port+'</button>';
  });
  h+='</div>';
  _flowPath.forEach(function(hop,idx){
    var isActive=_flowStepIndex===-1||idx===_flowStepIndex;
    var isBlk=hop.action==='block'||hop.action==='deny';
    var cls='flow-step'+(isActive?' active':'')+(isBlk?' blocked':'');
    h+='<div class="'+cls+'" data-hop-idx="'+idx+'">';
    h+='<span class="fs-num '+(isBlk?'block':'allow')+'">'+hop.hop+'</span>';
    h+='<span class="fs-type">'+_hopTypeLabel(hop.type)+'</span>';
    h+='<div class="fs-detail">'+_escHtml(hop.detail||'')+'</div>';
    if(hop.rule) h+='<div class="fs-rule">'+_escHtml(hop.rule)+'</div>';
    h+='</div>';
  });
  if(_flowBlocked){
    h+='<div style="margin-top:12px;padding:10px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:6px">';
    h+='<div style="font-size:11px;font-weight:600;color:var(--accent-red);margin-bottom:4px">Blocked at Hop '+_flowBlocked.hop+'</div>';
    h+='<div style="font-size:10px;color:var(--text-secondary)">'+_escHtml(_flowBlocked.reason||'')+'</div>';
    if(_flowBlocked.suggestion) h+='<div style="font-size:9px;color:var(--accent-orange);margin-top:4px">Suggestion: '+_escHtml(_flowBlocked.suggestion)+'</div>';
    // Alternate path suggestions
    if(_flowSuggestions&&_flowSuggestions.length>0){
      h+='<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(239,68,68,.2)">';
      h+='<div style="font-size:10px;font-weight:600;color:var(--accent-cyan);margin-bottom:6px">Alternate Paths via Intermediary</div>';
      _flowSuggestions.forEach(function(sug,si){
        h+='<div class="flow-suggestion" data-sug-idx="'+si+'">';
        h+='<span class="sug-name">'+_escHtml(sug.via.name||sug.via.id)+'</span>';
        h+=' <span style="color:var(--text-muted);font-size:9px">('+sug.via.type+')</span>';
        h+=' <button class="flow-apply-sug" data-sug-idx="'+si+'">Apply</button>';
        h+='<div style="font-size:9px;color:var(--text-muted);margin-top:2px">';
        h+=_escHtml(sug.leg1Config.protocol.toUpperCase()+'/'+sug.leg1Config.port)+' \u2192 '+_escHtml(sug.via.name||sug.via.id);
        h+=' \u2192 '+_flowConfig.protocol.toUpperCase()+'/'+_flowConfig.port;
        h+='</div>';
        h+='</div>';
      });
      h+='</div>';
    }
    h+='</div>';
  }
  // Add Waypoint button (shown when we have a completed trace)
  if(_flowPath&&_flowPath.length>0){
    h+='<div style="margin-top:12px;display:flex;gap:6px">';
    h+='<button id="flowAddWpBtn2" style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);color:#f59e0b;border-radius:4px;padding:4px 12px;font-size:10px;font-family:\'IBM Plex Mono\',monospace;cursor:pointer;font-weight:600">+ Add Waypoint</button>';
    h+='</div>';
  }
  h+='</div>';
  dpBody.innerHTML=h;
  dp.classList.add('open');
  var retraceBtn=document.getElementById('flowRetraceBtn');
  if(retraceBtn){
    retraceBtn.addEventListener('click',function(e){
      e.stopPropagation();
      e.preventDefault();
      var proto=document.getElementById('flowProtoSel').value;
      var port=parseInt(document.getElementById('flowPortInput').value,10)||443;
      _flowConfig.protocol=proto;
      _flowConfig.port=port;
      _executeTrace();
    });
  }
  // Wire quick port buttons
  dpBody.querySelectorAll('.flow-port-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      var port=parseInt(btn.getAttribute('data-qp-port'),10);
      _flowConfig.protocol='tcp';
      _flowConfig.port=port;
      if(_flowWaypoints.length>0) _executeMultiTrace();
      else _executeTrace();
    });
  });
  dpBody.querySelectorAll('.flow-step').forEach(function(el){
    el.addEventListener('click',function(){
      var idx=parseInt(el.getAttribute('data-hop-idx'),10);
      _flowStepIndex=idx;
      _renderFlowPath();
      _renderFlowDetail();
    });
  });
  // Wire suggestion Apply buttons
  dpBody.querySelectorAll('.flow-apply-sug').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      var si=parseInt(btn.getAttribute('data-sug-idx'),10);
      _applySuggestion(si);
    });
  });
  // Wire Add Waypoint button
  var wpBtn=document.getElementById('flowAddWpBtn2');
  if(wpBtn){
    wpBtn.addEventListener('click',function(e){
      e.stopPropagation();
      _addWaypoint();
    });
  }
}

function _hopTypeLabel(type){
  var labels={'source':'Source','target':'Target','route-table':'Route Table','nacl-outbound':'NACL Outbound','nacl-inbound':'NACL Inbound','sg-outbound':'SG Outbound','sg-inbound':'SG Inbound','peering':'VPC Peering','tgw':'Transit Gateway','cross-vpc':'Cross-VPC','error':'Error','igw-check':'IGW Check'};
  return labels[type]||type;
}

function _escHtml(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _stepForward(){
  if(!_flowPath||_flowPath.length===0) return;
  if(_flowStepIndex===-1) _flowStepIndex=0;
  else if(_flowStepIndex<_flowPath.length-1) _flowStepIndex++;
  _renderFlowPath();
  _renderFlowDetail();
}

function _stepBack(){
  if(!_flowPath||_flowPath.length===0) return;
  if(_flowStepIndex<=0) _flowStepIndex=-1;
  else _flowStepIndex--;
  _renderFlowPath();
  _renderFlowDetail();
}

// --- Auto-Suggestion: find alternate paths via intermediaries ---
function _findAlternatePaths(source, target, config, ctx){
  if(!ctx) return [];
  var tgtPos=_resolveNetworkPosition(target.type, target.id, ctx);
  if(!tgtPos) return [];
  var vpcId=tgtPos.vpcId;
  var results=[];
  // Collect candidates: instances + ALBs in the target VPC (or any VPC if source is internet)
  var candidates=[];
  var isInternet=source.type==='internet';
  // Public-subnet instances first (bastion pattern)
  (ctx.instances||[]).forEach(function(inst){
    var instVpc=inst.VpcId||((ctx.subnets||[]).find(function(s){return s.SubnetId===inst.SubnetId})||{}).VpcId;
    if(!isInternet&&instVpc!==vpcId) return;
    if(inst.InstanceId===(target.type==='instance'?target.id:'')) return;
    if(inst.InstanceId===(source.type==='instance'?source.id:'')) return;
    var isPub=ctx.pubSubs&&ctx.pubSubs.has(inst.SubnetId);
    var gn2=inst.Tags?((inst.Tags.find(function(t){return t.Key==='Name'})||{}).Value||inst.InstanceId):inst.InstanceId;
    candidates.push({ref:{type:'instance',id:inst.InstanceId},name:gn2,isPub:isPub,defaultPort:22});
  });
  // ALBs
  Object.keys(ctx.albBySub||{}).forEach(function(sid){
    var sub=(ctx.subnets||[]).find(function(s){return s.SubnetId===sid});
    if(!sub||(!isInternet&&sub.VpcId!==vpcId)) return;
    (ctx.albBySub[sid]||[]).forEach(function(alb){
      var albId=alb.LoadBalancerArn?alb.LoadBalancerArn.split('/').pop():'';
      if(albId===(target.type==='alb'?target.id:'')) return;
      candidates.push({ref:{type:'alb',id:albId||alb.LoadBalancerName},name:alb.LoadBalancerName||albId,isPub:true,defaultPort:443});
    });
  });
  // Sort: public instances first, then ALBs, then private instances
  candidates.sort(function(a,b){return (b.isPub?1:0)-(a.isPub?1:0)});
  // Test each candidate (max 20)
  var tested=0;
  for(var i=0;i<candidates.length&&tested<20&&results.length<5;i++){
    var cand=candidates[i];
    tested++;
    var leg1Config={protocol:'tcp',port:cand.defaultPort};
    var leg1=_traceFlowLeg(source, cand.ref, leg1Config, ctx);
    if(leg1.blocked) continue;
    var leg2=_traceFlowLeg(cand.ref, target, config, ctx);
    if(leg2.blocked) continue;
    results.push({via:{type:cand.ref.type,id:cand.ref.id,name:cand.name},leg1Result:leg1,leg2Result:leg2,leg1Config:leg1Config});
  }
  return results;
}

function _applySuggestion(idx){
  if(!_flowSuggestions||!_flowSuggestions[idx]) return;
  var sug=_flowSuggestions[idx];
  // Build waypoint chain: source → via → target
  _flowWaypoints=[
    {ref:_flowSource,config:sug.leg1Config},
    {ref:sug.via,config:{protocol:_flowConfig.protocol,port:_flowConfig.port}},
    {ref:_flowTarget,config:null}
  ];
  _executeMultiTrace();
}

function _addWaypoint(){
  // Enter waypoint-selection mode: click a resource to insert as waypoint between source and target
  if(!_flowSource||!_flowTarget) return;
  // If no waypoints yet, initialize from current source/target
  if(_flowWaypoints.length===0){
    _flowWaypoints=[
      {ref:_flowSource,config:{protocol:_flowConfig.protocol,port:_flowConfig.port}},
      {ref:_flowTarget,config:null}
    ];
  }
  // Insert waypoint before the last node (target)
  _flowSelectingWaypoint=_flowWaypoints.length-1;
  _flowSelecting='waypoint';
  var mainEl=document.querySelector('.main');
  if(mainEl) mainEl.classList.add('flow-selecting');
  document.getElementById('flowLabel').textContent='MULTI-HOP: Click a waypoint resource to insert';
}

function _removeWaypoint(idx){
  if(idx<=0||idx>=_flowWaypoints.length-1) return; // can't remove source or target
  _flowWaypoints.splice(idx,1);
  if(_flowWaypoints.length<=2){
    // Back to single-hop mode
    _flowWaypoints=[];
    _flowLegs=[];
    _flowActiveLeg=-1;
    _executeTrace();
  } else {
    _executeMultiTrace();
  }
}

function _executeMultiTrace(){
  if(_flowWaypoints.length<2||!_rlCtx) return;
  _flowLegs=[];
  var allBlocked=false;
  for(var i=0;i<_flowWaypoints.length-1;i++){
    var src=_flowWaypoints[i];
    var tgt=_flowWaypoints[i+1];
    var cfg=src.config||{protocol:'tcp',port:443};
    if(allBlocked){
      _flowLegs.push({source:src.ref,target:tgt.ref,config:cfg,result:{path:[],blocked:{hop:0,reason:'Skipped (prior leg blocked)'}},status:'skipped'});
      continue;
    }
    var result=_traceFlowLeg(src.ref, tgt.ref, cfg, _rlCtx);
    _flowLegs.push({source:src.ref,target:tgt.ref,config:cfg,result:result,status:result.blocked?'blocked':'allowed'});
    if(result.blocked) allBlocked=true;
  }
  // Update banner
  var anyBlocked=_flowLegs.some(function(l){return l.status==='blocked'});
  var statusEl=document.getElementById('flowStatus');
  if(anyBlocked){statusEl.textContent='BLOCKED';statusEl.className='flow-status blocked'}
  else{statusEl.textContent='ALLOWED';statusEl.className='flow-status allowed'}
  var names=_flowWaypoints.map(function(wp){
    var pos=_resolveNetworkPosition(wp.ref.type, wp.ref.id, _rlCtx);
    return pos?pos.name:wp.ref.id;
  });
  document.getElementById('flowLabel').textContent='MULTI-HOP: '+names.join(' \u2192 ')+' | '+_flowLegs.length+' legs';
  document.getElementById('flowStepBack').style.display='none';
  document.getElementById('flowStepFwd').style.display='none';
  _renderMultiFlowPath();
  _renderMultiFlowDetail();
}

function _renderMultiFlowPath(){
  _clearFlowOverlay();
  if(!_flowLegs||_flowLegs.length===0) return;
  var g=d3.select('#mapSvg').select('g');
  if(g.empty()) g=d3.select('#mapSvg');
  var flowG=g.append('g').attr('class','flow-overlay-g');
  _flowLegs.forEach(function(leg,legIdx){
    if(leg.status==='skipped'||!leg.result.path||leg.result.path.length<2) return;
    var coords=[];
    leg.result.path.forEach(function(hop){
      // Need to temporarily set _flowSource/_flowTarget for _getHopCoords
      var c=_getHopCoordsForLeg(hop, leg);
      if(c) coords.push({x:c.x,y:c.y,hop:hop});
    });
    if(coords.length<2) return;
    var line=d3.line().x(function(d){return d.x}).y(function(d){return d.y}).curve(d3.curveBasis);
    var cls='flow-path-leg '+(leg.status==='blocked'?'blocked':leg.status==='skipped'?'skipped':'allowed');
    flowG.append('path').attr('class',cls).attr('d',line(coords));
    coords.forEach(function(c,i){
      var isBlk=c.hop.action==='block'||c.hop.action==='deny';
      var hopG=flowG.append('g').attr('class','flow-hop '+(isBlk?'flow-hop-block':'flow-hop-allow'));
      hopG.append('circle').attr('cx',c.x).attr('cy',c.y).attr('r',8);
      hopG.append('text').attr('x',c.x).attr('y',c.y).text((legIdx+1)+'.'+( i+1)).style('font-size','7px');
    });
  });
  // Waypoint markers
  _flowWaypoints.forEach(function(wp,i){
    if(i===0||i===_flowWaypoints.length-1) return; // skip source/target
    var pos=_resolveNetworkPosition(wp.ref.type, wp.ref.id, _rlCtx);
    if(!pos) return;
    var c=wp.ref.type==='internet'?_getInternetCoords():_getSubnetCenter(pos.subnetId);
    if(!c) return;
    var wg=flowG.append('g').attr('class','flow-waypoint-marker');
    wg.append('circle').attr('cx',c.x).attr('cy',c.y).attr('r',14);
    wg.append('text').attr('x',c.x).attr('y',c.y+1).attr('text-anchor','middle').attr('dominant-baseline','central')
      .attr('fill','#000').attr('font-size','9px').attr('font-weight','700').attr('font-family','IBM Plex Mono').text('W'+(i));
  });
}

function _getHopCoordsForLeg(hop, leg){
  // Like _getHopCoords but uses leg.source/leg.target instead of globals
  if(hop.type==='source'&&hop.id==='Internet') return _getInternetCoords();
  if(hop.type==='target'&&hop.id==='Internet') return _getInternetCoords();
  if(hop.type==='igw-check'){
    var ic=_getInternetCoords();
    var tPos2=_resolveNetworkPosition(leg.target.type, leg.target.id, _rlCtx);
    var tc2=tPos2?_getSubnetCenter(tPos2.subnetId):null;
    if(ic&&tc2) return {x:ic.x+(tc2.x-ic.x)*0.35,y:ic.y+(tc2.y-ic.y)*0.35};
    return ic;
  }
  var subId=hop.subnetId;
  if(!subId){
    if(hop.type==='route-table'||hop.type==='nacl-outbound'||hop.type==='sg-outbound'){
      var srcP=_resolveNetworkPosition(leg.source.type, leg.source.id, _rlCtx);
      subId=srcP?srcP.subnetId:null;
    }
    if(hop.type==='nacl-inbound'||hop.type==='sg-inbound'){
      var tgtP=_resolveNetworkPosition(leg.target.type, leg.target.id, _rlCtx);
      subId=tgtP?tgtP.subnetId:null;
    }
  }
  if(subId){
    var subEl=document.querySelector('.subnet-node[data-subnet-id="'+subId+'"] rect');
    if(subEl){
      var x=parseFloat(subEl.getAttribute('x'))||0;
      var y=parseFloat(subEl.getAttribute('y'))||0;
      var w=parseFloat(subEl.getAttribute('width'))||100;
      var h=parseFloat(subEl.getAttribute('height'))||60;
      var ox=0;
      if(hop.type==='source') ox=-w*0.35;
      else if(hop.type==='target') ox=w*0.35;
      else if(hop.type==='route-table') ox=-w*0.2;
      else if(hop.type==='nacl-outbound') ox=-w*0.05;
      else if(hop.type==='sg-outbound') ox=w*0.08;
      else if(hop.type==='sg-inbound') ox=w*0.2;
      else if(hop.type==='nacl-inbound') ox=w*0.33;
      return {x:x+w/2+ox,y:y+h/2};
    }
  }
  if(hop.type==='peering'||hop.type==='tgw'||hop.type==='cross-vpc'){
    var sp3=_resolveNetworkPosition(leg.source.type, leg.source.id, _rlCtx);
    var tp3=_resolveNetworkPosition(leg.target.type, leg.target.id, _rlCtx);
    var c1=_getSubnetCenter(sp3?sp3.subnetId:null);
    var c2=_getSubnetCenter(tp3?tp3.subnetId:null);
    if(c1&&c2) return {x:(c1.x+c2.x)/2,y:(c1.y+c2.y)/2-20};
  }
  return null;
}

function _renderMultiFlowDetail(){
  if(!_flowLegs||_flowLegs.length===0) return;
  var dp=document.getElementById('detailPanel');
  var dpTitle=document.getElementById('dpTitle');
  var dpSub=document.getElementById('dpSub');
  var dpBody=document.getElementById('dpBody');
  dpBody.scrollTop=0;
  dpTitle.textContent='Multi-Hop Traffic Trace';
  var anyBlocked=_flowLegs.some(function(l){return l.status==='blocked'});
  dpSub.textContent=_flowLegs.length+' legs'+(anyBlocked?' \u2014 BLOCKED':' \u2014 ALL ALLOWED');
  var h='<div class="flow-panel">';
  // Waypoint chain visualization
  h+='<div style="margin-bottom:12px">';
  h+='<div style="font-size:9px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Waypoint Chain</div>';
  h+='<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">';
  _flowWaypoints.forEach(function(wp,i){
    var pos=_resolveNetworkPosition(wp.ref.type, wp.ref.id, _rlCtx);
    var name=pos?pos.name:wp.ref.id;
    h+='<span class="flow-wp-chip">';
    h+=_escHtml(name);
    if(i>0&&i<_flowWaypoints.length-1){
      h+=' <span class="wp-remove" data-wp-idx="'+i+'" title="Remove waypoint">\u00d7</span>';
    }
    h+='</span>';
    if(i<_flowWaypoints.length-1){
      var legSt=_flowLegs[i]?_flowLegs[i].status:'';
      h+='<span style="color:'+(legSt==='allowed'?'#10b981':legSt==='blocked'?'#ef4444':'#6b7280')+';font-size:11px">\u2192</span>';
    }
  });
  h+='</div></div>';
  // Leg accordions
  _flowLegs.forEach(function(leg,li){
    var srcPos2=_resolveNetworkPosition(leg.source.type, leg.source.id, _rlCtx);
    var tgtPos2=_resolveNetworkPosition(leg.target.type, leg.target.id, _rlCtx);
    var srcN=srcPos2?srcPos2.name:leg.source.id;
    var tgtN=tgtPos2?tgtPos2.name:leg.target.id;
    var expanded=_flowActiveLeg===-1||_flowActiveLeg===li;
    h+='<div class="flow-leg'+(expanded?' expanded':'')+'" data-leg-idx="'+li+'">';
    h+='<div class="flow-leg-hdr" data-leg-idx="'+li+'">';
    h+='<span style="color:var(--text-muted);font-size:9px">Leg '+(li+1)+'</span> ';
    h+=_escHtml(srcN)+' \u2192 '+_escHtml(tgtN);
    h+=' <span class="leg-status '+leg.status+'">'+leg.status.toUpperCase()+'</span>';
    h+=' <span style="color:var(--text-muted);font-size:9px;margin-left:auto">'+leg.config.protocol.toUpperCase()+'/'+leg.config.port+'</span>';
    h+='</div>';
    h+='<div class="flow-leg-body">';
    if(leg.status==='skipped'){
      h+='<div style="font-size:10px;color:var(--text-muted);padding:4px">Skipped (prior leg blocked)</div>';
    } else {
      // Per-leg protocol/port controls
      h+='<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center">';
      h+='<select class="leg-proto-sel" data-leg-idx="'+li+'" style="background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;padding:2px 4px;font-size:9px;font-family:\'IBM Plex Mono\',monospace">';
      ['tcp','udp','icmp'].forEach(function(p){
        h+='<option value="'+p+'"'+(p===leg.config.protocol?' selected':'')+'>'+p.toUpperCase()+'</option>';
      });
      h+='</select>';
      h+='<input class="leg-port-inp" data-leg-idx="'+li+'" type="number" min="1" max="65535" value="'+leg.config.port+'" style="width:50px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;padding:2px 4px;font-size:9px;font-family:\'IBM Plex Mono\',monospace">';
      h+='<button class="leg-retrace-btn" data-leg-idx="'+li+'" style="background:var(--accent-cyan);color:#000;border:none;border-radius:3px;padding:2px 8px;font-size:9px;font-family:\'IBM Plex Mono\',monospace;cursor:pointer;font-weight:600">Re-trace</button>';
      h+='</div>';
      // Hops
      (leg.result.path||[]).forEach(function(hop,hi){
        var isBlk=hop.action==='block'||hop.action==='deny';
        h+='<div class="flow-step'+(isBlk?' blocked':'')+'" style="padding:5px 8px;margin-bottom:2px">';
        h+='<span class="fs-num '+(isBlk?'block':'allow')+'" style="width:16px;height:16px;line-height:16px;font-size:8px">'+hop.hop+'</span>';
        h+='<span class="fs-type" style="font-size:9px">'+_hopTypeLabel(hop.type)+'</span>';
        h+='<div class="fs-detail" style="font-size:9px">'+_escHtml(hop.detail||'')+'</div>';
        if(hop.rule) h+='<div class="fs-rule" style="font-size:8px">'+_escHtml(hop.rule)+'</div>';
        h+='</div>';
      });
      if(leg.result.blocked){
        h+='<div style="padding:6px;background:rgba(239,68,68,.06);border-radius:4px;margin-top:4px">';
        h+='<div style="font-size:9px;color:var(--accent-red)">'+_escHtml(leg.result.blocked.reason||'')+'</div>';
        h+='</div>';
      }
    }
    h+='</div></div>';
  });
  // Actions
  h+='<div style="margin-top:10px;display:flex;gap:6px">';
  h+='<button id="mhAddWpBtn" style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);color:#f59e0b;border-radius:4px;padding:4px 12px;font-size:10px;font-family:\'IBM Plex Mono\',monospace;cursor:pointer;font-weight:600">+ Waypoint</button>';
  h+='<button id="mhClearBtn" style="background:rgba(255,255,255,.04);border:1px solid var(--border);color:var(--text-secondary);border-radius:4px;padding:4px 12px;font-size:10px;font-family:\'IBM Plex Mono\',monospace;cursor:pointer">Clear All</button>';
  h+='</div>';
  h+='</div>';
  dpBody.innerHTML=h;
  dp.classList.add('open');
  // Wire events
  dpBody.querySelectorAll('.flow-leg-hdr').forEach(function(hdr){
    hdr.addEventListener('click',function(){
      var li2=parseInt(hdr.getAttribute('data-leg-idx'),10);
      _flowActiveLeg=(_flowActiveLeg===li2)?-1:li2;
      _renderMultiFlowDetail();
    });
  });
  dpBody.querySelectorAll('.wp-remove').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      _removeWaypoint(parseInt(btn.getAttribute('data-wp-idx'),10));
    });
  });
  dpBody.querySelectorAll('.leg-retrace-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      var li3=parseInt(btn.getAttribute('data-leg-idx'),10);
      var proto=dpBody.querySelector('.leg-proto-sel[data-leg-idx="'+li3+'"]');
      var port=dpBody.querySelector('.leg-port-inp[data-leg-idx="'+li3+'"]');
      if(proto&&port&&_flowWaypoints[li3]){
        _flowWaypoints[li3].config={protocol:proto.value,port:parseInt(port.value,10)||443};
        _executeMultiTrace();
      }
    });
  });
  var mhAdd=document.getElementById('mhAddWpBtn');
  if(mhAdd) mhAdd.addEventListener('click',function(e){e.stopPropagation();_addWaypoint()});
  var mhClear=document.getElementById('mhClearBtn');
  if(mhClear) mhClear.addEventListener('click',function(e){
    e.stopPropagation();
    _flowWaypoints=[];_flowLegs=[];_flowActiveLeg=-1;
    _executeTrace();
  });
}

document.getElementById('flowBtn').addEventListener('click',function(){
  if(_flowMode) exitFlowMode();
  else enterFlowMode();
});
document.getElementById('flowExitBtn').addEventListener('click',exitFlowMode);
document.getElementById('flowStepBack').addEventListener('click',_stepBack);
document.getElementById('flowStepFwd').addEventListener('click',_stepForward);

// === FLOW ANALYSIS — AUTO-DISCOVERY ENGINE ===
let _flowAnalysisMode=null; // null|'tiers'|'ingress'|'egress'|'bastion'|'all'
let _flowAnalysisCache=null;
let _faDashState={section:'all',search:'',sort:'name',sortDir:'asc',page:1,perPage:50};
let _faDashRows=null;

function discoverTrafficFlows(ctx){
  if(!ctx) return null;
  var hasSgData=(ctx.instances||[]).some(function(i){return (i.SecurityGroups||[]).length>0});
  var hasNaclEgress=(ctx.nacls||[]).some(function(n){return (n.Entries||[]).some(function(e){return e.Egress})});
  var ingressPaths=_findIngressPaths(ctx);
  var egressPaths=_findEgressPaths(ctx);
  var bastions=_detectBastions(ctx);
  var bastionChains=_findBastionChains(bastions,ctx);
  var accessTiers=_classifyAllResources(ctx,ingressPaths,bastionChains);
  return {ingressPaths:ingressPaths,egressPaths:egressPaths,accessTiers:accessTiers,bastionChains:bastionChains,bastions:bastions,hasSgData:hasSgData,hasNaclEgress:hasNaclEgress};
}

function _findIngressPaths(ctx){
  var paths=[];
  var igws=ctx.igws||[];
  igws.forEach(function(igw){
    var vpcId=(igw.Attachments||[])[0]?.VpcId;
    if(!vpcId) return;
    // Find public subnets in this VPC
    (ctx.subnets||[]).forEach(function(sub){
      if(sub.VpcId!==vpcId) return;
      if(!ctx.pubSubs||!ctx.pubSubs.has(sub.SubnetId)) return;
      // Instances in this subnet
      (ctx.instBySub[sub.SubnetId]||[]).forEach(function(inst){
        // Check common ports
        [443,80,22].forEach(function(port){
          var r=_traceInternetToResource({type:'instance',id:inst.InstanceId},{protocol:'tcp',port:port},ctx,{discovery:true});
          if(!r.blocked){
            var gn3=inst.Tags?((inst.Tags.find(function(t){return t.Key==='Name'})||{}).Value||inst.InstanceId):inst.InstanceId;
            paths.push({from:'internet',to:{type:'instance',id:inst.InstanceId},toName:gn3,path:r.path,port:port,type:'direct',vpcId:vpcId});
          }
        });
      });
      // ALBs in this subnet
      (ctx.albBySub[sub.SubnetId]||[]).forEach(function(alb){
        var albId=alb.LoadBalancerArn?alb.LoadBalancerArn.split('/').pop():'';
        var r=_traceInternetToResource({type:'alb',id:albId||alb.LoadBalancerName},{protocol:'tcp',port:443},ctx,{discovery:true});
        if(!r.blocked){
          paths.push({from:'internet',to:{type:'alb',id:albId||alb.LoadBalancerName},toName:alb.LoadBalancerName||albId,path:r.path,port:443,type:'loadbalancer',vpcId:vpcId});
        }
      });
    });
  });
  return paths;
}

function _findEgressPaths(ctx){
  var paths=[];
  // Check all resources for egress to internet
  var checked=new Set();
  (ctx.instances||[]).forEach(function(inst){
    if(checked.has(inst.SubnetId)) return; // one per subnet suffices for egress
    var r=_traceResourceToInternet({type:'instance',id:inst.InstanceId},{protocol:'tcp',port:443},ctx,{discovery:true});
    if(!r.blocked){
      checked.add(inst.SubnetId);
      var gn3=inst.Tags?((inst.Tags.find(function(t){return t.Key==='Name'})||{}).Value||inst.InstanceId):inst.InstanceId;
      paths.push({from:{type:'instance',id:inst.InstanceId},fromName:gn3,to:'internet',subnetId:inst.SubnetId,via:r.path.some(function(h){return h.detail&&h.detail.includes('NAT')})?'nat':'igw'});
    }
  });
  return paths;
}

function _detectBastions(ctx){
  var bastions=[];
  var hasSgData=(ctx.instances||[]).some(function(i){return (i.SecurityGroups||[]).length>0});
  (ctx.instances||[]).forEach(function(inst){
    if(!ctx.pubSubs||!ctx.pubSubs.has(inst.SubnetId)) return;
    var gn3=inst.Tags?((inst.Tags.find(function(t){return t.Key==='Name'})||{}).Value||inst.InstanceId):inst.InstanceId;
    var nameMatch=/bastion|jump|ssh/i.test(gn3);
    if(hasSgData){
      var sgs=(inst.SecurityGroups||[]).map(function(s){return (ctx.sgs||[]).find(function(sg){return sg.GroupId===s.GroupId})}).filter(Boolean);
      var hasSSH=sgs.some(function(sg){return (sg.IpPermissions||[]).some(function(r){return r.FromPort<=22&&r.ToPort>=22})});
      if(!hasSSH&&!nameMatch) return;
    } else {
      // No SG associations — use name heuristic only
      if(!nameMatch) return;
    }
    bastions.push({type:'instance',id:inst.InstanceId,name:gn3,subnetId:inst.SubnetId,vpcId:inst.VpcId||((ctx.subnets||[]).find(function(s){return s.SubnetId===inst.SubnetId})||{}).VpcId});
  });
  return bastions;
}

function _findBastionChains(bastions,ctx){
  var chains=[];
  var hasSgData=(ctx.instances||[]).some(function(i){return (i.SecurityGroups||[]).length>0});
  bastions.forEach(function(bastion){
    var targets=[];
    var testedSubs=new Set(); // one trace per subnet to avoid O(n²)
    // Find private resources in same VPC reachable from this bastion
    (ctx.instances||[]).forEach(function(inst){
      if(inst.InstanceId===bastion.id) return;
      var instVpc=inst.VpcId||((ctx.subnets||[]).find(function(s){return s.SubnetId===inst.SubnetId})||{}).VpcId;
      if(instVpc!==bastion.vpcId) return;
      if(ctx.pubSubs&&ctx.pubSubs.has(inst.SubnetId)) return; // skip public
      var gn3=inst.Tags?((inst.Tags.find(function(t){return t.Key==='Name'})||{}).Value||inst.InstanceId):inst.InstanceId;
      if(!hasSgData){
        // Without SG data, skip trace — just include private-subnet instances (cap at 50)
        if(targets.length<50) targets.push({type:'instance',id:inst.InstanceId,name:gn3});
      } else if(!testedSubs.has(inst.SubnetId)){
        testedSubs.add(inst.SubnetId);
        var r=_traceFlowLeg({type:'instance',id:bastion.id},{type:'instance',id:inst.InstanceId},{protocol:'tcp',port:22},ctx,{discovery:true});
        if(!r.blocked) targets.push({type:'instance',id:inst.InstanceId,name:gn3});
      } else {
        // Same subnet already tested and passed — add without re-tracing
        targets.push({type:'instance',id:inst.InstanceId,name:gn3});
      }
    });
    // Check RDS
    (ctx.rdsInstances||[]).forEach(function(db){
      var rSid=null;
      Object.keys(ctx.rdsBySub||{}).forEach(function(sid){(ctx.rdsBySub[sid]||[]).forEach(function(d){if(d.DBInstanceIdentifier===db.DBInstanceIdentifier)rSid=sid})});
      if(!rSid) return;
      var rVpc=((ctx.subnets||[]).find(function(s){return s.SubnetId===rSid})||{}).VpcId;
      if(rVpc!==bastion.vpcId) return;
      if(!hasSgData){
        targets.push({type:'rds',id:db.DBInstanceIdentifier,name:db.DBInstanceIdentifier});
      } else {
        var port=(db.Endpoint&&db.Endpoint.Port)||3306;
        var r=_traceFlowLeg({type:'instance',id:bastion.id},{type:'rds',id:db.DBInstanceIdentifier},{protocol:'tcp',port:port},ctx,{discovery:true});
        if(!r.blocked) targets.push({type:'rds',id:db.DBInstanceIdentifier,name:db.DBInstanceIdentifier});
      }
    });
    if(targets.length>0) chains.push({bastion:bastion,targets:targets});
  });
  return chains;
}

function _classifyAllResources(ctx,ingressPaths,bastionChains){
  var tiers={internetFacing:[],bastionOnly:[],fullyPrivate:[],database:[]};
  var ingressSet=new Set();
  ingressPaths.forEach(function(p){ingressSet.add(p.to.type+':'+p.to.id)});
  var bastionSet=new Set();
  bastionChains.forEach(function(ch){ch.targets.forEach(function(t){bastionSet.add(t.type+':'+t.id)})});
  // Classify instances
  (ctx.instances||[]).forEach(function(inst){
    var key='instance:'+inst.InstanceId;
    var gn3=inst.Tags?((inst.Tags.find(function(t){return t.Key==='Name'})||{}).Value||inst.InstanceId):inst.InstanceId;
    var ref={type:'instance',id:inst.InstanceId,name:gn3};
    if(ingressSet.has(key)){tiers.internetFacing.push(ref);return}
    if(bastionSet.has(key)){tiers.bastionOnly.push(ref);return}
    tiers.fullyPrivate.push(ref);
  });
  // Classify ALBs
  Object.keys(ctx.albBySub||{}).forEach(function(sid){
    (ctx.albBySub[sid]||[]).forEach(function(alb){
      var albId=alb.LoadBalancerArn?alb.LoadBalancerArn.split('/').pop():'';
      var key='alb:'+(albId||alb.LoadBalancerName);
      var ref={type:'alb',id:albId||alb.LoadBalancerName,name:alb.LoadBalancerName||albId};
      if(ingressSet.has(key)){tiers.internetFacing.push(ref);return}
      tiers.fullyPrivate.push(ref);
    });
  });
  // Classify RDS as database tier
  (ctx.rdsInstances||[]).forEach(function(db){
    tiers.database.push({type:'rds',id:db.DBInstanceIdentifier,name:db.DBInstanceIdentifier});
  });
  // ElastiCache as database tier
  (ctx.ecacheClusters||[]).forEach(function(ec){
    tiers.database.push({type:'ecache',id:ec.CacheClusterId,name:ec.CacheClusterId});
  });
  return tiers;
}

// --- Flow Analysis Visualization ---
function _renderFlowAnalysisOverlay(mode){
  var svg=d3.select('#mapSvg');
  svg.selectAll('.flow-analysis-layer').remove();
  // Clean up previous highlight state
  var mapRoot=svg.select('g');
  if(!mapRoot.empty()) mapRoot.classed('fa-active',false);
  document.querySelectorAll('.fa-hl-ingress,.fa-hl-egress').forEach(function(el){
    el.classList.remove('fa-hl-ingress','fa-hl-egress');
  });
  var inetNode=document.querySelector('.internet-node');
  if(inetNode) d3.select(inetNode).style('opacity',null).style('filter',null);
  if(!_flowAnalysisCache||!mode) return;
  var g=mapRoot.empty()?svg:mapRoot;
  var faG=g.append('g').attr('class','flow-analysis-layer');
  // Dim map for modes that highlight route lines
  var needDim=(mode==='ingress'||mode==='egress'||mode==='all');
  if(needDim&&!mapRoot.empty()) mapRoot.classed('fa-active',true);
  if(mode==='tiers'||mode==='all') _renderTierBadges(faG);
  if(mode==='ingress'||mode==='all') _renderIngressArrows(faG);
  if(mode==='egress'||mode==='all') _renderEgressArrows(faG);
  if(mode==='bastion'||mode==='all') _renderBastionArrows(faG);
}

function _renderTierBadges(faG){
  var colors={internetFacing:'#10b981',bastionOnly:'#22d3ee',fullyPrivate:'#8b5cf6',database:'#f59e0b'};
  // Deduplicate by subnet — one badge per (subnet, tier) to avoid hundreds of overlapping dots
  var subTierSeen=new Set();
  Object.keys(_flowAnalysisCache.accessTiers).forEach(function(tier){
    (_flowAnalysisCache.accessTiers[tier]||[]).forEach(function(ref){
      var pos=_resolveNetworkPosition(ref.type, ref.id, _rlCtx);
      if(!pos||!pos.subnetId) return;
      var key=pos.subnetId+':'+tier;
      if(subTierSeen.has(key)) return;
      subTierSeen.add(key);
      var c=_getSubnetCenter(pos.subnetId);
      if(!c) return;
      // Offset badges by tier type so they don't overlap
      var idx=['internetFacing','bastionOnly','fullyPrivate','database'].indexOf(tier);
      faG.append('circle').attr('class','tier-badge').attr('cx',c.x+12+idx*14).attr('cy',c.y-12).attr('r',6)
        .attr('fill',colors[tier]||'#6b7280').attr('stroke','#1a1a2e').attr('stroke-width',1.5);
    });
  });
}

function _renderIngressArrows(faG){
  if(!_rlCtx) return;
  var sg=document.querySelector('.struct-group');
  if(!sg) return;
  // Collect unique (igwId, subnetId, vpcId) combos from ingress paths
  var seen=new Set();
  var hlEls=[];
  (_flowAnalysisCache.ingressPaths||[]).forEach(function(p){
    var pos=_resolveNetworkPosition(p.to.type, p.to.id, _rlCtx);
    if(!pos||!pos.subnetId||!pos.vpcId) return;
    var igw=(_rlCtx.igws||[]).find(function(g){return (g.Attachments||[]).some(function(a){return a.VpcId===pos.vpcId})});
    if(!igw) return;
    var gid=igw.InternetGatewayId;
    var key=gid+':'+pos.subnetId;
    if(seen.has(key)) return;
    seen.add(key);
    // Highlight subnet→IGW route lines
    sg.querySelectorAll('[data-gid="'+gid+'"][data-sid="'+pos.subnetId+'"]').forEach(function(el){hlEls.push(el)});
    // Highlight trunk/L-bend paths (gateway+VPC, no subnet)
    sg.querySelectorAll('[data-gid="'+gid+'"][data-vid="'+pos.vpcId+'"]:not([data-sid])').forEach(function(el){hlEls.push(el)});
    // Highlight gateway-only paths (bus-bar verticals)
    sg.querySelectorAll('[data-gid="'+gid+'"]:not([data-vid]):not([data-net-vert]):not([data-net-line])').forEach(function(el){hlEls.push(el)});
    // Highlight NET verticals for this gateway
    sg.querySelectorAll('[data-net-vert][data-gid="'+gid+'"]').forEach(function(el){hlEls.push(el)});
  });
  // Highlight the NET horizontal line (shared internet backbone)
  var netLine=sg.querySelector('[data-net-line]');
  if(netLine&&hlEls.length>0) hlEls.push(netLine);
  // Highlight internet node
  var inetNode=document.querySelector('.internet-node');
  if(inetNode&&hlEls.length>0) d3.select(inetNode).style('opacity','1').style('filter','drop-shadow(0 0 6px rgba(16,185,129,.6))');
  // Apply glow class to all collected elements
  hlEls.forEach(function(el){el.classList.add('fa-hl-ingress')});
}

function _renderEgressArrows(faG){
  if(!_rlCtx) return;
  var sg=document.querySelector('.struct-group');
  if(!sg) return;
  var seen=new Set();
  var hlEls=[];
  (_flowAnalysisCache.egressPaths||[]).forEach(function(p){
    var pos=_resolveNetworkPosition(p.from.type, p.from.id, _rlCtx);
    if(!pos||!pos.subnetId||!pos.vpcId) return;
    if(seen.has(pos.subnetId)) return;
    seen.add(pos.subnetId);
    // Find the gateway used for egress (NAT or IGW)
    var gid=null;
    if(p.via==='nat'){
      var nat=(_rlCtx.nats||[]).find(function(n){
        var nSub=((_rlCtx.subnets||[]).find(function(s){return s.SubnetId===n.SubnetId})||{});
        return nSub.VpcId===pos.vpcId;
      });
      if(nat) gid=nat.NatGatewayId;
    }
    if(!gid){
      var igw=(_rlCtx.igws||[]).find(function(g){return (g.Attachments||[]).some(function(a){return a.VpcId===pos.vpcId})});
      if(igw) gid=igw.InternetGatewayId;
    }
    if(!gid) return;
    // Highlight subnet→gateway route lines
    sg.querySelectorAll('[data-gid="'+gid+'"][data-sid="'+pos.subnetId+'"]').forEach(function(el){hlEls.push(el)});
    sg.querySelectorAll('[data-gid="'+gid+'"][data-vid="'+pos.vpcId+'"]:not([data-sid])').forEach(function(el){hlEls.push(el)});
    sg.querySelectorAll('[data-gid="'+gid+'"]:not([data-vid]):not([data-net-vert]):not([data-net-line])').forEach(function(el){hlEls.push(el)});
    // For NAT egress, also highlight NAT→IGW chain if applicable
    if(p.via==='nat'){
      var igw2=(_rlCtx.igws||[]).find(function(g){return (g.Attachments||[]).some(function(a){return a.VpcId===pos.vpcId})});
      if(igw2){
        var igwId=igw2.InternetGatewayId;
        sg.querySelectorAll('[data-net-vert][data-gid="'+igwId+'"]').forEach(function(el){hlEls.push(el)});
      }
    } else {
      sg.querySelectorAll('[data-net-vert][data-gid="'+gid+'"]').forEach(function(el){hlEls.push(el)});
    }
  });
  if(hlEls.length>0){
    var netLine=sg.querySelector('[data-net-line]');
    if(netLine) hlEls.push(netLine);
  }
  hlEls.forEach(function(el){el.classList.add('fa-hl-egress')});
}

function _renderBastionArrows(faG){
  var line=d3.line().x(function(d){return d.x}).y(function(d){return d.y}).curve(d3.curveBasis);
  (_flowAnalysisCache.bastionChains||[]).forEach(function(ch){
    var bPos=_resolveNetworkPosition(ch.bastion.type, ch.bastion.id, _rlCtx);
    if(!bPos) return;
    var bc=_getSubnetCenter(bPos.subnetId);
    if(!bc) return;
    // Bastion waypoint marker (reuses trace waypoint style — orange circle with "B")
    var wg=faG.append('g').attr('class','flow-waypoint-marker');
    wg.append('circle').attr('cx',bc.x).attr('cy',bc.y).attr('r',14);
    wg.append('text').attr('x',bc.x).attr('y',bc.y+1)
      .attr('text-anchor','middle').attr('dominant-baseline','central')
      .attr('fill','#000').attr('font-size','9px').attr('font-weight','700')
      .attr('font-family','IBM Plex Mono').text('B');
    // Internet → Bastion leg (if internet coords available)
    var ic=_getInternetCoords();
    if(ic){
      var midY=Math.min(ic.y,bc.y)-30;
      faG.append('path').attr('class','flow-path-leg allowed')
        .attr('d',line([ic,{x:(ic.x+bc.x)/2,y:midY},bc]));
    }
    // Deduplicate targets by subnet
    var subSeen=new Set();
    var uniqueTargets=[];
    ch.targets.forEach(function(tgt){
      var tPos=_resolveNetworkPosition(tgt.type, tgt.id, _rlCtx);
      if(!tPos||!tPos.subnetId) return;
      if(subSeen.has(tPos.subnetId)) return;
      subSeen.add(tPos.subnetId);
      var tc=_getSubnetCenter(tPos.subnetId);
      if(tc) uniqueTargets.push({pos:tc,name:tgt.name||tgt.id});
    });
    // Bastion → Target legs with fan-out offset
    var n=uniqueTargets.length;
    uniqueTargets.forEach(function(ut,idx){
      var tc=ut.pos;
      var dx=tc.x-bc.x,dy=tc.y-bc.y;
      var dist=Math.sqrt(dx*dx+dy*dy);
      var perpX=n>1?(-dy/dist)*((idx-n/2+0.5)*18):0;
      var perpY=n>1?(dx/dist)*((idx-n/2+0.5)*18):0;
      var mid={x:(bc.x+tc.x)/2+perpX,y:(bc.y+tc.y)/2+perpY-(dist>80?25:10)};
      faG.append('path').attr('class','flow-path-leg allowed')
        .attr('d',line([bc,mid,tc]));
      // Target hop marker (reuses trace hop style — numbered green circle)
      var hopG=faG.append('g').attr('class','flow-hop flow-hop-allow');
      hopG.append('circle').attr('cx',tc.x).attr('cy',tc.y).attr('r',8);
      hopG.append('text').attr('x',tc.x).attr('y',tc.y)
        .style('font-size','7px').text(idx+1);
    });
  });
}



// --- Flow Analysis Detail Panel ---
function _renderFlowAnalysisPanel(){
  if(!_flowAnalysisCache) return;
  var dp=document.getElementById('detailPanel');
  var dpTitle=document.getElementById('dpTitle');
  var dpSub=document.getElementById('dpSub');
  var dpBody=document.getElementById('dpBody');
  var d=_flowAnalysisCache;
  var mode=_flowAnalysisMode||'all';
  var modeTitles={tiers:'Access Tiers',ingress:'Ingress Paths',egress:'Egress Paths',bastion:'Bastion Chains',all:'Traffic Flow Analysis'};
  dpTitle.textContent=modeTitles[mode]||'Traffic Flow Analysis';
  var total=(d.accessTiers.internetFacing.length+d.accessTiers.bastionOnly.length+d.accessTiers.fullyPrivate.length+d.accessTiers.database.length);
  var subParts=[];
  if(mode==='tiers'||mode==='all') subParts.push(total+' resources classified');
  if(mode==='ingress'||mode==='all') subParts.push(d.ingressPaths.length+' ingress paths');
  if(mode==='egress'||mode==='all') subParts.push(d.egressPaths.length+' egress paths');
  if(mode==='bastion'||mode==='all') subParts.push(d.bastionChains.length+' bastion chains');
  dpSub.textContent=subParts.join(' · ');
  var h='<div class="flow-panel">';
  // Data quality warning
  var _warnParts=[];
  if(!d.hasSgData) _warnParts.push('SG associations');
  if(!d.hasNaclEgress) _warnParts.push('NACL egress rules');
  if(_warnParts.length) h+='<div style="padding:6px 8px;margin-bottom:10px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);border-radius:4px;font-size:9px;color:#fbbf24;font-family:\'IBM Plex Mono\',monospace">'+_warnParts.join(' & ')+' missing — results based on available topology data</div>';
  // === TIERS section ===
  if(mode==='tiers'||mode==='all'){
    h+='<h4>Access Tiers</h4>';
    var tierData=[
      {key:'internetFacing',label:'Internet-Facing',color:'#10b981',icon:'↗'},
      {key:'bastionOnly',label:'Bastion-Only',color:'#22d3ee',icon:''},
      {key:'fullyPrivate',label:'Fully Private',color:'#8b5cf6',icon:''},
      {key:'database',label:'Database Tier',color:'#f59e0b',icon:''}
    ];
    tierData.forEach(function(td){
      var items=d.accessTiers[td.key]||[];
      var count=items.length;
      h+='<div class="fa-tier-row" data-fa-tier="'+td.key+'">';
      h+='<span class="fa-tier-dot" style="background:'+td.color+'"></span>';
      h+='<span style="color:var(--text-primary);font-weight:600">'+td.label+'</span>';
      h+='<span style="margin-left:auto;color:'+td.color+';font-weight:700">'+count+'</span>';
      h+='</div>';
      // In tiers mode, show first few expanded; in all mode, collapsed
      var expanded=mode==='tiers'&&count<=20;
      h+='<div class="fa-tier-list" data-tier="'+td.key+'" style="display:'+(expanded?'block':'none')+';padding-left:20px;margin-bottom:8px">';
      items.forEach(function(ref){
        h+='<div class="fa-path-item" data-ref-type="'+ref.type+'" data-ref-id="'+_escHtml(ref.id)+'">';
        h+=_escHtml(ref.name||ref.id)+' <span style="color:var(--text-muted);font-size:9px">('+ref.type+')</span>';
        h+='</div>';
      });
      h+='</div>';
    });
  }
  // === INGRESS section ===
  if(mode==='ingress'||mode==='all'){
    var inPaths=d.ingressPaths||[];
    if(inPaths.length>0){
      if(mode!=='ingress') h+='<h4 style="margin-top:14px">Ingress Paths ('+inPaths.length+')</h4>';
      // In ingress mode, group by port
      if(mode==='ingress'){
        var byPort={};
        var seen2=new Set();
        inPaths.forEach(function(p){
          var key=p.to.type+':'+p.to.id+':'+p.port;
          if(seen2.has(key)) return;
          seen2.add(key);
          var pk=p.port||'other';
          if(!byPort[pk]) byPort[pk]=[];
          byPort[pk].push(p);
        });
        var portKeys=Object.keys(byPort).sort(function(a,b){return (byPort[b].length-byPort[a].length)});
        portKeys.forEach(function(pk){
          var portLabel=pk==='443'?'HTTPS (443)':pk==='80'?'HTTP (80)':pk==='22'?'SSH (22)':'Port '+pk;
          h+='<h4 style="margin-top:10px;color:#10b981">'+portLabel+' <span style="color:var(--text-muted);font-weight:400">('+byPort[pk].length+' targets)</span></h4>';
          byPort[pk].forEach(function(p){
            h+='<div class="fa-path-item" data-ref-type="'+p.to.type+'" data-ref-id="'+_escHtml(p.to.id)+'" style="display:flex;align-items:center">';
            h+='<span style="flex:1"><span style="color:#10b981">↓</span> Internet → <span style="color:var(--accent-cyan)">'+_escHtml(p.toName||p.to.id)+'</span>';
            h+=' <span style="color:var(--text-muted);font-size:9px">('+p.type+')</span></span>';
            h+='<button class="fa-trace-btn" data-trace-src-t="internet" data-trace-src-id="internet" data-trace-tgt-t="'+p.to.type+'" data-trace-tgt-id="'+_escHtml(p.to.id)+'" data-trace-port="'+p.port+'">Trace ↗</button>';
            h+='</div>';
          });
        });
      } else {
        // All mode: compact deduplicated list
        var seen3=new Set();
        inPaths.forEach(function(p){
          var key=p.to.type+':'+p.to.id;
          if(seen3.has(key)) return;
          seen3.add(key);
          h+='<div class="fa-path-item" data-ref-type="'+p.to.type+'" data-ref-id="'+_escHtml(p.to.id)+'" style="display:flex;align-items:center">';
          h+='<span style="flex:1"><span style="color:#10b981">↓</span> Internet → <span style="color:var(--accent-cyan)">'+_escHtml(p.toName||p.to.id)+'</span>';
          h+=' <span style="color:var(--text-muted);font-size:9px">:'+p.port+' ('+p.type+')</span></span>';
          h+='<button class="fa-trace-btn" data-trace-src-t="internet" data-trace-src-id="internet" data-trace-tgt-t="'+p.to.type+'" data-trace-tgt-id="'+_escHtml(p.to.id)+'" data-trace-port="'+p.port+'">Trace ↗</button>';
          h+='</div>';
        });
      }
    } else if(mode==='ingress'){
      h+='<div style="padding:12px;color:var(--text-muted);font-size:10px;text-align:center">No ingress paths discovered</div>';
    }
  }
  // === EGRESS section ===
  if(mode==='egress'||mode==='all'){
    var egPaths=d.egressPaths||[];
    if(egPaths.length>0){
      h+='<h4 style="margin-top:14px">Egress Paths ('+egPaths.length+')</h4>';
      if(mode==='egress'){
        // Group by via type (IGW vs NAT)
        var byVia={igw:[],nat:[]};
        egPaths.forEach(function(p){byVia[p.via||'igw'].push(p)});
        ['igw','nat'].forEach(function(via){
          if(!byVia[via].length) return;
          var viaLabel=via==='igw'?'via Internet Gateway':'via NAT Gateway';
          h+='<h4 style="margin-top:10px;color:#f97316">'+viaLabel+' <span style="color:var(--text-muted);font-weight:400">('+byVia[via].length+' subnets)</span></h4>';
          byVia[via].forEach(function(p){
            h+='<div class="fa-path-item" data-ref-type="'+p.from.type+'" data-ref-id="'+_escHtml(p.from.id)+'">';
            h+='<span style="color:#f97316">↑</span> <span style="color:var(--accent-cyan)">'+_escHtml(p.fromName||p.from.id)+'</span> → Internet';
            h+='</div>';
          });
        });
      } else {
        // All mode: compact list
        egPaths.forEach(function(p){
          h+='<div class="fa-path-item" data-ref-type="'+p.from.type+'" data-ref-id="'+_escHtml(p.from.id)+'">';
          h+='<span style="color:#f97316">↑</span> <span style="color:var(--accent-cyan)">'+_escHtml(p.fromName||p.from.id)+'</span> → Internet <span style="color:var(--text-muted);font-size:9px">('+p.via+')</span>';
          h+='</div>';
        });
      }
    } else if(mode==='egress'){
      h+='<div style="padding:12px;color:var(--text-muted);font-size:10px;text-align:center">No egress paths discovered</div>';
    }
  }
  // === BASTION section ===
  if(mode==='bastion'||mode==='all'){
    var chains=d.bastionChains||[];
    if(chains.length>0){
      h+='<h4 style="margin-top:14px">Bastion Chains ('+chains.length+')</h4>';
      chains.forEach(function(ch){
        h+='<div class="fa-path-item" data-ref-type="'+ch.bastion.type+'" data-ref-id="'+_escHtml(ch.bastion.id)+'">';
        h+=_escHtml(ch.bastion.name||ch.bastion.id);
        h+=' → <span style="color:var(--text-muted)">'+ch.targets.length+' target'+(ch.targets.length>1?'s':'')+'</span>';
        h+='</div>';
        // In bastion mode, show targets expanded
        var showTargets=mode==='bastion';
        h+='<div class="fa-bastion-targets" style="display:'+(showTargets?'block':'none')+';padding-left:24px;margin-bottom:8px">';
        ch.targets.forEach(function(tgt){
          h+='<div class="fa-path-item" data-ref-type="'+tgt.type+'" data-ref-id="'+_escHtml(tgt.id)+'" style="display:flex;align-items:center">';
          h+='<span style="flex:1">└ '+_escHtml(tgt.name||tgt.id)+'</span>';
          h+='<button class="fa-trace-btn" data-trace-src-t="'+ch.bastion.type+'" data-trace-src-id="'+_escHtml(ch.bastion.id)+'" data-trace-tgt-t="'+tgt.type+'" data-trace-tgt-id="'+_escHtml(tgt.id)+'" data-trace-port="22">Trace ↗</button>';
          h+='</div>';
        });
        h+='</div>';
      });
    } else if(mode==='bastion'){
      h+='<div style="padding:12px;color:var(--text-muted);font-size:10px;text-align:center">No bastion hosts detected</div>';
    }
  }
  h+='</div>';
  dpBody.innerHTML=h;
  dp.classList.add('open');
  // Wire tier row clicks (expand/collapse resource list)
  dpBody.querySelectorAll('.fa-tier-row').forEach(function(row){
    row.addEventListener('click',function(){
      var tier=row.getAttribute('data-fa-tier');
      var list=dpBody.querySelector('.fa-tier-list[data-tier="'+tier+'"]');
      if(list) list.style.display=list.style.display==='none'?'block':'none';
    });
  });
  // Wire bastion chain expand/collapse (in all mode)
  dpBody.querySelectorAll('.fa-path-item[data-ref-type]').forEach(function(item){
    // Check if this is a bastion header with a sibling targets div
    var next=item.nextElementSibling;
    if(next&&next.classList.contains('fa-bastion-targets')){
      item.addEventListener('click',function(e){
        e.stopPropagation();
        next.style.display=next.style.display==='none'?'block':'none';
        // Also highlight on map
        var refType=item.getAttribute('data-ref-type');
        var refId=item.getAttribute('data-ref-id');
        if(refType&&refId){_clearFlowHighlights();_highlightFlowNode({type:refType,id:refId},'source')}
      });
    } else {
      // Regular resource click → highlight on map
      item.addEventListener('click',function(){
        var refType=item.getAttribute('data-ref-type');
        var refId=item.getAttribute('data-ref-id');
        if(refType&&refId){_clearFlowHighlights();_highlightFlowNode({type:refType,id:refId},'source')}
      });
    }
  });
  // Wire "Trace ↗" bridge buttons — exit analysis, enter trace with pre-filled source/target
  dpBody.querySelectorAll('.fa-trace-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      _launchTraceFromBtn(btn);
    });
  });
}

// --- Flow Analysis Mode Control ---
function enterFlowAnalysis(){
  if(!_rlCtx){alert('Load a map first');return}
  if(_flowMode) exitFlowMode();
  _flowAnalysisMode='tiers';
  // Run discovery
  _flowAnalysisCache=discoverTrafficFlows(_rlCtx);
  // Show banner
  document.getElementById('flowAnalysisBanner').style.display='flex';
  var mainEl=document.querySelector('.main');
  if(mainEl) mainEl.classList.add('flow-active');
  // Render
  _renderFlowAnalysisOverlay(_flowAnalysisMode);
  _renderFlowAnalysisPanel();
  // Set active pill
  document.querySelectorAll('.fa-mode-pill').forEach(function(p){
    p.classList.toggle('active',p.getAttribute('data-fa-mode')===_flowAnalysisMode);
  });
}

function exitFlowAnalysis(){
  _flowAnalysisMode=null;
  document.getElementById('flowAnalysisBanner').style.display='none';
  var mainEl=document.querySelector('.main');
  if(mainEl) mainEl.classList.remove('flow-active');
  var svg=d3.select('#mapSvg');
  svg.selectAll('.flow-analysis-layer').remove();
  // Remove route-line highlight classes and fa-active dim
  var mapRoot=svg.select('g');
  if(!mapRoot.empty()) mapRoot.classed('fa-active',false);
  document.querySelectorAll('.fa-hl-ingress,.fa-hl-egress').forEach(function(el){
    el.classList.remove('fa-hl-ingress','fa-hl-egress');
  });
  var inetNode=document.querySelector('.internet-node');
  if(inetNode) d3.select(inetNode).style('opacity',null).style('filter',null);
  _clearFlowHighlights();
  var dp=document.getElementById('detailPanel');
  if(dp.classList.contains('open')){
    var dpBody=document.getElementById('dpBody');
    if(dpBody&&dpBody.querySelector('.flow-panel')) dp.classList.remove('open');
  }
}

function _setFlowAnalysisMode(mode){
  _flowAnalysisMode=mode;
  _renderFlowAnalysisOverlay(mode);
  _renderFlowAnalysisPanel();
  document.querySelectorAll('.fa-mode-pill').forEach(function(p){
    p.classList.toggle('active',p.getAttribute('data-fa-mode')===mode);
  });
}

// Wire Flow Analysis controls
document.getElementById('flowAnalysisBtn').addEventListener('click',function(){
  if(_flowAnalysisMode) exitFlowAnalysis();
  else enterFlowAnalysis();
});
document.getElementById('faExitBtn').addEventListener('click',exitFlowAnalysis);
document.querySelectorAll('.fa-mode-pill').forEach(function(pill){
  pill.addEventListener('click',function(){
    _setFlowAnalysisMode(pill.getAttribute('data-fa-mode'));
  });
});

// --- Right-Click Context Menu for Flow Tracing ---
var _flowCtxTarget=null;
(function(){
  var ctxMenu=document.getElementById('flowContextMenu');
  function hideCtx(){ctxMenu.style.display='none';_flowCtxTarget=null}
  // Show context menu on right-click of map resources
  document.getElementById('mapSvg').addEventListener('contextmenu',function(e){
    if(_flowMode) return; // existing flow mode handles its own right-click
    var target=_resolveClickTarget(e.target);
    if(!target) return;
    e.preventDefault();
    e.stopPropagation();
    _flowCtxTarget=target;
    ctxMenu.style.display='block';
    // Position near click, clamped to viewport
    var x=Math.min(e.clientX,window.innerWidth-200);
    var y=Math.min(e.clientY,window.innerHeight-140);
    ctxMenu.style.left=x+'px';
    ctxMenu.style.top=y+'px';
  });
  // Hide on any click outside
  document.addEventListener('click',function(e){
    if(!ctxMenu.contains(e.target)) hideCtx();
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape') hideCtx();
  });
  // Handle menu item clicks
  ctxMenu.querySelectorAll('.flow-ctx-item').forEach(function(item){
    item.addEventListener('click',function(e){
      e.stopPropagation();
      if(!_flowCtxTarget) return;
      var action=item.getAttribute('data-ctx-action');
      var ref={type:_flowCtxTarget.type,id:_flowCtxTarget.id};
      hideCtx();
      if(action==='trace-from'){
        if(_flowMode) exitFlowMode();
        if(_flowAnalysisMode) exitFlowAnalysis();
        enterFlowMode(ref);
      } else if(action==='trace-to'){
        if(_flowMode) exitFlowMode();
        if(_flowAnalysisMode) exitFlowAnalysis();
        enterFlowMode(); // no preset source
        // Store preset target — next source click will auto-advance
        _flowCtxPresetTarget=ref;
      } else if(action==='analyze'){
        if(_flowMode) exitFlowMode();
        if(!_flowAnalysisMode) enterFlowAnalysis();
        // Highlight the resource in the analysis panel
        _clearFlowHighlights();
        _highlightFlowNode(ref,'source');
      }
    });
  });
})();
var _flowCtxPresetTarget=null;

// --- Shared: Launch trace from a discovery button ---
function _launchTraceFromBtn(btn, preCleanup){
  var srcT=btn.getAttribute('data-trace-src-t');
  var srcId=btn.getAttribute('data-trace-src-id');
  var tgtT=btn.getAttribute('data-trace-tgt-t');
  var tgtId=btn.getAttribute('data-trace-tgt-id');
  var port=parseInt(btn.getAttribute('data-trace-port'),10)||443;
  if(preCleanup) preCleanup();
  exitFlowAnalysis();
  enterFlowMode({type:srcT,id:srcId});
  _flowTarget={type:tgtT,id:tgtId};
  _flowSelecting=null;
  var mainEl=document.querySelector('.main');
  if(mainEl) mainEl.classList.remove('flow-selecting');
  _flowConfig.port=port;
  _flowConfig.protocol='tcp';
  _highlightFlowNode({type:tgtT,id:tgtId},'target');
  _executeTrace();
}

// --- Full Flow Analysis Dashboard ---
function _openFlowAnalysisDashboard(d){
  if(!d) return;
  var existing=document.getElementById('faDashOverlay');
  if(existing) existing.remove();
  // --- Flatten all sections into _faDashRows ---
  _faDashRows=[];
  var seenIn=new Set();
  (d.ingressPaths||[]).forEach(function(p){
    var key=p.to.type+':'+p.to.id+':'+p.port;
    if(seenIn.has(key)) return;
    seenIn.add(key);
    _faDashRows.push({section:'ingress',name:p.toName||p.to.id,type:p.to.type,id:p.to.id,detail:String(p.port),detail2:p.type||'',via:'',tier:'',tierColor:'',_raw:p});
  });
  (d.egressPaths||[]).forEach(function(p){
    _faDashRows.push({section:'egress',name:p.fromName||p.from.id,type:p.from.type,id:p.from.id,detail:p.via||'igw',detail2:'',via:p.via||'igw',tier:'',tierColor:'',_raw:p});
  });
  (d.bastionChains||[]).forEach(function(ch){
    var tgtStr=ch.targets.map(function(t){return t.name||t.id}).join(', ');
    _faDashRows.push({section:'bastion',name:ch.bastion.name||ch.bastion.id,type:'bastion',id:ch.bastion.id,detail:ch.targets.length+' targets',detail2:tgtStr,via:'',tier:'',tierColor:'',_raw:ch});
  });
  var tierDefs=[
    {key:'internetFacing',label:'Internet-Facing',color:'#10b981'},
    {key:'bastionOnly',label:'Bastion-Only',color:'#22d3ee'},
    {key:'fullyPrivate',label:'Fully Private',color:'#8b5cf6'},
    {key:'database',label:'Database Tier',color:'#f59e0b'}
  ];
  tierDefs.forEach(function(t){
    (d.accessTiers[t.key]||[]).forEach(function(ref){
      _faDashRows.push({section:t.key,name:ref.name||ref.id,type:ref.type,id:ref.id,detail:'',detail2:'',via:'',tier:t.label,tierColor:t.color,_raw:ref});
    });
  });
  // --- Reset state ---
  _faDashState={section:'all',search:'',sort:'name',sortDir:'asc',page:1,perPage:50};
  // --- Build overlay shell ---
  var overlay=document.createElement('div');
  overlay.id='faDashOverlay';
  overlay.className='fa-dash-overlay';
  var sh='<div class="fa-dash-header">';
  sh+='<h2>Traffic Flow Analysis Dashboard</h2>';
  sh+='<span style="font-size:10px;color:var(--text-muted)">'+((d.ingressPaths||[]).length)+' ingress · '+((d.egressPaths||[]).length)+' egress · '+((d.bastionChains||[]).length)+' bastion chains</span>';
  sh+='<button class="fa-dash-close" id="faDashClose">✕ Close</button>';
  sh+='</div>';
  // Filter bar
  sh+='<div class="fa-dash-filters">';
  sh+='<input id="faDashSearch" type="text" placeholder="Filter by name, type, port, ID...">';
  sh+='<div id="faDashPills" class="fa-dash-pills"></div>';
  sh+='<select id="faDashPerPage"><option value="25">25</option><option value="50" selected>50</option><option value="100">100</option><option value="0">All</option></select>';
  sh+='</div>';
  // Summary cards (static)
  sh+='<div class="fa-dash-body" id="faDashBody">';
  sh+='<div class="fa-dash-grid" style="margin-bottom:16px">';
  tierDefs.forEach(function(t){
    var items=d.accessTiers[t.key]||[];
    sh+='<div class="fa-dash-card"><h4 style="color:'+t.color+'">'+t.label+'</h4>';
    sh+='<div class="fa-dash-stat" style="color:'+t.color+'">'+items.length+'</div>';
    sh+='<div class="fa-dash-sub">resource'+(items.length!==1?'s':'')+'</div></div>';
  });
  sh+='<div class="fa-dash-card"><h4 style="color:#10b981">↓ Ingress</h4>';
  sh+='<div class="fa-dash-stat" style="color:#10b981">'+((d.ingressPaths||[]).length)+'</div>';
  sh+='<div class="fa-dash-sub">paths from Internet</div></div>';
  sh+='<div class="fa-dash-card"><h4 style="color:#f97316">↑ Egress</h4>';
  sh+='<div class="fa-dash-stat" style="color:#f97316">'+((d.egressPaths||[]).length)+'</div>';
  sh+='<div class="fa-dash-sub">paths to Internet</div></div>';
  sh+='</div>';
  // Table container
  sh+='<div id="faDashTableWrap"></div>';
  sh+='</div>';
  // Pagination footer
  sh+='<div class="fa-dash-footer">';
  sh+='<span id="faDashRowCount"></span>';
  sh+='<button id="faDashPrev">← Prev</button>';
  sh+='<span id="faDashPageInfo"></span>';
  sh+='<button id="faDashNext">Next →</button>';
  sh+='</div>';
  overlay.innerHTML=sh;
  document.body.appendChild(overlay);
  // --- Wire static event listeners ---
  function closeDash(){overlay.remove();document.removeEventListener('keydown',dashEsc)}
  function dashEsc(e){if(e.key==='Escape'){e.stopImmediatePropagation();closeDash()}}
  document.addEventListener('keydown',dashEsc);
  document.getElementById('faDashClose').addEventListener('click',closeDash);
  document.getElementById('faDashSearch').addEventListener('input',function(){
    _faDashState.search=this.value.toLowerCase();_faDashState.page=1;_renderFaDash(closeDash);
  });
  document.getElementById('faDashPerPage').addEventListener('change',function(){
    _faDashState.perPage=parseInt(this.value)||0;_faDashState.page=1;_renderFaDash(closeDash);
  });
  document.getElementById('faDashPrev').addEventListener('click',function(){
    if(_faDashState.page>1){_faDashState.page--;_renderFaDash(closeDash)}
  });
  document.getElementById('faDashNext').addEventListener('click',function(){
    _faDashState.page++;_renderFaDash(closeDash);
  });
  _renderFaDash(closeDash);
}

var _FA_TIER_KEYS=['internetFacing','bastionOnly','fullyPrivate','database'];
var _FA_SECTION_COLORS={ingress:'#10b981',egress:'#f97316',bastion:'#22d3ee',internetFacing:'#10b981',bastionOnly:'#22d3ee',fullyPrivate:'#8b5cf6',database:'#f59e0b'};
var _FA_SECTION_LABELS={ingress:'Ingress',egress:'Egress',bastion:'Bastion',internetFacing:'Internet-Facing',bastionOnly:'Bastion-Only',fullyPrivate:'Fully Private',database:'Database'};

function _renderFaDash(closeFn){
  if(!_faDashRows) return;
  var st=_faDashState;
  // --- Pills ---
  var counts={all:_faDashRows.length,ingress:0,egress:0,bastion:0,tiers:0};
  _faDashRows.forEach(function(r){
    if(r.section==='ingress') counts.ingress++;
    else if(r.section==='egress') counts.egress++;
    else if(r.section==='bastion') counts.bastion++;
    else counts.tiers++;
  });
  var pillBox=document.getElementById('faDashPills');
  if(pillBox){
    pillBox.innerHTML='';
    [{key:'all',label:'All'},{key:'ingress',label:'Ingress'},{key:'egress',label:'Egress'},{key:'bastion',label:'Bastion'},{key:'tiers',label:'Tiers'}].forEach(function(p){
      var pill=document.createElement('span');
      pill.className='fa-dash-pill'+(st.section===p.key?' active':'');
      pill.textContent=p.label+' ('+counts[p.key]+')';
      pill.addEventListener('click',function(){st.section=p.key;st.page=1;_renderFaDash(closeFn)});
      pillBox.appendChild(pill);
    });
  }
  // --- Filter ---
  var sec=st.section;
  var search=st.search;
  var filtered=_faDashRows.filter(function(r){
    if(sec!=='all'){
      if(sec==='tiers'){if(!_FA_TIER_KEYS.includes(r.section)) return false}
      else{if(r.section!==sec) return false}
    }
    if(search){
      var hay=[r.name,r.type,r.id,r.detail,r.detail2,r.via,r.tier].filter(Boolean).join(' ').toLowerCase();
      if(hay.indexOf(search)===-1) return false;
    }
    return true;
  });
  // --- Sort ---
  var sortKey=st.sort;
  var dir=st.sortDir==='asc'?1:-1;
  filtered.sort(function(a,b){
    var av=a[sortKey]||'';var bv=b[sortKey]||'';
    if(sortKey==='detail'){var an=parseFloat(av),bn=parseFloat(bv);if(!isNaN(an)&&!isNaN(bn)) return(an-bn)*dir}
    return av<bv?-dir:av>bv?dir:0;
  });
  // --- Paginate ---
  var perPage=st.perPage<=0?filtered.length:st.perPage;
  var totalPages=Math.max(1,Math.ceil(filtered.length/perPage));
  st.page=Math.min(Math.max(1,st.page),totalPages);
  var start=(st.page-1)*perPage;
  var pageRows=filtered.slice(start,start+perPage);
  // --- Row count & pagination ---
  var rc=document.getElementById('faDashRowCount');
  if(rc) rc.textContent=filtered.length+' of '+_faDashRows.length;
  var pi=document.getElementById('faDashPageInfo');
  if(pi) pi.textContent='Page '+st.page+' of '+totalPages;
  var pp=document.getElementById('faDashPrev');if(pp) pp.disabled=(st.page<=1);
  var pn=document.getElementById('faDashNext');if(pn) pn.disabled=(st.page>=totalPages);
  // --- Build table ---
  var cols=[{key:'section',label:'Section'},{key:'name',label:'Name'},{key:'type',label:'Type'},{key:'detail',label:'Detail'},{key:'id',label:'ID',nosort:true},{key:'actions',label:'',nosort:true}];
  var h='<table class="fa-dash-table"><thead><tr>';
  cols.forEach(function(c){
    var cls='';
    if(!c.nosort&&st.sort===c.key) cls=st.sortDir==='asc'?' dd-sort-asc':' dd-sort-desc';
    h+='<th'+(c.nosort?'':' data-sort-col="'+c.key+'"')+' class="'+cls+'">'+c.label+'</th>';
  });
  h+='</tr></thead><tbody>';
  if(!pageRows.length){
    h+='<tr><td colspan="'+cols.length+'" style="text-align:center;padding:20px;color:var(--text-muted)">No rows match current filters</td></tr>';
  } else {
    pageRows.forEach(function(row){
      var sc=_FA_SECTION_COLORS[row.section]||'var(--text-muted)';
      var sl=_FA_SECTION_LABELS[row.section]||row.section;
      h+='<tr>';
      h+='<td><span class="fa-section-badge" style="background:'+sc+'22;color:'+sc+'">'+_escHtml(sl)+'</span></td>';
      h+='<td style="color:var(--accent-cyan)">'+_escHtml(row.name)+'</td>';
      h+='<td>'+_escHtml(row.type)+'</td>';
      h+='<td>'+_escHtml(row.detail)+(row.detail2?' <span style="color:var(--text-muted);font-size:9px">'+_escHtml(row.detail2)+'</span>':'')+'</td>';
      h+='<td style="font-size:9px;color:var(--text-muted)">'+_escHtml(row.id)+'</td>';
      h+='<td>';
      if(row.section==='ingress'){
        var p=row._raw;
        h+='<button class="fa-trace-btn" data-trace-src-t="internet" data-trace-src-id="internet" data-trace-tgt-t="'+p.to.type+'" data-trace-tgt-id="'+_escHtml(p.to.id)+'" data-trace-port="'+p.port+'">Trace ↗</button>';
      } else if(row.section==='bastion'&&row._raw.targets&&row._raw.targets.length>0){
        var ch=row._raw;var ft=ch.targets[0];
        h+='<button class="fa-trace-btn" data-trace-src-t="'+ch.bastion.type+'" data-trace-src-id="'+_escHtml(ch.bastion.id)+'" data-trace-tgt-t="'+ft.type+'" data-trace-tgt-id="'+_escHtml(ft.id)+'" data-trace-port="22">Trace ↗</button>';
      }
      h+='</td></tr>';
    });
  }
  h+='</tbody></table>';
  var wrap=document.getElementById('faDashTableWrap');
  if(wrap) wrap.innerHTML=h;
  // --- Wire sort headers ---
  if(wrap) wrap.querySelectorAll('th[data-sort-col]').forEach(function(th){
    th.addEventListener('click',function(){
      var col=this.dataset.sortCol;
      if(st.sort===col){st.sortDir=st.sortDir==='asc'?'desc':'asc'}
      else{st.sort=col;st.sortDir='asc'}
      st.page=1;_renderFaDash(closeFn);
    });
  });
  // --- Wire trace buttons ---
  if(wrap) wrap.querySelectorAll('.fa-trace-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      _launchTraceFromBtn(btn,closeFn);
    });
  });
}

document.getElementById('faDashBtn').addEventListener('click',function(){
  if(_flowAnalysisCache) _openFlowAnalysisDashboard(_flowAnalysisCache);
});

