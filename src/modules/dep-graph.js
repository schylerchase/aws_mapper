// Dependency Graph / Blast Radius — pure logic
// Builds resource dependency graphs and computes blast radius for impact analysis.
// DOM display functions (showDependencies, blast highlighting) remain inline
// until they can be modernized with dom-builders.js in Phase 5.

import { rlCtx, mapG } from './state.js';
import { esc } from './utils.js';
import { showToast } from './dom-helpers.js';

// Module state
let depGraph = null;
let blastActive = false;

/**
 * Build a dependency graph from parsed AWS context.
 * @param {Object} ctx - parsed AWS resource context
 * @returns {Object} adjacency list: { resourceId: [{id, rel, strength}] }
 */
export function buildDependencyGraph(ctx) {
  if (!ctx) return {};
  const g = {};
  const addEdge = (from, to, rel, strength) => {
    if (!g[from]) g[from] = [];
    g[from].push({ id: to, rel, strength });
  };

  // VPC -> subnets, gateways, route tables, NACLs, SGs
  (ctx.vpcs || []).forEach(v => {
    (ctx.subnets || []).filter(s => s.VpcId === v.VpcId).forEach(s => addEdge(v.VpcId, s.SubnetId, 'contains', 'hard'));
    (ctx.igws || []).forEach(ig => { if ((ig.Attachments || []).some(a => a.VpcId === v.VpcId)) addEdge(v.VpcId, ig.InternetGatewayId, 'attached', 'hard'); });
    (ctx.nats || []).filter(n => n.VpcId === v.VpcId).forEach(n => addEdge(v.VpcId, n.NatGatewayId, 'contains', 'hard'));
    (ctx.vpces || []).filter(e => e.VpcId === v.VpcId).forEach(e => addEdge(v.VpcId, e.VpcEndpointId, 'contains', 'soft'));
    (ctx.rts || []).filter(rt => rt.VpcId === v.VpcId).forEach(rt => addEdge(v.VpcId, rt.RouteTableId, 'contains', 'config'));
    (ctx.nacls || []).filter(n => n.VpcId === v.VpcId).forEach(n => addEdge(v.VpcId, n.NetworkAclId, 'contains', 'config'));
    (ctx.sgs || []).filter(sg => sg.VpcId === v.VpcId).forEach(sg => addEdge(v.VpcId, sg.GroupId, 'contains', 'config'));
  });

  // Subnet -> resources
  (ctx.subnets || []).forEach(sub => {
    ((ctx.instBySub || {})[sub.SubnetId] || []).forEach(i => addEdge(sub.SubnetId, i.InstanceId, 'contains', 'hard'));
    ((ctx.rdsBySub || {})[sub.SubnetId] || []).forEach(r => addEdge(sub.SubnetId, r.DBInstanceIdentifier, 'contains', 'hard'));
    ((ctx.ecsBySub || {})[sub.SubnetId] || []).forEach(e => addEdge(sub.SubnetId, e.serviceName, 'contains', 'hard'));
    ((ctx.lambdaBySub || {})[sub.SubnetId] || []).forEach(l => addEdge(sub.SubnetId, l.FunctionName, 'contains', 'hard'));
    ((ctx.albBySub || {})[sub.SubnetId] || []).forEach(a => addEdge(sub.SubnetId, a.LoadBalancerName, 'contains', 'hard'));
    const rt = (ctx.subRT || {})[sub.SubnetId];
    if (rt) addEdge(sub.SubnetId, rt.RouteTableId, 'associated', 'config');
    const nacl = (ctx.subNacl || {})[sub.SubnetId];
    if (nacl) addEdge(sub.SubnetId, nacl.NetworkAclId, 'associated', 'config');
  });

  // EC2 -> SGs + EBS volumes
  (ctx.instances || []).forEach(inst => {
    (inst.SecurityGroups || []).forEach(sg => addEdge(inst.InstanceId, sg.GroupId, 'secured_by', 'soft'));
    (inst.BlockDeviceMappings || []).forEach(b => { if (b.Ebs && b.Ebs.VolumeId) addEdge(inst.InstanceId, b.Ebs.VolumeId, 'attached', 'hard'); });
  });

  // RDS -> SGs
  (ctx.rdsInstances || []).forEach(db => {
    (db.VpcSecurityGroups || []).forEach(sg => addEdge(db.DBInstanceIdentifier, sg.VpcSecurityGroupId, 'secured_by', 'soft'));
  });

  // ALB -> SGs + target groups
  (ctx.albs || []).forEach(alb => {
    (alb.SecurityGroups || []).forEach(gid => addEdge(alb.LoadBalancerName, gid, 'secured_by', 'soft'));
    const tgs = (ctx.tgByAlb || {})[alb.LoadBalancerArn] || [];
    tgs.forEach(tg => { addEdge(alb.LoadBalancerName, tg.TargetGroupName || tg.TargetGroupArn, 'targets', 'soft'); });
  });

  // SG -> SG references
  (ctx.sgs || []).forEach(sg => {
    [...(sg.IpPermissions || []), ...(sg.IpPermissionsEgress || [])].forEach(p => {
      (p.UserIdGroupPairs || []).forEach(pair => {
        if (pair.GroupId && pair.GroupId !== sg.GroupId) addEdge(sg.GroupId, pair.GroupId, 'references', 'config');
      });
    });
  });

  // Route table -> gateways
  (ctx.rts || []).forEach(rt => {
    (rt.Routes || []).forEach(r => {
      if (r.GatewayId && r.GatewayId !== 'local') addEdge(rt.RouteTableId, r.GatewayId, 'routes_through', 'config');
      if (r.NatGatewayId) addEdge(rt.RouteTableId, r.NatGatewayId, 'routes_through', 'config');
      if (r.TransitGatewayId) addEdge(rt.RouteTableId, r.TransitGatewayId, 'routes_through', 'config');
      if (r.VpcPeeringConnectionId) addEdge(rt.RouteTableId, r.VpcPeeringConnectionId, 'routes_through', 'config');
    });
  });

  // Peering -> VPCs
  (ctx.peerings || []).forEach(p => {
    if (p.RequesterVpcInfo) addEdge(p.VpcPeeringConnectionId, p.RequesterVpcInfo.VpcId, 'connects', 'soft');
    if (p.AccepterVpcInfo) addEdge(p.VpcPeeringConnectionId, p.AccepterVpcInfo.VpcId, 'connects', 'soft');
  });

  return g;
}

