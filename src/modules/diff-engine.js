// Change detection and diff engine
// Compares infrastructure snapshots and highlights changes
// Extracted from index.html for modularization

// === DIFF / CHANGE DETECTION ===
let _diffMode=false;
let _diffBaseline=null;
let _diffResults=null;
let _diffFilter='all'; // 'all'|'changes'
let _diffDashState={catFilter:'all',typeFilter:'all',vpcFilter:'all',kindFilter:'all',search:'',sort:'status',sortDir:'asc',page:1,perPage:50};
let _diffFlatRows=null; // [{category,type,key,name,vpcId,vpcName,fields,hasStructural,resource,baseline}]

const _DIFF_KEYS={
  vpcs:'VpcId',subnets:'SubnetId',instances:'InstanceId',
  sgs:'GroupId',rts:'RouteTableId',nacls:'NetworkAclId',
  igws:'InternetGatewayId',nats:'NatGatewayId',
  vpces:'VpcEndpointId',albs:'LoadBalancerArn',
  rdsInstances:'DBInstanceIdentifier',ecsServices:'serviceName',
  lambdaFns:'FunctionName',ecacheClusters:'CacheClusterId',
  redshiftClusters:'ClusterIdentifier',peerings:'VpcPeeringConnectionId'
};

const _DIFF_VOLATILE=new Set([
  'LaunchTime','CreateTime','CreateDate','AttachTime','StartTime',
  'StatusMessage','TransitionReason','LastModifiedTime',
  'InstanceCreateTime','LatestRestorableTime','ReadyDateTime',
  'ClusterCreateTime',
  '_accountId','_accountLabel','_sourceFile','_vpcId'
]);

const _DIFF_STRUCTURAL=new Set([
  'CidrBlock','AvailabilityZone','InstanceType','Engine','EngineVersion',
  'VpcId','SubnetId','FromPort','ToPort','IpProtocol','CidrIp',
  'Port','DBInstanceClass','NodeType','Runtime','MemorySize','Timeout',
  'CacheNodeType','ClusterType','NumberOfNodes','Scheme','Type'
]);

