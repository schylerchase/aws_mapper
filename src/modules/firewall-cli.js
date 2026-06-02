// Firewall-edit AWS CLI generators, extracted (logic-identical) from app-core.js.
// `genFirewallCli(edits)` orchestrates per-edit NACL/SG/route command builders.
// No DOM, no app-core globals (the _fwEdits fallback lives in the app-core
// wrapper). NOTE: _fwSgRuleCmd keeps the existing single-CIDR behavior (audit
// finding H002 — pin now, fix in a later defect slice). Pinned by
// tests/unit/firewall-cli.test.mjs.

export function genFirewallCli(edits){
  const list=edits||[];
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
