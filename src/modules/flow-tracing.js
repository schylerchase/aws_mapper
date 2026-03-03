// Flow Tracing — pure logic extracted from index.html FLOW TRACING region
// Zero SVG/DOM rendering — all render functions stay inline
// Imports network evaluation from the already-extracted network-rules module

import {
  evaluateRouteTable,
  evaluateNACL,
  evaluateSG,
  ipFromCidr,
  cidrContains,
} from './network-rules.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let _flowMode = false;
let _flowSource = null;
let _flowTarget = null;
let _flowConfig = { protocol: 'tcp', port: 443 };
let _flowPath = null;
let _flowBlocked = null;
let _flowStepIndex = -1;
let _flowSelecting = null;

// Multi-hop waypoint state
let _flowWaypoints = [];        // [{ref:{type,id}, config:{protocol,port}}]
let _flowLegs = [];             // [{source,target,config,result:{path,blocked}}]
let _flowActiveLeg = -1;        // which leg is expanded in detail, -1 = all
let _flowSelectingWaypoint = -1;
let _flowSuggestions = [];      // [{via:{type,id,name}, leg1Result, leg2Result, leg1Config}]

// ---------------------------------------------------------------------------
// State getters / setters
// ---------------------------------------------------------------------------
export function getFlowMode() { return _flowMode; }
export function setFlowMode(v) { _flowMode = v; }

export function getFlowSource() { return _flowSource; }
export function setFlowSource(v) { _flowSource = v; }

export function getFlowTarget() { return _flowTarget; }
export function setFlowTarget(v) { _flowTarget = v; }

export function getFlowConfig() { return _flowConfig; }
export function setFlowConfig(v) { _flowConfig = v; }

export function getFlowPath() { return _flowPath; }
export function setFlowPath(v) { _flowPath = v; }

export function getFlowBlocked() { return _flowBlocked; }
export function setFlowBlocked(v) { _flowBlocked = v; }

export function getFlowStepIndex() { return _flowStepIndex; }
export function setFlowStepIndex(v) { _flowStepIndex = v; }

export function getFlowSelecting() { return _flowSelecting; }
export function setFlowSelecting(v) { _flowSelecting = v; }

export function getFlowWaypoints() { return _flowWaypoints; }
export function setFlowWaypoints(v) { _flowWaypoints = v; }

export function getFlowLegs() { return _flowLegs; }
export function setFlowLegs(v) { _flowLegs = v; }

export function getFlowActiveLeg() { return _flowActiveLeg; }
export function setFlowActiveLeg(v) { _flowActiveLeg = v; }

export function getFlowSelectingWaypoint() { return _flowSelectingWaypoint; }
export function setFlowSelectingWaypoint(v) { _flowSelectingWaypoint = v; }

export function getFlowSuggestions() { return _flowSuggestions; }
export function setFlowSuggestions(v) { _flowSuggestions = v; }

/** Reset all flow state to initial values. */
export function resetFlowState() {
  _flowMode = false;
  _flowSource = null;
  _flowTarget = null;
  _flowConfig = { protocol: 'tcp', port: 443 };
  _flowPath = null;
  _flowBlocked = null;
  _flowStepIndex = -1;
  _flowSelecting = null;
  _flowWaypoints = [];
  _flowLegs = [];
  _flowActiveLeg = -1;
  _flowSelectingWaypoint = -1;
  _flowSuggestions = [];
}

// ---------------------------------------------------------------------------
// suggestPort — map resource type to a sensible default port
// ---------------------------------------------------------------------------
export function suggestPort(targetType, targetResource) {
  if (targetType === 'rds') return (targetResource && targetResource.Endpoint && targetResource.Endpoint.Port) || 3306;
  if (targetType === 'ecache') return 6379;
  if (targetType === 'alb') return 443;
  if (targetType === 'instance') return 22;
  if (targetType === 'lambda') return 443;
  if (targetType === 'ecs') return 443;
  return 443;
}

// ---------------------------------------------------------------------------
// hopTypeLabel — human-readable labels for hop types
// ---------------------------------------------------------------------------
const HOP_TYPE_LABELS = {
  'source': 'Source',
  'target': 'Target',
  'route-table': 'Route Table',
  'nacl-outbound': 'NACL Outbound',
  'nacl-inbound': 'NACL Inbound',
  'sg-outbound': 'SG Outbound',
  'sg-inbound': 'SG Inbound',
  'peering': 'VPC Peering',
  'tgw': 'Transit Gateway',
  'cross-vpc': 'Cross-VPC',
  'error': 'Error',
  'igw-check': 'IGW Check',
};

export function hopTypeLabel(type) {
  return HOP_TYPE_LABELS[type] || type;
}

