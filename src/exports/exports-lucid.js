/**
 * Lucid Standard Import Export — builds .lucid ZIP via JSZip
 * Extracted from app-core.js lines 23636-25711
 * Contains: AWS_ICONS (base64 data), ICON_MAP, buildLandingZoneLayout,
 * buildLucidExport, buildLucidZip
 */

/* globals JSZip, ext, safeParse, gv, gn, esc, sid, clsGw, gcv, isShared, downloadBlob, _showToast */

// Lucid Standard Import (.lucid) Export
// --- Lucid Standard Import Export (with AWS-style icons) ---
// AWS architecture icon PNGs (base64)
const AWS_ICONS={
  'alb':'data:image/png;base64,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',
  'ec2':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAMKADAAQAAAABAAAAMAAAAADbN2wMAAABO0lEQVRoBe1U2w3CMAwMiA3YCqZhEqahWzEDNB9nWdE16UcTx5WRUNw4re9hJ6X4OVLg+0q//C8h994v6+nnq37wGAcBa9fcO3CpKbgO52fNP2pnBuSW+zs9t+q0HLAGn3FXMdy2mOn9VYGqU/rskTG7ssvvtxwoz0/3LA7sYWuFnmFDV5zHATDSKjPmOj8qZthQ270DQQBWWq1xC1kpj7riAJv0uIUgU8c1bqGO4u76tMzALP3OUDNsmFn3LSQOgJFWgDHX+VExw4ba7h0IArDSapUZmKXfmRAMG+bCfQuJA2CkFWDMdX5UzLChtnsHggCstFplBmbpdyYEw4a5cN9C4gAYaQUYc50fFTNsqH0eB8CIrbM4wbC1HFjYS4P3jsOQnWBu9N6vCdZyoPbuFLkgYG2DewesBYz6fzqMaA3IXYFbAAAAAElFTkSuQmCC',
  'igw':'data:image/png;base64,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',
  'internet':'data:image/png;base64,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',
  'nat':'data:image/png;base64,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',
  'pcx':'data:image/png;base64,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',
  'sub_prv':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAKKADAAQAAAABAAAAKAAAAAB65masAAACd0lEQVRYCWNkWLKMYSAA00BYCrJz1GK6hfyABTULqV7UEeCv0NZyEBMX5WB/+/Pn4Vevu65dP/vuHanmMDMEBROph4mRsVxba5qZ6ZpHj7uuXSs7f3Hn8+dAvVPNTARYWYEu+EekQWBljMTn41ItzQAZmdDDR559/45shSg7+zIbqxNv3tZevIQsjp9NbBxr8vMVa2qEHzmKZivQ9Nc/f0YeOZakrGQiLITfMmRZYi0G2jrxxs0n374ha4az3/z82XblarmWFlyEIINYi+3ExI6+foPHuCOvX9uKieJRgCZFrMXiHByXP3xA04zMvfrhowg7OyOyEF42sRYzMzL++ocv2f75/x9oETDl47UOIUmsxQgdVGKNPIvxFSBvQ4OF2NjIC9r3v34Jr14LinYcAF9ZDbSVcelyHBoJCP+JigAmtL/gFIdV6ciLY3xBjTWIgIIafHy9xoaGgoLXPn4qPXf+/Pv3mCoJZmeSg1qQjW23s+PGx0+Nt++cf/fedicHKU5OTIsJipBssZeUFLDQnnXnzvPv35c+eLDu8eMQOVmC1mAqINliDmbmH3//wg368fcfOzMznEs8g2SLtz576i0tBfQ3MLfYi4nFKCqsf/yEePvgKklOXC++/wg4eHiamclGB7s7nz/HHD0GJOHGEc8g2cdAo4++fq2/dTsw3eps2bbr+QviLUNWSY7FyPpxsfEUlhAttLIYl4Pg4uRb3HT5yj/cRTHBAoTkxAV3MtBiOBuTMXiDGp+PP/z6BazdMH1DjMiXP3/wRATQBHwNAWA8Ed94Q3MN0Fb8oY3Px0CdeGpyNJtI5ZKfqkm1CU39qMVoAUI7LgAoX8MiWl1UgAAAAABJRU5ErkJggg==',
  'sub_pub':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAKKADAAQAAAABAAAAKAAAAAB65masAAACe0lEQVRYCWOsWijGMBCAaSAsBdk5ajHdQn7AgpqFVC+KC2jY6+QpSlhxc4h8+/nuwcsTh69Offr2IqnmkGAxIyOTnXaOlVbaoStTjt2Y9frjHWFeJXkxsxjHRWfvLNt3sfff/z/EW89IfD621c7WkvNcfjDl07cXyBZwcwiH28549PrsngsdyOL42cTGsSi/qo125oqDaWi2Ak3/+uPtikPpxiqR0sIG+C1DliXWYhvtrGPXZ3/89gxZM5wNjOyDlyfa6eTARQgyiLVYUczi4atTeIx7+OqkgrgFHgVoUsRazMMp+vL9dTTNyNyXH25ysQsxMjAiC+JhE2sxIyPz33+/8BgESdLAlI9HDbIUseqQ9VCFPfIsxleA1ITf5GQXIC9gv//60LpC4z/Df1za8RWZQFurF4nj0olfvDn2GTCh/f//F5eykRfH+IIaVygBy21PkwYpId1XH27tONv47N1lTJUESxKSg5qTTSDRddX1xzumbnE9e3d5vMtyPi4JTIsJipBssZqM86NXp0/fWvz5+8uL99ZefbhVW96XoDWYCki2mJWJ/fffH3CD/vz9ycLEBucSzyDZ4ptP92jIuKpLuwBzi6K4lYFSyLVH24i3D66S5MT1+furJfvj/cw7Y5wWvv10f/WRrLef78ONI55Bso+BRgMr5smbHRkYGCdtsr/97ADxliGrJMdiZP242HgKS4gWWlmMy0FwcfIt3n+x9///f3CD0BgECxCSExfcgn2XeuFsTMbgDWp8Pv7x6yOwdsP0DTEiv35/xRMRQBPwNQSA8UR84w3NNUBb8Yc2Ph8DdeKpydFsIpVLfqom1SY09aMWowUI7bgAIgfJCsZyc3UAAAAASUVORK5CYII=',
  'tgw':'data:image/png;base64,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',
  'vgw':'data:image/png;base64,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',
  'vpc':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAKKADAAQAAAABAAAAKAAAAAB65masAAADwUlEQVRYCe2WWWyNURDHf7dqaXWhqipCqRJ7W1vqwU6CoqGCByG22MKDByH2EBKpChERhNhjjV3tgibW0Apa0qrGvhSt202r5iit+33nfr3JVX1g8j2cM9v/mzlzzowtLqaEqiCPqgBVmP+B/1rm/71Ue7qY29p1aRFFSATBLagmRjY+ZJJxj4cXyfngog8HNZsr9zgymm6jSLtJxl1epPA1X7kIDqNZR1r34tou7p9zcOrKpuKIuwyjVXf2zuXjSweHz5KQL/kcQ+dQw4s7xxykFW4qKC5JbORgDi8zopb5zXrO4eV0HU79ptT0pkEYfvXLhFaLCiLuHMPNQ9g/WrnIfsv1A8TMU3HnvMe7Dm/TORVPQa6VlRWwzUZoF86st7IvlckZ12vM7SN8eo3Ng/7T6DuFU2usDK1S7RtIXvbPUrLyAUWFnN+oUIVKvnFpC0064BdkZWQFXDuA/C9Wxs5kXwt4/oDWPale05mKkybhWYMe4xi+kFepTi21AjkdqTLJdspV2vVl6jba9tEqojljQY1dTO5nts/iS5bezMyt5UO7fkQMxKMa34q5e5Kds/ELZMRSVWvvMowWGuDwARTmcXyVUdXZPiiUyEGERZF+ixNxvH6iXrdOQ4kayYNLXNhE9juNqQa4TW8ubNSoalmxSwhoRFICW6erSpRLLP8tD9zJ1fjWIyJaVXj6bRLWGa01wHUb8j7TqKfdy4k2DSc+VlVySDgRg2jUBi8f8u2quCTbV3dw4yAzdmqANVUtd0OO2UWSgU1Qx8TRczxP77B5MsXFbJmi1r0nMWoFRQV6T5qIXz2mYUvSbukNNFwbQc2JH1YuEbDks+qAZ+4pZxpWmohTr6m6kDRWKmmAH14mL4chc9SrW3mkSbWAHV2hgp64AfsndaHNJOe6b76Z7cixHNj1wMVFJO4hcS9S4d7+ju7+0E4P/NN5iWrDhv7/O25pSB6a4yrXkodM0mMmSyOzuoFTgj0LnwAK7Hj5GmSqRHKz8W+gf7ncAwa5e43bq3EsfKARWN7ttBvqYXmZYhTJ3l3g1ETVGxJ303GIakSSWOXUUz2c0p1kMhFpyhUNsEtTpsbuF0s64OiVPLpMZvKPG+ivilFu4+c3qmHIr8gwKiObmSyLy6xu4kjhJKxVbTQwhP0LkNlBJnCZvApz6TVBMQ8sMtn8YLgbcanX6rXoMVbN2FJlglonWGU76TTX9yM3U0t/BrjMtYxp0hll+LIeTEXf3VSXQZYuJFz5XCF3q9oVDK3Of2BtWiqDWWWp/g6ffx+cr3WDNAAAAABJRU5ErkJggg==',
  'vpce':'data:image/png;base64,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',
};
const ICON_MAP={
  IGW:'igw',NAT:'nat',TGW:'tgw',VGW:'vgw',VPCE:'vpce',PCX:'pcx',
  EC2:'ec2',ALB:'alb',INET:'internet',VPC:'vpc',SUB_PUB:'sub_pub',SUB_PRV:'sub_prv'
};

