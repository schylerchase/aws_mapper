// Network topology visualization and D3 graph rendering
// Handles VPC diagram layout, subnet positioning, and resource visualization
// Extracted from index.html for modularization

function renderMap(cb){
  if(_renderMapTimer){clearTimeout(_renderMapTimer);_renderMapTimer=null}
  const overlay=document.getElementById('loadingOverlay');
  overlay.style.display='flex';
  _renderMapTimer=setTimeout(()=>{
    _renderMapTimer=null;
    requestAnimationFrame(()=>{requestAnimationFrame(()=>{_renderMapInner();overlay.style.display='none';if(typeof cb==='function')cb()})});
  },50);
}
function _renderMapInner(){
  try{
  const svg=d3.select('#mapSvg');svg.selectAll('*').remove();svg.style('display','block');
  // SVG filter to prevent alpha stacking in route groups
  const defs=svg.append('defs');
  defs.append('filter').attr('id','alphaClamp')
    .append('feComponentTransfer')
    .append('feFuncA').attr('type','table').attr('tableValues','0 1 1 1');
  document.getElementById('emptyState').style.display='none';
  document.getElementById('landingDash').style.display='none';

  // parse all 18 inputs (cached — skips JSON.parse if textarea unchanged)
  let vpcs=ext(_cachedParse('in_vpcs'),['Vpcs']);
  let subnets=ext(_cachedParse('in_subnets'),['Subnets']);
  let rts=ext(_cachedParse('in_rts'),['RouteTables']);
  let sgs=ext(_cachedParse('in_sgs'),['SecurityGroups']);
  let nacls=ext(_cachedParse('in_nacls'),['NetworkAcls']);
  let enis=ext(_cachedParse('in_enis'),['NetworkInterfaces']);
  let igws=ext(_cachedParse('in_igws'),['InternetGateways']);
  let nats=ext(_cachedParse('in_nats'),['NatGateways']);
  let vpces=ext(_cachedParse('in_vpces'),['VpcEndpoints']);
  let instances=[];
  const eRaw=_cachedParse('in_ec2');
  if(eRaw){
    const reservations=ext(eRaw,['Reservations']);
    if(reservations.length){reservations.forEach(r=>{if(r.Instances)instances=instances.concat(r.Instances);else if(r.InstanceId)instances.push(r)})}
    else{
      // fallback: {Instances:[...]} or bare array of instances
      const flat=ext(eRaw,['Instances']);
      if(flat.length)instances=flat;
      else{const arr=Array.isArray(eRaw)?eRaw:[eRaw];arr.forEach(x=>{if(x.InstanceId)instances.push(x)})}
    }
  }
  let albs=ext(_cachedParse('in_albs'),['LoadBalancers']);
  let tgs=ext(_cachedParse('in_tgs'),['TargetGroups']);
  let peerings=ext(_cachedParse('in_peer'),['VpcPeeringConnections']);
  let vpns=ext(_cachedParse('in_vpn'),['VpnConnections']);
  let volumes=ext(_cachedParse('in_vols'),['Volumes']);
  let snapshots=ext(_cachedParse('in_snaps'),['Snapshots']);
  let s3raw=_cachedParse('in_s3');let s3bk=s3raw?ext(s3raw,['Buckets']):[];
  let zones=ext(_cachedParse('in_r53'),['HostedZones']);
  const allRecSets=ext(_cachedParse('in_r53records'),['ResourceRecordSets','RecordSets']);
  const recsByZoneMap={};
  allRecSets.forEach(r=>{if(r.HostedZoneId)(recsByZoneMap[r.HostedZoneId]=recsByZoneMap[r.HostedZoneId]||[]).push(r)});
  let wafAcls=ext(_cachedParse('in_waf'),['WebACLs']);
  let rdsInstances=ext(_cachedParse('in_rds'),['DBInstances']);
  let ecsServices=ext(_cachedParse('in_ecs'),['services','Services']);
  let lambdaFns=(ext(_cachedParse('in_lambda'),['Functions'])).filter(f=>f.VpcConfig&&f.VpcConfig.VpcId);
  let ecacheClusters=ext(_cachedParse('in_elasticache'),['CacheClusters']);
  let redshiftClusters=ext(_cachedParse('in_redshift'),['Clusters']);
  let tgwAttachments=ext(_cachedParse('in_tgwatt'),['TransitGatewayAttachments']);
  let cfDistributions=[];
  const cfRaw=_cachedParse('in_cf');
  if(cfRaw){const dl=cfRaw.DistributionList||cfRaw;cfDistributions=dl.Items||dl.Distributions||[];}
  // Parse IAM data
  const iamRaw=_cachedParse('in_iam');
  if(iamRaw&&!_iamData)_iamData=parseIAMData(iamRaw);

  // Multi-account: tag all resources with account ID
  const userAccount=(document.getElementById('accountLabel')||{}).value||'';
  function tagAccount(resource){
    if(!resource)return resource;
    resource._accountId=detectAccountId(resource)||userAccount||'default';
    return resource;
  }
  vpcs.forEach(tagAccount);subnets.forEach(tagAccount);igws.forEach(tagAccount);nats.forEach(tagAccount);
  sgs.forEach(tagAccount);instances.forEach(tagAccount);albs.forEach(tagAccount);rdsInstances.forEach(tagAccount);
  ecsServices.forEach(tagAccount);lambdaFns.forEach(tagAccount);peerings.forEach(tagAccount);
  // Multi-region: tag all resources with region
  function tagRegion(resource){
    if(!resource)return resource;
    resource._region=detectRegion(resource)||'unknown';
    return resource;
  }
  vpcs.forEach(tagRegion);subnets.forEach(tagRegion);igws.forEach(tagRegion);nats.forEach(tagRegion);
  sgs.forEach(tagRegion);instances.forEach(tagRegion);albs.forEach(tagRegion);rdsInstances.forEach(tagRegion);
  ecsServices.forEach(tagRegion);lambdaFns.forEach(tagRegion);peerings.forEach(tagRegion);
  const _regions=new Set();vpcs.forEach(v=>{if(v._region&&v._region!=='unknown')_regions.add(v._region)});
  const _multiRegion=_regions.size>1;
  // Deduplicate: if same VpcId from same account, keep last pasted
  const seenVpcs=new Map();const vpcDupes=[];
  vpcs.forEach(v=>{const key=v._accountId+':'+v.VpcId;if(seenVpcs.has(key))vpcDupes.push(v.VpcId);seenVpcs.set(key,v)});
  if(vpcDupes.length)console.warn('Duplicate VPCs detected (kept latest):',vpcDupes);
  vpcs=[...seenVpcs.values()];
  // Collect unique accounts for rendering
  const _accounts=new Set();vpcs.forEach(v=>{if(v._accountId&&v._accountId!=='default')_accounts.add(v._accountId)});
  const _multiAccount=_accounts.size>1;

  if(!vpcs.length&&!subnets.length){
    if(_designMode){
      // Show design-aware empty state
      document.getElementById('landingDash').style.display='none';
      document.getElementById('emptyState').style.display='flex';
      document.getElementById('emptyTitle').textContent='Design Mode';
      document.getElementById('emptyDesc').textContent='No infrastructure loaded — create your first VPC to start designing';
      const eBtn=document.getElementById('emptyDesignBtn');
      eBtn.style.display='inline-block';
      eBtn.onclick=function(){showDesignForm('add_vpc',{})};
      svg.style('display','none');return;
    }
    document.getElementById('emptyTitle').textContent='No data loaded';
    document.getElementById('emptyDesc').textContent='Paste AWS CLI JSON exports and click Render Map';
    document.getElementById('emptyDesignBtn').style.display='none';
    document.getElementById('emptyState').style.display='none';document.getElementById('landingDash').style.display='flex';svg.style('display','none');return;
  }

  // lookups
  const subByVpc={};subnets.forEach(s=>(subByVpc[s.VpcId]=subByVpc[s.VpcId]||[]).push(s));
  const pubSubs=new Set(),subRT={},gwSet=new Map();

  // gateway name enrichment from dedicated JSON
  gwNames={};
  igws.forEach(g=>{gwNames[g.InternetGatewayId]=gn(g,g.InternetGatewayId)});
  nats.forEach(g=>{gwNames[g.NatGatewayId]=gn(g,g.NatGatewayId)});
  vpces.forEach(g=>{gwNames[g.VpcEndpointId]=gn(g,g.VpcEndpointId)});
  vpns.forEach(g=>{if(g.VpnGatewayId) gwNames[g.VpnGatewayId]=gn(g,g.VpnGatewayId)});
  peerings.forEach(g=>{gwNames[g.VpcPeeringConnectionId]=gn(g,g.VpcPeeringConnectionId)});
  tgwAttachments.forEach(g=>{if(g.TransitGatewayId&&!gwNames[g.TransitGatewayId]) gwNames[g.TransitGatewayId]=gn(g,g.TransitGatewayId)});

  // Build Main route table fallback per VPC
  const mainRT={};
  rts.forEach(rt=>{
    if((rt.Associations||[]).some(a=>a.Main)) mainRT[rt.VpcId]=rt;
  });

  // discover gateways from route tables
  rts.forEach(rt=>{
    const hasIgw=(rt.Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('igw-')&&r.State!=='blackhole');
    (rt.Associations||[]).forEach(a=>{if(a.SubnetId){subRT[a.SubnetId]=rt;if(hasIgw)pubSubs.add(a.SubnetId)}});
    (rt.Routes||[]).forEach(r=>{
      if(r.GatewayId&&r.GatewayId!=='local')gwSet.set(r.GatewayId,{type:clsGw(r.GatewayId),id:r.GatewayId,vpcId:rt.VpcId});
      if(r.NatGatewayId)gwSet.set(r.NatGatewayId,{type:'NAT',id:r.NatGatewayId,vpcId:rt.VpcId});
      if(r.TransitGatewayId)gwSet.set(r.TransitGatewayId,{type:'TGW',id:r.TransitGatewayId,vpcId:'shared'});
      if(r.VpcPeeringConnectionId)gwSet.set(r.VpcPeeringConnectionId,{type:'PCX',id:r.VpcPeeringConnectionId,vpcId:'shared'});
    });
  });

  // also pull gateways from dedicated JSON even if not in route tables
  igws.forEach(g=>{if(!gwSet.has(g.InternetGatewayId)){const v=(g.Attachments||[])[0];gwSet.set(g.InternetGatewayId,{type:'IGW',id:g.InternetGatewayId,vpcId:v?v.VpcId:'unk'})}});
  nats.forEach(g=>{if(!gwSet.has(g.NatGatewayId))gwSet.set(g.NatGatewayId,{type:'NAT',id:g.NatGatewayId,vpcId:g.VpcId||'unk'})});
  vpces.forEach(g=>{if(!gwSet.has(g.VpcEndpointId)){const t=g.VpcEndpointType==='Gateway'?'VPCE':'VPCE';gwSet.set(g.VpcEndpointId,{type:'VPCE',id:g.VpcEndpointId,vpcId:g.VpcId||'unk'})}});

  // Assign Main route table to subnets without explicit associations
  subnets.forEach(s=>{
    if(!subRT[s.SubnetId]&&mainRT[s.VpcId]){
      subRT[s.SubnetId]=mainRT[s.VpcId];
      const hasIgw=(mainRT[s.VpcId].Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('igw-')&&r.State!=='blackhole');
      if(hasIgw)pubSubs.add(s.SubnetId);
    }
  });

  const subNacl={};nacls.forEach(n=>(n.Associations||[]).forEach(a=>{if(a.SubnetId)subNacl[a.SubnetId]=n}));
  const sgByVpc={};sgs.forEach(sg=>(sgByVpc[sg.VpcId]=sgByVpc[sg.VpcId]||[]).push(sg));
  // IAM role -> resource cross-references
  const iamRoleResources={};
  if(_iamData){
    (instances||[]).forEach(i=>{const pa=i.IamInstanceProfile?.Arn;if(pa){const rn=pa.split('/').pop();if(!iamRoleResources[rn])iamRoleResources[rn]={ec2:[],lambda:[],ecs:[]};iamRoleResources[rn].ec2.push(i)}});
    (lambdaFns||[]).forEach(fn=>{if(fn.Role){const rn=fn.Role.split('/').pop();if(!iamRoleResources[rn])iamRoleResources[rn]={ec2:[],lambda:[],ecs:[]};iamRoleResources[rn].lambda.push(fn)}});
    (ecsServices||[]).forEach(svc=>{const ra=svc.taskRoleArn||svc.executionRoleArn;if(ra){const rn=ra.split('/').pop();if(!iamRoleResources[rn])iamRoleResources[rn]={ec2:[],lambda:[],ecs:[]};iamRoleResources[rn].ecs.push(svc)}});
  }
  const instBySub={};instances.forEach(i=>{if(i.SubnetId)(instBySub[i.SubnetId]=instBySub[i.SubnetId]||[]).push(i)});
  const eniBySub={};const eniByInst={};enis.forEach(e=>{if(e.SubnetId)(eniBySub[e.SubnetId]=eniBySub[e.SubnetId]||[]).push(e);if(e.Attachment&&e.Attachment.InstanceId)(eniByInst[e.Attachment.InstanceId]=eniByInst[e.Attachment.InstanceId]||[]).push(e)});
  const albBySub={};albs.forEach(lb=>{(lb.AvailabilityZones||[]).forEach(az=>{if(az.SubnetId)(albBySub[az.SubnetId]=albBySub[az.SubnetId]||[]).push(lb)})});

  // volumes per instance
  const volByInst={};volumes.forEach(v=>{(v.Attachments||[]).forEach(a=>{if(a.InstanceId)(volByInst[a.InstanceId]=volByInst[a.InstanceId]||[]).push(v)})});

  // volumes by subnet (via ENI InstanceId->SubnetId for volumes whose instance isn't in EC2 data)
  const knownInstIds=new Set(instances.map(i=>i.InstanceId));
  const instSubFromEni={};enis.forEach(e=>{if(e.SubnetId&&e.Attachment&&e.Attachment.InstanceId)instSubFromEni[e.Attachment.InstanceId]=e.SubnetId});
  const volBySub={};volumes.forEach(v=>{
    const att=(v.Attachments||[])[0];
    if(att&&att.InstanceId){
      if(knownInstIds.has(att.InstanceId))return; // rendered as EC2 child
      const sid=instSubFromEni[att.InstanceId];
      if(sid)(volBySub[sid]=volBySub[sid]||[]).push(v);
    }
  });

  // snapshots per volume
  const snapByVol={};snapshots.forEach(s=>{if(s.VolumeId)(snapByVol[s.VolumeId]=snapByVol[s.VolumeId]||[]).push(s)});

  // target groups per ALB (by ARN)
  const tgByAlb={};tgs.forEach(tg=>{(tg.LoadBalancerArns||[]).forEach(arn=>{(tgByAlb[arn]=tgByAlb[arn]||[]).push(tg)})});

  // WAF WebACLs per ALB (by ARN)
  const wafByAlb={};wafAcls.forEach(acl=>{(acl.ResourceArns||[]).forEach(arn=>{(wafByAlb[arn]=wafByAlb[arn]||[]).push(acl)})});

  // RDS by subnet
  const rdsBySub={};rdsInstances.forEach(db=>{
    const sg=db.DBSubnetGroup;if(!sg)return;
    (sg.Subnets||[]).forEach(s=>{if(s.SubnetIdentifier)(rdsBySub[s.SubnetIdentifier]=rdsBySub[s.SubnetIdentifier]||[]).push(db)});
  });

  // ECS by subnet
  const ecsBySub={};ecsServices.forEach(svc=>{
    const nc=svc.networkConfiguration?.awsvpcConfiguration;if(!nc)return;
    (nc.subnets||[]).forEach(sid=>{(ecsBySub[sid]=ecsBySub[sid]||[]).push(svc)});
  });

  // Lambda by subnet
  const lambdaBySub={};lambdaFns.forEach(fn=>{
    (fn.VpcConfig?.SubnetIds||[]).forEach(sid=>{(lambdaBySub[sid]=lambdaBySub[sid]||[]).push(fn)});
  });

  // ElastiCache by VPC
  const ecacheByVpc={};ecacheClusters.forEach(c=>{if(c.VpcId)(ecacheByVpc[c.VpcId]=ecacheByVpc[c.VpcId]||[]).push(c)});

  // Redshift by VPC
  const redshiftByVpc={};redshiftClusters.forEach(c=>{if(c.VpcId)(redshiftByVpc[c.VpcId]=redshiftByVpc[c.VpcId]||[]).push(c)});

  // CloudFront origins mapped to ALB ARNs
  const cfByAlb={};cfDistributions.forEach(d=>{
    (d.Origins?.Items||[]).forEach(o=>{
      const matchAlb=albs.find(a=>a.DNSName&&o.DomainName&&o.DomainName.includes(a.DNSName));
      if(matchAlb)(cfByAlb[matchAlb.LoadBalancerArn]=cfByAlb[matchAlb.LoadBalancerArn]||[]).push(d);
    });
  });

  // separate per-VPC vs shared gateways; VPCEs always go to summary only
  const pvGws={},shGws=[],vpceByVpc={},vpceIds=new Set();
  [...gwSet.values()].forEach(gw=>{
    if(gw.type==='VPCE'){(vpceByVpc[gw.vpcId]=vpceByVpc[gw.vpcId]||[]).push(gw);vpceIds.add(gw.id);return}
    if(isShared(gw.type)){if(!shGws.find(g=>g.id===gw.id))shGws.push(gw)}
    else(pvGws[gw.vpcId]=pvGws[gw.vpcId]||[]).push(gw);
  });

  // Check layout mode
  const layoutMode=document.getElementById('layoutMode')?.value||'grid';
  
  if(layoutMode==='landingzone'){
    // LANDING ZONE HUB-SPOKE LAYOUT
    renderLandingZoneMap({
      vpcs,subnets,rts,sgs,nacls,enis,igws,nats,vpces,instances,albs,tgs,peerings,vpns,volumes,snapshots,s3bk,zones,
      subByVpc,pubSubs,subRT,gwSet,subNacl,sgByVpc,instBySub,eniBySub,albBySub,volByInst,volBySub,pvGws,shGws,vpceByVpc,vpceIds,gwNames,
      snapByVol,tgByAlb,wafAcls,wafByAlb,
      rdsInstances,ecsServices,lambdaFns,ecacheClusters,redshiftClusters,tgwAttachments,cfDistributions,
      rdsBySub,ecsBySub,lambdaBySub,ecacheByVpc,redshiftByVpc,cfByAlb,_multiAccount,_accounts,iamRoleResources
    });
    return;
  }
  
  if(layoutMode==='executive'){
    renderExecutiveOverview({
      vpcs,subnets,rts,sgs,nacls,enis,igws,nats,vpces,instances,albs,tgs,peerings,vpns,volumes,snapshots,s3bk,zones,
      subByVpc,pubSubs,subRT,gwSet,subNacl,sgByVpc,instBySub,eniBySub,albBySub,volByInst,pvGws,shGws,vpceByVpc,vpceIds,gwNames,
      snapByVol,tgByAlb,wafAcls,wafByAlb,
      rdsInstances,ecsServices,lambdaFns,ecacheClusters,redshiftClusters,tgwAttachments,cfDistributions,
      rdsBySub,ecsBySub,lambdaBySub,ecacheByVpc,redshiftByVpc,cfByAlb
    });
    return;
  }

  // GRID LAYOUT (original)

  // layout constants
  const SH_BASE=52,SG=12,VP=30,VH=40,GR=20,MSW=240,CW=6.5;
  const RES_ICON=26,RES_CHILD_H=11,RES_GAP=4,RES_COLS=2,RES_TOP=36,RES_BOT=12;
  
  // Tree context for buildResTree
  const treeCtx={instBySub,albBySub,rdsBySub,ecsBySub,lambdaBySub,volByInst,volBySub,enis,eniByInst,tgByAlb,wafByAlb,cfByAlb,snapByVol,eniBySub};
  
  // Pre-calc resource tree per subnet for sizing
  const subTrees={};
  subnets.forEach(s=>{
    subTrees[s.SubnetId]=buildResTree(s.SubnetId,treeCtx);
  });
  function subHeight(sid2){
    if(_detailLevel===0) return SH_BASE;
    const tree=subTrees[sid2]||[];
    if(!tree.length) return SH_BASE;
    const maxCh=Math.max(0,...tree.map(r=>(r.children||[]).length));
    const tallest=RES_ICON+maxCh*RES_CHILD_H;
    const rowH=tallest+6;
    const rows=Math.ceil(tree.length/RES_COLS);
    return Math.max(SH_BASE, RES_TOP+rows*rowH+RES_BOT+4);
  }
  
  const vSW={};
  vpcs.forEach(v=>{
    const ss=subByVpc[v.VpcId]||[];
    const vpcNameLen=(gn(v,v.VpcId).length+2)*CW+30;
    const cidrLen=((v.CidrBlock||'').length+15)*CW+20;
    let mx=Math.max(MSW,vpcNameLen+cidrLen);
    ss.forEach(s=>{
      const nameW=gn(s,s.SubnetId).length*CW+100;
      if(_detailLevel>0){
        const resCols=Math.min((subTrees[s.SubnetId]||[]).length, RES_COLS);
        const resW=resCols*(RES_ICON+RES_GAP+80)+50;
        mx=Math.max(mx,nameW,resW);
      } else {
        mx=Math.max(mx,nameW);
      }
    });
    vSW[v.VpcId]=Math.min(mx,600);
  });

  const getVpcRegion=(v)=>{
    const ss=subByVpc[v.VpcId]||[];
    const az=ss.find(s=>s.AvailabilityZone)?.AvailabilityZone||'';
    return az.replace(/[a-z]$/,'')||'unknown';
  };
  const knownVpcs=vpcs.filter(v=>getVpcRegion(v)!=='unknown');
  const unknownVpcs=vpcs.filter(v=>getVpcRegion(v)==='unknown');
  
  knownVpcs.sort((a,b)=>{
    const rc=getVpcRegion(a).localeCompare(getVpcRegion(b));
    if(rc!==0)return rc;
    const ac=(a._accountId||'').localeCompare(b._accountId||'');
    if(ac!==0)return ac;
    return (a.VpcId||'').localeCompare(b.VpcId||'');
  });

  const GC_BASE=140;
  const vL=[];let cx=60;
  
  // Calculate VPC height with dynamic subnet sizes
  const AZ_HDR=16; // height for AZ separator label
  function sortByAZ(ss){return ss.slice().sort((a,b)=>(a.AvailabilityZone||'').localeCompare(b.AvailabilityZone||''))}
  function countAZHeaders(ss){const azs=new Set();ss.forEach(s=>{if(s.AvailabilityZone)azs.add(s.AvailabilityZone)});return Math.max(0,azs.size-1)}
  function calcVpcHeight(ss){
    let ih=0;
    const sorted=sortByAZ(ss);
    sorted.forEach((s,i)=>{ih+=subHeight(s.SubnetId)+(i<sorted.length-1?SG:0)});
    ih+=countAZHeaders(sorted)*(AZ_HDR+SG);
    return Math.max(ih+VP*2+VH+30,150);
  }

  // Build subnet layout with cumulative Y positions, grouped by AZ
  function buildSubLayouts(ss,baseX,baseY,sw){
    const layouts=[];
    const sorted=sortByAZ(ss);
    let cy=baseY+VH+VP;
    let lastAZ=null;
    sorted.forEach(s=>{
      const az=s.AvailabilityZone||'';
      if(az&&lastAZ!==null&&az!==lastAZ){cy+=AZ_HDR+SG;layouts.push({azLabel:az,x:baseX+VP,y:cy-AZ_HDR-SG/2,w:sw})}
      else if(az&&lastAZ===null&&sorted.filter(x=>x.AvailabilityZone).length>1){layouts.push({azLabel:az,x:baseX+VP,y:cy-2,w:sw});cy+=AZ_HDR}
      lastAZ=az;
      const sh=subHeight(s.SubnetId);
      layouts.push({sub:s,x:baseX+VP,y:cy,w:sw,h:sh,pub:pubSubs.has(s.SubnetId)});
      cy+=sh+SG;
    });
    return layouts;
  }
  
  const REGION_GAP=120;
  let _prevLayoutRegion=null;
  knownVpcs.forEach((vpc,idx)=>{
    const _vpcRegion=getVpcRegion(vpc);
    if(_prevLayoutRegion&&_vpcRegion!==_prevLayoutRegion&&_multiRegion)cx+=REGION_GAP;
    _prevLayoutRegion=_vpcRegion;
    const ss=subByVpc[vpc.VpcId]||[];
    const sw=vSW[vpc.VpcId]||MSW;
    const vw=sw+VP*2,vh=calcVpcHeight(ss);
    const routingGws=(pvGws[vpc.VpcId]||[]);
    let maxGwNameW=0;
    routingGws.forEach(gw=>{
      const nm=gwNames[gw.id]||sid(gw.id);
      maxGwNameW=Math.max(maxGwNameW,nm.length*6+40);
    });
    const chanW=Math.max(GC_BASE,routingGws.length*55+50,maxGwNameW+60);
    const isLast=idx===knownVpcs.length-1&&knownVpcs.length>1;
    const gwSide=isLast?'left':'right';

    if(isLast){
      // Last VPC: put channel to the LEFT (gateways between this and previous VPC)
      vL.push({vpc,x:cx+chanW,y:80,w:vw,h:vh,sw,chanW,gwSide,
        subs:buildSubLayouts(ss,cx+chanW,80,sw)
      });
      cx+=chanW+vw;
    }else{
      vL.push({vpc,x:cx,y:80,w:vw,h:vh,sw,chanW,gwSide,
        subs:buildSubLayouts(ss,cx,80,sw)
      });
      cx+=vw+chanW;
    }
  });
  
  // Calculate row 2 Y position for unknown VPCs (below all known VPCs + shared gateways area)
  const maxKnownH=vL.length>0?Math.max(...vL.map(v=>v.h)):0;
  const unknownRowY=80+maxKnownH+320;
  let ux=60;
  
  unknownVpcs.forEach((vpc,idx)=>{
    const ss=subByVpc[vpc.VpcId]||[];
    const sw=vSW[vpc.VpcId]||MSW;
    const vw=sw+VP*2,vh=calcVpcHeight(ss);
    const routingGws=(pvGws[vpc.VpcId]||[]);
    let maxGwNameW=0;
    routingGws.forEach(gw=>{
      const nm=gwNames[gw.id]||sid(gw.id);
      maxGwNameW=Math.max(maxGwNameW,nm.length*6+40);
    });
    const chanW=Math.max(GC_BASE,routingGws.length*55+50,maxGwNameW+60);
    const isLast=idx===unknownVpcs.length-1&&unknownVpcs.length>1;
    const gwSide=isLast?'left':'right';

    if(isLast){
      vL.push({vpc,x:ux+chanW,y:unknownRowY,w:vw,h:vh,sw,chanW,gwSide,
        subs:buildSubLayouts(ss,ux+chanW,unknownRowY,sw)
      });
      ux+=chanW+vw;
    }else{
      vL.push({vpc,x:ux,y:unknownRowY,w:vw,h:vh,sw,chanW,gwSide,
        subs:buildSubLayouts(ss,ux,unknownRowY,sw)
      });
      ux+=vw+chanW;
    }
  });

  const W=document.querySelector('.main').clientWidth,H=document.querySelector('.main').clientHeight;
  
  // Center known VPCs (row 1)
  const knownVL=vL.filter(v=>getVpcRegion(v.vpc)!=='unknown');
  const unknownVL=vL.filter(v=>getVpcRegion(v.vpc)==='unknown');
  
  if(knownVL.length>0){
    const knownWidth=cx-60-GC_BASE;
    const offX=Math.max(0,(W-knownWidth)/2-60);
    knownVL.forEach(v=>{v.x+=offX;v.subs.forEach(s=>s.x+=offX)});
  }
  
  // Center unknown VPCs (row 2) independently
  if(unknownVL.length>0){
    const unknownWidth=ux-60-GC_BASE;
    const offX2=Math.max(0,(W-unknownWidth)/2-60);
    unknownVL.forEach(v=>{v.x+=offX2;v.subs.forEach(s=>s.x+=offX2)});
  }

  // Pre-pass: determine which subnets connect to each per-VPC gateway
  // This lets us position gateways near their connected subnets instead of at VPC bottom
  // Uses subRT (which includes Main route table fallback) for complete coverage
  const gwSubnetYs=new Map(); // gwId -> [subnet Y midpoints]
  const preAllS=vL.flatMap(v=>v.subs).filter(sl=>sl.sub);
  preAllS.forEach(sl=>{
    const rt=subRT[sl.sub.SubnetId];if(!rt)return;
    (rt.Routes||[]).forEach(r=>{
      if(r.GatewayId==='local')return;
      const tid=r.GatewayId||r.NatGatewayId||r.TransitGatewayId||r.VpcPeeringConnectionId;
      if(!tid||vpceIds.has(tid))return;
      if(!gwSubnetYs.has(tid))gwSubnetYs.set(tid,[]);
      gwSubnetYs.get(tid).push(sl.y+sl.h/2);
    });
  });

  // per-VPC gateways positioned near connected subnet centroid
  const gwP=new Map();
  const gwOrder={IGW:0,NAT:1,VGW:2,EIGW:3,LGW:4};
  vL.forEach(vl=>{
    const gs=[...(pvGws[vl.vpc.VpcId]||[])].sort((a,b)=>{const oa=gwOrder[a.type]??9,ob=gwOrder[b.type]??9;return oa-ob;});
    const gwOff=Math.max(60,Math.min(vl.chanW*0.7,120));
    const gx=vl.gwSide==='left'?(vl.x-gwOff):(vl.x+vl.w+gwOff);
    const minGap=GR*2+30; // minimum vertical gap between gateway circles (room for label below)

    // Compute ideal Y for each gateway at centroid of its connected subnets
    const gwYs=gs.map(gw=>{
      const subYs=gwSubnetYs.get(gw.id);
      if(subYs&&subYs.length>0){
        const avgY=subYs.reduce((a,b)=>a+b,0)/subYs.length;
        let gy=avgY;
        gy=Math.min(gy, vl.y+vl.h-GR-10);
        gy=Math.max(gy, vl.y+GR+20);
        return {gw,gy};
      }
      return {gw,gy:vl.y+vl.h-GR-10}; // fallback: near bottom
    });

    // Resolve overlaps: push later gateways down if too close
    for(let i=1;i<gwYs.length;i++){
      if(gwYs[i].gy-gwYs[i-1].gy<minGap){
        gwYs[i].gy=gwYs[i-1].gy+minGap;
      }
    }
    // Final clamp to VPC bounds (don't let pushed gateways escape VPC)
    gwYs.forEach(g=>{
      g.gy=Math.min(g.gy, vl.y+vl.h-GR-10);
      g.gy=Math.max(g.gy, vl.y+GR+20);
    });

    gwYs.forEach(({gw,gy})=>gwP.set(gw.id,{x:gx,y:gy,gw}));
  });

  // shared gateways below KNOWN VPCs only (not disconnected)
  const knownVpcBot=knownVL.length>0?Math.max(...knownVL.map(v=>v.y+v.h)):80;
  const lE=knownVL[0]?.x||0,rE=knownVL.length?knownVL[knownVL.length-1].x+knownVL[knownVL.length-1].w:W;
  const sCX=(lE+rE)/2,sY=knownVpcBot+80;
  const ssX=sCX-((shGws.length-1)*80)/2;
  shGws.forEach((gw,i)=>{gwP.set(gw.id,{x:ssX+i*80,y:sY,gw})});
  
  // Track the lowest Y used by routing elements (gateways, bus lanes, peering)
  let routingBottomY=shGws.length>0?(sY+GR+20):(knownVpcBot+20);

  // Disconnected VPCs will be repositioned after all routing is computed

  // internet node positioned far left, anchoring the NET bus bar
  // Only IGWs connect to NET bus bar; NATs have their own subnet route lines
  const iGwList=[...gwP.values()].filter(p=>p.gw.type==='IGW');
  const allVpcRight=Math.max(...vL.map(v=>v.gwSide==='left'?(v.x+v.w):(v.x+v.w+v.chanW)));
  const allVpcLeft=Math.min(...vL.map(v=>v.x));
  const allVpcTop=Math.min(...vL.map(v=>v.y));
  const allVpcBottom=Math.max(...vL.map(v=>v.y+v.h));
  // Position NET node left of all VPCs
  const iX=allVpcLeft-80;
  const iY=allVpcTop-100;

  const allS=vL.flatMap(v=>v.subs).filter(sl=>sl.sub);

  // trunk groups -- iterate subnets using subRT (includes Main route table fallback)
  const tG={};
  allS.forEach(sl=>{
    const rt=subRT[sl.sub.SubnetId];if(!rt)return;
    const ov=vL.find(v=>v.subs.includes(sl));if(!ov)return;
    (rt.Routes||[]).forEach(r=>{
      if(r.GatewayId==='local')return;
      const tid=r.GatewayId||r.NatGatewayId||r.TransitGatewayId||r.VpcPeeringConnectionId;
      if(!tid||!gwP.has(tid)||vpceIds.has(tid))return;
      const k=tid+'|'+ov.vpc.VpcId;
      (tG[k]=tG[k]||[]).push({sl,sid:sl.sub.SubnetId,dst:r.DestinationCidrBlock||r.DestinationPrefixListId||'?',gid:tid,vid:ov.vpc.VpcId});
    });
  });

  // SVG
  const g=svg.append('g').attr('class','map-root');
  const zB=d3.zoom().scaleExtent([.08,5]).on('zoom',e=>{g.attr('transform',e.transform);document.getElementById('zoomLevel').textContent=Math.round(e.transform.k*100)+'%'});svg.call(zB);
  _mapSvg=svg;_mapZoom=zB;_mapG=g;
  bindZoomButtons();

  const lnL=g.append('g').attr('class','lines-layer'); // Routes first (bottom)
  const ndL=g.append('g').attr('class','nodes-layer'); // Nodes on top of routes
  const routeG=lnL.append('g').attr('class','route-group');
  const structG=lnL.append('g').attr('class','struct-group'); // structural route lines at full opacity
  const allLb=[];
  const olL=g.append('g').attr('class','highlight-overlay');
  const labelL=g.append('g').attr('class','label-layer'); // Labels on top of everything

  // Highlight lock state for click-to-toggle
  let _hlLocked=false, _hlKey=null, _hlType=null;
  const lockInd=document.getElementById('hlLockInd');
  function showLockInd(v){lockInd.style.display=v?'block':'none'}
  function setGwHl(gid){
    ndL.selectAll('.gw-node').classed('gw-hl',false);
    if(gid) ndL.selectAll('.gw-node').each(function(){
      const el=d3.select(this);
      if(el.datum&&el.datum()===gid) el.classed('gw-hl',true);
    });
  }
  
  function clonePathToOl(srcEl){
    const s=d3.select(srcEl);
    const op=olL.append('path')
      .attr('d',s.attr('d'))
      .style('stroke',s.attr('stroke'))
      .style('fill',s.attr('fill')||'none')
      .style('stroke-width','4px')
      .style('opacity','1')
      .style('stroke-dasharray','8 5')
      .style('pointer-events','none');
    // Preserve solid style for L-bends, connectors, junctions
    const srcDash=s.style('stroke-dasharray');
    if(srcDash==='none'||s.classed('route-junction')){
      op.style('stroke-dasharray','none').style('stroke-width','3px');
    }
    return op;
  }

  function hlGw(gid){
    olL.selectAll('*').remove();
    routeG.style('opacity','0.03');structG.style('opacity','0.03');
    g.classed('hl-active',true);
    ndL.selectAll('.gw-node').classed('gw-hl',false);
    ndL.selectAll('.vpc-group').each(function(){d3.select(this).select('rect').style('stroke-width',null).style('filter',null);});
    ndL.selectAll('.gw-node[data-gwid="'+gid+'"]').classed('gw-hl',true);

    // Find all VPCs connected to this gateway and highlight them
    const gwVids=new Set();
    structG.node().querySelectorAll('[data-gid="'+gid+'"][data-vid]').forEach(el=>{
      gwVids.add(el.getAttribute('data-vid'));
    });
    gwVids.forEach(vid=>ndL.selectAll('.vpc-group[data-vpc-id="'+vid+'"]').each(function(){d3.select(this).select('rect').style('stroke-width','3px').style('filter','drop-shadow(0 0 8px rgba(99,180,255,.7))');}));

    // Clone ALL structural paths for this gateway into overlay
    let hasNet=false;
    const sNode=structG.node();
    sNode.querySelectorAll('[data-gid="'+gid+'"]').forEach(el=>{
      if(el.hasAttribute('data-net-vert')) hasNet=true;
      clonePathToOl(el);
    });
    // Also clone paths with just data-gid (no data-vid) — e.g. bus-bar-to-gateway verticals
    // (already included above since querySelectorAll matches all with data-gid)

    if(hasNet){
      // Clone NET-vert segments: same X column (above this gateway) + intermediate X columns
      const gp=gwP.get(gid);
      if(gp){
        const gwX=gp.x;
        const gwBotY=gp.y-GR-4;
        sNode.querySelectorAll('[data-net-vert]').forEach(el=>{
          if(el.getAttribute('data-gid')===gid) return; // already cloned above
          const dm=el.getAttribute('d').match(/^M([\d.]+),([-\d.]+)\s*L\1,([-\d.]+)$/);
          if(dm){
            const segX=parseFloat(dm[1]);
            const segBot=Math.max(parseFloat(dm[2]),parseFloat(dm[3]));
            if(Math.abs(segX-gwX)<2){
              // Same X column: only segments above this gateway
              if(segBot<=gwBotY+2) clonePathToOl(el);
            }
          }
        });
      }
      const netLine=sNode.querySelector('[data-net-line]');
      if(netLine&&gp){
        // Trim NET horizontal line from Internet node to this gateway's X only
        const nlD=netLine.getAttribute('d');
        const nlM=nlD.match(/^M([-\d.]+),([-\d.]+)\s*L([-\d.]+),([-\d.]+)$/);
        if(nlM){
          const nlX1=parseFloat(nlM[1]),nlY=parseFloat(nlM[2]),nlX2=parseFloat(nlM[3]);
          const trimX=Math.min(Math.max(nlX1,nlX2),gp.x);
          const trimD=`M${Math.min(nlX1,nlX2)},${nlY} L${trimX},${nlY}`;
          const s=d3.select(netLine);
          olL.append('path').attr('d',trimD)
            .style('stroke',s.attr('stroke')).style('fill','none')
            .style('stroke-width','4px').style('opacity','1')
            .style('stroke-dasharray','8 5').style('pointer-events','none');
        }else{
          clonePathToOl(netLine);
        }
      }else if(netLine){
        clonePathToOl(netLine);
      }
      ndL.selectAll('.internet-node').style('opacity','1');
      // Highlight IGW gateways in the same X column (shared trunk) as this gateway
      if(gp){
        const gwX=gp.x;
        ndL.selectAll('.gw-node').each(function(){
          const c=d3.select(this).select('circle');
          const t=d3.select(this).select('text');
          if(!c.node()||!t.node()) return;
          const cx=parseFloat(c.attr('cx'));
          if(t.text()==='IGW'&&Math.abs(cx-gwX)<2) d3.select(this).classed('gw-hl',true);
        });
      }
    }
    allLb.forEach(l=>l.g.classed('visible',l.gid===gid));
  }
  
  function hlSub(sid){
    const subVpc=vL.find(v=>v.subs.some(s=>s.sub&&s.sub.SubnetId===sid));
    const subVid=subVpc?.vpc.VpcId;
    const subLayout=subVpc?.subs.find(s=>s.sub&&s.sub.SubnetId===sid);
    const subMidY=subLayout?(subLayout.y+subLayout.h/2):null;

    const mg=new Set();
    Object.entries(tG).forEach(([key,cs])=>{
      if(cs.some(c=>c.sid===sid)) mg.add(cs[0].gid);
    });

    olL.selectAll('*').remove();
    routeG.style('opacity','0.03');structG.style('opacity','0.03');
    g.classed('hl-active',true);
    ndL.selectAll('.vpc-group').each(function(){d3.select(this).select('rect').style('stroke-width',null).style('filter',null);});
    if(subVid) ndL.selectAll('.vpc-group[data-vpc-id="'+subVid+'"]').each(function(){d3.select(this).select('rect').style('stroke-width','3px').style('filter','drop-shadow(0 0 8px rgba(99,180,255,.7))');});

    if(mg.size===0){
      allLb.forEach(l=>l.g.classed('visible',false));
      return;
    }

    ndL.selectAll('.gw-node').classed('gw-hl',false);
    const sNode=structG.node();

    mg.forEach(gid=>{
      ndL.selectAll('.gw-node[data-gwid="'+gid+'"]').classed('gw-hl',true);

      // Find the subnet's route-line Y for this gateway
      const subRouteEl=sNode.querySelector('[data-gid="'+gid+'"][data-sid="'+sid+'"].route-line');
      let subY=subMidY;
      if(subRouteEl){
        const rm=subRouteEl.getAttribute('d').match(/M[\d.]+,([\d.]+)/);
        if(rm) subY=parseFloat(rm[1]);
      }

      // Find the gateway Y (L-bend endpoint or connector point)
      const gp=gwP.get(gid);
      const gwY=gp?gp.y:subY;

      // 1. Clone this subnet's route-lines + junctions for this gateway
      sNode.querySelectorAll('[data-gid="'+gid+'"][data-sid="'+sid+'"]').forEach(el=>clonePathToOl(el));

      // 2. Clone trunk/L-bend/junction paths — but TRIM vertical trunks to subnet↔gateway range
      // First, find the L-bend/connector Y to use as trim target
      let bendY=gwY;
      sNode.querySelectorAll('[data-gid="'+gid+'"][data-vid="'+subVid+'"]:not([data-sid]):not([data-net-vert])').forEach(el=>{
        if(el.style.strokeDasharray==='none'&&!el.classList.contains('route-junction')){
          // This is the L-bend or L-connector — extract its Y
          const bm=el.getAttribute('d').match(/^M[\d.]+,([\d.]+)/);
          if(bm) bendY=parseFloat(bm[1]);
        }
      });
      sNode.querySelectorAll('[data-gid="'+gid+'"][data-vid="'+subVid+'"]:not([data-sid]):not([data-net-vert])').forEach(el=>{
        const s=d3.select(el);
        const d=el.getAttribute('d');
        const isDashed=el.style.strokeDasharray!=='none'&&!el.classList.contains('route-junction');
        // Detect vertical trunk: M{x},{y1} L{x},{y2} (same X)
        const vm=isDashed&&d.match(/^M([\d.]+),([\d.]+)\s*L\1,([\d.]+)$/);
        if(vm){
          // Trim vertical trunk to span only from subY to the L-bend/connector Y
          const tx=parseFloat(vm[1]);
          const trimTop=Math.min(subY,bendY);
          const trimBot=Math.max(subY,bendY);
          const trimD=`M${tx},${trimTop} L${tx},${trimBot}`;
          olL.append('path').attr('d',trimD)
            .style('stroke',s.attr('stroke')).style('fill','none')
            .style('stroke-width','4px').style('opacity','1')
            .style('stroke-dasharray','8 5').style('pointer-events','none');
        }else{
          clonePathToOl(el);
        }
      });

      // 3. Clone shared gateway paths with no vid (bus-bar-to-gateway verticals)
      sNode.querySelectorAll('[data-gid="'+gid+'"]:not([data-vid]):not([data-net-vert]):not([data-net-line])').forEach(el=>clonePathToOl(el));

      // 4. For IGW: show full path from gateway up to internet node
      // NET verticals are segmented per-gateway, so collect ALL segments
      // at this gateway's X from iY down to the gateway's Y,
      // PLUS intermediate NET-vert segments at other X columns between NET node and this gateway
      if(gp&&gp.gw.type==='IGW'){
        const gwX=gp.x;
        const gwBotY=gp.y-GR-4; // top of gateway circle
        sNode.querySelectorAll('[data-net-vert]').forEach(el=>{
          const dm=el.getAttribute('d').match(/^M([\d.]+),([-\d.]+)\s*L\1,([-\d.]+)$/);
          if(dm){
            const segX=parseFloat(dm[1]);
            const segTop=Math.min(parseFloat(dm[2]),parseFloat(dm[3]));
            const segBot=Math.max(parseFloat(dm[2]),parseFloat(dm[3]));
            if(Math.abs(segX-gwX)<2){
              // Same X column: only segments above or touching the gateway
              if(segTop<=gwBotY+2 && segBot<=gwBotY+2) clonePathToOl(el);
            }
          }
        });
        const netLine=sNode.querySelector('[data-net-line]');
        if(netLine){
          // Trim NET horizontal line to only extend from Internet node to this gateway's X
          const nlD=netLine.getAttribute('d');
          const nlM=nlD.match(/^M([-\d.]+),([-\d.]+)\s*L([-\d.]+),([-\d.]+)$/);
          if(nlM){
            const nlX1=parseFloat(nlM[1]),nlY=parseFloat(nlM[2]),nlX2=parseFloat(nlM[3]);
            const trimX=Math.min(Math.max(nlX1,nlX2),gwX);
            const trimD=`M${Math.min(nlX1,nlX2)},${nlY} L${trimX},${nlY}`;
            const s=d3.select(netLine);
            olL.append('path').attr('d',trimD)
              .style('stroke',s.attr('stroke')).style('fill','none')
              .style('stroke-width','4px').style('opacity','1')
              .style('stroke-dasharray','8 5').style('pointer-events','none');
          }else{
            clonePathToOl(netLine);
          }
        }
        ndL.selectAll('.internet-node').style('opacity','1');
        // Highlight IGW gateways in the same X column (shared trunk) as this gateway
        ndL.selectAll('.gw-node').each(function(){
          const c=d3.select(this).select('circle');
          const t=d3.select(this).select('text');
          if(!c.node()||!t.node()) return;
          const cx=parseFloat(c.attr('cx'));
          if(t.text()==='IGW'&&Math.abs(cx-gwX)<2) d3.select(this).classed('gw-hl',true);
        });
      }
    });
    
    // Position labels based on gateway type
    let labelOffset=0;
    const visibleLabels=[];
    if(subVpc){
      allLb.forEach(l=>{
        const show=mg.has(l.gid)&&(l.shared||l.vid===subVid);
        l.g.classed('visible',show);
        if(show&&subMidY!=null){
          const ly=subMidY+labelOffset;
          let labelX;
          if(l.shared){
            if(subVpc.gwSide==='left'){
              labelX=subVpc.x-(subVpc.chanW||100)/2-40;
            }else{
              labelX=subVpc.x+subVpc.w+(subVpc.chanW||100)/2+40;
            }
          }else{
            const gp=gwP.get(l.gid);
            if(subVpc.gwSide==='left'){
              labelX=gp?gp.x-GR-50:subVpc.x-100;
            }else{
              labelX=gp?gp.x+GR+50:subVpc.x+subVpc.w+100;
            }
          }
          l.g.select('rect').attr('x',labelX-l.lw/2).attr('y',ly-8);
          l.g.select('text').attr('x',labelX).attr('y',ly+3);
          visibleLabels.push({g:l.g,lw:l.lw,x:labelX-l.lw/2,y:ly-8,h:16});
          labelOffset+=22;
        }
      });
      
      // Dynamic collision avoidance: shift labels right if any route lines pass through
      visibleLabels.forEach(vl=>{
        let lx=vl.x,ly=vl.y,lw=vl.lw,lh=vl.h;
        let shifted=false;
        for(let iter=0;iter<5;iter++){
          let maxCrossX=0;
          // Check all route paths (trunks and lines)
          structG.selectAll('.route-trunk,.route-line').each(function(){
            const d=d3.select(this).attr('d')||'';
            // Check vertical lines: M{x},{y1} L{x},{y2}
            const vm=d.match(/M([\d.]+),([\d.]+)\s*L\1,([\d.]+)/);
            if(vm){
              const tx=parseFloat(vm[1]);
              const ty1=Math.min(parseFloat(vm[2]),parseFloat(vm[3]));
              const ty2=Math.max(parseFloat(vm[2]),parseFloat(vm[3]));
              if(tx>=lx&&tx<=lx+lw&&ty1<=ly+lh&&ty2>=ly){
                if(tx>maxCrossX)maxCrossX=tx;
              }
            }
            // Check horizontal lines: M{x1},{y} L{x2},{y}
            const hm=d.match(/M([\d.]+),([\d.]+)\s*L([\d.]+),\2/);
            if(hm){
              const hx1=Math.min(parseFloat(hm[1]),parseFloat(hm[3]));
              const hx2=Math.max(parseFloat(hm[1]),parseFloat(hm[3]));
              const hy=parseFloat(hm[2]);
              if(hy>=ly&&hy<=ly+lh&&hx2>=lx&&hx1<=lx+lw){
                if(hx2>maxCrossX)maxCrossX=hx2;
              }
            }
          });
          if(maxCrossX>0){
            lx=maxCrossX+12;
            shifted=true;
          }else break;
        }
        if(shifted){
          vl.g.select('rect').attr('x',lx);
          vl.g.select('text').attr('x',lx+lw/2);
        }
      });
    }
  }
  function clr(){
    if(_hlLocked) return;
    olL.selectAll('*').remove();routeG.style('opacity',null);structG.style('opacity',null);allLb.forEach(l=>l.g.classed('visible',false));g.classed('hl-active',false);
    ndL.selectAll('.gw-node').classed('gw-hl',false);
    ndL.selectAll('.internet-node').style('opacity',null);
    ndL.selectAll('.vpc-group').each(function(){d3.select(this).select('rect').style('stroke-width',null).style('filter',null);});
  }
  function forceClr(){
    _hlLocked=false;_hlKey=null;_hlType=null;showLockInd(false);
    olL.selectAll('*').remove();routeG.style('opacity',null);structG.style('opacity',null);allLb.forEach(l=>l.g.classed('visible',false));g.classed('hl-active',false);
    ndL.selectAll('.gw-node').classed('gw-hl',false);
    ndL.selectAll('.internet-node').style('opacity',null);
    ndL.selectAll('.vpc-group').each(function(){d3.select(this).select('rect').style('stroke-width',null).style('filter',null);});
  }
  // Expose gateway highlight globally for panel link navigation
  window._hlGwGlobal=function(gid){
    forceClr();hlGw(gid);
    ndL.selectAll('.gw-node').classed('gw-hl',false);
    ndL.selectAll('.gw-node[data-gwid="'+gid+'"]').classed('gw-hl',true);
    _hlLocked=true;_hlKey=gid;_hlType='gw';showLockInd(true);
  };
  if(window._hlUnlockHandler)document.removeEventListener('hl-unlock',window._hlUnlockHandler);
  window._hlUnlockHandler=forceClr;document.addEventListener('hl-unlock',forceClr);
  svg.on('click',function(event){
    if(!event.target.closest('.gw-node')&&!event.target.closest('.subnet-node')&&!event.target.closest('.res-node')&&!event.target.closest('.route-hitarea')&&!event.target.closest('.internet-node')){
      forceClr();
      if(_spotlightActive) _closeSpotlight();
    }
  });

  // Attach route-highlighting to subnet bodies and their resource nodes
  ndL.selectAll('.subnet-node').each(function(){
    const el=d3.select(this);
    const sid=el.attr('data-subnet-id');
    if(!sid)return;
    el.on('mouseenter.hl',function(){if(!_hlLocked)hlSub(sid)})
      .on('mouseleave.hl',function(){if(!_hlLocked)clr()})
      .on('click.hl',function(event){
        if(event.target.closest('.res-node'))return;
        event.stopPropagation();
        if(_hlLocked&&_hlKey===sid&&_hlType==='sub'){forceClr();return}
        forceClr();hlSub(sid);_hlLocked=true;_hlKey=sid;_hlType='sub';showLockInd(true);
      });
    el.selectAll('.res-node')
      .on('mouseenter.hl',function(){if(!_hlLocked)hlSub(sid)})
      .on('mouseleave.hl',function(){if(!_hlLocked)clr()})
      .on('click.hl',function(event){
        event.stopPropagation();
        var resEl=d3.select(this);
        var resId=resEl.attr('data-id');
        if(resId){
          forceClr();hlSub(sid);_hlLocked=true;_hlKey=sid;_hlType='sub';showLockInd(true);
          _openResourceSpotlight(resId);
          return;
        }
        if(_hlLocked&&_hlKey===sid&&_hlType==='sub'){forceClr();return}
        forceClr();hlSub(sid);_hlLocked=true;_hlKey=sid;_hlType='sub';showLockInd(true);
      });
  });

  // peering lines - horizontal connections between VPC edges, stacked by span
  const peeringG=lnL.append('g').attr('class','peering-group');
  
  const activePeerings = peerings
    .filter(pcx => !pcx.Status || pcx.Status.Code === 'active')
    .map(pcx => {
      const rv = pcx.RequesterVpcInfo?.VpcId, av = pcx.AccepterVpcInfo?.VpcId;
      const v1 = vL.find(v => v.vpc.VpcId === rv), v2 = vL.find(v => v.vpc.VpcId === av);
      if (!v1 || !v2) return null;
      const leftVpc = v1.x < v2.x ? v1 : v2;
      const rightVpc = v1.x < v2.x ? v2 : v1;
      const span = (rightVpc.x) - (leftVpc.x + leftVpc.w);
      return { pcx, leftVpc, rightVpc, span };
    })
    .filter(p => p !== null)
    .sort((a, b) => a.span - b.span); // shortest first = closest to VPCs
  
  const globalMinY = Math.min(...vL.map(v => v.y));
  const laneSpacing = 28;

  activePeerings.forEach((p, idx) => {
    const { pcx, leftVpc, rightVpc } = p;
    const pn = gn(pcx, pcx.VpcPeeringConnectionId);

    // Each peering gets its own Y lane above VPCs
    // Shortest spans closest to VPCs, longest furthest away
    const y = globalMinY - 40 - idx * laneSpacing;
    
    const stubLen = 15;
    
    // Exit points on VPC tops
    const leftExitX = leftVpc.x + leftVpc.w - stubLen;
    const rightExitX = rightVpc.x + stubLen;
    const leftVpcTopY = leftVpc.y;
    const rightVpcTopY = rightVpc.y;
    
    // Complete path: down from left VPC, across, down to right VPC
    const d = `M${leftExitX},${leftVpcTopY} L${leftExitX},${y} L${rightExitX},${y} L${rightExitX},${rightVpcTopY}`;
    
    peeringG.append('path')
      .attr('class', 'peering-line animated')
      .attr('d', d)
      .attr('stroke', 'var(--pcx-color)');
    
    // Label at midpoint of horizontal segment
    const midX = (leftExitX + rightExitX) / 2;
    const pw = pn.length * 5.5 + 20;
    const pg = lnL.append('g').attr('class','peering-label-g');
    pg.append('rect')
      .attr('x', midX - pw / 2).attr('y', y - 9)
      .attr('width', pw).attr('height', 18).attr('rx', 3)
      .attr('fill', 'rgba(10,14,23,.95)').attr('stroke', '#fb923c').attr('stroke-width', .5);
    pg.append('text')
      .attr('x', midX).attr('y', y + 4)
      .attr('text-anchor', 'middle').attr('font-family', 'IBM Plex Mono')
      .style('font-size','calc(9px * var(--txt-scale,1))').attr('fill', '#fb923c').text(pn);
  });

  // VPN marker
  vpns.forEach(vpn=>{
    if(vpn.State!=='available')return;
    const vgwId=vpn.VpnGatewayId;if(!vgwId||!gwP.has(vgwId))return;
    const pos=gwP.get(vgwId);
    const vpnLbl='VPN: '+gn(vpn,'VPN');const vpnLblY=pos.y-GR-12;const vpnTw=vpnLbl.length*5.2+14;
    ndL.append('rect').attr('x',pos.x-vpnTw/2).attr('y',vpnLblY-9).attr('width',vpnTw).attr('height',14).attr('rx',4).attr('fill','rgba(10,17,30,.88)').attr('stroke','rgba(249,115,22,.3)').attr('stroke-width',.5);
    ndL.append('text').attr('x',pos.x).attr('y',vpnLblY).attr('text-anchor','middle').attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('fill','#f97316').text(vpnLbl);
  });

  // route trunks
  const tpv={};
  // Count per-VPC and shared gateways separately for trunk spacing
  const tpvPerVpc={};
  const tpvShared={};
  Object.entries(tG).forEach(([k])=>{
    const parts=k.split('|');
    const gid=parts[0],vid=parts[1];
    const gp=gwP.get(gid);
    if(gp&&isShared(gp.gw.type)){
      tpvShared[vid]=(tpvShared[vid]||0)+1;
    }else{
      tpvPerVpc[vid]=(tpvPerVpc[vid]||0)+1;
    }
    tpv[vid]=(tpv[vid]||0)+1;
  });
  const vtcPerVpc={};
  const vtcPerVpcUp={}; // Counter for UP-going per-VPC gateways
  const vtcPerVpcDown={}; // Counter for DOWN-going per-VPC gateways
  const vtcShared={};
  const lsg=new Set();
  
  // Track bus Y levels per shared gateway for vertical connector
  const sharedGwBusY={};

  // Sort gateway entries by DIRECTION relative to subnets to prevent line crossings
  // Lines going UP (gateway above subnets) get trunk X further LEFT
  // Lines going DOWN (gateway below subnets) get trunk X further RIGHT
  const sortedTgEntries=Object.entries(tG).sort((a,b)=>{
    const connsA=a[1],connsB=b[1];
    const gpA=gwP.get(connsA[0].gid);
    const gpB=gwP.get(connsB[0].gid);
    const vidA=connsA[0].vid,vidB=connsB[0].vid;
    // Group by VPC first
    if(vidA!==vidB)return 0;
    if(!gpA||!gpB)return 0;
    // Calculate average subnet Y for each gateway's connections
    const avgSubYA=connsA.reduce((s,c)=>s+c.sl.y+c.sl.h/2,0)/connsA.length;
    const avgSubYB=connsB.reduce((s,c)=>s+c.sl.y+c.sl.h/2,0)/connsB.length;
    // Direction: negative = going UP, positive = going DOWN
    const dirA=gpA.y-avgSubYA;
    const dirB=gpB.y-avgSubYB;
    // Lines going UP (negative dir) should be LEFT (sorted first)
    // Lines going DOWN (positive dir) should be RIGHT (sorted later)
    return dirA-dirB;
  });

  sortedTgEntries.forEach(([key,conns])=>{
    const gid=conns[0].gid,vid=conns[0].vid;
    const gp=gwP.get(gid);if(!gp)return;
    const gi=gp.gw,col=gcv(gi.type),colH=gch(gi.type);
    const ov=vL.find(v=>v.vpc.VpcId===vid);if(!ov)return;
    conns.sort((a,b)=>a.sl.y-b.sl.y);

    // Separate trunk X for per-VPC vs shared gateways - large gap to avoid visual collision
    const sh=isShared(gi.type);
    const gwLeft=ov.gwSide==='left'; // last VPC: gateways to the left
    const cl=gwLeft?(ov.x-8):(ov.x+ov.w+8);

    // Direction based on gateway type: per-VPC (IGW/NAT) go UP to NET, shared (TGW) go DOWN to bus
    conns.sort((a,b)=>a.sl.y-b.sl.y);
    const goingUp=!sh; // per-VPC gateways route UP, shared gateways route DOWN

    let tx;
    if(sh){
      // Shared gateways (TGW) use trunks close to VPC edge
      const tn=vtcShared[vid]=(vtcShared[vid]||0)+1;
      const nt=tpvShared[vid]||1;
      const sp=Math.max(6,Math.min(10,(ov.chanW*0.1)/Math.max(nt,1)));
      tx=gwLeft?(cl-2-(tn-1)*sp):(cl+2+(tn-1)*sp);
    }else{
      // Per-VPC gateways: UP lines get inner trunks, DOWN lines get outer trunks
      const baseOffset=50;
      const perVpcCount=tpvPerVpc[vid]||1;
      const sp=Math.max(8,Math.min(14,(ov.chanW*0.25)/Math.max(perVpcCount,1)));

      // Separate counters for up vs down
      if(!vtcPerVpcUp[vid])vtcPerVpcUp[vid]=0;
      if(!vtcPerVpcDown[vid])vtcPerVpcDown[vid]=0;

      if(goingUp){
        const tn=++vtcPerVpcUp[vid];
        tx=gwLeft?(cl-baseOffset-(tn-1)*sp):(cl+baseOffset+(tn-1)*sp);
      }else{
        const tn=++vtcPerVpcDown[vid];
        const upCount=Object.keys(tG).filter(k=>{
          const c=tG[k][0];
          if(c.vid!==vid)return false;
          const g=gwP.get(c.gid);
          return g&&!isShared(g.gw.type)&&g.y<avgSubY;
        }).length;
        tx=gwLeft?(cl-baseOffset-(upCount)*sp-(tn-1)*sp):(cl+baseOffset+(upCount)*sp+(tn-1)*sp);
      }
    }

    // Deduplicate connections by subnet ID
    const seenSubs=new Set();
    const uniqueConns=conns.filter(c=>{
      if(seenSubs.has(c.sid))return false;
      seenSubs.add(c.sid);return true;
    });

    // Collect all per-VPC gateway positions for this VPC to avoid crossing them
    const vpcGwPositions=[];
    gwP.forEach((pos,id)=>{
      if(!isShared(pos.gw.type)){
        const ovGw=vL.find(v=>v.subs.some(s=>true)&&pvGws[v.vpc.VpcId]?.some(g=>g.id===id));
        if(ovGw&&ovGw.vpc.VpcId===vid) vpcGwPositions.push(pos);
      }
    });

    uniqueConns.forEach(c=>{
      // Exit from top of subnet if going UP, bottom if going DOWN
      const sy=goingUp?(c.sl.y+6):(c.sl.y+c.sl.h-6);

      // Check if horizontal line would cross any gateway circle (not our own)
      let d;
      if(gwLeft){
        // Left-side gateways: route line goes LEFT from subnet left edge
        const subLeft=c.sl.x;
        const crossingGw=vpcGwPositions.find(g=>g!==gp&&Math.abs(g.y-sy)<GR+8&&g.x<subLeft&&g.x>tx);
        if(crossingGw){
          const jogY=sy<crossingGw.y?(crossingGw.y-GR-10):(crossingGw.y+GR+10);
          d=`M${subLeft},${sy} L${crossingGw.x+GR+6},${sy} L${crossingGw.x+GR+6},${jogY} L${tx},${jogY} L${tx},${sy}`;
        }else{
          d=`M${subLeft},${sy} L${tx},${sy}`;
        }
      }else{
        // Right-side gateways: route line goes RIGHT from subnet right edge
        const subRight=c.sl.x+c.sl.w;
        const crossingGw=vpcGwPositions.find(g=>g!==gp&&Math.abs(g.y-sy)<GR+8&&g.x>subRight&&g.x<tx);
        if(crossingGw){
          const jogY=sy<crossingGw.y?(crossingGw.y-GR-10):(crossingGw.y+GR+10);
          d=`M${subRight},${sy} L${crossingGw.x-GR-6},${sy} L${crossingGw.x-GR-6},${jogY} L${tx},${jogY} L${tx},${sy}`;
        }else{
          d=`M${subRight},${sy} L${tx},${sy}`;
        }
      }
      structG.append('path').attr('class','route-line route-structural').attr('d',d).attr('stroke',col).attr('data-gid',gid).attr('data-vid',vid).attr('data-sid',c.sid);
      // Solid filled square at trunk junction to cover dash-pattern gaps
      const jd=`M${tx-3},${sy-3} L${tx+3},${sy-3} L${tx+3},${sy+3} L${tx-3},${sy+3} Z`;
      structG.append('path').attr('class','route-junction route-structural').attr('d',jd).attr('stroke',col).attr('fill',col).attr('stroke-width',1).style('stroke-dasharray','none').attr('data-gid',gid).attr('data-vid',vid).attr('data-sid',c.sid);
      lnL.append('path').attr('class','route-hitarea').attr('d',d)
        .on('mouseenter',()=>{if(!_hlLocked)hlSub(c.sid)}).on('mouseleave',clr)
        .on('click',function(event){event.stopPropagation();
          if(_hlLocked&&_hlKey===c.sid&&_hlType==='sub'){forceClr();return}
          forceClr();hlSub(c.sid);_hlLocked=true;_hlKey=c.sid;_hlType='sub';showLockInd(true);
        });
    });

    // Trunk Y matches horizontal line positions
    const topY=goingUp?(uniqueConns[0].sl.y+6):(uniqueConns[0].sl.y+uniqueConns[0].sl.h-6);
    const botY=goingUp?(uniqueConns[uniqueConns.length-1].sl.y+6):(uniqueConns[uniqueConns.length-1].sl.y+uniqueConns[uniqueConns.length-1].sl.h-6);
    let lx,ly;

    if(!sh){
      // Per-VPC gateway: trunk spans ALL connected subnets AND gateway, then L-connector
      const gwEdgeX=gwLeft?(gp.x+GR+4):(gp.x-GR-4);

      // Compute actual min/max Y across ALL connected subnets (not just first/last)
      const allSubYs=uniqueConns.map(c=>goingUp?(c.sl.y+6):(c.sl.y+c.sl.h-6));
      // Trunk must cover ALL subnet Ys AND the gateway Y
      const vertTop=Math.min(...allSubYs,gp.y);
      const vertBot=Math.max(...allSubYs,gp.y);

      // Vertical trunk covering full range + L-bend to gateway
      const fullPath=`M${tx},${vertTop} L${tx},${vertBot}`;
      const lbendPath=`M${tx},${gp.y} L${gwEdgeX},${gp.y}`;
      const combinedPath=`M${tx},${vertTop} L${tx},${vertBot} M${tx},${gp.y} L${gwEdgeX},${gp.y}`;
      // Dashed vertical trunk spanning all subnets
      structG.append('path').attr('class','route-trunk route-structural').attr('d',fullPath).attr('stroke',col).attr('data-gid',gid).attr('data-vid',vid);
      // Solid L-bend connector from trunk to gateway
      structG.append('path').attr('class','route-trunk route-structural').attr('d',lbendPath).attr('stroke',col).attr('data-gid',gid).attr('data-vid',vid);
      // Solid patch at L-bend corner
      const bendPatch=`M${tx-3},${gp.y-3} L${tx+3},${gp.y-3} L${tx+3},${gp.y+3} L${tx-3},${gp.y+3} Z`;
      structG.append('path').attr('class','route-junction route-structural').attr('d',bendPatch).attr('stroke',col).attr('fill',col).style('stroke-dasharray','none').attr('data-gid',gid).attr('data-vid',vid);
      lnL.append('path').attr('class','route-hitarea').attr('d',combinedPath)
        .on('mouseenter',()=>{if(!_hlLocked){hlGw(gid);ndL.selectAll('.gw-node[data-gwid="'+gid+'"]').classed('gw-hl',true)}}).on('mouseleave',()=>{clr()})
        .on('click',function(event){event.stopPropagation();
          if(_hlLocked&&_hlKey===gid&&_hlType==='gw'){forceClr();return}
          forceClr();hlGw(gid);ndL.selectAll('.gw-node[data-gwid="'+gid+'"]').classed('gw-hl',true);
          _hlLocked=true;_hlKey=gid;_hlType='gw';showLockInd(true);
        });

      // Route label between gateway and VPC (on the trunk-line side)
      ly=gp.y;
      lx=gwLeft?(gp.x+GR+8):(gp.x-GR-8);
    }else{
      // Shared gateway: collect for bus bar routing (drawn later)
      if(!sharedGwBusY[gid]){
        sharedGwBusY[gid]={vpcs:[],col,gp};
      }
      sharedGwBusY[gid].vpcs.push({tx,ov,conns:uniqueConns});

      // For shared gateways, label near the trunk line at the last connected subnet
      lx=gwLeft?(tx-4):(tx+4);ly=uniqueConns[uniqueConns.length-1].sl.y+uniqueConns[uniqueConns.length-1].sl.h+10;
    }

    let skip=false;
    if(sh){if(lsg.has(gid))skip=true;else lsg.add(gid)}
    if(!skip){
      const lt=uniqueConns[0].dst+' > '+gi.type,lw=lt.length*5.4+16;
      const lg=labelL.append('g').attr('class','route-label-g');
      const anchor=(!sh&&gwLeft)?'start':'end';
      const rx=anchor==='end'?(lx-lw):lx;
      const textX=rx+lw/2;
      lg.append('rect').attr('x',rx).attr('y',ly-8).attr('width',lw).attr('height',16).attr('rx',3).attr('fill','rgba(10,14,23,.92)').attr('stroke',colH).attr('stroke-width',.5);
      lg.append('text').attr('x',textX).attr('y',ly+3).attr('text-anchor','middle').attr('font-family','IBM Plex Mono').style('font-size','calc(8px * var(--txt-scale,1))').attr('font-weight','500').attr('fill',colH).text(lt);
      allLb.push({gid,vid,shared:sh,lx:textX,lw,g:lg});
    }
  });

  // Draw shared gateway bus routing AFTER all VPCs processed
  Object.entries(sharedGwBusY).forEach(([gid,info])=>{
    const {vpcs:vpcConns,col,gp}=info;
    if(!vpcConns.length)return;

    // Bus bar Y: just enough below VPCs to clear, halfway to the gateway
    const allVpcBotForBus=Math.max(...vpcConns.map(v=>v.ov.y+v.ov.h));
    const busY=allVpcBotForBus+30;

    // Each VPC trunk: dashed trunk spanning subnets + solid connector to bus bar
    vpcConns.forEach(vc=>{
      const uniqueC=vc.conns.sort((a,b)=>a.sl.y-b.sl.y);
      const vpcId=vc.ov.vpc.VpcId;
      const allSubYs=uniqueC.map(c=>c.sl.y+c.sl.h-6);
      const trunkTop=Math.min(...allSubYs);
      const trunkBot=Math.max(...allSubYs);

      // Dashed trunk spanning only connected subnet range
      if(trunkTop!==trunkBot){
        const trunkPath=`M${vc.tx},${trunkTop} L${vc.tx},${trunkBot}`;
        structG.append('path').attr('class','route-trunk route-structural').attr('d',trunkPath).attr('stroke',col).attr('data-gid',gid).attr('data-vid',vpcId);
      }

      // Solid L-connector from bottom of trunk down to bus Y, then horizontal to TGW X
      const connPath=`M${vc.tx},${trunkBot} L${vc.tx},${busY} L${gp.x},${busY}`;
      structG.append('path').attr('class','route-trunk route-structural').attr('d',connPath).attr('stroke',col).style('stroke-dasharray','none').style('opacity',0.45).attr('data-gid',gid).attr('data-vid',vpcId);
      // Solid patch at trunk-to-connector junction
      const tgwJunc=`M${vc.tx-3},${trunkBot-3} L${vc.tx+3},${trunkBot-3} L${vc.tx+3},${trunkBot+3} L${vc.tx-3},${trunkBot+3} Z`;
      structG.append('path').attr('class','route-junction route-structural').attr('d',tgwJunc).attr('stroke',col).attr('fill',col).style('stroke-dasharray','none').attr('data-gid',gid).attr('data-vid',vpcId);

      // Hitarea covers full path
      const fullPath=`M${vc.tx},${trunkTop} L${vc.tx},${busY} L${gp.x},${busY}`;
      lnL.append('path').attr('class','route-hitarea').attr('d',fullPath)
        .on('mouseenter',()=>{if(!_hlLocked){hlGw(gid);ndL.selectAll('.gw-node[data-gwid="'+gid+'"]').classed('gw-hl',true)}}).on('mouseleave',()=>{clr()})
        .on('click',function(event){event.stopPropagation();
          if(_hlLocked&&_hlKey===gid&&_hlType==='gw'){forceClr();return}
          forceClr();hlGw(gid);ndL.selectAll('.gw-node[data-gwid="'+gid+'"]').classed('gw-hl',true);
          _hlLocked=true;_hlKey=gid;_hlType='gw';showLockInd(true);
        });
    });

    // Single vertical from bus bar to gateway circle
    const gwConnect=`M${gp.x},${busY} L${gp.x},${gp.y-GR-4}`;
    structG.append('path').attr('class','route-trunk route-structural').attr('d',gwConnect).attr('stroke',col).style('stroke-dasharray','none').style('opacity',0.45).attr('data-gid',gid);
  });

  // (Per-VPC verticals to gateway drawn inline above)

  // Find edges for routing
  const allVpcBottomEdge=Math.max(...vL.map(v=>v.y+v.h));

  // IGW/NAT to Internet lines are now drawn with the NET node for proper animation

  // Reposition disconnected VPCs below all routing (gateways, bus lanes, peering)
  if(unknownVL.length>0){
    const newUnkY=routingBottomY+60;
    const oldUnkY=unknownVL[0].y;
    const dy=newUnkY-oldUnkY;
    if(dy!==0){
      unknownVL.forEach(v=>{v.y+=dy;v.subs.forEach(s=>{s.y+=dy})});
    }
    routingBottomY=Math.max(...unknownVL.map(v=>v.y+v.h))+20;
  }

  // Region labels above VPC groups - process known VPCs (row 1) separately from unknown (row 2)
  const vpcRegionMap={};
  vL.forEach(vl=>{
    const ss=subByVpc[vl.vpc.VpcId]||[];
    const az=ss.find(s=>s.AvailabilityZone)?.AvailabilityZone||'';
    const region=az.replace(/[a-z]$/,'')||'unknown';
    vpcRegionMap[vl.vpc.VpcId]=region;
  });
  
  // group consecutive known VPCs by region, draw region background
  let prevRegion='',regionStartX=0,regionVpcs=[];
  const regionGroups=[];
  knownVL.forEach((vl,i)=>{
    const r=vpcRegionMap[vl.vpc.VpcId];
    if(r!==prevRegion&&prevRegion&&regionVpcs.length){
      regionGroups.push({region:prevRegion,vpcs:[...regionVpcs]});
      regionVpcs=[];
    }
    if(regionVpcs.length===0)regionStartX=vl.x;
    regionVpcs.push(vl);
    prevRegion=r;
    if(i===knownVL.length-1&&regionVpcs.length)regionGroups.push({region:r,vpcs:[...regionVpcs]});
  });
  
  // Add unknown VPCs as separate group if any
  if(unknownVL.length>0){
    regionGroups.push({region:'DISCONNECTED',vpcs:unknownVL});
  }
  
  regionGroups.forEach(rg=>{
    const first=rg.vpcs[0],last=rg.vpcs[rg.vpcs.length-1];
    const ry=first.y-30;
    const lastRight=last.gwSide==='left'?(last.x+last.w):(last.x+last.w+last.chanW);
    const rx=first.x-10;
    const rw=lastRight-first.x+20;
    const rh=Math.max(...rg.vpcs.map(v=>v.h))+50;
    const isDisconnected=rg.region==='DISCONNECTED';
    const mr=_multiRegion&&!isDisconnected;
    ndL.append('rect').attr('class','region-boundary').attr('x',rx).attr('y',ry).attr('width',rw).attr('height',rh)
      .attr('fill',isDisconnected?'rgba(239,68,68,.06)':mr?'rgba(59,130,246,.08)':'rgba(59,130,246,.06)')
      .attr('stroke',isDisconnected?'rgba(239,68,68,.3)':mr?'rgba(59,130,246,.25)':'rgba(59,130,246,.15)')
      .attr('stroke-width',mr?1.5:1)
      .attr('stroke-dasharray',isDisconnected?'4 2':'none')
      .attr('rx',12);
    if(mr){
      // Pill badge label centered at top
      const labelText=rg.region+' ('+rg.vpcs.length+' VPC'+(rg.vpcs.length>1?'s':'')+')';
      const pillW=labelText.length*6.5+16;
      const pillX=rx+rw/2-pillW/2;
      const pillY=ry-16;
      ndL.append('rect').attr('x',pillX).attr('y',pillY).attr('width',pillW).attr('height',18)
        .attr('rx',9).attr('fill','rgba(59,130,246,.12)').attr('stroke','rgba(59,130,246,.3)').attr('stroke-width',1);
      ndL.append('text').attr('x',pillX+pillW/2).attr('y',pillY+12.5)
        .attr('text-anchor','middle').attr('fill','#60a5fa')
        .attr('font-family','IBM Plex Mono').style('font-size','calc(9px * var(--txt-scale,1))')
        .attr('font-weight','600').text(labelText);
    }else{
      ndL.append('text').attr('class','region-label')
        .attr('x',rx+10).attr('y',ry-6)
        .attr('fill',isDisconnected?'var(--accent-red)':'var(--text-muted)')
        .text(rg.region);
    }
  });

  // VPC boxes
  const tt=document.getElementById('tooltip');
  vL.forEach(vl=>{
    const vG=ndL.append('g').attr('class','vpc-group').attr('data-vpc-id',vl.vpc.VpcId);
    vG.append('rect').attr('x',vl.x).attr('y',vl.y).attr('width',vl.w).attr('height',vl.h).attr('fill','rgba(59,130,246,.03)').attr('stroke','var(--vpc-stroke)').attr('stroke-width',1.5);
    const _vpcName=gn(vl.vpc,vl.vpc.VpcId);
    vG.append('text').attr('class','vpc-label').attr('x',vl.x+14).attr('y',vl.y+26)
      .attr('textLength',Math.min(_vpcName.length*8,vl.w*0.55)).attr('lengthAdjust','spacing').text(_vpcName);
    const regionTag=vpcRegionMap[vl.vpc.VpcId]||'';
    const acctTag=_multiAccount&&vl.vpc._accountId&&vl.vpc._accountId!=='default'?(' ['+vl.vpc._accountId+']'):'';
    vG.append('text').attr('class','vpc-cidr').attr('x',vl.x+vl.w-14).attr('y',vl.y+26).attr('text-anchor','end').text(vl.vpc.CidrBlock+(regionTag?' | '+regionTag:'')+(acctTag?acctTag:''));
    // Account color stripe for multi-account
    if(_multiAccount&&vl.vpc._accountId!=='default'){
      const acCol=vl.vpc._ctxColor||getAccountColor(vl.vpc._accountId);
      if(acCol){
        vG.append('rect').attr('x',vl.x).attr('y',vl.y).attr('width',8).attr('height',vl.h).attr('fill',acCol).attr('rx',2).attr('opacity',.7);
        const acLbl=vl.vpc._accountLabel||vl.vpc._accountId;
        const maxChars=Math.floor(vl.h/7);
        vG.append('text').attr('x',vl.x+5).attr('y',vl.y+vl.h-6).attr('transform','rotate(-90,'+((vl.x+5))+','+((vl.y+vl.h-6))+')')
          .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('fill','#fff').attr('font-weight','600').attr('letter-spacing','.5px')
          .text(acLbl.length>maxChars?acLbl.slice(0,maxChars-1)+'…':acLbl);
      }
    }
    // show indicator for VPCs with no subnets
    if(vl.subs.length===0){
      vG.append('text').attr('x',vl.x+vl.w/2).attr('y',vl.y+vl.h/2+10).attr('text-anchor','middle').attr('font-family','IBM Plex Mono').style('font-size','calc(10px * var(--txt-scale,1))').attr('fill','var(--text-muted)').text('No subnets');
    }
  });

  // subnets
  vL.forEach(vl=>{
    // Draw AZ separator labels
    vl.subs.filter(sl=>sl.azLabel).forEach(sl=>{
      ndL.append('text').attr('x',sl.x).attr('y',sl.y+AZ_HDR-2).attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('font-weight','700').attr('fill','var(--text-muted)').attr('opacity',.6).attr('letter-spacing','1px').text('AZ: '+sl.azLabel.slice(-2).toUpperCase());
      ndL.append('line').attr('x1',sl.x+38).attr('y1',sl.y+AZ_HDR-5).attr('x2',sl.x+sl.w).attr('y2',sl.y+AZ_HDR-5).attr('stroke','var(--border)').attr('stroke-width',.5).attr('opacity',.4);
    });
    vl.subs.filter(sl=>sl.sub).forEach(sl=>{
    const sG=ndL.append('g').attr('class','subnet-node').attr('data-subnet-id',sl.sub.SubnetId);
    const col=sl.pub?'var(--subnet-public)':'var(--subnet-private)';
    sG.append('rect').attr('x',sl.x).attr('y',sl.y).attr('width',sl.w).attr('height',sl.h).attr('fill',sl.pub?'rgba(6,182,212,.15)':'rgba(139,92,246,.15)').attr('stroke',col).attr('stroke-width',1.2);
    const cid='c-'+sl.sub.SubnetId.replace(/[^a-zA-Z0-9]/g,'');
    sG.append('clipPath').attr('id',cid).append('rect').attr('x',sl.x+6).attr('y',sl.y).attr('width',sl.w-12).attr('height',sl.h);
    const tG2=sG.append('g').attr('clip-path',`url(#${cid})`);
    tG2.append('text').attr('class','subnet-label').attr('x',sl.x+8).attr('y',sl.y+18).text(gn(sl.sub,sl.sub.SubnetId));
    tG2.append('text').attr('class','subnet-cidr').attr('x',sl.x+8).attr('y',sl.y+30).text(sl.sub.CidrBlock+(sl.sub.AvailabilityZone?'  '+sl.sub.AvailabilityZone.slice(-2):''));
    sG.append('text').attr('x',sl.x+sl.w-8).attr('y',sl.y+14).attr('text-anchor','end').attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('font-weight','600').attr('fill',col).text(sl.pub?'PUBLIC':'PRIVATE');

    // resource icons inside subnet (tree-based with nesting)
    const tree=subTrees[sl.sub.SubnetId]||[];
    
    if(_detailLevel===0&&tree.length>0){
      // collapsed: show resource count summary
      const counts={};
      tree.forEach(r=>{counts[r.type]=(counts[r.type]||0)+1});
      const summary=Object.entries(counts).map(([t,c])=>c+' '+t).join(', ');
      sG.append('text').attr('x',sl.x+8).attr('y',sl.y+sl.h-6)
        .attr('font-family','IBM Plex Mono').style('font-size','calc(6px * var(--txt-scale,1))').attr('fill','var(--text-muted)').attr('opacity',.5).text(summary);
    } else if(tree.length>0){
      const iconW=Math.max(70,Math.floor((sl.w-16)/RES_COLS)-RES_GAP);
      const maxCh=Math.max(0,...tree.map(r=>(r.children||[]).length));
      const rowH=RES_ICON+maxCh*RES_CHILD_H+6;
      let rx=sl.x+6, ry=sl.y+RES_TOP, rci=0;
      tree.forEach((res,ri)=>{
        if(rci>=RES_COLS){rci=0;rx=sl.x+6;ry+=rowH;}
        const nCh=(res.children||[]).length;
        const iconH=RES_ICON+nCh*RES_CHILD_H;
        // wrap in interactive group
        const rG=sG.append('g').attr('class','res-node').style('cursor','pointer');
        if(res.rid) rG.attr('data-id',res.rid);
        const _rx=rx,_ry=ry;
        rG.on('mouseenter',function(event){
          event.stopPropagation();
          if(!_hlLocked) hlSub(sl.sub.SubnetId);
          tt.innerHTML=resTooltipHtml(res,sl.sub.SubnetId,subRT);
          tt.style.display='block';
        }).on('mousemove',function(event){
          positionTooltip(event,tt);
        }).on('mouseleave',function(){
          tt.style.display='none';
        });
        // outer box
        rG.append('rect').attr('x',rx).attr('y',ry).attr('width',iconW).attr('height',iconH)
          .attr('rx',3).attr('fill',res.bg).attr('stroke',res.col).attr('stroke-width',.7);
        // type badge
        rG.append('rect').attr('x',rx).attr('y',ry).attr('width',24).attr('height',iconH)
          .attr('rx',3).attr('fill',res.col).attr('fill-opacity',.3);
        rG.append('text').attr('x',rx+12).attr('y',ry+13).attr('text-anchor','middle')
          .attr('font-family','IBM Plex Mono').style('font-size','calc(7.5px * var(--txt-scale,1))').attr('font-weight','700')
          .attr('fill',res.col).text(res.type);
        // clip for text overflow
        const nameClip='rc-'+sl.sub.SubnetId.replace(/[^a-zA-Z0-9]/g,'')+'-'+ri;
        rG.append('clipPath').attr('id',nameClip).append('rect')
          .attr('x',rx+26).attr('y',ry).attr('width',iconW-28).attr('height',iconH);
        // name
        rG.append('text').attr('x',rx+28).attr('y',ry+10).attr('clip-path',`url(#${nameClip})`)
          .attr('font-family','IBM Plex Mono').style('font-size','calc(8px * var(--txt-scale,1))').attr('font-weight','600')
          .attr('fill','var(--text-primary)').text(res.name);
        // IP
        if(res.ip){
          rG.append('text').attr('x',rx+28).attr('y',ry+20).attr('clip-path',`url(#${nameClip})`)
            .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))')
            .attr('fill','var(--text-muted)').text(res.ip);
        }
        // state dot
        if(res.state){
          const sc=res.state==='running'?'#10b981':'#ef4444';
          rG.append('circle').attr('cx',rx+iconW-6).attr('cy',ry+6).attr('r',2.5).attr('fill',sc);
        }
        // nested children
        if(nCh>0){
          (res.children||[]).forEach((ch,ci)=>{
            const cy2=ry+RES_ICON-2+ci*RES_CHILD_H;
            const cx2=rx+26,cw=iconW-30,ch2=RES_CHILD_H-2;
            rG.append('rect').attr('x',cx2).attr('y',cy2).attr('width',cw).attr('height',ch2)
              .attr('rx',2).attr('fill',ch.bg).attr('stroke',ch.col).attr('stroke-width',.4);
            rG.append('text').attr('x',cx2+2).attr('y',cy2+ch2/2+2)
              .attr('font-family','IBM Plex Mono').style('font-size','calc(6px * var(--txt-scale,1))').attr('font-weight','600')
              .attr('fill',ch.col).text(ch.type);
            rG.append('text').attr('x',cx2+19).attr('y',cy2+ch2/2+2).attr('clip-path',`url(#${nameClip})`)
              .attr('font-family','IBM Plex Mono').style('font-size','calc(6px * var(--txt-scale,1))')
              .attr('fill','rgba(255,255,255,.5)').text(ch.name+(ch.detail?' '+ch.detail:''));
          });
        }
        rx+=iconW+RES_GAP;
        rci++;
      });
    } else {
      // empty subnet indicator
      sG.append('text').attr('x',sl.x+sl.w/2).attr('y',sl.y+sl.h/2+4).attr('text-anchor','middle')
        .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('fill','var(--text-muted)').attr('opacity',.4).text('No resources');
    }

    // click to open detail panel, hover for highlight only
    sG.on('mouseenter',function(){if(!_hlLocked)hlSub(sl.sub.SubnetId)})
    .on('mouseleave',()=>{clr()})
    .on('click',function(event){
      event.stopPropagation();
      const sid2=sl.sub.SubnetId;
      if(_hlLocked&&_hlKey===sid2&&_hlType==='sub'){
        // already locked on this subnet, just open panel
      } else {
        forceClr();hlSub(sid2);
        _hlLocked=true;_hlKey=sid2;_hlType='sub';showLockInd(true);
      }
      _lastRlType=null;_navStack=[];
      openSubnetPanel(sl.sub,vl.vpc.VpcId,{pubSubs,subRT,subNacl,instBySub,eniBySub,albBySub,sgByVpc,volByInst,enis,snapByVol,tgByAlb,wafByAlb,rdsBySub,ecsBySub,lambdaBySub,ecacheByVpc,redshiftByVpc,cfByAlb});
    });
  })});

  // gateway circles -- skip VPCEs (they get summary boxes instead)
  gwP.forEach((pos,id)=>{
    if(vpceIds.has(id))return;
    const gw=pos.gw,gG=ndL.append('g').attr('class','gw-node').attr('data-gwid',id),col=gcv(gw.type);
    gG.append('circle').attr('cx',pos.x).attr('cy',pos.y).attr('r',GR).attr('fill','var(--bg-primary)').attr('stroke',col).attr('stroke-width',2);
    gG.append('text').attr('class','gw-label').attr('x',pos.x).attr('y',pos.y+1).attr('text-anchor','middle').attr('dominant-baseline','middle').attr('fill',col).text(gw.type);
    const nm=gwNames[gw.id];
    const lblY=pos.y+GR+14;
    const lblTxt=nm&&nm!==gw.id?nm:sid(gw.id);
    const lblClass=nm&&nm!==gw.id?'gw-name':'gw-id';
    const tw=lblTxt.length*6.2+16;
    gG.append('rect').attr('x',pos.x-tw/2).attr('y',lblY-9).attr('width',tw).attr('height',15).attr('rx',4).attr('fill','rgba(10,17,30,.88)').attr('stroke','rgba(255,255,255,.08)').attr('stroke-width',.5);
    gG.append('text').attr('class',lblClass).attr('x',pos.x).attr('y',lblY).attr('text-anchor','middle').text(lblTxt);
    gG.on('mouseenter',function(){
      if(_hlLocked) return;
      hlGw(id);
      ndL.selectAll('.gw-node').classed('gw-hl',false);
      gG.classed('gw-hl',true);
      let h=`<div class="tt-title">${nm||gw.id}</div><div class="tt-sub">${gw.type} | ${gw.id}</div>`;
      const natInfo=nats.find(n=>n.NatGatewayId===gw.id);
      if(natInfo){h+=`<div class="tt-sec"><div class="tt-sh">NAT Gateway</div><div class="tt-r">Subnet: <span class="i">${natInfo.SubnetId||'N/A'}</span></div><div class="tt-r">State: ${natInfo.State||'N/A'}</div></div>`}
      tt.innerHTML=h;tt.style.display='block';
    }).on('mousemove',function(event){positionTooltip(event,tt)}).on('mouseleave',()=>{tt.style.display='none';clr()})
    .on('click',function(event){
      event.stopPropagation();
      if(_hlLocked&&_hlKey===id&&_hlType==='gw'){forceClr();return}
      forceClr();hlGw(id);
      ndL.selectAll('.gw-node').classed('gw-hl',false);gG.classed('gw-hl',true);
      _hlLocked=true;_hlKey=id;_hlType='gw';showLockInd(true);
      _lastRlType=null;_navStack=[];
      openGatewayPanel(gw.id,gw.type,{gwNames,igws,nats,vpns,vpces,peerings,rts,subnets,subRT,pubSubs,vpcs,tgwAttachments});
    });
  });

  // internet node - positioned at top-left
  if(iGwList.length){
    const iG=ndL.append('g').attr('class','internet-node');
    // Outer glow
    iG.append('circle').attr('cx',iX).attr('cy',iY).attr('r',42)
      .attr('fill','none').attr('stroke','var(--igw-color)').attr('stroke-width',1).attr('opacity',.15);
    // Main circle
    iG.append('circle').attr('cx',iX).attr('cy',iY).attr('r',36)
      .attr('fill','rgba(16,185,129,.06)').attr('stroke','var(--igw-color)').attr('stroke-width',2);
    // Globe effect
    iG.append('ellipse').attr('cx',iX).attr('cy',iY).attr('rx',22).attr('ry',36)
      .attr('fill','none').attr('stroke','var(--igw-color)').attr('stroke-width',1).attr('opacity',.25);
    iG.append('line').attr('x1',iX-36).attr('y1',iY).attr('x2',iX+36).attr('y2',iY)
      .attr('stroke','var(--igw-color)').attr('stroke-width',1).attr('opacity',.25);
    // Text inside circle
    iG.append('text').attr('x',iX).attr('y',iY+4).attr('text-anchor','middle')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(13px * var(--txt-scale,1))').attr('font-weight','700').attr('fill','var(--igw-color)').text('NET');
    // Text below circle
    iG.append('text').attr('x',iX).attr('y',iY+50).attr('text-anchor','middle')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(8px * var(--txt-scale,1))').attr('fill','var(--text-muted)').text('Internet');
    iG.append('text').attr('x',iX).attr('y',iY+62).attr('text-anchor','middle')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('fill','var(--igw-color)').text(iGwList.length+' Gateway'+(iGwList.length>1?'s':''));
    
    // Draw NET connections: L-shaped paths from bus-bar to each IGW.
    // Each IGW gets its own L-bend: horizontal from NET node at bus-bar Y,
    // then vertical down to IGW. No continuous bus bar — eliminates dead ends.
    const connectedIgwIds=new Set(Object.keys(tG).map(k=>k.split('|')[0]));
    const connectedIgwList=iGwList.filter(p=>connectedIgwIds.has(p.gw.id));
    // Group by X to handle stacked gateways at same position
    const netXGroups=new Map();
    connectedIgwList.forEach(pos=>{
      const gx=pos.x;
      if(!netXGroups.has(gx)) netXGroups.set(gx,[]);
      netXGroups.get(gx).push(pos);
    });
    // Collect X positions that reach bus-bar Y, sorted left to right
    const netXPositions=[];
    netXGroups.forEach((group,gx)=>{
      group.sort((a,b)=>(a.y-GR-4)-(b.y-GR-4));
      let reachesBus=false;
      for(let i=0;i<group.length;i++){
        const topY=i===0?iY:(group[i-1].y-GR-4);
        const botY=group[i].y-GR-4;
        const col='var(--igw-color)';
        if(Math.abs(botY-topY)>2){
          structG.append('path')
            .attr('class','route-trunk route-structural')
            .attr('d',`M${gx},${topY} L${gx},${botY}`)
            .attr('stroke',col).attr('stroke-width',3)
            .attr('data-gid',group[i].gw.id).attr('data-net-vert','1');
          if(topY===iY) reachesBus=true;
        }
      }
      if(reachesBus) netXPositions.push(gx);
    });
    netXPositions.sort((a,b)=>a-b);
    // Draw one horizontal bus from NET node to rightmost IGW column
    if(netXPositions.length>0){
      const rightmostNetX=netXPositions[netXPositions.length-1];
      structG.append('path')
        .attr('class','route-trunk route-structural')
        .attr('d',`M${iX+38},${iY} L${rightmostNetX},${iY}`)
        .attr('stroke','var(--igw-color)').attr('stroke-width',3)
        .attr('data-net-line','1');
    }
  }

  // VPCE summary nodes - positioned at bottom-left of VPC
  vL.forEach(vl=>{
    const vpcVpces=vpceByVpc[vl.vpc.VpcId]||[];
    if(!vpcVpces.length)return;
    const nw=70,nh=16;
    // Position at bottom-left inside VPC
    const gx=vl.x+nw/2+8;
    const ny=vl.y+vl.h-nh-8;
    const eG=ndL.append('g').attr('class','vpce-summary').style('cursor','pointer');
    eG.append('rect').attr('x',gx-nw/2).attr('y',ny).attr('width',nw).attr('height',nh).attr('rx',3)
      .attr('fill','rgba(167,139,250,.2)').attr('stroke','var(--vpce-color)').attr('stroke-width',1);
    eG.append('text').attr('x',gx).attr('y',ny+12).attr('text-anchor','middle').attr('font-family','IBM Plex Mono')
      .style('font-size','calc(8px * var(--txt-scale,1))').attr('font-weight','600').attr('fill','var(--vpce-color)').text(vpcVpces.length+' VPCE');
    // tooltip on hover
    eG.on('mouseenter',function(){
      let h='<div class="tt-title">VPC Endpoints ('+vpcVpces.length+')</div>';
      h+='<div class="tt-sub">'+gn(vl.vpc,vl.vpc.VpcId)+'</div>';
      h+='<div class="tt-sec"><div class="tt-sh">Endpoints</div>';
      vpcVpces.forEach(v=>{
        const vi=vpces.find(x=>x.VpcEndpointId===v.id);
        const svc=vi?.ServiceName||'?';
        const nm=gwNames[v.id];
        h+='<div class="tt-r"><span class="i">'+(nm||sid(v.id))+'</span> '+svc.split('.').pop()+' ['+vi?.VpcEndpointType+']</div>';
      });
      h+='</div>';
      tt.innerHTML=h;tt.style.display='block';
    }).on('mousemove',function(event){positionTooltip(event,tt)}).on('mouseleave',()=>{tt.style.display='none'})
    .on('click',function(event){event.stopPropagation();tt.style.display='none';_lastRlType=null;_navStack=[];openResourceList('Endpoints')});
  });

  // Private zone VPC badges - positioned at bottom-right of VPC
  let dnsBoxH=0;
  if(zones.length>0){
    const privZonesByVpc={};
    zones.forEach(z=>{
      if(z.Config?.PrivateZone&&z.VPCs){
        z.VPCs.forEach(v=>{
          const vid=v.VPCId||v.VpcId;
          if(vid)(privZonesByVpc[vid]=privZonesByVpc[vid]||[]).push(z);
        });
      }
    });
    vL.forEach(vl=>{
      const pz=privZonesByVpc[vl.vpc.VpcId];
      if(!pz||!pz.length)return;
      // Skip VPCs without valid layout - must have reasonable size and position
      if(!vl.w||vl.w<50||!vl.h||vl.h<50) return;
      // Skip if position is clearly wrong (too far from diagram area)
      if(vl.x<0||vl.y<0||vl.x>10000||vl.y>10000) return;
      // Skip unknown/disconnected VPCs
      if(unknownVL.includes(vl)) return;
      // Skip VPCs with no subnets rendered
      if(!vl.subs||vl.subs.length===0) return;
      const nw=70,nh=16;
      // Position badge at bottom-right of VPC (inside the VPC box)
      const gx=vl.x+vl.w-nw/2-8;
      const ny=vl.y+vl.h-nh-8;
      const dG=ndL.append('g').attr('class','dns-summary').style('cursor','pointer');
      dG.append('rect').attr('x',gx-nw/2).attr('y',ny).attr('width',nw).attr('height',nh).attr('rx',3)
        .attr('fill','rgba(14,165,233,.15)').attr('stroke','#0ea5e9').attr('stroke-width',1);
      dG.append('text').attr('x',gx).attr('y',ny+12).attr('text-anchor','middle').attr('font-family','IBM Plex Mono')
        .style('font-size','calc(8px * var(--txt-scale,1))').attr('font-weight','600').attr('fill','#0ea5e9').text(pz.length+' DNS');
      dG.on('mouseenter',function(){
        let h='<div class="tt-title">Private Hosted Zones ('+pz.length+')</div>';
        h+='<div class="tt-sub">'+gn(vl.vpc,vl.vpc.VpcId)+'</div>';
        h+='<div class="tt-sec"><div class="tt-sh">Zones</div>';
        pz.forEach(z=>{
          const zid=z.Id.replace('/hostedzone/','');
          h+='<div class="tt-r"><span class="i">'+z.Name+'</span> '+z.ResourceRecordSetCount+' records ['+zid+']</div>';
        });
        h+='</div>';
        tt.innerHTML=h;tt.style.display='block';
      }).on('mousemove',function(event){positionTooltip(event,tt)}).on('mouseleave',()=>{tt.style.display='none'})
      .on('click',function(event){event.stopPropagation();tt.style.display='none';_lastRlType=null;_navStack=[];openResourceList('R53')});
    });

    // DNS Zone section - positioned below all routing elements
    const dnsY=routingBottomY+40;
    const pubZones=zones.filter(z=>!z.Config?.PrivateZone);
    const privZones=zones.filter(z=>z.Config?.PrivateZone);
    const dnsBoxW=Math.max(320,allVpcRight-60);
    const dnsRecExp=_dnsRecordsExpanded;
    const recRowH=14;

    // Pre-calculate zone heights and positions
    const zoneLayouts=[];
    if(dnsRecExp){
      // Records expanded: single column, metadata + records nested inside
      const fullW=dnsBoxW-40;
      let cy=0;
      zones.forEach(z=>{
        const zid=z.Id.replace('/hostedzone/','');
        const isPub=!z.Config?.PrivateZone;
        const zRecs=recsByZoneMap[zid]||[];
        const assocVpcs=(!isPub&&z.VPCs)?z.VPCs.map(v=>{const vid=v.VPCId||v.VpcId;const vpc=vpcs.find(vp=>vp.VpcId===vid);return gn(vpc||{},vid)}).join(', '):'';
        let metaLines=2;
        if(assocVpcs)metaLines++;
        const headerH=18+metaLines*14+4;
        const recsH=zRecs.length>0?(4+zRecs.length*recRowH):16;
        const zh=headerH+recsH+6;
        zoneLayouts.push({x:70,y:cy,w:fullW,h:zh,recs:zRecs,assocVpcs});
        cy+=zh+6;
      });
    }else{
      // Default: 2-column compact zones with record count
      const colW2=Math.min(450,(dnsBoxW-40)/2);
      zones.forEach((z,zi)=>{
        const col=zi%2;
        const row=Math.floor(zi/2);
        zoneLayouts.push({x:70+col*(colW2+10),y:row*32,w:colW2-10,h:26,recs:[]});
      });
    }
    const totalContentH=dnsRecExp?
      (zoneLayouts.length>0?zoneLayouts[zoneLayouts.length-1].y+zoneLayouts[zoneLayouts.length-1].h:0):
      (Math.ceil(zones.length/2)*32);
    dnsBoxH=60+totalContentH+20;

    const dnsG=ndL.append('g').attr('class','dns-section');

    // Section container
    dnsG.append('rect').attr('x',60).attr('y',dnsY).attr('width',dnsBoxW).attr('height',dnsBoxH).attr('rx',8)
      .attr('fill','rgba(14,165,233,.06)').attr('stroke','#0ea5e9').attr('stroke-width',1.5).attr('stroke-dasharray','6 3');

    // Section title
    dnsG.append('text').attr('x',80).attr('y',dnsY+22).attr('font-family','IBM Plex Mono')
      .style('font-size','calc(14px * var(--txt-scale,1))').attr('font-weight','700').attr('fill','#0ea5e9').text('Route 53 Hosted Zones');
    dnsG.append('text').attr('x',80).attr('y',dnsY+36).attr('font-family','IBM Plex Mono')
      .style('font-size','calc(10px * var(--txt-scale,1))').attr('fill','var(--text-muted)').text(pubZones.length+' public, '+privZones.length+' private');

    // Records expand/collapse toggle button
    const togX=60+dnsBoxW-80;
    const togY=dnsY+8;
    const togG=dnsG.append('g').style('cursor','pointer');
    togG.append('rect').attr('x',togX).attr('y',togY).attr('width',70).attr('height',20).attr('rx',4)
      .attr('fill','rgba(14,165,233,.15)').attr('stroke','#0ea5e9').attr('stroke-width',0.8);
    togG.append('text').attr('x',togX+35).attr('y',togY+14).attr('text-anchor','middle')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(8px * var(--txt-scale,1))').attr('font-weight','600')
      .attr('fill','#0ea5e9').text(dnsRecExp?'\u25B2 Collapse':'\u25BC Expand');
    togG.on('click',function(event){
      event.stopPropagation();
      _dnsRecordsExpanded=!_dnsRecordsExpanded;
      renderMap();
    });

    const colW=Math.min(450,(dnsBoxW-40)/2);

    zones.forEach((z,zi)=>{
      const isPub=!z.Config?.PrivateZone;
      const zid=z.Id.replace('/hostedzone/','');
      const lay=zoneLayouts[zi];
      const zx=lay.x;
      const zy=dnsY+52+lay.y;
      const zw=lay.w;
      const zh=lay.h;

      const zG=dnsG.append('g').style('cursor','pointer');
      zG.append('rect').attr('x',zx).attr('y',zy).attr('width',zw).attr('height',zh).attr('rx',4)
        .attr('fill',isPub?'rgba(16,185,129,.18)':'rgba(14,165,233,.18)')
        .attr('stroke',isPub?'#10b981':'#0ea5e9').attr('stroke-width',1.5);

      // Icon indicator
      zG.append('circle').attr('cx',zx+12).attr('cy',zy+13).attr('r',6)
        .attr('fill',isPub?'#10b981':'#0ea5e9');
      zG.append('text').attr('x',zx+12).attr('y',zy+16.5).attr('text-anchor','middle')
        .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('font-weight','700')
        .attr('fill','#fff').text(isPub?'P':'R');

      // Zone name (full in expanded, truncated in compact)
      const recLabel=z.ResourceRecordSetCount+' records';
      const maxNameLen=dnsRecExp?999:Math.max(12,Math.floor((zw-80)/6));
      const dispName=dnsRecExp?z.Name:(z.Name.length>maxNameLen?z.Name.substring(0,maxNameLen-2)+'..':z.Name);
      zG.append('text').attr('x',zx+24).attr('y',zy+15).attr('font-family','IBM Plex Mono')
        .style('font-size','calc(10px * var(--txt-scale,1))').attr('font-weight','600').attr('fill',isPub?'#10b981':'#0ea5e9')
        .text(dispName);

      // Compact: record count only
      if(!dnsRecExp){
        zG.append('text').attr('x',zx+zw-8).attr('y',zy+15).attr('text-anchor','end')
          .attr('font-family','IBM Plex Mono').style('font-size','calc(9px * var(--txt-scale,1))').attr('fill','var(--text-muted)')
          .text(recLabel);
      }

      // Records expanded: metadata lines + record rows
      if(dnsRecExp){
        let my=zy+18;
        // Metadata: Zone ID
        zG.append('text').attr('x',zx+24).attr('y',my+14).attr('font-family','IBM Plex Mono')
          .style('font-size','calc(8px * var(--txt-scale,1))').attr('fill','var(--text-muted)')
          .text('Zone ID: '+zid+'  |  '+z.ResourceRecordSetCount+' records  |  '+(isPub?'Public':'Private'));
        my+=14;
        // Metadata: Associated VPCs (if private)
        if(lay.assocVpcs){
          zG.append('text').attr('x',zx+24).attr('y',my+14).attr('font-family','IBM Plex Mono')
            .style('font-size','calc(8px * var(--txt-scale,1))').attr('fill','var(--text-muted)')
            .text('VPCs: '+lay.assocVpcs);
          my+=14;
        }

        // Record sets (if available)
        if(lay.recs.length>0){
          my+=4;
          zG.append('line').attr('x1',zx+8).attr('y1',my).attr('x2',zx+zw-8).attr('y2',my)
            .attr('stroke',isPub?'#10b981':'#0ea5e9').attr('stroke-width',0.5).attr('stroke-opacity',0.4);
          my+=4;
          lay.recs.forEach(rec=>{
            const rName=(rec.Name||'').replace(/\.$/,'');
            const rType=rec.Type||'';
            const rVal=rec.AliasTarget?'ALIAS \u2192 '+(rec.AliasTarget.DNSName||'').replace(/\.$/,''):
              (rec.ResourceRecords||[]).map(rr=>rr.Value).join(', ');
            zG.append('text').attr('x',zx+10).attr('y',my+10).attr('font-family','IBM Plex Mono')
              .style('font-size','calc(7px * var(--txt-scale,1))').attr('font-weight','600').attr('fill',isPub?'#059669':'#0284c7')
              .text(rType);
            zG.append('text').attr('x',zx+50).attr('y',my+10).attr('font-family','IBM Plex Mono')
              .style('font-size','calc(8px * var(--txt-scale,1))').attr('fill','var(--text-primary)')
              .text(rName.length>50?rName.substring(0,48)+'..':rName);
            zG.append('text').attr('x',zx+350).attr('y',my+10).attr('font-family','IBM Plex Mono')
              .style('font-size','calc(7px * var(--txt-scale,1))').attr('fill','var(--text-muted)')
              .text(rVal.length>80?rVal.substring(0,78)+'..':rVal);
            my+=recRowH;
          });
        }else{
          my+=6;
          zG.append('text').attr('x',zx+24).attr('y',my+10).attr('font-family','IBM Plex Mono')
            .style('font-size','calc(8px * var(--txt-scale,1))').attr('font-style','italic').attr('fill','var(--text-muted)')
            .text('Click zone for details \u2022 Load record sets via "Record Sets" input');
        }
      }

      // Tooltip (always)
      zG.on('mouseenter',function(){
        let h='<div class="tt-title">'+(isPub?'Public':'Private')+' Hosted Zone</div>';
        h+='<div class="tt-sub">'+esc(z.Name)+'</div>';
        h+='<div class="tt-sec">';
        h+='<div class="tt-r"><span class="i">Zone ID</span> '+esc(zid)+'</div>';
        h+='<div class="tt-r"><span class="i">Records</span> '+z.ResourceRecordSetCount+'</div>';
        h+='<div class="tt-r"><span class="i">Type</span> '+(isPub?'Public':'Private')+'</div>';
        if(!isPub&&z.VPCs&&z.VPCs.length>0){
          h+='<div class="tt-sh" style="margin-top:6px">Associated VPCs</div>';
          z.VPCs.forEach(v=>{
            const vid=v.VPCId||v.VpcId;
            const vpc=vpcs.find(vp=>vp.VpcId===vid);
            h+='<div class="tt-r"><span class="i">'+gn(vpc||{},vid)+'</span> '+esc(vid)+'</div>';
          });
        }
        h+='</div>';
        tt.innerHTML=h;tt.style.display='block';
      }).on('mousemove',function(event){positionTooltip(event,tt)}).on('mouseleave',()=>{tt.style.display='none'})
      .on('click',function(event){event.stopPropagation();tt.style.display='none';_lastRlType=null;_navStack=[];openResourceList('R53')});
    });
  }

  // S3 Buckets section - positioned below DNS section (or below routing if no DNS)
  const dnsExists=zones.length>0;
  const dnsBase=routingBottomY+40;
  const dnsSectionH=dnsExists?dnsBoxH:0;
  let sectionBottomY=dnsExists?(dnsBase+dnsSectionH):(routingBottomY);
  if(s3bk.length>0){
    const s3Y=sectionBottomY+40;
    const s3BoxW=Math.max(320,allVpcRight-60);
    const s3Cols=3;
    const s3ColW=Math.min(320,(s3BoxW-40)/s3Cols);
    const s3RowH=24;
    const s3Rows=Math.ceil(s3bk.length/s3Cols);
    const s3BoxH=50+s3Rows*(s3RowH+4)+20;
    
    const s3G=ndL.append('g').attr('class','s3-section');
    s3G.append('rect').attr('x',60).attr('y',s3Y).attr('width',s3BoxW).attr('height',s3BoxH).attr('rx',8)
      .attr('fill','rgba(234,88,12,.04)').attr('stroke','#ea580c').attr('stroke-width',1.5).attr('stroke-dasharray','6 3');
    s3G.append('text').attr('x',80).attr('y',s3Y+22).attr('font-family','IBM Plex Mono')
      .style('font-size','calc(14px * var(--txt-scale,1))').attr('font-weight','700').attr('fill','#ea580c').text('S3 Buckets');
    s3G.append('text').attr('x',80).attr('y',s3Y+36).attr('font-family','IBM Plex Mono')
      .style('font-size','calc(10px * var(--txt-scale,1))').attr('fill','var(--text-muted)').text(s3bk.length+' buckets');
    
    s3bk.forEach((bk,bi)=>{
      const col=bi%s3Cols;
      const row=Math.floor(bi/s3Cols);
      const bx=70+col*(s3ColW+5);
      const by=s3Y+48+row*(s3RowH+4);
      
      const bG=s3G.append('g').style('cursor','pointer');
      bG.append('rect').attr('x',bx).attr('y',by).attr('width',s3ColW-10).attr('height',s3RowH).attr('rx',3)
        .attr('fill','rgba(234,88,12,.1)').attr('stroke','#ea580c').attr('stroke-width',0.8);
      
      const maxChars=Math.floor((s3ColW-20)/6);
      const dispName=bk.Name.length>maxChars?bk.Name.substring(0,maxChars-2)+'..':bk.Name;
      bG.append('text').attr('x',bx+6).attr('y',by+16).attr('font-family','IBM Plex Mono')
        .style('font-size','calc(10px * var(--txt-scale,1))').attr('font-weight','500').attr('fill','#ea580c').text(dispName);
      
      bG.on('mouseenter',function(){
        let h='<div class="tt-title">S3 Bucket</div>';
        h+='<div class="tt-sub">'+esc(bk.Name)+'</div>';
        h+='<div class="tt-sec">';
        h+='<div class="tt-r"><span class="i">Created</span> '+(bk.CreationDate||'N/A').split('T')[0]+'</div>';
        h+='</div>';
        tt.innerHTML=h;tt.style.display='block';
      }).on('mousemove',function(event){positionTooltip(event,tt)}).on('mouseleave',()=>{tt.style.display='none'})
      .on('click',function(event){event.stopPropagation();tt.style.display='none';_lastRlType=null;_navStack=[];openResourceList('S3')});
    });
    sectionBottomY=s3Y+s3BoxH;
  }

  // CloudFront distributions section
  if(cfDistributions.length>0){
    const cfY=sectionBottomY+40;
    const cfBoxW=Math.max(320,allVpcRight-60);
    const cfCols=2;
    const cfColW=Math.min(480,(cfBoxW-40)/cfCols);
    const cfRowH=28;
    const cfRows=Math.ceil(cfDistributions.length/cfCols);
    const cfBoxH=50+cfRows*(cfRowH+4)+20;

    const cfG=ndL.append('g').attr('class','cf-section');
    cfG.append('rect').attr('x',60).attr('y',cfY).attr('width',cfBoxW).attr('height',cfBoxH).attr('rx',8)
      .attr('fill','rgba(139,92,246,.06)').attr('stroke','#8b5cf6').attr('stroke-width',1.5).attr('stroke-dasharray','6 3');
    cfG.append('text').attr('x',80).attr('y',cfY+22).attr('font-family','IBM Plex Mono')
      .style('font-size','calc(14px * var(--txt-scale,1))').attr('font-weight','700').attr('fill','#8b5cf6').text('CloudFront Distributions');
    cfG.append('text').attr('x',80).attr('y',cfY+36).attr('font-family','IBM Plex Mono')
      .style('font-size','calc(10px * var(--txt-scale,1))').attr('fill','var(--text-muted)').text(cfDistributions.length+' distributions');

    cfDistributions.forEach((d,di)=>{
      const col=di%cfCols;
      const row=Math.floor(di/cfCols);
      const cx=70+col*(cfColW+5);
      const cy=cfY+48+row*(cfRowH+4);
      const aliases=(d.Aliases?.Items||[]);

      const cG=cfG.append('g').style('cursor','pointer');
      cG.append('rect').attr('x',cx).attr('y',cy).attr('width',cfColW-10).attr('height',cfRowH).attr('rx',3)
        .attr('fill','rgba(139,92,246,.12)').attr('stroke','#8b5cf6').attr('stroke-width',0.8);
      cG.append('text').attr('x',cx+6).attr('y',cy+12).attr('font-family','IBM Plex Mono')
        .style('font-size','calc(9px * var(--txt-scale,1))').attr('font-weight','600').attr('fill','#8b5cf6').text(d.DomainName||d.Id);
      if(aliases.length){
        cG.append('text').attr('x',cx+6).attr('y',cy+23).attr('font-family','IBM Plex Mono')
          .style('font-size','calc(8px * var(--txt-scale,1))').attr('fill','var(--text-muted)').text(aliases.join(', '));
      }

      cG.on('mouseenter',function(){
        let h='<div class="tt-title">CloudFront Distribution</div>';
        h+='<div class="tt-sub">'+esc(d.DomainName||d.Id)+'</div>';
        h+='<div class="tt-sec">';
        h+='<div class="tt-r"><span class="i">ID</span> '+esc(d.Id)+'</div>';
        h+='<div class="tt-r"><span class="i">Status</span> '+esc(d.Status||'?')+'</div>';
        if(aliases.length)h+='<div class="tt-r"><span class="i">Aliases</span> '+esc(aliases.join(', '))+'</div>';
        const origins=(d.Origins?.Items||[]);
        if(origins.length){
          h+='<div class="tt-sh" style="margin-top:4px">Origins</div>';
          origins.forEach(o=>{h+='<div class="tt-r"><span class="i">'+esc(o.Id||'')+'</span> '+esc(o.DomainName)+'</div>'});
        }
        if(d.WebACLId)h+='<div class="tt-r"><span class="i">WAF</span> '+esc(d.WebACLId.split('/').pop())+'</div>';
        h+='</div>';
        tt.innerHTML=h;tt.style.display='block';
      }).on('mousemove',function(event){positionTooltip(event,tt)}).on('mouseleave',()=>{tt.style.display='none'})
      .on('click',function(event){event.stopPropagation();tt.style.display='none';_lastRlType=null;_navStack=[];openResourceList('CF')});
    });
  }

  // stats bar
  _rlCtx={vpcs,subnets,pubSubs,rts,sgs,nacls,enis,igws,nats,vpces,instances,albs,tgs,peerings,vpns,volumes,snapshots,s3bk,zones,wafAcls,wafByAlb,tgByAlb,cfByAlb,rdsInstances,ecsServices,lambdaFns,ecacheClusters,redshiftClusters,cfDistributions,instBySub,albBySub,eniBySub,rdsBySub,ecsBySub,lambdaBySub,subRT,subNacl,sgByVpc,volByInst,snapByVol,ecacheByVpc,redshiftByVpc,tgwAttachments,recsByZone:recsByZoneMap,_multiAccount,_accounts,_regions,_multiRegion,iamRoleResources};
  const sb2=document.getElementById('statsBar');sb2.innerHTML='';sb2.style.display='flex';
  [{l:'VPCs',v:vpcs.length},{l:'Subnets',v:subnets.length},{l:'Public',v:pubSubs.size},{l:'Private',v:subnets.length-pubSubs.size},{l:'Gateways',v:gwSet.size},{l:'RTs',v:rts.length},{l:'NACLs',v:nacls.length},{l:'SGs',v:sgs.length},{l:'EC2',v:instances.length},{l:'ENIs',v:enis.length},{l:'ALBs',v:albs.length},{l:'TGs',v:tgs.length},{l:'RDS',v:rdsInstances.length},{l:'ECS',v:ecsServices.length},{l:'Lambda',v:lambdaFns.length},{l:'Cache',v:ecacheClusters.length},{l:'Redshift',v:redshiftClusters.length},{l:'Peering',v:peerings.length},{l:'VPNs',v:vpns.length},{l:'Endpoints',v:vpces.length},{l:'Volumes',v:volumes.length},{l:'Snapshots',v:snapshots.length},{l:'S3',v:s3bk.length},{l:'R53',v:zones.length},{l:'WAF',v:wafAcls.length},{l:'CF',v:cfDistributions.length}].forEach(s=>{
    if(s.v>0){const c=document.createElement('div');c.className='stat-chip';c.dataset.type=s.l;c.innerHTML=`<b>${s.v}</b>${s.l}`;c.addEventListener('click',()=>openResourceList(s.l));sb2.appendChild(c)}
  });
  // Compliance chip (grid layout)
  try{const findings=runComplianceChecks(_rlCtx);if(findings.length)addComplianceChip(sb2,findings);_addBUDRChip(sb2)}catch(ce){console.warn('Compliance check error:',ce)}
  if(_iamData){const _ic=(_iamData.roles?.length||0)+(_iamData.users?.length||0);if(_ic>0){const ic=document.createElement('div');ic.className='stat-chip';ic.classList.add('accent-amber');ic.innerHTML='<b>'+_ic+'</b> IAM';ic.addEventListener('click',()=>openResourceList('IAM'));sb2.appendChild(ic)}}
  _depGraph=null;
  try{_renderNoteBadges()}catch(ne){}
  try{_renderComplianceBadges()}catch(cbe){console.warn('Compliance badge error:',cbe)}
  try{if(Date.now()-_lastAutoSnap>120000){takeSnapshot('Render',true);_lastAutoSnap=Date.now()}}catch(se){}
  // Design validation chip (when in design mode)
  if(_designMode&&_lastDesignValidation){
    const sv=_lastDesignValidation;
    const dvC=document.createElement('div');
    dvC.className='compliance-chip '+(sv.errors.length?'critical':sv.warnings.length?'warn':'clean');
    dvC.innerHTML='<b>'+(sv.errors.length+sv.warnings.length)+'</b> Design';
    dvC.title=sv.errors.concat(sv.warnings).join('\n');
    dvC.addEventListener('click',()=>{
      const cl=document.getElementById('changeLog');
      cl.style.display=cl.style.display==='block'?'none':'block';
    });
    sb2.appendChild(dvC);
  }
  // Multi-account chip
  if(_multiAccount){
    const acC=document.createElement('div');
    acC.className='stat-chip';
    acC.classList.add('accent-purple');
    acC.innerHTML='<b>'+_accounts.size+'</b> Accounts';
    sb2.appendChild(acC);
  }
  if(_multiRegion){
    const rgC=document.createElement('div');
    rgC.className='stat-chip';
    rgC.classList.add('accent-blue');
    rgC.innerHTML='<b>'+_regions.size+'</b> Regions';
    sb2.appendChild(rgC);
  }
  // Diff overlay (grid layout)
  try{if(_diffMode)setTimeout(_applyDiffOverlay,150)}catch(de){}
  document.getElementById('legend').style.display='flex';
  if(_isMobile())document.getElementById('legend').classList.add('collapsed');
  document.getElementById('exportBar').style.display='flex';
  document.getElementById('bottomToolbar').style.display='flex';
  setTimeout(()=>d3.select('#zoomFit').dispatch('click'),100);
  }catch(e){console.error('renderMap error:',e);alert('Render error: '+e.message);document.getElementById('loadingOverlay').style.display='none'}
}

document.getElementById('renderBtn').addEventListener('click',function(){
  renderMap(()=>{_autoSaveSession()});
});