function normalizeResource(resource){
  const clone=JSON.parse(JSON.stringify(resource));
  function walk(obj){
    if(!obj||typeof obj!=='object') return obj;
    if(Array.isArray(obj)){
      return obj.map(walk).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    const out={};
    Object.keys(obj).sort().forEach(k=>{
      if(_DIFF_VOLATILE.has(k)) return;
      out[k]=walk(obj[k]);
    });
    return out;
  }
  return walk(clone);
}

function normalizeSG(sg){
  const clone=JSON.parse(JSON.stringify(sg));
  function sortPerms(perms){
    if(!Array.isArray(perms)) return perms;
    return perms.map(p=>{
      const np={...p};
      if(np.IpRanges) np.IpRanges=[...np.IpRanges].sort((a,b)=>(a.CidrIp||'').localeCompare(b.CidrIp||''));
      if(np.Ipv6Ranges) np.Ipv6Ranges=[...np.Ipv6Ranges].sort((a,b)=>(a.CidrIpv6||'').localeCompare(b.CidrIpv6||''));
      if(np.UserIdGroupPairs) np.UserIdGroupPairs=[...np.UserIdGroupPairs].sort((a,b)=>(a.GroupId||'').localeCompare(b.GroupId||''));
      if(np.PrefixListIds) np.PrefixListIds=[...np.PrefixListIds].sort((a,b)=>(a.PrefixListId||'').localeCompare(b.PrefixListId||''));
      return np;
    }).sort((a,b)=>{
      const ak=(a.FromPort||0)+'-'+(a.ToPort||0)+'-'+(a.IpProtocol||'');
      const bk=(b.FromPort||0)+'-'+(b.ToPort||0)+'-'+(b.IpProtocol||'');
      return ak.localeCompare(bk);
    });
  }
  if(clone.IpPermissions) clone.IpPermissions=sortPerms(clone.IpPermissions);
  if(clone.IpPermissionsEgress) clone.IpPermissionsEgress=sortPerms(clone.IpPermissionsEgress);
  return normalizeResource(clone);
}

function classifyChange(field){
  if(_DIFF_STRUCTURAL.has(field)) return 'structural';
  if(field==='Tags'||field==='TagSet'||field==='Name'||field==='Description') return 'metadata';
  return 'structural'; // default to structural for unknown fields
}

function _fieldDiff(normA,normB,path){
  const changes=[];
  if(normA===normB) return changes;
  if(typeof normA!==typeof normB||normA===null||normB===null||typeof normA!=='object'){
    changes.push({field:path,old:normA,new:normB,kind:classifyChange(path.split('.').pop())});
    return changes;
  }
  if(Array.isArray(normA)&&Array.isArray(normB)){
    const sa=JSON.stringify(normA),sb=JSON.stringify(normB);
    if(sa!==sb) changes.push({field:path,old:normA,new:normB,kind:classifyChange(path.split('.').pop())});
    return changes;
  }
  const allKeys=new Set([...Object.keys(normA),...Object.keys(normB)]);
  allKeys.forEach(k=>{
    const sub=path?path+'.'+k:k;
    if(!(k in normA)){changes.push({field:sub,old:undefined,new:normB[k],kind:classifyChange(k)});return}
    if(!(k in normB)){changes.push({field:sub,old:normA[k],new:undefined,kind:classifyChange(k)});return}
    if(JSON.stringify(normA[k])!==JSON.stringify(normB[k])){
      if(typeof normA[k]==='object'&&typeof normB[k]==='object'&&normA[k]&&normB[k]){
        changes.push(..._fieldDiff(normA[k],normB[k],sub));
      } else {
        changes.push({field:sub,old:normA[k],new:normB[k],kind:classifyChange(k)});
      }
    }
  });
  return changes;
}

function computeDiff(baseline,current){
  const results={added:[],removed:[],modified:[],unchanged:[],total:{added:0,removed:0,modified:0,unchanged:0}};
  Object.entries(_DIFF_KEYS).forEach(([type,pk])=>{
    const bArr=baseline[type]||[];
    const cArr=current[type]||[];
    const bMap=new Map();
    const cMap=new Map();
    bArr.forEach(r=>{const key=r[pk];if(key) bMap.set(key,r)});
    cArr.forEach(r=>{const key=r[pk];if(key) cMap.set(key,r)});
    // Added: in current but not baseline
    cMap.forEach((res,key)=>{
      if(!bMap.has(key)){
        results.added.push({type,key,name:_diffResName(res,key),resource:res});
        results.total.added++;
      }
    });
    // Removed: in baseline but not current
    bMap.forEach((res,key)=>{
      if(!cMap.has(key)){
        results.removed.push({type,key,name:_diffResName(res,key),resource:res});
        results.total.removed++;
      }
    });
    // Modified or unchanged
    bMap.forEach((bRes,key)=>{
      if(!cMap.has(key)) return;
      const cRes=cMap.get(key);
      const normB=type==='sgs'?normalizeSG(bRes):normalizeResource(bRes);
      const normC=type==='sgs'?normalizeSG(cRes):normalizeResource(cRes);
      const sB=JSON.stringify(normB);
      const sC=JSON.stringify(normC);
      if(sB===sC){
        results.unchanged.push({type,key,name:_diffResName(cRes,key),resource:cRes});
        results.total.unchanged++;
      } else {
        const fields=_fieldDiff(normB,normC,'');
        if(fields.length===0){
          results.unchanged.push({type,key,name:_diffResName(cRes,key),resource:cRes});
          results.total.unchanged++;
        } else {
          const hasStructural=fields.some(f=>f.kind==='structural');
          results.modified.push({type,key,name:_diffResName(cRes,key),fields,hasStructural,resource:cRes,baseline:bRes});
          results.total.modified++;
        }
      }
    });
  });
  return results;
}

function _diffResName(res,fallback){
  if(!res) return fallback;
  const tags=res.Tags||res.TagSet||[];
  const nt=tags.find(t=>t.Key==='Name');
  if(nt&&nt.Value) return nt.Value;
  return res.DBInstanceIdentifier||res.FunctionName||res.serviceName||res.CacheClusterId||res.ClusterIdentifier||fallback;
}

function _diffKeyToSelector(type,key){
  // Map resource types to their SVG data attributes
  if(type==='vpcs') return '[data-vpc-id="'+key+'"]';
  if(type==='subnets') return '[data-subnet-id="'+key+'"]';
  return '[data-gwid="'+key+'"],[data-id="'+key+'"]';
}

function enterDiffMode(baselineData){
  if(!_rlCtx){_showToast('Render a map first before comparing');return}
  let baseCtx=null;
  // Parse baseline - could be an awsmap project file or raw rlCtx
  if(baselineData._format==='awsmap'&&baselineData.textareas){
    // Re-parse textarea data to build an rlCtx-like object
    baseCtx=_buildCtxFromTextareas(baselineData.textareas);
  } else if(baselineData.vpcs||baselineData.subnets){
    baseCtx=baselineData;
  } else {
    _showToast('Unable to parse baseline data');return;
  }
  _diffBaseline=baseCtx;
  _diffBaseline._srcName=baselineData._srcName||baselineData.accountLabel||'baseline';
  _diffResults=computeDiff(baseCtx,_rlCtx);
  _diffMode=true;
  _diffFilter='all';
  // Show banner
  const banner=document.getElementById('diffBanner');
  banner.style.display='flex';
  document.querySelector('.main').classList.add('diff-active');
  const srcName=baselineData.accountLabel||baselineData._srcName||'baseline';
  document.getElementById('diffLabel').textContent='COMPARING: '+srcName+' vs current';
  document.getElementById('diffAdded').textContent='+'+_diffResults.total.added+' added';
  document.getElementById('diffRemoved').textContent='-'+_diffResults.total.removed+' removed';
  document.getElementById('diffModified').textContent='~'+_diffResults.total.modified+' modified';
  document.getElementById('diffToggleFilter').textContent='Changes Only';
  _applyDiffOverlay();
  // Open the compare dashboard
  _openDiffDash();
  _showToast('Diff mode: '+(_diffResults.total.added+_diffResults.total.removed+_diffResults.total.modified)+' changes detected');
}

function exitDiffMode(){
  _diffMode=false;
  _diffBaseline=null;
  _diffResults=null;
  _diffFlatRows=null;
  _diffFilter='all';
  document.getElementById('diffBanner').style.display='none';
  document.querySelector('.main').classList.remove('diff-active');
  document.getElementById('diffSummary').classList.remove('open');
  _closeDiffDash();
  // Remove all diff overlay classes
  if(_mapG&&_mapG.node()){
    _mapG.selectAll('.diff-added,.diff-removed,.diff-modified,.diff-unchanged').each(function(){
      d3.select(this).classed('diff-added',false).classed('diff-removed',false).classed('diff-modified',false).classed('diff-unchanged',false);
    });
  }
  // Remove injected ghost elements
  if(_mapG&&_mapG.node()){
    _mapG.selectAll('.diff-ghost').remove();
  }
}

function _buildCtxFromTextareas(textareas){
  // Reconstruct a minimal rlCtx from saved textarea data
  function p(id,keys){
    const raw=textareas[id];
    if(!raw) return [];
    let parsed=typeof raw==='string'?JSON.parse(raw):raw;
    if(Array.isArray(parsed)) return parsed;
    // Try each key to unwrap (e.g. {Vpcs:[...]} → [...])
    for(const k of keys){
      if(parsed[k]){
        const val=parsed[k];
        if(Array.isArray(val)) return val;
        parsed=val;
        break;
      }
    }
    if(Array.isArray(parsed)) return parsed;
    return [];
  }
  // EC2 needs special handling: {Reservations:[{Instances:[...]}]} → flat instance array
  function pEC2(){
    const raw=textareas['in_ec2'];
    if(!raw) return [];
    let parsed=typeof raw==='string'?JSON.parse(raw):raw;
    if(Array.isArray(parsed)) return parsed;
    // Standard AWS format: {Reservations:[{Instances:[...]},...]}
    const reservations=parsed.Reservations;
    if(reservations&&Array.isArray(reservations)){
      let out=[];
      reservations.forEach(r=>{if(r.Instances)out=out.concat(r.Instances);else if(r.InstanceId)out.push(r)});
      return out;
    }
    // Fallback: {Instances:[...]}
    if(parsed.Instances&&Array.isArray(parsed.Instances)) return parsed.Instances;
    return [];
  }
  return {
    vpcs:p('in_vpcs',['Vpcs']),
    subnets:p('in_subnets',['Subnets']),
    instances:pEC2(),
    sgs:p('in_sgs',['SecurityGroups']),
    rts:p('in_rts',['RouteTables']),
    nacls:p('in_nacls',['NetworkAcls']),
    igws:p('in_igws',['InternetGateways']),
    nats:p('in_nats',['NatGateways']),
    vpces:p('in_vpces',['VpcEndpoints']),
    albs:p('in_albs',['LoadBalancers']),
    rdsInstances:p('in_rds',['DBInstances']),
    ecsServices:p('in_ecs',['services','Services']),
    lambdaFns:p('in_lambda',['Functions']).filter(f=>f.VpcConfig&&f.VpcConfig.VpcId),
    ecacheClusters:p('in_elasticache',['CacheClusters']),
    redshiftClusters:p('in_redshift',['Clusters']),
    peerings:p('in_peer',['VpcPeeringConnections'])
  };
}

function _applyDiffOverlay(){
  if(!_diffMode||!_diffResults||!_mapG||!_mapG.node()) return;
  const g=_mapG.node();
  // Clear previous diff classes
  _mapG.selectAll('.diff-added,.diff-removed,.diff-modified,.diff-unchanged,.diff-ghost').each(function(){
    d3.select(this).classed('diff-added',false).classed('diff-removed',false).classed('diff-modified',false).classed('diff-unchanged',false);
  });
  _mapG.selectAll('.diff-ghost').remove();

  // Apply added overlay
  _diffResults.added.forEach(item=>{
    const sel=_diffKeyToSelector(item.type,item.key);
    const els=g.querySelectorAll(sel);
    els.forEach(el=>d3.select(el).classed('diff-added',true));
  });
  // Apply modified overlay
  _diffResults.modified.forEach(item=>{
    const sel=_diffKeyToSelector(item.type,item.key);
    const els=g.querySelectorAll(sel);
    els.forEach(el=>d3.select(el).classed('diff-modified',true));
  });
  // Apply unchanged overlay when filter is 'changes'
  if(_diffFilter==='changes'){
    _diffResults.unchanged.forEach(item=>{
      const sel=_diffKeyToSelector(item.type,item.key);
      const els=g.querySelectorAll(sel);
      els.forEach(el=>d3.select(el).classed('diff-unchanged',true));
    });
  }
  // For removed resources, try to find them — if not rendered, add ghost markers
  _diffResults.removed.forEach(item=>{
    const sel=_diffKeyToSelector(item.type,item.key);
    const els=g.querySelectorAll(sel);
    if(els.length){
      els.forEach(el=>d3.select(el).classed('diff-removed',true));
    }
  });
}

function _diffFmtVal(v){
  if(v===undefined) return '∅';
  if(v===null) return 'null';
  if(typeof v==='boolean') return v?'true':'false';
  if(typeof v==='number') return String(v);
  if(typeof v==='string') return v.length>40?v.slice(0,37)+'...':v;
  if(Array.isArray(v)){
    if(!v.length) return '[]';
    var s=JSON.stringify(v);
    return s.length>50?'['+v.length+' items]':s;
  }
  var s=JSON.stringify(v);
  return s.length>50?'{...}':s;
}

function _diffFmtValFull(v){
  if(v===undefined) return '∅';
  if(v===null) return 'null';
  if(typeof v==='boolean') return v?'true':'false';
  if(typeof v==='number') return String(v);
  if(typeof v==='string') return v;
  if(Array.isArray(v)) return JSON.stringify(v,null,1);
  return JSON.stringify(v,null,1);
}

// Type-aware property renderer for diff detail panel
// All values are escaped via esc() before insertion — safe for display
function _diffPropsHtml(type,res){
  if(!res) return '';
  var h='';
  function kv(label,val){
    if(val===undefined||val===null||val==='') return;
    h+='<div class="dp-kv"><span class="k">'+esc(label)+'</span><span class="v">'+esc(String(val))+'</span></div>';
  }
  function tags(r){
    var t=r.Tags||r.TagSet||[];
    if(!t.length) return;
    var th=t.map(function(tg){return '<span style="background:rgba(255,255,255,.05);padding:1px 5px;border-radius:2px;margin:1px">'+esc(tg.Key)+'='+esc(tg.Value)+'</span>'}).join(' ');
    h+='<div style="margin-top:4px;font-size:calc(9px * var(--txt-scale,1) * var(--dp-txt-scale,1));color:var(--text-muted)">Tags: '+th+'</div>';
  }
  switch(type){
    case 'vpcs':
      kv('VPC ID',res.VpcId);kv('CIDR Block',res.CidrBlock);
      kv('State',res.State);kv('Is Default',res.IsDefault);
      kv('Tenancy',res.InstanceTenancy);
      kv('DHCP Options',res.DhcpOptionsId);
      if(res.CidrBlockAssociationSet){
        var cidrs=res.CidrBlockAssociationSet.map(function(c){return c.CidrBlock}).join(', ');
        kv('All CIDRs',cidrs);
      }
      tags(res);break;
    case 'subnets':
      kv('Subnet ID',res.SubnetId);kv('CIDR Block',res.CidrBlock);
      kv('VPC',res.VpcId);kv('Availability Zone',res.AvailabilityZone);
      kv('Available IPs',res.AvailableIpAddressCount);
      kv('Auto-assign Public IP',res.MapPublicIpOnLaunch);
      kv('Default For AZ',res.DefaultForAz);
      tags(res);break;
    case 'instances':
      kv('Instance ID',res.InstanceId);kv('Type',res.InstanceType);
      kv('State',res.State?res.State.Name:'?');
      kv('Private IP',res.PrivateIpAddress);kv('Public IP',res.PublicIpAddress);
      kv('AZ',res.Placement?res.Placement.AvailabilityZone:'');
      kv('AMI',res.ImageId);kv('Key Name',res.KeyName);
      kv('Subnet',res.SubnetId);kv('VPC',res.VpcId);
      if(res.IamInstanceProfile) kv('IAM Role',res.IamInstanceProfile.Arn||res.IamInstanceProfile.Id);
      var sgs=(res.SecurityGroups||[]).map(function(s){return s.GroupName||s.GroupId}).join(', ');
      if(sgs) kv('Security Groups',sgs);
      tags(res);break;
    case 'sgs':
      kv('Group ID',res.GroupId);kv('Group Name',res.GroupName);
      kv('Description',res.Description);kv('VPC',res.VpcId);
      kv('Inbound Rules',(res.IpPermissions||[]).length);
      kv('Outbound Rules',(res.IpPermissionsEgress||[]).length);
      if(res.IpPermissions&&res.IpPermissions.length){
        h+='<div style="margin-top:6px;font-size:calc(9px * var(--txt-scale,1) * var(--dp-txt-scale,1));font-weight:600;color:var(--accent-cyan);text-transform:uppercase;letter-spacing:.5px">Inbound Rules</div>';
        res.IpPermissions.forEach(function(p){
          var proto=p.IpProtocol==='-1'?'All':p.IpProtocol;
          var port=p.FromPort===p.ToPort?(p.FromPort||'All'):((p.FromPort||0)+'-'+(p.ToPort||0));
          var src=(p.IpRanges||[]).map(function(r){return r.CidrIp}).concat((p.UserIdGroupPairs||[]).map(function(g){return g.GroupId})).join(', ')||'N/A';
          h+='<div class="dp-row" style="border-left:3px solid var(--accent-green);padding-left:8px;margin:2px 0;font-size:calc(9px * var(--txt-scale,1) * var(--dp-txt-scale,1))"><span class="a">'+esc(proto)+':'+esc(String(port))+'</span> ← '+esc(src)+'</div>';
        });
      }
      tags(res);break;
    case 'rts':
      kv('Route Table ID',res.RouteTableId);kv('VPC',res.VpcId);
      kv('Routes',(res.Routes||[]).length);
      kv('Associations',(res.Associations||[]).length);
      if(res.Routes&&res.Routes.length){
        h+='<div style="margin-top:6px;font-size:calc(9px * var(--txt-scale,1) * var(--dp-txt-scale,1));font-weight:600;color:var(--accent-cyan);text-transform:uppercase;letter-spacing:.5px">Routes</div>';
        res.Routes.forEach(function(r){
          var dest=r.DestinationCidrBlock||r.DestinationPrefixListId||'?';
          var tgt=r.GatewayId||r.NatGatewayId||r.VpcPeeringConnectionId||r.NetworkInterfaceId||r.TransitGatewayId||'local';
          h+='<div class="dp-row" style="border-left:3px solid var(--accent-blue);padding-left:8px;margin:2px 0;font-size:calc(9px * var(--txt-scale,1) * var(--dp-txt-scale,1))">'+esc(dest)+' → '+esc(tgt)+' <span class="k">'+esc(r.State||'')+'</span></div>';
        });
      }
      tags(res);break;
    case 'nacls':
      kv('NACL ID',res.NetworkAclId);kv('VPC',res.VpcId);
      kv('Is Default',res.IsDefault);
      var inbound=(res.Entries||[]).filter(function(e){return !e.Egress});
      var outbound=(res.Entries||[]).filter(function(e){return e.Egress});
      kv('Inbound Entries',inbound.length);kv('Outbound Entries',outbound.length);
      tags(res);break;
    case 'igws':
      kv('IGW ID',res.InternetGatewayId);
      var att=(res.Attachments||[])[0];
      if(att){kv('VPC',att.VpcId);kv('State',att.State);}
      tags(res);break;
    case 'nats':
      kv('NAT Gateway ID',res.NatGatewayId);kv('VPC',res.VpcId);
      kv('Subnet',res.SubnetId);kv('State',res.State);
      kv('Connectivity',res.ConnectivityType);
      var eips=(res.NatGatewayAddresses||[]).map(function(a){return a.PublicIp}).filter(Boolean).join(', ');
      if(eips) kv('Elastic IPs',eips);
      tags(res);break;
    case 'vpces':
      kv('Endpoint ID',res.VpcEndpointId);kv('VPC',res.VpcId);
      kv('Service',res.ServiceName);kv('Type',res.VpcEndpointType);
      kv('State',res.State);
      tags(res);break;
    case 'albs':
      kv('Name',res.LoadBalancerName);kv('Type',res.Type);
      kv('Scheme',res.Scheme);kv('DNS',res.DNSName);
      kv('State',res.State?res.State.Code:'');
      kv('VPC',res.VpcId);
      var azs=(res.AvailabilityZones||[]).map(function(a){return a.ZoneName}).join(', ');
      if(azs) kv('AZs',azs);
      tags(res);break;
    case 'rdsInstances':
      kv('DB Instance',res.DBInstanceIdentifier);kv('Engine',res.Engine+' '+(res.EngineVersion||''));
      kv('Class',res.DBInstanceClass);kv('Storage',res.AllocatedStorage+'GB '+(res.StorageType||''));
      kv('Multi-AZ',res.MultiAZ);kv('Status',res.DBInstanceStatus);
      kv('AZ',res.AvailabilityZone);
      if(res.Endpoint) kv('Endpoint',res.Endpoint.Address+':'+(res.Endpoint.Port||''));
      kv('VPC',res.DBSubnetGroup?res.DBSubnetGroup.VpcId:'');
      tags(res);break;
    case 'lambdaFns':
      kv('Function',res.FunctionName);kv('Runtime',res.Runtime);
      kv('Memory',res.MemorySize+'MB');kv('Timeout',res.Timeout+'s');
      kv('Handler',res.Handler);kv('Code Size',Math.round((res.CodeSize||0)/1024)+'KB');
      kv('Last Modified',res.LastModified);
      if(res.VpcConfig&&res.VpcConfig.VpcId) kv('VPC',res.VpcConfig.VpcId);
      tags(res);break;
    case 'ecsServices':
      kv('Service',res.serviceName);kv('Launch Type',res.launchType);
      kv('Desired',res.desiredCount);kv('Running',res.runningCount);
      kv('Task Definition',res.taskDefinition);kv('Status',res.status);
      tags(res);break;
    case 'ecacheClusters':
      kv('Cluster ID',res.CacheClusterId);kv('Engine',res.Engine+' '+(res.EngineVersion||''));
      kv('Node Type',res.CacheNodeType);kv('Nodes',res.NumCacheNodes);
      kv('Status',res.CacheClusterStatus);
      kv('AZ',res.PreferredAvailabilityZone);
      tags(res);break;
    case 'redshiftClusters':
      kv('Cluster',res.ClusterIdentifier);kv('Node Type',res.NodeType);
      kv('Nodes',res.NumberOfNodes);kv('Status',res.ClusterStatus);
      kv('DB Name',res.DBName);kv('VPC',res.VpcId);
      if(res.Endpoint) kv('Endpoint',res.Endpoint.Address+':'+(res.Endpoint.Port||''));
      tags(res);break;
    case 'peerings':
      kv('Peering ID',res.VpcPeeringConnectionId);
      kv('Status',res.Status?res.Status.Code:'');
      if(res.RequesterVpcInfo) kv('Requester VPC',res.RequesterVpcInfo.VpcId+' ('+res.RequesterVpcInfo.CidrBlock+')');
      if(res.AccepterVpcInfo) kv('Accepter VPC',res.AccepterVpcInfo.VpcId+' ('+res.AccepterVpcInfo.CidrBlock+')');
      tags(res);break;
  }
  return h;
}

function _diffTypeLabel(type){
  var labels={vpcs:'VPC',subnets:'Subnet',instances:'EC2 Instance',sgs:'Security Group',
    rts:'Route Table',nacls:'NACL',igws:'Internet Gateway',nats:'NAT Gateway',
    vpces:'VPC Endpoint',albs:'Load Balancer',rdsInstances:'RDS Instance',
    lambdaFns:'Lambda Function',ecsServices:'ECS Service',ecacheClusters:'ElastiCache Cluster',
    redshiftClusters:'Redshift Cluster',peerings:'VPC Peering'};
  return labels[type]||type;
}

// Opens the detail panel with full diff information for a resource
// All content is escaped before insertion for safe display
function _openDiffDetail(item,category){
  var dp=document.getElementById('detailPanel');
  var dpTitle=document.getElementById('dpTitle');
  var dpSub=document.getElementById('dpSub');
  var dpBody=document.getElementById('dpBody');
  var badgeCls=category;
  var badgeText=category.toUpperCase();
  var res=item.resource||item.baseline||null;
  var typeLabel=_diffTypeLabel(item.type);
  dpTitle.textContent='';
  dpTitle.appendChild(document.createTextNode(item.name+' '));
  var badge=document.createElement('span');badge.className='dp-diff-badge '+badgeCls;badge.textContent=badgeText;
  dpTitle.appendChild(badge);
  dpSub.textContent='';
  var copySpan=document.createElement('span');copySpan.className='copyable';copySpan.dataset.copy=item.key;copySpan.textContent=item.key;
  dpSub.appendChild(copySpan);dpSub.appendChild(document.createTextNode(' | '+typeLabel));
  var h='';
  function sec(title,count,bodyHtml,startOpen){
    return '<div class="dp-section"><div class="dp-sec-hdr'+(startOpen?'':' collapsed')+'" onclick="this.classList.toggle(\'collapsed\');this.nextElementSibling.classList.toggle(\'hidden\')"><span class="dp-sec-title">'+esc(title)+'</span><span><span class="dp-sec-count">'+esc(count)+'</span><span class="dp-sec-arr">&#9660;</span></span></div><div class="dp-sec-body'+(startOpen?'':' hidden')+'">'+bodyHtml+'</div></div>';
  }
  // CHANGES section (modified only)
  if(category==='modified'&&item.fields&&item.fields.length){
    var cb='';
    item.fields.forEach(function(f){
      cb+='<div class="dp-diff-change">';
      cb+='<span class="dc-field">'+_escHtml(f.field)+'</span>';
      cb+='<span class="dc-kind '+f.kind+'">'+f.kind+'</span>';
      cb+='<div class="dc-vals">';
      if(typeof f.old==='undefined'){
        cb+='<span class="dc-new">+ '+_escHtml(_diffFmtValFull(f.new))+'</span>';
      } else if(typeof f.new==='undefined'){
        cb+='<span class="dc-old">- '+_escHtml(_diffFmtValFull(f.old))+'</span>';
      } else {
        cb+='<span class="dc-old">'+_escHtml(_diffFmtValFull(f.old))+'</span>';
        cb+='<span class="dc-arrow">→</span>';
        cb+='<span class="dc-new">'+_escHtml(_diffFmtValFull(f.new))+'</span>';
      }
      cb+='</div></div>';
    });
    var structCount=item.fields.filter(function(f){return f.kind==='structural'}).length;
    var metaCount=item.fields.length-structCount;
    var countLabel=item.fields.length+' change'+(item.fields.length>1?'s':'')+' ('+structCount+' structural, '+metaCount+' metadata)';
    h+=sec('Changes',countLabel,cb,true);
  }
  // PROPERTIES section
  if(res){
    var propsHtml=_diffPropsHtml(item.type,res);
    if(propsHtml){
      var propLabel=category==='removed'?'Properties (baseline)':'Properties (current)';
      h+=sec(propLabel,'',propsHtml,category!=='modified');
    }
  }
  // BASELINE PROPERTIES (modified only — show old state)
  if(category==='modified'&&item.baseline){
    var baseProps=_diffPropsHtml(item.type,item.baseline);
    if(baseProps) h+=sec('Baseline Properties','',baseProps,false);
  }
  // RAW JSON section
  if(res){
    var jsonHtml='';
    if(category==='modified'&&item.baseline){
      jsonHtml='<div style="font-size:calc(8px * var(--txt-scale,1) * var(--dp-txt-scale,1));font-weight:600;color:#ef4444;margin-bottom:2px">BASELINE</div>';
      jsonHtml+='<div class="dp-diff-json" style="max-height:200px;margin-bottom:8px">'+_escHtml(JSON.stringify(item.baseline,null,2))+'</div>';
      jsonHtml+='<div style="font-size:calc(8px * var(--txt-scale,1) * var(--dp-txt-scale,1));font-weight:600;color:#10b981;margin-bottom:2px">CURRENT</div>';
      jsonHtml+='<div class="dp-diff-json" style="max-height:200px">'+_escHtml(JSON.stringify(item.resource,null,2))+'</div>';
    } else {
      jsonHtml='<div class="dp-diff-json">'+_escHtml(JSON.stringify(res,null,2))+'</div>';
    }
    h+=sec('Raw JSON','',jsonHtml,false);
  }
  dpBody.textContent='';
  dpBody.insertAdjacentHTML('beforeend',h);
  dp.classList.add('open');
  if(typeof applyDpScale==='function') applyDpScale();
  // Copyable elements
  dpBody.querySelectorAll('.copyable').forEach(function(el){
    el.addEventListener('click',function(e){
      e.stopPropagation();navigator.clipboard.writeText(this.dataset.copy);
      var t=document.querySelector('.copy-toast');
      if(t){t.textContent='Copied!';t.classList.add('show');setTimeout(function(){t.classList.remove('show')},1200)}
    });
  });
}

function _renderDiffSummary(){
  // Legacy summary panel — no longer used, dashboard replaces it
  if(!_diffResults) return;
}

function _toggleDiffFilter(){
  if(!_diffMode) return;
  _diffFilter=_diffFilter==='all'?'changes':'all';
  const btn=document.getElementById('diffToggleFilter');
  btn.textContent=_diffFilter==='changes'?'Show All':'Changes Only';
  _applyDiffOverlay();
}

function _exportDiffReport(){
  if(!_diffResults) return;
  const report={
    generated:new Date().toISOString(),
    summary:{added:_diffResults.total.added,removed:_diffResults.total.removed,modified:_diffResults.total.modified,unchanged:_diffResults.total.unchanged},
    added:_diffResults.added.map(i=>({type:i.type,key:i.key,name:i.name})),
    removed:_diffResults.removed.map(i=>({type:i.type,key:i.key,name:i.name})),
    modified:_diffResults.modified.map(i=>({type:i.type,key:i.key,name:i.name,hasStructural:i.hasStructural,fields:i.fields.map(f=>({field:f.field,kind:f.kind}))}))
  };
  const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
  downloadBlob(blob,'diff-report-'+new Date().toISOString().slice(0,10)+'.json');
  _showToast('Diff report exported');
}

// === COMPARE DASHBOARD ===

function _diffResVpc(item){
  var res=item.resource||item.baseline;
  if(!res) return {id:'',name:''};
  var vid=res.VpcId||'';
  if(!vid&&item.type==='vpcs') vid=res.VpcId||item.key||'';
  if(!vid) return {id:'',name:''};
  var vn=vid;
  if(_rlCtx&&_rlCtx.vpcs){
    var vpc=_rlCtx.vpcs.find(function(v){return v.VpcId===vid});
    if(vpc){
      var tags=vpc.Tags||[];
      var nt=tags.find(function(t){return t.Key==='Name'});
      if(nt&&nt.Value) vn=nt.Value;
    }
  }
  return {id:vid,name:vn};
}

function _buildDiffFlatRows(){
  if(!_diffResults) return [];
  var rows=[];
  _diffResults.added.forEach(function(item){
    var vpc=_diffResVpc(item);
    rows.push({category:'added',type:item.type,key:item.key,name:item.name,vpcId:vpc.id,vpcName:vpc.name,fields:[],hasStructural:false,resource:item.resource,baseline:null});
  });
  _diffResults.removed.forEach(function(item){
    var vpc=_diffResVpc(item);
    rows.push({category:'removed',type:item.type,key:item.key,name:item.name,vpcId:vpc.id,vpcName:vpc.name,fields:[],hasStructural:false,resource:null,baseline:item.resource});
  });
  _diffResults.modified.forEach(function(item){
    var vpc=_diffResVpc(item);
    rows.push({category:'modified',type:item.type,key:item.key,name:item.name,vpcId:vpc.id,vpcName:vpc.name,fields:item.fields||[],hasStructural:item.hasStructural,resource:item.resource,baseline:item.baseline});
  });
  _diffResults.unchanged.forEach(function(item){
    var vpc=_diffResVpc(item);
    rows.push({category:'unchanged',type:item.type,key:item.key,name:item.name,vpcId:vpc.id,vpcName:vpc.name,fields:[],hasStructural:false,resource:null,baseline:null});
  });
  return rows;
}

function _openDiffDash(){
  if(!_diffResults) return;
  _diffFlatRows=_buildDiffFlatRows();
  _diffDashState={catFilter:'all',typeFilter:'all',vpcFilter:'all',kindFilter:'all',search:'',sort:'status',sortDir:'asc',page:1,perPage:50};
  // Populate type filter
  var typeSet=new Set();
  _diffFlatRows.forEach(function(r){typeSet.add(r.type)});
  var typeSel=document.getElementById('diffTypeFilter');
  typeSel.innerHTML='<option value="all">All Types</option>';
  Array.from(typeSet).sort().forEach(function(t){
    var opt=document.createElement('option');opt.value=t;opt.textContent=_diffTypeLabel(t);
    typeSel.appendChild(opt);
  });
  // Populate VPC filter
  var vpcMap={};
  _diffFlatRows.forEach(function(r){if(r.vpcId)vpcMap[r.vpcId]=r.vpcName});
  var vpcSel=document.getElementById('diffVpcFilter');
  vpcSel.innerHTML='<option value="all">All VPCs</option>';
  Object.keys(vpcMap).sort().forEach(function(vid){
    var opt=document.createElement('option');opt.value=vid;opt.textContent=vpcMap[vid];
    vpcSel.appendChild(opt);
  });
  // Populate snapshot picker
  _populateDiffSnapPicker();
  // Reset controls
  document.getElementById('diffDashSearch').value='';
  document.getElementById('diffKindFilter').value='all';
  document.getElementById('diffPerPage').value='50';
  // Source label
  var srcName=_diffBaseline?(_diffBaseline._srcName||_diffBaseline.accountLabel||'baseline'):'baseline';
  document.getElementById('diffDashLabel').textContent=srcName+' vs current';
  // Open
  _closeAllDashboards('diffDash');
  document.getElementById('diffDash').classList.add('open');
  _renderDiffDash();
}

function _closeDiffDash(){
  document.getElementById('diffDash').classList.remove('open');
}

function _populateDiffSnapPicker(){
  var sel=document.getElementById('diffSnapPicker');
  sel.innerHTML='<option value="">— pick snapshot —</option>';
  _snapshots.forEach(function(snap,i){
    var opt=document.createElement('option');
    opt.value=i;
    var d=new Date(snap.timestamp);
    opt.textContent=(snap.label||snap.accountLabel||'Snap '+(i+1))+' — '+d.toLocaleDateString()+' '+d.toLocaleTimeString();
    sel.appendChild(opt);
  });
}

var _CAT_ORDER={added:0,removed:1,modified:2,unchanged:3};

function _renderDiffDash(){
  if(!_diffFlatRows) return;
  var db=document.getElementById('diffDashBody');if(db)db.scrollTop=0;
  var st=_diffDashState;
  // --- Pills ---
  var counts={all:_diffFlatRows.length,added:0,removed:0,modified:0,unchanged:0};
  _diffFlatRows.forEach(function(r){counts[r.category]++});
  var pillBox=document.getElementById('diffDashPills');
  pillBox.innerHTML='';
  [{cat:'all',label:'All'},{cat:'added',label:'Added'},{cat:'removed',label:'Removed'},{cat:'modified',label:'Modified'},{cat:'unchanged',label:'Unchanged'}].forEach(function(p){
    var pill=document.createElement('span');
    pill.className='diff-cat-pill'+(st.catFilter===p.cat?' active':'');
    pill.dataset.cat=p.cat;
    pill.textContent=p.label+' ('+counts[p.cat]+')';
    pill.addEventListener('click',function(){st.catFilter=p.cat;st.page=1;_renderDiffDash()});
    pillBox.appendChild(pill);
  });
  // --- Filter + Sort (shared with _getDiffFilteredRows) ---
  var filtered=_getDiffFilteredRows();
  // --- Row count ---
  document.getElementById('diffDashRowCount').textContent=filtered.length+' of '+_diffFlatRows.length;
  // --- Paginate ---
  var perPage=st.perPage<=0?filtered.length:st.perPage;
  var totalPages=Math.max(1,Math.ceil(filtered.length/perPage));
  st.page=Math.min(st.page,totalPages);
  var start=(st.page-1)*perPage;
  var pageRows=filtered.slice(start,start+perPage);
  // --- Pagination controls ---
  document.getElementById('diffPageInfo').textContent='Page '+st.page+' of '+totalPages+' ('+filtered.length+' rows)';
  document.getElementById('diffPagePrev').disabled=(st.page<=1);
  document.getElementById('diffPageNext').disabled=(st.page>=totalPages);
  // --- Footer meta ---
  document.getElementById('diffDashMeta').textContent='+'+counts.added+' added  -'+counts.removed+' removed  ~'+counts.modified+' modified  ='+counts.unchanged+' unchanged';
  // --- Build table ---
  var body=document.getElementById('diffDashBody');
  var cols=[{key:'status',label:'Status'},{key:'type',label:'Type'},{key:'name',label:'Name'},{key:'key',label:'Key'},{key:'vpc',label:'VPC'},{key:'changes',label:'Changes'},{key:'actions',label:'Actions',nosort:true}];
  var h='<table class="diff-dash-table"><thead><tr>';
  cols.forEach(function(c){
    var cls='';
    if(!c.nosort&&st.sort===c.key) cls=st.sortDir==='asc'?' dd-sort-asc':' dd-sort-desc';
    h+='<th'+(c.nosort?'':' data-sort-col="'+c.key+'"')+' class="'+cls+'">'+c.label+'</th>';
  });
  h+='</tr></thead><tbody>';
  if(!pageRows.length){
    h+='<tr><td colspan="7" class="dd-no-results">No resources match current filters</td></tr>';
  } else {
    pageRows.forEach(function(row,idx){
      var globalIdx=start+idx;
      var isModified=row.category==='modified'&&row.fields.length>0;
      h+='<tr data-dd-idx="'+globalIdx+'" data-dd-key="'+esc(row.key)+'" data-dd-cat="'+row.category+'">';
      // Status
      h+='<td>';
      if(isModified) h+='<span class="dd-expand-toggle" data-dd-toggle="'+globalIdx+'">▶</span>';
      h+='<span class="dd-status-badge '+row.category+'">'+row.category+'</span></td>';
      // Type
      h+='<td class="dd-type-label">'+esc(_diffTypeLabel(row.type))+'</td>';
      // Name
      h+='<td class="dd-name">'+esc(row.name)+'</td>';
      // Key
      h+='<td class="dd-key">'+esc(row.key)+'</td>';
      // VPC
      h+='<td class="dd-key">'+esc(row.vpcName||'—')+'</td>';
      // Changes
      if(isModified){
        var sc=row.fields.filter(function(f){return f.kind==='structural'}).length;
        var mc=row.fields.length-sc;
        var parts=[];
        if(sc) parts.push('<span class="dd-changes-structural">'+sc+' structural</span>');
        if(mc) parts.push('<span class="dd-changes-meta">'+mc+' metadata</span>');
        h+='<td class="dd-changes">'+parts.join(', ')+'</td>';
      } else {
        h+='<td class="dd-changes" style="color:var(--text-muted)">—</td>';
      }
      // Actions
      h+='<td class="dd-actions">';
      if(row.category!=='unchanged') h+='<button class="dd-jump-btn" data-dd-jump="'+esc(row.key)+'">Jump</button>';
      if(row.category!=='unchanged') h+='<button class="dd-detail-btn" data-dd-detail="'+globalIdx+'">Detail</button>';
      h+='</td></tr>';
      // Expandable row for field diffs
      if(isModified){
        h+='<tr class="dd-expand-row" data-dd-expand="'+globalIdx+'"><td colspan="7" class="dd-expand-cell">';
        row.fields.forEach(function(f){
          var oldVal=_diffFmtVal(f.old);
          var newVal=_diffFmtVal(f.new);
          h+='<div class="diff-field-row '+f.kind+'">';
          h+='<span class="diff-field-name">'+_escHtml(f.field)+'</span>';
          if(typeof f.old==='undefined'){
            h+='<span class="diff-field-added">+ '+_escHtml(newVal)+'</span>';
          } else if(typeof f.new==='undefined'){
            h+='<span class="diff-field-removed">- '+_escHtml(oldVal)+'</span>';
          } else {
            h+='<span class="diff-field-old">'+_escHtml(oldVal)+'</span>';
            h+='<span class="diff-field-arrow">→</span>';
            h+='<span class="diff-field-new">'+_escHtml(newVal)+'</span>';
          }
          h+='</div>';
        });
        h+='</td></tr>';
      }
    });
  }
  h+='</tbody></table>';
  body.innerHTML=h;
  // --- Wire handlers ---
  // Sort headers
  body.querySelectorAll('th[data-sort-col]').forEach(function(th){
    th.addEventListener('click',function(){
      var col=this.dataset.sortCol;
      if(st.sort===col){
        st.sortDir=st.sortDir==='asc'?'desc':'asc';
      } else {
        st.sort=col;st.sortDir='asc';
      }
      st.page=1;
      _renderDiffDash();
    });
  });
  // Expand toggles
  body.querySelectorAll('.dd-expand-toggle').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      var idx=this.dataset.ddToggle;
      var expRow=body.querySelector('tr[data-dd-expand="'+idx+'"]');
      var parentRow=this.closest('tr');
      if(expRow){
        expRow.classList.toggle('open');
        this.classList.toggle('open');
        if(parentRow) parentRow.classList.toggle('dd-expanded');
      }
    });
  });
  // Jump buttons
  body.querySelectorAll('.dd-jump-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      var key=this.dataset.ddJump;
      if(!key) return;
      document.getElementById('diffDash').classList.remove('open');
      setTimeout(function(){_zoomToElement(key)},250);
    });
  });
  // Detail buttons
  body.querySelectorAll('.dd-detail-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      var idx=parseInt(this.dataset.ddDetail);
      var allFiltered=_getDiffFilteredRows();
      var row=allFiltered[idx];
      if(!row) return;
      // Build item compatible with _openDiffDetail
      var item={type:row.type,key:row.key,name:row.name,fields:row.fields,hasStructural:row.hasStructural,resource:row.resource,baseline:row.baseline};
      document.getElementById('diffDash').classList.remove('open');
      _openDiffDetail(item,row.category);
      setTimeout(function(){_zoomToElement(row.key)},250);
    });
  });
  // Row click → expand (for modified rows)
  body.querySelectorAll('tbody tr[data-dd-idx]').forEach(function(tr){
    tr.addEventListener('click',function(){
      var toggle=this.querySelector('.dd-expand-toggle');
      if(toggle) toggle.click();
    });
  });
}

