// Multi-Account / Multi-Region — state and pure logic
// DOM rendering functions (_renderAccountPanel, _renderMergeBannerChips, event listeners)
// remain inline until modernized with dom-builders.js in Phase 5.

import { safeParse, ext } from './utils.js';

// Transitional: detectAccountId/detectRegion live in init region, not yet extracted
function _detectAccountId(r) { return typeof window !== 'undefined' && window.detectAccountId ? window.detectAccountId(r) : null; }
function _detectRegion(r) { return typeof window !== 'undefined' && window.detectRegion ? window.detectRegion(r) : null; }
function _parseIAMData(raw) { return typeof window !== 'undefined' && window.parseIAMData ? window.parseIAMData(raw) : null; }

// === Module State ===
let multiViewMode = false;
let loadedContexts = [];  // [{accountId, accountLabel, region, textareas, rlCtx, color, visible}]
let mergedCtx = null;
let singleCtxBackup = null;

// === State Accessors ===
export function getMultiViewMode() { return multiViewMode; }
export function setMultiViewMode(v) { multiViewMode = v; }
export function getLoadedContexts() { return loadedContexts; }
export function setLoadedContexts(v) { loadedContexts = v; }
export function getMergedCtx() { return mergedCtx; }
export function setMergedCtx(v) { mergedCtx = v; }
export function getSingleCtxBackup() { return singleCtxBackup; }
export function setSingleCtxBackup(v) { singleCtxBackup = v; }

// === Pure Logic ===

/** Detect AWS region from a parsed rlCtx by looking at the first subnet's AZ. */
export function detectRegionFromCtx(ctx) {
  if (!ctx) return 'unknown';
  const sub = (ctx.subnets || [])[0];
  if (sub && sub.AvailabilityZone) return sub.AvailabilityZone.replace(/[a-z]$/, '');
  return 'unknown';
}

/**
 * Build an rlCtx directly from a {id: value} textarea map without DOM round-trip.
 * Values can be strings (web) or pre-parsed objects (Electron).
 * @param {Object} textareas - {textareaId: jsonString|object}
 * @param {string} accountLabel
 * @returns {Object|null} rlCtx
 */
