// Flow Analysis — auto-discovery engine (pure logic)
// D3/SVG visualization (_renderFlowAnalysisOverlay, _renderTierBadges, etc.)
// remains inline until modernized in Phase 5.

// Transitional: flow tracing functions not yet importable, access via window
function _traceInbound(target, config, ctx, opts) {
  return typeof window !== 'undefined' && window._traceInternetToResource
    ? window._traceInternetToResource(target, config, ctx, opts)
    : { blocked: true, path: [] };
}
function _traceOutbound(source, config, ctx, opts) {
  return typeof window !== 'undefined' && window._traceResourceToInternet
    ? window._traceResourceToInternet(source, config, ctx, opts)
    : { blocked: true, path: [] };
}
function _traceLeg(source, target, config, ctx, opts) {
  return typeof window !== 'undefined' && window._traceFlowLeg
    ? window._traceFlowLeg(source, target, config, ctx, opts)
    : { blocked: true, path: [] };
}

// === Module State ===
let flowAnalysisMode = null; // null|'tiers'|'ingress'|'egress'|'bastion'|'all'
let flowAnalysisCache = null;
let faDashState = { section: 'all', search: '', sort: 'name', sortDir: 'asc', page: 1, perPage: 50 };
let faDashRows = null;

// === State Accessors ===
export function getFlowAnalysisMode() { return flowAnalysisMode; }
export function setFlowAnalysisMode(v) { flowAnalysisMode = v; }
export function getFlowAnalysisCache() { return flowAnalysisCache; }
export function setFlowAnalysisCache(v) { flowAnalysisCache = v; }
export function getFaDashState() { return faDashState; }
export function setFaDashState(v) { faDashState = v; }
export function getFaDashRows() { return faDashRows; }
export function setFaDashRows(v) { faDashRows = v; }

// === Pure Logic ===

/** Helper: get Name tag from resource. */
function _gn3(resource) {
  const tags = resource.Tags || resource.tags || [];
  const t = tags.find(t => t.Key === 'Name');
  return t ? t.Value : (resource.InstanceId || resource.LoadBalancerName || resource.DBInstanceIdentifier || 'unknown');
}

/**
 * Auto-discover all traffic flows in the infrastructure.
 * @param {Object} ctx - parsed AWS rlCtx
 * @returns {Object} {ingressPaths, egressPaths, accessTiers, bastionChains, bastions, hasSgData, hasNaclEgress}
 */
export function discoverTrafficFlows(ctx) {
  if (!ctx) return null;
  const hasSgData = (ctx.instances || []).some(i => (i.SecurityGroups || []).length > 0);
  const hasNaclEgress = (ctx.nacls || []).some(n => (n.Entries || []).some(e => e.Egress));
  const ingressPaths = findIngressPaths(ctx);
  const egressPaths = findEgressPaths(ctx);
  const bastions = detectBastions(ctx);
  const bastionChains = findBastionChains(bastions, ctx);
  const accessTiers = classifyAllResources(ctx, ingressPaths, bastionChains);
  return { ingressPaths, egressPaths, accessTiers, bastionChains, bastions, hasSgData, hasNaclEgress };
}

/** Find all internet-to-resource ingress paths. */
export function findIngressPaths(ctx) {
  const paths = [];
  (ctx.igws || []).forEach(igw => {
    const vpcId = (igw.Attachments || [])[0]?.VpcId;
    if (!vpcId) return;
    (ctx.subnets || []).forEach(sub => {
      if (sub.VpcId !== vpcId) return;
      if (!ctx.pubSubs || !ctx.pubSubs.has(sub.SubnetId)) return;
      (ctx.instBySub[sub.SubnetId] || []).forEach(inst => {
        [443, 80, 22].forEach(port => {
          const r = _traceInbound({ type: 'instance', id: inst.InstanceId }, { protocol: 'tcp', port }, ctx, { discovery: true });
          if (!r.blocked) {
            paths.push({ from: 'internet', to: { type: 'instance', id: inst.InstanceId }, toName: _gn3(inst), path: r.path, port, type: 'direct', vpcId });
          }
        });
      });
      (ctx.albBySub[sub.SubnetId] || []).forEach(alb => {
        const albId = alb.LoadBalancerArn ? alb.LoadBalancerArn.split('/').pop() : '';
        const r = _traceInbound({ type: 'alb', id: albId || alb.LoadBalancerName }, { protocol: 'tcp', port: 443 }, ctx, { discovery: true });
        if (!r.blocked) {
          paths.push({ from: 'internet', to: { type: 'alb', id: albId || alb.LoadBalancerName }, toName: alb.LoadBalancerName || albId, path: r.path, port: 443, type: 'loadbalancer', vpcId });
        }
      });
    });
  });
  return paths;
}

/** Find resource-to-internet egress paths. */
export function findEgressPaths(ctx) {
  const paths = [];
  const checked = new Set();
  (ctx.instances || []).forEach(inst => {
    if (checked.has(inst.SubnetId)) return;
    const r = _traceOutbound({ type: 'instance', id: inst.InstanceId }, { protocol: 'tcp', port: 443 }, ctx, { discovery: true });
    if (!r.blocked) {
      checked.add(inst.SubnetId);
      paths.push({
        from: { type: 'instance', id: inst.InstanceId }, fromName: _gn3(inst),
        to: 'internet', subnetId: inst.SubnetId,
        via: r.path.some(h => h.detail && h.detail.includes('NAT')) ? 'nat' : 'igw'
      });
    }
  });
  return paths;
}