// ---------------------------------------------------------------------------
// resolveNetworkPosition — map a resource reference to its network position
// Returns {subnetId, vpcId, cidr, sgs, name, ip?} or null
// ---------------------------------------------------------------------------
export function resolveNetworkPosition(type, id, ctx) {
  if (!ctx) return null;

  if (type === 'internet') {
    return { subnetId: null, vpcId: null, cidr: '0.0.0.0/0', sgs: [], name: 'Internet', ip: '0.0.0.0' };
  }

  if (type === 'subnet') {
    var sub = (ctx.subnets || []).find(function (s) { return s.SubnetId === id; });
    if (!sub) return null;
    return {
      subnetId: sub.SubnetId,
      vpcId: sub.VpcId,
      cidr: sub.CidrBlock,
      sgs: [],
      name: sub.Tags ? ((sub.Tags.find(function (t) { return t.Key === 'Name'; }) || {}).Value || sub.SubnetId) : sub.SubnetId,
    };
  }

  if (type === 'instance') {
    var inst = null;
    Object.keys(ctx.instBySub || {}).forEach(function (sid) {
      (ctx.instBySub[sid] || []).forEach(function (i) {
        if (i.InstanceId === id) inst = i;
      });
    });
    if (!inst) return null;
    var iSgs = (inst.SecurityGroups || []).map(function (s) { return s.GroupId; });
    var fullSgs = iSgs.map(function (gid) { return (ctx.sgs || []).find(function (s) { return s.GroupId === gid; }); }).filter(Boolean);
    return {
      subnetId: inst.SubnetId,
      vpcId: inst.VpcId || ((ctx.subnets || []).find(function (s) { return s.SubnetId === inst.SubnetId; }) || {}).VpcId,
      cidr: inst.PrivateIpAddress ? inst.PrivateIpAddress + '/32' : null,
      sgs: fullSgs,
      name: inst.Tags ? ((inst.Tags.find(function (t) { return t.Key === 'Name'; }) || {}).Value || inst.InstanceId) : inst.InstanceId,
      ip: inst.PrivateIpAddress,
    };
  }

  if (type === 'rds') {
    var rds2 = null; var rSid = null;
    Object.keys(ctx.rdsBySub || {}).forEach(function (sid) {
      (ctx.rdsBySub[sid] || []).forEach(function (d) {
        if (d.DBInstanceIdentifier === id) { rds2 = d; rSid = sid; }
      });
    });
    if (!rds2) return null;
    var rVpc = ((ctx.subnets || []).find(function (s) { return s.SubnetId === rSid; }) || {}).VpcId;
    var rSgs2 = (rds2.VpcSecurityGroups || []).map(function (s) {
      return (ctx.sgs || []).find(function (sg) { return sg.GroupId === s.VpcSecurityGroupId; });
    }).filter(Boolean);
    var rSubCidr = rSid ? ((ctx.subnets || []).find(function (s) { return s.SubnetId === rSid; }) || {}).CidrBlock : null;
    return { subnetId: rSid, vpcId: rVpc, cidr: rSubCidr, sgs: rSgs2, name: rds2.DBInstanceIdentifier };
  }

  if (type === 'alb') {
    var alb2 = null; var aSid = null;
    Object.keys(ctx.albBySub || {}).forEach(function (sid) {
      (ctx.albBySub[sid] || []).forEach(function (a) {
        var aid = a.LoadBalancerArn ? a.LoadBalancerArn.split('/').pop() : '';
        if (aid === id || a.LoadBalancerName === id) { alb2 = a; aSid = sid; }
      });
    });
    if (!alb2) return null;
    var aVpc = ((ctx.subnets || []).find(function (s) { return s.SubnetId === aSid; }) || {}).VpcId;
    var aSgs = (alb2.SecurityGroups || []).map(function (gid) {
      return (ctx.sgs || []).find(function (sg) { return sg.GroupId === gid; });
    }).filter(Boolean);
    return { subnetId: aSid, vpcId: aVpc, cidr: null, sgs: aSgs, name: alb2.LoadBalancerName || id };
  }

  if (type === 'lambda') {
    var fn2 = null; var fSid = null;
    Object.keys(ctx.lambdaBySub || {}).forEach(function (sid) {
      (ctx.lambdaBySub[sid] || []).forEach(function (f) {
        if (f.FunctionName === id) { fn2 = f; fSid = sid; }
      });
    });
    if (!fn2) return null;
    var fVpc = ((ctx.subnets || []).find(function (s) { return s.SubnetId === fSid; }) || {}).VpcId;
    var fSgs2 = ((fn2.VpcConfig || {}).SecurityGroupIds || []).map(function (gid) {
      return (ctx.sgs || []).find(function (sg) { return sg.GroupId === gid; });
    }).filter(Boolean);
    return { subnetId: fSid, vpcId: fVpc, cidr: null, sgs: fSgs2, name: fn2.FunctionName };
  }

  if (type === 'ecs') {
    var ecs2 = null; var eSid = null;
    Object.keys(ctx.ecsBySub || {}).forEach(function (sid) {
      (ctx.ecsBySub[sid] || []).forEach(function (s) {
        if (s.serviceName === id) { ecs2 = s; eSid = sid; }
      });
    });
    if (!ecs2) return null;
    var eVpc = ((ctx.subnets || []).find(function (s) { return s.SubnetId === eSid; }) || {}).VpcId;
    var eNc = (ecs2.networkConfiguration || {}).awsvpcConfiguration || {};
    var eSgs2 = (eNc.securityGroups || []).map(function (gid) {
      return (ctx.sgs || []).find(function (sg) { return sg.GroupId === gid; });
    }).filter(Boolean);
    return { subnetId: eSid, vpcId: eVpc, cidr: null, sgs: eSgs2, name: ecs2.serviceName || id };
  }

  if (type === 'ecache') {
    var ec2 = null; var ecVpc = null;
    (ctx.ecacheClusters || []).forEach(function (c) { if (c.CacheClusterId === id) ec2 = c; });
    if (!ec2) return null;
    var ecMap = ctx.ecacheByVpc || {};
    var ecKeys = ecMap instanceof Map ? Array.from(ecMap.keys()) : Object.keys(ecMap);
    ecKeys.forEach(function (vid) {
      var arr = ecMap instanceof Map ? ecMap.get(vid) : ecMap[vid];
      (arr || []).forEach(function (c) { if (c.CacheClusterId === id) ecVpc = vid; });
    });
    var ecSgs = ((ec2.SecurityGroups || []).map(function (s) {
      return (ctx.sgs || []).find(function (sg) { return sg.GroupId === (s.SecurityGroupId || s); });
    }).filter(Boolean));
    var ecSid = null;
    if (ecVpc) (ctx.subnets || []).forEach(function (s) { if (!ecSid && s.VpcId === ecVpc && !(ctx.pubSubs && ctx.pubSubs.has(s.SubnetId))) ecSid = s.SubnetId; });
    if (!ecSid && ecVpc) (ctx.subnets || []).forEach(function (s) { if (!ecSid && s.VpcId === ecVpc) ecSid = s.SubnetId; });
    var ecSubCidr = ecSid ? ((ctx.subnets || []).find(function (s) { return s.SubnetId === ecSid; }) || {}).CidrBlock : null;
    return { subnetId: ecSid, vpcId: ecVpc, cidr: ecSubCidr, sgs: ecSgs, name: ec2.CacheClusterId };
  }

  if (type === 'redshift') {
    var rs2 = null; var rsVpc = null;
    (ctx.redshiftClusters || []).forEach(function (c) { if (c.ClusterIdentifier === id) rs2 = c; });
    if (!rs2) return null;
    var rsMap = ctx.redshiftByVpc || {};
    var rsKeys = rsMap instanceof Map ? Array.from(rsMap.keys()) : Object.keys(rsMap);
    rsKeys.forEach(function (vid) {
      var arr = rsMap instanceof Map ? rsMap.get(vid) : rsMap[vid];
      (arr || []).forEach(function (c) { if (c.ClusterIdentifier === id) rsVpc = vid; });
    });
    var rsSgs = ((rs2.VpcSecurityGroups || []).map(function (s) {
      return (ctx.sgs || []).find(function (sg) { return sg.GroupId === (s.VpcSecurityGroupId || s); });
    }).filter(Boolean));
    var rsSid = null;
    if (rsVpc) (ctx.subnets || []).forEach(function (s) { if (!rsSid && s.VpcId === rsVpc && !(ctx.pubSubs && ctx.pubSubs.has(s.SubnetId))) rsSid = s.SubnetId; });
    if (!rsSid && rsVpc) (ctx.subnets || []).forEach(function (s) { if (!rsSid && s.VpcId === rsVpc) rsSid = s.SubnetId; });
    var rsSubCidr = rsSid ? ((ctx.subnets || []).find(function (s) { return s.SubnetId === rsSid; }) || {}).CidrBlock : null;
    return { subnetId: rsSid, vpcId: rsVpc, cidr: rsSubCidr, sgs: rsSgs, name: rs2.ClusterIdentifier };
  }

  return null;
}

