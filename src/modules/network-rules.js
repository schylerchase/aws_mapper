// Pure network rule evaluation functions
// Zero DOM dependency — suitable for unit testing
// Extracted from flow-analyzer.js

export function ipToNum(ip) {
  if (typeof ip !== 'string') {
    return null;
  }
  const p = ip.trim().split('.');
  if (p.length !== 4) {
    return null;
  }
  const octets = p.map(function (part) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const n = Number(part);
    return n >= 0 && n <= 255 ? n : null;
  });
  if (
    octets.some(function (n) {
      return n === null;
    })
  ) {
    return null;
  }
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

export function ipFromCidr(cidr) {
  if (!cidr) {
    return null;
  }
  return cidr.split('/')[0];
}

export function cidrContains(cidr, ip) {
  if (!cidr || !ip) {
    return false;
  }
  if (cidr === '0.0.0.0/0') {
    return true;
  }
  const parts = cidr.split('/');
  if (parts.length !== 2) {
    return false;
  }
  if (!/^\d{1,2}$/.test(parts[1])) {
    return false;
  }
  const mask = Number(parts[1]);
  if (mask < 0 || mask > 32) {
    return false;
  }
  const cidrNum = ipToNum(parts[0]);
  const ipNum = ipToNum(ip);
  if (cidrNum === null || ipNum === null) {
    return false;
  }
  if (mask === 0) {
    return true;
  }
  const shift = 32 - mask;
  return cidrNum >>> shift === ipNum >>> shift;
}

export function protoMatch(ruleProto, queryProto) {
  if (ruleProto === '-1' || ruleProto === 'all') {
    return true;
  }
  const rp = String(ruleProto).toLowerCase();
  const qp = String(queryProto).toLowerCase();
  if (rp === qp) {
    return true;
  }
  if (rp === '6' && qp === 'tcp') {
    return true;
  }
  if (rp === '17' && qp === 'udp') {
    return true;
  }
  if (rp === '1' && qp === 'icmp') {
    return true;
  }
  if (qp === '6' && rp === 'tcp') {
    return true;
  }
  if (qp === '17' && rp === 'udp') {
    return true;
  }
  return false;
}

export function portInRange(port, from, to) {
  if (from === undefined && to === undefined) {
    return true;
  }
  if (from === 0 && to === 65535) {
    return true;
  }
  if (from === -1 && to === -1) {
    return true;
  }
  const p = parseInt(port, 10);
  return p >= parseInt(from, 10) && p <= parseInt(to, 10);
}

export function protoName(p) {
  if (p === '-1' || p === 'all') {
    return 'ALL';
  }
  if (p === '6') {
    return 'TCP';
  }
  if (p === '17') {
    return 'UDP';
  }
  if (p === '1') {
    return 'ICMP';
  }
  return String(p).toUpperCase();
}

export function evaluateRouteTable(rt, destCidr) {
  if (!rt || !rt.Routes) {
    return { target: 'local', type: 'local' };
  }
  const dest = ipFromCidr(destCidr) || destCidr;
  let bestMatch = null;
  let bestMask = -1;
  rt.Routes.forEach(function (r) {
    const rCidr = r.DestinationCidrBlock || r.DestinationIpv6CidrBlock;
    if (!rCidr) {
      return;
    }
    const mask = parseInt(rCidr.split('/')[1], 10) || 0;
    if (cidrContains(rCidr, dest) && mask > bestMask) {
      bestMask = mask;
      bestMatch = r;
    }
  });
  if (!bestMatch) {
    return { target: 'blackhole', type: 'blackhole', detail: 'No matching route' };
  }
  if (bestMatch.State === 'blackhole') {
    return { target: 'blackhole', type: 'blackhole', detail: 'Route is blackholed' };
  }
  if (bestMatch.GatewayId && bestMatch.GatewayId.startsWith('igw-')) {
    return { target: bestMatch.GatewayId, type: 'igw' };
  }
  if (bestMatch.NatGatewayId) {
    return { target: bestMatch.NatGatewayId, type: 'nat' };
  }
  if (bestMatch.VpcPeeringConnectionId) {
    return { target: bestMatch.VpcPeeringConnectionId, type: 'pcx' };
  }
  if (bestMatch.TransitGatewayId) {
    return { target: bestMatch.TransitGatewayId, type: 'tgw' };
  }
  if (bestMatch.GatewayId === 'local') {
    return { target: 'local', type: 'local' };
  }
  if (bestMatch.VpcEndpointId) {
    return { target: bestMatch.VpcEndpointId, type: 'vpce' };
  }
  if (bestMatch.GatewayId && bestMatch.GatewayId.startsWith('vgw-')) {
    return { target: bestMatch.GatewayId, type: 'vgw' };
  }
  return { target: 'local', type: 'local' };
}

