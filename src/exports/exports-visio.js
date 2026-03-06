/**
 * Visio VSDX Export — builds OOXML via JSZip
 * Extracted from app-core.js lines 23633-24188
 * Self-contained: receives no closure state, uses window globals only.
 */

/* globals JSZip, ext, safeParse, gv, gn, esc, sid, clsGw, gcv, isShared, downloadBlob */

export function exportVsdx(showToast) {
  if(typeof JSZip==='undefined'){showToast('JSZip not loaded');return}
  const vpcs=ext(safeParse(gv('in_vpcs')),['Vpcs']);
  const subnets=ext(safeParse(gv('in_subnets')),['Subnets']);
  const rts=ext(safeParse(gv('in_rts')),['RouteTables']);
  const igws=ext(safeParse(gv('in_igws')),['InternetGateways']);
  const nats=ext(safeParse(gv('in_nats')),['NatGateways']);
  const vpceList=ext(safeParse(gv('in_vpces')),['VpcEndpoints']);
  const peerings=ext(safeParse(gv('in_peer')),['VpcPeeringConnections']);
  let instances=[];
  const eRaw=safeParse(gv('in_ec2'));
  if(eRaw){
    const reservations=ext(eRaw,['Reservations']);
    if(reservations.length){reservations.forEach(r=>{if(r.Instances)instances=instances.concat(r.Instances);else if(r.InstanceId)instances.push(r)})}
    else{const flat=ext(eRaw,['Instances']);if(flat.length)instances=flat;else{const arr=Array.isArray(eRaw)?eRaw:[eRaw];arr.forEach(x=>{if(x.InstanceId)instances.push(x)})}}
  }
  const enis=ext(safeParse(gv('in_enis')),['NetworkInterfaces']);
  const sgs=ext(safeParse(gv('in_sgs')),['SecurityGroups']);
  const nacls=ext(safeParse(gv('in_nacls')),['NetworkAcls']);
  const albs=ext(safeParse(gv('in_albs')),['LoadBalancers']);
  const volumes=ext(safeParse(gv('in_vols')),['Volumes']);
  if(!vpcs.length){_showToast('Render map first');return}

  const subByVpc={};subnets.forEach(s=>(subByVpc[s.VpcId]=subByVpc[s.VpcId]||[]).push(s));
  const mainRT={};
  rts.forEach(rt=>{if((rt.Associations||[]).some(a=>a.Main))mainRT[rt.VpcId]=rt});
  const subRT={};
  rts.forEach(rt=>{(rt.Associations||[]).forEach(a=>{if(a.SubnetId)subRT[a.SubnetId]=rt})});
  subnets.forEach(s=>{if(!subRT[s.SubnetId]&&mainRT[s.VpcId])subRT[s.SubnetId]=mainRT[s.VpcId]});
  const subNacl={};nacls.forEach(n=>(n.Associations||[]).forEach(a=>{if(a.SubnetId)subNacl[a.SubnetId]=n}));
  const sgByVpc={};sgs.forEach(sg=>(sgByVpc[sg.VpcId]=sgByVpc[sg.VpcId]||[]).push(sg));
  // IAM role -> resource cross-references (grid path)
  const iamRoleResources={};
  const lambdaFns=ext(safeParse(gv('in_lambda')),['Functions']).filter(f=>f.VpcConfig&&f.VpcConfig.VpcId);
  const ecsServices=ext(safeParse(gv('in_ecs')),['services','Services'])||[];
  if(_iamData){
    (instances||[]).forEach(i=>{const pa=i.IamInstanceProfile?.Arn;if(pa){const rn=pa.split('/').pop();if(!iamRoleResources[rn])iamRoleResources[rn]={ec2:[],lambda:[],ecs:[]};iamRoleResources[rn].ec2.push(i)}});
    (lambdaFns||[]).forEach(fn=>{if(fn.Role){const rn=fn.Role.split('/').pop();if(!iamRoleResources[rn])iamRoleResources[rn]={ec2:[],lambda:[],ecs:[]};iamRoleResources[rn].lambda.push(fn)}});
    (ecsServices||[]).forEach(svc=>{const ra=svc.taskRoleArn||svc.executionRoleArn;if(ra){const rn=ra.split('/').pop();if(!iamRoleResources[rn])iamRoleResources[rn]={ec2:[],lambda:[],ecs:[]};iamRoleResources[rn].ecs.push(svc)}});
  }
  const instBySub={};instances.forEach(i=>{if(i.SubnetId)(instBySub[i.SubnetId]=instBySub[i.SubnetId]||[]).push(i)});
  const eniBySub={};const eniByInst={};enis.forEach(e=>{if(e.SubnetId)(eniBySub[e.SubnetId]=eniBySub[e.SubnetId]||[]).push(e);if(e.Attachment&&e.Attachment.InstanceId)(eniByInst[e.Attachment.InstanceId]=eniByInst[e.Attachment.InstanceId]||[]).push(e)});
  const albBySub={};albs.forEach(lb=>{(lb.AvailabilityZones||[]).forEach(az=>{if(az.SubnetId)(albBySub[az.SubnetId]=albBySub[az.SubnetId]||[]).push(lb)})});
  const volByInst={};volumes.forEach(v=>{(v.Attachments||[]).forEach(a=>{if(a.InstanceId)(volByInst[a.InstanceId]=volByInst[a.InstanceId]||[]).push(v)})});
  const knownInstIds2=new Set(instances.map(i=>i.InstanceId));
  const instSubFromEni2={};enis.forEach(e=>{if(e.SubnetId&&e.Attachment&&e.Attachment.InstanceId)instSubFromEni2[e.Attachment.InstanceId]=e.SubnetId});
  const volBySub={};volumes.forEach(v=>{const att=(v.Attachments||[])[0];if(att&&att.InstanceId){if(knownInstIds2.has(att.InstanceId))return;const sid=instSubFromEni2[att.InstanceId];if(sid)(volBySub[sid]=volBySub[sid]||[]).push(v)}});
  const pubSubs=new Set();
  rts.forEach(rt=>{
    const hasIgw=(rt.Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('igw-')&&r.State!=='blackhole');
    (rt.Associations||[]).forEach(a=>{if(a.SubnetId&&hasIgw)pubSubs.add(a.SubnetId)});
  });
  subnets.forEach(s=>{if(!pubSubs.has(s.SubnetId)&&mainRT[s.VpcId]){
    const hasIgw=(mainRT[s.VpcId].Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('igw-')&&r.State!=='blackhole');
    if(hasIgw)pubSubs.add(s.SubnetId);
  }});


  // --- SIZING ---
  const PX=96;
  const toIn=px=>px/PX;

  const SUB_W=520;
  const SUB_H_MIN=90;
  const SUB_GAP=24;
  const VPC_PAD=50;
  const VPC_HDR=80;
  const GW_INSIDE_W=160, GW_INSIDE_H=50, GW_INSIDE_GAP=16;
  const GW_ROW_H=70;
  const COL_GAP=280;
  const LINE_H=15;
  const TOP_MARGIN=80;

  const activeVpcs=vpcs.filter(v=>(subByVpc[v.VpcId]||[]).length>0);
  if(!activeVpcs.length){_showToast('No VPCs with subnets found');return}

  // --- shape collectors ---
  let shapeId=1;
  const shapes=[];
  const polyEdges=[];
  const idMap={};

  function xmlEsc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function uid(){return '{'+crypto.randomUUID()+'}'}

  function addRect(x,y,w,h,fill,stroke,strokeW,text,opts={}){
    const id=shapeId++;
    shapes.push({id,type:'rect',x,y,w,h,fill,stroke,strokeW,text,
      dashed:opts.dashed||false,fontSize:opts.fontSize||11,
      fontColor:opts.fontColor||'#1F2937',bold:opts.bold||false,
      topAlign:opts.topAlign||false,props:opts.props||[],
      hAlign:opts.hAlign||'left',linePattern:opts.linePattern||1});
    return id;
  }

  // polyline: linePattern 1=solid 2=dash 3=dot 4=dash-dot
  function addPolyEdge(waypoints,color,width,linePattern,label){
    polyEdges.push({waypoints,color,width,linePattern:linePattern||1,
      label:label||'',id:shapeId++});
  }

  // --- gateway type styles (for legend and cross-VPC lines) ---
  const gwStyles={
    'IGW':  {color:'#059669',pattern:1,label:'Internet Gateway',fill:'#ECFDF5',border:'#059669'},
    'NAT':  {color:'#D97706',pattern:2,label:'NAT Gateway',fill:'#FFFBEB',border:'#D97706'},
    'TGW':  {color:'#2563EB',pattern:1,label:'Transit Gateway',fill:'#EFF6FF',border:'#2563EB'},
    'VGW':  {color:'#7C3AED',pattern:4,label:'Virtual Private GW',fill:'#F5F3FF',border:'#7C3AED'},
    'PCX':  {color:'#EA580C',pattern:2,label:'VPC Peering',fill:'#FFF7ED',border:'#EA580C'},
    'VPCE': {color:'#0891B2',pattern:3,label:'VPC Endpoint',fill:'#ECFEFF',border:'#0891B2'},
    'GW':   {color:'#6B7280',pattern:1,label:'Gateway',fill:'#F9FAFB',border:'#6B7280'}
  };

  // --- collect gateways per VPC ---
  const gwByVpc={};
  const sharedGwMap=new Map();
  rts.forEach(rt=>{(rt.Routes||[]).forEach(r=>{
    const entries=[];
    if(r.GatewayId&&r.GatewayId!=='local')entries.push({id:r.GatewayId,type:clsGw(r.GatewayId)});
    if(r.NatGatewayId)entries.push({id:r.NatGatewayId,type:'NAT'});
    if(r.TransitGatewayId)entries.push({id:r.TransitGatewayId,type:'TGW'});
    if(r.VpcPeeringConnectionId)entries.push({id:r.VpcPeeringConnectionId,type:'PCX'});
    entries.forEach(e=>{
      if(e.type==='TGW'||e.type==='PCX'){
        if(!sharedGwMap.has(e.id))sharedGwMap.set(e.id,{...e,vpcIds:new Set()});
        sharedGwMap.get(e.id).vpcIds.add(rt.VpcId);
      } else {
        if(!gwByVpc[rt.VpcId])gwByVpc[rt.VpcId]=new Map();
        if(!gwByVpc[rt.VpcId].has(e.id))gwByVpc[rt.VpcId].set(e.id,e);
      }
    });
  })});
  igws.forEach(g=>{
    const v=(g.Attachments||[])[0];
    const vpcId=v?v.VpcId:null;
    if(vpcId){
      if(!gwByVpc[vpcId])gwByVpc[vpcId]=new Map();
      if(!gwByVpc[vpcId].has(g.InternetGatewayId))
        gwByVpc[vpcId].set(g.InternetGatewayId,{id:g.InternetGatewayId,type:'IGW'});
    }
  });
  nats.forEach(g=>{
    if(g.VpcId){
      if(!gwByVpc[g.VpcId])gwByVpc[g.VpcId]=new Map();
      if(!gwByVpc[g.VpcId].has(g.NatGatewayId))
        gwByVpc[g.VpcId].set(g.NatGatewayId,{id:g.NatGatewayId,type:'NAT'});
    }
  });

  // --- build subnet display text ---
  function buildSubText(s){
    const isPub=pubSubs.has(s.SubnetId);
    const si=instBySub[s.SubnetId]||[];
    const se=eniBySub[s.SubnetId]||[];
    const sa=albBySub[s.SubnetId]||[];
    const lines=[];
    lines.push((isPub?'[PUBLIC] ':'[PRIVATE] ')+gn(s,s.SubnetId));
    lines.push(s.CidrBlock+'  |  '+(s.AvailabilityZone||''));
    const parts=[];
    if(si.length)parts.push(si.length+' EC2');
    if(se.length)parts.push(se.length+' ENI');
    if(sa.length)parts.push(sa.length+' ALB');
    if(parts.length)lines.push(parts.join(' | '));
    const rt=subRT[s.SubnetId];
    if(rt){
      const nonLocal=(rt.Routes||[]).filter(r=>{
        const t=r.GatewayId||r.NatGatewayId||r.TransitGatewayId||r.VpcPeeringConnectionId;
        return t&&t!=='local';
      });
      if(nonLocal.length){
        lines.push('Routes:');
        nonLocal.forEach(r=>{
          const dest=r.DestinationCidrBlock||r.DestinationPrefixListId||'?';
          const tgt=r.GatewayId||r.NatGatewayId||r.TransitGatewayId||r.VpcPeeringConnectionId;
          lines.push('  '+dest+' -> '+clsGw(tgt||'')+' '+sid(tgt));
        });
      }
    }
    return {text:lines.join('\n'),lineCount:lines.length};
  }

  // --- compute subnet heights ---
  const subHeights={};
  subnets.forEach(s=>{
    const bt=buildSubText(s);
    subHeights[s.SubnetId]=Math.max(SUB_H_MIN, bt.lineCount*LINE_H+30);
  });

  // ============================
  // LAYOUT: each VPC is a column
  // ============================
  const vpcLayouts=[];
  let curX=TOP_MARGIN;

  activeVpcs.forEach(vpc=>{
    const ss=subByVpc[vpc.VpcId]||[];
    const myGws=gwByVpc[vpc.VpcId]?[...gwByVpc[vpc.VpcId].values()]:[];

    // gateway row inside VPC: how many rows of gateways?
    const gwPerRow=3;
    const gwRows=Math.ceil(myGws.length/gwPerRow);
    const gwSectionH=gwRows>0?(gwRows*(GW_INSIDE_H+GW_INSIDE_GAP)+GW_INSIDE_GAP):0;

    // VPC width
    const vpcW=SUB_W+VPC_PAD*2;

    // VPC height
    let vpcH=VPC_HDR+gwSectionH;
    ss.forEach(s=>{vpcH+=(subHeights[s.SubnetId]||SUB_H_MIN)+SUB_GAP});
    vpcH+=VPC_PAD;

    vpcLayouts.push({vpc,ss,vpcW,vpcH,myGws,gwSectionH,x:curX});
    curX+=vpcW+COL_GAP;
  });

  const totalWidth=curX;

  // --- LEGEND (top-left, outside VPC area) ---
  const LEGEND_X=TOP_MARGIN;
  const LEGEND_Y=TOP_MARGIN;
  const usedTypes=new Set();
  // figure out which gw types are actually present
  Object.values(gwByVpc).forEach(m=>m.forEach(gw=>usedTypes.add(gw.type)));
  sharedGwMap.forEach(gw=>usedTypes.add(gw.type));

  const legendEntries=[...usedTypes].map(t=>gwStyles[t]||gwStyles['GW']);
  const legendH=50+legendEntries.length*28;
  addRect(LEGEND_X,LEGEND_Y,320,legendH,'#FFFFFF','#9CA3AF',1,
    'LEGEND\n\n'+[...usedTypes].map(t=>{
      const s=gwStyles[t]||gwStyles['GW'];
      return '['+t+'] '+s.label;
    }).join('\n'),
    {fontSize:11,fontColor:'#374151',bold:false,topAlign:true});

  // --- VPC start Y below legend ---
  const VPC_START_Y=LEGEND_Y+legendH+60;

  // --- place VPCs ---
  let maxVpcBot=0;
  const vpcPositions={};

  vpcLayouts.forEach(vl=>{
    const {vpc,ss,vpcW,vpcH,myGws,gwSectionH,x}=vl;

    // VPC summary text
    const vSgs=sgByVpc[vpc.VpcId]||[];
    const totalEC2=ss.reduce((a,s)=>(instBySub[s.SubnetId]||[]).length+a,0);
    let vpcLabel=gn(vpc,vpc.VpcId)+'\n'+vpc.CidrBlock;
    vpcLabel+='\n'+ss.length+' subnets | '+totalEC2+' EC2 | '+vSgs.length+' SGs';

    const vpcProps=[];
    vpcProps.push({label:'VPC ID',val:vpc.VpcId});
    vpcProps.push({label:'CIDR',val:vpc.CidrBlock});
    if(vSgs.length){
      vpcProps.push({label:'Security Groups',val:String(vSgs.length)});
      vpcProps.push({label:'SG Details',val:vSgs.slice(0,10).map(sg=>
        sg.GroupName+' ('+((sg.IpPermissions||[]).length)+' in)').join('; ')});
    }

    const vid=addRect(x,VPC_START_Y,vpcW,vpcH,'#EFF3FF','#2563EB',2.5,vpcLabel,
      {dashed:true,fontSize:13,fontColor:'#1E40AF',bold:true,topAlign:true,props:vpcProps});
    idMap[vpc.VpcId]=vid;
    vpcPositions[vpc.VpcId]={x,y:VPC_START_Y,w:vpcW,h:vpcH};

    // --- gateways INSIDE VPC at top ---
    let gwY=VPC_START_Y+VPC_HDR;
    for(let row=0;row<Math.ceil(myGws.length/3);row++){
      const rowGws=myGws.slice(row*3,(row+1)*3);
      const rowTotalW=rowGws.length*GW_INSIDE_W+(rowGws.length-1)*GW_INSIDE_GAP;
      let gwX=x+VPC_PAD+(SUB_W-rowTotalW)/2;
      rowGws.forEach(gw=>{
        const st=gwStyles[gw.type]||gwStyles['GW'];
        const nm=gwNames[gw.id]||sid(gw.id);
        const truncNm=nm.length>16?nm.substring(0,14)+'..':nm;
        const label=gw.type+': '+truncNm;
        addRect(gwX,gwY,GW_INSIDE_W,GW_INSIDE_H,st.fill,st.border,2,label,
          {fontSize:10,fontColor:st.color,bold:true,hAlign:'center'});
        gwX+=GW_INSIDE_W+GW_INSIDE_GAP;
      });
      gwY+=GW_INSIDE_H+GW_INSIDE_GAP;
    }

    // --- subnets inside VPC below gateways ---
    let sy=VPC_START_Y+VPC_HDR+gwSectionH;
    ss.forEach(s=>{
      const isPub=pubSubs.has(s.SubnetId);
      const fill=isPub?'#ECFDF5':'#F5F3FF';
      const stroke=isPub?'#059669':'#7C3AED';
      const fc=isPub?'#065F46':'#4C1D95';
      const sh=subHeights[s.SubnetId]||SUB_H_MIN;
      const bt=buildSubText(s);

      const sp=[];
      sp.push({label:'Subnet ID',val:s.SubnetId});
      sp.push({label:'CIDR',val:s.CidrBlock});
      sp.push({label:'AZ',val:s.AvailabilityZone||'N/A'});
      sp.push({label:'Type',val:isPub?'Public':'Private'});
      const rt=subRT[s.SubnetId];
      if(rt){
        sp.push({label:'Route Table',val:gn(rt,rt.RouteTableId)});
        sp.push({label:'Routes',val:(rt.Routes||[]).map(r=>
          (r.DestinationCidrBlock||'?')+' -> '+(r.GatewayId||r.NatGatewayId||r.TransitGatewayId||r.VpcPeeringConnectionId||'local')
        ).join('; ')});
      }
      const nc=subNacl[s.SubnetId];
      if(nc)sp.push({label:'NACL',val:nc.NetworkAclId});

      addRect(x+VPC_PAD,sy,SUB_W,sh,fill,stroke,1.5,bt.text,
        {fontSize:10,fontColor:fc,topAlign:true,props:sp});
      idMap[s.SubnetId]={x:x+VPC_PAD,y:sy,w:SUB_W,h:sh};
      sy+=sh+SUB_GAP;
    });

    maxVpcBot=Math.max(maxVpcBot,VPC_START_Y+vpcH);
  });

  // =======================================
  // CROSS-VPC CONNECTIONS (the ONLY lines)
  // =======================================
  // These are: TGW connections and VPC Peering
  // Use staggered horizontal bus lanes below VPCs

  const BUS_START_Y=maxVpcBot+100;
  const BUS_LANE_H=50;
  let busLaneIdx=0;

  // --- shared gateways (TGW) ---
  // Place TGW label boxes centered below, then draw orthogonal lines
  if(sharedGwMap.size>0){
    const sharedArr=[...sharedGwMap.values()];
    const tgwTotalW=sharedArr.length*200+(sharedArr.length-1)*80;
    let tgwStartX=Math.max(TOP_MARGIN,(totalWidth-tgwTotalW)/2);
    const TGW_Y=BUS_START_Y+busLaneIdx*BUS_LANE_H+120;

    sharedArr.forEach((gw,i)=>{
      const st=gwStyles[gw.type]||gwStyles['GW'];
      const nm=gwNames[gw.id]||sid(gw.id);
      const truncNm=nm.length>20?nm.substring(0,18)+'..':nm;
      const gwX=tgwStartX+i*(200+80);
      const gid=addRect(gwX,TGW_Y,200,60,st.fill,st.border,2.5,
        gw.type+': '+truncNm,
        {fontSize:12,fontColor:st.color,bold:true,hAlign:'center'});

      // draw orthogonal lines from each connected VPC to this gateway
      const connectedVpcs=[...gw.vpcIds].filter(vid=>vpcPositions[vid]);
      const busY=BUS_START_Y+busLaneIdx*BUS_LANE_H;

      connectedVpcs.forEach((vpcId,vi)=>{
        const vp=vpcPositions[vpcId];
        if(!vp)return;
        // stagger the exit points so lines dont overlap
        const exitX=vp.x+vp.w/2+(vi-connectedVpcs.length/2)*20;
        const gwCX=gwX+100;
        // offset bus lane per connection to avoid overlap
        const laneY=busY+(vi*12);
        addPolyEdge([
          {x:exitX,y:vp.y+vp.h},
          {x:exitX,y:laneY},
          {x:gwCX,y:laneY},
          {x:gwCX,y:TGW_Y}
        ],st.color,2.5,st.pattern);
      });
      busLaneIdx++;
    });
  }

  // --- VPC Peering connections ---
  peerings.forEach(pcx=>{
    if(pcx.Status&&pcx.Status.Code!=='active')return;
    const rv=pcx.RequesterVpcInfo?.VpcId;
    const av=pcx.AccepterVpcInfo?.VpcId;
    const vp1=vpcPositions[rv];
    const vp2=vpcPositions[av];
    if(!vp1||!vp2)return;
    const st=gwStyles['PCX'];
    const busY=BUS_START_Y+busLaneIdx*BUS_LANE_H;
    const cx1=vp1.x+vp1.w/2;
    const cx2=vp2.x+vp2.w/2;
    addPolyEdge([
      {x:cx1,y:vp1.y+vp1.h},
      {x:cx1,y:busY},
      {x:cx2,y:busY},
      {x:cx2,y:vp2.y+vp2.h}
    ],st.color,2.5,st.pattern);
    busLaneIdx++;
  });

  // --- PAGE DIMENSIONS ---
  let pgWpx=totalWidth+200;
  let pgHpx=BUS_START_Y+(busLaneIdx+2)*BUS_LANE_H+300;
  shapes.forEach(s=>{
    pgWpx=Math.max(pgWpx,s.x+s.w+120);
    pgHpx=Math.max(pgHpx,s.y+s.h+120);
  });
  const pgW=toIn(pgWpx)+2,pgH=toIn(pgHpx)+2;

  // ========================
  // VISIO XML GENERATION
  // ========================
  function buildShape(s){
    const wi=toIn(s.w),hi=toIn(s.h);
    const cx=toIn(s.x)+wi/2;
    const cy=pgH-(toIn(s.y)+hi/2);
    const lp=s.linePattern||1;
    const dashXml=s.dashed?`<Cell N="LinePattern" V="2"/>`:(lp!==1?`<Cell N="LinePattern" V="${lp}"/>`:'');
    const sw=toIn(s.strokeW||1);
    const fs=(s.fontSize||11)/72;

    const geom=`<Section N="Geometry" IX="0">
      <Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/>
      <Row T="MoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>
      <Row T="LineTo" IX="2"><Cell N="X" V="${wi}"/><Cell N="Y" V="0"/></Row>
      <Row T="LineTo" IX="3"><Cell N="X" V="${wi}"/><Cell N="Y" V="${hi}"/></Row>
      <Row T="LineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="${hi}"/></Row>
      <Row T="LineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>
    </Section>`;

    const vAlign=s.topAlign?0:1;
    const hAlign=s.hAlign==='center'?1:0;

    const propsXml=s.props&&s.props.length?
      `<Section N="Property">${s.props.map((p,i)=>
        `<Row N="Row_${i}"><Cell N="Label" V="${xmlEsc(p.label)}"/><Cell N="Value" V="${xmlEsc(p.val)}"/><Cell N="Type" V="0"/></Row>`
      ).join('')}</Section>`:'';

    return `<Shape ID="${s.id}" NameU="Shape${s.id}" Type="Shape" UniqueID="${uid()}">
      <Cell N="PinX" V="${cx}"/>
      <Cell N="PinY" V="${cy}"/>
      <Cell N="Width" V="${wi}"/>
      <Cell N="Height" V="${hi}"/>
      <Cell N="LocPinX" V="${wi/2}"/>
      <Cell N="LocPinY" V="${hi/2}"/>
      <Cell N="TxtWidth" V="${wi}"/>
      <Cell N="TxtHeight" V="${hi}"/>
      <Cell N="TxtPinX" V="${wi/2}"/>
      <Cell N="TxtPinY" V="${hi/2}"/>
      <Cell N="TxtLocPinX" V="${wi/2}"/>
      <Cell N="TxtLocPinY" V="${hi/2}"/>
      <Cell N="FillForegnd" V="${s.fill}"/>
      <Cell N="FillBkgnd" V="${s.fill}"/>
      <Cell N="LineColor" V="${s.stroke}"/>
      <Cell N="LineWeight" V="${sw}"/>
      <Cell N="VerticalAlign" V="${vAlign}"/>
      <Cell N="HorzAlign" V="${hAlign}"/>
      <Cell N="TopMargin" V="0.06"/>
      <Cell N="BottomMargin" V="0.06"/>
      <Cell N="LeftMargin" V="0.1"/>
      <Cell N="RightMargin" V="0.1"/>
      ${dashXml}
      <Section N="Character" IX="0">
        <Row IX="0">
          <Cell N="Font" V="Calibri"/>
          <Cell N="Color" V="${s.fontColor||'#000000'}"/>
          <Cell N="Size" V="${fs}"/>
          <Cell N="Style" V="${s.bold?1:0}"/>
        </Row>
      </Section>
      ${geom}
      ${propsXml}
      <Text>${xmlEsc(s.text)}</Text>
    </Shape>`;
  }

  function buildPolyConnector(e){
    const pts=e.waypoints.map(wp=>({x:toIn(wp.x),y:pgH-toIn(wp.y)}));
    if(pts.length<2)return '';
    const p1=pts[0],pN=pts[pts.length-1];
    const sw=toIn(e.width||1);
    const cid=e.id;
    let geomRows=`<Row T="MoveTo" IX="1"><Cell N="X" V="${p1.x}"/><Cell N="Y" V="${p1.y}"/></Row>`;
    for(let i=1;i<pts.length;i++){
      geomRows+=`<Row T="LineTo" IX="${i+1}"><Cell N="X" V="${pts[i].x}"/><Cell N="Y" V="${pts[i].y}"/></Row>`;
    }
    return `<Shape ID="${cid}" NameU="Conn.${cid}" Type="Shape" UniqueID="${uid()}">
      <Cell N="ObjType" V="2"/>
      <Cell N="BeginX" V="${p1.x}"/>
      <Cell N="BeginY" V="${p1.y}"/>
      <Cell N="EndX" V="${pN.x}"/>
      <Cell N="EndY" V="${pN.y}"/>
      <Cell N="LineColor" V="${e.color||'#6B7280'}"/>
      <Cell N="LineWeight" V="${sw}"/>
      <Cell N="LinePattern" V="${e.linePattern||1}"/>
      <Cell N="BeginArrow" V="0"/>
      <Cell N="EndArrow" V="5"/>
      <Cell N="EndArrowSize" V="2"/>
      <Section N="Geometry" IX="0">
        <Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/>
        ${geomRows}
      </Section>
    </Shape>`;
  }

  // --- build all XML ---
  let shapesStr='';
  shapes.forEach(s=>shapesStr+=buildShape(s));
  polyEdges.forEach(e=>shapesStr+=buildPolyConnector(e));

  const page1=`<?xml version="1.0" encoding="utf-8"?>
<PageContents xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <Shapes>${shapesStr}</Shapes>
</PageContents>`;

  const pagesXml=`<?xml version="1.0" encoding="utf-8"?>
<Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <Page ID="0" Name="AWS Network Map" NameU="AWS Network Map">
    <PageSheet>
      <Cell N="PageWidth" V="${pgW}"/>
      <Cell N="PageHeight" V="${pgH}"/>
      <Cell N="PrintPageOrientation" V="2"/>
    </PageSheet>
    <Rel r:id="rId1"/>
  </Page>
</Pages>`;

  const docXml=`<?xml version="1.0" encoding="utf-8"?>
<VisioDocument xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <DocumentProperties>
    <Creator>AWS Network Map Tool</Creator>
    <Description>AWS Network Infrastructure Diagram</Description>
  </DocumentProperties>
</VisioDocument>`;

  const contentTypes=`<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>
  <Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>
  <Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>
</Types>`;

  const topRels=`<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>
</Relationships>`;
  const docRels=`<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>
</Relationships>`;
  const pagesRels=`<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>
</Relationships>`;

  const zip=new JSZip();
  zip.file('[Content_Types].xml',contentTypes);
  zip.folder('_rels').file('.rels',topRels);
  zip.folder('visio').file('document.xml',docXml);
  zip.folder('visio/_rels').file('document.xml.rels',docRels);
  zip.folder('visio/pages').file('pages.xml',pagesXml);
  zip.folder('visio/pages').file('page1.xml',page1);
  zip.folder('visio/pages/_rels').file('pages.xml.rels',pagesRels);

  zip.generateAsync({type:'blob',mimeType:'application/vnd.ms-visio.drawing'}).then(blob=>{
    downloadBlob(blob,'aws-network-map.vsdx');
  });
}