// ---------------------------------------------------------------------------
// resolveClickTarget — map an SVG element to {type, id}
// NOTE: This function requires a DOM element parameter. It reads data
// attributes from the SVG tree and calls buildResTree (which must be
// provided by the caller or left in the global scope).
// ---------------------------------------------------------------------------
export function resolveClickTarget(el, ctx, buildResTreeFn) {
  if (!ctx) return null;

  // Internet globe node
  var inetNode = el.closest('.internet-node');
  if (inetNode) return { type: 'internet', id: 'internet' };

  var resNode = el.closest('.res-node');
  var subNode = el.closest('.subnet-node');

  if (resNode && subNode) {
    var subId = subNode.getAttribute('data-subnet-id');
    var resIdx = Array.from(subNode.querySelectorAll('.res-node')).indexOf(resNode);
    var tree = buildResTreeFn ? buildResTreeFn(subId, ctx) : null;
    if (tree && tree[resIdx]) {
      var res = tree[resIdx];
      if (res.type === 'EC2') return { type: 'instance', id: res.rid || '' };
      if (res.type === 'ALB') return { type: 'alb', id: res.rid || res.name };
      if (res.type === 'RDS') return { type: 'rds', id: res.rid || res.name };
      if (res.type === 'FN') return { type: 'lambda', id: res.rid || res.name };
      if (res.type === 'ECS') return { type: 'ecs', id: res.rid || res.name };
      if (res.type === 'CACHE') return { type: 'ecache', id: res.rid || res.name };
      if (res.type === 'RS') return { type: 'redshift', id: res.rid || res.name };
      if (res.type === 'ENI') return { type: 'subnet', id: subId };
    }
    return { type: 'subnet', id: subId };
  }

  if (subNode) {
    return { type: 'subnet', id: subNode.getAttribute('data-subnet-id') };
  }

  return null;
}