function _getDiffFilteredRows(){
  if(!_diffFlatRows) return [];
  var st=_diffDashState;
  var filtered=_diffFlatRows.slice();
  if(st.catFilter!=='all') filtered=filtered.filter(function(r){return r.category===st.catFilter});
  if(st.typeFilter!=='all') filtered=filtered.filter(function(r){return r.type===st.typeFilter});
  if(st.vpcFilter!=='all') filtered=filtered.filter(function(r){return r.vpcId===st.vpcFilter});
  if(st.kindFilter!=='all'){
    filtered=filtered.filter(function(r){
      if(r.category!=='modified') return false;
      if(st.kindFilter==='structural') return r.fields.some(function(f){return f.kind==='structural'});
      if(st.kindFilter==='metadata') return r.fields.some(function(f){return f.kind==='metadata'});
      return true;
    });
  }
  if(st.search){
    var q=st.search.toLowerCase();
    filtered=filtered.filter(function(r){
      return r.name.toLowerCase().indexOf(q)!==-1||r.key.toLowerCase().indexOf(q)!==-1||r.type.toLowerCase().indexOf(q)!==-1||_diffTypeLabel(r.type).toLowerCase().indexOf(q)!==-1||r.vpcName.toLowerCase().indexOf(q)!==-1||r.fields.some(function(f){return f.field.toLowerCase().indexOf(q)!==-1});
    });
  }
  if(st.sort!=='none'){
    filtered.sort(function(a,b){
      var cmp=0;
      if(st.sort==='status') cmp=(_CAT_ORDER[a.category]||9)-(_CAT_ORDER[b.category]||9);
      else if(st.sort==='type') cmp=_diffTypeLabel(a.type).localeCompare(_diffTypeLabel(b.type));
      else if(st.sort==='name') cmp=(a.name||'').localeCompare(b.name||'');
      else if(st.sort==='key') cmp=(a.key||'').localeCompare(b.key||'');
      else if(st.sort==='vpc') cmp=(a.vpcName||'').localeCompare(b.vpcName||'');
      else if(st.sort==='changes') cmp=(a.fields.length||0)-(b.fields.length||0);
      return st.sortDir==='desc'?-cmp:cmp;
    });
  }
  return filtered;
}