/**
 * BFS from resourceId to find all dependent resources within maxDepth hops.
 * @param {string} resourceId
 * @param {Object} graph - adjacency list from buildDependencyGraph
 * @param {number} [maxDepth=5]
 * @returns {{hard:Array, soft:Array, config:Array, all:Array}}
 */
export function getBlastRadius(resourceId, graph, maxDepth) {
  maxDepth = maxDepth || 5;
  const result = { hard: [], soft: [], config: [], all: [] };
  const visited = new Set([resourceId]);
  const queue = [{ id: resourceId, depth: 0 }];
  while (queue.length) {
    const { id, depth } = queue.shift();
    if (depth >= maxDepth) continue;
    const edges = graph[id] || [];
    edges.forEach(e => {
      if (visited.has(e.id)) return;
      visited.add(e.id);
      const entry = { id: e.id, rel: e.rel, strength: e.strength, depth: depth + 1, parent: id };
      result[e.strength] = (result[e.strength] || []);
      result[e.strength].push(entry);
      result.all.push(entry);
      queue.push({ id: e.id, depth: depth + 1 });
    });
  }
  return result;
}

/** Classify a resource ID by its prefix. */
export function getResType(id) {
  if (!id) return 'Unknown';
  if (id.startsWith('vpc-')) return 'VPC';
  if (id.startsWith('subnet-')) return 'Subnet';
  if (id.startsWith('i-')) return 'EC2';
  if (id.startsWith('igw-')) return 'IGW';
  if (id.startsWith('nat-')) return 'NAT';
  if (id.startsWith('vpce-')) return 'VPCE';
  if (id.startsWith('sg-')) return 'SG';
  if (id.startsWith('rtb-')) return 'RT';
  if (id.startsWith('acl-')) return 'NACL';
  if (id.startsWith('vol-')) return 'EBS';
  if (id.startsWith('pcx-')) return 'Peering';
  if (id.startsWith('tgw-')) return 'TGW';
  if (id.startsWith('arn:')) return 'ARN';
  const ctx = rlCtx;
  if (ctx) {
    if ((ctx.rdsInstances || []).some(r => r.DBInstanceIdentifier === id)) return 'RDS';
    if ((ctx.lambdaFns || []).some(f => f.FunctionName === id)) return 'Lambda';
    if ((ctx.ecsServices || []).some(e => e.serviceName === id)) return 'ECS';
    if ((ctx.albs || []).some(a => a.LoadBalancerName === id)) return 'ALB';
    if ((ctx.ecacheClusters || []).some(c => c.CacheClusterId === id)) return 'ElastiCache';
    if ((ctx.redshiftClusters || []).some(c => c.ClusterIdentifier === id)) return 'Redshift';
  }
  return 'Resource';
}

/** Look up a human-readable name for a resource ID. */
export function getResName(id) {
  const ctx = rlCtx;
  if (!ctx) return id;
  const v = (ctx.vpcs || []).find(x => x.VpcId === id);
  if (v) { const t = (v.Tags || []).find(t => t.Key === 'Name'); return t ? t.Value : id; }
  const s = (ctx.subnets || []).find(x => x.SubnetId === id);
  if (s) { const t = (s.Tags || []).find(t => t.Key === 'Name'); return t ? t.Value : id; }
  const i = (ctx.instances || []).find(x => x.InstanceId === id);
  if (i) { const t = (i.Tags || []).find(t => t.Key === 'Name'); return t ? t.Value : id; }
  const sg = (ctx.sgs || []).find(x => x.GroupId === id);
  if (sg) return sg.GroupName || id;
  return id;
}

/** Clear blast radius highlighting from the SVG. */
export function clearBlastRadius() {
  const mg = mapG;
  if (!blastActive || !mg) return;
  blastActive = false;
  mg.selectAll('.blast-dimmed,.blast-glow-hard,.blast-glow-soft,.blast-glow-config')
    .classed('blast-dimmed', false).classed('blast-glow-hard', false)
    .classed('blast-glow-soft', false).classed('blast-glow-config', false);
}

/** Reset the cached dependency graph (call after data changes). */
export function resetDepGraph() {
  depGraph = null;
}

/** Check if blast radius mode is active. */
export function isBlastActive() {
  return blastActive;
}

// Expose for inline code during transition
export { depGraph, blastActive };