// ---------------------------------------------------------------------------
// traceInternetToResource — path from Internet to a resource
// ---------------------------------------------------------------------------
export function traceInternetToResource(target, config, ctx, opts) {
  var path = []; var hopN = 1;
  var tgtPos = resolveNetworkPosition(target.type, target.id, ctx);
  if (!tgtPos) return { path: [{ hop: 1, type: 'error', id: '-', action: 'block', detail: 'Cannot resolve target' }], blocked: { hop: 1, reason: 'Target not found' } };

  path.push({ hop: hopN++, type: 'source', id: 'Internet', action: 'allow', detail: 'Source: Internet (0.0.0.0/0)' });

  // Check IGW exists for this VPC
  var vpcId = tgtPos.vpcId;
  var igw = (ctx.igws || []).find(function (g) { return (g.Attachments || []).some(function (a) { return a.VpcId === vpcId; }); });
  if (!igw) {
    path.push({ hop: hopN++, type: 'igw-check', id: 'No IGW', action: 'block', detail: 'No Internet Gateway attached to VPC ' + vpcId });
    path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Target unreachable', subnetId: tgtPos.subnetId });
    return { path: path, blocked: { hop: 2, reason: 'No Internet Gateway in target VPC', suggestion: 'Attach an Internet Gateway to VPC ' + vpcId } };
  }
  path.push({ hop: hopN++, type: 'igw-check', id: igw.InternetGatewayId || 'IGW', action: 'allow', detail: 'Internet Gateway ' + igw.InternetGatewayId + ' attached to VPC' });

  // Check target in public subnet (has IGW route)
  var isPublic = ctx.pubSubs && ctx.pubSubs.has(tgtPos.subnetId);
  if (!isPublic) {
    path.push({ hop: hopN++, type: 'route-table', id: 'No IGW route', action: 'block', detail: 'Target subnet ' + tgtPos.subnetId + ' has no route to IGW (private subnet)' });
    path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Target in private subnet', subnetId: tgtPos.subnetId });
    return { path: path, blocked: { hop: hopN - 2, reason: 'Target is in a private subnet with no IGW route', suggestion: 'Move resource to a public subnet or use an ALB/NAT' } };
  }
  path.push({ hop: hopN++, type: 'route-table', id: 'IGW route', action: 'allow', detail: 'Target subnet has route to Internet Gateway' });

  // NACL inbound check
  var tgtNacl = (ctx.subNacl || {})[tgtPos.subnetId];
  var naclOpts = opts && opts.discovery ? { assumeAllow: true } : null;
  var naclIn = evaluateNACL(tgtNacl, 'inbound', config.protocol, config.port, '0.0.0.0/0', naclOpts);
  path.push({ hop: hopN++, type: 'nacl-inbound', id: tgtNacl ? (tgtNacl.NetworkAclId || 'NACL') : 'Default NACL', action: naclIn.action, detail: 'Target subnet NACL inbound from Internet', rule: naclIn.rule });
  if (naclIn.action === 'deny') {
    path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Blocked by NACL', subnetId: tgtPos.subnetId });
    return { path: path, blocked: { hop: hopN - 2, reason: 'NACL denies inbound from Internet', suggestion: 'Add NACL inbound rule allowing ' + config.protocol + '/' + config.port + ' from 0.0.0.0/0' } };
  }

  // SG inbound check
  var sgOpts = opts && opts.discovery ? { assumeAllow: true } : null;
  var sgIn = evaluateSG(tgtPos.sgs, 'inbound', config.protocol, config.port, '0.0.0.0/0', sgOpts);
  path.push({ hop: hopN++, type: 'sg-inbound', id: 'Target SG', action: sgIn.action, detail: 'Security Group inbound from Internet', rule: sgIn.rule });
  if (sgIn.action === 'deny') {
    path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Blocked by SG', subnetId: tgtPos.subnetId });
    return { path: path, blocked: { hop: hopN - 2, reason: 'Security group denies inbound ' + config.protocol + '/' + config.port + ' from Internet', suggestion: 'Add SG inbound rule allowing ' + config.protocol + '/' + config.port + ' from 0.0.0.0/0' } };
  }

  path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'allow', detail: 'Target: ' + (tgtPos.name || target.id) + ' (' + target.type + ')', subnetId: tgtPos.subnetId });
  return { path: path, blocked: null };
}