async function _exportDiffXlsx(){
  if(!_diffResults) return;
  try{
    var XLSX=await _loadSheetJS();
    var wb=XLSX.utils.book_new();
    // Summary sheet
    var summaryData=[
      ['Compare Report','','',''],
      ['Generated',new Date().toISOString(),'',''],
      ['','','',''],
      ['Category','Count','',''],
      ['Added',_diffResults.total.added,'',''],
      ['Removed',_diffResults.total.removed,'',''],
      ['Modified',_diffResults.total.modified,'',''],
      ['Unchanged',_diffResults.total.unchanged,'',''],
      ['Total',_diffFlatRows?_diffFlatRows.length:0,'','']
    ];
    var ws1=XLSX.utils.aoa_to_sheet(summaryData);
    ws1['!cols']=[{wch:14},{wch:30},{wch:12},{wch:12}];
    // Style header
    if(ws1['A1']) ws1['A1'].s=_xlsxHeaderStyle();
    if(ws1['A4']) ws1['A4'].s=_xlsxHeaderStyle();
    if(ws1['B4']) ws1['B4'].s=_xlsxHeaderStyle();
    XLSX.utils.book_append_sheet(wb,ws1,'Summary');
    // Details sheet — all resources
    var detailRows=[['Status','Type','Name','Key','VPC','Changes','Fields Changed']];
    var rows=_diffFlatRows||_buildDiffFlatRows();
    rows.forEach(function(r){
      var fieldStr='';
      if(r.fields.length){
        fieldStr=r.fields.map(function(f){
          var parts=[f.field+' ('+f.kind+')'];
          if(typeof f.old!=='undefined') parts.push('old: '+_diffFmtVal(f.old));
          if(typeof f.new!=='undefined') parts.push('new: '+_diffFmtVal(f.new));
          return parts.join(' ');
        }).join('\n');
      }
      detailRows.push([r.category.toUpperCase(),_diffTypeLabel(r.type),r.name,r.key,r.vpcName||'',r.fields.length||'',fieldStr]);
    });
    var ws2=XLSX.utils.aoa_to_sheet(detailRows);
    ws2['!cols']=[{wch:12},{wch:18},{wch:28},{wch:28},{wch:20},{wch:10},{wch:60}];
    // Style header row
    var headerCols='ABCDEFG';
    for(var i=0;i<headerCols.length;i++){
      var addr=headerCols[i]+'1';
      if(ws2[addr]) ws2[addr].s=_xlsxHeaderStyle();
    }
    // Color status cells
    var statusColors={ADDED:{fg:'065F46',bg:'D1FAE5'},REMOVED:{fg:'991B1B',bg:'FEE2E2'},MODIFIED:{fg:'92400E',bg:'FEF3C7'},UNCHANGED:{fg:'6B7280',bg:'F3F4F6'}};
    for(var ri=1;ri<detailRows.length;ri++){
      var cellAddr='A'+(ri+1);
      var val=detailRows[ri][0];
      var sc=statusColors[val];
      if(ws2[cellAddr]&&sc){
        ws2[cellAddr].s={font:{bold:true,color:{rgb:sc.fg},name:'Calibri',sz:10},fill:{fgColor:{rgb:sc.bg}},alignment:{horizontal:'center'},border:_xlsxBorder()};
      }
    }
    XLSX.utils.book_append_sheet(wb,ws2,'All Resources');
    // Write
    XLSX.writeFile(wb,'compare-report-'+new Date().toISOString().slice(0,10)+'.xlsx');
    _showToast('XLSX report exported');
  }catch(e){
    _showToast('XLSX export failed: '+e.message,'error');
  }
}

// Compare button click -> open file picker
document.getElementById('compareBtn').addEventListener('click',function(){
  if(_diffMode){
    // Toggle dashboard; hold Shift to exit diff mode entirely
    var dash=document.getElementById('diffDash');
    if(dash.classList.contains('open')) dash.classList.remove('open');
    else _openDiffDash();
    return;
  }
  document.getElementById('diffFileInput').click();
});

// File picker -> parse and enter diff mode (supports single .awsmap or multiple .json)
document.getElementById('diffFileInput').addEventListener('change',async function(){
  var files=[].slice.call(this.files);
  if(!files.length) return;
  this.value='';
  // Single .awsmap file — use directly
  if(files.length===1&&/\.awsmap$/i.test(files[0].name)){
    try{
      var text=await files[0].text();
      var data=JSON.parse(text);
      data._srcName=files[0].name.replace(/\.[^.]+$/,'');
      enterDiffMode(data);
    }catch(ex){_showToast('Failed to parse file: '+ex.message)}
    return;
  }
  // Single JSON that looks like it has multiple keys (pre-bundled export)
  if(files.length===1&&/\.json$/i.test(files[0].name)){
    try{
      var text=await files[0].text();
      var data=JSON.parse(text);
      // Check if it's already a full context (has vpcs/subnets keys)
      if(data.vpcs||data.subnets||data.textareas||data._format==='awsmap'){
        data._srcName=files[0].name.replace(/\.[^.]+$/,'');
        enterDiffMode(data);
        return;
      }
    }catch(ex){/* fall through to multi-file handling */}
  }
  // Multiple JSON files — match each to a textarea slot and build diff context
  var textareas={};
  var matched=0,skipped=[];
  for(var i=0;i<files.length;i++){
    try{
      var text=await files[i].text();
      JSON.parse(text); // validate
      var inputId=matchFile(files[i].name,text);
      if(!inputId){skipped.push(files[i].name);continue}
      textareas[inputId]=text;
      matched++;
    }catch(ex){skipped.push(files[i].name+' (invalid JSON)');continue}
  }
  if(!matched){_showToast('No recognized AWS JSON files found');return}
  if(skipped.length) _showToast(matched+' files matched, '+skipped.length+' skipped','info');
  var label=matched+' JSON files';
  if(files.length<=3) label=files.map(function(f){return f.name.replace(/\.json$/i,'')}).join(', ');
  enterDiffMode({_format:'awsmap',textareas:textareas,_srcName:label});
});

// Banner button listeners
document.getElementById('diffExitBtn').addEventListener('click',exitDiffMode);
document.getElementById('diffToggleFilter').addEventListener('click',_toggleDiffFilter);
document.getElementById('diffExportBtn').addEventListener('click',_exportDiffReport);
document.getElementById('diffShowSummary').addEventListener('click',function(){
  _openDiffDash();
});

// === Compare Dashboard event wiring ===
document.getElementById('diffDashClose').addEventListener('click',function(){_closeDiffDash()});
document.getElementById('diffDashSearch').addEventListener('input',function(){_diffDashState.search=this.value;_diffDashState.page=1;_renderDiffDash()});
document.getElementById('diffTypeFilter').addEventListener('change',function(){_diffDashState.typeFilter=this.value;_diffDashState.page=1;_renderDiffDash()});
document.getElementById('diffVpcFilter').addEventListener('change',function(){_diffDashState.vpcFilter=this.value;_diffDashState.page=1;_renderDiffDash()});
document.getElementById('diffKindFilter').addEventListener('change',function(){_diffDashState.kindFilter=this.value;_diffDashState.page=1;_renderDiffDash()});
document.getElementById('diffPerPage').addEventListener('change',function(){_diffDashState.perPage=parseInt(this.value)||50;_diffDashState.page=1;_renderDiffDash()});
document.getElementById('diffPagePrev').addEventListener('click',function(){if(_diffDashState.page>1){_diffDashState.page--;_renderDiffDash()}});
document.getElementById('diffPageNext').addEventListener('click',function(){
  var pp=_diffDashState.perPage<=0?(_diffFlatRows?_diffFlatRows.length:1):_diffDashState.perPage;
  var total=Math.max(1,Math.ceil((_getDiffFilteredRows().length)/pp));
  if(_diffDashState.page<total){_diffDashState.page++;_renderDiffDash()}
});
document.getElementById('diffDashExportJSON').addEventListener('click',_exportDiffReport);
document.getElementById('diffDashExportXLSX').addEventListener('click',_exportDiffXlsx);
document.getElementById('diffDashFileBtn').addEventListener('click',function(){document.getElementById('diffFileInput').click()});
document.getElementById('diffSnapPicker').addEventListener('change',function(){
  var idx=parseInt(this.value);
  if(isNaN(idx)||!_snapshots[idx]) return;
  this.value='';
  var snap=_snapshots[idx];
  var wasOpen=document.getElementById('diffDash').classList.contains('open');
  exitDiffMode();
  _compareWithSnapshot(snap);
  if(wasOpen) _openDiffDash();
});
// Esc to close diff dashboard
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&document.getElementById('diffDash').classList.contains('open')){
    _closeDiffDash();
    e.stopPropagation();
    e.preventDefault();
  }
},true);

// Snapshot integration: compare with a snapshot from timeline
function _compareWithSnapshot(snap){
  if(!snap||!snap.textareas) return;
  const data={_format:'awsmap',textareas:snap.textareas,accountLabel:snap.accountLabel||snap.label||'snapshot',_srcName:snap.label||('Snapshot '+new Date(snap.timestamp).toLocaleString())};
  enterDiffMode(data);
}

