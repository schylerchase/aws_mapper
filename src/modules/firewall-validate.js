// Pure firewall-rule validators + rule comparison, extracted verbatim from
// app-core.js (the live firewall editor). No DOM, no app-core globals — only
// the passed arguments. The editor UI stays in app-core and calls these via
// window. Pinned by tests/unit/firewall-validate.test.mjs.

export function _fwRuleMatch(a, b){
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

export function _fwValidateCidr(cidr){
  if(!cidr||typeof cidr!=='string') return false;
  if(!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(cidr)) return false;
  const parts=cidr.split('/');
  const octets=parts[0].split('.');
  for(let i=0;i<4;i++){if(parseInt(octets[i],10)>255) return false}
  if(parseInt(parts[1],10)>32) return false;
  return true;
}

export function _fwValidateNaclRule(rule, existingEntries, direction){
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

export function _fwValidateSgRule(rule){
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

export function _fwValidateRoute(route, existingRoutes){
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