// ---------------------------------------------------------------------------
// traceResourceToInternet — path from a resource outbound to the Internet
// ---------------------------------------------------------------------------
export function traceResourceToInternet(source, config, ctx, opts) {
  var path = []; var hopN = 1;
  var srcPos = resolveNetworkPosition(source.type, source.id, ctx);
  if (!srcPos) return { path: [{ hop: 1, type: 'error', id: '-', action: 'block', detail: 'Cannot resolve source' }], blocked: { hop: 1, reason: 'Source not found' } };

  path.push({ hop: hopN++, type: 'source', id: srcPos.name || source.id, action: 'allow', detail: 'Source: ' + (srcPos.name || source.id) + ' (' + source.type + ')', subnetId: srcPos.subnetId });

  // SG outbound check
  var sgOpts = opts && opts.discovery ? { assumeAllow: true } : null;
  var sgOut = evaluateSG(srcPos.sgs, 'outbound', config.protocol, config.port, '0.0.0.0/0', sgOpts);
  path.push({ hop: hopN++, type: 'sg-outbound', id: 'Source SG', action: sgOut.action, detail: 'SG outbound to Internet', rule: sgOut.rule });
  if (sgOut.action === 'deny') {
    path.push({ hop: hopN++, type: 'target', id: 'Internet', action: 'block', detail: 'Blocked by SG' });
    return { path: path, blocked: { hop: 2, reason: 'Security group denies outbound', suggestion: 'Add SG outbound rule allowing ' + config.protocol + '/' + config.port + ' to 0.0.0.0/0' } };
  }

  // NACL outbound check
  var srcNacl = (ctx.subNacl || {})[srcPos.subnetId];
  var naclOpts = opts && opts.discovery ? { assumeAllow: true } : null;
  var naclOut = evaluateNACL(srcNacl, 'outbound', config.protocol, config.port, '0.0.0.0/0', naclOpts);
  path.push({ hop: hopN++, type: 'nacl-outbound', id: srcNacl ? (srcNacl.NetworkAclId || 'NACL') : 'Default NACL', action: naclOut.action, detail: 'Source subnet NACL outbound to Internet', rule: naclOut.rule });
  if (naclOut.action === 'deny') {
    path.push({ hop: hopN++, type: 'target', id: 'Internet', action: 'block', detail: 'Blocked by NACL' });
    return { path: path, blocked: { hop: hopN - 2, reason: 'NACL denies outbound to Internet', suggestion: 'Add NACL outbound rule allowing ' + config.protocol + '/' + config.port } };
  }

  // Route table check for IGW or NAT route
  var srcRT = (ctx.subRT || {})[srcPos.subnetId];
  var hasIgwRoute = false; var hasNatRoute = false; var routeTarget = '';
  if (srcRT && srcRT.Routes) {
    srcRT.Routes.forEach(function (r) {
      if (r.GatewayId && r.GatewayId.startsWith('igw-')) { hasIgwRoute = true; routeTarget = r.GatewayId; }
      if (r.NatGatewayId) { hasNatRoute = true; routeTarget = r.NatGatewayId; }
    });
  }
  if (hasIgwRoute || hasNatRoute) {
    path.push({ hop: hopN++, type: 'route-table', id: srcRT ? (srcRT.RouteTableId || 'RT') : 'RT', action: 'allow', detail: 'Route to Internet via ' + (hasIgwRoute ? 'IGW' : 'NAT') + ' (' + routeTarget + ')', rule: '0.0.0.0/0 \u2192 ' + routeTarget });
  } else {
    path.push({ hop: hopN++, type: 'route-table', id: 'No route', action: 'block', detail: 'No route to Internet (no IGW or NAT Gateway route in route table)' });
    path.push({ hop: hopN++, type: 'target', id: 'Internet', action: 'block', detail: 'No Internet route' });
    return { path: path, blocked: { hop: hopN - 2, reason: 'No route to Internet in route table', suggestion: 'Add a route 0.0.0.0/0 \u2192 IGW or NAT Gateway' } };
  }

  path.push({ hop: hopN++, type: 'target', id: 'Internet', action: 'allow', detail: 'Target: Internet (0.0.0.0/0)' });
  return { path: path, blocked: null };
}

// ---------------------------------------------------------------------------
// traceFlowLeg — single-hop leg evaluation (dispatches to the right tracer)
// ---------------------------------------------------------------------------
export function traceFlowLeg(source, target, config, ctx, opts) {
  if (source.type === 'internet') return traceInternetToResource(target, config, ctx, opts);
  if (target.type === 'internet') return traceResourceToInternet(source, config, ctx, opts);
  return traceFlow(source, target, config, ctx);
}

