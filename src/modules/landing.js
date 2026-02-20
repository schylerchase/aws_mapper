// Landing page and initial UI rendering
// Handles landing zone maps and executive overview
// Extracted from index.html for modularization

function renderLandingZoneMap(ctx){
  const {vpcs,subnets,rts,sgs,nacls,enis,igws,nats,vpces,instances,albs,tgs,peerings,vpns,volumes,snapshots,s3bk,zones,
    subByVpc,pubSubs,subRT,gwSet,subNacl,sgByVpc,instBySub,eniBySub,albBySub,volByInst,volBySub,pvGws,shGws,vpceByVpc,vpceIds,gwNames,
    snapByVol,tgByAlb,wafAcls,wafByAlb,
    rdsInstances,ecsServices,lambdaFns,ecacheClusters,redshiftClusters,tgwAttachments,cfDistributions,
    rdsBySub,ecsBySub,lambdaBySub,ecacheByVpc,redshiftByVpc,cfByAlb,_multiAccount,_accounts,iamRoleResources}=ctx;

  // Parse record sets for DNS expanded view
  const lzAllRecSets=ext(safeParse(gv('in_r53records')),['ResourceRecordSets','RecordSets']);
  const lzRecsByZone={};
  lzAllRecSets.forEach(r=>{if(r.HostedZoneId)(lzRecsByZone[r.HostedZoneId]=lzRecsByZone[r.HostedZoneId]||[]).push(r)});

  const svg=d3.select('#mapSvg');
  const W=document.querySelector('.main').clientWidth,H=document.querySelector('.main').clientHeight;
  
  // Layout constants - increased padding for proper containment
  const SH_BASE=46,SG=8,VP=28,VH=40,GR=18,CW=6.2;
  const LZ_RES_ICON=22,LZ_CHILD_H=10,LZ_RES_GAP=3,LZ_RES_COLS=2,LZ_RES_TOP=34,LZ_RES_BOT=10;
  const HUB_X=160,HUB_Y=100;
  const SPOKE_START_X=600,SPOKE_START_Y=60;
  const SPOKE_COL_GAP=200,SPOKE_ROW_GAP=40; // Tighter gaps for flatter layout
  
  // Tree context for buildResTree
  const lzTreeCtx={instBySub,albBySub,rdsBySub,ecsBySub,lambdaBySub,volByInst,volBySub,enis,eniByInst,tgByAlb,wafByAlb,cfByAlb,snapByVol,eniBySub};
  const lzSubTrees={};
  subnets.forEach(s=>{lzSubTrees[s.SubnetId]=buildResTree(s.SubnetId,lzTreeCtx)});
  
  function lzSubH(sid){
    if(_detailLevel===0) return SH_BASE;
    const tree=lzSubTrees[sid]||[];
    if(!tree.length)return SH_BASE;
    const maxCh=Math.max(0,...tree.map(r=>(r.children||[]).length));
    const rowH=LZ_RES_ICON+maxCh*LZ_CHILD_H+5;
    const rows=Math.ceil(tree.length/LZ_RES_COLS);
    return Math.max(SH_BASE, LZ_RES_TOP+rows*rowH+LZ_RES_BOT);
  }
  
  // Identify hub VPC
  const hubKeywords=['shared','connectivity','hub','transit','network','core','central','management'];
  const userHubName=(document.getElementById('hubVpcName')?.value||'').toLowerCase().trim();
  
  let hubVpc=null;
  if(userHubName){
    hubVpc=vpcs.find(v=>gn(v,v.VpcId).toLowerCase().includes(userHubName));
  }
  if(!hubVpc){
    hubVpc=vpcs.find(v=>{
      const vn=gn(v,v.VpcId).toLowerCase();
      return hubKeywords.some(k=>vn.includes(k));
    });
  }
  // Fallback: VPC with most TGW/peering connections
  if(!hubVpc){
    let maxConn=0;
    vpcs.forEach(v=>{
      let conn=0;
      rts.filter(rt=>rt.VpcId===v.VpcId).forEach(rt=>{
        (rt.Routes||[]).forEach(r=>{
          if(r.TransitGatewayId||r.VpcPeeringConnectionId)conn++;
        });
      });
      peerings.forEach(p=>{
        if(p.RequesterVpcInfo?.VpcId===v.VpcId||p.AccepterVpcInfo?.VpcId===v.VpcId)conn++;
      });
      if(conn>maxConn){maxConn=conn;hubVpc=v;}
    });
  }
  if(!hubVpc)hubVpc=vpcs[0];
  
  const spokeVpcs=vpcs.filter(v=>v.VpcId!==hubVpc?.VpcId);
  
  // Calculate VPC dimensions with proper padding
  const LZ_AZ_HDR=16;
  function lzSortByAZ(ss){return ss.slice().sort((a,b)=>(a.AvailabilityZone||'').localeCompare(b.AvailabilityZone||''))}
  function lzCountAZHeaders(ss){const azs=new Set();ss.forEach(s=>{if(s.AvailabilityZone)azs.add(s.AvailabilityZone)});return Math.max(0,azs.size-1)}
  function lzBuildSubLayouts(ss,baseX,baseY,sw){
    const layouts=[];
    const sorted=lzSortByAZ(ss);
    let cy=baseY+VH+VP;
    let lastAZ=null;
    sorted.forEach(s=>{
      const az=s.AvailabilityZone||'';
      if(az&&lastAZ!==null&&az!==lastAZ){cy+=LZ_AZ_HDR+SG;layouts.push({azLabel:az,x:baseX+VP,y:cy-LZ_AZ_HDR-SG/2,w:sw})}
      else if(az&&lastAZ===null&&sorted.filter(x=>x.AvailabilityZone).length>1){layouts.push({azLabel:az,x:baseX+VP,y:cy-2,w:sw});cy+=LZ_AZ_HDR}
      lastAZ=az;
      const sh=lzSubH(s.SubnetId);
      layouts.push({sub:s,x:baseX+VP,y:cy,w:sw,h:sh,pub:pubSubs.has(s.SubnetId)});
      cy+=sh+SG;
    });
    return layouts;
  }
  function calcVpcSize(vpc,maxW){
    const ss=subByVpc[vpc.VpcId]||[];
    let sw=240;
    const vpcNameLen=gn(vpc,vpc.VpcId).length*CW+60;
    sw=Math.max(sw,vpcNameLen);
    ss.forEach(s=>{sw=Math.max(sw,gn(s,s.SubnetId).length*CW+100)});
    sw=Math.min(sw,maxW||350);
    let subnetHeight=0;
    const sorted=lzSortByAZ(ss);
    sorted.forEach((s,i)=>{subnetHeight+=lzSubH(s.SubnetId)+(i<sorted.length-1?SG:0)});
    subnetHeight+=lzCountAZHeaders(sorted)*(LZ_AZ_HDR+SG);
    const totalHeight=VH+VP+subnetHeight+VP+40;
    return {w:sw+VP*2,h:Math.max(totalHeight,140),sw};
  }
  
  // Layout hub VPC (larger, on left)
  const hubSize=calcVpcSize(hubVpc,450);
  const hubSubs=subByVpc[hubVpc.VpcId]||[];
  const hubLayout={
    vpc:hubVpc,x:HUB_X,y:HUB_Y,w:hubSize.w,h:hubSize.h,sw:hubSize.sw,isHub:true,
    subs:lzBuildSubLayouts(hubSubs,HUB_X,HUB_Y,hubSize.sw)
  };
  
  // Dynamic spoke start X - leave room for hub + TGW area
  const actualSpokeStartX=Math.max(SPOKE_START_X,HUB_X+hubSize.w+180);
  
  // Calculate spoke VPC sizes first
  const spokeSizes=spokeVpcs.map(vpc=>({vpc,...calcVpcSize(vpc,320)}));
  
  // Determine optimal column count - prefer wide/flat layout over tall columns
  const totalSpokeHeight=spokeSizes.reduce((sum,s)=>sum+s.h,0);
  const avgHeight=totalSpokeHeight/spokeSizes.length||200;
  // Target 2-3 VPCs per column max for flatter layout
  const targetColHeight=Math.min(hubLayout.h,avgHeight*2.5);
  
  // Distribute VPCs into columns based on height
  const columns=[];
  let currentCol=[];
  let currentColHeight=0;
  
  spokeSizes.forEach(spoke=>{
    if(currentColHeight>0&&currentColHeight+spoke.h>targetColHeight){
      columns.push(currentCol);
      currentCol=[];
      currentColHeight=0;
    }
    currentCol.push(spoke);
    currentColHeight+=spoke.h+SPOKE_ROW_GAP;
  });
  if(currentCol.length>0)columns.push(currentCol);
  
  // Layout spoke VPCs by column with proper Y spacing
  // First calculate max width per column
  const colMaxWidths=columns.map(col=>Math.max(...col.map(s=>s.w)));
  
  const spokeLayouts=[];
  let colX=actualSpokeStartX;
  columns.forEach((colVpcs,colIdx)=>{
    let y=SPOKE_START_Y;
    const colW=colMaxWidths[colIdx];
    colVpcs.forEach(spoke=>{
      const ss=subByVpc[spoke.vpc.VpcId]||[];
      spokeLayouts.push({
        vpc:spoke.vpc,x:colX,y,w:spoke.w,h:spoke.h,sw:spoke.sw,isHub:false,
        subs:lzBuildSubLayouts(ss,colX,y,spoke.sw)
      });
      y+=spoke.h+SPOKE_ROW_GAP;
    });
    colX+=colW+SPOKE_COL_GAP;
  });
  
  const vL=[hubLayout,...spokeLayouts];
  
  // Find TGW for hub-spoke connections
  let tgwId=null;
  shGws.forEach(gw=>{if(gw.type==='TGW')tgwId=gw.id});
  
  // Calculate diagram bounds
  const maxX=Math.max(...vL.map(v=>v.x+v.w))+200;
  const maxY=Math.max(...vL.map(v=>v.y+v.h))+100;
  const minSpokeX=spokeLayouts.length?Math.min(...spokeLayouts.map(s=>s.x)):actualSpokeStartX;
  
  // SVG setup
  const g=svg.append('g').attr('class','map-root');
  const zB=d3.zoom().scaleExtent([.08,5]).on('zoom',e=>{g.attr('transform',e.transform);document.getElementById('zoomLevel').textContent=Math.round(e.transform.k*100)+'%'});svg.call(zB);
  _mapSvg=svg;_mapZoom=zB;_mapG=g;
  bindZoomButtons();
  
  const ndL=g.append('g').attr('class','nodes-layer');
  const lnL=g.append('g').attr('class','lines-layer');
  const lzRouteG=lnL.append('g').attr('class','route-group');
  const lzStructG=lnL.append('g').attr('class','route-structural'); // structural lines at full opacity
  const tt=document.getElementById('tooltip');
  
  // Calculate vertical center of all VPCs for TGW positioning
  const allVpcMinY=Math.min(...vL.map(v=>v.y));
  const allVpcMaxY=Math.max(...vL.map(v=>v.y+v.h));
  const diagramCenterY=(allVpcMinY+allVpcMaxY)/2;
  
  // TGW position (centered between hub and first spoke column)
  const tgwX=(hubLayout.x+hubLayout.w+minSpokeX)/2;
  const tgwY=diagramCenterY;
  
  // Internet node position (top left, well above all routing) - defined early for routing calculations
  const iX=HUB_X-180;
  const iY=Math.min(HUB_Y-60, tgwY-80);
  
  // Draw connections from hub to TGW
  const lzAllPaths=[]; // {path, vids:[]} for highlight system
  const lzVpcRoutes=new Map(); // vid -> [{d, stroke}] per-VPC clipped routes
  if(tgwId){
    const connY=hubLayout.y+hubLayout.h/2;
    const path=Math.abs(connY-tgwY)<2
      ?`M${hubLayout.x+hubLayout.w},${connY} L${tgwX-28},${tgwY}`
      :`M${hubLayout.x+hubLayout.w},${connY} L${tgwX-28},${connY} L${tgwX-28},${tgwY}`;
    const p=lzRouteG.append('path')
      .attr('class','route-trunk animated')
      .attr('d',path)
      .attr('stroke','var(--tgw-color)');
    lzAllPaths.push({p,vids:[hubVpc.VpcId],shared:true});
    // hub gets its own route entry
    if(!lzVpcRoutes.has(hubVpc.VpcId))lzVpcRoutes.set(hubVpc.VpcId,[]);
    lzVpcRoutes.get(hubVpc.VpcId).push({d:path,stroke:'var(--tgw-color)'});
  }
  
  // Draw connections from TGW to spokes - route ABOVE all VPCs but below NET routing
  if(spokeLayouts.length&&tgwId){
    const colMap=new Map();
    spokeLayouts.forEach(s=>{
      const colKey=Math.round(s.x/100)*100;
      if(!colMap.has(colKey))colMap.set(colKey,[]);
      colMap.get(colKey).push(s);
    });
    
    const sortedCols=[...colMap.entries()].sort((a,b)=>a[0]-b[0]);
    const firstColX=sortedCols[0]?sortedCols[0][1][0].x:tgwX+100;
    
    // Route Y for TGW: 30px above VPCs (leaving room for NET routing above)
    const allVpcTops=[hubLayout.y,...spokeLayouts.map(s=>s.y)];
    const minVpcTop=Math.min(...allVpcTops);
    const routeY=minVpcTop-30;
    
    // Main trunk from TGW UP to route level
    const allSpokeVids=spokeLayouts.map(s=>s.vpc.VpcId);
    const trunkD=`M${tgwX+28},${tgwY} L${tgwX+28},${routeY}`;
    const p0=lzRouteG.append('path')
      .attr('class','route-trunk animated')
      .attr('d',trunkD)
      .attr('stroke','var(--tgw-color)');
    lzAllPaths.push({p:p0,vids:allSpokeVids,shared:true});
    
    let prevBusX=tgwX+28;
    const horizSegs=[]; // accumulate horizontal segments across columns
    sortedCols.forEach(([colKey,colSpokes],colIdx)=>{
      const colX=Math.min(...colSpokes.map(s=>s.x));
      const localBusX=colX-60; // More clearance from VPC (was 30)
      const sortedSpokes=[...colSpokes].sort((a,b)=>a.y-b.y);
      const colVids=colSpokes.map(s=>s.vpc.VpcId);
      
      // Horizontal segment to column bus
      const horizD=`M${prevBusX},${routeY} L${localBusX},${routeY}`;
      horizSegs.push({d:horizD,stroke:'var(--tgw-color)'});
      const p1=lzRouteG.append('path')
        .attr('class','route-trunk animated')
        .attr('d',horizD)
        .attr('stroke','var(--tgw-color)');
      const laterVids=sortedCols.slice(colIdx).flatMap(([,cs])=>cs.map(s=>s.vpc.VpcId));
      lzAllPaths.push({p:p1,vids:laterVids,shared:true});
      prevBusX=localBusX;
      
      // Vertical segments from route level down through all spokes
      // Calculate all connection Y positions first
      const spokeConnYs=sortedSpokes.map(spoke=>{
        const spokeGws=pvGws[spoke.vpc.VpcId]||[];
        return spoke.y+Math.max(60,spokeGws.length*50+20);
      });
      const maxConnY=Math.max(...spokeConnYs);
      
      // Single vertical from routeY to max connection
      const vertFullD=`M${localBusX},${routeY} L${localBusX},${maxConnY}`;
      const p2=lzRouteG.append('path')
        .attr('class','route-trunk animated')
        .attr('d',vertFullD)
        .attr('stroke','var(--tgw-color)');
      lzAllPaths.push({p:p2,vids:colVids,shared:true});
      
      // Snapshot current horizontal segments for this column
      const horizForThisCol=[...horizSegs];
      
      // Horizontal branches + build per-VPC clipped routes
      sortedSpokes.forEach((spoke,spokeIdx)=>{
        // Connect at VPC center, below any gateways
        const spokeGws=pvGws[spoke.vpc.VpcId]||[];
        const gwCount=spokeGws.length;
        const connY=spoke.y+Math.max(60,gwCount*50+20);
        const branchD=`M${localBusX},${connY} L${spoke.x},${connY}`;
        const p4=lzRouteG.append('path')
          .attr('class','route-trunk animated')
          .attr('d',branchD)
          .attr('stroke','var(--tgw-color)');
        lzAllPaths.push({p:p4,vids:[spoke.vpc.VpcId]});
        
        // Per-VPC clipped route: trunk + all horiz segs to this col + clipped vertical + branch
        const vid=spoke.vpc.VpcId;
        if(!lzVpcRoutes.has(vid))lzVpcRoutes.set(vid,[]);
        const routes=lzVpcRoutes.get(vid);
        const cl='var(--tgw-color)';
        routes.push({d:trunkD,stroke:cl});
        horizForThisCol.forEach(h=>routes.push(h));
        routes.push({d:`M${localBusX},${routeY} L${localBusX},${connY}`,stroke:cl});
        routes.push({d:branchD,stroke:cl});
      });
    });
  }
  
  // Draw TGW node with tooltip
  if(tgwId){
    const tgwG=ndL.append('g').attr('class','lz-tgw-node').style('cursor','pointer');
    tgwG.append('circle').attr('cx',tgwX).attr('cy',tgwY).attr('r',28)
      .attr('fill','rgba(236,72,153,.1)').attr('stroke','var(--tgw-color)').attr('stroke-width',2);
    tgwG.append('text').attr('x',tgwX).attr('y',tgwY-4).attr('text-anchor','middle')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(10px * var(--txt-scale,1))').attr('font-weight','600').attr('fill','var(--tgw-color)').text('TGW');
    tgwG.append('text').attr('x',tgwX).attr('y',tgwY+10).attr('text-anchor','middle')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('fill','var(--text-muted)').text('Transit');
    
    // TGW tooltip
    const tgwName=gwNames[tgwId]||'Transit Gateway';
    tgwG.on('mouseenter',function(){
      if(_lzLocked) return;
      lzHlResetNodes();
      lzOlL.selectAll('*').remove();
      lzRouteG.style('opacity','0.06');
      g.classed('hl-active',true);
      // show all nodes
      ndL.selectAll('.lz-tgw-node,.lz-gw-node,.internet-node').classed('lz-hl',true);ndL.selectAll('.vpc-group').each(function(){d3.select(this).select('rect').style('stroke-width','3px').style('filter','drop-shadow(0 0 8px rgba(99,180,255,.7))');});
      const olStyle={fill:'none','stroke-width':'4px',opacity:'1','stroke-dasharray':'8 5','pointer-events':'none'};
      lzAllPaths.forEach(e=>{try{
        const d=e.p.attr('d'),stroke=e.p.attr('stroke');
        if(d){const p=lzOlL.append('path').attr('d',d).style('stroke',stroke);
        Object.entries(olStyle).forEach(([k,v])=>p.style(k,v));}
      }catch(ex){}});
      let h='<div class="tt-title">'+esc(tgwName)+'</div>';
      h+='<div class="tt-sub">Transit Gateway</div>';
      h+='<div class="tt-sec"><div class="tt-sh">Details</div>';
      h+='<div class="tt-r">ID: <span class="i">'+esc(tgwId)+'</span></div>';
      h+='<div class="tt-r">Connected VPCs: <span class="i">'+vL.length+'</span></div>';
      h+='</div>';
      tt.innerHTML=h;tt.style.display='block';
    }).on('mousemove',function(event){
      positionTooltip(event,tt);
    }).on('mouseleave',()=>{tt.style.display='none';lzClr()})
    .on('click',function(event){
      event.stopPropagation();
      if(_lzLocked&&_lzKey==='tgw'){lzForceClr();return}
      lzForceClr();
      lzOlL.selectAll('*').remove();lzRouteG.style('opacity','0.06');g.classed('hl-active',true);
      ndL.selectAll('.lz-tgw-node,.lz-gw-node,.internet-node').classed('lz-hl',true);ndL.selectAll('.vpc-group').each(function(){d3.select(this).select('rect').style('stroke-width','3px').style('filter','drop-shadow(0 0 8px rgba(99,180,255,.7))');});
      const olS={fill:'none','stroke-width':'4px',opacity:'1','stroke-dasharray':'8 5','pointer-events':'none'};
      lzAllPaths.forEach(e=>{try{const d=e.p.attr('d'),s=e.p.attr('stroke');if(d){const p=lzOlL.append('path').attr('d',d).style('stroke',s);Object.entries(olS).forEach(([k,v])=>p.style(k,v))}}catch(ex){}});
      _lzLocked=true;_lzKey='tgw';lzShowLock(true);
      _lastRlType=null;_navStack=[];
      openGatewayPanel(tgwId,'TGW',{gwNames,igws,nats,vpns,vpces,peerings,rts,subnets,subRT,pubSubs,vpcs,tgwAttachments});
    });
  }
  
  // Draw VPC boxes with tooltips
  vL.forEach(vl=>{
    const vG=ndL.append('g').attr('class','vpc-group').attr('data-vpc-id',vl.vpc.VpcId).style('cursor','pointer');
    // Hub gets special styling
    const strokeColor=vl.isHub?'#7C3AED':'var(--vpc-stroke)';
    const strokeWidth=vl.isHub?2.5:1.5;
    const fillColor=vl.isHub?'rgba(124,58,237,.04)':'rgba(59,130,246,.03)';
    
    vG.append('rect').attr('x',vl.x).attr('y',vl.y).attr('width',vl.w).attr('height',vl.h)
      .attr('fill',fillColor).attr('stroke',strokeColor).attr('stroke-width',strokeWidth).attr('rx',vl.isHub?8:0);
    
    // Hub label
    if(vl.isHub){
      vG.append('rect').attr('x',vl.x).attr('y',vl.y-20).attr('width',50).attr('height',18).attr('rx',3)
        .attr('fill','#7C3AED');
      vG.append('text').attr('x',vl.x+25).attr('y',vl.y-7).attr('text-anchor','middle')
        .attr('font-family','IBM Plex Mono').style('font-size','calc(8px * var(--txt-scale,1))').attr('font-weight','600').attr('fill','#fff').text('HUB');
    }
    
    // VPC name on first line
    const _lzVpcName=gn(vl.vpc,vl.vpc.VpcId);
    vG.append('text').attr('class','vpc-label').attr('x',vl.x+12).attr('y',vl.y+16)
      .attr('textLength',Math.min(_lzVpcName.length*8,vl.w*0.55)).attr('lengthAdjust','spacing').text(_lzVpcName);
    
    // CIDR and region on second line
    const ss=subByVpc[vl.vpc.VpcId]||[];
    const az=ss.find(s=>s.AvailabilityZone)?.AvailabilityZone||'';
    const region=az.replace(/[a-z]$/,'')||'';
    const lzAcctTag=_multiAccount&&vl.vpc._accountId&&vl.vpc._accountId!=='default'?(' ['+vl.vpc._accountId+']'):'';
    vG.append('text').attr('class','vpc-cidr').attr('x',vl.x+12).attr('y',vl.y+28)
      .text(vl.vpc.CidrBlock+(region?' '+region:'')+lzAcctTag);
    if(_multiAccount&&vl.vpc._accountId!=='default'){
      const lzAcCol=vl.vpc._ctxColor||getAccountColor(vl.vpc._accountId);
      if(lzAcCol){
        vG.append('rect').attr('x',vl.x).attr('y',vl.y).attr('width',8).attr('height',vl.h).attr('fill',lzAcCol).attr('rx',2).attr('opacity',.7);
        const lzAcLbl=vl.vpc._accountLabel||vl.vpc._accountId;
        const lzMaxCh=Math.floor(vl.h/7);
        vG.append('text').attr('x',vl.x+5).attr('y',vl.y+vl.h-6).attr('transform','rotate(-90,'+((vl.x+5))+','+((vl.y+vl.h-6))+')')
          .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('fill','#fff').attr('font-weight','600').attr('letter-spacing','.5px')
          .text(lzAcLbl.length>lzMaxCh?lzAcLbl.slice(0,lzMaxCh-1)+'…':lzAcLbl);
      }
    }

    // VPCE badge - positioned at bottom left of VPC
    const vpcVpces=vpceByVpc[vl.vpc.VpcId]||[];
    if(vpcVpces.length){
      const bw=65,bh=16;
      vG.append('rect').attr('x',vl.x+8).attr('y',vl.y+vl.h-bh-6).attr('width',bw).attr('height',bh).attr('rx',3)
        .attr('fill','rgba(167,139,250,.2)').attr('stroke','var(--vpce-color)').attr('stroke-width',.5);
      vG.append('text').attr('x',vl.x+8+bw/2).attr('y',vl.y+vl.h-bh/2-2).attr('text-anchor','middle')
        .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('fill','var(--vpce-color)').text(vpcVpces.length+' VPCE');
    }
    
    // VPC tooltip (on header area only)
    const headerRect=vG.append('rect').attr('x',vl.x).attr('y',vl.y).attr('width',vl.w).attr('height',VH)
      .attr('fill','transparent').style('cursor','pointer');
    headerRect.on('mouseenter',function(){
      if(!_lzLocked) lzHlVpc(vl.vpc.VpcId);
      const vpcGws=pvGws[vl.vpc.VpcId]||[];
      let h='<div class="tt-title">'+gn(vl.vpc,vl.vpc.VpcId)+'</div>';
      h+='<div class="tt-sub">'+(vl.isHub?'Hub VPC':'Spoke VPC')+'</div>';
      h+='<div class="tt-sec"><div class="tt-sh">Details</div>';
      h+='<div class="tt-r">CIDR: <span class="i">'+esc(vl.vpc.CidrBlock)+'</span></div>';
      h+='<div class="tt-r">Region: <span class="i">'+(region||'N/A')+'</span></div>';
      h+='<div class="tt-r">ID: <span class="i">'+esc(vl.vpc.VpcId)+'</span></div>';
      h+='<div class="tt-r">Subnets: <span class="i">'+ss.length+'</span></div>';
      h+='</div>';
      if(vpcGws.length){
        h+='<div class="tt-sec"><div class="tt-sh">Gateways ('+vpcGws.length+')</div>';
        vpcGws.forEach(gw=>{
          const nm=gwNames[gw.id]||sid(gw.id);
          h+='<div class="tt-r"><span class="i">'+esc(nm)+'</span> '+gw.type+'</div>';
        });
        h+='</div>';
      }
      if(vpcVpces.length){
        h+='<div class="tt-sec"><div class="tt-sh">VPC Endpoints ('+vpcVpces.length+')</div>';
        vpcVpces.slice(0,5).forEach(v=>{
          const vi=vpces.find(x=>x.VpcEndpointId===v.id);
          h+='<div class="tt-r"><span class="i">'+esc(vi?.ServiceName?.split('.').pop()||'?')+'</span></div>';
        });
        if(vpcVpces.length>5)h+='<div class="tt-r">... and '+(vpcVpces.length-5)+' more</div>';
        h+='</div>';
      }
      tt.innerHTML=h;tt.style.display='block';
    }).on('mousemove',function(event){
      positionTooltip(event,tt);
    }).on('mouseleave',()=>{tt.style.display='none';lzClr()})
    .on('click',function(event){
      event.stopPropagation();
      const vid=vl.vpc.VpcId;
      if(_lzLocked&&_lzKey===vid){lzForceClr();return}
      lzForceClr();lzHlVpc(vid);_lzLocked=true;_lzKey=vid;lzShowLock(true);
    });
  });
  
  // LZ highlight overlay layer and functions
  const lzOlL=g.append('g').attr('class','lz-overlay');
  let _lzLocked=false, _lzKey=null;
  const lzLockInd=document.getElementById('hlLockInd');
  function lzShowLock(v){lzLockInd.style.display=v?'block':'none'}
  function lzHlResetNodes(){
    ndL.selectAll('.lz-gw-node').classed('lz-hl',false);
    ndL.selectAll('.lz-tgw-node').classed('lz-hl',false);
    ndL.selectAll('.internet-node').classed('lz-hl',false);
    ndL.selectAll('.vpc-group').each(function(){
      d3.select(this).select('rect').style('stroke-width',null).style('filter',null);
    });
  }
  function lzHlVpc(vid){
    lzOlL.selectAll('*').remove();
    lzRouteG.style('opacity','0.06');
    g.classed('hl-active',true);
    lzHlResetNodes();
    // Show TGW (connects all VPCs)
    ndL.selectAll('.lz-tgw-node').classed('lz-hl',true);
    // Glow this VPC box
    ndL.selectAll('.vpc-group[data-vpc-id="'+vid+'"]').each(function(){
      d3.select(this).select('rect').style('stroke-width','3px').style('filter','drop-shadow(0 0 8px rgba(99,180,255,.7))');
    });
    // Show this VPC's gateways
    ndL.selectAll('.lz-gw-node[data-vpc="'+vid+'"]').classed('lz-hl',true);
    // Show NET if VPC has IGW or NAT
    const hasInet=ndL.selectAll('.lz-gw-node[data-vpc="'+vid+'"]').nodes()
      .some(n=>{ const t=n.getAttribute('data-gwtype'); return t==='IGW'||t==='NAT'; });
    if(hasInet) ndL.selectAll('.internet-node').classed('lz-hl',true);
    
    const olStyle={fill:'none','stroke-width':'4px',opacity:'1','stroke-dasharray':'8 5','pointer-events':'none'};
    const vpcRoutes=lzVpcRoutes.get(vid);
    if(vpcRoutes&&vpcRoutes.length){
      vpcRoutes.forEach(r=>{
        const p=lzOlL.append('path').attr('d',r.d).style('stroke',r.stroke);
        Object.entries(olStyle).forEach(([k,v])=>p.style(k,v));
      });
    } else {
      lzAllPaths.forEach(e=>{
        if(e.vids.includes(vid)){
          const d=e.p.attr('d'), stroke=e.p.attr('stroke');
          const p=lzOlL.append('path').attr('d',d).style('stroke',stroke);
          Object.entries(olStyle).forEach(([k,v])=>p.style(k,v));
        }
      });
    }
  }
  function lzClr(){
    if(_lzLocked) return;
    lzOlL.selectAll('*').remove();
    lzRouteG.style('opacity',null);
    g.classed('hl-active',false);
    lzHlResetNodes();
  }
  function lzForceClr(){
    _lzLocked=false;_lzKey=null;lzShowLock(false);
    lzOlL.selectAll('*').remove();
    lzRouteG.style('opacity',null);
    g.classed('hl-active',false);
    lzHlResetNodes();
  }
  if(window._lzHlUnlockHandler)document.removeEventListener('hl-unlock',window._lzHlUnlockHandler);
  window._lzHlUnlockHandler=lzForceClr;document.addEventListener('hl-unlock',lzForceClr);
  svg.on('click',function(event){
    if(!event.target.closest('.lz-gw-node')&&!event.target.closest('.lz-tgw-node')&&!event.target.closest('.subnet-node')&&!event.target.closest('.internet-node')&&!event.target.closest('.route-hitarea')){
      lzForceClr();
    }
  });
  
  // Add clickable hitareas on all LZ route paths
  const lzHitL=g.insert('g','.lz-overlay').attr('class','lz-hitareas');
  lzAllPaths.forEach(e=>{
    if(!e.p) return;
    const d=e.p.attr('d');
    if(!d) return;
    // Determine target: single VPC -> that VPC, shared -> 'tgw', gwId -> owning VPC
    const tgtVid=e.vids.length===1?e.vids[0]:null;
    const hitKey=tgtVid||'tgw';
    
    const ha=lzHitL.append('path').attr('class','route-hitarea').attr('d',d);
    ha.on('mouseenter',function(){
      if(_lzLocked) return;
      if(hitKey==='tgw'){
        lzHlResetNodes();
        lzOlL.selectAll('*').remove();
        lzRouteG.style('opacity','0.06');
        g.classed('hl-active',true);
        ndL.selectAll('.lz-tgw-node,.lz-gw-node,.internet-node').classed('lz-hl',true);ndL.selectAll('.vpc-group').each(function(){d3.select(this).select('rect').style('stroke-width','3px').style('filter','drop-shadow(0 0 8px rgba(99,180,255,.7))');});
        const olS={fill:'none','stroke-width':'4px',opacity:'1','stroke-dasharray':'8 5','pointer-events':'none'};
        lzAllPaths.forEach(x=>{
          if(!x.p) return;
          const pd=x.p.attr('d'),ps=x.p.attr('stroke');
          const pp=lzOlL.append('path').attr('d',pd).style('stroke',ps);
          Object.entries(olS).forEach(([k,v])=>pp.style(k,v));
        });
      } else {
        lzHlVpc(hitKey);
      }
    }).on('mouseleave',()=>{lzClr()})
    .on('click',function(event){
      event.stopPropagation();
      if(_lzLocked&&_lzKey===hitKey){lzForceClr();return}
      lzForceClr();
      if(hitKey==='tgw'){
        lzOlL.selectAll('*').remove();lzRouteG.style('opacity','0.06');g.classed('hl-active',true);
        ndL.selectAll('.lz-tgw-node,.lz-gw-node,.internet-node').classed('lz-hl',true);ndL.selectAll('.vpc-group').each(function(){d3.select(this).select('rect').style('stroke-width','3px').style('filter','drop-shadow(0 0 8px rgba(99,180,255,.7))');});
        const olS={fill:'none','stroke-width':'4px',opacity:'1','stroke-dasharray':'8 5','pointer-events':'none'};
        lzAllPaths.forEach(x=>{if(!x.p)return;const pd=x.p.attr('d'),ps=x.p.attr('stroke');const pp=lzOlL.append('path').attr('d',pd).style('stroke',ps);Object.entries(olS).forEach(([k,v])=>pp.style(k,v))});
      } else {
        lzHlVpc(hitKey);
      }
      _lzLocked=true;_lzKey=hitKey;lzShowLock(true);
    });
  });
  // build subRT lookup for LZ tooltips (with Main route table fallback)
  const lzMainRT={};
  rts.forEach(rt=>{if((rt.Associations||[]).some(a=>a.Main))lzMainRT[rt.VpcId]=rt});
  const lzSubRT={};
  rts.forEach(rt=>{(rt.Associations||[]).forEach(as=>{if(as.SubnetId)lzSubRT[as.SubnetId]=rt})});
  subnets.forEach(s=>{if(!lzSubRT[s.SubnetId]&&lzMainRT[s.VpcId])lzSubRT[s.SubnetId]=lzMainRT[s.VpcId]});

  // Draw subnets with tooltips
  vL.forEach(vl=>{
    // Draw AZ separator labels (hub-spoke path)
    vl.subs.filter(sl=>sl.azLabel).forEach(sl=>{
      ndL.append('text').attr('x',sl.x).attr('y',sl.y+LZ_AZ_HDR-2).attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('font-weight','700').attr('fill','var(--text-muted)').attr('opacity',.6).attr('letter-spacing','1px').text('AZ: '+sl.azLabel.slice(-2).toUpperCase());
      ndL.append('line').attr('x1',sl.x+38).attr('y1',sl.y+LZ_AZ_HDR-5).attr('x2',sl.x+sl.w).attr('y2',sl.y+LZ_AZ_HDR-5).attr('stroke','var(--border)').attr('stroke-width',.5).attr('opacity',.4);
    });
    vl.subs.filter(sl=>sl.sub).forEach(sl=>{
    const sG=ndL.append('g').attr('class','subnet-node').attr('data-subnet-id',sl.sub.SubnetId).style('cursor','pointer');
    const col=sl.pub?'var(--subnet-public)':'var(--subnet-private)';
    sG.append('rect').attr('x',sl.x).attr('y',sl.y).attr('width',sl.w).attr('height',sl.h)
      .attr('fill',sl.pub?'rgba(6,182,212,.15)':'rgba(139,92,246,.15)').attr('stroke',col).attr('stroke-width',1.2);
    sG.append('text').attr('class','subnet-label').attr('x',sl.x+8).attr('y',sl.y+16).text(gn(sl.sub,sl.sub.SubnetId));
    sG.append('text').attr('class','subnet-cidr').attr('x',sl.x+8).attr('y',sl.y+28).text(sl.sub.CidrBlock+(sl.sub.AvailabilityZone?' '+sl.sub.AvailabilityZone.slice(-2):''));
    sG.append('text').attr('x',sl.x+sl.w-6).attr('y',sl.y+12).attr('text-anchor','end')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(6px * var(--txt-scale,1))').attr('font-weight','600').attr('fill',col).text(sl.pub?'PUB':'PRV');
    
    // Resource icons inside subnet (tree-based with nesting)
    const lzTree=lzSubTrees[sl.sub.SubnetId]||[];
    
    if(_detailLevel===0&&lzTree.length>0){
      const counts={};
      lzTree.forEach(r=>{counts[r.type]=(counts[r.type]||0)+1});
      const summary=Object.entries(counts).map(([t,c])=>c+' '+t).join(', ');
      sG.append('text').attr('x',sl.x+6).attr('y',sl.y+sl.h-5)
        .attr('font-family','IBM Plex Mono').style('font-size','calc(5px * var(--txt-scale,1))').attr('fill','var(--text-muted)').attr('opacity',.5).text(summary);
    } else if(lzTree.length>0){
      const iconW=Math.max(60,Math.floor((sl.w-12)/LZ_RES_COLS)-LZ_RES_GAP);
      const maxCh=Math.max(0,...lzTree.map(r=>(r.children||[]).length));
      const rowH=LZ_RES_ICON+maxCh*LZ_CHILD_H+5;
      let rx=sl.x+5,ry=sl.y+LZ_RES_TOP,rci=0;
      lzTree.forEach((res,ri)=>{
        if(rci>=LZ_RES_COLS){rci=0;rx=sl.x+5;ry+=rowH;}
        const nCh=(res.children||[]).length;
        const iconH=LZ_RES_ICON+nCh*LZ_CHILD_H;
        const rG=sG.append('g').attr('class','res-node');
        if(res.rid) rG.attr('data-id',res.rid);
        rG.on('mouseenter',function(event){
          event.stopPropagation();
          if(!_lzLocked) lzHlVpc(vl.vpc.VpcId);
          tt.innerHTML=resTooltipHtml(res,sl.sub.SubnetId,lzSubRT);
          tt.style.display='block';
        }).on('mousemove',function(event){
          positionTooltip(event,tt);
        }).on('mouseleave',function(){
          tt.style.display='none';
        }).on('click',function(event){
          event.stopPropagation();
          var resId=d3.select(this).attr('data-id');
          if(resId) _openResourceSpotlight(resId);
        });
        rG.style('cursor','pointer');
        rG.append('rect').attr('x',rx).attr('y',ry).attr('width',iconW).attr('height',iconH)
          .attr('rx',2).attr('fill',res.bg).attr('stroke',res.col).attr('stroke-width',.5);
        rG.append('rect').attr('x',rx).attr('y',ry).attr('width',20).attr('height',iconH)
          .attr('rx',2).attr('fill',res.col).attr('fill-opacity',.25);
        rG.append('text').attr('x',rx+10).attr('y',ry+11).attr('text-anchor','middle')
          .attr('font-family','IBM Plex Mono').style('font-size','calc(5px * var(--txt-scale,1))').attr('font-weight','700')
          .attr('fill',res.col).text(res.type);
        const nameClip='lzrc-'+sl.sub.SubnetId.replace(/[^a-zA-Z0-9]/g,'')+'-'+ri;
        rG.append('clipPath').attr('id',nameClip).append('rect')
          .attr('x',rx+22).attr('y',ry).attr('width',iconW-24).attr('height',iconH);
        rG.append('text').attr('x',rx+24).attr('y',ry+9).attr('clip-path',`url(#${nameClip})`)
          .attr('font-family','IBM Plex Mono').style('font-size','calc(5.5px * var(--txt-scale,1))').attr('font-weight','600')
          .attr('fill','var(--text-primary)').text(res.name);
        if(res.ip){
          rG.append('text').attr('x',rx+24).attr('y',ry+17).attr('clip-path',`url(#${nameClip})`)
            .attr('font-family','IBM Plex Mono').style('font-size','calc(4.5px * var(--txt-scale,1))')
            .attr('fill','var(--text-muted)').text(res.ip);
        }
        if(res.state){
          const sc=res.state==='running'?'#10b981':'#ef4444';
          rG.append('circle').attr('cx',rx+iconW-4).attr('cy',ry+5).attr('r',2).attr('fill',sc);
        }
        if(nCh>0){
          (res.children||[]).forEach((ch,ci)=>{
            const cy2=ry+LZ_RES_ICON-2+ci*LZ_CHILD_H;
            const cx2=rx+22,cw=iconW-26,ch2=LZ_CHILD_H-2;
            rG.append('rect').attr('x',cx2).attr('y',cy2).attr('width',cw).attr('height',ch2)
              .attr('rx',2).attr('fill',ch.bg).attr('stroke',ch.col).attr('stroke-width',.4);
            rG.append('text').attr('x',cx2+2).attr('y',cy2+ch2/2+2)
              .attr('font-family','IBM Plex Mono').style('font-size','calc(4px * var(--txt-scale,1))').attr('font-weight','600')
              .attr('fill',ch.col).text(ch.type);
            rG.append('text').attr('x',cx2+17).attr('y',cy2+ch2/2+2).attr('clip-path',`url(#${nameClip})`)
              .attr('font-family','IBM Plex Mono').style('font-size','calc(4px * var(--txt-scale,1))')
              .attr('fill','rgba(255,255,255,.5)').text(ch.name+(ch.detail?' '+ch.detail:''));
          });
        }
        rx+=iconW+LZ_RES_GAP;
        rci++;
      });
    } else {
      sG.append('text').attr('x',sl.x+sl.w/2).attr('y',sl.y+sl.h/2+4).attr('text-anchor','middle')
        .attr('font-family','IBM Plex Mono').style('font-size','calc(6px * var(--txt-scale,1))').attr('fill','var(--text-muted)').attr('opacity',.4).text('No resources');
    }
    
    // Subnet tooltip, highlight, and click
    const subSi=instBySub[sl.sub.SubnetId]||[];
    const subSa=albBySub[sl.sub.SubnetId]||[];
    sG.on('mouseenter',function(){
      if(!_lzLocked) lzHlVpc(vl.vpc.VpcId);
      let h='<div class="tt-title">'+gn(sl.sub,sl.sub.SubnetId)+'</div>';
      h+='<div class="tt-sub">'+(sl.pub?'Public':'Private')+' Subnet</div>';
      h+='<div class="tt-sec"><div class="tt-sh">Details</div>';
      h+='<div class="tt-r">CIDR: <span class="i">'+esc(sl.sub.CidrBlock)+'</span></div>';
      h+='<div class="tt-r">AZ: <span class="i">'+esc(sl.sub.AvailabilityZone||'N/A')+'</span></div>';
      h+='<div class="tt-r">ID: <span class="i">'+esc(sl.sub.SubnetId)+'</span></div>';
      h+='</div>';
      if(subSi.length){
        h+='<div class="tt-sec"><div class="tt-sh">EC2 Instances ('+subSi.length+')</div>';
        subSi.slice(0,5).forEach(inst=>{
          const nm=inst.Tags?.find(t=>t.Key==='Name')?.Value||inst.InstanceId;
          h+='<div class="tt-r"><span class="i">'+esc(nm)+'</span> '+esc(inst.InstanceType)+' ['+esc(inst.State?.Name)+']</div>';
        });
        if(subSi.length>5)h+='<div class="tt-r">... and '+(subSi.length-5)+' more</div>';
        h+='</div>';
      }
      if(subSa.length){
        h+='<div class="tt-sec"><div class="tt-sh">Load Balancers ('+subSa.length+')</div>';
        subSa.forEach(lb=>{h+='<div class="tt-r"><span class="i">'+esc(lb.LoadBalancerName||'ALB')+'</span> '+esc(lb.Type)+'</div>'});
        h+='</div>';
      }
      tt.innerHTML=h;tt.style.display='block';
    }).on('mousemove',function(event){
      positionTooltip(event,tt);
    }).on('mouseleave',()=>{tt.style.display='none';lzClr()})
    .on('click',function(event){
      event.stopPropagation();
      tt.style.display='none';
      const vid=vl.vpc.VpcId;
      if(!(_lzLocked&&_lzKey===vid)){
        lzForceClr();lzHlVpc(vid);
        _lzLocked=true;_lzKey=vid;lzShowLock(true);
      }
      _lastRlType=null;_navStack=[];
      openSubnetPanel(sl.sub,vl.vpc.VpcId,{pubSubs,subRT,subNacl,instBySub,eniBySub,albBySub,sgByVpc,volByInst,enis,snapByVol,tgByAlb,wafByAlb,rdsBySub,ecsBySub,lambdaBySub,ecacheByVpc,redshiftByVpc,cfByAlb});
    });
  });});

  // Draw gateways for hub VPC (IGW/NAT on left side)
  const hubGws=pvGws[hubVpc.VpcId]||[];
  const igwGws=hubGws.filter(g=>g.type==='IGW'||g.type==='NAT');
  
  // Draw NET node first (so lines go behind it)
  if(igwGws.length){
    const iG=ndL.append('g').attr('class','internet-node');
    // Outer glow
    iG.append('circle').attr('cx',iX).attr('cy',iY).attr('r',38)
      .attr('fill','none').attr('stroke','var(--igw-color)').attr('stroke-width',1).attr('opacity',.2);
    // Main circle
    iG.append('circle').attr('cx',iX).attr('cy',iY).attr('r',32)
      .attr('fill','rgba(16,185,129,.08)').attr('stroke','var(--igw-color)').attr('stroke-width',2);
    // Globe icon effect
    iG.append('ellipse').attr('cx',iX).attr('cy',iY).attr('rx',20).attr('ry',32)
      .attr('fill','none').attr('stroke','var(--igw-color)').attr('stroke-width',1).attr('opacity',.3);
    iG.append('line').attr('x1',iX-32).attr('y1',iY).attr('x2',iX+32).attr('y2',iY)
      .attr('stroke','var(--igw-color)').attr('stroke-width',1).attr('opacity',.3);
    // Text
    iG.append('text').attr('x',iX).attr('y',iY+4).attr('text-anchor','middle')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(11px * var(--txt-scale,1))').attr('font-weight','700').attr('fill','var(--igw-color)').text('NET');
    iG.append('text').attr('x',iX).attr('y',iY+48).attr('text-anchor','middle')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(8px * var(--txt-scale,1))').attr('fill','var(--text-muted)').text('Internet');
    iG.style('cursor','pointer');
    iG.on('mouseenter',function(){
      if(_lzLocked) return;
      lzHlVpc(hubVpc.VpcId);
    }).on('mouseleave',()=>{lzClr()})
    .on('click',function(event){
      event.stopPropagation();
      const vid=hubVpc.VpcId;
      if(_lzLocked&&_lzKey===vid){lzForceClr();return}
      lzForceClr();lzHlVpc(vid);_lzLocked=true;_lzKey=vid;lzShowLock(true);
    });
  }
  
  // Draw gateways and animated connection lines
  // Use trunk-based routing: single vertical trunk from NET, horizontal branches to gateways
  const igwNatGws=hubGws.filter(g=>g.type==='IGW'||g.type==='NAT');
  const trunkX=iX+50; // Vertical trunk X position

  let gwY=hubLayout.y+50;
  hubGws.forEach((gw,i)=>{
    const gx=hubLayout.x-70;
    const gG=ndL.append('g').attr('class','lz-gw-node').attr('data-vpc',hubVpc.VpcId).attr('data-gwtype',gw.type).style('cursor','pointer');
    const col=gw.type==='IGW'?'var(--igw-color)':'var(--nat-color)';
    
    // Gateway circle
    gG.append('circle').attr('cx',gx).attr('cy',gwY).attr('r',GR)
      .attr('fill',gw.type==='IGW'?'rgba(16,185,129,.15)':'rgba(251,146,60,.15)')
      .attr('stroke',col).attr('stroke-width',2);
    gG.append('text').attr('x',gx).attr('y',gwY+4).attr('text-anchor','middle')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(9px * var(--txt-scale,1))').attr('font-weight','600').attr('fill',col).text(gw.type);
    const gwNm=gwNames[gw.id]||'';
    const lzLblTxt=gwNm||sid(gw.id);
    const lzLblY=gwY+GR+14;
    const lzTw=lzLblTxt.length*5.2+14;
    gG.append('rect').attr('x',gx-lzTw/2).attr('y',lzLblY-9).attr('width',lzTw).attr('height',14).attr('rx',4).attr('fill','rgba(10,17,30,.88)').attr('stroke','rgba(255,255,255,.08)').attr('stroke-width',.5);
    gG.append('text').attr('x',gx).attr('y',lzLblY).attr('text-anchor','middle')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('fill',gwNm?'var(--text-secondary)':'var(--text-muted)').text(lzLblTxt);

    // Gateway tooltip
    const gwName=gwNames[gw.id]||sid(gw.id);
    gG.on('mouseenter',function(){
      if(!_lzLocked) lzHlVpc(hubVpc.VpcId);
      let h='<div class="tt-title">'+esc(gwName)+'</div>';
      h+='<div class="tt-sub">'+esc(gw.type)+' Gateway</div>';
      h+='<div class="tt-sec"><div class="tt-sh">Details</div>';
      h+='<div class="tt-r">ID: <span class="i">'+esc(gw.id)+'</span></div>';
      h+='<div class="tt-r">Type: <span class="i">'+esc(gw.type)+'</span></div>';
      h+='<div class="tt-r">VPC: <span class="i">'+gn(hubVpc,hubVpc.VpcId)+'</span></div>';
      h+='</div>';
      if(gw.type==='NAT'){
        const natInfo=nats.find(n=>n.NatGatewayId===gw.id);
        if(natInfo){
          h+='<div class="tt-sec"><div class="tt-sh">NAT Info</div>';
          h+='<div class="tt-r">Subnet: <span class="i">'+esc(natInfo.SubnetId||'N/A')+'</span></div>';
          h+='<div class="tt-r">State: <span class="i">'+esc(natInfo.State||'N/A')+'</span></div>';
          h+='</div>';
        }
      }
      tt.innerHTML=h;tt.style.display='block';
    }).on('mousemove',function(event){
      positionTooltip(event,tt);
    }).on('mouseleave',()=>{tt.style.display='none';lzClr()})
    .on('click',function(event){
      event.stopPropagation();
      const vid=hubVpc.VpcId;
      if(_lzLocked&&_lzKey===vid){lzForceClr();return}
      lzForceClr();lzHlVpc(vid);_lzLocked=true;_lzKey=vid;lzShowLock(true);
      _lastRlType=null;_navStack=[];
      openGatewayPanel(gw.id,gw.type,{gwNames,igws,nats,vpns,vpces,peerings,rts,subnets,subRT,pubSubs,vpcs,tgwAttachments});
    });

    // Connection line from gateway to hub (offset per gateway)
    const hubConnY=gwY;
    const pg=lzStructG.append('path')
      .attr('class','route-trunk animated')
      .attr('d',`M${gx+GR},${hubConnY} L${hubLayout.x},${hubConnY}`)
      .attr('stroke',col);
    lzAllPaths.push({p:pg,vids:[hubVpc.VpcId],gwId:gw.id});
    if(!lzVpcRoutes.has(hubVpc.VpcId))lzVpcRoutes.set(hubVpc.VpcId,[]);
    lzVpcRoutes.get(hubVpc.VpcId).push({d:`M${gx+GR},${hubConnY} L${hubLayout.x},${hubConnY}`,stroke:col});
    
    gwY+=55;
  });
  
  // Draw NET-to-hub-gateways trunk (single vertical + horizontal branches)
  // These go in lzStructG for full visibility (not faded route-group)
  if(igwNatGws.length){
    const firstGwY=hubLayout.y+50;
    const lastGwY=firstGwY+(igwNatGws.length-1)*55;
    const hubGx=hubLayout.x-70;
    
    // Route from NET bottom edge: down then right to trunk
    const netBottomY=iY+34; // Just below NET circle edge
    const trunkTopY=firstGwY-20; // Start trunk above first gateway
    
    // Path from NET bottom: down, then right to trunk X
    const netDownPath=`M${iX},${netBottomY} L${iX},${trunkTopY} L${trunkX},${trunkTopY}`;
    lzStructG.append('path')
      .attr('class','route-trunk animated')
      .attr('d',netDownPath)
      .attr('stroke','var(--igw-color)');
    
    // Vertical trunk from top down to last gateway level
    const trunkPath=`M${trunkX},${trunkTopY} L${trunkX},${lastGwY}`;
    lzStructG.append('path')
      .attr('class','route-trunk animated')
      .attr('d',trunkPath)
      .attr('stroke','var(--igw-color)');
    
    // Horizontal branches to each gateway
    igwNatGws.forEach((gw,i)=>{
      const col=gw.type==='IGW'?'var(--igw-color)':'var(--nat-color)';
      const branchY=firstGwY+i*55;
      const branchPath=`M${trunkX},${branchY} L${hubGx-GR},${branchY}`;
      const pBranch=lzStructG.append('path')
        .attr('class','route-trunk animated')
        .attr('d',branchPath)
        .attr('stroke',col);
      // Still track for highlight system
      lzAllPaths.push({p:pBranch,vids:[hubVpc.VpcId],gwId:gw.id});
      lzVpcRoutes.get(hubVpc.VpcId).push({d:branchPath,stroke:col});
    });
    // Add NET-to-trunk paths to hub VPC routes so they light up on highlight
    lzVpcRoutes.get(hubVpc.VpcId).push({d:netDownPath,stroke:'var(--igw-color)'});
    lzVpcRoutes.get(hubVpc.VpcId).push({d:trunkPath,stroke:'var(--igw-color)'});
  }
  
  // Draw gateways for spoke VPCs (on right side of each spoke)
  spokeLayouts.forEach(spoke=>{
    const spokeGws=pvGws[spoke.vpc.VpcId]||[];
    if(!spokeGws.length)return;
    
    let sgY=spoke.y+30;
    const sgX=spoke.x+spoke.w+80; // Center in gap (was 25)
    
    // Draw subtle flow indicator from VPC to gateway area
    const flowY=spoke.y+Math.max(60,spokeGws.length*50+20);
    lzRouteG.append('path')
      .attr('class','route-trunk animated')
      .attr('d',`M${spoke.x+spoke.w},${flowY} L${spoke.x+spoke.w+20},${flowY} L${spoke.x+spoke.w+20},${spoke.y+30} L${sgX-16},${spoke.y+30}`)
      .attr('stroke','rgba(100,120,150,0.3)')
      .attr('stroke-dasharray','4 4');
    
    spokeGws.forEach((gw,i)=>{
      const gG=ndL.append('g').attr('class','lz-gw-node').attr('data-vpc',spoke.vpc.VpcId).attr('data-gwtype',gw.type).style('cursor','pointer');
      const col=gw.type==='IGW'?'var(--igw-color)':gw.type==='NAT'?'var(--nat-color)':gw.type==='VGW'?'var(--vgw-color)':'var(--text-muted)';
      const fillCol=gw.type==='IGW'?'rgba(16,185,129,.25)':gw.type==='NAT'?'rgba(251,146,60,.25)':gw.type==='VGW'?'rgba(239,68,68,.25)':'rgba(100,100,100,.25)';
      
      // Gateway circle - increased size and visibility
      gG.append('circle').attr('cx',sgX).attr('cy',sgY).attr('r',16)
        .attr('fill',fillCol).attr('stroke',col).attr('stroke-width',2);
      gG.append('text').attr('x',sgX).attr('y',sgY+4).attr('text-anchor','middle')
        .attr('font-family','IBM Plex Mono').style('font-size','calc(8px * var(--txt-scale,1))').attr('font-weight','600').attr('fill',col).text(gw.type);
      const sgNm=gwNames[gw.id]||'';
      const skLblTxt=sgNm||sid(gw.id);
      const skLblY=sgY+22;
      const skTw=skLblTxt.length*5.2+14;
      gG.append('rect').attr('x',sgX-skTw/2).attr('y',skLblY-9).attr('width',skTw).attr('height',14).attr('rx',4).attr('fill','rgba(10,17,30,.88)').attr('stroke','rgba(255,255,255,.08)').attr('stroke-width',.5);
      gG.append('text').attr('x',sgX).attr('y',skLblY).attr('text-anchor','middle')
        .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('fill',sgNm?'var(--text-secondary)':'var(--text-muted)').text(skLblTxt);

      // Connection line from spoke to gateway
      const psg=lzRouteG.append('path')
        .attr('class','route-trunk animated')
        .attr('d',`M${spoke.x+spoke.w},${sgY} L${sgX-16},${sgY}`)
        .attr('stroke',col);
      lzAllPaths.push({p:psg,vids:[spoke.vpc.VpcId],gwId:gw.id});
      if(!lzVpcRoutes.has(spoke.vpc.VpcId))lzVpcRoutes.set(spoke.vpc.VpcId,[]);
      lzVpcRoutes.get(spoke.vpc.VpcId).push({d:`M${spoke.x+spoke.w},${sgY} L${sgX-16},${sgY}`,stroke:col});
      
      // Gateway tooltip
      const gwName=gwNames[gw.id]||sid(gw.id);
      gG.on('mouseenter',function(){
        if(!_lzLocked) lzHlVpc(spoke.vpc.VpcId);
        let h='<div class="tt-title">'+esc(gwName)+'</div>';
        h+='<div class="tt-sub">'+esc(gw.type)+' Gateway</div>';
        h+='<div class="tt-sec"><div class="tt-sh">Details</div>';
        h+='<div class="tt-r">ID: <span class="i">'+esc(gw.id)+'</span></div>';
        h+='<div class="tt-r">VPC: <span class="i">'+gn(spoke.vpc,spoke.vpc.VpcId)+'</span></div>';
        h+='</div>';
        tt.innerHTML=h;tt.style.display='block';
      }).on('mousemove',function(event){
        positionTooltip(event,tt);
      }).on('mouseleave',()=>{tt.style.display='none';lzClr()})
      .on('click',function(event){
        event.stopPropagation();
        const vid=spoke.vpc.VpcId;
        if(_lzLocked&&_lzKey===vid){lzForceClr();return}
        lzForceClr();lzHlVpc(vid);_lzLocked=true;_lzKey=vid;lzShowLock(true);
        _lastRlType=null;_navStack=[];
        openGatewayPanel(gw.id,gw.type,{gwNames,igws,nats,vpns,vpces,peerings,rts,subnets,subRT,pubSubs,vpcs,tgwAttachments});
      });

      sgY+=50;
    });
  });
  
  // Draw spoke gateway to NET connections using a shared right-side trunk
  // Collect all spoke IGW/NAT gateways with their positions
  const spokeInetGws=[];
  spokeLayouts.forEach(spoke=>{
    const spokeGws=pvGws[spoke.vpc.VpcId]||[];
    let sgY=spoke.y+30;
    const sgX=spoke.x+spoke.w+80; // Match actual drawing position
    spokeGws.forEach((gw,i)=>{
      if(gw.type==='IGW'||gw.type==='NAT'){
        spokeInetGws.push({gw,sgX,sgY,vid:spoke.vpc.VpcId,col:gw.type==='IGW'?'var(--igw-color)':'var(--nat-color)'});
      }
      sgY+=50;
    });
  });
  
  if(spokeInetGws.length&&igwGws.length){
    // Route level above all VPCs - offset each gateway to avoid overlap
    const allVpcTops=[hubLayout.y,...spokeLayouts.map(s=>s.y)];
    const baseRouteLevel=Math.min(...allVpcTops)-40;

    // Shared trunk approach: vertical trunk to right of NET, horizontal bus to NET circle
    const spokeTrunkX=iX+34; // Right edge of NET circle (radius 32) + 2px gap

    // Track gateway index per VPC for horizontal offset
    const vpcGwIndex={};

    // Draw per-gateway paths: gateway -> exit -> routeLevel -> trunk
    spokeInetGws.forEach((g,i)=>{
      const vpcIdx=vpcGwIndex[g.vid]=(vpcGwIndex[g.vid]||0)+1;
      const routeLevel=baseRouteLevel-i*8;
      const exitX=g.sgX+25+vpcIdx*10;
      // Path stops at the shared trunk X — no more flagpole
      const netPath=`M${g.sgX+16},${g.sgY} L${exitX},${g.sgY} L${exitX},${routeLevel} L${spokeTrunkX},${routeLevel}`;
      const pb=lzStructG.append('path')
        .attr('class','route-trunk animated')
        .attr('d',netPath)
        .attr('stroke',g.col);
      lzAllPaths.push({p:pb,vids:[g.vid],gwId:g.gw.id});
      if(!lzVpcRoutes.has(g.vid))lzVpcRoutes.set(g.vid,[]);
      lzVpcRoutes.get(g.vid).push({d:netPath,stroke:g.col});
    });

    // Shared vertical trunk from top route level down to NET center Y
    const topRouteLevel=baseRouteLevel-(spokeInetGws.length-1)*8;
    const trunkVert=`M${spokeTrunkX},${topRouteLevel} L${spokeTrunkX},${iY}`;
    lzStructG.append('path')
      .attr('class','route-trunk animated')
      .attr('d',trunkVert)
      .attr('stroke','var(--igw-color)');

    // Horizontal connector from trunk to NET circle right edge
    const netConn=`M${spokeTrunkX},${iY} L${iX+32},${iY}`;
    lzStructG.append('path')
      .attr('class','route-trunk animated')
      .attr('d',netConn)
      .attr('stroke','var(--igw-color)');

    // Add shared trunk + connector to lzVpcRoutes for each VPC with IGW/NAT
    // so they light up during highlights. Trim trunk to each VPC's route level range.
    const inetVids=new Set(spokeInetGws.map(g=>g.vid));
    inetVids.forEach(vid=>{
      // Find this VPC's route levels (its gateways' route levels)
      const vpcGws=spokeInetGws.filter(g=>g.vid===vid);
      const vpcRouteLevels=vpcGws.map((g,i)=>baseRouteLevel-spokeInetGws.indexOf(g)*8);
      const vpcTopRL=Math.min(...vpcRouteLevels);
      // Trunk from this VPC's top route level down to NET Y
      const vpcTrunk=`M${spokeTrunkX},${vpcTopRL} L${spokeTrunkX},${iY}`;
      if(!lzVpcRoutes.has(vid))lzVpcRoutes.set(vid,[]);
      lzVpcRoutes.get(vid).push({d:vpcTrunk,stroke:'var(--igw-color)'});
      lzVpcRoutes.get(vid).push({d:netConn,stroke:'var(--igw-color)'});
    });
  }
  
  // VPCE summary badges per VPC
  vL.forEach(vl=>{
    const vpcVpces=vpceByVpc[vl.vpc.VpcId]||[];
    if(!vpcVpces.length)return;
    const nw=70,nh=16;
    const gx=vl.x+nw/2+8;
    const ny=vl.y+vl.h-nh-8;
    const eG=ndL.append('g').attr('class','vpce-summary').style('cursor','pointer');
    eG.append('rect').attr('x',gx-nw/2).attr('y',ny).attr('width',nw).attr('height',nh).attr('rx',3)
      .attr('fill','rgba(167,139,250,.2)').attr('stroke','var(--vpce-color)').attr('stroke-width',1);
    eG.append('text').attr('x',gx).attr('y',ny+12).attr('text-anchor','middle').attr('font-family','IBM Plex Mono')
      .style('font-size','calc(8px * var(--txt-scale,1))').attr('font-weight','600').attr('fill','var(--vpce-color)').text(vpcVpces.length+' VPCE');
    eG.on('mouseenter',function(){
      let h='<div class="tt-title">VPC Endpoints ('+vpcVpces.length+')</div>';
      h+='<div class="tt-sub">'+gn(vl.vpc,vl.vpc.VpcId)+'</div>';
      h+='<div class="tt-sec"><div class="tt-sh">Endpoints</div>';
      vpcVpces.forEach(v=>{
        const vi=vpces.find(x=>x.VpcEndpointId===v.id);
        const svc=vi?.ServiceName||'?';
        const nm=gwNames[v.id];
        h+='<div class="tt-r"><span class="i">'+esc(nm||v.id.slice(-8))+'</span> '+esc(svc.split('.').pop())+' ['+esc(vi?.VpcEndpointType)+']</div>';
      });
      h+='</div>';
      tt.innerHTML=h;tt.style.display='block';
    }).on('mousemove',function(event){positionTooltip(event,tt)}).on('mouseleave',()=>{tt.style.display='none'})
    .on('click',function(event){event.stopPropagation();tt.style.display='none';_lastRlType=null;_navStack=[];openResourceList('Endpoints')});
  });

  // Private zone VPC badges
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
      if(!vl.w||vl.w<50||!vl.h||vl.h<50) return;
      const nw=70,nh=16;
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
  }

  // DNS Zone section below VPCs
  let lzSectionY=maxY+40;
  const lzAllVpcRight=Math.max(...vL.map(v=>v.x+v.w));
  if(zones.length>0){
    const dnsY=lzSectionY;
    const pubZones=zones.filter(z=>!z.Config?.PrivateZone);
    const privZones=zones.filter(z=>z.Config?.PrivateZone);
    const dnsBoxW=Math.max(320,lzAllVpcRight-40);
    const lzDnsRecExp=_dnsRecordsExpanded;
    const recRowH=14;

    // Pre-calculate zone layouts
    const lzZoneLayouts=[];
    if(lzDnsRecExp){
      const fullW=dnsBoxW-40;
      let cy=0;
      zones.forEach(z=>{
        const zid=z.Id.replace('/hostedzone/','');
        const isPub=!z.Config?.PrivateZone;
        const zRecs=lzRecsByZone[zid]||[];
        const assocVpcs=(!isPub&&z.VPCs)?z.VPCs.map(v=>{const vid=v.VPCId||v.VpcId;const vpc=vpcs.find(vp=>vp.VpcId===vid);return gn(vpc||{},vid)}).join(', '):'';
        let metaLines=2;
        if(assocVpcs)metaLines++;
        const headerH=18+metaLines*14+4;
        const recsH=zRecs.length>0?(4+zRecs.length*recRowH):16;
        const zh=headerH+recsH+6;
        lzZoneLayouts.push({x:50,y:cy,w:fullW,h:zh,recs:zRecs,assocVpcs});
        cy+=zh+6;
      });
    }else{
      const dnsColW=(dnsBoxW-60)/2;
      zones.forEach((z,zi)=>{
        const col=zi%2;
        const row=Math.floor(zi/2);
        lzZoneLayouts.push({x:50+col*(dnsColW+10),y:row*32,w:dnsColW-10,h:26,recs:[]});
      });
    }
    const totalContentH=lzDnsRecExp?
      (lzZoneLayouts.length>0?lzZoneLayouts[lzZoneLayouts.length-1].y+lzZoneLayouts[lzZoneLayouts.length-1].h:0):
      (Math.ceil(zones.length/2)*32);
    let dnsBoxH=60+totalContentH+20;

    const dnsG=ndL.append('g').attr('class','dns-section');
    dnsG.append('rect').attr('x',40).attr('y',dnsY).attr('width',dnsBoxW).attr('height',dnsBoxH).attr('rx',8)
      .attr('fill','rgba(14,165,233,.06)').attr('stroke','#0ea5e9').attr('stroke-width',1.5).attr('stroke-dasharray','6 3');
    dnsG.append('text').attr('x',60).attr('y',dnsY+22).attr('font-family','IBM Plex Mono')
      .style('font-size','calc(14px * var(--txt-scale,1))').attr('font-weight','700').attr('fill','#0ea5e9').text('Route 53 Hosted Zones');
    dnsG.append('text').attr('x',60).attr('y',dnsY+36).attr('font-family','IBM Plex Mono')
      .style('font-size','calc(10px * var(--txt-scale,1))').attr('fill','var(--text-muted)').text(pubZones.length+' public, '+privZones.length+' private');

    // Records expand/collapse toggle button
    const lzTogX=40+dnsBoxW-80;
    const lzTogY=dnsY+8;
    const lzTogG=dnsG.append('g').style('cursor','pointer');
    lzTogG.append('rect').attr('x',lzTogX).attr('y',lzTogY).attr('width',70).attr('height',20).attr('rx',4)
      .attr('fill','rgba(14,165,233,.15)').attr('stroke','#0ea5e9').attr('stroke-width',0.8);
    lzTogG.append('text').attr('x',lzTogX+35).attr('y',lzTogY+14).attr('text-anchor','middle')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(8px * var(--txt-scale,1))').attr('font-weight','600')
      .attr('fill','#0ea5e9').text(lzDnsRecExp?'\u25B2 Collapse':'\u25BC Expand');
    lzTogG.on('click',function(event){
      event.stopPropagation();
      _dnsRecordsExpanded=!_dnsRecordsExpanded;
      renderMap();
    });

    zones.forEach((z,zi)=>{
      const isPub=!z.Config?.PrivateZone;
      const zid=z.Id.replace('/hostedzone/','');
      const lay=lzZoneLayouts[zi];
      const zx=lay.x;
      const zy=dnsY+52+lay.y;
      const zw=lay.w;
      const zh=lay.h;

      const zG=dnsG.append('g').style('cursor','pointer');
      zG.append('rect').attr('x',zx).attr('y',zy).attr('width',zw).attr('height',zh).attr('rx',4)
        .attr('fill',isPub?'rgba(16,185,129,.18)':'rgba(14,165,233,.18)')
        .attr('stroke',isPub?'#10b981':'#0ea5e9').attr('stroke-width',1.5);

      // Icon
      zG.append('circle').attr('cx',zx+12).attr('cy',zy+13).attr('r',6)
        .attr('fill',isPub?'#10b981':'#0ea5e9');
      zG.append('text').attr('x',zx+12).attr('y',zy+16.5).attr('text-anchor','middle')
        .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('font-weight','700')
        .attr('fill','#fff').text(isPub?'P':'R');

      // Zone name (full in records-expanded, truncated in compact)
      const recLabel=z.ResourceRecordSetCount+' records';
      const maxNameLen=lzDnsRecExp?999:Math.max(12,Math.floor((zw-80)/6));
      const dispName=lzDnsRecExp?z.Name:(z.Name.length>maxNameLen?z.Name.substring(0,maxNameLen-2)+'..':z.Name);
      zG.append('text').attr('x',zx+24).attr('y',zy+15).attr('font-family','IBM Plex Mono')
        .style('font-size','calc(10px * var(--txt-scale,1))').attr('font-weight','600').attr('fill',isPub?'#10b981':'#0ea5e9')
        .text(dispName);

      // Compact: record count only
      if(!lzDnsRecExp){
        zG.append('text').attr('x',zx+zw-8).attr('y',zy+15).attr('text-anchor','end')
          .attr('font-family','IBM Plex Mono').style('font-size','calc(9px * var(--txt-scale,1))').attr('fill','var(--text-muted)')
          .text(recLabel);
      }

      // Records expanded: metadata + records
      if(lzDnsRecExp){
        let my=zy+18;
        zG.append('text').attr('x',zx+24).attr('y',my+14).attr('font-family','IBM Plex Mono')
          .style('font-size','calc(8px * var(--txt-scale,1))').attr('fill','var(--text-muted)')
          .text('Zone ID: '+zid+'  |  '+z.ResourceRecordSetCount+' records  |  '+(isPub?'Public':'Private'));
        my+=14;
        if(lay.assocVpcs){
          zG.append('text').attr('x',zx+24).attr('y',my+14).attr('font-family','IBM Plex Mono')
            .style('font-size','calc(8px * var(--txt-scale,1))').attr('fill','var(--text-muted)')
            .text('VPCs: '+lay.assocVpcs);
          my+=14;
        }
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

      // Tooltip
      zG.on('mouseenter',function(){
        let h='<div class="tt-title">'+(isPub?'Public':'Private')+' Hosted Zone</div>';
        h+='<div class="tt-sub">'+esc(z.Name)+'</div>';
        h+='<div class="tt-sec">';
        h+='<div class="tt-r"><span class="i">Zone ID</span> '+esc(zid)+'</div>';
        h+='<div class="tt-r"><span class="i">Records</span> '+z.ResourceRecordSetCount+'</div>';
        if(!isPub&&z.VPCs){
          h+='<div class="tt-sh" style="margin-top:4px">Associated VPCs</div>';
          z.VPCs.forEach(v=>{
            const vid=v.VPCId||v.VpcId;
            const vpcObj=vpcs.find(x=>x.VpcId===vid);
            h+='<div class="tt-r"><span class="i">'+(vpcObj?gn(vpcObj,vid):esc(vid))+'</span></div>';
          });
        }
        h+='</div>';
        tt.innerHTML=h;tt.style.display='block';
      }).on('mousemove',function(event){positionTooltip(event,tt)}).on('mouseleave',()=>{tt.style.display='none'})
      .on('click',function(event){event.stopPropagation();tt.style.display='none';_lastRlType=null;_navStack=[];openResourceList('R53')});
    });
    lzSectionY=dnsY+dnsBoxH+30;
  }

  // S3 Buckets section
  if(s3bk.length>0){
    const s3Y=lzSectionY;
    const s3BoxW=Math.max(320,lzAllVpcRight-40);
    const s3Cols=3;
    const s3ColW=Math.min(320,(s3BoxW-40)/s3Cols);
    const s3RowH=24;
    const s3Rows=Math.ceil(s3bk.length/s3Cols);
    const s3BoxH=50+s3Rows*(s3RowH+4)+20;

    const s3G=ndL.append('g').attr('class','s3-section');
    s3G.append('rect').attr('x',40).attr('y',s3Y).attr('width',s3BoxW).attr('height',s3BoxH).attr('rx',8)
      .attr('fill','rgba(234,88,12,.06)').attr('stroke','#ea580c').attr('stroke-width',1.5).attr('stroke-dasharray','6 3');
    s3G.append('text').attr('x',60).attr('y',s3Y+22).attr('font-family','IBM Plex Mono')
      .style('font-size','calc(14px * var(--txt-scale,1))').attr('font-weight','700').attr('fill','#ea580c').text('S3 Buckets');
    s3G.append('text').attr('x',60).attr('y',s3Y+36).attr('font-family','IBM Plex Mono')
      .style('font-size','calc(10px * var(--txt-scale,1))').attr('fill','var(--text-muted)').text(s3bk.length+' buckets');

    s3bk.forEach((bk,bi)=>{
      const col=bi%s3Cols;
      const row=Math.floor(bi/s3Cols);
      const bx=50+col*(s3ColW+5);
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
    lzSectionY=s3Y+s3BoxH+30;
  }

  // CloudFront distributions section
  if(cfDistributions.length>0){
    const cfY=lzSectionY;
    const cfBoxW=Math.max(320,lzAllVpcRight-40);
    const cfCols=2;
    const cfColW=Math.min(480,(cfBoxW-40)/cfCols);
    const cfRowH=28;
    const cfRows=Math.ceil(cfDistributions.length/cfCols);
    const cfBoxH=50+cfRows*(cfRowH+4)+20;

    const cfG=ndL.append('g').attr('class','cf-section');
    cfG.append('rect').attr('x',40).attr('y',cfY).attr('width',cfBoxW).attr('height',cfBoxH).attr('rx',8)
      .attr('fill','rgba(139,92,246,.06)').attr('stroke','#8b5cf6').attr('stroke-width',1.5).attr('stroke-dasharray','6 3');
    cfG.append('text').attr('x',60).attr('y',cfY+22).attr('font-family','IBM Plex Mono')
      .style('font-size','calc(14px * var(--txt-scale,1))').attr('font-weight','700').attr('fill','#8b5cf6').text('CloudFront Distributions');
    cfG.append('text').attr('x',60).attr('y',cfY+36).attr('font-family','IBM Plex Mono')
      .style('font-size','calc(10px * var(--txt-scale,1))').attr('fill','var(--text-muted)').text(cfDistributions.length+' distributions');

    cfDistributions.forEach((d,di)=>{
      const col=di%cfCols;
      const row=Math.floor(di/cfCols);
      const cx=50+col*(cfColW+5);
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
    lzSectionY=cfY+cfBoxH+30;
  }

  // Legend
  const legX=20,legY=lzSectionY;
  const legG=ndL.append('g').attr('class','legend');
  legG.append('text').attr('x',legX).attr('y',legY).attr('font-family','IBM Plex Mono').style('font-size','calc(9px * var(--txt-scale,1))').attr('font-weight','600').attr('fill','var(--text-secondary)').text('LANDING ZONE LAYOUT');
  const items=[
    {c:'#7C3AED',t:'Hub VPC'},{c:'var(--vpc-stroke)',t:'Spoke VPC'},
    {c:'var(--tgw-color)',t:'Transit GW'},{c:'var(--igw-color)',t:'Internet GW'},
    {c:'var(--nat-color)',t:'NAT GW'},{c:'var(--subnet-public)',t:'Public'},{c:'var(--subnet-private)',t:'Private'}
  ];
  items.forEach((it,i)=>{
    const ix=legX+i*100;
    legG.append('rect').attr('x',ix).attr('y',legY+10).attr('width',12).attr('height',12).attr('rx',2).attr('fill',it.c).attr('opacity',.8);
    legG.append('text').attr('x',ix+16).attr('y',legY+20).attr('font-family','IBM Plex Mono').style('font-size','calc(8px * var(--txt-scale,1))').attr('fill','var(--text-muted)').text(it.t);
  });
  
  // Stats bar
  _rlCtx={vpcs,subnets,pubSubs,rts,sgs,nacls,enis,eniByInst,igws,nats,vpces,instances,albs,tgs,peerings,vpns,volumes,snapshots,s3bk,zones,wafAcls,wafByAlb,tgByAlb,cfByAlb:cfByAlb||{},rdsInstances,ecsServices,lambdaFns,ecacheClusters,redshiftClusters,cfDistributions,instBySub,albBySub,eniBySub,rdsBySub,ecsBySub,lambdaBySub,subRT,subNacl,sgByVpc,volByInst,snapByVol,ecacheByVpc,redshiftByVpc,tgwAttachments,recsByZone:lzRecsByZone,iamRoleResources,_multiAccount,_accounts};
  const sb2=document.getElementById('statsBar');sb2.innerHTML='';sb2.style.display='flex';
  [{l:'VPCs',v:vpcs.length},{l:'Subnets',v:subnets.length},{l:'Public',v:pubSubs.size},{l:'Private',v:subnets.length-pubSubs.size},{l:'Gateways',v:gwSet.size},{l:'RTs',v:rts.length},{l:'NACLs',v:nacls.length},{l:'SGs',v:sgs.length},{l:'EC2',v:instances.length},{l:'ENIs',v:enis.length},{l:'ALBs',v:albs.length},{l:'TGs',v:tgs.length},{l:'RDS',v:rdsInstances.length},{l:'ECS',v:ecsServices.length},{l:'Lambda',v:lambdaFns.length},{l:'Cache',v:ecacheClusters.length},{l:'Redshift',v:redshiftClusters.length},{l:'Peering',v:peerings.length},{l:'VPNs',v:vpns.length},{l:'Endpoints',v:vpces.length},{l:'Volumes',v:volumes.length},{l:'Snapshots',v:snapshots.length},{l:'S3',v:s3bk.length},{l:'R53',v:zones.length},{l:'WAF',v:wafAcls.length},{l:'CF',v:cfDistributions.length}].forEach(s=>{
    if(s.v>0){const c=document.createElement('div');c.className='stat-chip';c.dataset.type=s.l;c.innerHTML=`<b>${s.v}</b>${s.l}`;c.addEventListener('click',()=>openResourceList(s.l));sb2.appendChild(c)}
  });
  // Compliance chip (landing zone)
  try{const findings=runComplianceChecks(_rlCtx);if(findings.length)addComplianceChip(sb2,findings);_addBUDRChip(sb2)}catch(ce){console.warn('Compliance check error:',ce)}
  if(_iamData){const _ic=(_iamData.roles?.length||0)+(_iamData.users?.length||0);if(_ic>0){const ic=document.createElement('div');ic.className='stat-chip';ic.classList.add('accent-amber');ic.innerHTML='<b>'+_ic+'</b> IAM';ic.addEventListener('click',()=>openResourceList('IAM'));sb2.appendChild(ic)}}
  _depGraph=null;
  try{_renderNoteBadges()}catch(ne){}
  try{_renderComplianceBadges()}catch(cbe){console.warn('Compliance badge error:',cbe)}
  try{if(Date.now()-_lastAutoSnap>120000){takeSnapshot('Render',true);_lastAutoSnap=Date.now()}}catch(se){}
  // Diff overlay (landing zone)
  try{if(_diffMode)setTimeout(_applyDiffOverlay,150)}catch(de){}
  document.getElementById('legend').style.display='flex';
  if(_isMobile())document.getElementById('legend').classList.add('collapsed');
  document.getElementById('exportBar').style.display='flex';
  document.getElementById('bottomToolbar').style.display='flex';
  setTimeout(()=>d3.select('#zoomFit').dispatch('click'),100);
}

// EXECUTIVE OVERVIEW
function renderExecutiveOverview(ctx){
  const {vpcs,subnets,instances,albs,peerings,vpns,s3bk,zones,rdsInstances,ecsServices,
    lambdaFns,ecacheClusters,redshiftClusters,cfDistributions,subByVpc,instBySub,albBySub,
    rdsBySub,ecsBySub,lambdaBySub,pvGws,shGws,vpceByVpc,tgwAttachments,
    rts,sgs,nacls,enis,igws,nats,vpces,tgs,volumes,snapshots,wafAcls,
    pubSubs,subRT,subNacl,sgByVpc,eniBySub,volByInst,snapByVol,tgByAlb,wafByAlb,
    ecacheByVpc,redshiftByVpc,cfByAlb}=ctx;
  
  // Store context for stat chip clicks
  _rlCtx=ctx;
  
  const svg=d3.select('#mapSvg');
  const W=document.querySelector('.main').clientWidth,H=document.querySelector('.main').clientHeight;
  svg.attr('width',W).attr('height',H);
  const g=svg.append('g').attr('class','map-root');
  const zB=d3.zoom().scaleExtent([.08,5]).on('zoom',e=>{g.attr('transform',e.transform);document.getElementById('zoomLevel').textContent=Math.round(e.transform.k*100)+'%'});svg.call(zB);
  _mapSvg=svg;_mapZoom=zB;_mapG=g;
  bindZoomButtons();
  
  const tt=document.getElementById('tooltip');
  
  // Per-VPC resource stats
  const vpcStats=vpcs.map(v=>{
    const ss=subByVpc[v.VpcId]||[];
    let ec2=0,alb=0,rds=0,ecs=0,fn=0,eniC=0,volC=0;
    ss.forEach(s=>{
      ec2+=(instBySub[s.SubnetId]||[]).length;
      alb+=(albBySub[s.SubnetId]||[]).length;
      rds+=(rdsBySub[s.SubnetId]||[]).length;
      ecs+=(ecsBySub[s.SubnetId]||[]).length;
      fn+=(lambdaBySub[s.SubnetId]||[]).length;
      eniC+=(eniBySub[s.SubnetId]||[]).length;
      (instBySub[s.SubnetId]||[]).forEach(i=>{volC+=(volByInst[i.InstanceId]||[]).length});
    });
    const sgC=(sgByVpc[v.VpcId]||[]).length;
    const gws=(pvGws[v.VpcId]||[]);
    const vpceCount=(vpceByVpc[v.VpcId]||[]).length;
    const region=ss.find(s=>s.AvailabilityZone)?.AvailabilityZone?.replace(/[a-z]$/,'')||'';
    return {vpc:v,subCount:ss.length,ec2,alb,rds,ecs,fn,eniC,volC,sgC,total:ec2+alb+rds+ecs+fn,gwCount:gws.length,vpceCount,region};
  });
  
  // Layout VPC cards in grid
  const CARD_W=300,CARD_H=220,CARD_GAP=40,COLS=Math.max(2,Math.min(4,Math.ceil(Math.sqrt(vpcs.length))));
  const startX=60;
  const _hdrStats=[
    {l:'VPCs',v:vpcs.length,t:'VPCs',c:'#7C3AED'},
    {l:'Subnets',v:subnets.length,t:'Subnets',c:'#06b6d4'},
    {l:'EC2',v:instances.length,t:'EC2',c:'#10b981'},
    {l:'ALB',v:albs.length,t:'ALBs',c:'#38bdf8'},
    {l:'RDS',v:rdsInstances.length,t:'RDS',c:'#3b82f6'},
    {l:'ECS',v:ecsServices.length,t:'ECS',c:'#f97316'},
    {l:'Lambda',v:lambdaFns.length,t:'Lambda',c:'#a855f7'},
    {l:'ENI',v:enis.length,t:'ENIs',c:'#64748b'},
    {l:'SG',v:sgs.length,t:'SGs',c:'#eab308'},
    {l:'VOL',v:volumes.length,t:'Volumes',c:'#f59e0b'},
    {l:'S3',v:s3bk.length,t:'S3',c:'#ea580c'},
    {l:'R53',v:zones.length,t:'R53',c:'#06b6d4'},
    {l:'CloudFront',v:cfDistributions.length,t:'CF',c:'#8b5cf6'},
    {l:'TGW',v:shGws.filter(g2=>g2.type==='TGW').length,t:'Gateways',c:'#ec4899'},
    {l:'VPN',v:vpns?.length||0,t:'VPNs',c:'#ef4444'},
    {l:'Peering',v:peerings.length,t:'Peering',c:'#fb923c'},
    {l:'Snapshots',v:snapshots.length,t:'Snapshots',c:'#94a3b8'},
    {l:'WAF',v:wafAcls.length,t:'WAF',c:'#eab308'},
    {l:'ElastiCache',v:ecacheClusters.length,t:'Cache',c:'#ef4444'},
    {l:'Redshift',v:redshiftClusters.length,t:'Redshift',c:'#dc2626'}
  ].filter(s=>s.v>0);
  const _hdrCols=8,_hdrCardW=58,_hdrCardH=38,_hdrGapX=6,_hdrGapY=6;
  const _hdrRows=Math.ceil(_hdrStats.length/_hdrCols);
  const _hdrGridH=_hdrRows*(_hdrCardH+_hdrGapY);
  const _hdrH=32+_hdrGridH+30+16;
  const _hdrTotalW=Math.min(_hdrStats.length,_hdrCols)*(_hdrCardW+_hdrGapX)-_hdrGapX+24;
  const startY=_hdrH+20;
  
  const vpcPositions=new Map();
  vpcStats.forEach((vs,i)=>{
    const col=i%COLS,row=Math.floor(i/COLS);
    const cx=startX+col*(CARD_W+CARD_GAP);
    const cy=startY+row*(CARD_H+CARD_GAP);
    vpcPositions.set(vs.vpc.VpcId,{x:cx,y:cy,cx:cx+CARD_W/2,cy:cy+CARD_H/2,vs});
  });
  
  // Draw connections first (behind cards)
  const connG=g.append('g').attr('class','exec-connections');
  
  // Peering connections
  peerings.forEach(p=>{
    const aVpc=p.AccepterVpcInfo?.VpcId,rVpc=p.RequesterVpcInfo?.VpcId;
    const pa=vpcPositions.get(aVpc),pr=vpcPositions.get(rVpc);
    if(!pa||!pr)return;
    const mx=(pa.cx+pr.cx)/2,my=(pa.cy+pr.cy)/2;
    connG.append('path').attr('d',`M${pa.cx},${pa.cy} Q${mx},${my-30} ${pr.cx},${pr.cy}`)
      .attr('fill','none').attr('stroke','var(--pcx-color)').attr('stroke-width',2)
      .attr('stroke-dasharray','8 4').attr('opacity',.6);
    connG.append('circle').attr('cx',mx).attr('cy',my-15).attr('r',10)
      .attr('fill','var(--bg-card)').attr('stroke','var(--pcx-color)').attr('stroke-width',1);
    connG.append('text').attr('x',mx).attr('y',my-11).attr('text-anchor','middle')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(6px * var(--txt-scale,1))').attr('fill','var(--pcx-color)').text('PCX');
  });
  
  // TGW connections (shared gateways connect to all VPCs that route through them)
  const tgwVpcs=new Map();
  shGws.filter(g2=>g2.type==='TGW').forEach(tgw=>{
    const connected=[];
    vpcs.forEach(v=>{
      const ss=subByVpc[v.VpcId]||[];
      const rts2=ctx.rts.filter(rt=>rt.VpcId===v.VpcId||(rt.Associations||[]).some(a=>ss.some(s=>s.SubnetId===a.SubnetId)));
      const hasTgw=rts2.some(rt=>(rt.Routes||[]).some(r=>r.TransitGatewayId===tgw.id));
      if(hasTgw)connected.push(v.VpcId);
    });
    if(connected.length>1) tgwVpcs.set(tgw.id,connected);
  });
  
  // Draw TGW hub if present
  tgwVpcs.forEach((vids,tgwId)=>{
    let hubX=0,hubY=0,cnt=0;
    vids.forEach(vid=>{const p=vpcPositions.get(vid);if(p){hubX+=p.cx;hubY+=p.cy;cnt++}});
    if(!cnt)return;
    hubX/=cnt;hubY/=cnt;
    
    // TGW node
    connG.append('circle').attr('cx',hubX).attr('cy',hubY).attr('r',22)
      .attr('fill','var(--bg-card)').attr('stroke','var(--tgw-color)').attr('stroke-width',2);
    connG.append('text').attr('x',hubX).attr('y',hubY+3).attr('text-anchor','middle')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('font-weight','700')
      .attr('fill','var(--tgw-color)').text('TGW');
    
    // Spokes to VPCs
    vids.forEach(vid=>{
      const p=vpcPositions.get(vid);if(!p)return;
      connG.append('line').attr('x1',hubX).attr('y1',hubY).attr('x2',p.cx).attr('y2',p.cy)
        .attr('stroke','var(--tgw-color)').attr('stroke-width',1.5).attr('stroke-dasharray','6 3').attr('opacity',.4);
    });
  });
  
  // Draw VPC cards
  const cardG=g.append('g').attr('class','exec-cards');
  
  vpcStats.forEach((vs,i)=>{
    const pos=vpcPositions.get(vs.vpc.VpcId);
    const cx=pos.x,cy=pos.y;
    const cG=cardG.append('g').attr('class','exec-card').style('cursor','pointer');
    
    // Card background
    cG.append('rect').attr('x',cx).attr('y',cy).attr('width',CARD_W).attr('height',CARD_H)
      .attr('rx',6).attr('fill','rgba(30,41,59,.85)').attr('stroke','var(--vpc-stroke)').attr('stroke-width',1.5);
    
    // Header bar
    cG.append('rect').attr('x',cx).attr('y',cy).attr('width',CARD_W).attr('height',32)
      .attr('rx',6).attr('fill','rgba(59,130,246,.12)');
    cG.append('rect').attr('x',cx).attr('y',cy+26).attr('width',CARD_W).attr('height',6)
      .attr('fill','rgba(59,130,246,.12)');
    
    // VPC name
    cG.append('text').attr('x',cx+12).attr('y',cy+20)
      .attr('font-family','IBM Plex Mono').style('font-size','calc(11px * var(--txt-scale,1))').attr('font-weight','700')
      .attr('fill','var(--text-primary)').text(gn(vs.vpc,vs.vpc.VpcId));
    
    // Region tag
    if(vs.region){
      cG.append('text').attr('x',cx+CARD_W-10).attr('y',cy+20).attr('text-anchor','end')
        .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('fill','var(--text-muted)').text(vs.region);
    }
    
    // CIDR
    cG.append('text').attr('x',cx+12).attr('y',cy+48)
      .attr('font-family','IBM Plex Mono').style('font-size','calc(8px * var(--txt-scale,1))').attr('fill','var(--text-muted)')
      .text(vs.vpc.CidrBlock||'N/A');
    
    // Subnet count
    cG.append('text').attr('x',cx+CARD_W-10).attr('y',cy+48).attr('text-anchor','end')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(8px * var(--txt-scale,1))').attr('fill','var(--text-secondary)')
      .text(vs.subCount+' subnet'+(vs.subCount!==1?'s':''));
    
    // Resource bars
    const barY=cy+62;
    const resTypes=[
      {label:'EC2',count:vs.ec2,col:'#10b981',rlType:'EC2'},
      {label:'ALB',count:vs.alb,col:'#38bdf8',rlType:'ALBs'},
      {label:'RDS',count:vs.rds,col:'#3b82f6',rlType:'RDS'},
      {label:'ECS',count:vs.ecs,col:'#f97316',rlType:'ECS'},
      {label:'Lambda',count:vs.fn,col:'#a855f7',rlType:'Lambda'},
      {label:'ENI',count:vs.eniC,col:'#64748b',rlType:'ENIs'},
      {label:'VOL',count:vs.volC,col:'#f59e0b',rlType:'Volumes'},
      {label:'SG',count:vs.sgC,col:'#eab308',rlType:'SGs'}
    ].filter(r=>r.count>0);
    
    const maxCount=Math.max(1,...resTypes.map(r=>r.count));
    const barMaxW=CARD_W-80;
    
    resTypes.forEach((rt,ri)=>{
      const by=barY+ri*16;
      const barG=cG.append('g').style('cursor','pointer');
      barG.append('rect').attr('x',cx).attr('y',by-1).attr('width',CARD_W).attr('height',15)
        .attr('fill','transparent');
      barG.append('text').attr('x',cx+12).attr('y',by+9)
        .attr('font-family','IBM Plex Mono').style('font-size','calc(6.5px * var(--txt-scale,1))').attr('fill',rt.col).text(rt.label);
      barG.append('rect').attr('x',cx+52).attr('y',by+1).attr('width',barMaxW).attr('height',9)
        .attr('rx',2).attr('fill','rgba(255,255,255,.03)');
      const bw=Math.max(4,(rt.count/maxCount)*barMaxW);
      barG.append('rect').attr('x',cx+52).attr('y',by+1).attr('width',bw).attr('height',9)
        .attr('rx',2).attr('fill',rt.col).attr('fill-opacity',.3);
      barG.append('text').attr('x',cx+54+bw).attr('y',by+9)
        .attr('font-family','IBM Plex Mono').style('font-size','calc(6.5px * var(--txt-scale,1))').attr('font-weight','600')
        .attr('fill',rt.col).text(rt.count);
      barG.on('click',function(event){event.stopPropagation();openResourceList(rt.rlType)});
      barG.on('mouseenter',function(){d3.select(this).selectAll('rect').filter(function(d,i){return i===2}).attr('fill-opacity',.6)})
        .on('mouseleave',function(){d3.select(this).selectAll('rect').filter(function(d,i){return i===2}).attr('fill-opacity',.3)});
    });
    
    // Gateway summary at bottom
    const gwY=cy+CARD_H-18;
    let gwX=cx+12;
    if(vs.gwCount){
      const gwG2=cG.append('g').style('cursor','pointer');
      gwG2.append('text').attr('x',gwX).attr('y',gwY)
        .attr('font-family','IBM Plex Mono').style('font-size','calc(6.5px * var(--txt-scale,1))').attr('fill','var(--text-muted)')
        .text(vs.gwCount+' gateway'+(vs.gwCount!==1?'s':''));
      gwG2.on('click',function(event){event.stopPropagation();openResourceList('Gateways')});
      gwX+=vs.gwCount.toString().length*6+50;
    }
    if(vs.vpceCount){
      const vpceG2=cG.append('g').style('cursor','pointer');
      vpceG2.append('text').attr('x',gwX).attr('y',gwY)
        .attr('font-family','IBM Plex Mono').style('font-size','calc(6.5px * var(--txt-scale,1))').attr('fill','var(--text-muted)')
        .text(vs.vpceCount+' endpoint'+(vs.vpceCount!==1?'s':''));
      vpceG2.on('click',function(event){event.stopPropagation();openResourceList('Endpoints')});
    }
    
    // Total resources badge
    if(vs.total>0){
      const tw=vs.total.toString().length*6+30;
      cG.append('rect').attr('x',cx+CARD_W-tw-8).attr('y',gwY-10).attr('width',tw).attr('height',14)
        .attr('rx',3).attr('fill','rgba(99,102,241,.15)').attr('stroke','rgba(99,102,241,.4)').attr('stroke-width',.5);
      cG.append('text').attr('x',cx+CARD_W-tw/2-8).attr('y',gwY+1).attr('text-anchor','middle')
        .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))').attr('font-weight','700')
        .attr('fill','#818cf8').text(vs.total+' total');
    }
    
    // Tooltip on hover
    cG.on('mouseenter',function(){
      let h='<div class="tt-title">'+gn(vs.vpc,vs.vpc.VpcId)+'</div>';
      h+='<div class="tt-sub">'+esc(vs.vpc.VpcId)+'</div>';
      h+='<div class="tt-sec"><div class="tt-sh">Overview</div>';
      h+='<div class="tt-r">CIDR: <span class="i">'+esc(vs.vpc.CidrBlock)+'</span></div>';
      h+='<div class="tt-r">Region: <span class="i">'+esc(vs.region||'Unknown')+'</span></div>';
      h+='<div class="tt-r">Subnets: <span class="i">'+vs.subCount+'</span></div>';
      h+='<div class="tt-r">Total Resources: <span class="i">'+vs.total+'</span></div>';
      h+='</div>';
      tt.innerHTML=h;tt.style.display='block';
    }).on('mousemove',function(event){
      positionTooltip(event,tt);
    }).on('mouseleave',()=>{tt.style.display='none'})
    .on('click',function(){openResourceList('VPCs')});
  });
  
  const hdrG=g.append('g');
  const _hdrX=startX-12,_hdrY=8;
  hdrG.append('rect').attr('x',_hdrX).attr('y',_hdrY).attr('width',_hdrTotalW).attr('height',_hdrH)
    .attr('rx',8).attr('fill','rgba(17,24,39,.85)').attr('stroke','var(--border)');
  hdrG.append('text').attr('x',startX).attr('y',_hdrY+22)
    .attr('font-family','IBM Plex Mono').style('font-size','calc(14px * var(--txt-scale,1))').attr('font-weight','700')
    .attr('fill','var(--text-primary)').text('Executive Overview');
  const _regions=new Set(vpcStats.map(vs=>vs.region).filter(Boolean));
  const _regionLabel=_regions.size===1?[..._regions][0]:(_regions.size>1?'Multi-Region':'');
  if(_regionLabel){
    hdrG.append('text').attr('x',_hdrX+_hdrTotalW-12).attr('y',_hdrY+22).attr('text-anchor','end')
      .attr('font-family','IBM Plex Mono').style('font-size','calc(10px * var(--txt-scale,1))')
      .attr('fill','var(--text-muted)').text(_regionLabel);
  }
  const _gridY=_hdrY+32;
  _hdrStats.forEach((s,i)=>{
    const col=i%_hdrCols,row=Math.floor(i/_hdrCols);
    const cx=startX+col*(_hdrCardW+_hdrGapX);
    const cy=_gridY+row*(_hdrCardH+_hdrGapY);
    const mcG=hdrG.append('g').style('cursor','pointer');
    mcG.append('rect').attr('x',cx).attr('y',cy).attr('width',_hdrCardW).attr('height',_hdrCardH)
      .attr('rx',4).attr('fill','rgba(255,255,255,.03)').attr('class','hdr-stat-bg');
    mcG.append('rect').attr('x',cx).attr('y',cy+4).attr('width',3).attr('height',_hdrCardH-8)
      .attr('fill',s.c).attr('rx',1);
    mcG.append('text').attr('x',cx+10).attr('y',cy+16)
      .attr('font-family','IBM Plex Mono').style('font-size','calc(12px * var(--txt-scale,1))').attr('font-weight','700')
      .attr('fill',s.c).text(s.v);
    mcG.append('text').attr('x',cx+10).attr('y',cy+28)
      .attr('font-family','IBM Plex Mono').style('font-size','calc(7px * var(--txt-scale,1))')
      .attr('fill','var(--text-muted)').text(s.l);
    mcG.on('click',function(){openResourceList(s.t)});
    mcG.on('mouseenter',function(){d3.select(this).select('.hdr-stat-bg').attr('fill','rgba(255,255,255,.08)')})
      .on('mouseleave',function(){d3.select(this).select('.hdr-stat-bg').attr('fill','rgba(255,255,255,.03)')});
  });
  const _compY=_gridY+_hdrGridH+4;
  let _compFindings=[];
  try{_compFindings=runComplianceChecks(_rlCtx)||[]}catch(e){}
  const _compN=_compFindings.length;
  const _compColor=_compN===0?'#22c55e':_compN<=20?'#eab308':_compN<=50?'#f97316':'#ef4444';
  const _compG=hdrG.append('g').style('cursor','pointer');
  _compG.append('rect').attr('x',startX).attr('y',_compY).attr('width',_hdrTotalW-24).attr('height',22)
    .attr('rx',4).attr('fill','rgba(255,255,255,.03)').attr('class','comp-bar-bg');
  _compG.append('circle').attr('cx',startX+12).attr('cy',_compY+11).attr('r',4).attr('fill',_compColor);
  _compG.append('text').attr('x',startX+22).attr('y',_compY+15)
    .attr('font-family','IBM Plex Mono').style('font-size','calc(9px * var(--txt-scale,1))')
    .attr('fill',_compColor).text(_compN===0?'No findings':_compN+' finding'+(_compN===1?'':'s'));
  _compG.on('click',function(){renderCompliancePanel(_compFindings)});
  _compG.on('mouseenter',function(){d3.select(this).select('.comp-bar-bg').attr('fill','rgba(255,255,255,.08)')})
    .on('mouseleave',function(){d3.select(this).select('.comp-bar-bg').attr('fill','rgba(255,255,255,.03)')});
  
  // Hide stats bar in executive overview (stats are shown in the header)
  const sb2=document.getElementById('statsBar');sb2.innerHTML='';sb2.style.display='none';
  
  // Show legend but auto-collapse it
  const leg=document.getElementById('legend');
  leg.style.display='flex';
  leg.classList.add('collapsed');
  document.getElementById('exportBar').style.display='flex';
  document.getElementById('bottomToolbar').style.display='flex';
  setTimeout(()=>d3.select('#zoomFit').dispatch('click'),100);
}

var _renderMapTimer=null;
var _parseCache={};
function _cachedParse(id){
  const el=document.getElementById(id);
  const val=el?el.value:'';
  if(!val||!val.trim()){delete _parseCache[id];return null}
  if(_parseCache[id]&&_parseCache[id].raw===val)return _parseCache[id].parsed;
  const parsed=safeParse(val);
  _parseCache[id]={raw:val,parsed:parsed};
  return parsed;
}
function invalidateParseCache(){_parseCache={}}
