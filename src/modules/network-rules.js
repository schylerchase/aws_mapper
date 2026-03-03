// Pure network rule evaluation functions
// Zero DOM dependency — suitable for unit testing
// Extracted from flow-analyzer.js

export function ipToNum(ip) {
  if (!ip) return null;
  const p = ip.split('.');
  if (p.length !== 4) return null;
  return ((parseInt(p[0]) << 24) | (parseInt(p[1]) << 16) | (parseInt(p[2]) << 8) | parseInt(p[3])) >>> 0;
}

export function ipFromCidr(cidr) {
  if (!cidr) return null;
  return cidr.split('/')[0];
}

export function cidrContains(cidr, ip) {
  if (!cidr || !ip) return false;
  if (cidr === '0.0.0.0/0') return true;
  const parts = cidr.split('/');
  if (parts.length !== 2) return false;
  const mask = parseInt(parts[1], 10);
  const cidrNum = ipToNum(parts[0]);
  const ipNum = ipToNum(ip);
  if (cidrNum === null || ipNum === null) return false;
  const shift = 32 - mask;
  return (cidrNum >>> shift) === (ipNum >>> shift);
}

export function protoMatch(ruleProto, queryProto) {
  if (ruleProto === '-1' || ruleProto === 'all') return true;
  const rp = String(ruleProto).toLowerCase();
  const qp = String(queryProto).toLowerCase();
  if (rp === qp) return true;
  if (rp === '6' && qp === 'tcp') return true;
  if (rp === '17' && qp === 'udp') return true;
  if (rp === '1' && qp === 'icmp') return true;
  if (qp === '6' && rp === 'tcp') return true;
  if (qp === '17' && rp === 'udp') return true;
  return false;
}

export function portInRange(port, from, to) {
  if (from === undefined && to === undefined) return true;
  if (from === 0 && to === 65535) return true;
  if (from === -1 && to === -1) return true;
  const p = parseInt(port, 10);
  return p >= parseInt(from, 10) && p <= parseInt(to, 10);
}

export function protoName(p) {
  if (p === '-1' || p === 'all') return 'ALL';
  if (p === '6') return 'TCP';
  if (p === '17') return 'UDP';
  if (p === '1') return 'ICMP';
  return String(p).toUpperCase();
}

export function evaluateRouteTable(rt, destCidr) {
  if (!rt || !rt.Routes) return { target: 'local', type: 'local' };
  const dest = ipFromCidr(destCidr) || destCidr;
  let bestMatch = null;
  let bestMask = -1;
  rt.Routes.forEach(function (r) {
    const rCidr = r.DestinationCidrBlock || r.DestinationIpv6CidrBlock;
    if (!rCidr) return;
    const mask = parseInt(rCidr.split('/')[1], 10) || 0;
    if (cidrContains(rCidr, dest) && mask > bestMask) {
      bestMask = mask;
      bestMatch = r;
    }
  });
  if (!bestMatch) return { target: 'blackhole', type: 'blackhole', detail: 'No matching route' };
  if (bestMatch.State === 'blackhole') return { target: 'blackhole', type: 'blackhole', detail: 'Route is blackholed' };
  if (bestMatch.GatewayId && bestMatch.GatewayId.startsWith('igw-')) return { target: bestMatch.GatewayId, type: 'igw' };
  if (bestMatch.NatGatewayId) return { target: bestMatch.NatGatewayId, type: 'nat' };
  if (bestMatch.VpcPeeringConnectionId) return { target: bestMatch.VpcPeeringConnectionId, type: 'pcx' };
  if (bestMatch.TransitGatewayId) return { target: bestMatch.TransitGatewayId, type: 'tgw' };
  if (bestMatch.GatewayId === 'local') return { target: 'local', type: 'local' };
  if (bestMatch.VpcEndpointId) return { target: bestMatch.VpcEndpointId, type: 'vpce' };
  if (bestMatch.GatewayId && bestMatch.GatewayId.startsWith('vgw-')) return { target: bestMatch.GatewayId, type: 'vgw' };
  return { target: 'local', type: 'local' };
}