// ---------------------------------------------------------------------------
// traceFlow — main flow evaluation engine (resource-to-resource within VPCs)
// ---------------------------------------------------------------------------
export function traceFlow(source, target, config, ctx) {
  var path = [];
  var srcPos = resolveNetworkPosition(source.type, source.id, ctx);
  var tgtPos = resolveNetworkPosition(target.type, target.id, ctx);
  if (!srcPos) { return { path: [{ hop: 1, type: 'error', id: '-', action: 'block', detail: 'Cannot resolve source position' }], blocked: { hop: 1, reason: 'Source not found' } }; }
  if (!tgtPos) { return { path: [{ hop: 1, type: 'error', id: '-', action: 'block', detail: 'Cannot resolve target position' }], blocked: { hop: 1, reason: 'Target not found' } }; }

  var hopN = 1;
  var srcCidr = srcPos.ip || srcPos.cidr || ((ctx.subnets || []).find(function (s) { return s.SubnetId === srcPos.subnetId; }) || {}).CidrBlock || '10.0.0.0/8';
  var tgtCidr = tgtPos.ip || tgtPos.cidr || ((ctx.subnets || []).find(function (s) { return s.SubnetId === tgtPos.subnetId; }) || {}).CidrBlock || '10.0.0.0/8';

  path.push({ hop: hopN++, type: 'source', id: srcPos.name || source.id, action: 'allow', detail: 'Source: ' + (srcPos.name || source.id) + ' (' + source.type + ') in subnet ' + srcPos.subnetId, subnetId: srcPos.subnetId });

  var srcSgIds = srcPos.sgs.map(function (s) { return s.GroupId; }).filter(Boolean);
  var tgtSgIds = tgtPos.sgs.map(function (s) { return s.GroupId; }).filter(Boolean);

  // Same-subnet path: only SG checks
  if (srcPos.subnetId === tgtPos.subnetId) {
    var sgOut = evaluateSG(srcPos.sgs, 'outbound', config.protocol, config.port, tgtCidr, { sourceSgIds: tgtSgIds });
    path.push({ hop: hopN++, type: 'sg-outbound', id: 'Source SG', action: sgOut.action, detail: 'Security Group outbound check', rule: sgOut.rule });
    if (sgOut.action === 'deny') {
      var sgInSkip = evaluateSG(tgtPos.sgs, 'inbound', config.protocol, config.port, srcCidr, { sourceSgIds: srcSgIds });
      path.push({ hop: hopN++, type: 'sg-inbound', id: 'Target SG', action: 'skip', detail: 'Skipped (blocked upstream)', rule: sgInSkip.rule });
      path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Target: ' + (tgtPos.name || target.id), subnetId: tgtPos.subnetId });
      return { path: path, blocked: { hop: 2, reason: 'Source security group denies outbound ' + config.protocol + '/' + config.port, suggestion: 'Add outbound rule to source SG allowing ' + config.protocol + '/' + config.port + ' to ' + tgtCidr } };
    }
    var sgIn = evaluateSG(tgtPos.sgs, 'inbound', config.protocol, config.port, srcCidr, { sourceSgIds: srcSgIds });
    path.push({ hop: hopN++, type: 'sg-inbound', id: 'Target SG', action: sgIn.action, detail: 'Security Group inbound check', rule: sgIn.rule });
    if (sgIn.action === 'deny') {
      path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Target: ' + (tgtPos.name || target.id), subnetId: tgtPos.subnetId });
      return { path: path, blocked: { hop: hopN - 2, reason: 'Target security group denies inbound ' + config.protocol + '/' + config.port, suggestion: 'Add inbound rule to target SG allowing ' + config.protocol + '/' + config.port + ' from ' + (srcCidr || 'source CIDR') } };
    }
    path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'allow', detail: 'Target: ' + (tgtPos.name || target.id) + ' (' + target.type + ')', subnetId: tgtPos.subnetId });
    return { path: path, blocked: null };
  }

  // Same-VPC, different-subnet path
  if (srcPos.vpcId === tgtPos.vpcId) {
    var srcRT = (ctx.subRT || {})[srcPos.subnetId];
    var rtResult = evaluateRouteTable(srcRT, tgtCidr);
    path.push({ hop: hopN++, type: 'route-table', id: srcRT ? (srcRT.RouteTableId || 'RT') : 'Main RT', action: rtResult.type === 'blackhole' ? 'block' : 'allow', detail: 'Route table lookup for ' + tgtCidr + ' => ' + rtResult.type + (rtResult.target !== 'local' ? ' (' + rtResult.target + ')' : ''), rule: 'Route: ' + rtResult.type + (rtResult.target !== 'local' ? ' via ' + rtResult.target : '') });
    if (rtResult.type === 'blackhole') {
      path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Target unreachable', subnetId: tgtPos.subnetId });
      return { path: path, blocked: { hop: hopN - 2, reason: 'Route table has no route to destination', suggestion: 'Add a route to ' + tgtCidr + ' in the source subnet route table' } };
    }

    var srcNacl = (ctx.subNacl || {})[srcPos.subnetId];
    var naclOut = evaluateNACL(srcNacl, 'outbound', config.protocol, config.port, tgtCidr);
    path.push({ hop: hopN++, type: 'nacl-outbound', id: srcNacl ? (srcNacl.NetworkAclId || 'NACL') : 'Default NACL', action: naclOut.action, detail: 'Source subnet NACL outbound', rule: naclOut.rule });
    if (naclOut.action === 'deny') {
      path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Blocked by NACL', subnetId: tgtPos.subnetId });
      return { path: path, blocked: { hop: hopN - 2, reason: 'Source NACL denies outbound traffic', suggestion: 'Add NACL outbound rule allowing ' + config.protocol + '/' + config.port } };
    }

    var sgOut2 = evaluateSG(srcPos.sgs, 'outbound', config.protocol, config.port, tgtCidr, { sourceSgIds: tgtSgIds });
    path.push({ hop: hopN++, type: 'sg-outbound', id: 'Source SG', action: sgOut2.action, detail: 'Source SG outbound', rule: sgOut2.rule });
    if (sgOut2.action === 'deny') {
      path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Blocked by SG', subnetId: tgtPos.subnetId });
      return { path: path, blocked: { hop: hopN - 2, reason: 'Source security group denies outbound', suggestion: 'Add SG outbound rule for ' + config.protocol + '/' + config.port } };
    }

    var tgtNacl = (ctx.subNacl || {})[tgtPos.subnetId];
    var naclIn = evaluateNACL(tgtNacl, 'inbound', config.protocol, config.port, srcCidr);
    path.push({ hop: hopN++, type: 'nacl-inbound', id: tgtNacl ? (tgtNacl.NetworkAclId || 'NACL') : 'Default NACL', action: naclIn.action, detail: 'Target subnet NACL inbound', rule: naclIn.rule });
    if (naclIn.action === 'deny') {
      path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Blocked by NACL', subnetId: tgtPos.subnetId });
      return { path: path, blocked: { hop: hopN - 2, reason: 'Target NACL denies inbound traffic', suggestion: 'Add NACL inbound rule allowing ' + config.protocol + '/' + config.port + ' from ' + srcCidr } };
    }

    var sgIn2 = evaluateSG(tgtPos.sgs, 'inbound', config.protocol, config.port, srcCidr, { sourceSgIds: srcSgIds });
    path.push({ hop: hopN++, type: 'sg-inbound', id: 'Target SG', action: sgIn2.action, detail: 'Target SG inbound', rule: sgIn2.rule });
    if (sgIn2.action === 'deny') {
      path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Blocked by SG', subnetId: tgtPos.subnetId });
      return { path: path, blocked: { hop: hopN - 2, reason: 'Target security group denies inbound', suggestion: 'Add SG inbound rule for ' + config.protocol + '/' + config.port + ' from source' } };
    }

    path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'allow', detail: 'Target: ' + (tgtPos.name || target.id) + ' (' + target.type + ')', subnetId: tgtPos.subnetId });
    return { path: path, blocked: null };
  }

  // Cross-VPC: evaluate source-side controls first
  var srcRTx = (ctx.subRT || {})[srcPos.subnetId];
  var rtResultX = evaluateRouteTable(srcRTx, tgtCidr);
  path.push({ hop: hopN++, type: 'route-table', id: srcRTx ? (srcRTx.RouteTableId || 'RT') : 'Main RT', action: rtResultX.type === 'blackhole' ? 'block' : 'allow', detail: 'Route table lookup for ' + tgtCidr + ' => ' + rtResultX.type + (rtResultX.target !== 'local' ? ' (' + rtResultX.target + ')' : ''), rule: 'Route: ' + rtResultX.type + (rtResultX.target !== 'local' ? ' via ' + rtResultX.target : '') });
  if (rtResultX.type === 'blackhole') {
    path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Target unreachable', subnetId: tgtPos.subnetId });
    return { path: path, blocked: { hop: hopN - 2, reason: 'Route table has no route to destination', suggestion: 'Add a route to ' + tgtCidr + ' via peering or TGW' } };
  }

  var srcNaclX = (ctx.subNacl || {})[srcPos.subnetId];
  var naclOutX = evaluateNACL(srcNaclX, 'outbound', config.protocol, config.port, tgtCidr);
  path.push({ hop: hopN++, type: 'nacl-outbound', id: srcNaclX ? (srcNaclX.NetworkAclId || 'NACL') : 'Default NACL', action: naclOutX.action, detail: 'Source subnet NACL outbound', rule: naclOutX.rule });
  if (naclOutX.action === 'deny') {
    path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Blocked by NACL', subnetId: tgtPos.subnetId });
    return { path: path, blocked: { hop: hopN - 2, reason: 'Source NACL denies outbound traffic', suggestion: 'Add NACL outbound rule allowing ' + config.protocol + '/' + config.port } };
  }

  var sgOutX = evaluateSG(srcPos.sgs, 'outbound', config.protocol, config.port, tgtCidr, { sourceSgIds: tgtSgIds });
  path.push({ hop: hopN++, type: 'sg-outbound', id: 'Source SG', action: sgOutX.action, detail: 'Source SG outbound', rule: sgOutX.rule });
  if (sgOutX.action === 'deny') {
    path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Blocked by SG', subnetId: tgtPos.subnetId });
    return { path: path, blocked: { hop: hopN - 2, reason: 'Source security group denies outbound', suggestion: 'Add SG outbound rule for ' + config.protocol + '/' + config.port } };
  }

  // Cross-VPC connectivity check (peering or TGW)
  var peeringRoute = null;
  (ctx.peerings || []).forEach(function (p) {
    var req = p.RequesterVpcInfo || {};
    var acc = p.AccepterVpcInfo || {};
    if ((req.VpcId === srcPos.vpcId && acc.VpcId === tgtPos.vpcId) || (acc.VpcId === srcPos.vpcId && req.VpcId === tgtPos.vpcId)) {
      peeringRoute = p;
    }
  });

  if (peeringRoute) {
    path.push({ hop: hopN++, type: 'peering', id: peeringRoute.VpcPeeringConnectionId || 'PCX', action: 'allow', detail: 'VPC Peering connection between ' + srcPos.vpcId + ' and ' + tgtPos.vpcId, rule: 'Peering: ' + peeringRoute.VpcPeeringConnectionId });
  } else {
    var tgwRoute = false;
    (ctx.tgwAttachments || []).forEach(function (att) {
      if (att.ResourceId === srcPos.vpcId || att.ResourceId === tgtPos.vpcId) tgwRoute = true;
    });
    if (tgwRoute) {
      path.push({ hop: hopN++, type: 'tgw', id: 'Transit Gateway', action: 'allow', detail: 'Transit Gateway route between VPCs' });
    } else {
      path.push({ hop: hopN++, type: 'cross-vpc', id: 'No route', action: 'block', detail: 'No peering or TGW connection between VPCs' });
      path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Target unreachable', subnetId: tgtPos.subnetId });
      return { path: path, blocked: { hop: hopN - 2, reason: 'No connectivity between VPCs', suggestion: 'Create a VPC peering connection or Transit Gateway attachment' } };
    }
  }

  // Target-side controls (NACL-in, SG-in)
  var tgtNaclX = (ctx.subNacl || {})[tgtPos.subnetId];
  var naclInX = evaluateNACL(tgtNaclX, 'inbound', config.protocol, config.port, srcCidr);
  path.push({ hop: hopN++, type: 'nacl-inbound', id: tgtNaclX ? (tgtNaclX.NetworkAclId || 'NACL') : 'Default NACL', action: naclInX.action, detail: 'Target subnet NACL inbound', rule: naclInX.rule });
  if (naclInX.action === 'deny') {
    path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Blocked by NACL', subnetId: tgtPos.subnetId });
    return { path: path, blocked: { hop: hopN - 2, reason: 'Target NACL denies inbound traffic', suggestion: 'Add NACL inbound rule allowing ' + config.protocol + '/' + config.port + ' from ' + srcCidr } };
  }

  var sgIn3 = evaluateSG(tgtPos.sgs, 'inbound', config.protocol, config.port, srcCidr, { sourceSgIds: srcSgIds });
  path.push({ hop: hopN++, type: 'sg-inbound', id: 'Target SG', action: sgIn3.action, detail: 'Target SG inbound (cross-VPC)', rule: sgIn3.rule });
  if (sgIn3.action === 'deny') {
    path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'block', detail: 'Blocked by SG', subnetId: tgtPos.subnetId });
    return { path: path, blocked: { hop: hopN - 2, reason: 'Target SG denies inbound from cross-VPC source', suggestion: 'Add SG inbound rule for ' + config.protocol + '/' + config.port } };
  }

  path.push({ hop: hopN++, type: 'target', id: tgtPos.name || target.id, action: 'allow', detail: 'Target: ' + (tgtPos.name || target.id) + ' (' + target.type + ')', subnetId: tgtPos.subnetId });
  return { path: path, blocked: null };
}