export function evaluateNACL(nacl, direction, protocol, port, sourceCidr, opts) {
  if (!nacl || !nacl.Entries) {
    return { action: 'allow', rule: 'Default allow (no NACL)', ruleNum: '-' };
  }
  const entries = (nacl.Entries || [])
    .filter(function (e) {
      return e.Egress === (direction === 'outbound');
    })
    .sort(function (a, b) {
      return a.RuleNumber - b.RuleNumber;
    });
  if (entries.length === 0 && opts && opts.assumeAllow) {
    return {
      action: 'allow',
      rule: 'No ' + direction + ' rules defined (assumed allow)',
      ruleNum: '-'
    };
  }
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.RuleNumber === 32767) {
      continue;
    }
    if (!protoMatch(e.Protocol, protocol)) {
      continue;
    }
    let portOk = true;
    if (e.PortRange) {
      portOk = portInRange(port, e.PortRange.From, e.PortRange.To);
    }
    if (!portOk) {
      continue;
    }
    let cidrOk = false;
    if (e.CidrBlock) {
      cidrOk = cidrContains(e.CidrBlock, ipFromCidr(sourceCidr));
    }
    if (!cidrOk && e.Ipv6CidrBlock) {
      if (e.Ipv6CidrBlock === '::/0') {
        cidrOk = true;
      } else {
        continue;
      }
    }
    if (!cidrOk) {
      continue;
    }
    const act = e.RuleAction === 'allow' ? 'allow' : 'deny';
    const cidrLabel = e.CidrBlock || e.Ipv6CidrBlock || '';
    return {
      action: act,
      rule:
        'Rule #' +
        e.RuleNumber +
        ' ' +
        act.toUpperCase() +
        ' ' +
        protoName(e.Protocol) +
        ' port ' +
        (e.PortRange ? e.PortRange.From + '-' + e.PortRange.To : 'all') +
        ' from ' +
        cidrLabel,
      ruleNum: e.RuleNumber
    };
  }
  return { action: 'deny', rule: 'Default deny (no matching rule)', ruleNum: '*' };
}

export function evaluateSG(sgs, direction, protocol, port, sourceCidr, opts) {
  if (!sgs || sgs.length === 0) {
    return {
      action: opts && opts.assumeAllow ? 'allow' : 'deny',
      rule: 'No security groups attached',
      matchedSg: null
    };
  }
  const srcIp = ipFromCidr(sourceCidr);
  const srcSgIds = opts && opts.sourceSgIds;
  const srcSgSet = srcSgIds ? new Set(srcSgIds) : null;
  for (let si = 0; si < sgs.length; si++) {
    const sg = sgs[si];
    const rules = direction === 'inbound' ? sg.IpPermissions || [] : sg.IpPermissionsEgress || [];
    for (let ri = 0; ri < rules.length; ri++) {
      const r = rules[ri];
      if (!protoMatch(String(r.IpProtocol), protocol)) {
        continue;
      }
      let portOk = true;
      if (r.FromPort !== undefined && r.FromPort !== -1) {
        portOk = portInRange(port, r.FromPort, r.ToPort);
      }
      if (!portOk) {
        continue;
      }
      let cidrOk = false;
      const ipRanges = r.IpRanges || [];
      for (let ci = 0; ci < ipRanges.length && !cidrOk; ci++) {
        if (cidrContains(ipRanges[ci].CidrIp, srcIp)) {
          cidrOk = true;
        }
      }
      if (!cidrOk) {
        const ipv6Ranges = r.Ipv6Ranges || [];
        for (let v6i = 0; v6i < ipv6Ranges.length && !cidrOk; v6i++) {
          if (ipv6Ranges[v6i].CidrIpv6 === '::/0') {
            cidrOk = true;
          }
        }
      }
      if (!cidrOk && (r.UserIdGroupPairs || []).length > 0) {
        const pairs = r.UserIdGroupPairs || [];
        for (let pi = 0; pi < pairs.length && !cidrOk; pi++) {
          if (srcSgSet) {
            if (pairs[pi].GroupId && srcSgSet.has(pairs[pi].GroupId)) {
              cidrOk = true;
            }
          } else {
            if (pairs[pi].GroupId) {
              cidrOk = true;
            }
          }
        }
      }
      if (cidrOk) {
        const desc =
          sg.GroupName +
          ': ' +
          protoName(String(r.IpProtocol)) +
          ' port ' +
          (r.FromPort !== -1 && r.FromPort !== undefined ? r.FromPort + '-' + r.ToPort : 'all');
        return { action: 'allow', rule: desc, matchedSg: sg.GroupId || sg.GroupName };
      }
    }
  }
  return {
    action: 'deny',
    rule: 'No matching SG rule for ' + protocol + '/' + port,
    matchedSg: null
  };
}