export function buildRlCtxFromData(textareas, accountLabel) {
  try {
    function _val(id) {
      const v = textareas[id]; if (!v) return null;
      if (typeof v === 'string') { const p = safeParse(v); if (p !== null) textareas[id] = p; return p; }
      return v;
    }
    const userAccount = accountLabel || '';
    let vpcs = ext(_val('in_vpcs'), ['Vpcs']);
    let subnets = ext(_val('in_subnets'), ['Subnets']);
    let rts = ext(_val('in_rts'), ['RouteTables']);
    let sgs = ext(_val('in_sgs'), ['SecurityGroups']);
    let nacls = ext(_val('in_nacls'), ['NetworkAcls']);
    let enis = ext(_val('in_enis'), ['NetworkInterfaces']);
    let igwRaw = ext(_val('in_igws'), ['InternetGateways']);
    let natRaw = ext(_val('in_nats'), ['NatGateways']);
    let vpceRaw = ext(_val('in_vpces'), ['VpcEndpoints', 'Endpoints']);
    let instances = ext(_val('in_ec2'), ['Reservations']).flatMap(r => r.Instances || [r]);
    let albs = ext(_val('in_albs'), ['LoadBalancers']);
    let tgs = ext(_val('in_tgs'), ['TargetGroups']);
    let peerings = ext(_val('in_peer'), ['VpcPeeringConnections']);
    let vpns = ext(_val('in_vpn'), ['VpnConnections']);
    let volumes = ext(_val('in_vols'), ['Volumes']);
    let snapshots = ext(_val('in_snaps'), ['Snapshots']);
    let rdsInstances = ext(_val('in_rds'), ['DBInstances']);
    let ecsServices = ext(_val('in_ecs'), ['services', 'Services']);
    let lambdaFns = ext(_val('in_lambda'), ['Functions']).filter(f => f.VpcConfig && f.VpcConfig.VpcId);
    let ecacheClusters = ext(_val('in_elasticache'), ['CacheClusters']);
    let redshiftClusters = ext(_val('in_redshift'), ['Clusters']);
    let s3raw = _val('in_s3'); let s3bk = s3raw ? ext(s3raw, ['Buckets']) : [];
    let zones = ext(_val('in_r53'), ['HostedZones']);
    let wafAcls = ext(_val('in_waf'), ['WebACLs']);
    let cfDistributions = []; const cfRaw = _val('in_cf');
    if (cfRaw) { const dl = cfRaw.DistributionList || cfRaw; cfDistributions = dl.Items || dl.Distributions || []; }
    let tgwAttRaw = ext(_val('in_tgwatt'), ['TransitGatewayAttachments']);

    function tagResource(r) {
      if (!r) return r;
      r._accountId = _detectAccountId(r) || userAccount || 'default';
      r._region = _detectRegion(r) || 'unknown';
      return r;
    }
    [vpcs, subnets, igwRaw, natRaw, sgs, instances, albs, rdsInstances, ecsServices, lambdaFns,
      peerings, volumes, snapshots, enis, ecacheClusters, redshiftClusters,
      nacls, rts, vpceRaw, vpns, s3bk, zones, wafAcls, cfDistributions, tgs].forEach(arr => arr.forEach(tagResource));

    // VPC region fallback from subnet AZs
    const vpcRegion = {};
    subnets.forEach(s => { if (s.VpcId && s._region && s._region !== 'unknown') vpcRegion[s.VpcId] = s._region; });
    function fillRegion(r) { if (r && r._region === 'unknown' && r.VpcId && vpcRegion[r.VpcId]) r._region = vpcRegion[r.VpcId]; }
    [vpcs, sgs, nacls, rts, vpceRaw, igwRaw, natRaw, enis, ecacheClusters, redshiftClusters].forEach(arr => arr.forEach(fillRegion));
    igwRaw.forEach(g => { if (g._region === 'unknown') { const att = (g.Attachments || [])[0]; if (att && att.VpcId && vpcRegion[att.VpcId]) g._region = vpcRegion[att.VpcId]; } });
    const subVpcLookup = {}; subnets.forEach(s => { if (s.SubnetId) subVpcLookup[s.SubnetId] = s.VpcId || ''; });
    ecsServices.forEach(svc => { if (svc._region === 'unknown') { const nc = svc.networkConfiguration && svc.networkConfiguration.awsvpcConfiguration; const sid = nc && nc.subnets && nc.subnets[0]; if (sid) { const vid = subVpcLookup[sid]; if (vid && vpcRegion[vid]) svc._region = vpcRegion[vid]; } } });
    vpns.forEach(v => { if (v._region === 'unknown') { const vgw = v.VpnGatewayId; if (vgw) vpcs.forEach(vpc => { if (vpc._region && vpc._region !== 'unknown') { (vpc.VpnGateways || []).forEach(g => { if (g.VpnGatewayId === vgw) v._region = vpc._region; }); } }); } });
    peerings.forEach(p => { if (p._region === 'unknown') { const rv = p.RequesterVpcInfo && p.RequesterVpcInfo.VpcId; const av = p.AccepterVpcInfo && p.AccepterVpcInfo.VpcId; if (rv && vpcRegion[rv]) p._region = vpcRegion[rv]; else if (av && vpcRegion[av]) p._region = vpcRegion[av]; } });
    const volRegion = {}; volumes.forEach(v => { if (v.VolumeId && v._region && v._region !== 'unknown') volRegion[v.VolumeId] = v._region; });
    snapshots.forEach(s => { if (s._region === 'unknown' && s.VolumeId && volRegion[s.VolumeId]) s._region = volRegion[s.VolumeId]; });
    const albArnRegion = {}; albs.forEach(a => { if (a.LoadBalancerArn && a._region && a._region !== 'unknown') albArnRegion[a.LoadBalancerArn] = a._region; });
    wafAcls.forEach(w => { if (w._region === 'unknown') { (w.ResourceArns || []).some(arn => { if (albArnRegion[arn]) { w._region = albArnRegion[arn]; return true; } }); } });
    zones.forEach(z => { if (z._region === 'unknown') z._region = 'global'; });
    cfDistributions.forEach(d => { if (d._region === 'unknown') d._region = 'global'; });
    const acctRegion = {};
    [vpcs, subnets, instances].forEach(arr => { arr.forEach(r => { if (r._accountId && r._region && r._region !== 'unknown' && r._region !== 'global' && !acctRegion[r._accountId]) acctRegion[r._accountId] = r._region; }); });
    [vpcs, sgs, nacls, rts, igwRaw, natRaw, vpceRaw, enis, s3bk, snapshots, wafAcls, vpns, peerings, volumes, tgs, ecacheClusters, redshiftClusters, ecsServices, lambdaFns, albs, rdsInstances].forEach(arr => { arr.forEach(r => { if (r._region === 'unknown' && r._accountId && acctRegion[r._accountId]) r._region = acctRegion[r._accountId]; }); });

    const _accounts = new Set();
    vpcs.forEach(v => { if (v._accountId && v._accountId !== 'default') _accounts.add(v._accountId); });
    if (_accounts.size >= 1) { const _prAcct = [..._accounts][0]; [vpcs, subnets, sgs, nacls, rts, igwRaw, natRaw, vpceRaw, enis, instances, albs, rdsInstances, ecsServices, lambdaFns, peerings, ecacheClusters, redshiftClusters, volumes, snapshots, s3bk, tgs, wafAcls, vpns].forEach(arr => { arr.forEach(r => { if (r && r._accountId === 'default') r._accountId = _prAcct; }); }); }
    const _multiAccount = _accounts.size > 1;
    const _regions = new Set(); vpcs.forEach(v => { if (v._region && v._region !== 'unknown') _regions.add(v._region); });
    const _multiRegion = _regions.size > 1;

    const vpcIds = new Set(vpcs.map(v => v.VpcId));
    subnets = subnets.filter(s => vpcIds.has(s.VpcId));
    const pubSubs = new Set();
    rts.forEach(rt => { const hasIgw = rt.Routes && rt.Routes.some(r => r.GatewayId && r.GatewayId.startsWith('igw-') && r.State !== 'blackhole'); if (hasIgw)(rt.Associations || []).forEach(a => { if (a.SubnetId) pubSubs.add(a.SubnetId); }); });

    const igws = [], nats = [], vpces = [];
    igwRaw.forEach(g => { (g.Attachments || []).forEach(a => { if (vpcIds.has(a.VpcId)) igws.push(Object.assign({}, g, { _vpcId: a.VpcId })); }); });
    natRaw.forEach(g => { if (vpcIds.has(g.VpcId)) nats.push(g); });
    vpceRaw.forEach(g => { if (vpcIds.has(g.VpcId)) vpces.push(g); });

    const instBySub = new Map(), albBySub = new Map(), eniBySub = new Map();
    const rdsBySub = new Map(), ecsBySub = new Map(), lambdaBySub = new Map();
    instances.forEach(i => { const s = i.SubnetId; if (s) { if (!instBySub.has(s)) instBySub.set(s, []); instBySub.get(s).push(i); } });
    albs.forEach(a => { (a.AvailabilityZones || []).forEach(az => { const s = az.SubnetId; if (s) { if (!albBySub.has(s)) albBySub.set(s, []); albBySub.get(s).push(a); } }); });
    enis.forEach(e => { const s = e.SubnetId; if (s) { if (!eniBySub.has(s)) eniBySub.set(s, []); eniBySub.get(s).push(e); } });
    rdsInstances.forEach(d => { (d.DBSubnetGroup?.Subnets || []).forEach(s => { const sid2 = s.SubnetIdentifier; if (sid2) { if (!rdsBySub.has(sid2)) rdsBySub.set(sid2, []); rdsBySub.get(sid2).push(d); } }); });
    ecsServices.forEach(svc => { (svc.NetworkConfiguration?.awsvpcConfiguration?.Subnets || []).forEach(s => { if (!ecsBySub.has(s)) ecsBySub.set(s, []); ecsBySub.get(s).push(svc); }); });
    lambdaFns.forEach(f => { (f.VpcConfig?.SubnetIds || []).forEach(s => { if (!lambdaBySub.has(s)) lambdaBySub.set(s, []); lambdaBySub.get(s).push(f); }); });

    const subRT = new Map(), subNacl = new Map(), sgByVpc = new Map();
    rts.forEach(rt => { (rt.Associations || []).forEach(a => { if (a.SubnetId) subRT.set(a.SubnetId, rt); }); });
    nacls.forEach(n => { (n.Associations || []).forEach(a => { if (a.SubnetId) subNacl.set(a.SubnetId, n); }); });
    sgs.forEach(sg => { const v = sg.VpcId; if (v) { if (!sgByVpc.has(v)) sgByVpc.set(v, []); sgByVpc.get(v).push(sg); } });

    const volByInst = new Map(), snapByVol = new Map();
    volumes.forEach(v => { (v.Attachments || []).forEach(a => { if (a.InstanceId) { if (!volByInst.has(a.InstanceId)) volByInst.set(a.InstanceId, []); volByInst.get(a.InstanceId).push(v); } }); });
    snapshots.forEach(s => { const vid = s.VolumeId; if (vid) { if (!snapByVol.has(vid)) snapByVol.set(vid, []); snapByVol.get(vid).push(s); } });

    const ecacheByVpc = new Map(), redshiftByVpc = new Map();
    ecacheClusters.forEach(c => { const vid = c.VpcId || ''; if (vid) { if (!ecacheByVpc.has(vid)) ecacheByVpc.set(vid, []); ecacheByVpc.get(vid).push(c); } });
    redshiftClusters.forEach(c => { const v = c.VpcId; if (v) { if (!redshiftByVpc.has(v)) redshiftByVpc.set(v, []); redshiftByVpc.get(v).push(c); } });

    const tgwAttachments = [...tgwAttRaw];
    rts.forEach(rt => { (rt.Routes || []).forEach(r => { if (r.TransitGatewayId) { const vid = rt.VpcId || ((rt.Associations || [])[0] || {}).VpcId; tgwAttachments.push({ TransitGatewayId: r.TransitGatewayId, VpcId: vid, _accountId: rt._accountId || '', _region: rt._region || (vid && vpcRegion[vid]) || 'unknown' }); } }); });
    tgwAttRaw.forEach(t => { tagResource(t); fillRegion(t); });
    tgwAttachments.forEach(t => { if ((!t._region || t._region === 'unknown') && t._accountId && acctRegion[t._accountId]) t._region = acctRegion[t._accountId]; if (!t._region || t._region === 'unknown') { const vid = t.VpcId; if (vid && vpcRegion[vid]) t._region = vpcRegion[vid]; } });

    const wafByAlb = {}; wafAcls.forEach(acl => { (acl.ResourceArns || []).forEach(arn => { (wafByAlb[arn] = wafByAlb[arn] || []).push(acl); }); });
    const tgByAlb = {}; tgs.forEach(tg => { (tg.LoadBalancerArns || []).forEach(arn => { (tgByAlb[arn] = tgByAlb[arn] || []).push(tg); }); });
    const cfByAlb = {}; cfDistributions.forEach(d => { (d.Origins?.Items || []).forEach(o => { const matchAlb = albs.find(a => a.DNSName && o.DomainName && o.DomainName.includes(a.DNSName)); if (matchAlb)(cfByAlb[matchAlb.LoadBalancerArn] = cfByAlb[matchAlb.LoadBalancerArn] || []).push(d); }); });
    const recsByZone = {};
    const allRecSets = ext(_val('in_r53records'), ['ResourceRecordSets', 'RecordSets']);
    allRecSets.forEach(r => { if (r.HostedZoneId)(recsByZone[r.HostedZoneId] = recsByZone[r.HostedZoneId] || []).push(r); });

    function m2o(m) { const o = {}; m.forEach((v, k) => { o[k] = v; }); return o; }
    return {
      vpcs, subnets, pubSubs, rts, sgs, nacls, enis, igws, nats, vpces, instances, albs, tgs, peerings, vpns, volumes, snapshots,
      s3bk, zones, wafAcls, wafByAlb, tgByAlb, cfByAlb,
      rdsInstances, ecsServices, lambdaFns, ecacheClusters, redshiftClusters, cfDistributions,
      instBySub: m2o(instBySub), albBySub: m2o(albBySub), eniBySub: m2o(eniBySub), rdsBySub: m2o(rdsBySub), ecsBySub: m2o(ecsBySub), lambdaBySub: m2o(lambdaBySub),
      subRT: m2o(subRT), subNacl: m2o(subNacl), sgByVpc: m2o(sgByVpc), volByInst: m2o(volByInst), snapByVol: m2o(snapByVol), ecacheByVpc: m2o(ecacheByVpc), redshiftByVpc: m2o(redshiftByVpc),
      tgwAttachments, recsByZone, _multiAccount, _accounts, _regions, _multiRegion
    };
  } catch (e) {
    console.warn('buildRlCtxFromData error:', e);
    return null;
  }
}