// ---------------------------------------------------------------------------
// findAlternatePaths — find alternate routes via intermediary resources
// ---------------------------------------------------------------------------
export function findAlternatePaths(source, target, config, ctx) {
  if (!ctx) return [];
  var tgtPos = resolveNetworkPosition(target.type, target.id, ctx);
  if (!tgtPos) return [];
  var vpcId = tgtPos.vpcId;
  var results = [];

  // Collect candidates: instances + ALBs in the target VPC (or any VPC if source is internet)
  var candidates = [];
  var isInternet = source.type === 'internet';

  // Public-subnet instances first (bastion pattern)
  (ctx.instances || []).forEach(function (inst) {
    var instVpc = inst.VpcId || ((ctx.subnets || []).find(function (s) { return s.SubnetId === inst.SubnetId; }) || {}).VpcId;
    if (!isInternet && instVpc !== vpcId) return;
    if (inst.InstanceId === (target.type === 'instance' ? target.id : '')) return;
    if (inst.InstanceId === (source.type === 'instance' ? source.id : '')) return;
    var isPub = ctx.pubSubs && ctx.pubSubs.has(inst.SubnetId);
    var gn2 = inst.Tags ? ((inst.Tags.find(function (t) { return t.Key === 'Name'; }) || {}).Value || inst.InstanceId) : inst.InstanceId;
    candidates.push({ ref: { type: 'instance', id: inst.InstanceId }, name: gn2, isPub: isPub, defaultPort: 22 });
  });

  // ALBs
  Object.keys(ctx.albBySub || {}).forEach(function (sid) {
    var sub = (ctx.subnets || []).find(function (s) { return s.SubnetId === sid; });
    if (!sub || (!isInternet && sub.VpcId !== vpcId)) return;
    (ctx.albBySub[sid] || []).forEach(function (alb) {
      var albId = alb.LoadBalancerArn ? alb.LoadBalancerArn.split('/').pop() : '';
      if (albId === (target.type === 'alb' ? target.id : '')) return;
      candidates.push({ ref: { type: 'alb', id: albId || alb.LoadBalancerName }, name: alb.LoadBalancerName || albId, isPub: true, defaultPort: 443 });
    });
  });

  // Sort: public instances first, then ALBs, then private instances
  candidates.sort(function (a, b) { return (b.isPub ? 1 : 0) - (a.isPub ? 1 : 0); });

  // Test each candidate (max 20 tested, max 5 results)
  var tested = 0;
  for (var i = 0; i < candidates.length && tested < 20 && results.length < 5; i++) {
    var cand = candidates[i];
    tested++;
    var leg1Config = { protocol: 'tcp', port: cand.defaultPort };
    var leg1 = traceFlowLeg(source, cand.ref, leg1Config, ctx);
    if (leg1.blocked) continue;
    var leg2 = traceFlowLeg(cand.ref, target, config, ctx);
    if (leg2.blocked) continue;
    results.push({ via: { type: cand.ref.type, id: cand.ref.id, name: cand.name }, leg1Result: leg1, leg2Result: leg2, leg1Config: leg1Config });
  }
  return results;
}