// Landing Zone Hub-Spoke Layout
function buildLandingZoneLayout(ctx){
  // buildLandingZoneLayout
  try{
  const {vpcs,subByVpc,sgByVpc,pubSubs,rts,instances,albs,enis,nacls,subRT,
    igws,nats,vpceList,peerings,sharedGws,gwByVpc,vpceByVpc,gwSet2L,
    gn,sid,tw,userHubName,COL,gwColors2,gwFills,ICON_MAP,volumes,zones,
    s3bk,snapshots,snapByVol,tgByAlb,tgs,wafAcls,wafByAlb,
    instBySub,albBySub,eniBySub,volByInst,volBySub,rdsBySub,ecsBySub,lambdaBySub,cfByAlb,recsByZone:lzRecsByZone}=ctx;
  const recsByZoneLZ=lzRecsByZone||{};

  const shapes=[],lines=[],iconSet=new Set();
  let lid=0;
  const NOTEXT='<p style="font-size:1pt;color:transparent">&nbsp;</p>';
  const IC=36,VP=50,VH=80,SG=32,SP=24;
  const EC2W=260,EC2H=34,EC2G=16;
  
  function addIcon(type,x,y){
    iconSet.add(type);
    shapes.push({
      id:'icon_'+(lid++),type:'rectangle',
      boundingBox:{x,y,w:IC,h:IC},
      text:NOTEXT,
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'image',ref:(ICON_MAP[type]||type.toLowerCase())+'.png'}}
    });
  }
  
  // Identify hub VPC
  const hubKeywords=['shared','connectivity','hub','transit','network','core'];
  let hubVpc=null;
  if(userHubName){
    hubVpc=vpcs.find(v=>{
      const vn=gn(v,v.VpcId).toLowerCase();
      return vn.includes(userHubName);
    });
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
  
  const spokeVpcs=vpcs.filter(v=>v.VpcId!==hubVpc.VpcId);
  const shapeIds={};
  
  // Layout constants
  const HUB_X=100,HUB_Y=120;
  const SPOKE_START_X=900;
  const SPOKE_START_Y=80;
  const SPOKE_COL_W=700;
  const SPOKE_ROW_GAP=40;
  const SPOKES_PER_COL=4;
  const numSpokeCols=Math.max(1,Math.ceil(spokeVpcs.length/SPOKES_PER_COL));
  const EXT_X=SPOKE_START_X+numSpokeCols*SPOKE_COL_W+100;
  
  // Shared resource builder for LZ subnets (mirrors grid logic)
  const LZ_NAME_H=36,LZ_DETAIL_H=28,LZ_CHILD_LINE_H=22,LZ_CHILD_GAP=8,LZ_RES_PAD=10;
  const LZ_CHILD_INNER_W=EC2W-24;
  function lzChildLines(label){return Math.max(1,Math.ceil(tw(label,8)/LZ_CHILD_INNER_W));}
  function lzChildH(label){return lzChildLines(label)*LZ_CHILD_LINE_H+8;}
  function lzResHeight(r){
    const chs=r.children||[];
    let h=LZ_RES_PAD+LZ_NAME_H;
    if(r.detail)h+=LZ_DETAIL_H;
    if(chs.length>0){h+=LZ_CHILD_GAP;chs.forEach(ch=>{const lbl=ch.type+': '+ch.name+(ch.detail?' \u00b7 '+ch.detail:'');h+=lzChildH(lbl)+LZ_CHILD_GAP;});}
    h+=LZ_RES_PAD;
    return Math.max(EC2H,h);
  }
  function lzBuildResources(subId){
    const sInsts=instBySub[subId]||[];
    const sAlbs=albBySub[subId]||[];
    const sRds=(rdsBySub||{})[subId]||[];
    const sEcs=(ecsBySub||{})[subId]||[];
    const sLam=(lambdaBySub||{})[subId]||[];
    const sEni=(eniBySub||{})[subId]||[];
    const attached=new Set();
    const res=[];
    sInsts.forEach(i=>{
      const ch=[];const ie=(enis||[]).filter(e=>e.Attachment&&e.Attachment.InstanceId===i.InstanceId);
      ie.forEach(e=>attached.add(e.NetworkInterfaceId));
      if(_showNested){
        ie.forEach(e=>ch.push({type:'ENI',name:e.NetworkInterfaceId.slice(-8),detail:e.PrivateIpAddress||'',col:'#3b82f6'}));
        ((volByInst||{})[i.InstanceId]||[]).forEach(v=>{const sc=((snapByVol||{})[v.VolumeId]||[]).length;ch.push({type:'VOL',name:v.Size+'GB '+(v.VolumeType||''),detail:sc?sc+' snap':'',col:'#f59e0b'});});
      }
      res.push({type:'EC2',name:gn(i,i.InstanceId),id:i.InstanceId,detail:i.InstanceType,children:ch,resCol:'#10b981'});
    });
    sAlbs.forEach(lb=>{
      const ch=[];
      if(_showNested){
        ((tgByAlb||{})[lb.LoadBalancerArn]||[]).forEach(tg=>ch.push({type:'TG',name:tg.TargetGroupName||'TG',detail:(tg.Targets||[]).length+' tgt',col:'#06b6d4'}));
        ((wafByAlb||{})[lb.LoadBalancerArn]||[]).forEach(w=>ch.push({type:'WAF',name:w.Name||'WAF',detail:(w.Rules||[]).length+' rules',col:'#eab308'}));
      }
      res.push({type:'ALB',name:lb.LoadBalancerName||'ALB',id:lb.LoadBalancerArn,detail:lb.Scheme||'',children:ch,resCol:'#38bdf8'});
    });
    sRds.forEach(db=>res.push({type:'RDS',name:db.DBInstanceIdentifier||'RDS',id:db.DBInstanceIdentifier,detail:db.Engine||'',children:[],resCol:'#3b82f6'}));
    sEcs.forEach(svc=>res.push({type:'ECS',name:svc.serviceName||'ECS',id:svc.serviceName,detail:svc.launchType||'',children:[],resCol:'#f97316'}));
    sLam.forEach(fn=>res.push({type:'FN',name:fn.FunctionName||'Lambda',id:fn.FunctionName,detail:fn.Runtime||'',children:[],resCol:'#a855f7'}));
    sEni.forEach(e=>{if(!attached.has(e.NetworkInterfaceId))res.push({type:'ENI',name:e.NetworkInterfaceId.slice(-8),id:e.NetworkInterfaceId,detail:e.PrivateIpAddress||'',children:[],resCol:'#3b82f6'});});
    // Standalone EBS volumes (instance not in EC2 data, placed via ENI subnet)
    ((volBySub||{})[subId]||[]).forEach(v=>{const sc=((snapByVol||{})[v.VolumeId]||[]).length;const att=(v.Attachments||[])[0];
      res.push({type:'VOL',name:v.Size+'GB '+(v.VolumeType||''),id:v.VolumeId,detail:att?att.InstanceId?.slice(-8)||'':'detached',children:[],resCol:'#f59e0b'});});
    return res;
  }
  function lzSubResHeight(subId,subW){
    const resources=lzBuildResources(subId);
    const cols=Math.max(1,Math.floor((subW-SP*2)/(EC2W+EC2G)));
    const rowCount=Math.ceil(resources.length/cols);
    let totalResH=0;
    for(let row=0;row<rowCount;row++){
      let maxH=EC2H;
      for(let c=0;c<cols;c++){const ri=row*cols+c;if(ri<resources.length){const h=lzResHeight(resources[ri]);if(h>maxH)maxH=h;}}
      totalResH+=maxH+EC2G;
    }
    return resources.length>0?VH+totalResH+SP*2:60;
  }
  function lzRenderResources(resources,sx,sy,subW){
    const cols=Math.max(1,Math.floor((subW-SP*2)/(EC2W+EC2G)));
    const rowCount=Math.ceil(resources.length/cols);
    const rowHeights=[];
    for(let row=0;row<rowCount;row++){
      let maxH=EC2H;
      for(let c=0;c<cols;c++){const ri=row*cols+c;if(ri<resources.length){const h=lzResHeight(resources[ri]);if(h>maxH)maxH=h;}}
      rowHeights.push(maxH);
    }
    const rowYOff=[0];
    for(let i=0;i<rowHeights.length;i++)rowYOff.push(rowYOff[i]+rowHeights[i]+EC2G);
    resources.forEach((r,ri)=>{
      const col=ri%cols,row=Math.floor(ri/cols);
      const rx=sx+SP+col*(EC2W+EC2G);
      const ry=sy+VH+rowYOff[row];
      const rH=lzResHeight(r);
      const rc=r.resCol||'#232F3E';
      const maxResChars=Math.floor((EC2W-20)/8);
      const dispResName=r.name.length>maxResChars?r.name.substring(0,maxResChars-2)+'..':r.name;
      let resHtml='<p style="font-size:9pt;color:'+rc+';font-weight:bold;text-align:left;padding:4px 6px">'+r.type+': '+dispResName+'</p>';
      if(r.detail)resHtml+='<p style="font-size:7pt;color:#6B7280;text-align:left;padding:0 6px">'+r.detail+'</p>';
      (r.children||[]).forEach(ch=>{
        const chLabel=ch.type+': '+ch.name+(ch.detail?' \u00b7 '+ch.detail:'');
        resHtml+='<p style="font-size:8pt;color:'+ch.col+';font-weight:bold;text-align:left;padding:2px 6px;margin:4px 0">\u00a0\u00a0'+chLabel+'</p>';
      });
      shapes.push({id:'res_'+(lid++),type:'rectangle',boundingBox:{x:rx,y:ry,w:EC2W,h:rH},text:resHtml,
        style:{stroke:{color:rc,width:1},fill:{type:'color',color:'#FFFFFF'}},
        customData:[{key:'Type',value:r.type},{key:'Name',value:r.name||''},{key:'ID',value:r.id||''}]
      });
    });
  }

  // Helper to compute VPC height
  function vpcHeight(vpc){
    const ss=subByVpc[vpc.VpcId]||[];
    let h=VH+VP;
    ss.forEach(s=>{
      const subW=500;
      h+=Math.max(60,lzSubResHeight(s.SubnetId,subW))+SG;
    });
    return h;
  }
  
  // Place Hub VPC (larger, center-left)
  const hubSubs=subByVpc[hubVpc.VpcId]||[];
  const hubW=650;
  const hubH=vpcHeight(hubVpc)+100;
  const hubLabel=gn(hubVpc,hubVpc.VpcId)+' (HUB)\n'+hubVpc.CidrBlock;
  const hubId='vpc_hub';
  shapeIds[hubVpc.VpcId]=hubId;
  
  shapes.push({
    id:hubId,type:'roundedRectangleContainer',
    boundingBox:{x:HUB_X,y:HUB_Y,w:hubW,h:hubH},
    text:NOTEXT,
    style:{stroke:{color:'#7C3AED',width:4,style:'dashed'},fill:{type:'color',color:'#F5F3FF'}},
    magnetize:true,
    customData:[{key:'VPC ID',value:hubVpc.VpcId},{key:'Name',value:gn(hubVpc,hubVpc.VpcId)},{key:'Role',value:'Hub / Connectivity'},{key:'CIDR',value:hubVpc.CidrBlock}]
  });
  addIcon('VPC',HUB_X+6,HUB_Y+4);
  
  const hubLabelDisp='HUB: '+gn(hubVpc,hubVpc.VpcId)+' ('+hubVpc.CidrBlock+')';
  shapes.push({
    id:'hublbl',type:'rectangle',
    boundingBox:{x:HUB_X+IC+12,y:HUB_Y+4,w:hubW-IC-24,h:VH-10},
    text:'<p style="font-size:14pt;font-weight:bold;color:#7C3AED;text-align:left;padding:4px 8px">'+hubLabelDisp+'</p>',
    style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
  });
  
  // Hub gateways inside hub VPC
  const hubGws=gwByVpc[hubVpc.VpcId]||[];
  const hubGwBadgeW=hubW-VP*2;
  let gwY=HUB_Y+VH+20;
  hubGws.forEach((gw,i)=>{
    const nm=gwNames[gw.gwMapId]||gwNames[gw.id]||sid(gw.gwMapId||gw.id);
    const gc=gwColors2[gw.type]||'#546E7A';
    const gf=gwFills[gw.type]||'#F5F0FF';
    const gwCD=[{key:'Gateway ID',value:gw.id},{key:'Type',value:gw.type},{key:'Name',value:nm}];
    if(gw.type==='NAT'){
      const natGw=nats.find(n=>n.NatGatewayId===gw.id);
      if(natGw){
        gwCD.push({key:'State',value:natGw.State||''});
        gwCD.push({key:'Connectivity',value:natGw.ConnectivityType||'public'});
        const pubIp=(natGw.NatGatewayAddresses||[])[0]?.PublicIp;
        const privIp=(natGw.NatGatewayAddresses||[])[0]?.PrivateIp;
        if(pubIp)gwCD.push({key:'Public IP',value:pubIp});
        if(privIp)gwCD.push({key:'Private IP',value:privIp});
      }
    }
    if(gw.type==='IGW'){
      const igw=igws.find(g=>g.InternetGatewayId===gw.id);
      if(igw){
        const att=(igw.Attachments||[]).map(a=>a.VpcId).join(', ');
        gwCD.push({key:'Attached VPCs',value:att||'None'});
      }
    }
    shapes.push({
      id:'hubgw_'+i,type:'rectangle',
      boundingBox:{x:HUB_X+VP,y:gwY,w:hubGwBadgeW,h:50},
      text:NOTEXT,
      style:{stroke:{color:gc,width:2},fill:{type:'color',color:gf}},
      customData:gwCD
    });
    addIcon(gw.type,HUB_X+VP+8,gwY+7);
    shapes.push({
      id:'hubgw_lbl_'+i,type:'rectangle',
      boundingBox:{x:HUB_X+VP+50,y:gwY+8,w:hubGwBadgeW-60,h:34},
      text:'<p style="font-size:10pt;font-weight:bold;color:#232F3E;text-align:left">'+gw.type+': '+nm+'</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
    });
    gwY+=60;
  });
  
  // Hub subnets with resources
  let hubSubY=gwY+20;
  const hubSubW=hubW-VP*2;
  hubSubs.forEach(s=>{
    const sName=gn(s,s.SubnetId);
    const isPub=pubSubs.has(s.SubnetId);
    const fc=isPub?COL.pubFont:COL.prvFont;
    const fill=isPub?COL.pubFill:COL.prvFill;
    const stroke=isPub?COL.pubStroke:COL.prvStroke;
    const resources=lzBuildResources(s.SubnetId);
    const subH=Math.max(60,lzSubResHeight(s.SubnetId,hubSubW));
    const rt=subRT[s.SubnetId];
    const nacl=nacls?nacls[s.SubnetId]:null;
    const rtName=rt?gn(rt,rt.RouteTableId):'Main';
    const naclName=nacl?gn(nacl,nacl.NetworkAclId):'Default';
    const sx=HUB_X+VP;
    shapes.push({
      id:'hubsub_'+(lid++),type:'rectangle',
      boundingBox:{x:sx,y:hubSubY,w:hubSubW,h:subH},
      text:NOTEXT,
      style:{stroke:{color:stroke,width:2},fill:{type:'color',color:fill}},
      customData:[
        {key:'Subnet ID',value:s.SubnetId},{key:'Name',value:sName},
        {key:'CIDR',value:s.CidrBlock||''},{key:'AZ',value:s.AvailabilityZone||''},
        {key:'Type',value:isPub?'Public':'Private'},
        {key:'Route Table',value:rtName+(rt?' ('+rt.RouteTableId+')':'')},
        {key:'NACL',value:naclName+(nacl?' ('+nacl.NetworkAclId+')':'')}
      ]
    });
    addIcon(isPub?'SUB_PUB':'SUB_PRV',sx+6,hubSubY+6);
    const subLabel=sName+' ['+s.CidrBlock+']';
    const maxSubChars=Math.floor((hubSubW-IC-40)/9);
    const dispSubLabel=subLabel.length>maxSubChars?subLabel.substring(0,maxSubChars-2)+'..':subLabel;
    shapes.push({id:'sublbl_'+(lid++),type:'rectangle',
      boundingBox:{x:sx+IC+12,y:hubSubY+6,w:hubSubW-IC-24,h:32},
      text:'<p style="font-size:9pt;font-weight:bold;color:'+fc+';text-align:left;padding:4px 6px">'+dispSubLabel+'</p>',
      style:{stroke:{color:fill,width:0},fill:{type:'color',color:fill}}
    });
    if(resources.length>0) lzRenderResources(resources,sx,hubSubY,hubSubW);
    hubSubY+=subH+SG;
  });
  
  // Place Spoke VPCs
  const spokePositions={};
  let spokeY=SPOKE_START_Y;
  let spokeCol=0;
  
  spokeVpcs.forEach((vpc,idx)=>{
    if(idx>0&&idx%SPOKES_PER_COL===0){
      spokeCol++;
      spokeY=SPOKE_START_Y;
    }
    const spokeX=SPOKE_START_X+spokeCol*SPOKE_COL_W;
    const ss=subByVpc[vpc.VpcId]||[];
    const spokeW=550;
    const spokeSubWCalc=spokeW-40;
    let spokeSubsH=0;
    ss.forEach(s2=>{spokeSubsH+=Math.max(45,lzSubResHeight(s2.SubnetId,spokeSubWCalc))+SG;});
    const spokeH=Math.max(200, VH+20+spokeSubsH+40);
    const vpcId='vpc_spoke_'+idx;
    shapeIds[vpc.VpcId]=vpcId;
    spokePositions[vpc.VpcId]={x:spokeX,y:spokeY,w:spokeW,h:spokeH};
    
    shapes.push({
      id:vpcId,type:'roundedRectangleContainer',
      boundingBox:{x:spokeX,y:spokeY,w:spokeW,h:spokeH},
      text:NOTEXT,
      style:{stroke:{color:COL.vpcStroke,width:2,style:'dashed'},fill:{type:'color',color:COL.vpcFill}},
      magnetize:true,
      customData:[{key:'VPC ID',value:vpc.VpcId},{key:'Name',value:gn(vpc,vpc.VpcId)},{key:'Role',value:'Spoke / Workload'},{key:'CIDR',value:vpc.CidrBlock}]
    });
    addIcon('VPC',spokeX+6,spokeY+4);
    
    const spokeLbl=gn(vpc,vpc.VpcId)+' ('+vpc.CidrBlock+')';
    const maxChars=Math.floor((spokeW-IC-40)/9);
    const dispLbl=spokeLbl.length>maxChars?spokeLbl.substring(0,maxChars-2)+'..':spokeLbl;
    shapes.push({
      id:'spokelbl_'+idx,type:'rectangle',
      boundingBox:{x:spokeX+IC+12,y:spokeY+4,w:spokeW-IC-24,h:VH-10},
      text:'<p style="font-size:12pt;font-weight:bold;color:'+COL.vpcFont+';text-align:left;padding:4px 8px">'+dispLbl+'</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
    });
    
    // Spoke subnets - all of them
    let subY=spokeY+VH+10;
    const spokeSubW=spokeW-40;
    ss.forEach(s=>{
      const sName=gn(s,s.SubnetId);
      const isPub=pubSubs.has(s.SubnetId);
      const fc=isPub?COL.pubFont:COL.prvFont;
      const fill=isPub?COL.pubFill:COL.prvFill;
      const stroke=isPub?COL.pubStroke:COL.prvStroke;
      const rt=subRT[s.SubnetId];
      const nacl=nacls?nacls[s.SubnetId]:null;
      const rtName=rt?gn(rt,rt.RouteTableId):'Main';
      const naclName=nacl?gn(nacl,nacl.NetworkAclId):'Default';
      const resources=lzBuildResources(s.SubnetId);
      const subH=Math.max(45,lzSubResHeight(s.SubnetId,spokeSubW));
      const sx=spokeX+20;
      shapes.push({
        id:'spokesub_'+(lid++),type:'rectangle',
        boundingBox:{x:sx,y:subY,w:spokeSubW,h:subH},
        text:NOTEXT,
        style:{stroke:{color:stroke,width:1.5},fill:{type:'color',color:fill}},
        customData:[
          {key:'Subnet ID',value:s.SubnetId},{key:'Name',value:sName},
          {key:'CIDR',value:s.CidrBlock||''},{key:'AZ',value:s.AvailabilityZone||''},
          {key:'Type',value:isPub?'Public':'Private'},
          {key:'Route Table',value:rtName+(rt?' ('+rt.RouteTableId+')':'')},
          {key:'NACL',value:naclName+(nacl?' ('+nacl.NetworkAclId+')':'')}
        ]
      });
      addIcon(isPub?'SUB_PUB':'SUB_PRV',sx+6,subY+6);
      const spokeSubLabel=sName+' ['+s.CidrBlock+']';
      const maxSpokeChars=Math.floor((spokeSubW-IC-40)/8);
      const dispSpokeLabel=spokeSubLabel.length>maxSpokeChars?spokeSubLabel.substring(0,maxSpokeChars-2)+'..':spokeSubLabel;
      shapes.push({id:'sublbl_'+(lid++),type:'rectangle',
        boundingBox:{x:sx+IC+12,y:subY+6,w:spokeSubW-IC-24,h:32},
        text:'<p style="font-size:8pt;font-weight:bold;color:'+fc+';text-align:left;padding:4px 6px">'+dispSpokeLabel+'</p>',
        style:{stroke:{color:fill,width:0},fill:{type:'color',color:fill}}
      });
      if(resources.length>0) lzRenderResources(resources,sx,subY,spokeSubW);
      subY+=subH+SG;
    });
    
    spokeY+=spokeH+SPOKE_ROW_GAP;
  });
  
  // External Connectivity Zone - wider with more room
  const extY=HUB_Y;
  const extW=340;
  shapes.push({
    id:'ext_zone',type:'rectangle',
    boundingBox:{x:EXT_X,y:extY,w:extW,h:400},
    text:NOTEXT,
    style:{stroke:{color:'#64748B',width:2,style:'dashed'},fill:{type:'color',color:'#F8FAFC'}}
  });
  shapes.push({
    id:'ext_title',type:'rectangle',
    boundingBox:{x:EXT_X+10,y:extY+10,w:extW-20,h:30},
    text:'<p style="font-size:11pt;font-weight:bold;color:#334155;text-align:center">External Connectivity</p>',
    style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
  });
  
  // Internet node
  shapes.push({
    id:'inet',type:'rectangle',
    boundingBox:{x:EXT_X+30,y:extY+60,w:extW-60,h:60},
    text:NOTEXT,
    style:{stroke:{color:'#232F3E',width:2},fill:{type:'color',color:'#E2E8F0'}},
    customData:[{key:'Type',value:'Internet Gateway / Public Access'},{key:'Description',value:'External internet connectivity'}]
  });
  addIcon('INET',EXT_X+38,extY+72);
  shapes.push({
    id:'inet_lbl',type:'rectangle',
    boundingBox:{x:EXT_X+80,y:extY+72,w:extW-120,h:36},
    text:'<p style="font-size:11pt;font-weight:bold;color:#232F3E;text-align:left">Internet</p>',
    style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
  });
  
  // On-premises / VPN
  if(sharedGws.some(g=>g.type==='VGW')||gwSet2L.has('vgw')){
    shapes.push({
      id:'onprem',type:'rectangle',
      boundingBox:{x:EXT_X+30,y:extY+140,w:extW-60,h:60},
      text:NOTEXT,
      style:{stroke:{color:'#7C3AED',width:2},fill:{type:'color',color:'#F5F3FF'}},
      customData:[{key:'Type',value:'Virtual Private Gateway / VPN'},{key:'Description',value:'On-premises connectivity'}]
    });
    addIcon('VGW',EXT_X+38,extY+152);
    shapes.push({
      id:'onprem_lbl',type:'rectangle',
      boundingBox:{x:EXT_X+80,y:extY+152,w:extW-120,h:36},
      text:'<p style="font-size:11pt;font-weight:bold;color:#7C3AED;text-align:left">On-Premises / VPN</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
    });
  }
  
  // Transit Gateway (shared)
  const tgwGws=sharedGws.filter(g=>g.type==='TGW');
  if(tgwGws.length>0){
    shapes.push({
      id:'tgw_shared',type:'rectangle',
      boundingBox:{x:EXT_X+30,y:extY+220,w:extW-60,h:60},
      text:NOTEXT,
      style:{stroke:{color:'#EC4899',width:2},fill:{type:'color',color:'#FDF2F8'}},
      customData:[{key:'Type',value:'Transit Gateway'},{key:'TGW IDs',value:tgwGws.map(g=>g.id).join(', ')}]
    });
    addIcon('TGW',EXT_X+38,extY+232);
    shapes.push({
      id:'tgw_shared_lbl',type:'rectangle',
      boundingBox:{x:EXT_X+80,y:extY+232,w:extW-120,h:36},
      text:'<p style="font-size:11pt;font-weight:bold;color:#EC4899;text-align:left">Transit Gateway</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
    });
  }
  
  // Hub to External lines - route above all spokes using straight segments
  const routeAboveY=Math.min(HUB_Y,SPOKE_START_Y)-60;
  const extMidX=EXT_X+extW/2;
  
  // Hub -> Internet: up from hub top, across above spokes, down to ext zone top border
  lines.push({
    id:'hub_inet_1',lineType:'straight',
    stroke:{color:'#10B981',width:3},
    endpoint1:{type:'shapeEndpoint',style:'none',shapeId:hubId,position:{x:0.8,y:0}},
    endpoint2:{type:'positionEndpoint',style:'none',position:{x:HUB_X+hubW*0.8,y:routeAboveY}}
  });
  lines.push({
    id:'hub_inet_2',lineType:'straight',
    stroke:{color:'#10B981',width:3},
    endpoint1:{type:'positionEndpoint',style:'none',position:{x:HUB_X+hubW*0.8,y:routeAboveY}},
    endpoint2:{type:'positionEndpoint',style:'none',position:{x:extMidX,y:routeAboveY}}
  });
  lines.push({
    id:'hub_inet_3',lineType:'straight',
    stroke:{color:'#10B981',width:3},
    endpoint1:{type:'positionEndpoint',style:'none',position:{x:extMidX,y:routeAboveY}},
    endpoint2:{type:'shapeEndpoint',style:'arrow',shapeId:'inet',position:{x:0.5,y:0}}
  });
  
  // Hub -> TGW connection (if TGW exists) - route above spokes
  if(tgwGws.length>0){
    const tgwRouteY=routeAboveY-30;
    lines.push({
      id:'hub_tgw_1',lineType:'straight',
      stroke:{color:'#EC4899',width:2},
      endpoint1:{type:'shapeEndpoint',style:'none',shapeId:hubId,position:{x:0.6,y:0}},
      endpoint2:{type:'positionEndpoint',style:'none',position:{x:HUB_X+hubW*0.6,y:tgwRouteY}}
    });
    lines.push({
      id:'hub_tgw_2',lineType:'straight',
      stroke:{color:'#EC4899',width:2},
      endpoint1:{type:'positionEndpoint',style:'none',position:{x:HUB_X+hubW*0.6,y:tgwRouteY}},
      endpoint2:{type:'positionEndpoint',style:'none',position:{x:EXT_X+extW/2,y:tgwRouteY}}
    });
    lines.push({
      id:'hub_tgw_3',lineType:'straight',
      stroke:{color:'#EC4899',width:2},
      endpoint1:{type:'positionEndpoint',style:'none',position:{x:EXT_X+extW/2,y:tgwRouteY}},
      endpoint2:{type:'shapeEndpoint',style:'arrow',shapeId:'tgw_shared',position:{x:0.5,y:0}}
    });
  }
  
  // Hub -> Spokes (peering) and TGW -> Spokes (TGW routes)
  spokeVpcs.forEach((vpc,idx)=>{
    const sp=spokePositions[vpc.VpcId];
    if(!sp)return;
    
    // Check connection type
    let connType='peering';
    let connColor='#FB923C';
    rts.filter(rt=>rt.VpcId===vpc.VpcId).forEach(rt=>{
      (rt.Routes||[]).forEach(r=>{
        if(r.TransitGatewayId){connType='tgw';connColor='#EC4899';}
      });
    });
    
    if(connType==='tgw'&&tgwGws.length>0){
      // TGW -> Spoke: straight horizontal from TGW left to spoke right
      const tgwCount=spokeVpcs.filter((v,i)=>{
        let ct='peering';
        rts.filter(rt=>rt.VpcId===v.VpcId).forEach(rt=>{
          (rt.Routes||[]).forEach(r=>{if(r.TransitGatewayId)ct='tgw';});
        });
        return ct==='tgw'&&i<=idx;
      }).length;
      const tgwYPos=tgwCount>1?0.2+(tgwCount-1)*(0.6/(Math.max(1,spokeVpcs.length-1))):0.5;
      lines.push({
        id:'tgw_spoke_'+idx,lineType:'straight',
        stroke:{color:'#EC4899',width:2},
        endpoint1:{type:'shapeEndpoint',style:'none',shapeId:'tgw_shared',position:{x:0,y:Math.min(0.9,tgwYPos)}},
        endpoint2:{type:'shapeEndpoint',style:'arrow',shapeId:shapeIds[vpc.VpcId],position:{x:1,y:0.5}}
      });
    } else {
      // Direct hub -> spoke (peering)
      lines.push({
        id:'hub_spoke_'+idx,lineType:'elbow',
        stroke:{color:connColor,width:2,style:'dashed'},
        endpoint1:{type:'shapeEndpoint',style:'none',shapeId:hubId,position:{x:1,y:spokeVpcs.length>1?0.1+idx*(0.8/(spokeVpcs.length-1)):0.5}},
        endpoint2:{type:'shapeEndpoint',style:'arrow',shapeId:shapeIds[vpc.VpcId],position:{x:0,y:0.5}}
      });
    }
  });
  
  // Legend
  const legendX=HUB_X;
  const legendY=HUB_Y+hubH+40;
  shapes.push({
    id:'legend_box',type:'rectangle',
    boundingBox:{x:legendX,y:legendY,w:300,h:140},
    text:NOTEXT,
    style:{stroke:{color:'#CBD5E1',width:1},fill:{type:'color',color:'#FFFFFF'}}
  });
  shapes.push({
    id:'legend_title',type:'rectangle',
    boundingBox:{x:legendX+10,y:legendY+8,w:280,h:24},
    text:'<p style="font-size:11pt;font-weight:bold;color:#334155;text-align:left">Legend</p>',
    style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
  });
  
  // Legend items
  const legendItems=[
    {color:'#7C3AED',label:'Hub VPC',y:40},
    {color:'#3B82F6',label:'Spoke VPC',y:65},
    {color:'#10B981',label:'Internet Gateway',y:90},
    {color:'#EC4899',label:'Transit Gateway',y:115}
  ];
  legendItems.forEach(item=>{
    shapes.push({
      id:'leg_'+item.y,type:'rectangle',
      boundingBox:{x:legendX+15,y:legendY+item.y,w:20,h:16},
      text:NOTEXT,
      style:{stroke:{color:item.color,width:2},fill:{type:'color',color:item.color+'20'}}
    });
    shapes.push({
      id:'leglbl_'+item.y,type:'rectangle',
      boundingBox:{x:legendX+45,y:legendY+item.y,w:240,h:18},
      text:'<p style="font-size:9pt;color:#334155;text-align:left">'+item.label+'</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
    });
  });
  
  // Route 53 DNS Zone section
  if(zones&&zones.length>0){
    const dnsX=HUB_X;
    const dnsY=Math.max(HUB_Y+hubH,spokeY)+60;
    const pubZ=zones.filter(z=>!z.Config?.PrivateZone);
    const privZ=zones.filter(z=>z.Config?.PrivateZone);
    const dnsExp=(_detailLevel>=1);
    const cols=dnsExp?1:2;
    const colW=dnsExp?700:460;
    const recRowH=16;
    const recHeaderH=18;

    // Pre-calculate per-zone height
    const zoneHeights=[];
    zones.forEach(z=>{
      if(!dnsExp){zoneHeights.push(54);return}
      const isPub=!z.Config?.PrivateZone;
      const zid=z.Id.replace('/hostedzone/','');
      const assocVpcs=(!isPub&&z.VPCs)?z.VPCs.length:0;
      const zRecs=recsByZoneLZ[zid]||[];
      let h=28; // header area (name line + zone info line)
      if(assocVpcs)h+=recRowH;
      if(zRecs.length>0) h+=recHeaderH+zRecs.length*recRowH;
      zoneHeights.push(Math.max(54,h+12));
    });
    const zoneGap=8;

    let totalZoneH=0;
    if(dnsExp){zoneHeights.forEach(h=>{totalZoneH+=h+zoneGap})}
    else{totalZoneH=Math.ceil(zones.length/cols)*62}
    const dnsW=cols*colW+60;
    const dnsH=60+totalZoneH+20;

    shapes.push({
      id:'dns_zone',type:'rectangle',
      boundingBox:{x:dnsX,y:dnsY,w:dnsW,h:dnsH},
      text:NOTEXT,
      style:{stroke:{color:'#0ea5e9',width:2,style:'dashed'},fill:{type:'color',color:'#F0F9FF'}}
    });
    shapes.push({
      id:'dns_title',type:'rectangle',
      boundingBox:{x:dnsX+10,y:dnsY+8,w:dnsW-20,h:30},
      text:'<p style="font-size:12pt;font-weight:bold;color:#0ea5e9;text-align:left">Route 53 Hosted Zones ('+pubZ.length+' public, '+privZ.length+' private)</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
    });

    let curY=dnsY+48;
    zones.forEach((z,zi)=>{
      const isPub=!z.Config?.PrivateZone;
      const zid=z.Id.replace('/hostedzone/','');
      const assocVpcs=(!isPub&&z.VPCs)?z.VPCs.map(v=>{
        const vid=v.VPCId||v.VpcId;
        const vpc=vpcs.find(vp=>vp.VpcId===vid);
        return gn(vpc||{},vid);
      }).join(', '):'';
      const zh=zoneHeights[zi];
      const zRecs=recsByZoneLZ[zid]||[];

      if(dnsExp){
        const zx=dnsX+20;
        const zCol=isPub?'#10b981':'#0ea5e9';
        shapes.push({
          id:'dns_'+zi,type:'rectangle',
          boundingBox:{x:zx,y:curY,w:colW-20,h:zh},
          text:NOTEXT,
          style:{stroke:{color:zCol,width:1.5},fill:{type:'color',color:isPub?'#F0FDF4':'#F0F9FF'}},
          customData:[
            {key:'Zone ID',value:zid},{key:'Name',value:z.Name},
            {key:'Type',value:isPub?'Public':'Private'},
            {key:'Records',value:String(z.ResourceRecordSetCount)},
            {key:'Associated VPCs',value:assocVpcs||'N/A'}
          ]
        });
        // Line 1: type + name
        shapes.push({
          id:'dnslbl_'+zi+'a',type:'rectangle',
          boundingBox:{x:zx+6,y:curY+4,w:colW-32,h:18},
          text:'<p style="font-size:10pt;font-weight:bold;color:'+zCol+';text-align:left">'+(isPub?'[Public]':'[Private]')+' '+z.Name+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
        // Line 2: record count + zone ID
        let ly=curY+22;
        shapes.push({
          id:'dnslbl_'+zi+'b',type:'rectangle',
          boundingBox:{x:zx+6,y:ly,w:colW-32,h:recRowH},
          text:'<p style="font-size:8pt;color:#64748B;text-align:left">'+z.ResourceRecordSetCount+' records | Zone ID: '+zid+' | Type: '+(isPub?'Public':'Private')+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
        ly+=recRowH;
        if(assocVpcs){
          shapes.push({
            id:'dnslbl_'+zi+'d',type:'rectangle',
            boundingBox:{x:zx+6,y:ly,w:colW-32,h:recRowH},
            text:'<p style="font-size:8pt;color:#64748B;text-align:left">VPCs: '+assocVpcs+'</p>',
            style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
          });
          ly+=recRowH;
        }
        // Record sets
        if(zRecs.length>0){
          shapes.push({
            id:'dnshdr_'+zi,type:'rectangle',
            boundingBox:{x:zx+6,y:ly,w:colW-32,h:recHeaderH},
            text:'<p style="font-size:7pt;font-weight:bold;color:#475569;text-align:left">NAME                                                  TYPE      VALUE</p>',
            style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
          });
          ly+=recHeaderH;
          zRecs.forEach((rec,ri)=>{
            const rName=rec.Name||'';
            const rType=rec.Type||'';
            const rVal=rec.AliasTarget?'ALIAS → '+rec.AliasTarget.DNSName:
              (rec.ResourceRecords||[]).map(rr=>rr.Value).join(', ');
            const ttl=rec.TTL!=null?'  TTL:'+rec.TTL:'';
            shapes.push({
              id:'dnsrec_'+zi+'_'+ri,type:'rectangle',
              boundingBox:{x:zx+6,y:ly,w:colW-32,h:recRowH},
              text:'<p style="font-size:7pt;color:#334155;text-align:left;font-family:monospace">'+rName+' &nbsp; '+rType+' &nbsp; '+rVal+ttl+'</p>',
              style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
            });
            ly+=recRowH;
          });
        }
        curY+=zh+zoneGap;
      }else{
        // Collapsed: 2-column compact layout
        const col=zi%cols;
        const row=Math.floor(zi/cols);
        const zx=dnsX+20+col*colW;
        const zy=dnsY+48+row*62;
        shapes.push({
          id:'dns_'+zi,type:'rectangle',
          boundingBox:{x:zx,y:zy,w:colW-20,h:54},
          text:NOTEXT,
          style:{stroke:{color:isPub?'#10b981':'#0ea5e9',width:1.5},fill:{type:'color',color:isPub?'#F0FDF4':'#F0F9FF'}},
          customData:[
            {key:'Zone ID',value:zid},{key:'Name',value:z.Name},
            {key:'Type',value:isPub?'Public':'Private'},
            {key:'Records',value:String(z.ResourceRecordSetCount)},
            {key:'Associated VPCs',value:assocVpcs||'N/A'}
          ]
        });
        shapes.push({
          id:'dnslbl_'+zi+'a',type:'rectangle',
          boundingBox:{x:zx+6,y:zy+4,w:colW-32,h:22},
          text:'<p style="font-size:9pt;font-weight:bold;color:'+(isPub?'#10b981':'#0ea5e9')+';text-align:left">'+(isPub?'[Public]':'[Private]')+' '+z.Name+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
        shapes.push({
          id:'dnslbl_'+zi+'b',type:'rectangle',
          boundingBox:{x:zx+6,y:zy+28,w:colW-32,h:20},
          text:'<p style="font-size:8pt;color:#64748B;text-align:left">'+z.ResourceRecordSetCount+' records | '+zid+(assocVpcs?' | VPCs: '+assocVpcs:'')+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
      }
    });
  }
  
  // S3 Buckets section
  if(s3bk&&s3bk.length>0){
    const s3Cols=3;
    const s3ColW=360;
    const s3W=s3Cols*s3ColW+60;
    const s3RowH=36;
    const s3Rows=Math.ceil(s3bk.length/s3Cols);
    const s3H=50+s3Rows*s3RowH+20;
    const dnsExists=zones&&zones.length>0;
    const _lucidDnsH=(function(){
      if(!dnsExists)return 0;
      const dExp=(_detailLevel>=1);const c=dExp?1:2;
      if(dExp){let th=0;(zones||[]).forEach(z=>{const ip=!z.Config?.PrivateZone;const av=(!ip&&z.VPCs)?z.VPCs.length:0;const zid=z.Id.replace('/hostedzone/','');const zR=recsByZoneLZ[zid]||[];let h=28;if(av)h+=16;if(zR.length>0)h+=18+zR.length*16;th+=Math.max(54,h+12)+8});return 60+th+20}
      return 60+Math.ceil((zones||[]).length/c)*62+20;
    })();
    const s3Y=dnsExists?(Math.max(HUB_Y+hubH,spokeY)+60+_lucidDnsH+40):(Math.max(HUB_Y+hubH,spokeY)+60);

    shapes.push({
      id:'s3_lz_section',type:'rectangle',
      boundingBox:{x:HUB_X,y:s3Y,w:s3W,h:s3H},
      text:NOTEXT,
      style:{stroke:{color:'#EA580C',width:2,style:'dashed'},fill:{type:'color',color:'#FFF7ED'}}
    });
    shapes.push({
      id:'s3_lz_title',type:'rectangle',
      boundingBox:{x:HUB_X+10,y:s3Y+8,w:s3W-20,h:30},
      text:'<p style="font-size:12pt;font-weight:bold;color:#EA580C;text-align:left">S3 Buckets ('+s3bk.length+')</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
    });
    
    s3bk.forEach((bk,bi)=>{
      const col=bi%s3Cols;
      const row=Math.floor(bi/s3Cols);
      const bx=HUB_X+20+col*s3ColW;
      const by=s3Y+48+row*s3RowH;
      
      shapes.push({
        id:'ls3_'+bi,type:'rectangle',
        boundingBox:{x:bx,y:by,w:s3ColW-20,h:28},
        text:NOTEXT,
        style:{stroke:{color:'#EA580C',width:1},fill:{type:'color',color:'#FFFFFF'}},
        customData:[
          {key:'Bucket Name',value:bk.Name},
          {key:'Created',value:(bk.CreationDate||'N/A').split('T')[0]}
        ]
      });
      shapes.push({
        id:'ls3lbl_'+bi,type:'rectangle',
        boundingBox:{x:bx+4,y:by+2,w:s3ColW-28,h:24},
        text:'<p style="font-size:8pt;color:#232F3E;text-align:left">'+bk.Name+'</p>',
        style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
      });
    });
  }

  // Compute page dimensions
  let pgW=EXT_X+extW+100;
  let pgH=Math.max(HUB_Y+hubH+200,spokeY+200);
  if(zones&&zones.length>0){
    const pgDnsH=(function(){
      const dExp=(_detailLevel>=1);const c=dExp?1:2;
      if(dExp){let th=0;zones.forEach(z=>{const ip=!z.Config?.PrivateZone;const av=(!ip&&z.VPCs)?z.VPCs.length:0;const zid=z.Id.replace('/hostedzone/','');const zR=recsByZoneLZ[zid]||[];let h=28;if(av)h+=16;if(zR.length>0)h+=18+zR.length*16;th+=Math.max(54,h+12)+8});return 60+th+20}
      return 60+Math.ceil(zones.length/c)*62+20;
    })();
    const dnsBottom=Math.max(HUB_Y+hubH,spokeY)+60+pgDnsH+40;
    pgH=Math.max(pgH,dnsBottom);
  }
  if(s3bk&&s3bk.length>0){
    const pgDnsH2=(function(){
      if(!(zones&&zones.length>0))return 0;
      const dExp=(_detailLevel>=1);const c=dExp?1:2;
      if(dExp){let th=0;zones.forEach(z=>{const ip=!z.Config?.PrivateZone;const av=(!ip&&z.VPCs)?z.VPCs.length:0;const zid=z.Id.replace('/hostedzone/','');const zR=recsByZoneLZ[zid]||[];let h=28;if(av)h+=16;if(zR.length>0)h+=18+zR.length*16;th+=Math.max(54,h+12)+8});return 60+th+20}
      return 60+Math.ceil(zones.length/c)*62+20;
    })();
    const dnsExists=zones&&zones.length>0;
    const s3Y=dnsExists?(Math.max(HUB_Y+hubH,spokeY)+60+pgDnsH2+40):(Math.max(HUB_Y+hubH,spokeY)+60);
    const s3Rows=Math.ceil(s3bk.length/3);
    const s3Bottom=s3Y+50+s3Rows*36+40;
    pgH=Math.max(pgH,s3Bottom);
  }
  
  // Build final export - format must match buildLucidExport
  const doc={version:1,pages:[{id:'page1',title:'AWS-Landing-Zone',shapes,lines}]};
  
  // Landing Zone layout complete
  return {doc,iconSet};
  }catch(e){
    console.error('Landing Zone layout error:', e);
    _showToast('Landing Zone layout error: '+e.message);
    return null;
  }
}

function buildLucidExport(){
  const vpcs=ext(safeParse(gv('in_vpcs')),['Vpcs']);
  const subnets=ext(safeParse(gv('in_subnets')),['Subnets']);
  const rts=ext(safeParse(gv('in_rts')),['RouteTables']);
  const sgs=ext(safeParse(gv('in_sgs')),['SecurityGroups']);
  const nacls=ext(safeParse(gv('in_nacls')),['NetworkAcls']);
  const igws=ext(safeParse(gv('in_igws')),['InternetGateways']);
  const nats=ext(safeParse(gv('in_nats')),['NatGateways']);
  const vpceList=ext(safeParse(gv('in_vpces')),['VpcEndpoints']);
  const peerings=ext(safeParse(gv('in_peer')),['VpcPeeringConnections']);
  const volumes=ext(safeParse(gv('in_vols')),['Volumes']);
  const snapshots=ext(safeParse(gv('in_snaps')),['Snapshots']);
  const s3raw=safeParse(gv('in_s3'));const s3bk=s3raw?ext(s3raw,['Buckets']):[];
  const zones=ext(safeParse(gv('in_r53')),['HostedZones']);
  const allRecordSets=ext(safeParse(gv('in_r53records')),['ResourceRecordSets','RecordSets']);
  const recsByZone={};
  allRecordSets.forEach(r=>{if(r.HostedZoneId)(recsByZone[r.HostedZoneId]=recsByZone[r.HostedZoneId]||[]).push(r)});
  let instances=[];
  const eRaw=safeParse(gv('in_ec2'));
  if(eRaw){
    const reservations=ext(eRaw,['Reservations']);
    if(reservations.length){reservations.forEach(r=>{if(r.Instances)instances=instances.concat(r.Instances);else if(r.InstanceId)instances.push(r)})}
    else{const flat=ext(eRaw,['Instances']);if(flat.length)instances=flat;else{const arr=Array.isArray(eRaw)?eRaw:[eRaw];arr.forEach(x=>{if(x.InstanceId)instances.push(x)})}}
  }
  const albs=ext(safeParse(gv('in_albs')),['LoadBalancers']);
  const tgs=ext(safeParse(gv('in_tgs')),['TargetGroups']);
  const enis=ext(safeParse(gv('in_enis')),['NetworkInterfaces']);
  const wafAcls=ext(safeParse(gv('in_waf')),['WebACLs']);
  const rdsInstances=ext(safeParse(gv('in_rds')),['DBInstances']);
  const ecsServices=ext(safeParse(gv('in_ecs')),['services','Services']);
  const lambdaFns=(ext(safeParse(gv('in_lambda')),['Functions'])).filter(f=>f.VpcConfig&&f.VpcConfig.VpcId);
  const cfDistributions=ext(safeParse(gv('in_cf')),['DistributionList','Items']);
  if(!vpcs.length){_showToast('Render map first');return null}

  // Build lookups
  const subByVpc={};subnets.forEach(s=>(subByVpc[s.VpcId]=subByVpc[s.VpcId]||[]).push(s));
  const sgByVpc={};sgs.forEach(sg=>(sgByVpc[sg.VpcId]=sgByVpc[sg.VpcId]||[]).push(sg));
  const subNacl={};nacls.forEach(n=>(n.Associations||[]).forEach(a=>{if(a.SubnetId)subNacl[a.SubnetId]=n}));
  const exMainRT={};rts.forEach(rt=>{if((rt.Associations||[]).some(a=>a.Main))exMainRT[rt.VpcId]=rt});
  const subRT={};rts.forEach(rt=>(rt.Associations||[]).forEach(a=>{if(a.SubnetId)subRT[a.SubnetId]=rt}));
  subnets.forEach(s=>{if(!subRT[s.SubnetId]&&exMainRT[s.VpcId])subRT[s.SubnetId]=exMainRT[s.VpcId]});
  const instBySub={};instances.forEach(i=>{if(i.SubnetId)(instBySub[i.SubnetId]=instBySub[i.SubnetId]||[]).push(i)});
  const eniBySub={};const eniByInst={};enis.forEach(e=>{if(e.SubnetId)(eniBySub[e.SubnetId]=eniBySub[e.SubnetId]||[]).push(e);if(e.Attachment&&e.Attachment.InstanceId)(eniByInst[e.Attachment.InstanceId]=eniByInst[e.Attachment.InstanceId]||[]).push(e)});
  const albBySub={};albs.forEach(lb=>{(lb.AvailabilityZones||[]).forEach(az=>{if(az.SubnetId)(albBySub[az.SubnetId]=albBySub[az.SubnetId]||[]).push(lb)})});
  const volByInst={};volumes.forEach(v=>{(v.Attachments||[]).forEach(a=>{if(a.InstanceId)(volByInst[a.InstanceId]=volByInst[a.InstanceId]||[]).push(v)})});
  const knownInstIds3=new Set(instances.map(i=>i.InstanceId));
  const instSubFromEni3={};enis.forEach(e=>{if(e.SubnetId&&e.Attachment&&e.Attachment.InstanceId)instSubFromEni3[e.Attachment.InstanceId]=e.SubnetId});
  const volBySub={};volumes.forEach(v=>{const att=(v.Attachments||[])[0];if(att&&att.InstanceId){if(knownInstIds3.has(att.InstanceId))return;const sid=instSubFromEni3[att.InstanceId];if(sid)(volBySub[sid]=volBySub[sid]||[]).push(v)}});
  const snapByVol={};snapshots.forEach(s=>{if(s.VolumeId)(snapByVol[s.VolumeId]=snapByVol[s.VolumeId]||[]).push(s)});
  const tgByAlb={};tgs.forEach(tg=>{(tg.LoadBalancerArns||[]).forEach(arn=>{(tgByAlb[arn]=tgByAlb[arn]||[]).push(tg)})});
  const wafByAlb={};wafAcls.forEach(acl=>{(acl.ResourceArns||[]).forEach(arn=>{(wafByAlb[arn]=wafByAlb[arn]||[]).push(acl)})});
  const rdsBySub={};rdsInstances.forEach(db=>{const sg=db.DBSubnetGroup;if(!sg)return;(sg.Subnets||[]).forEach(s=>{if(s.SubnetIdentifier)(rdsBySub[s.SubnetIdentifier]=rdsBySub[s.SubnetIdentifier]||[]).push(db)})});
  const ecsBySub={};ecsServices.forEach(svc=>{const nc=svc.networkConfiguration?.awsvpcConfiguration;if(!nc)return;(nc.subnets||[]).forEach(sid=>{(ecsBySub[sid]=ecsBySub[sid]||[]).push(svc)})});
  const lambdaBySub={};lambdaFns.forEach(fn=>{(fn.VpcConfig?.SubnetIds||[]).forEach(sid=>{(lambdaBySub[sid]=lambdaBySub[sid]||[]).push(fn)})});
  const cfByAlb={};cfDistributions.forEach(cf=>{(cf.Origins?.Items||[]).forEach(o=>{const dn=o.DomainName||'';albs.forEach(lb=>{if(lb.DNSName&&dn.includes(lb.DNSName))(cfByAlb[lb.LoadBalancerArn]=cfByAlb[lb.LoadBalancerArn]||[]).push(cf)})})});
  const pubSubs=new Set();
  rts.forEach(rt=>{
    const hasIgw=(rt.Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('igw-')&&r.State!=='blackhole');
    (rt.Associations||[]).forEach(a=>{if(a.SubnetId&&hasIgw)pubSubs.add(a.SubnetId)});
  });
  subnets.forEach(s=>{if(!pubSubs.has(s.SubnetId)&&exMainRT[s.VpcId]){
    const hasIgw=(exMainRT[s.VpcId].Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('igw-')&&r.State!=='blackhole');
    if(hasIgw)pubSubs.add(s.SubnetId);
  }});

  function tw(str,pt){return(str||'').length*pt*0.62+20}

  const shapes=[],lines=[],iconSet=new Set();
  const shapeIds={};
  let lid=0;
  const IC=36;
  const VP=50;
  const VH=80;
  const SG=32;
  const SP=24;
  const EC2W=260,EC2H=34,EC2G=16;

  // Official AWS Architecture Group Icon colors
  const COL={
    vpcFill:'#FFFFFF',vpcStroke:'#8C4FFF',vpcFont:'#8C4FFF',
    pubFill:'#FFFFFF',pubStroke:'#7AA116',pubFont:'#7AA116',
    prvFill:'#FFFFFF',prvStroke:'#147EBA',prvFont:'#147EBA',
    ec2Fill:'#FFFFFF',ec2Stroke:'#ED7100',ec2Font:'#232F3E',
    igw:'#8C4FFF',nat:'#8C4FFF',tgw:'#8C4FFF',vgw:'#8C4FFF',
    vpce:'#8C4FFF',pcx:'#8C4FFF',inet:'#232F3E',
    albFill:'#FFFFFF',albStroke:'#8C4FFF',albFont:'#232F3E'
  };
  const gwFills={IGW:'#F5F0FF',NAT:'#F5F0FF',TGW:'#F5F0FF',VGW:'#F5F0FF',PCX:'#F5F0FF',VPCE:'#F5F0FF'};


  // icons as rectangles with image fill
  function addIcon(type,x,y){
    iconSet.add(type);
    shapes.push({
      id:'icon_'+(lid++),type:'rectangle',
      boundingBox:{x,y,w:IC,h:IC},
      text:'<p style="font-size:1pt;color:transparent">&nbsp;</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'image',ref:(ICON_MAP[type]||type.toLowerCase())+'.png'}}
    });
  }

  // collect gateways before VPC loop
  const gwSet2L=new Map();
  rts.forEach(rt=>{(rt.Routes||[]).forEach(r=>{
    if(r.GatewayId&&r.GatewayId!=='local')gwSet2L.set(r.GatewayId,{type:clsGw(r.GatewayId),id:r.GatewayId,vpcId:rt.VpcId});
    if(r.NatGatewayId)gwSet2L.set(r.NatGatewayId,{type:'NAT',id:r.NatGatewayId,vpcId:rt.VpcId});
    if(r.TransitGatewayId)gwSet2L.set(r.TransitGatewayId,{type:'TGW',id:r.TransitGatewayId,vpcId:'shared'});
    if(r.VpcPeeringConnectionId)gwSet2L.set(r.VpcPeeringConnectionId,{type:'PCX',id:r.VpcPeeringConnectionId,vpcId:'shared'});
  })});
  igws.forEach(g=>{if(!gwSet2L.has(g.InternetGatewayId)){const v=(g.Attachments||[])[0];gwSet2L.set(g.InternetGatewayId,{type:'IGW',id:g.InternetGatewayId,vpcId:v?v.VpcId:'unk'})}});
  nats.forEach(g=>{if(!gwSet2L.has(g.NatGatewayId))gwSet2L.set(g.NatGatewayId,{type:'NAT',id:g.NatGatewayId,vpcId:g.VpcId||'unk'})});

  // group by VPC vs shared
  const gwByVpc={};const sharedGws=[];
  gwSet2L.forEach((gw,gwId)=>{
    if(gw.type==='VPCE')return;
    if(gw.vpcId==='shared'){sharedGws.push({...gw,gwMapId:gwId});return}
    if(!gwByVpc[gw.vpcId])gwByVpc[gw.vpcId]=[];
    gwByVpc[gw.vpcId].push({...gw,gwMapId:gwId});
  });
  const vpceByVpc={};
  gwSet2L.forEach(gw=>{if(gw.type==='VPCE')(vpceByVpc[gw.vpcId]=vpceByVpc[gw.vpcId]||[]).push(gw)});
  vpceList.forEach(v=>{if(!vpceByVpc[v.VpcId])vpceByVpc[v.VpcId]=[{type:'VPCE',id:v.VpcEndpointId,vpcId:v.VpcId}]});

  const gwColors2={IGW:COL.igw,NAT:COL.nat,TGW:COL.tgw,VGW:COL.vgw,PCX:COL.pcx,VPCE:COL.vpce};
  const GW_W=350,GW_H=52,GW_GAP=10;

  const activeVpcs=vpcs.filter(v=>(subByVpc[v.VpcId]||[]).length>0);

  // Get layout mode from selector
  const layoutMode=document.getElementById('layoutMode')?.value||'grid';
  const userHubName=(document.getElementById('hubVpcName')?.value||'').toLowerCase().trim();
  // buildLucidExport

  // Landing Zone layout mode
  if(layoutMode==='landingzone'){
    // Landing Zone layout mode
    const result=buildLandingZoneLayout({
      vpcs:activeVpcs,subByVpc,sgByVpc,pubSubs,rts,instances,albs,enis,nacls:subNacl,
      subRT,igws,nats,vpceList,peerings,sharedGws,gwByVpc,vpceByVpc,gwSet2L,
      gn,sid,tw,userHubName,COL,gwColors2,gwFills,ICON_MAP,volumes,zones,
      s3bk,snapshots,snapByVol,tgByAlb,tgs,wafAcls,wafByAlb,
      instBySub,albBySub,eniBySub,volByInst,volBySub,rdsBySub,ecsBySub,lambdaBySub,cfByAlb,recsByZone
    });
    // buildLandingZoneLayout returned
    return result;
  }

  // transparent text to suppress Lucid "Text" placeholder
  const NOTEXT='<p style="font-size:1pt;color:transparent">&nbsp;</p>';

  // gateway badge sizing (wider and taller to fit text)
  const GW_BADGE_W=350,GW_BADGE_H=56,GW_BADGE_GAP=12;
  const GW_BADGES_PER_ROW=2;

  // PASS 1: compute VPC column sizes
  const vpcInfos=[];
  activeVpcs.forEach(vpc=>{
    const ss=subByVpc[vpc.VpcId]||[];
    const vpcName=gn(vpc,vpc.VpcId);
    const vpcLabel=vpcName+' ('+vpc.CidrBlock+')';
    let maxSubW=580;
    ss.forEach(s=>{
      const sName=gn(s,s.SubnetId);
      const isPub=pubSubs.has(s.SubnetId);
      const tag=isPub?'PUBLIC':'PRIVATE';
      const az=s.AvailabilityZone||'';
      const subLabel=sName+' ['+tag+'] '+s.CidrBlock+' '+az;
      const needed=tw(subLabel,10)+IC+24;
      if(needed>maxSubW)maxSubW=needed;
      const insts=instances.filter(i=>i.SubnetId===s.SubnetId);
      const albsInSub=albs.filter(lb=>(lb.AvailabilityZones||[]).some(az2=>az2.SubnetId===s.SubnetId));
      const uaEnis=(eniBySub[s.SubnetId]||[]).filter(e=>!insts.some(i=>enis.some(en=>en.Attachment&&en.Attachment.InstanceId===i.InstanceId&&en.NetworkInterfaceId===e.NetworkInterfaceId)));
      const resCount=insts.length+albsInSub.length+(rdsBySub[s.SubnetId]||[]).length+(ecsBySub[s.SubnetId]||[]).length+(lambdaBySub[s.SubnetId]||[]).length+uaEnis.length;
      const cols=Math.max(1,Math.floor((maxSubW-SP*2)/(EC2W+EC2G)));
      const neededForInst=resCount>0?cols*(EC2W+EC2G)+SP*2:0;
      if(neededForInst>maxSubW)maxSubW=neededForInst;
    });
    maxSubW=Math.min(900,Math.max(520,maxSubW));

    const myGws=gwByVpc[vpc.VpcId]||[];
    const myVpce=vpceByVpc[vpc.VpcId]||[];
    const allGwItems=[...myGws];
    if(myVpce.length>0)allGwItems.push({type:'VPCE',id:'vpce_bundle',isVpce:true,count:myVpce.length});

    // Use fixed badge width
    const maxBadgeW=GW_BADGE_W;
    
    // ensure VPC wide enough for gateway badges
    const gwRowW=Math.min(allGwItems.length,GW_BADGES_PER_ROW)*(maxBadgeW+GW_BADGE_GAP)+VP*2;
    if(gwRowW>maxSubW)maxSubW=Math.max(maxSubW,gwRowW);

    const vpcW=maxSubW+VP*2;
    const vpcLabelW=tw(vpcLabel,14)+IC+24;
    const finalVpcW=Math.max(vpcW,vpcLabelW+VP*2);

    // gateway badge section height
    const gwRows=Math.ceil(allGwItems.length/GW_BADGES_PER_ROW);
    const gwSectionH=gwRows>0?(gwRows*(GW_BADGE_H+GW_BADGE_GAP)+GW_BADGE_GAP+10):0;

    const P1_NAME_H=36,P1_DETAIL_H=28,P1_CHILD_LINE_H=22,P1_CHILD_GAP=8,P1_RES_PAD=10;
    const P1_CHILD_INNER_W=EC2W-24;
    function p1ChildH(label){return Math.max(1,Math.ceil(tw(label,8)/P1_CHILD_INNER_W))*P1_CHILD_LINE_H+8;}
    function p1ResH(r){
      const chs=r.children||[];
      let h=P1_RES_PAD+P1_NAME_H;
      if(r.detail)h+=P1_DETAIL_H;
      if(chs.length>0){
        h+=P1_CHILD_GAP;
        chs.forEach(ch=>{h+=p1ChildH(ch.label||'')+P1_CHILD_GAP;});
      }
      h+=P1_RES_PAD;
      return Math.max(EC2H,h);
    }
    let subStackH=0;
    const subHeights={};
    ss.forEach(s=>{
      const sInsts=instances.filter(i=>i.SubnetId===s.SubnetId);
      const sAlbs=albs.filter(lb=>(lb.AvailabilityZones||[]).some(az=>az.SubnetId===s.SubnetId));
      const sRds=(rdsBySub[s.SubnetId]||[]);
      const sEcs=(ecsBySub[s.SubnetId]||[]);
      const sLam=(lambdaBySub[s.SubnetId]||[]);
      const sEni=(eniBySub[s.SubnetId]||[]);
      const p1Attached=new Set();
      // Build resources with children for height calc
      const p1Res=[];
      sInsts.forEach(i=>{
        const ie=enis.filter(e=>e.Attachment&&e.Attachment.InstanceId===i.InstanceId);
        ie.forEach(e=>p1Attached.add(e.NetworkInterfaceId));
        const ch=[];
        if(_showNested){
          ie.forEach(e=>ch.push({label:'ENI: '+e.NetworkInterfaceId.slice(-8)+(e.PrivateIpAddress?' \u00b7 '+e.PrivateIpAddress:'')}));
          (volByInst[i.InstanceId]||[]).forEach(v=>{const sc=(snapByVol[v.VolumeId]||[]).length;ch.push({label:'VOL: '+v.Size+'GB '+(v.VolumeType||'')+(sc?' \u00b7 '+sc+' snap':'')})});
        }
        p1Res.push({detail:i.InstanceType,children:ch});
      });
      sAlbs.forEach(lb=>{
        const ch=[];
        if(_showNested){
          (tgByAlb[lb.LoadBalancerArn]||[]).forEach(t=>ch.push({label:'TG: '+(t.TargetGroupName||'TG')+' \u00b7 '+((t.Targets||[]).length)+' tgt'}));
          (wafByAlb[lb.LoadBalancerArn]||[]).forEach(w=>ch.push({label:'WAF: '+(w.Name||'WAF')+' \u00b7 '+((w.Rules||[]).length)+' rules'}));
          (cfByAlb[lb.LoadBalancerArn]||[]).forEach(cf=>ch.push({label:'CF: '+(cf.DomainName||'CF')}));
        }
        p1Res.push({detail:lb.Scheme||'',children:ch});
      });
      sRds.forEach(db=>p1Res.push({detail:db.Engine||'',children:[]}));
      sEcs.forEach(svc=>p1Res.push({detail:svc.launchType||'',children:[]}));
      sLam.forEach(fn=>p1Res.push({detail:fn.Runtime||'',children:[]}));
      sEni.forEach(e=>{if(!p1Attached.has(e.NetworkInterfaceId))p1Res.push({detail:e.PrivateIpAddress||'',children:[]})});
      // Standalone EBS volumes
      ((volBySub||{})[s.SubnetId]||[]).forEach(v=>p1Res.push({detail:v.Size+'GB '+(v.VolumeType||''),children:[]}));
      const cols=Math.max(1,Math.floor((maxSubW-SP*2)/(EC2W+EC2G)));
      const rowCount=Math.ceil(p1Res.length/cols);
      let totalResH=0;
      for(let row=0;row<rowCount;row++){
        let maxH=EC2H;
        for(let c=0;c<cols;c++){const ri=row*cols+c;if(ri<p1Res.length){const h=p1ResH(p1Res[ri]);if(h>maxH)maxH=h;}}
        totalResH+=maxH+EC2G;
      }
      const subH=VH+totalResH+SP*2;
      const finalSubH=Math.max(60,subH);
      subHeights[s.SubnetId]=finalSubH;
      subStackH+=finalSubH+SG;
    });
    const vpcH=VH+gwSectionH+subStackH+VP;
    vpcInfos.push({vpc,ss,vpcLabel,maxSubW,finalVpcW,vpcH,allGwItems,gwSectionH,subHeights,maxBadgeW});
  });

  const VPC_TOP=80;
  const COL_SPACE=500; // extra space for per-VPC gateways on the right

  // track VPC positions for line routing
  const vpcPositions={};

  // PASS 2: place shapes
  let vpcX=120;

  vpcInfos.forEach(info=>{
    const {vpc,ss,vpcLabel,maxSubW,finalVpcW,vpcH,allGwItems,gwSectionH,subHeights,maxBadgeW}=info;
    info.vpcX=vpcX; // store for later use in line drawing
    const vpcId='vpc_'+(lid++);
    shapeIds[vpc.VpcId]=vpcId;
    
    // Get VPC stats
    const vpcSgs=sgByVpc[vpc.VpcId]||[];
    const vpcRts=rts.filter(rt=>rt.VpcId===vpc.VpcId);
    const vpcVpces=vpceList.filter(v=>v.VpcId===vpc.VpcId);
    const vpcInsts=instances.filter(i=>ss.some(s=>s.SubnetId===i.SubnetId));
    const vpcEnis=enis.filter(e=>e.VpcId===vpc.VpcId);
    const region=ss[0]?.AvailabilityZone?.replace(/-[a-z]$/,'')||'';

    // VPC container
    shapes.push({
      id:vpcId,type:'roundedRectangleContainer',
      boundingBox:{x:vpcX,y:VPC_TOP,w:finalVpcW,h:vpcH},
      text:NOTEXT,
      style:{stroke:{color:COL.vpcStroke,width:3,style:'dashed'},fill:{type:'color',color:COL.vpcFill}},
      magnetize:true,
      customData:[
        {key:'VPC ID',value:vpc.VpcId},
        {key:'Name',value:gn(vpc,vpc.VpcId)},
        {key:'CIDR',value:vpc.CidrBlock||''},
        {key:'Region',value:region},
        {key:'Subnets',value:String(ss.length)},
        {key:'Security Groups',value:String(vpcSgs.length)},
        {key:'Route Tables',value:String(vpcRts.length)},
        {key:'EC2 Instances',value:String(vpcInsts.length)},
        {key:'ENIs',value:String(vpcEnis.length)},
        {key:'VPC Endpoints',value:String(vpcVpces.length)}
      ]
    });
    // store VPC position for line routing
    vpcPositions[vpc.VpcId]={x:vpcX,w:finalVpcW,h:vpcH,bottomY:VPC_TOP+vpcH};
    addIcon('VPC',vpcX+6,VPC_TOP+4);
    // Truncate VPC label to fit - conservative estimate
    const maxVpcChars=Math.floor((finalVpcW-IC-50)/11);
    const dispVpcLabel=vpcLabel.length>maxVpcChars?vpcLabel.substring(0,maxVpcChars-2)+'..':vpcLabel;
    shapes.push({
      id:'vpclbl_'+(lid++),type:'rectangle',
      boundingBox:{x:vpcX+IC+12,y:VPC_TOP+4,w:finalVpcW-IC-24,h:VH-10},
      text:'<p style="font-size:14pt;font-weight:bold;color:'+COL.vpcFont+';text-align:left;padding:4px 8px">'+dispVpcLabel+'</p>',
      style:{stroke:{color:COL.vpcFill,width:0},fill:{type:'color',color:COL.vpcFill}}
    });

    // gateway badges inside VPC, below header
    const thisBadgeW=maxBadgeW||GW_BADGE_W;
    let gwBadgeY=VPC_TOP+VH+6;
    for(let row=0;row<Math.ceil(allGwItems.length/GW_BADGES_PER_ROW);row++){
      const rowItems=allGwItems.slice(row*GW_BADGES_PER_ROW,(row+1)*GW_BADGES_PER_ROW);
      let gwBX=vpcX+VP;
      rowItems.forEach(gw=>{
        const gc=gwColors2[gw.type]||'#546E7A';
        const gf=gwFills[gw.type]||'#F5F0FF';
        if(gw.isVpce){
          // Truncate VPCE text
          const vpceText='VPCE ('+gw.count+')';
          // VPCE badge with text
          shapes.push({
            id:'vpce_'+(lid++),type:'rectangle',
            boundingBox:{x:gwBX,y:gwBadgeY,w:thisBadgeW,h:GW_BADGE_H},
            text:NOTEXT,
            style:{stroke:{color:COL.vpce,width:2,style:'dashed'},fill:{type:'color',color:'#F5F0FF'}}
          });
          addIcon('VPCE',gwBX+10,gwBadgeY+10);
          shapes.push({
            id:'vpce_lbl_'+(lid++),type:'rectangle',
            boundingBox:{x:gwBX+52,y:gwBadgeY+10,w:thisBadgeW-62,h:36},
            text:'<p style="font-size:10pt;color:#232F3E;font-weight:bold;text-align:left">'+vpceText+'</p>',
            style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
          });
        } else {
          const nm=gwNames[gw.id]||sid(gw.id);
          
          // Build gateway-specific customData
          let gwCustomData=[
            {key:'Gateway ID',value:gw.id},
            {key:'Type',value:gw.type==='IGW'?'Internet Gateway':gw.type==='NAT'?'NAT Gateway':gw.type==='VGW'?'Virtual Private Gateway':gw.type},
            {key:'Name',value:nm}
          ];
          
          // Add NAT-specific info
          if(gw.type==='NAT'){
            const natGw=nats.find(n=>n.NatGatewayId===gw.id);
            if(natGw){
              gwCustomData.push({key:'State',value:natGw.State||''});
              gwCustomData.push({key:'Connectivity',value:natGw.ConnectivityType||'public'});
              const pubIp=(natGw.NatGatewayAddresses||[])[0]?.PublicIp;
              const privIp=(natGw.NatGatewayAddresses||[])[0]?.PrivateIp;
              if(pubIp)gwCustomData.push({key:'Public IP',value:pubIp});
              if(privIp)gwCustomData.push({key:'Private IP',value:privIp});
            }
          }
          
          // Add IGW-specific info
          if(gw.type==='IGW'){
            const igw=igws.find(g=>g.InternetGatewayId===gw.id);
            if(igw){
              const attachedVpcs=(igw.Attachments||[]).map(a=>a.VpcId).join(', ');
              gwCustomData.push({key:'Attached VPCs',value:attachedVpcs||'None'});
              gwCustomData.push({key:'State',value:(igw.Attachments||[])[0]?.State||''});
            }
          }
          
          // Truncate text to fit
          const maxBChars=Math.floor((thisBadgeW-60)/7);
          const fullBText=gw.type+': '+nm;
          const dispBText=fullBText.length>maxBChars?fullBText.substring(0,maxBChars-2)+'..':fullBText;
          
          // Gateway badge with text
          shapes.push({
            id:'gwb_'+(lid++),type:'rectangle',
            boundingBox:{x:gwBX,y:gwBadgeY,w:thisBadgeW,h:GW_BADGE_H},
            text:NOTEXT,
            style:{stroke:{color:gc,width:2},fill:{type:'color',color:gf}},
            customData:gwCustomData
          });
          addIcon(gw.type,gwBX+10,gwBadgeY+10);
          shapes.push({
            id:'gwb_lbl_'+(lid++),type:'rectangle',
            boundingBox:{x:gwBX+52,y:gwBadgeY+10,w:thisBadgeW-62,h:36},
            text:'<p style="font-size:10pt;font-weight:bold;color:#232F3E;text-align:left">'+dispBText+'</p>',
            style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
          });
        }
        gwBX+=thisBadgeW+GW_BADGE_GAP;
      });
      gwBadgeY+=GW_BADGE_H+GW_BADGE_GAP;
    }

    // subnets below gateway badges
    let subY=VPC_TOP+VH+gwSectionH;
    ss.forEach(s=>{
      const sName=gn(s,s.SubnetId);
      const isPub=pubSubs.has(s.SubnetId);
      const tag=isPub?'PUBLIC':'PRIVATE';
      const az=s.AvailabilityZone||'';
      const subLabel=sName+' ['+tag+'] '+s.CidrBlock+' '+az;
      const subId='sub_'+(lid++);
      shapeIds[s.SubnetId]=subId;
      const insts=instBySub[s.SubnetId]||[];
      const subEnis=eniBySub[s.SubnetId]||[];
      const subAlbs=albBySub[s.SubnetId]||[];
      const subRds=rdsBySub[s.SubnetId]||[];
      const subEcs=ecsBySub[s.SubnetId]||[];
      const subLambda=lambdaBySub[s.SubnetId]||[];
      const NAME_H=36,DETAIL_H=28,CHILD_LINE_H=22,CHILD_GAP=8,RES_PAD=10;
      const CHILD_INNER_W=EC2W-24;
      function childLines(label){return Math.max(1,Math.ceil(tw(label,8)/CHILD_INNER_W));}
      function childH(label){return childLines(label)*CHILD_LINE_H+8;}
      const attachedEnis=new Set();
      const resources=[];
      // EC2 with ENI + VOL children
      insts.forEach(i=>{
        const ch=[];
        const ie=enis.filter(e=>e.Attachment&&e.Attachment.InstanceId===i.InstanceId);
        ie.forEach(e=>attachedEnis.add(e.NetworkInterfaceId));
        if(_showNested){
          ie.forEach(e=>ch.push({type:'ENI',name:e.NetworkInterfaceId.slice(-8),detail:e.PrivateIpAddress||'',col:'#3b82f6'}));
          (volByInst[i.InstanceId]||[]).forEach(v=>{
            const sc=(snapByVol[v.VolumeId]||[]).length;
            ch.push({type:'VOL',name:v.Size+'GB '+(v.VolumeType||''),detail:sc?sc+' snap':'',col:'#f59e0b'});
          });
        }
        resources.push({type:'EC2',name:gn(i,i.InstanceId),id:i.InstanceId,detail:i.InstanceType,children:ch,resCol:'#10b981'});
      });
      // ALB with TG + WAF + CF children
      subAlbs.forEach(lb=>{
        const ch=[];
        if(_showNested){
          (tgByAlb[lb.LoadBalancerArn]||[]).forEach(tg=>ch.push({type:'TG',name:tg.TargetGroupName||'TG',detail:(tg.Targets||[]).length+' tgt',col:'#06b6d4'}));
          (wafByAlb[lb.LoadBalancerArn]||[]).forEach(w=>ch.push({type:'WAF',name:w.Name||'WAF',detail:(w.Rules||[]).length+' rules',col:'#eab308'}));
          (cfByAlb[lb.LoadBalancerArn]||[]).forEach(cf=>ch.push({type:'CF',name:cf.DomainName||'CF',detail:'',col:'#8b5cf6'}));
        }
        resources.push({type:'ALB',name:lb.LoadBalancerName||'ALB',id:lb.LoadBalancerArn,detail:lb.Scheme||'',children:ch,resCol:'#38bdf8'});
      });
      // RDS
      subRds.forEach(db=>resources.push({type:'RDS',name:db.DBInstanceIdentifier||'RDS',id:db.DBInstanceIdentifier,detail:db.Engine||'',children:[],resCol:'#3b82f6'}));
      // ECS
      subEcs.forEach(svc=>resources.push({type:'ECS',name:svc.serviceName||'ECS',id:svc.serviceName,detail:svc.launchType||'',children:[],resCol:'#f97316'}));
      // Lambda
      subLambda.forEach(fn=>resources.push({type:'FN',name:fn.FunctionName||'Lambda',id:fn.FunctionName,detail:fn.Runtime||'',children:[],resCol:'#a855f7'}));
      // Unattached ENIs
      subEnis.forEach(e=>{
        if(attachedEnis.has(e.NetworkInterfaceId))return;
        resources.push({type:'ENI',name:e.NetworkInterfaceId.slice(-8),id:e.NetworkInterfaceId,detail:e.PrivateIpAddress||'',children:[],resCol:'#3b82f6'});
      });
      // Standalone EBS volumes
      ((volBySub||{})[s.SubnetId]||[]).forEach(v=>{const att=(v.Attachments||[])[0];
        resources.push({type:'VOL',name:v.Size+'GB '+(v.VolumeType||''),id:v.VolumeId,detail:att?att.InstanceId?.slice(-8)||'':'detached',children:[],resCol:'#f59e0b'});
      });
      // Calculate per-resource height (name + detail + children + padding)
      function resHeight(r){
        const chs=r.children||[];
        let h=RES_PAD+NAME_H;
        if(r.detail)h+=DETAIL_H;
        if(chs.length>0){
          h+=CHILD_GAP;
          chs.forEach(ch=>{
            const lbl=ch.type+': '+ch.name+(ch.detail?' \u00b7 '+ch.detail:'');
            h+=childH(lbl)+CHILD_GAP;
          });
        }
        h+=RES_PAD;
        return Math.max(EC2H,h);
      }
      const cols=Math.max(1,Math.floor((maxSubW-SP*2)/(EC2W+EC2G)));
      // For row height, use max height of resources in that row
      const rowCount=Math.ceil(resources.length/cols);
      let totalResH=0;
      for(let row=0;row<rowCount;row++){
        let maxH=EC2H;
        for(let c=0;c<cols;c++){const ri=row*cols+c;if(ri<resources.length){const h=resHeight(resources[ri]);if(h>maxH)maxH=h;}}
        totalResH+=maxH+EC2G;
      }
      const subH=VH+totalResH+SP*2;
      const finalSubH=Math.max(60,subH);
      const sx=vpcX+VP,sy=subY;
      const fc=isPub?COL.pubFont:COL.prvFont;
      const fill=isPub?COL.pubFill:COL.prvFill;
      const stroke=isPub?COL.pubStroke:COL.prvStroke;
      
      // Get NACL and route table info
      const nacl=subNacl[s.SubnetId];
      const rt=subRT[s.SubnetId];
      const naclName=nacl?gn(nacl,nacl.NetworkAclId):'Default';
      const rtName=rt?gn(rt,rt.RouteTableId):'Main';
      const routes=(rt?.Routes||[]).filter(r=>r.GatewayId!=='local').map(r=>(r.DestinationCidrBlock||r.DestinationPrefixListId||'?')+' > '+(r.GatewayId||r.NatGatewayId||r.TransitGatewayId||'?')).join('; ');
      
      shapes.push({
        id:subId,type:'rectangle',
        boundingBox:{x:sx,y:sy,w:maxSubW,h:finalSubH},
        text:NOTEXT,
        style:{stroke:{color:stroke,width:2},fill:{type:'color',color:fill}},
        customData:[
          {key:'Subnet ID',value:s.SubnetId},
          {key:'Name',value:gn(s,s.SubnetId)},
          {key:'CIDR',value:s.CidrBlock||''},
          {key:'AZ',value:s.AvailabilityZone||''},
          {key:'Type',value:isPub?'Public':'Private'},
          {key:'NACL',value:naclName+(nacl?' ('+nacl.NetworkAclId+')':'')},
          {key:'Route Table',value:rtName+(rt?' ('+rt.RouteTableId+')':'')},
          {key:'Routes',value:routes||'local only'},
          {key:'EC2 Instances',value:String(insts.length)},
          {key:'ENIs',value:String(subEnis.length)},
          {key:'Load Balancers',value:String(subAlbs.length)}
        ]
      });
      addIcon(isPub?'SUB_PUB':'SUB_PRV',sx+6,sy+6);
      // Truncate subnet label to fit - conservative estimate
      const maxSubChars=Math.floor((maxSubW-IC-40)/9);
      const dispSubLabel=subLabel.length>maxSubChars?subLabel.substring(0,maxSubChars-2)+'..':subLabel;
      shapes.push({
        id:'sublbl_'+(lid++),type:'rectangle',
        boundingBox:{x:sx+IC+12,y:sy+6,w:maxSubW-IC-24,h:32},
        text:'<p style="font-size:10pt;font-weight:bold;color:'+fc+';text-align:left;padding:4px 6px">'+dispSubLabel+'</p>',
        style:{stroke:{color:fill,width:0},fill:{type:'color',color:fill}}
      });
      // Compute row Y offsets using variable row heights
      const rowHeights=[];
      for(let row=0;row<rowCount;row++){
        let maxH=EC2H;
        for(let c=0;c<cols;c++){const ri=row*cols+c;if(ri<resources.length){const h=resHeight(resources[ri]);if(h>maxH)maxH=h;}}
        rowHeights.push(maxH);
      }
      const rowYOff=[0];
      for(let i=0;i<rowHeights.length;i++)rowYOff.push(rowYOff[i]+rowHeights[i]+EC2G);

      resources.forEach((r,ri)=>{
        const col=ri%cols,row=Math.floor(ri/cols);
        const rx=sx+SP+col*(EC2W+EC2G);
        const ry=sy+VH+rowYOff[row];
        const isAlb=r.type==='ALB';
        const rH=resHeight(r);

        // Build customData based on resource type
        const resCustomData=[{key:'Type',value:r.type},{key:'Name',value:r.name||''},{key:'ID',value:r.id||''}];
        if(r.detail)resCustomData.push({key:'Detail',value:r.detail});

        // Truncate name to fit box
        const maxResChars=Math.floor((EC2W-20)/8);
        const dispResName=r.name.length>maxResChars?r.name.substring(0,maxResChars-2)+'..':r.name;

        // Build rich text: type badge + name + detail + children
        const rc=r.resCol||COL.ec2Font;
        let resHtml='<p style="font-size:9pt;color:'+rc+';font-weight:bold;text-align:left;padding:4px 6px">'+r.type+': '+dispResName+'</p>';
        if(r.detail){
          resHtml+='<p style="font-size:7pt;color:#6B7280;text-align:left;padding:0 6px">'+r.detail+'</p>';
        }
        (r.children||[]).forEach(ch=>{
          const chLabel=ch.type+': '+ch.name+(ch.detail?' \u00b7 '+ch.detail:'');
          resHtml+='<p style="font-size:8pt;color:'+ch.col+';font-weight:bold;text-align:left;padding:2px 6px;margin:4px 0">\u00a0\u00a0'+chLabel+'</p>';
        });

        // Resource container box
        shapes.push({
          id:'res_'+(lid++),type:'rectangle',
          boundingBox:{x:rx,y:ry,w:EC2W,h:rH},
          text:resHtml,
          style:{
            stroke:{color:rc,width:1},
            fill:{type:'color',color:'#FFFFFF'}
          },
          customData:resCustomData
        });
      });
      subY+=finalSubH+SG;
    });

    vpcX+=finalVpcW+COL_SPACE;
  });

  // Build subnet positions lookup (needed for gateway line routing)
  const subnetPositions={};
  vpcInfos.forEach(vi=>{
    const vpcX=vi.vpcX;
    let sy=VPC_TOP+VH+vi.gwSectionH;
    vi.ss.forEach((s,si)=>{
      const finalSubH=vi.subHeights[s.SubnetId]||60;
      subnetPositions[s.SubnetId]={
        x:vpcX+VP,
        y:sy,
        w:vi.maxSubW,
        h:finalSubH,
        vpcId:vi.vpc.VpcId,
        vpcX:vpcX,
        vpcW:vi.finalVpcW,
        vpcH:vi.vpcH,
        subIndex:si,
        centerX:vpcX+VP+vi.maxSubW/2,
        centerY:sy+finalSubH/2
      };
      sy+=finalSubH+SG;
    });
  });

  // --- Per-VPC Gateways (IGW, NAT, VGW) to the RIGHT of each VPC ---
  const PER_VPC_GW_X_OFFSET=60; // distance from VPC right edge
  const PER_VPC_GW_MAX_W=COL_SPACE-PER_VPC_GW_X_OFFSET-40; // max width to fit in column gap
  const PER_VPC_GW_H=56;
  const PER_VPC_GW_GAP=50;
  const perVpcGwPos={}; // gwId -> {x,y,centerX,centerY}
  
  vpcInfos.forEach(vi=>{
    const vpcRightX=vi.vpcX+vi.finalVpcW;
    const gwX=vpcRightX+PER_VPC_GW_X_OFFSET;
    
    // Get per-VPC gateways (IGW, NAT, VGW) for this VPC
    const vpcGws=vi.allGwItems.filter(g=>!g.isVpce && (g.type==='IGW'||g.type==='NAT'||g.type==='VGW'));
    
    // Use fixed width that fits within column space
    const maxGwW=PER_VPC_GW_MAX_W;
    
    let gwY=VPC_TOP+50;
    vpcGws.forEach((gw,gi)=>{
      const nm=gwNames[gw.id]||sid(gw.id);
      const gc=gwColors2[gw.type]||'#546E7A';
      const gf=gwFills[gw.type]||'#F5F0FF';
      const gwShapeId='pvgw_'+(lid++);
      shapeIds[gw.id]=gwShapeId;
      
      // Truncate text aggressively to fit within box (accounting for icon)
      const maxChars=Math.floor((maxGwW-70)/9);
      const fullText=gw.type+': '+nm;
      const dispText=fullText.length>maxChars?fullText.substring(0,maxChars-2)+'..':fullText;
      
      // Rectangle with text - icon overlaps but text stays in bounds
      shapes.push({
        id:gwShapeId,type:'rectangle',
        boundingBox:{x:gwX,y:gwY,w:maxGwW,h:PER_VPC_GW_H},
        text:'<p style="font-size:9pt;font-weight:bold;color:'+gc+';text-align:center">'+dispText+'</p>',
        style:{stroke:{color:gc,width:2},fill:{type:'color',color:gf}},
        customData:[
          {key:'Gateway ID',value:gw.id},
          {key:'Type',value:gw.type==='IGW'?'Internet Gateway':gw.type==='NAT'?'NAT Gateway':'Virtual Private Gateway'},
          {key:'Name',value:nm},
          {key:'VPC',value:vi.vpc.VpcId}
        ]
      });
      // Icon
      addIcon(gw.type,gwX+10,gwY+10);
      
      perVpcGwPos[gw.id]={
        x:gwX,
        y:gwY,
        centerX:gwX+maxGwW/2,
        centerY:gwY+PER_VPC_GW_H/2,
        leftEdge:gwX,
        vpcId:vi.vpc.VpcId
      };
      
      gwY+=PER_VPC_GW_H+PER_VPC_GW_GAP;
    });
  });

  // Build reverse map: rtId -> all subnets using it (for both per-VPC and shared gw lines)
  const rtToSubs={};
  subnets.forEach(s=>{
    const rt=subRT[s.SubnetId];
    if(rt){(rtToSubs[rt.RouteTableId]=rtToSubs[rt.RouteTableId]||[]).push(s.SubnetId)}
  });

  // --- Lines from subnets to per-VPC gateways (IGW, NAT, VGW) ---
  const perVpcGwLines={};
  rts.forEach(rt=>{
    const vId=rt.VpcId;
    const rtSubnets=rtToSubs[rt.RouteTableId]||[];
    if(rtSubnets.length===0)return;
    
    (rt.Routes||[]).forEach(r=>{
      // Check for IGW, NAT, VGW routes
      let gwId=null,gwType=null;
      if(r.GatewayId?.startsWith('igw-')){gwId=r.GatewayId;gwType='IGW';}
      else if(r.NatGatewayId){gwId=r.NatGatewayId;gwType='NAT';}
      else if(r.GatewayId?.startsWith('vgw-')){gwId=r.GatewayId;gwType='VGW';}
      
      if(!gwId||!perVpcGwPos[gwId])return;
      
      rtSubnets.forEach(subId=>{
        const key=subId+'|'+gwId;
        if(perVpcGwLines[key])return;
        perVpcGwLines[key]=true;
        
        const subPos=subnetPositions[subId];
        if(!subPos||!shapeIds[subId]||!shapeIds[gwId])return;
        
        const gwPos=perVpcGwPos[gwId];
        const gc=gwColors2[gwType]||'#546E7A';
        
        // Get names for metadata
        const subObj=subnets.find(s=>s.SubnetId===subId);
        const subName=subObj?gn(subObj,subId):subId;
        const gwName=gwNames[gwId]||sid(gwId);
        
        // Line from right edge of subnet to left edge of gateway
        // Route: right of subnet -> trunk outside VPC -> gateway
        const trunkX=subPos.vpcX+subPos.vpcW+30;
        
        lines.push({
          id:'pvln_'+(lid++),lineType:'straight',
          stroke:{color:gc,width:1.5},
          endpoint1:{type:'shapeEndpoint',style:'none',shapeId:shapeIds[subId],position:{x:1,y:0.5}},
          endpoint2:{type:'shapeEndpoint',style:'arrow',shapeId:shapeIds[gwId],position:{x:0,y:0.5}},
          joints:[
            {x:trunkX,y:subPos.centerY},
            {x:trunkX,y:gwPos.centerY}
          ],
          customData:[
            {key:'From Subnet',value:subName},
            {key:'Subnet ID',value:subId},
            {key:'To Gateway',value:gwName},
            {key:'Gateway ID',value:gwId},
            {key:'Gateway Type',value:gwType},
            {key:'Route',value:r.DestinationCidrBlock||''}
          ]
        });
      });
    });
  });

  // --- shared gateways (TGW, PCX) centered BELOW all VPCs ---
  const maxVpcH=vpcInfos.length>0?Math.max(...vpcInfos.map(v=>v.vpcH)):200;
  const BUS_Y=VPC_TOP+maxVpcH+80; // horizontal routing channel
  const SHARED_ROW_Y=VPC_TOP+maxVpcH+200;
  
  // Use fixed width for shared gateways
  const sharedTotalW=sharedGws.length*(GW_W+60);
  let sharedStartX=Math.max(40,(vpcX-sharedTotalW)/2);
  const sharedGwPos={};
  let sharedCurX=sharedStartX;
  sharedGws.forEach((gw,i)=>{
    const nm=gwNames[gw.id]||sid(gw.id);
    const gwLabel=gw.type+': '+nm;
    const gc=gwColors2[gw.type]||'#546E7A';
    const gf=gwFills[gw.type]||'#F5F0FF';
    const gwShapeId='sgw_'+(lid++);
    shapeIds[gw.gwMapId]=gwShapeId;
    const gwX=sharedCurX;
    const thisGwW=GW_W;
    
    // Find connected VPCs
    const connectedVpcs=new Set();
    rts.forEach(rt=>{
      (rt.Routes||[]).forEach(r=>{
        if((r.TransitGatewayId===gw.id)||(r.VpcPeeringConnectionId===gw.id)){
          connectedVpcs.add(rt.VpcId);
        }
      });
    });
    
    let gwCustomData=[
      {key:'Gateway ID',value:gw.id},
      {key:'Type',value:gw.type==='TGW'?'Transit Gateway':gw.type==='PCX'?'VPC Peering':'Gateway'},
      {key:'Name',value:nm},
      {key:'Connected VPCs',value:String(connectedVpcs.size)}
    ];
    
    // Add peering-specific info
    if(gw.type==='PCX'){
      const pcx=peerings.find(p=>p.VpcPeeringConnectionId===gw.id);
      if(pcx){
        gwCustomData.push({key:'Requester VPC',value:pcx.RequesterVpcInfo?.VpcId||''});
        gwCustomData.push({key:'Accepter VPC',value:pcx.AccepterVpcInfo?.VpcId||''});
        gwCustomData.push({key:'Status',value:pcx.Status?.Code||''});
      }
    }
    
    // Truncate text to fit
    const maxSChars=Math.floor((thisGwW-20)/9);
    const dispSText=gwLabel.length>maxSChars?gwLabel.substring(0,maxSChars-2)+'..':gwLabel;
    
    // Rectangle with text
    shapes.push({
      id:gwShapeId,type:'rectangle',
      boundingBox:{x:gwX,y:SHARED_ROW_Y,w:thisGwW,h:GW_H},
      text:'<p style="font-size:10pt;font-weight:bold;color:'+gc+';text-align:center">'+dispSText+'</p>',
      style:{stroke:{color:gc,width:2},fill:{type:'color',color:gf}},
      customData:gwCustomData
    });
    addIcon(gw.type,gwX+10,SHARED_ROW_Y+8);
    sharedGwPos[gw.gwMapId]={x:gwX,centerX:gwX+thisGwW/2,topY:SHARED_ROW_Y};
    sharedCurX+=thisGwW+60;
  });

  // --- LINES: Subnet -> shared TGW/PCX (per-subnet, routed around VPCs) ---
  // Track which subnet-gateway pairs we've drawn
  const subGwSeen=new Set();
  
  // Count lines per gateway for spreading connection points
  const gwLineCount={};
  rts.forEach(rt=>{
    const rtSubnets=rtToSubs[rt.RouteTableId]||[];
    (rt.Routes||[]).forEach(r=>{
      const tid=r.TransitGatewayId||r.VpcPeeringConnectionId;
      if(!tid)return;
      rtSubnets.forEach(subId=>{
        const ek=subId+'|'+tid;
        if(!subGwSeen.has(ek)){
          subGwSeen.add(ek);
          gwLineCount[tid]=(gwLineCount[tid]||0)+1;
        }
      });
    });
  });
  subGwSeen.clear();
  
  // Track current line index per gateway for spreading
  const gwLineIdx={};
  let globalLineIdx=0;
  
  rts.forEach(rt=>{
    const vId=rt.VpcId;
    if(!vpcPositions[vId])return;

    const rtSubnets=rtToSubs[rt.RouteTableId]||[];
    if(rtSubnets.length===0)return;

    (rt.Routes||[]).forEach(r=>{
      const tid=r.TransitGatewayId||r.VpcPeeringConnectionId;
      if(!tid||!shapeIds[tid]||!sharedGwPos[tid])return;
      const gc=gwColors2[gwSet2L.get(tid)?.type]||'#546E7A';
      const gwPos=sharedGwPos[tid];
      const totalLines=gwLineCount[tid]||1;

      rtSubnets.forEach(subId=>{
        const ek=subId+'|'+tid;
        if(subGwSeen.has(ek))return;
        subGwSeen.add(ek);
        
        const subPos=subnetPositions[subId];
        if(!subPos||!shapeIds[subId])return;
        
        // Get this line's index for this gateway
        if(gwLineIdx[tid]===undefined)gwLineIdx[tid]=0;
        const lineNum=gwLineIdx[tid]++;
        
        // Spread trunk lines across left margin of VPC
        const trunkX=subPos.vpcX-15-(subPos.subIndex%5)*4;
        
        // Spread bus Y levels
        const busYOff=globalLineIdx*2;
        
        // Spread connection points across gateway top (0.1 to 0.9)
        const spreadRatio=totalLines>1?lineNum/(totalLines-1):0.5;
        const gwConnectXRel=0.1+spreadRatio*0.8;
        
        // Get subnet and gateway names for line metadata
        const subObj=subnets.find(s=>s.SubnetId===subId);
        const subName=subObj?gn(subObj,subId):subId;
        const gwName=gwNames[tid]||sid(tid);
        
        lines.push({
          id:'ln_'+(lid++),lineType:'straight',
          stroke:{color:gc,width:1},
          endpoint1:{type:'shapeEndpoint',style:'none',shapeId:shapeIds[subId],position:{x:0,y:0.5}},
          endpoint2:{type:'shapeEndpoint',style:'arrow',shapeId:shapeIds[tid],position:{x:gwConnectXRel,y:0}},
          joints:[
            {x:trunkX,y:subPos.centerY},
            {x:trunkX,y:BUS_Y+busYOff},
            {x:gwPos.x+GW_W*gwConnectXRel,y:BUS_Y+busYOff}
          ],
          customData:[
            {key:'From Subnet',value:subName},
            {key:'Subnet ID',value:subId},
            {key:'To Gateway',value:gwName},
            {key:'Gateway ID',value:tid},
            {key:'Route Table',value:rt.RouteTableId||''}
          ]
        });
        globalLineIdx++;
      });
    });
  });

  // --- peering lines routed ABOVE VPCs ---
  const PEER_Y=VPC_TOP-30; // above all VPCs
  peerings.forEach((pcx,pi)=>{
    if(pcx.Status&&pcx.Status.Code!=='active')return;
    const rv=pcx.RequesterVpcInfo?.VpcId,av=pcx.AccepterVpcInfo?.VpcId;
    if(!shapeIds[rv]||!shapeIds[av])return;
    if(!vpcPositions[rv]||!vpcPositions[av])return;
    const vpcPosR=vpcPositions[rv];
    const vpcPosA=vpcPositions[av];
    
    // Get VPC names
    const vpcR=vpcs.find(v=>v.VpcId===rv);
    const vpcA=vpcs.find(v=>v.VpcId===av);
    const nameR=vpcR?gn(vpcR,rv):rv;
    const nameA=vpcA?gn(vpcA,av):av;
    
    // Get peering name
    const peerName=gn(pcx,pcx.VpcPeeringConnectionId)||pcx.VpcPeeringConnectionId;
    
    // Route via top edge of VPCs
    const exitXR=vpcPosR.x+vpcPosR.w*0.3+(pi%4)*20;
    const exitXA=vpcPosA.x+vpcPosA.w*0.7-(pi%4)*20;
    const peerYOff=pi*6;
    const midX=(exitXR+exitXA)/2;
    
    // Compute label dimensions first
    const maxPeerChars=35;
    const dispPeerName=peerName.length>maxPeerChars?peerName.substring(0,maxPeerChars-2)+'..':peerName;
    const labelW=Math.min(dispPeerName.length*9+32,320);
    const labelH=26;
    const labelX=midX-labelW/2;
    const labelY=PEER_Y-peerYOff-labelH/2;
    const labelPad=8;
    
    // Line segment 1: VPC R to label left edge
    lines.push({
      id:'pcx_L_'+(lid++),lineType:'straight',
      stroke:{color:COL.pcx,width:2,style:'dashed'},
      endpoint1:{type:'shapeEndpoint',style:'none',shapeId:shapeIds[rv],position:{x:0.3+(pi%4)*0.05,y:0}},
      endpoint2:{type:'positionEndpoint',style:'none',position:{x:labelX-labelPad,y:PEER_Y-peerYOff}},
      joints:[{x:exitXR,y:PEER_Y-peerYOff}],
      customData:[
        {key:'Peering ID',value:pcx.VpcPeeringConnectionId||''},
        {key:'Name',value:peerName},
        {key:'Requester VPC',value:nameR+' ('+rv+')'},
        {key:'Accepter VPC',value:nameA+' ('+av+')'},
        {key:'Status',value:pcx.Status?.Code||''}
      ]
    });
    
    // Line segment 2: label right edge to VPC A
    lines.push({
      id:'pcx_R_'+(lid++),lineType:'straight',
      stroke:{color:COL.pcx,width:2,style:'dashed'},
      endpoint1:{type:'positionEndpoint',style:'none',position:{x:labelX+labelW+labelPad,y:PEER_Y-peerYOff}},
      endpoint2:{type:'shapeEndpoint',style:'none',shapeId:shapeIds[av],position:{x:0.7-(pi%4)*0.05,y:0}},
      joints:[{x:exitXA,y:PEER_Y-peerYOff}]
    });
    
    // Label in the gap between line segments
    shapes.push({
      id:'pcxlbl_'+(lid++),type:'rectangle',
      boundingBox:{x:labelX,y:labelY,w:labelW,h:labelH},
      text:'<p style="font-size:10pt;color:'+COL.pcx+';text-align:center;font-weight:bold">'+dispPeerName+'</p>',
      style:{stroke:{color:COL.pcx,width:1.5},fill:{type:'color',color:'#FFFFFF'}}
    });
  });

  // --- Route 53 DNS Zones section ---
  if(zones.length>0){
    const pubZ=zones.filter(z=>!z.Config?.PrivateZone);
    const privZ=zones.filter(z=>z.Config?.PrivateZone);
    const dnsExp=(_detailLevel>=1);
    const dnsCols=dnsExp?1:2;
    const dnsColW=dnsExp?700:460;
    const dnsX=120;
    const dnsY=SHARED_ROW_Y+GW_H+80;
    const lzRecRowH=16,lzRecHdrH=18;

    const lzZoneHeights=[];
    zones.forEach(z=>{
      if(!dnsExp){lzZoneHeights.push(54);return}
      const isPub=!z.Config?.PrivateZone;
      const av=(!isPub&&z.VPCs)?z.VPCs.length:0;
      const zid=z.Id.replace('/hostedzone/','');
      const zR=recsByZone[zid]||[];
      let h=28;if(av)h+=lzRecRowH;
      if(zR.length>0)h+=lzRecHdrH+zR.length*lzRecRowH;
      lzZoneHeights.push(Math.max(54,h+12));
    });
    const lzZoneGap=8;
    let lzTotalZoneH=0;
    if(dnsExp){lzZoneHeights.forEach(h=>{lzTotalZoneH+=h+lzZoneGap})}
    else{lzTotalZoneH=Math.ceil(zones.length/dnsCols)*62}

    const dnsW=dnsCols*dnsColW+60;
    const dnsH=60+lzTotalZoneH+20;

    shapes.push({
      id:'dns_section',type:'rectangle',
      boundingBox:{x:dnsX,y:dnsY,w:dnsW,h:dnsH},
      text:NOTEXT,
      style:{stroke:{color:'#0ea5e9',width:2,style:'dashed'},fill:{type:'color',color:'#F0F9FF'}}
    });
    shapes.push({
      id:'dns_sec_title',type:'rectangle',
      boundingBox:{x:dnsX+10,y:dnsY+8,w:dnsW-20,h:30},
      text:'<p style="font-size:12pt;font-weight:bold;color:#0ea5e9;text-align:left">Route 53 Hosted Zones ('+pubZ.length+' public, '+privZ.length+' private)</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
    });

    let lzCurY=dnsY+48;
    zones.forEach((z,zi)=>{
      const isPub=!z.Config?.PrivateZone;
      const zid=z.Id.replace('/hostedzone/','');
      const assocVpcs=(!isPub&&z.VPCs)?z.VPCs.map(v=>{
        const vid=v.VPCId||v.VpcId;
        const vpc=vpcs.find(vp=>vp.VpcId===vid);
        return gn(vpc||{},vid);
      }).join(', '):'';
      const zh=lzZoneHeights[zi];
      const zRecs=recsByZone[zid]||[];

      if(dnsExp){
        const zx=dnsX+20;
        const zCol=isPub?'#10b981':'#0ea5e9';
        shapes.push({
          id:'gdns_'+zi,type:'rectangle',
          boundingBox:{x:zx,y:lzCurY,w:dnsColW-20,h:zh},
          text:NOTEXT,
          style:{stroke:{color:zCol,width:1.5},fill:{type:'color',color:isPub?'#F0FDF4':'#F0F9FF'}},
          customData:[
            {key:'Zone ID',value:zid},{key:'Name',value:z.Name},
            {key:'Type',value:isPub?'Public':'Private'},
            {key:'Records',value:String(z.ResourceRecordSetCount)},
            {key:'Associated VPCs',value:assocVpcs||'N/A'}
          ]
        });
        shapes.push({
          id:'gdnslbl_'+zi+'a',type:'rectangle',
          boundingBox:{x:zx+6,y:lzCurY+4,w:dnsColW-32,h:18},
          text:'<p style="font-size:10pt;font-weight:bold;color:'+zCol+';text-align:left">'+(isPub?'[Public]':'[Private]')+' '+z.Name+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
        let ly=lzCurY+22;
        shapes.push({
          id:'gdnslbl_'+zi+'b',type:'rectangle',
          boundingBox:{x:zx+6,y:ly,w:dnsColW-32,h:lzRecRowH},
          text:'<p style="font-size:8pt;color:#64748B;text-align:left">'+z.ResourceRecordSetCount+' records | Zone ID: '+zid+' | Type: '+(isPub?'Public':'Private')+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
        ly+=lzRecRowH;
        if(assocVpcs){
          shapes.push({
            id:'gdnslbl_'+zi+'d',type:'rectangle',
            boundingBox:{x:zx+6,y:ly,w:dnsColW-32,h:lzRecRowH},
            text:'<p style="font-size:8pt;color:#64748B;text-align:left">VPCs: '+assocVpcs+'</p>',
            style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
          });
          ly+=lzRecRowH;
        }
        if(zRecs.length>0){
          shapes.push({
            id:'gdnshdr_'+zi,type:'rectangle',
            boundingBox:{x:zx+6,y:ly,w:dnsColW-32,h:lzRecHdrH},
            text:'<p style="font-size:7pt;font-weight:bold;color:#475569;text-align:left">NAME                                                  TYPE      VALUE</p>',
            style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
          });
          ly+=lzRecHdrH;
          zRecs.forEach((rec,ri)=>{
            const rName=rec.Name||'';
            const rType=rec.Type||'';
            const rVal=rec.AliasTarget?'ALIAS → '+rec.AliasTarget.DNSName:
              (rec.ResourceRecords||[]).map(rr=>rr.Value).join(', ');
            const ttl=rec.TTL!=null?'  TTL:'+rec.TTL:'';
            shapes.push({
              id:'gdnsrec_'+zi+'_'+ri,type:'rectangle',
              boundingBox:{x:zx+6,y:ly,w:dnsColW-32,h:lzRecRowH},
              text:'<p style="font-size:7pt;color:#334155;text-align:left;font-family:monospace">'+rName+' &nbsp; '+rType+' &nbsp; '+rVal+ttl+'</p>',
              style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
            });
            ly+=lzRecRowH;
          });
        }
        lzCurY+=zh+lzZoneGap;
      }else{
        const col=zi%dnsCols;
        const row=Math.floor(zi/dnsCols);
        const zx=dnsX+20+col*dnsColW;
        const zy=dnsY+48+row*62;
        shapes.push({
          id:'gdns_'+zi,type:'rectangle',
          boundingBox:{x:zx,y:zy,w:dnsColW-20,h:54},
          text:NOTEXT,
          style:{stroke:{color:isPub?'#10b981':'#0ea5e9',width:1.5},fill:{type:'color',color:isPub?'#F0FDF4':'#F0F9FF'}},
          customData:[
            {key:'Zone ID',value:zid},{key:'Name',value:z.Name},
            {key:'Type',value:isPub?'Public':'Private'},
            {key:'Records',value:String(z.ResourceRecordSetCount)},
            {key:'Associated VPCs',value:assocVpcs||'N/A'}
          ]
        });
        shapes.push({
          id:'gdnslbl_'+zi+'a',type:'rectangle',
          boundingBox:{x:zx+6,y:zy+4,w:dnsColW-32,h:22},
          text:'<p style="font-size:9pt;font-weight:bold;color:'+(isPub?'#10b981':'#0ea5e9')+';text-align:left">'+(isPub?'[Public]':'[Private]')+' '+z.Name+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
        shapes.push({
          id:'gdnslbl_'+zi+'b',type:'rectangle',
          boundingBox:{x:zx+6,y:zy+28,w:dnsColW-32,h:20},
          text:'<p style="font-size:8pt;color:#64748B;text-align:left">'+z.ResourceRecordSetCount+' records | '+zid+(assocVpcs?' | VPCs: '+assocVpcs:'')+'</p>',
          style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
        });
      }
    });
  }

  // --- S3 Buckets section ---
  if(s3bk.length>0){
    const s3Cols=3;
    const s3ColW=360;
    const s3W=s3Cols*s3ColW+60;
    const s3RowH=36;
    const s3Rows=Math.ceil(s3bk.length/s3Cols);
    const s3H=50+s3Rows*s3RowH+20;
    const s3X=120;
    const dnsExists=zones.length>0;
    const _lzDnsH=(function(){
      if(!dnsExists)return 0;
      const dExp=(_detailLevel>=1);const c=dExp?1:2;
      if(dExp){let th=0;zones.forEach(z=>{const ip=!z.Config?.PrivateZone;const av=(!ip&&z.VPCs)?z.VPCs.length:0;const zid=z.Id.replace('/hostedzone/','');const zR=recsByZone[zid]||[];let h=28;if(av)h+=16;if(zR.length>0)h+=18+zR.length*16;th+=Math.max(54,h+12)+8});return 60+th+20}
      return 60+Math.ceil(zones.length/c)*62+20;
    })();
    const s3Y=dnsExists?(SHARED_ROW_Y+GW_H+80+_lzDnsH+40):(SHARED_ROW_Y+GW_H+80);

    shapes.push({
      id:'s3_section',type:'rectangle',
      boundingBox:{x:s3X,y:s3Y,w:s3W,h:s3H},
      text:NOTEXT,
      style:{stroke:{color:'#EA580C',width:2,style:'dashed'},fill:{type:'color',color:'#FFF7ED'}}
    });
    shapes.push({
      id:'s3_sec_title',type:'rectangle',
      boundingBox:{x:s3X+10,y:s3Y+8,w:s3W-20,h:30},
      text:'<p style="font-size:12pt;font-weight:bold;color:#EA580C;text-align:left">S3 Buckets ('+s3bk.length+')</p>',
      style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
    });
    
    s3bk.forEach((bk,bi)=>{
      const col=bi%s3Cols;
      const row=Math.floor(bi/s3Cols);
      const bx=s3X+20+col*s3ColW;
      const by=s3Y+48+row*s3RowH;
      
      shapes.push({
        id:'gs3_'+bi,type:'rectangle',
        boundingBox:{x:bx,y:by,w:s3ColW-20,h:28},
        text:NOTEXT,
        style:{stroke:{color:'#EA580C',width:1},fill:{type:'color',color:'#FFFFFF'}},
        customData:[
          {key:'Bucket Name',value:bk.Name},
          {key:'Created',value:(bk.CreationDate||'N/A').split('T')[0]}
        ]
      });
      shapes.push({
        id:'gs3lbl_'+bi,type:'rectangle',
        boundingBox:{x:bx+4,y:by+2,w:s3ColW-28,h:24},
        text:'<p style="font-size:8pt;color:#232F3E;text-align:left">'+bk.Name+'</p>',
        style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF00'}}
      });
    });
  }

  // --- LEGEND ---
  const legendX=vpcX+40;
  const legendY=VPC_TOP+20;
  const LEGEND_W=220,LEGEND_H=100;
  shapes.push({
    id:'legend_box',type:'rectangle',
    boundingBox:{x:legendX,y:legendY,w:LEGEND_W,h:LEGEND_H},
    text:NOTEXT,
    style:{stroke:{color:'#546E7A',width:1},fill:{type:'color',color:'#FFFFFF'}}
  });
  shapes.push({
    id:'legend_title',type:'rectangle',
    boundingBox:{x:legendX+8,y:legendY+8,w:LEGEND_W-16,h:20},
    text:'<p style="font-size:11pt;font-weight:bold;color:#232F3E;text-align:left">Legend</p>',
    style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
  });
  // TGW line sample (solid)
  lines.push({
    id:'legend_tgw_line',lineType:'straight',
    stroke:{color:COL.tgw,width:2},
    endpoint1:{type:'positionEndpoint',style:'none',position:{x:legendX+12,y:legendY+45}},
    endpoint2:{type:'positionEndpoint',style:'arrow',position:{x:legendX+55,y:legendY+45}}
  });
  shapes.push({
    id:'legend_tgw_label',type:'rectangle',
    boundingBox:{x:legendX+62,y:legendY+36,w:150,h:20},
    text:'<p style="font-size:9pt;color:#232F3E;text-align:left">Transit Gateway</p>',
    style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
  });
  // PCX line sample (dashed)
  lines.push({
    id:'legend_pcx_line',lineType:'straight',
    stroke:{color:COL.pcx,width:2,style:'dashed'},
    endpoint1:{type:'positionEndpoint',style:'none',position:{x:legendX+12,y:legendY+75}},
    endpoint2:{type:'positionEndpoint',style:'none',position:{x:legendX+55,y:legendY+75}}
  });
  shapes.push({
    id:'legend_pcx_label',type:'rectangle',
    boundingBox:{x:legendX+62,y:legendY+66,w:150,h:20},
    text:'<p style="font-size:9pt;color:#232F3E;text-align:left">VPC Peering</p>',
    style:{stroke:{color:'#FFFFFF',width:0},fill:{type:'color',color:'#FFFFFF'}}
  });

  const doc={version:1,pages:[{id:'page1',title:'AWS-Network-Map',shapes,lines}]};
  return{doc,iconSet};
}

// generate .lucid ZIP blob
async function buildLucidZip(){
  const result=buildLucidExport();
  if(!result)return null;
  const{doc,iconSet}=result;
  if(typeof JSZip==='undefined'){_showToast('JSZip not loaded');return null}
  const zip=new JSZip();
  zip.file('document.json',JSON.stringify(doc));
  const imgFolder=zip.folder('images');
  for(const type of iconSet){
    const key=ICON_MAP[type]||type.toLowerCase();
    const dataUri=AWS_ICONS[key];
    if(!dataUri)continue;
    const b64=dataUri.split(',')[1];
    const bin=atob(b64);
    const arr=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
    imgFolder.file(key+'.png',arr);
  }
  return zip.generateAsync({type:'blob'});
}
export { buildLucidZip, buildLucidExport, AWS_ICONS, ICON_MAP };