// === DEPENDENCY GRAPH / BLAST RADIUS ===
let _depGraph=null;
let _blastActive=false;
function buildDependencyGraph(ctx){
  if(!ctx)return {};
  const g={};
  const addEdge=(from,to,rel,strength)=>{if(!g[from])g[from]=[];g[from].push({id:to,rel,strength})};
  // VPC -> subnets (hard)
  (ctx.vpcs||[]).forEach(v=>{
    (ctx.subnets||[]).filter(s=>s.VpcId===v.VpcId).forEach(s=>addEdge(v.VpcId,s.SubnetId,'contains','hard'));
    // VPC -> gateways
    (ctx.igws||[]).forEach(ig=>{if((ig.Attachments||[]).some(a=>a.VpcId===v.VpcId))addEdge(v.VpcId,ig.InternetGatewayId,'attached','hard')});
    (ctx.nats||[]).filter(n=>n.VpcId===v.VpcId).forEach(n=>addEdge(v.VpcId,n.NatGatewayId,'contains','hard'));
    (ctx.vpces||[]).filter(e=>e.VpcId===v.VpcId).forEach(e=>addEdge(v.VpcId,e.VpcEndpointId,'contains','soft'));
    // VPC -> route tables
    (ctx.rts||[]).filter(rt=>rt.VpcId===v.VpcId).forEach(rt=>addEdge(v.VpcId,rt.RouteTableId,'contains','config'));
    // VPC -> NACLs
    (ctx.nacls||[]).filter(n=>n.VpcId===v.VpcId).forEach(n=>addEdge(v.VpcId,n.NetworkAclId,'contains','config'));
    // VPC -> SGs
    (ctx.sgs||[]).filter(sg=>sg.VpcId===v.VpcId).forEach(sg=>addEdge(v.VpcId,sg.GroupId,'contains','config'));
  });
  // Subnet -> resources (hard)
  (ctx.subnets||[]).forEach(sub=>{
    ((ctx.instBySub||{})[sub.SubnetId]||[]).forEach(i=>addEdge(sub.SubnetId,i.InstanceId,'contains','hard'));
    ((ctx.rdsBySub||{})[sub.SubnetId]||[]).forEach(r=>addEdge(sub.SubnetId,r.DBInstanceIdentifier,'contains','hard'));
    ((ctx.ecsBySub||{})[sub.SubnetId]||[]).forEach(e=>addEdge(sub.SubnetId,e.serviceName,'contains','hard'));
    ((ctx.lambdaBySub||{})[sub.SubnetId]||[]).forEach(l=>addEdge(sub.SubnetId,l.FunctionName,'contains','hard'));
    ((ctx.albBySub||{})[sub.SubnetId]||[]).forEach(a=>addEdge(sub.SubnetId,a.LoadBalancerName,'contains','hard'));
    // Subnet -> route table association
    const rt=(ctx.subRT||{})[sub.SubnetId];
    if(rt)addEdge(sub.SubnetId,rt.RouteTableId,'associated','config');
    // Subnet -> NACL
    const nacl=(ctx.subNacl||{})[sub.SubnetId];
    if(nacl)addEdge(sub.SubnetId,nacl.NetworkAclId,'associated','config');
  });
  // EC2 -> SGs (soft)
  (ctx.instances||[]).forEach(inst=>{
    (inst.SecurityGroups||[]).forEach(sg=>addEdge(inst.InstanceId,sg.GroupId,'secured_by','soft'));
    // EC2 -> EBS volumes
    (inst.BlockDeviceMappings||[]).forEach(b=>{if(b.Ebs&&b.Ebs.VolumeId)addEdge(inst.InstanceId,b.Ebs.VolumeId,'attached','hard')});
  });
  // RDS -> SGs
  (ctx.rdsInstances||[]).forEach(db=>{
    (db.VpcSecurityGroups||[]).forEach(sg=>addEdge(db.DBInstanceIdentifier,sg.VpcSecurityGroupId,'secured_by','soft'));
  });
  // ALB -> SGs + target groups
  (ctx.albs||[]).forEach(alb=>{
    (alb.SecurityGroups||[]).forEach(gid=>addEdge(alb.LoadBalancerName,gid,'secured_by','soft'));
    const tgs=(ctx.tgByAlb||{})[alb.LoadBalancerArn]||[];
    tgs.forEach(tg=>{addEdge(alb.LoadBalancerName,tg.TargetGroupName||tg.TargetGroupArn,'targets','soft')});
  });
  // SG -> SG references (config)
  (ctx.sgs||[]).forEach(sg=>{
    [...(sg.IpPermissions||[]),...(sg.IpPermissionsEgress||[])].forEach(p=>{
      (p.UserIdGroupPairs||[]).forEach(pair=>{
        if(pair.GroupId&&pair.GroupId!==sg.GroupId)addEdge(sg.GroupId,pair.GroupId,'references','config');
      });
    });
  });
  // Route table -> gateways (config)
  (ctx.rts||[]).forEach(rt=>{
    (rt.Routes||[]).forEach(r=>{
      if(r.GatewayId&&r.GatewayId!=='local')addEdge(rt.RouteTableId,r.GatewayId,'routes_through','config');
      if(r.NatGatewayId)addEdge(rt.RouteTableId,r.NatGatewayId,'routes_through','config');
      if(r.TransitGatewayId)addEdge(rt.RouteTableId,r.TransitGatewayId,'routes_through','config');
      if(r.VpcPeeringConnectionId)addEdge(rt.RouteTableId,r.VpcPeeringConnectionId,'routes_through','config');
    });
  });
  // Peering -> VPCs (soft)
  (ctx.peerings||[]).forEach(p=>{
    if(p.RequesterVpcInfo)addEdge(p.VpcPeeringConnectionId,p.RequesterVpcInfo.VpcId,'connects','soft');
    if(p.AccepterVpcInfo)addEdge(p.VpcPeeringConnectionId,p.AccepterVpcInfo.VpcId,'connects','soft');
  });
  return g;
}
function getBlastRadius(resourceId,graph,maxDepth){
  maxDepth=maxDepth||5;
  const result={hard:[],soft:[],config:[],all:[]};
  const visited=new Set([resourceId]);
  const queue=[{id:resourceId,depth:0}];
  while(queue.length){
    const{id,depth}=queue.shift();
    if(depth>=maxDepth)continue;
    const edges=graph[id]||[];
    edges.forEach(e=>{
      if(visited.has(e.id))return;
      visited.add(e.id);
      const entry={id:e.id,rel:e.rel,strength:e.strength,depth:depth+1,parent:id};
      result[e.strength]=(result[e.strength]||[]);result[e.strength].push(entry);
      result.all.push(entry);
      queue.push({id:e.id,depth:depth+1});
    });
  }
  return result;
}
function _getResType(id){
  if(!id)return'Unknown';
  if(id.startsWith('vpc-'))return'VPC';if(id.startsWith('subnet-'))return'Subnet';
  if(id.startsWith('i-'))return'EC2';if(id.startsWith('igw-'))return'IGW';
  if(id.startsWith('nat-'))return'NAT';if(id.startsWith('vpce-'))return'VPCE';
  if(id.startsWith('sg-'))return'SG';if(id.startsWith('rtb-'))return'RT';
  if(id.startsWith('acl-'))return'NACL';if(id.startsWith('vol-'))return'EBS';
  if(id.startsWith('pcx-'))return'Peering';if(id.startsWith('tgw-'))return'TGW';
  if(id.startsWith('arn:'))return'ARN';
  if(_rlCtx){
    if((_rlCtx.rdsInstances||[]).some(r=>r.DBInstanceIdentifier===id))return'RDS';
    if((_rlCtx.lambdaFns||[]).some(f=>f.FunctionName===id))return'Lambda';
    if((_rlCtx.ecsServices||[]).some(e=>e.serviceName===id))return'ECS';
    if((_rlCtx.albs||[]).some(a=>a.LoadBalancerName===id))return'ALB';
    if((_rlCtx.ecacheClusters||[]).some(c=>c.CacheClusterId===id))return'ElastiCache';
    if((_rlCtx.redshiftClusters||[]).some(c=>c.ClusterIdentifier===id))return'Redshift';
  }
  return'Resource';
}
function _getResName(id){
  if(!_rlCtx)return id;
  const v=(_rlCtx.vpcs||[]).find(x=>x.VpcId===id);if(v){const t=(v.Tags||[]).find(t=>t.Key==='Name');return t?t.Value:id}
  const s=(_rlCtx.subnets||[]).find(x=>x.SubnetId===id);if(s){const t=(s.Tags||[]).find(t=>t.Key==='Name');return t?t.Value:id}
  const i=(_rlCtx.instances||[]).find(x=>x.InstanceId===id);if(i){const t=(i.Tags||[]).find(t=>t.Key==='Name');return t?t.Value:id}
  const sg=(_rlCtx.sgs||[]).find(x=>x.GroupId===id);if(sg)return sg.GroupName||id;
  return id;
}
function showDependencies(resourceId){
  if(!_rlCtx)return;
  if(!_depGraph)_depGraph=buildDependencyGraph(_rlCtx);
  const blast=getBlastRadius(resourceId,_depGraph);
  const resName=_getResName(resourceId);const resType=_getResType(resourceId);
  document.getElementById('depTitle').textContent='Dependencies: '+resType+' '+resName;
  const body=document.getElementById('depBody');
  let h='<div class="dep-summary">';
  h+='<div class="dep-stat dep-hard"><b>'+blast.hard.length+'</b><span>Hard (destroyed)</span></div>';
  h+='<div class="dep-stat dep-soft"><b>'+blast.soft.length+'</b><span>Soft (degraded)</span></div>';
  h+='<div class="dep-stat dep-config"><b>'+blast.config.length+'</b><span>Config (dangling)</span></div>';
  h+='<div class="dep-stat"><b>'+blast.all.length+'</b><span>Total affected</span></div>';
  h+='</div>';
  // Group by depth
  const byDepth={};blast.all.forEach(e=>{(byDepth[e.depth]=byDepth[e.depth]||[]).push(e)});
  h+='<div class="dep-tree">';
  h+='<div class="dep-node dep-depth-0" style="border-left-color:var(--accent-cyan);font-weight:600"><span class="dep-type">'+resType+'</span>'+_escHtml(resName)+' <span style="color:var(--text-muted);font-size:9px">'+resourceId+'</span></div>';
  Object.keys(byDepth).sort((a,b)=>a-b).forEach(d=>{
    byDepth[d].sort((a,b)=>{const o={hard:0,soft:1,config:2};return(o[a.strength]||3)-(o[b.strength]||3)}).forEach(e=>{
      const depCls=Math.min(parseInt(d),3);
      const name=_getResName(e.id);const type=_getResType(e.id);
      h+='<div class="dep-node dep-'+e.strength+' dep-depth-'+depCls+'" data-id="'+e.id+'" title="'+e.id+'"><span class="dep-type">'+type+'</span>'+_escHtml(name)+' <span class="dep-rel">'+e.rel+'</span></div>';
    });
  });
  if(!blast.all.length)h+='<div style="padding:20px;color:var(--text-muted);font-size:12px;text-align:center">No dependencies found for this resource</div>';
  h+='</div>';
  body.innerHTML=h;
  // Click to zoom
  body.querySelectorAll('.dep-node[data-id]').forEach(el=>{el.addEventListener('click',()=>{
    document.getElementById('depOverlay').classList.remove('open');
    _zoomToElement(el.dataset.id);
  })});
  document.getElementById('depOverlay').classList.add('open');
  // Store for blast highlighting
  document.getElementById('depBlastBtn').onclick=()=>{
    document.getElementById('depOverlay').classList.remove('open');
    _applyBlastRadius(resourceId,blast);
  };
}
function _applyBlastRadius(sourceId,blast){
  if(!_mapG)return;
  _blastActive=true;
  // Dim everything
  _mapG.selectAll('.vpc-group,.subnet-node,.gw-node,.lz-gw-node,.lz-tgw-node').classed('blast-dimmed',true);
  // Un-dim + glow source
  const srcEl=_mapG.node().querySelector('[data-vpc-id="'+sourceId+'"],[data-subnet-id="'+sourceId+'"],[data-gwid="'+sourceId+'"],[data-id="'+sourceId+'"]');
  if(srcEl)d3.select(srcEl).classed('blast-dimmed',false).classed('blast-glow-hard',true);
  // Highlight dependents
  blast.all.forEach(e=>{
    const el=_mapG.node().querySelector('[data-vpc-id="'+e.id+'"],[data-subnet-id="'+e.id+'"],[data-gwid="'+e.id+'"],[data-id="'+e.id+'"]');
    if(el)d3.select(el).classed('blast-dimmed',false).classed('blast-glow-'+e.strength,true);
  });
  _showToast('Blast radius active - click anywhere to clear');
}
function _clearBlastRadius(){
  if(!_blastActive||!_mapG)return;
  _blastActive=false;
  _mapG.selectAll('.blast-dimmed,.blast-glow-hard,.blast-glow-soft,.blast-glow-config').classed('blast-dimmed',false).classed('blast-glow-hard',false).classed('blast-glow-soft',false).classed('blast-glow-config',false);
}
document.getElementById('depCloseBtn').addEventListener('click',()=>document.getElementById('depOverlay').classList.remove('open'));
document.getElementById('depBlastBtn').addEventListener('click',()=>{});// overridden in showDependencies

// === HELP ===
document.getElementById('helpBtn').addEventListener('click',()=>{document.getElementById('helpOverlay').style.display='flex'});
document.getElementById('helpClose').addEventListener('click',()=>{document.getElementById('helpOverlay').style.display='none'});

// === UNIFIED DASHBOARD TAB REGISTRY ===
var _udashTab = null;
var _UDASH_TABS = [
  {id:'classification', label:'Classification', color:'#a78bfa', icon:'', prereq:function(){
    if(!_rlCtx){_showToast('Render map data first','warn');return false}
    if(!_classificationData.length) runClassificationEngine(_rlCtx);
    return true;
  }, render:function(){ _renderClassificationTab(); }},
  {id:'iam', label:'IAM Review', color:'#f472b6', icon:'', prereq:function(){
    if(!_rlCtx){_showToast('Render map data first','warn');return false}
    if(!_iamReviewData.length){
      try{var iamRaw=safeParse(gv('in_iam'));
      if(iamRaw){var p=parseIAMData(iamRaw);if(p)prepareIAMReviewData(p)}}catch(e){console.warn('IAM parse error in prereq:',e)}
    }
    return true;
  }, render:function(){ _renderIAMTab(); }},
  {id:'compliance', label:'Compliance', color:'#22d3ee', icon:'', prereq:function(){
    if(!_rlCtx){_showToast('Render map data first','warn');return false}
    return true;
  }, render:function(){ _renderCompDash(); }},
  {id:'firewall', label:'Firewall', color:'#f59e0b', icon:'', prereq:function(){
    if(!_rlCtx){_showToast('Render map data first','warn');return false}
    return true;
  }, render:function(){ _renderFirewallTab(); }},
  {id:'budr', label:'BUDR', color:'#10b981', icon:'', prereq:function(){
    if(!_rlCtx){_showToast('Render map data first','warn');return false}
    if(!_budrAssessments||!_budrAssessments.length) runBUDRChecks(_rlCtx);
    if(!_budrAssessments.length){_showToast('No resources to assess');return false}
    return true;
  }, render:function(){ _renderBUDRDash(); }},
  {id:'reports', label:'Reports', color:'#6366f1', icon:'', prereq:function(){ return true; }, render:function(){ _renderReportsTab(); }}
];

function openUnifiedDash(tabId){
  var tab=_UDASH_TABS.find(function(t){return t.id===tabId});
  if(!tab) return;
  if(!tab.prereq()) return;
  var el=document.getElementById('udash');
  var wasOpen=el.classList.contains('open');
  if(wasOpen&&tabId===_udashTab) return;
  _udashTab=tabId;
  // Clean shared areas (prevents stale layout classes, hidden toolbars, wrong footers)
  document.getElementById('udashToolbar').innerHTML='';
  document.getElementById('udashBody').innerHTML='';
  document.getElementById('udashBody').className='udash-body';
  document.getElementById('udashFooter').innerHTML='';
  document.getElementById('udashToolbar').style.display='';
  _govToolbarTab=null;
  _compToolbarTab=null;
  el.classList.add('open');
  if(!wasOpen) el.offsetHeight; // force reflow only on first open
  _renderUdashTabs();
  tab.render();
}

function _switchUdashTab(tabId){
  if(tabId===_udashTab) return;
  var tab=_UDASH_TABS.find(function(t){return t.id===tabId});
  if(!tab||!tab.prereq()) return;
  _udashTab=tabId;
  _renderUdashTabs();
  // Close firewall full panel if open
  document.getElementById('fwFullPanel').classList.remove('open');
  // Clear shared areas
  document.getElementById('udashBody').onclick=null;
  document.getElementById('udashToolbar').innerHTML='';
  document.getElementById('udashBody').innerHTML='';
  document.getElementById('udashBody').className='udash-body';
  document.getElementById('udashFooter').innerHTML='';
  document.getElementById('udashToolbar').style.display='';
  // Reset toolbar tab guards
  _govToolbarTab=null;
  _compToolbarTab=null;
  tab.render();
}

function _renderUdashTabs(){
  var c=document.getElementById('udashTabs');
  c.innerHTML='';
  _UDASH_TABS.forEach(function(t){
    var btn=document.createElement('button');
    btn.className='udash-tab'+(t.id===_udashTab?' active':'');
    btn.style.setProperty('--tab-color',t.color);
    btn.textContent=t.label;
    btn.addEventListener('click',function(){_switchUdashTab(t.id)});
    c.appendChild(btn);
  });
}

function closeUnifiedDash(){
  document.getElementById('udash').classList.remove('open');
  document.getElementById('fwFullPanel').classList.remove('open');
  _udashTab=null;
}

document.getElementById('udashClose').addEventListener('click',closeUnifiedDash);

// === COMPLIANCE DASHBOARD CONTROLS ===
// (Toolbar event listeners are now attached dynamically inside _renderCompDash)