/** Detect bastion/jump hosts by name pattern and SSH security group rules. */
export function detectBastions(ctx) {
  const bastions = [];
  const hasSgData = (ctx.instances || []).some(i => (i.SecurityGroups || []).length > 0);
  (ctx.instances || []).forEach(inst => {
    if (!ctx.pubSubs || !ctx.pubSubs.has(inst.SubnetId)) return;
    const name = _gn3(inst);
    const nameMatch = /bastion|jump|ssh/i.test(name);
    if (hasSgData) {
      const sgs = (inst.SecurityGroups || []).map(s => (ctx.sgs || []).find(sg => sg.GroupId === s.GroupId)).filter(Boolean);
      const hasSSH = sgs.some(sg => (sg.IpPermissions || []).some(r => r.FromPort <= 22 && r.ToPort >= 22));
      if (!hasSSH && !nameMatch) return;
    } else {
      if (!nameMatch) return;
    }
    bastions.push({
      type: 'instance', id: inst.InstanceId, name,
      subnetId: inst.SubnetId,
      vpcId: inst.VpcId || ((ctx.subnets || []).find(s => s.SubnetId === inst.SubnetId) || {}).VpcId
    });
  });
  return bastions;
}

/** Trace bastion → private resource chains. */
export function findBastionChains(bastions, ctx) {
  const chains = [];
  const hasSgData = (ctx.instances || []).some(i => (i.SecurityGroups || []).length > 0);
  bastions.forEach(bastion => {
    const targets = [];
    const testedSubs = new Set();
    (ctx.instances || []).forEach(inst => {
      if (inst.InstanceId === bastion.id) return;
      const instVpc = inst.VpcId || ((ctx.subnets || []).find(s => s.SubnetId === inst.SubnetId) || {}).VpcId;
      if (instVpc !== bastion.vpcId) return;
      if (ctx.pubSubs && ctx.pubSubs.has(inst.SubnetId)) return;
      const name = _gn3(inst);
      if (!hasSgData) {
        if (targets.length < 50) targets.push({ type: 'instance', id: inst.InstanceId, name });
      } else if (!testedSubs.has(inst.SubnetId)) {
        testedSubs.add(inst.SubnetId);
        const r = _traceLeg({ type: 'instance', id: bastion.id }, { type: 'instance', id: inst.InstanceId }, { protocol: 'tcp', port: 22 }, ctx, { discovery: true });
        if (!r.blocked) targets.push({ type: 'instance', id: inst.InstanceId, name });
      } else {
        targets.push({ type: 'instance', id: inst.InstanceId, name });
      }
    });
    (ctx.rdsInstances || []).forEach(db => {
      let rSid = null;
      Object.keys(ctx.rdsBySub || {}).forEach(sid => { (ctx.rdsBySub[sid] || []).forEach(d => { if (d.DBInstanceIdentifier === db.DBInstanceIdentifier) rSid = sid; }); });
      if (!rSid) return;
      const rVpc = ((ctx.subnets || []).find(s => s.SubnetId === rSid) || {}).VpcId;
      if (rVpc !== bastion.vpcId) return;
      if (!hasSgData) {
        targets.push({ type: 'rds', id: db.DBInstanceIdentifier, name: db.DBInstanceIdentifier });
      } else {
        const port = (db.Endpoint && db.Endpoint.Port) || 3306;
        const r = _traceLeg({ type: 'instance', id: bastion.id }, { type: 'rds', id: db.DBInstanceIdentifier }, { protocol: 'tcp', port }, ctx, { discovery: true });
        if (!r.blocked) targets.push({ type: 'rds', id: db.DBInstanceIdentifier, name: db.DBInstanceIdentifier });
      }
    });
    if (targets.length > 0) chains.push({ bastion, targets });
  });
  return chains;
}

/** Classify all resources into access tiers. */
export function classifyAllResources(ctx, ingressPaths, bastionChains) {
  const tiers = { internetFacing: [], bastionOnly: [], fullyPrivate: [], database: [] };
  const ingressSet = new Set();
  ingressPaths.forEach(p => { ingressSet.add(p.to.type + ':' + p.to.id); });
  const bastionSet = new Set();
  bastionChains.forEach(ch => { ch.targets.forEach(t => { bastionSet.add(t.type + ':' + t.id); }); });

  (ctx.instances || []).forEach(inst => {
    const key = 'instance:' + inst.InstanceId;
    const ref = { type: 'instance', id: inst.InstanceId, name: _gn3(inst) };
    if (ingressSet.has(key)) { tiers.internetFacing.push(ref); return; }
    if (bastionSet.has(key)) { tiers.bastionOnly.push(ref); return; }
    tiers.fullyPrivate.push(ref);
  });

  Object.keys(ctx.albBySub || {}).forEach(sid => {
    (ctx.albBySub[sid] || []).forEach(alb => {
      const albId = alb.LoadBalancerArn ? alb.LoadBalancerArn.split('/').pop() : '';
      const key = 'alb:' + (albId || alb.LoadBalancerName);
      const ref = { type: 'alb', id: albId || alb.LoadBalancerName, name: alb.LoadBalancerName || albId };
      if (ingressSet.has(key)) { tiers.internetFacing.push(ref); return; }
      tiers.fullyPrivate.push(ref);
    });
  });

  (ctx.rdsInstances || []).forEach(db => {
    tiers.database.push({ type: 'rds', id: db.DBInstanceIdentifier, name: db.DBInstanceIdentifier });
  });
  (ctx.ecacheClusters || []).forEach(ec => {
    tiers.database.push({ type: 'ecache', id: ec.CacheClusterId, name: ec.CacheClusterId });
  });
  return tiers;
}

// Backward-compat aliases
export {
  flowAnalysisMode as _flowAnalysisMode,
  flowAnalysisCache as _flowAnalysisCache,
  faDashState as _faDashState,
  faDashRows as _faDashRows
};