export function evaluateNACL(nacl, direction, protocol, port, sourceCidr, opts) {
  if (!nacl || !nacl.Entries) return { action: 'allow', rule: 'Default allow (no NACL)', ruleNum: '-' };
  const entries = (nacl.Entries || [])
    .filter(function (e) { return e.Egress === (direction === 'outbound'); })
    .sort(function (a, b) { return a.RuleNumber - b.RuleNumber; });
  if (entries.length === 0 && opts && opts.assumeAllow) return { action: 'allow', rule: 'No ' + direction + ' rules defined (assumed allow)', ruleNum: '-' };
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (e.RuleNumber === 32767) continue;
    if (!protoMatch(e.Protocol, protocol)) continue;
    var portOk = true;
    if (e.PortRange) {
      portOk = portInRange(port, e.PortRange.From, e.PortRange.To);
    }
    if (!portOk) continue;
    var cidrOk = false;
    if (e.CidrBlock) cidrOk = cidrContains(e.CidrBlock, ipFromCidr(sourceCidr));
    if (!cidrOk && e.Ipv6CidrBlock) {
      if (e.Ipv6CidrBlock === '::/0') cidrOk = true;
      else continue;
    }
    if (!cidrOk) continue;
    var act = e.RuleAction === 'allow' ? 'allow' : 'deny';
    var cidrLabel = e.CidrBlock || e.Ipv6CidrBlock || '';
    return { action: act, rule: 'Rule #' + e.RuleNumber + ' ' + act.toUpperCase() + ' ' + protoName(e.Protocol) + ' port ' + (e.PortRange ? e.PortRange.From + '-' + e.PortRange.To : 'all') + ' from ' + cidrLabel, ruleNum: e.RuleNumber };
  }
  return { action: 'deny', rule: 'Default deny (no matching rule)', ruleNum: '*' };
}

export function evaluateSG(sgs, direction, protocol, port, sourceCidr, opts) {
  if (!sgs || sgs.length === 0) return { action: (opts && opts.assumeAllow) ? 'allow' : 'deny', rule: 'No security groups attached', matchedSg: null };
  for (var si = 0; si < sgs.length; si++) {
    var sg = sgs[si];
    var rules = direction === 'inbound' ? (sg.IpPermissions || []) : (sg.IpPermissionsEgress || []);
    for (var ri = 0; ri < rules.length; ri++) {
      var r = rules[ri];
      if (!protoMatch(String(r.IpProtocol), protocol)) continue;
      var portOk = true;
      if (r.FromPort !== undefined && r.FromPort !== -1) {
        portOk = portInRange(port, r.FromPort, r.ToPort);
      }
      if (!portOk) continue;
      var cidrOk = false;
      (r.IpRanges || []).forEach(function (ipr) {
        if (cidrContains(ipr.CidrIp, ipFromCidr(sourceCidr))) cidrOk = true;
      });
      (r.Ipv6Ranges || []).forEach(function (ipr) {
        if (ipr.CidrIpv6 === '::/0') cidrOk = true;
      });
      if (!cidrOk && (r.UserIdGroupPairs || []).length > 0) {
        var srcSgIds = opts && opts.sourceSgIds;
        if (srcSgIds) { (r.UserIdGroupPairs || []).forEach(function (gp) { if (gp.GroupId && srcSgIds.indexOf(gp.GroupId) !== -1) cidrOk = true; }); }
        else { (r.UserIdGroupPairs || []).forEach(function (gp) { if (gp.GroupId) cidrOk = true; }); }
      }
      if (cidrOk) {
        var desc = sg.GroupName + ': ' + protoName(String(r.IpProtocol)) + ' port ' + (r.FromPort !== -1 && r.FromPort !== undefined ? r.FromPort + '-' + r.ToPort : 'all');
        return { action: 'allow', rule: desc, matchedSg: sg.GroupId || sg.GroupName };
      }
    }
  }
  return { action: 'deny', rule: 'No matching SG rule for ' + protocol + '/' + port, matchedSg: null };
}