// === BUDR DASHBOARD ===
let _budrDashState={tierFilter:'all',search:'',sort:'tier'};
const _BUDR_TIER_META={
  protected:{name:'Protected',color:'#10b981',icon:''},
  partial:{name:'Partially Protected',color:'#f59e0b',icon:''},
  at_risk:{name:'At Risk',color:'#ef4444',icon:''}
};
function openBUDRDash(){
  _budrDashState={tierFilter:'all',search:'',sort:'tier'};
  openUnifiedDash('budr');
}
function _renderBUDRDash(){
  var tb=document.getElementById('udashToolbar');
  var body=document.getElementById('udashBody');
  var footer=document.getElementById('udashFooter');
  var st=_budrDashState;
  var counts=_getBUDRTierCounts();
  var total=_budrAssessments.length;
  // Toolbar: search + sort + tier pills
  var th='<input id="budrSearch" type="text" placeholder="Filter by name, ID, type..." value="'+_escHtml(st.search)+'" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:4px 10px;border-radius:4px;font-size:11px;font-family:IBM Plex Mono,monospace;width:200px">';
  th+='<select id="budrSort" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-secondary);padding:4px 8px;border-radius:4px;font-size:10px;font-family:IBM Plex Mono,monospace">';
  th+='<option value="tier"'+(st.sort==='tier'?' selected':'')+'>Sort: Tier</option>';
  th+='<option value="name"'+(st.sort==='name'?' selected':'')+'>Sort: Name</option>';
  th+='<option value="type"'+(st.sort==='type'?' selected':'')+'>Sort: Type</option>';
  th+='</select>';
  th+='<div id="budrPills" style="display:flex;gap:4px;margin-left:8px"></div>';
  tb.innerHTML=th;
  // Build tier pills
  var pillBox=document.getElementById('budrPills');
  [{tier:'all',label:'All ('+total+')'},{tier:'protected',label:'Protected ('+counts.protected+')'},{tier:'partial',label:'Partial ('+counts.partial+')'},{tier:'at_risk',label:'At Risk ('+counts.at_risk+')'}].forEach(function(p){
    var btn=document.createElement('span');btn.className='budr-pill'+(st.tierFilter===p.tier?' active':'');
    btn.dataset.tier=p.tier;btn.textContent=p.label;
    btn.addEventListener('click',function(){st.tierFilter=p.tier;_renderBUDRDash()});pillBox.appendChild(btn);
  });
  // Wire toolbar listeners
  document.getElementById('budrSearch').addEventListener('input',function(){st.search=this.value;_renderBUDRDash()});
  document.getElementById('budrSort').addEventListener('change',function(){st.sort=this.value;_renderBUDRDash()});
  // Filter assessments
  var items=_budrAssessments.slice();
  if(st.tierFilter!=='all')items=items.filter(function(a){return a.profile&&a.profile.tier===st.tierFilter});
  if(st.search){var q=st.search.toLowerCase();items=items.filter(function(a){return(a.name||'').toLowerCase().includes(q)||(a.id||'').toLowerCase().includes(q)||(a.type||'').toLowerCase().includes(q)})}
  if(st.sort==='name')items.sort(function(a,b){return(a.name||a.id||'').localeCompare(b.name||b.id||'')});
  else if(st.sort==='type')items.sort(function(a,b){return(a.type||'').localeCompare(b.type||'')});
  // Summary cards
  var h='<div class="budr-summary">';
  ['protected','partial','at_risk'].forEach(function(tier){
    var meta=_BUDR_TIER_META[tier];var c=counts[tier]||0;
    var pct=total>0?Math.round(c/total*100):0;
    h+='<div class="budr-card '+tier+'" data-tier="'+tier+'">';
    h+='<div class="bc-count">'+c+'</div>';
    h+='<div class="bc-label">'+esc(meta.name)+'</div>';
    h+='<div class="bc-rto">'+pct+'% of resources</div>';
    h+='</div>';
  });
  h+='</div>';
  // Group by tier
  var groups={protected:[],partial:[],at_risk:[]};
  items.forEach(function(a){if(a.profile)groups[a.profile.tier].push(a)});
  // Render sections
  ['at_risk','partial','protected'].forEach(function(tier){
    var grp=groups[tier];if(!grp.length)return;
    var meta=_BUDR_TIER_META[tier];
    var collapsed=tier==='protected';
    h+='<div class="budr-section" data-tier="'+tier+'">';
    h+='<div class="budr-section-hdr'+(collapsed?' collapsed':'')+'">';
    h+='<span class="bs-chevron">\u25BC</span>';
    h+='<h3 style="color:'+meta.color+'">'+meta.icon+' '+esc(meta.name)+'</h3>';
    h+='<span class="bs-count">'+grp.length+' resource'+(grp.length!==1?'s':'')+'</span>';
    h+='</div>';
    h+='<div class="budr-section-body"'+(collapsed?' style="display:none"':'')+'>';
    grp.forEach(function(a,i){
      var findings=_budrFindings.filter(function(f){return f.resource===a.id});
      var expanded=tier==='at_risk';
      h+='<div class="budr-res'+(expanded?' expanded':'')+'" data-idx="'+tier+'-'+i+'">';
      h+='<div class="budr-res-hdr">';
      h+='<span class="br-dot '+tier+'"></span>';
      h+='<span class="br-type">'+esc(a.type)+'</span>';
      h+='<span class="br-name">'+esc(a.name)+'</span>';
      h+='<span class="br-rto">RTO: '+esc(a.profile.rto)+' | RPO: '+esc(a.profile.rpo)+'</span>';
      h+='</div>';
      h+='<div class="budr-res-body">';
      // Signals
      if(a.signals){
        h+='<div class="budr-signals">';
        Object.entries(a.signals).forEach(function(entry){
          var k=entry[0],v=entry[1];
          var good=v===true||(typeof v==='number'&&v>1);
          var bad=v===false||v===0;
          var cls=good?'good':bad?'bad':'warn';
          var icon=good?'✓':bad?'✗':'!';
          h+='<span class="budr-sig-badge '+cls+'">'+icon+' '+esc(k)+': '+esc(String(v))+'</span>';
        });
        h+='</div>';
      }
      // Findings for this resource
      if(findings.length){
        h+='<div class="budr-findings">';
        findings.forEach(function(f){
          h+='<div class="budr-finding">';
          h+='<span class="bf-sev '+f.severity+'">'+f.severity+'</span>';
          h+='<span class="bf-msg">'+esc(f.message)+'</span>';
          h+='</div>';
          if(f.remediation)h+='<div class="budr-finding"><span class="bf-sev" style="visibility:hidden">.</span><span class="bf-fix">\u21B3 '+esc(f.remediation)+'</span></div>';
        });
        h+='</div>';
      }
      h+='</div></div>';
    });
    h+='</div></div>';
  });
  if(!items.length)h+='<div style="padding:40px;text-align:center;color:var(--text-muted);font-family:IBM Plex Mono,monospace">No resources match current filter</div>';
  body.innerHTML=h;
  body.scrollTop=0;
  // Event: section collapse
  body.querySelectorAll('.budr-section-hdr').forEach(function(hdr){
    hdr.addEventListener('click',function(){
      var bd=hdr.nextElementSibling;
      if(hdr.classList.contains('collapsed')){hdr.classList.remove('collapsed');bd.style.display=''}
      else{hdr.classList.add('collapsed');bd.style.display='none'}
    });
  });
  // Event: resource card expand
  body.querySelectorAll('.budr-res-hdr').forEach(function(hdr){
    hdr.addEventListener('click',function(){hdr.closest('.budr-res').classList.toggle('expanded')});
  });
  // Event: summary card click = filter
  body.querySelectorAll('.budr-card').forEach(function(card){
    card.addEventListener('click',function(){
      var t=card.dataset.tier;
      st.tierFilter=st.tierFilter===t?'all':t;
      _renderBUDRDash();
    });
  });
  // Footer: item count + export buttons
  var fh='<button id="budrExportCSV">Export CSV</button>';
  fh+='<button id="budrExportJSON">Export JSON</button>';
  if(_isElectron) fh+='<button id="budrExportXLSX">Export XLSX</button>';
  fh+='<span style="margin-left:auto;font-size:10px;color:var(--text-muted)">'+items.length+' of '+total+' resources</span>';
  footer.innerHTML=fh;
  // Wire export listeners
  document.getElementById('budrExportCSV').addEventListener('click',function(){
    if(!_budrAssessments.length){_showToast('No BUDR data');return}
    var csv='Type,Resource,Name,Tier,RTO,RPO,Signals\n';
    _budrAssessments.forEach(function(a){
      var tier=a.profile?a.profile.tier:'unknown';
      var rto=a.profile?a.profile.rto:'';
      var rpo=a.profile?a.profile.rpo:'';
      var sigs=a.signals?Object.entries(a.signals).map(function(e){return e[0]+'='+e[1]}).join('; '):'';
      var ce=function(s){return String(s||'').replace(/"/g,'""')};
      csv+='"'+ce(a.type)+'","'+ce(a.id)+'","'+ce(a.name)+'","'+ce(tier)+'","'+ce(rto)+'","'+ce(rpo)+'","'+ce(sigs)+'"\n';
    });
    downloadBlob(new Blob([csv],{type:'text/csv'}),'budr-assessment.csv');
  });
  document.getElementById('budrExportJSON').addEventListener('click',function(){
    if(!_budrAssessments.length){_showToast('No BUDR data');return}
    var data={timestamp:new Date().toISOString(),summary:_getBUDRTierCounts(),assessments:_budrAssessments,findings:_budrFindings};
    downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'budr-assessment.json');
  });
  var xlsxBtn=document.getElementById('budrExportXLSX');
  if(xlsxBtn) xlsxBtn.addEventListener('click',async function(){
    if(!_budrAssessments.length){_showToast('No BUDR data');return}
    var data={timestamp:new Date().toISOString(),summary:_getBUDRTierCounts(),assessments:_budrAssessments,findings:_budrFindings};
    var jsonStr=JSON.stringify(data,null,2);
    _showToast('Generating XLSX report\u2026');
    try{
      var result=await window.electronAPI.exportBUDRXlsx(jsonStr);
      if(!result){_showToast('Export cancelled');return}
      if(result.error){_showToast('Error: '+result.error,'error');return}
      _showToast('Saved: '+result.path);
    }catch(e){_showToast('XLSX export failed: '+e.message,'error')}
  });
}
// BUDR button
document.getElementById('budrBtn').addEventListener('click',openBUDRDash);

// === GOVERNANCE DASHBOARD ===
function _closeAllDashboardsExcept(keep){_closeAllDashboards(keep)}

function openGovernanceDashboard(tab){
  if(tab==='iam') openUnifiedDash('iam');
  else openUnifiedDash('classification');
}

var _govToolbarTab=null;
var _compToolbarTab=null;

function _renderClassificationTab(){
  var tb=document.getElementById('udashToolbar');
  var body=document.getElementById('udashBody');
  var footer=document.getElementById('udashFooter');
  var st=_govDashState;
  // Toolbar — only rebuild on tab switch
  if(_govToolbarTab!=='classification'){
    _govToolbarTab='classification';
    var th='<label>Search</label>';
    th+='<input id="govSearch" type="text" placeholder="Filter by name, type, VPC..." value="'+_escHtml(st.search)+'">';
    th+='<label>Tier</label>';
    th+='<select id="govFilter">';
    ['all','critical','high','medium','low'].forEach(function(v){th+='<option value="'+v+'"'+(st.filter===v?' selected':'')+'>'+v.charAt(0).toUpperCase()+v.slice(1)+'</option>'});
    th+='</select>';
    th+='<label>Per page</label>';
    th+='<select id="govPerPage">';
    [25,50,100,0].forEach(function(v){th+='<option value="'+v+'"'+(st.perPage===v?' selected':'')+'>'+(v||'All')+'</option>'});
    th+='</select>';
    th+='<button id="govRulesBtn" style="margin-left:auto;background:rgba(139,92,246,.1);border:1px solid #8b5cf6;color:#8b5cf6;padding:4px 12px;border-radius:4px;font-size:10px;font-family:\'IBM Plex Mono\',monospace;cursor:pointer">Configure Rules</button>';
    tb.innerHTML=th;
    document.getElementById('govSearch').addEventListener('input',function(){st.search=this.value;st.page=1;_renderClassificationTab()});
    document.getElementById('govFilter').addEventListener('change',function(){st.filter=this.value;st.page=1;_renderClassificationTab()});
    document.getElementById('govPerPage').addEventListener('change',function(){st.perPage=parseInt(this.value)||0;st.page=1;_renderClassificationTab()});
    document.getElementById('govRulesBtn').addEventListener('click',_openRulesEditor);
  }
  // Summary cards
  var counts={critical:0,high:0,medium:0,low:0};
  _classificationData.forEach(function(r){counts[r.tier]=(counts[r.tier]||0)+1});
  var bh='<div class="gov-tier-cards">';
  [{t:'critical',l:'Critical'},{t:'high',l:'High'},{t:'medium',l:'Medium'},{t:'low',l:'Low'}].forEach(function(d){
    var meta=_TIER_RPO_RTO[d.t];
    bh+='<div class="gov-tier-card" data-gov-tier="'+d.t+'" style="border-color:'+meta.color+'">';
    bh+='<h3 style="color:'+meta.color+'">'+d.l+'</h3>';
    bh+='<div class="gov-tier-count" style="color:'+meta.color+'">'+(counts[d.t]||0)+'</div>';
    bh+='<div class="gov-tier-meta">RPO: '+meta.rpo+' · RTO: '+meta.rto+'</div>';
    bh+='</div>';
  });
  bh+='</div>';
  // Filter + sort
  var items=_classificationData.slice();
  if(st.filter!=='all') items=items.filter(function(r){return r.tier===st.filter});
  if(st.search){var q=st.search.toLowerCase();items=items.filter(function(r){return(r.name||'').toLowerCase().indexOf(q)!==-1||(r.type||'').toLowerCase().indexOf(q)!==-1||(r.id||'').toLowerCase().indexOf(q)!==-1||(r.vpcName||'').toLowerCase().indexOf(q)!==-1})}
  var sortKey=st.sort;var dir=st.sortDir==='asc'?1:-1;
  items.sort(function(a,b){
    if(sortKey==='tier') return((_TIER_RPO_RTO[a.tier]||{priority:99}).priority-(_TIER_RPO_RTO[b.tier]||{priority:99}).priority)*dir;
    var av=(a[sortKey]||'').toLowerCase();var bv=(b[sortKey]||'').toLowerCase();
    return av<bv?-dir:av>bv?dir:0;
  });
  // Paginate
  var perPage=st.perPage<=0?items.length:st.perPage;
  var totalPages=Math.max(1,Math.ceil(items.length/perPage));
  st.page=Math.min(Math.max(1,st.page),totalPages);
  var start=(st.page-1)*perPage;
  var pageItems=items.slice(start,start+perPage);
  // Table
  var cols=[{key:'name',label:'Resource'},{key:'type',label:'Type'},{key:'tier',label:'Tier'},{key:'rpo',label:'RPO',nosort:true},{key:'rto',label:'RTO',nosort:true},{key:'vpcName',label:'VPC'},{key:'auto',label:'Source',nosort:true},{key:'actions',label:'',nosort:true}];
  bh+='<table class="gov-table"><thead><tr>';
  cols.forEach(function(c){
    var cls='';if(!c.nosort&&st.sort===c.key) cls=st.sortDir==='asc'?' sort-asc':' sort-desc';
    bh+='<th'+(c.nosort?'':' data-sort-col="'+c.key+'"')+' class="'+cls+'">'+c.label+'</th>';
  });
  bh+='</tr></thead><tbody>';
  if(!pageItems.length) bh+='<tr><td colspan="'+cols.length+'" style="text-align:center;padding:30px;color:var(--text-muted)">No resources match filters</td></tr>';
  pageItems.forEach(function(r){
    bh+='<tr>';
    bh+='<td><span class="gov-res-link" data-rid="'+_escHtml(r.id)+'" style="color:var(--accent-cyan);cursor:pointer">'+_escHtml(r.name)+'</span></td>';
    bh+='<td>'+_escHtml(r.type)+'</td>';
    bh+='<td><span class="gov-tier-badge '+r.tier+'">'+r.tier+'</span></td>';
    bh+='<td>'+_escHtml(r.rpo)+'</td>';
    bh+='<td>'+_escHtml(r.rto)+'</td>';
    bh+='<td style="font-size:10px;color:var(--text-muted)">'+_escHtml(r.vpcName||'—')+'</td>';
    bh+='<td style="font-size:9px;color:var(--text-muted)">'+(r.auto?'Auto':'<span style="color:#8b5cf6">Manual</span>')+'</td>';
    bh+='<td><select class="gov-override-select" data-res-id="'+_escHtml(r.id)+'">';
    ['critical','high','medium','low'].forEach(function(t){bh+='<option value="'+t+'"'+(r.tier===t?' selected':'')+'>'+t+'</option>'});
    bh+='</select></td>';
    bh+='</tr>';
  });
  bh+='</tbody></table>';
  body.innerHTML=bh;
  body.scrollTop=0;
  // Footer
  var fh='<button id="govExportCSV">Export CSV</button>';
  fh+='<button id="govExportJSON">Export JSON</button>';
  fh+='<span style="margin-left:auto;font-size:10px;color:var(--text-muted)">'+items.length+' of '+_classificationData.length+'</span>';
  if(totalPages>1){
    fh+='<button id="govPrev"'+(st.page<=1?' disabled':'')+'>← Prev</button>';
    fh+='<span style="font-size:10px;color:var(--text-muted)">Page '+st.page+' of '+totalPages+'</span>';
    fh+='<button id="govNext"'+(st.page>=totalPages?' disabled':'')+'>Next →</button>';
  }
  footer.innerHTML=fh;
  // Wire body/footer events (these get recreated each render)
  if(document.getElementById('govPrev')) document.getElementById('govPrev').addEventListener('click',function(){st.page--;_renderClassificationTab()});
  if(document.getElementById('govNext')) document.getElementById('govNext').addEventListener('click',function(){st.page++;_renderClassificationTab()});
  // Sort headers
  body.querySelectorAll('th[data-sort-col]').forEach(function(th){
    th.addEventListener('click',function(){
      var col=this.dataset.sortCol;
      if(st.sort===col) st.sortDir=st.sortDir==='asc'?'desc':'asc';
      else{st.sort=col;st.sortDir='asc'}
      st.page=1;_renderClassificationTab();
    });
  });
  // Tier card clicks
  body.querySelectorAll('.gov-tier-card[data-gov-tier]').forEach(function(card){
    card.addEventListener('click',function(){
      var tier=this.dataset.govTier;
      st.filter=st.filter===tier?'all':tier;
      document.getElementById('govFilter').value=st.filter;
      st.page=1;_renderClassificationTab();
    });
  });
  // Override selects
  body.querySelectorAll('.gov-override-select').forEach(function(sel){
    sel.addEventListener('change',function(){
      var resId=this.dataset.resId;var newTier=this.value;
      _classificationOverrides[resId]=newTier;
      var item=_classificationData.find(function(r){return r.id===resId});
      if(item){item.tier=newTier;item.rpo=_TIER_RPO_RTO[newTier].rpo;item.rto=_TIER_RPO_RTO[newTier].rto;item.auto=false}
      _renderClassificationTab();
    });
  });
  // Resource name clicks → jump to resource on map and open detail panel
  body.querySelectorAll('.gov-res-link').forEach(function(el){el.addEventListener('click',function(e){
    e.stopPropagation();var rid=this.dataset.rid;if(!rid)return;
    closeUnifiedDash();
    setTimeout(function(){_zoomAndShowDetail(rid)},250);
  })});
  // Export
  document.getElementById('govExportCSV').addEventListener('click',function(){
    var rows=[['Resource','Type','Tier','RPO','RTO','Classification','VPC']];
    items.forEach(function(r){rows.push([r.name,r.type,r.tier,r.rpo,r.rto,r.auto?'Auto':'Manual',r.vpcName||''])});
    var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"'}).join(',')}).join('\n');
    downloadBlob(new Blob([csv],{type:'text/csv'}),'asset-classification.csv');
  });
  document.getElementById('govExportJSON').addEventListener('click',function(){
    downloadBlob(new Blob([JSON.stringify(items,null,2)],{type:'application/json'}),'asset-classification.json');
  });
}

function _renderIAMTab(){
  var tb=document.getElementById('udashToolbar');
  var body=document.getElementById('udashBody');
  var footer=document.getElementById('udashFooter');
  var st=_iamDashState;
  // Toolbar — only rebuild on tab switch
  if(_govToolbarTab!=='iam'){
    _govToolbarTab='iam';
    var th='<label>Search</label>';
    th+='<input id="govSearch" type="text" placeholder="Filter by name, ARN, type..." value="'+_escHtml(st.search)+'">';
    th+='<label>Filter</label>';
    th+='<select id="govFilter">';
    [{v:'all',l:'All'},{v:'roles',l:'Roles Only'},{v:'users',l:'Users Only'},{v:'admin',l:'Admin Access'},{v:'findings',l:'With Findings'}].forEach(function(o){
      th+='<option value="'+o.v+'"'+(st.filter===o.v?' selected':'')+'>'+o.l+'</option>';
    });
    th+='</select>';
    th+='<label>Per page</label>';
    th+='<select id="govPerPage">';
    [25,50,100,0].forEach(function(v){th+='<option value="'+v+'"'+(st.perPage===v?' selected':'')+'>'+(v||'All')+'</option>'});
    th+='</select>';
    tb.innerHTML=th;
    document.getElementById('govSearch').addEventListener('input',function(){st.search=this.value;st.page=1;_renderIAMTab()});
    document.getElementById('govFilter').addEventListener('change',function(){st.filter=this.value;st.page=1;_renderIAMTab()});
    document.getElementById('govPerPage').addEventListener('change',function(){st.perPage=parseInt(this.value)||0;st.page=1;_renderIAMTab()});
  }
  if(!_iamReviewData.length){
    body.innerHTML='<div style="text-align:center;padding:60px;color:var(--text-muted);font-family:\'IBM Plex Mono\',monospace"><p style="font-size:14px">No IAM data loaded</p><p style="font-size:11px">Paste IAM auth details (from <code>aws iam get-account-authorization-details</code>) in the IAM section of the left panel, then re-render.</p></div>';
    footer.innerHTML='';
    return;
  }
  // Filter + sort
  var items=_iamReviewData.slice();
  if(st.filter==='roles') items=items.filter(function(r){return r.type==='Role'});
  else if(st.filter==='users') items=items.filter(function(r){return r.type==='User'});
  else if(st.filter==='admin') items=items.filter(function(r){return r.isAdmin});
  else if(st.filter==='findings') items=items.filter(function(r){return r.findings.length>0});
  if(st.search){var q=st.search.toLowerCase();items=items.filter(function(r){return(r.name||'').toLowerCase().indexOf(q)!==-1||(r.arn||'').toLowerCase().indexOf(q)!==-1||(r.type||'').toLowerCase().indexOf(q)!==-1})}
  var sortKey=st.sort;var dir=st.sortDir==='asc'?1:-1;
  items.sort(function(a,b){
    if(sortKey==='lastUsed'||sortKey==='created'){return((a[sortKey]||0)-(b[sortKey]||0))*dir}
    var av=(a[sortKey]||'').toString().toLowerCase();var bv=(b[sortKey]||'').toString().toLowerCase();
    return av<bv?-dir:av>bv?dir:0;
  });
  // Paginate
  var perPage=st.perPage<=0?items.length:st.perPage;
  var totalPages=Math.max(1,Math.ceil(items.length/perPage));
  st.page=Math.min(Math.max(1,st.page),totalPages);
  var start=(st.page-1)*perPage;
  var pageItems=items.slice(start,start+perPage);
  // Summary
  var roleCt=_iamReviewData.filter(function(r){return r.type==='Role'}).length;
  var userCt=_iamReviewData.filter(function(r){return r.type==='User'}).length;
  var adminCt=_iamReviewData.filter(function(r){return r.isAdmin}).length;
  var findCt=_iamReviewData.filter(function(r){return r.findings.length>0}).length;
  var bh='<div class="gov-tier-cards" style="margin-bottom:16px">';
  [{l:'Roles',c:roleCt,color:'#8b5cf6'},{l:'Users',c:userCt,color:'#22d3ee'},{l:'Admin',c:adminCt,color:'#ef4444'},{l:'With Findings',c:findCt,color:'#f59e0b'}].forEach(function(d){
    bh+='<div class="gov-tier-card" style="border-color:'+d.color+'"><h3 style="color:'+d.color+'">'+d.l+'</h3><div class="gov-tier-count" style="color:'+d.color+'">'+d.c+'</div></div>';
  });
  bh+='</div>';
  // Table
  var cols=[{key:'name',label:'Name'},{key:'type',label:'Type'},{key:'created',label:'Created'},{key:'lastUsed',label:'Last Used'},{key:'policies',label:'Policies',nosort:true},{key:'admin',label:'Admin',nosort:true},{key:'findings',label:'Findings',nosort:true},{key:'cross',label:'Cross-Acct',nosort:true}];
  bh+='<table class="gov-table"><thead><tr>';
  cols.forEach(function(c){
    var cls='';if(!c.nosort&&st.sort===c.key) cls=st.sortDir==='asc'?' sort-asc':' sort-desc';
    bh+='<th'+(c.nosort?'':' data-sort-col="'+c.key+'"')+' class="'+cls+'">'+c.label+'</th>';
  });
  bh+='</tr></thead><tbody>';
  if(!pageItems.length) bh+='<tr><td colspan="'+cols.length+'" style="text-align:center;padding:30px;color:var(--text-muted)">No IAM entities match filters</td></tr>';
  pageItems.forEach(function(r,idx){
    var rowId='iam-r-'+idx;
    bh+='<tr data-iam-row="'+rowId+'" style="cursor:pointer">';
    bh+='<td style="color:var(--accent-cyan)">'+_escHtml(r.name)+'</td>';
    bh+='<td>'+_escHtml(r.type)+'</td>';
    bh+='<td style="font-size:10px">'+(r.created?r.created.toISOString().split('T')[0]:'—')+'</td>';
    bh+='<td style="font-size:10px">'+(r.lastUsed?r.lastUsed.toISOString().split('T')[0]:'Never')+'</td>';
    bh+='<td style="text-align:center">'+r.policies+'</td>';
    bh+='<td>'+(r.isAdmin?'<span class="gov-admin-badge">Admin</span>':'—')+'</td>';
    bh+='<td>'+(r.findings.length>0?'<span class="gov-finding-badge">'+r.findings.length+'</span>':'—')+'</td>';
    bh+='<td>'+(r.crossAccounts.length>0?'<span style="color:#f59e0b">'+r.crossAccounts.length+'</span>':'—')+'</td>';
    bh+='</tr>';
    // Expandable detail row
    bh+='<tr><td colspan="'+cols.length+'" class="gov-iam-expand" id="'+rowId+'-exp">';
    bh+='<div style="margin-bottom:6px"><b>ARN:</b> <code style="font-size:10px;background:var(--bg-input);padding:2px 6px;border-radius:3px">'+_escHtml(r.arn)+'</code></div>';
    if(r.policyNames&&r.policyNames.length) bh+='<div style="margin-bottom:6px"><b>Policies:</b> '+r.policyNames.map(function(p){return '<code style="font-size:9px;background:var(--bg-input);padding:1px 4px;border-radius:2px;margin-right:3px">'+_escHtml(p)+'</code>'}).join('')+'</div>';
    if(r.permBoundary) bh+='<div style="margin-bottom:6px"><b>Permission Boundary:</b> <code style="font-size:9px">'+_escHtml(r.permBoundary)+'</code></div>';
    if(r.crossAccounts.length) bh+='<div style="margin-bottom:6px"><b>Cross-Account Trusts:</b> '+r.crossAccounts.map(function(a){return '<code style="font-size:10px;background:rgba(245,158,11,.1);padding:1px 4px;border-radius:2px;margin-right:3px">'+_escHtml(a)+'</code>'}).join('')+'</div>';
    if(r.type==='User'){
      bh+='<div style="margin-bottom:6px"><b>MFA:</b> '+(r.hasMFA?'<span style="color:#10b981">✓ Enabled</span>':'<span style="color:#ef4444">✗ Disabled</span>')+'</div>';
      if(r.hasConsole) bh+='<div style="margin-bottom:6px"><b>Console Access:</b> <span style="color:#f59e0b">Enabled</span></div>';
      if(r.activeKeys) bh+='<div style="margin-bottom:6px"><b>Active Access Keys:</b> '+r.activeKeys+'</div>';
    }
    if(r.findings.length){
      bh+='<div><b>Findings ('+r.findings.length+'):</b><ul style="margin:4px 0 0;padding-left:20px;list-style:none">';
      r.findings.forEach(function(f){
        var sColor=f.severity==='CRITICAL'?'#ef4444':f.severity==='HIGH'?'#f97316':f.severity==='MEDIUM'?'#eab308':'#3b82f6';
        bh+='<li style="font-size:10px;color:var(--text-secondary);margin:3px 0"><span style="font-size:8px;font-weight:700;padding:1px 4px;border-radius:2px;background:rgba(0,0,0,.2);color:'+sColor+';margin-right:4px">'+f.severity+'</span>'+_escHtml(f.message)+'</li>';
      });
      bh+='</ul></div>';
    }
    bh+='</td></tr>';
  });
  bh+='</tbody></table>';
  body.innerHTML=bh;
  body.scrollTop=0;
  // Footer
  var fh='<button id="govExportCSV">Export CSV</button>';
  fh+='<button id="govExportJSON">Export JSON</button>';
  fh+='<span style="margin-left:auto;font-size:10px;color:var(--text-muted)">'+items.length+' of '+_iamReviewData.length+'</span>';
  if(totalPages>1){
    fh+='<button id="govPrev"'+(st.page<=1?' disabled':'')+'>← Prev</button>';
    fh+='<span style="font-size:10px;color:var(--text-muted)">Page '+st.page+' of '+totalPages+'</span>';
    fh+='<button id="govNext"'+(st.page>=totalPages?' disabled':'')+'>Next →</button>';
  }
  footer.innerHTML=fh;
  // Wire body/footer events (these get recreated each render)
  if(document.getElementById('govPrev')) document.getElementById('govPrev').addEventListener('click',function(){st.page--;_renderIAMTab()});
  if(document.getElementById('govNext')) document.getElementById('govNext').addEventListener('click',function(){st.page++;_renderIAMTab()});
  // Sort headers
  body.querySelectorAll('th[data-sort-col]').forEach(function(th){
    th.addEventListener('click',function(){
      var col=this.dataset.sortCol;
      if(st.sort===col) st.sortDir=st.sortDir==='asc'?'desc':'asc';
      else{st.sort=col;st.sortDir='asc'}
      st.page=1;_renderIAMTab();
    });
  });
  // Row expand/collapse
  body.querySelectorAll('tr[data-iam-row]').forEach(function(tr){
    tr.addEventListener('click',function(){
      var rowId=this.dataset.iamRow;
      var exp=document.getElementById(rowId+'-exp');
      if(!exp)return;
      var isOpen=exp.classList.contains('open');
      body.querySelectorAll('.gov-iam-expand').forEach(function(e){e.classList.remove('open')});
      body.querySelectorAll('tr[data-iam-row]').forEach(function(r){r.classList.remove('expanded')});
      if(!isOpen){exp.classList.add('open');this.classList.add('expanded')}
    });
  });
  // Export
  document.getElementById('govExportCSV').addEventListener('click',function(){
    var rows=[['Name','Type','ARN','Created','Last Used','Policies','Admin','Findings','Cross-Account']];
    items.forEach(function(r){rows.push([r.name,r.type,r.arn,r.created?r.created.toISOString():'',r.lastUsed?r.lastUsed.toISOString():'',r.policies,r.isAdmin?'Yes':'No',r.findings.length,r.crossAccounts.join(';')])});
    var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"'}).join(',')}).join('\n');
    downloadBlob(new Blob([csv],{type:'text/csv'}),'iam-review.csv');
  });
  document.getElementById('govExportJSON').addEventListener('click',function(){
    downloadBlob(new Blob([JSON.stringify(items.map(function(r){return{name:r.name,type:r.type,arn:r.arn,created:r.created,lastUsed:r.lastUsed,isAdmin:r.isAdmin,policies:r.policies,policyNames:r.policyNames,crossAccounts:r.crossAccounts,findingCount:r.findings.length}}),null,2)],{type:'application/json'}),'iam-review.json');
  });
}

// Rules editor overlay
function _openRulesEditor(){
  var existing=document.getElementById('govRulesOverlay');
  if(existing) existing.remove();
  // Working copy of rules
  var workRules=JSON.parse(JSON.stringify(_classificationRules));
  workRules.forEach(function(r){if(r.enabled===undefined) r.enabled=true});
  var groupCollapsed={vpc:false,type:false,name:false};
  var scopeLabels={vpc:'VPC Name Rules',type:'Resource Type Rules',name:'Instance Name Rules'};
  var scopeOrder=['vpc','type','name'];
  var overlay=document.createElement('div');
  overlay.id='govRulesOverlay';
  overlay.className='gov-rules-overlay';

  function readRulesFromDom(){
    var rules=[];
    overlay.querySelectorAll('.gov-rule-row[data-rule-idx]').forEach(function(row){
      var idx=parseInt(row.dataset.ruleIdx);
      var r=workRules[idx];if(!r) return;
      r.pattern=row.querySelector('[data-field="pattern"]').value;
      r.scope=row.querySelector('[data-field="scope"]').value;
      r.tier=row.querySelector('[data-field="tier"]').value;
      r.weight=parseInt(row.querySelector('[data-field="weight"]').value)||0;
    });
    return workRules;
  }
  function countMatches(rule){
    if(!rule.pattern||rule.enabled===false) return 0;
    var re;try{re=new RegExp(rule.pattern,'i')}catch(e){return -1}
    var ct=0;
    (_classificationData||[]).forEach(function(res){
      var text='';
      if(rule.scope==='vpc') text=res.vpcName||'';
      else if(rule.scope==='type') text=res.type||'';
      else if(rule.scope==='name') text=res.name||'';
      if(re.test(text)) ct++;
    });
    return ct;
  }
  function buildPreview(rules){
    if(!_rlCtx) return {critical:0,high:0,medium:0,low:0,samples:[]};
    var counts={critical:0,high:0,medium:0,low:0};
    var samples=[];
    var vpcNameMap={};
    (_rlCtx.vpcs||[]).forEach(function(v){vpcNameMap[v.VpcId]=gn(v,v.VpcId)});
    function classify(name,type,vpcName,id){
      var tier=(_classificationOverrides[id]||_scoreClassification(name,type,vpcName,rules).tier);
      counts[tier]=(counts[tier]||0)+1;
      if(samples.length<12) samples.push({name:name,type:type,tier:tier});
    }
    (_rlCtx.instances||[]).forEach(function(inst){
      var name=inst.Tags?((inst.Tags.find(function(t){return t.Key==='Name'})||{}).Value||inst.InstanceId):inst.InstanceId;
      classify(name,'instance',vpcNameMap[inst.VpcId]||'',inst.InstanceId);
    });
    (_rlCtx.rdsInstances||[]).forEach(function(db){classify(db.DBInstanceIdentifier,'rds',vpcNameMap[(db.DBSubnetGroup||{}).VpcId]||'',db.DBInstanceIdentifier)});
    (_rlCtx.ecacheClusters||[]).forEach(function(ec){classify(ec.CacheClusterId,'elasticache','',ec.CacheClusterId)});
    (_rlCtx.albs||[]).forEach(function(alb){classify(alb.LoadBalancerName||'','alb',vpcNameMap[alb.VpcId]||'',alb.LoadBalancerName||'')});
    (_rlCtx.lambdaFns||[]).forEach(function(fn){classify(fn.FunctionName,'lambda',vpcNameMap[(fn.VpcConfig||{}).VpcId]||'',fn.FunctionName)});
    (_rlCtx.ecsServices||[]).forEach(function(svc){classify(svc.serviceName||'','ecs','',svc.serviceName||'')});
    (_rlCtx.redshiftClusters||[]).forEach(function(rs){classify(rs.ClusterIdentifier,'redshift',vpcNameMap[rs.VpcId]||'',rs.ClusterIdentifier)});
    return {critical:counts.critical,high:counts.high,medium:counts.medium,low:counts.low,total:counts.critical+counts.high+counts.medium+counts.low,samples:samples};
  }
  function renderPreview(){
    var el=document.getElementById('govRulesPreview');if(!el) return;
    var rules=readRulesFromDom();
    var p=buildPreview(rules);
    var total=p.total||1;
    var cur={critical:0,high:0,medium:0,low:0};
    _classificationData.forEach(function(r){cur[r.tier]=(cur[r.tier]||0)+1});
    var ph='<div class="gov-preview-card"><h5>Classification Distribution</h5><div class="gov-preview-bars">';
    [{k:'critical',l:'Critical',c:'#ef4444'},{k:'high',l:'High',c:'#f59e0b'},{k:'medium',l:'Medium',c:'#22d3ee'},{k:'low',l:'Low',c:'#64748b'}].forEach(function(d){
      var pct=Math.round((p[d.k]/total)*100);
      ph+='<div class="gov-preview-bar"><span class="gov-preview-bar-label" style="color:'+d.c+'">'+d.l+'</span>';
      ph+='<div class="gov-preview-bar-track"><div class="gov-preview-bar-fill" style="width:'+pct+'%;background:'+d.c+'"></div></div>';
      ph+='<span class="gov-preview-bar-ct">'+p[d.k]+'</span></div>';
    });
    ph+='</div></div>';
    // Delta from current
    var deltas=[];
    [{k:'critical',l:'Critical',c:'#ef4444'},{k:'high',l:'High',c:'#f59e0b'},{k:'medium',l:'Medium',c:'#22d3ee'},{k:'low',l:'Low',c:'#64748b'}].forEach(function(d){
      var diff=p[d.k]-(cur[d.k]||0);
      if(diff!==0) deltas.push('<span style="color:'+d.c+'">'+d.l+': <span class="'+(diff>0?'up':'down')+'">'+(diff>0?'+':'')+diff+'</span></span>');
    });
    if(deltas.length) ph+='<div class="gov-preview-delta">'+deltas.join(' &nbsp; ')+'</div>';
    else ph+='<div class="gov-preview-delta"><span class="same">No changes from current</span></div>';
    // Sample
    ph+='<div class="gov-preview-card" style="margin-top:10px"><h5>Sample Resources</h5><div class="gov-preview-sample">';
    p.samples.forEach(function(s){
      var tc=_TIER_RPO_RTO[s.tier]||{color:'#64748b'};
      ph+='<div class="gov-preview-sample-row"><span class="name">'+_escHtml(s.name)+'</span><span class="type">'+_escHtml(s.type)+'</span><span class="gov-tier-badge '+s.tier+'" style="font-size:8px;padding:1px 5px">'+s.tier+'</span></div>';
    });
    ph+='</div></div>';
    el.innerHTML=ph;
  }
  function renderRules(){
    var list=document.getElementById('govRulesList');if(!list) return;
    var h='';
    scopeOrder.forEach(function(scope){
      var rules=[];workRules.forEach(function(r,i){if(r.scope===scope) rules.push({rule:r,idx:i})});
      if(!rules.length&&scope!=='vpc') return;
      var collapsed=groupCollapsed[scope];
      h+='<div class="gov-rule-group" data-scope="'+scope+'">';
      h+='<div class="gov-rule-group-hdr" data-toggle-scope="'+scope+'"><span class="gov-rule-group-arrow'+(collapsed?' collapsed':'')+'">▼</span>';
      h+='<span class="gov-rule-group-label">'+(scopeLabels[scope]||scope)+'</span>';
      h+='<span class="gov-rule-group-count">'+rules.length+' rule'+(rules.length!==1?'s':'')+'</span></div>';
      h+='<div class="gov-rule-group-body'+(collapsed?' collapsed':'')+'" style="'+(collapsed?'max-height:0':'max-height:9999px')+'">';
      rules.forEach(function(d){
        var r=d.rule;var i=d.idx;
        var isValid=true;try{if(r.pattern) new RegExp(r.pattern,'i')}catch(e){isValid=false}
        var mc=countMatches(r);
        h+='<div class="gov-rule-row'+(r.enabled===false?' disabled':'')+((!isValid)?' invalid':'')+'" data-rule-idx="'+i+'">';
        h+='<span class="gov-rule-drag" title="Drag to reorder">⠿</span>';
        h+='<div class="gov-rule-toggle'+(r.enabled!==false?' on':'')+'" data-toggle-idx="'+i+'" title="'+(r.enabled!==false?'Enabled — click to disable':'Disabled — click to enable')+'"></div>';
        h+='<input class="pattern'+((!isValid)?' invalid-pattern':'')+'" type="text" value="'+_escHtml(r.pattern)+'" data-field="pattern" placeholder="regex pattern…" title="'+((!isValid)?'Invalid regex!':'Regex pattern')+'">';
        h+='<select data-field="scope" style="display:none"><option value="vpc"'+(r.scope==='vpc'?' selected':'')+'>VPC Name</option><option value="type"'+(r.scope==='type'?' selected':'')+'>Type</option><option value="name"'+(r.scope==='name'?' selected':'')+'>Name</option></select>';
        h+='<select data-field="tier"><option value="critical"'+(r.tier==='critical'?' selected':'')+'>Critical</option><option value="high"'+(r.tier==='high'?' selected':'')+'>High</option><option value="medium"'+(r.tier==='medium'?' selected':'')+'>Medium</option><option value="low"'+(r.tier==='low'?' selected':'')+'>Low</option></select>';
        h+='<input class="weight" type="number" value="'+r.weight+'" data-field="weight" title="Weight (higher wins)">';
        h+='<span class="gov-rule-match-ct'+(mc>0?' has-matches':'')+'" title="'+(mc<0?'Invalid regex':mc+' resources match')+'">'+((mc<0)?'!':mc)+'</span>';
        h+='<button class="gov-rule-del" data-del-idx="'+i+'" title="Delete rule">✕</button>';
        h+='</div>';
      });
      h+='<div style="padding:4px 0 8px 34px"><button class="gov-rule-add-scope" data-add-scope="'+scope+'" style="background:none;border:1px dashed var(--border);border-radius:3px;padding:3px 10px;font-size:9px;font-family:\'IBM Plex Mono\',monospace;color:var(--text-muted);cursor:pointer;transition:all .15s">+ Add '+((scopeLabels[scope]||scope).replace(' Rules',''))+' Rule</button></div>';
      h+='</div></div>';
    });
    list.innerHTML=h;
    wireRuleEvents();
  }
  function wireRuleEvents(){
    // Toggle enable/disable
    overlay.querySelectorAll('[data-toggle-idx]').forEach(function(el){
      el.addEventListener('click',function(){
        var idx=parseInt(this.dataset.toggleIdx);
        workRules[idx].enabled=workRules[idx].enabled===false?true:false;
        renderRules();renderPreview();
      });
    });
    // Delete
    overlay.querySelectorAll('[data-del-idx]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var idx=parseInt(this.dataset.delIdx);
        workRules.splice(idx,1);
        renderRules();renderPreview();
      });
    });
    // Group toggle
    overlay.querySelectorAll('[data-toggle-scope]').forEach(function(hdr){
      hdr.addEventListener('click',function(){
        var scope=this.dataset.toggleScope;
        groupCollapsed[scope]=!groupCollapsed[scope];
        renderRules();
      });
    });
    // Add rule per scope
    overlay.querySelectorAll('[data-add-scope]').forEach(function(btn){
      btn.addEventListener('click',function(){
        workRules.push({pattern:'',scope:this.dataset.addScope,tier:'medium',weight:50,enabled:true});
        renderRules();renderPreview();
      });
    });
    // Live preview on input change (debounced)
    var previewTimer;
    overlay.querySelectorAll('.gov-rule-row input,.gov-rule-row select').forEach(function(el){
      el.addEventListener('input',function(){
        var row=this.closest('.gov-rule-row');
        var idx=parseInt(row.dataset.ruleIdx);
        var field=this.dataset.field;
        if(field==='pattern'){
          workRules[idx].pattern=this.value;
          var valid=true;try{if(this.value) new RegExp(this.value,'i')}catch(e){valid=false}
          this.classList.toggle('invalid-pattern',!valid);
          row.classList.toggle('invalid',!valid);
          // Update match count inline
          var mc=countMatches(workRules[idx]);
          var mcEl=row.querySelector('.gov-rule-match-ct');
          if(mcEl){mcEl.textContent=mc<0?'!':mc;mcEl.classList.toggle('has-matches',mc>0)}
        } else if(field==='tier'){
          workRules[idx].tier=this.value;
        } else if(field==='weight'){
          workRules[idx].weight=parseInt(this.value)||0;
        }
        clearTimeout(previewTimer);
        previewTimer=setTimeout(renderPreview,300);
      });
      el.addEventListener('change',function(){
        var row=this.closest('.gov-rule-row');
        var idx=parseInt(row.dataset.ruleIdx);
        var field=this.dataset.field;
        if(field==='tier') workRules[idx].tier=this.value;
        else if(field==='weight') workRules[idx].weight=parseInt(this.value)||0;
        clearTimeout(previewTimer);
        previewTimer=setTimeout(renderPreview,150);
      });
    });
  }

  // Build shell
  var h='<div class="gov-rules-panel">';
  h+='<div class="gov-rules-hdr"><h3>Classification Rules</h3>';
  h+='<div class="gov-rules-hdr-actions">';
  h+='<button id="govRulesImport" title="Import rules from JSON">Import</button>';
  h+='<button id="govRulesExport" title="Export rules as JSON">Export</button>';
  h+='<button id="govRulesClose">Close</button>';
  h+='</div></div>';
  h+='<div class="gov-rules-content">';
  h+='<div class="gov-rules-left"><p style="font-size:10px;color:var(--text-muted);margin:0 0 12px;line-height:1.5">Regex patterns matched against scope. Higher weight wins when multiple rules match. Toggle rules on/off to test without deleting.</p>';
  h+='<div id="govRulesList"></div></div>';
  h+='<div class="gov-rules-right"><h4>Live Preview</h4><div id="govRulesPreview"></div></div>';
  h+='</div>';
  h+='<div class="gov-rules-foot">';
  h+='<button id="govRuleReset">Reset to Defaults</button>';
  h+='<button class="gov-rules-apply" id="govRuleApply">Apply & Re-classify</button>';
  h+='</div></div>';
  overlay.innerHTML=h;
  document.body.appendChild(overlay);
  // Render initial state
  renderRules();
  renderPreview();
  // Shell events
  document.getElementById('govRulesClose').addEventListener('click',function(){overlay.remove()});
  overlay.addEventListener('click',function(e){if(e.target===overlay) overlay.remove()});
  document.getElementById('govRuleReset').addEventListener('click',function(){
    workRules=JSON.parse(JSON.stringify(_DEFAULT_CLASS_RULES));
    workRules.forEach(function(r){r.enabled=true});
    renderRules();renderPreview();
  });
  document.getElementById('govRulesExport').addEventListener('click',function(){
    readRulesFromDom();
    var json=JSON.stringify(workRules,null,2);
    downloadBlob(new Blob([json],{type:'application/json'}),'classification-rules.json');
    _showToast('Rules exported');
  });
  document.getElementById('govRulesImport').addEventListener('click',function(){
    var inp=document.createElement('input');inp.type='file';inp.accept='.json';
    inp.addEventListener('change',function(){
      if(!this.files[0]) return;
      var reader=new FileReader();
      reader.onload=function(e){
        try{
          var imported=JSON.parse(e.target.result);
          if(!Array.isArray(imported)){_showToast('Invalid rules file','warn');return}
          workRules=imported;
          workRules.forEach(function(r){if(r.enabled===undefined) r.enabled=true});
          renderRules();renderPreview();
          _showToast(imported.length+' rules imported');
        }catch(err){_showToast('Failed to parse JSON','warn')}
      };
      reader.readAsText(this.files[0]);
    });
    inp.click();
  });
  document.getElementById('govRuleApply').addEventListener('click',function(){
    readRulesFromDom();
    _classificationRules=workRules.filter(function(r){return r.pattern});
    _classificationOverrides={};
    runClassificationEngine(_rlCtx);
    _govToolbarTab=null;
    overlay.remove();
    _renderClassificationTab();
    _showToast('Rules applied — '+_classificationData.length+' resources re-classified');
  });
}

// Governance event listeners
document.getElementById('govBtn').addEventListener('click',function(){openUnifiedDash('classification')});