/**
 * Merge multiple account contexts into a single rlCtx.
 * @param {Array} contexts - array of {accountId, rlCtx, textareas, visible, color, ...}
 * @returns {Object|null} merged rlCtx
 */
export function mergeContexts(contexts) {
  const visible = contexts.filter(c => c.visible);
  if (!visible.length) return null;
  // Lazily rebuild rlCtx from textareas if previously released
  visible.forEach(c => { if (!c.rlCtx && c.textareas) c.rlCtx = buildRlCtxFromData(c.textareas, c.accountLabel); });
  if (visible.length === 1) return visible[0].rlCtx;

  const merged = {
    vpcs: [], subnets: [], pubSubs: new Set(), rts: [], sgs: [], nacls: [], enis: [],
    igws: [], nats: [], vpces: [], instances: [], albs: [], tgs: [], peerings: [], vpns: [],
    volumes: [], snapshots: [], s3bk: [], zones: [], wafAcls: [],
    wafByAlb: {}, tgByAlb: {}, cfByAlb: {},
    rdsInstances: [], ecsServices: [], lambdaFns: [], ecacheClusters: [], redshiftClusters: [],
    cfDistributions: [],
    instBySub: {}, albBySub: {}, eniBySub: {},
    rdsBySub: {}, ecsBySub: {}, lambdaBySub: {},
    subRT: {}, subNacl: {}, sgByVpc: {},
    volByInst: {}, snapByVol: {}, ecacheByVpc: {}, redshiftByVpc: {},
    tgwAttachments: [], recsByZone: {}, _multiAccount: true, _accounts: new Set(), _regions: new Set(), _multiRegion: false
  };

  visible.forEach(ctx => {
    const c = ctx.rlCtx; if (!c) return;
    const tag = (r) => { if (r) { r._accountId = r._accountId || ctx.accountId; r._accountLabel = ctx.accountLabel; r._ctxColor = ctx.color; } return r; };

    const arrayKeys = ['vpcs', 'subnets', 'rts', 'sgs', 'nacls', 'enis', 'igws', 'nats', 'vpces',
      'instances', 'albs', 'tgs', 'peerings', 'vpns', 'volumes', 'snapshots', 's3bk', 'zones', 'wafAcls',
      'rdsInstances', 'ecsServices', 'lambdaFns', 'ecacheClusters', 'redshiftClusters', 'cfDistributions', 'tgwAttachments'];
    arrayKeys.forEach(k => {
      if (c[k] && Array.isArray(c[k])) c[k].forEach(r => { tag(r); merged[k].push(r); });
    });

    if (c.pubSubs) c.pubSubs.forEach(s => merged.pubSubs.add(s));
    if (c._accounts) c._accounts.forEach(a => merged._accounts.add(a));
    merged._accounts.add(ctx.accountId);
    if (c._regions) c._regions.forEach(r => merged._regions.add(r));
    if (ctx._isRegion && ctx.region) merged._regions.add(ctx.region);

    const mapKeys = ['instBySub', 'albBySub', 'eniBySub', 'rdsBySub', 'ecsBySub', 'lambdaBySub',
      'subRT', 'subNacl', 'sgByVpc', 'volByInst', 'snapByVol', 'ecacheByVpc', 'redshiftByVpc',
      'wafByAlb', 'tgByAlb', 'cfByAlb', 'recsByZone'];
    mapKeys.forEach(k => {
      if (!c[k]) return;
      const src = c[k];
      const keys = src instanceof Map ? [...src.keys()] : Object.keys(src);
      keys.forEach(key => {
        const val = src instanceof Map ? src.get(key) : src[key];
        if (Array.isArray(val)) {
          if (!merged[k][key]) merged[k][key] = [];
          val.forEach(v => merged[k][key].push(v));
        } else {
          if (!merged[k][key]) merged[k][key] = val;
        }
      });
    });
  });

  merged._multiRegion = merged._regions.size > 1;
  return merged;
}

// Backward-compat aliases
export {
  multiViewMode as _multiViewMode,
  loadedContexts as _loadedContexts,
  mergedCtx as _mergedCtx,
  singleCtxBackup as _singleCtxBackup
};
