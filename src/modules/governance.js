// Governance & Inventory - state and pure logic
// DOM rendering functions (_renderClassificationTab, _renderIAMTab, _openRulesEditor)
// live in app-core.js due to dual-state and unified dashboard coupling.

import { rlCtx } from './state.js';
import { esc, gn, safeParse } from './utils.js';
import { _stmtArr, _safePolicyParse, parseIAMData } from './iam-engine.js';
import { escHtml } from './timeline.js';

// === Module State ===
let _govDashState = { tab: 'classification', filter: 'all', search: '', sort: 'tier', sortDir: 'asc', page: 1, perPage: 50 };
let _iamDashState = { filter: 'all', search: '', sort: 'name', sortDir: 'asc', page: 1, perPage: 50 };
let _classificationData = [];
let _classificationOverrides = {};
let _iamReviewData = [];
let _inventoryData = [];
let _invState = { typeFilter: 'all', regionFilter: 'all', accountFilter: 'all', vpcFilter: 'all', viewMode: 'flat', search: '', sort: 'type', sortDir: 'asc', page: 1, perPage: 50 };
let _appRegistry = [];
let _appAutoDiscovered = false;
let _appSummaryState = { search: '', sort: 'tier', sortDir: 'asc', adding: false, editing: -1 };
const _APP_TYPE_SUGGESTIONS = ['Web App', 'Database', 'Monitoring', 'CI/CD', 'Security', 'Analytics', 'Storage', 'Infrastructure'];
let _invToolbarRendered = false;

const _INV_TYPE_COLORS = {
  'VPC': '#7C3AED', 'Subnet': '#6366f1', 'EC2': '#f97316', 'RDS': '#22d3ee',
  'Lambda': '#f59e0b', 'ECS': '#10b981', 'ALB': '#ec4899', 'ElastiCache': '#8b5cf6',
  'Redshift': '#06b6d4', 'SG': '#64748b', 'NACL': '#64748b', 'Route Table': '#64748b',
  'IGW': '#34d399', 'NAT GW': '#34d399', 'VPC Endpoint': '#34d399', 'ENI': '#94a3b8',
  'EBS Volume': '#fb923c', 'Snapshot': '#a78bfa', 'S3 Bucket': '#f472b6',
  'Route 53': '#38bdf8', 'WAF': '#fbbf24', 'CloudFront': '#818cf8',
  'VPC Peering': '#c084fc', 'VPN': '#2dd4bf', 'TGW Attachment': '#67e8f9',
  'Target Group': '#f9a8d4'
};

const _INV_NO_MAP_TYPES = { 'S3 Bucket': 1, 'Route 53': 1, 'WAF': 1, 'CloudFront': 1, 'Snapshot': 1, 'TGW Attachment': 1, 'Target Group': 1 };

let _invFilterCache = null;
let _invFilterKey = '';

const _DEFAULT_CLASS_RULES = [
  { pattern: 'prod|production', scope: 'vpc', tier: 'critical', weight: 100 },
  { pattern: 'pci|complian', scope: 'vpc', tier: 'critical', weight: 95 },
  { pattern: 'dr-|disaster|recovery', scope: 'vpc', tier: 'critical', weight: 90 },
  { pattern: 'shared.?serv|data.?platform|security', scope: 'vpc', tier: 'high', weight: 80 },
  { pattern: 'edge|proxy|waf|cdn', scope: 'vpc', tier: 'high', weight: 75 },
  { pattern: 'staging|stage|qa|uat', scope: 'vpc', tier: 'medium', weight: 50 },
  { pattern: 'management|mgmt|monitor', scope: 'vpc', tier: 'medium', weight: 45 },
  { pattern: 'dev|develop|sandbox|test|experiment', scope: 'vpc', tier: 'low', weight: 20 },
  { pattern: 'rds|database|db|aurora|dynamo', scope: 'type', tier: 'critical', weight: 90 },
  { pattern: 'redshift|warehouse', scope: 'type', tier: 'critical', weight: 85 },
  { pattern: 'elasticache|redis|memcache|cache', scope: 'type', tier: 'high', weight: 70 },
  { pattern: 'alb|elb|loadbalancer|nlb', scope: 'type', tier: 'high', weight: 65 },
  { pattern: 'lambda|fargate|ecs', scope: 'type', tier: 'medium', weight: 40 },
  { pattern: 'bastion|jump|ssh', scope: 'name', tier: 'medium', weight: 35 },
  // Tag-based rules - Environment tag is strongest classification signal
  { pattern: 'prod|production|prd', scope: 'tag:Environment', tier: 'critical', weight: 120 },
  { pattern: 'staging|stage|uat|qa', scope: 'tag:Environment', tier: 'medium', weight: 110 },
  { pattern: 'dev|develop|sandbox|test', scope: 'tag:Environment', tier: 'low', weight: 110 }
];
let _classificationRules = structuredClone(_DEFAULT_CLASS_RULES);
let _discoveredTags = {};

const _TIER_RPO_RTO = {
  critical: { rpo: 'Hourly', rto: '2-4 hours', priority: 1, color: '#ef4444' },
  high: { rpo: '6 hours', rto: '4-8 hours', priority: 2, color: '#f59e0b' },
  medium: { rpo: 'Daily', rto: '12 hours', priority: 3, color: '#22d3ee' },
  low: { rpo: 'Weekly', rto: '24 hours', priority: 4, color: '#64748b' }
};

// === State Accessors ===
export function getGovDashState() { return _govDashState; }
export function setGovDashState(v) { _govDashState = v; }
export function getIamDashState() { return _iamDashState; }
export function setIamDashState(v) { _iamDashState = v; }
export function getClassificationData() { return _classificationData; }
export function setClassificationData(v) { _classificationData = v; }
export function getClassificationOverrides() { return _classificationOverrides; }
export function setClassificationOverrides(v) { _classificationOverrides = v; }
export function getIamReviewData() { return _iamReviewData; }
export function setIamReviewData(v) { _iamReviewData = v; }
export function getInventoryData() { return _inventoryData; }
export function setInventoryData(v) { _inventoryData = v; }
export function getInvState() { return _invState; }
export function setInvState(v) { _invState = v; }
export function getAppRegistry() { return _appRegistry; }
export function setAppRegistry(v) { _appRegistry = v; }
export function getAppAutoDiscovered() { return _appAutoDiscovered; }
export function setAppAutoDiscovered(v) { _appAutoDiscovered = v; }
export function getAppSummaryState() { return _appSummaryState; }
export function setAppSummaryState(v) { _appSummaryState = v; }
export function getInvToolbarRendered() { return _invToolbarRendered; }
export function setInvToolbarRendered(v) { _invToolbarRendered = v; }
export function getInvFilterCache() { return _invFilterCache; }
export function setInvFilterCache(v) { _invFilterCache = v; }
export function getInvFilterKey() { return _invFilterKey; }
export function setInvFilterKey(v) { _invFilterKey = v; }
export function getClassificationRules() { return _classificationRules; }
export function setClassificationRules(v) { _classificationRules = v; }
export function getDiscoveredTags() { return _discoveredTags; }
export function setDiscoveredTags(v) { _discoveredTags = v; }

// === Pure Logic ===

/**
 * Build inventory data rows from the resource context.
 * Populates _inventoryData with enriched resource rows.
 */
const _buildInventoryDataSync = _buildInventoryData; // alias for callers that need sync path
function _buildInventoryData() {
  _inventoryData = [];
  const ctx = rlCtx; if (!ctx) return;
  const rows = [];
  const vpcNameMap = {};
  (ctx.vpcs || []).forEach(function(v) { vpcNameMap[v.VpcId] = gn(v, v.VpcId); });
  function tag(obj) { const t = (obj.Tags || obj.tags || []).find(function(x) { return x.Key === 'Name'; }); return t ? t.Value : ''; }
  function tags(obj) { const m = {}; (obj.Tags || obj.tags || []).forEach(function(t) { m[t.Key] = t.Value; }); return m; }
  function mkRow(id, type, name, obj, extra) {
    return { id: id, type: type, name: name,
      account: obj._accountLabel || obj._accountId || '', region: obj._region || '',
      vpcId: extra.vpcId || '', vpcName: extra.vpcId ? vpcNameMap[extra.vpcId] || '' : '',
      subnetId: extra.subnetId || '', az: extra.az || '',
      state: extra.state || '', config: extra.config || '', tags: tags(obj),
      encrypted: extra.encrypted != null ? extra.encrypted : null, sgCount: extra.sgCount || 0,
      classificationTier: null, budrTier: null, budrStrategy: null, rto: null, rpo: null,
      compliancePass: 0, complianceFail: 0,
      _raw: obj, _related: extra.related || [] };
  }
  // Shared lookups: subnet->VPC, instance->VPC
  const subVpcMap = {}; (ctx.subnets || []).forEach(function(s) { if (s.SubnetId) subVpcMap[s.SubnetId] = s.VpcId || ''; });
  const instVpcMap = {}; (ctx.instances || []).forEach(function(i) { if (i.InstanceId) instVpcMap[i.InstanceId] = i.VpcId || subVpcMap[i.SubnetId] || ''; });
  // 1. VPCs
  (ctx.vpcs || []).forEach(function(v) {
    rows.push(mkRow(v.VpcId, 'VPC', tag(v) || v.VpcId, v, { vpcId: v.VpcId, config: v.CidrBlock || '', state: v.State || '' }));
  });
  // 2. Subnets
  (ctx.subnets || []).forEach(function(s) {
    const isPub = ctx.pubSubs && ctx.pubSubs.has(s.SubnetId);
    rows.push(mkRow(s.SubnetId, 'Subnet', tag(s) || s.SubnetId, s, { vpcId: s.VpcId, az: s.AvailabilityZone || '', config: (s.CidrBlock || '') + ' ' + (isPub ? 'public' : 'private'), state: s.State || '' }));
  });
  // 3. EC2
  (ctx.instances || []).forEach(function(i) {
    const sgs = (i.SecurityGroups || []).map(function(g) { return g.GroupId; });
    rows.push(mkRow(i.InstanceId, 'EC2', tag(i) || i.InstanceId, i, { vpcId: i.VpcId || subVpcMap[i.SubnetId] || '', subnetId: i.SubnetId || '', az: i.Placement ? i.Placement.AvailabilityZone : '', config: i.InstanceType || '', state: i.State ? i.State.Name || '' : '', sgCount: sgs.length, related: sgs }));
  });
  // 4. RDS
  (ctx.rdsInstances || []).forEach(function(db) {
    let vpcId = (db.DBSubnetGroup && db.DBSubnetGroup.VpcId) || '';
    rows.push(mkRow(db.DBInstanceIdentifier, 'RDS', db.DBInstanceIdentifier, db, { vpcId: vpcId, az: db.AvailabilityZone || '', config: (db.Engine || '') + ' ' + (db.DBInstanceClass || ''), state: db.DBInstanceStatus || '', encrypted: !!db.StorageEncrypted }));
  });
  // 5. Lambda
  (ctx.lambdaFns || []).forEach(function(fn) {
    const vc = fn.VpcConfig || {};
    let vpcId = vc.VpcId || '';
    const subId = (vc.SubnetIds && vc.SubnetIds[0]) || '';
    rows.push(mkRow(fn.FunctionName, 'Lambda', fn.FunctionName, fn, { vpcId: vpcId, subnetId: subId, config: (fn.Runtime || '') + (fn.MemorySize ? ' ' + fn.MemorySize + 'MB' : ''), state: fn.State || 'Active' }));
  });
  // 6. ECS
  (ctx.ecsServices || []).forEach(function(svc) {
    const nc = svc.networkConfiguration && svc.networkConfiguration.awsvpcConfiguration;
    const subId = nc && nc.subnets && nc.subnets[0] ? nc.subnets[0] : '';
    let vpcId = '';
    if (subId) { const subObj = (ctx.subnets || []).find(function(s) { return s.SubnetId === subId; }); if (subObj) vpcId = subObj.VpcId || ''; }
    const cpu = svc.cpu || ''; let mem = svc.memory || '';
    rows.push(mkRow(svc.serviceName, 'ECS', svc.serviceName, svc, { vpcId: vpcId, subnetId: subId, config: (svc.launchType || '') + ' ' + (cpu ? cpu + '/' : '') + (mem || ''), state: svc.status || '' }));
  });
  // 7. ALB
  (ctx.albs || []).forEach(function(a) {
    rows.push(mkRow(a.LoadBalancerName, 'ALB', a.LoadBalancerName, a, { vpcId: a.VpcId || '', config: (a.Type || 'application') + ' ' + (a.Scheme || ''), state: a.State ? a.State.Code || '' : '' }));
  });
  // 8. ElastiCache
  (ctx.ecacheClusters || []).forEach(function(ec) {
    let vpcId = ec.VpcId || (ec.CacheSubnetGroupName ? '' : '');
    if (!vpcId && ec.CacheNodes && ec.CacheNodes[0]) { const cn = ec.CacheNodes[0]; if (cn.SubnetId) vpcId = subVpcMap[cn.SubnetId] || ''; }
    rows.push(mkRow(ec.CacheClusterId, 'ElastiCache', ec.CacheClusterId, ec, { vpcId: vpcId, config: (ec.Engine || '') + ' ' + (ec.CacheNodeType || ''), state: ec.CacheClusterStatus || '' }));
  });
  // 9. Redshift
  (ctx.redshiftClusters || []).forEach(function(rs) {
    rows.push(mkRow(rs.ClusterIdentifier, 'Redshift', rs.ClusterIdentifier, rs, { vpcId: rs.VpcId || '', config: (rs.NodeType || '') + ' x' + (rs.NumberOfNodes || 1), state: rs.ClusterStatus || '', encrypted: !!rs.Encrypted }));
  });
  // 10. Security Groups
  (ctx.sgs || []).forEach(function(sg) {
    const inCt = (sg.IpPermissions || []).length; let outCt = (sg.IpPermissionsEgress || []).length;
    rows.push(mkRow(sg.GroupId, 'SG', sg.GroupName || sg.GroupId, sg, { vpcId: sg.VpcId || '', config: inCt + ' inbound / ' + outCt + ' outbound' }));
  });
  // 11. NACLs
  (ctx.nacls || []).forEach(function(n) {
    const ct = (n.Entries || []).length;
    rows.push(mkRow(n.NetworkAclId, 'NACL', tag(n) || n.NetworkAclId, n, { vpcId: n.VpcId || '', config: ct + ' entries' }));
  });
  // 12. Route Tables
  (ctx.rts || []).forEach(function(rt) {
    const ct = (rt.Routes || []).length;
    rows.push(mkRow(rt.RouteTableId, 'Route Table', tag(rt) || rt.RouteTableId, rt, { vpcId: rt.VpcId || '', config: ct + ' routes' }));
  });
  // 13. IGWs
  (ctx.igws || []).forEach(function(g) {
    const att = (g.Attachments || []); let attachedVpc = att.length ? att[0].VpcId : '';
    rows.push(mkRow(g.InternetGatewayId, 'IGW', tag(g) || g.InternetGatewayId, g, { vpcId: attachedVpc, config: attachedVpc ? 'attached: ' + attachedVpc : 'detached' }));
  });
  // 14. NAT Gateways
  (ctx.nats || []).forEach(function(n) {
    rows.push(mkRow(n.NatGatewayId, 'NAT GW', tag(n) || n.NatGatewayId, n, { vpcId: n.VpcId || '', subnetId: n.SubnetId || '', config: (n.SubnetId || '') + ' ' + (n.State || ''), state: n.State || '' }));
  });
  // 15. VPC Endpoints
  (ctx.vpces || []).forEach(function(e) {
    rows.push(mkRow(e.VpcEndpointId, 'VPC Endpoint', tag(e) || e.VpcEndpointId, e, { vpcId: e.VpcId || '', config: e.ServiceName || '', state: e.State || '' }));
  });
  // 16. ENIs
  (ctx.enis || []).forEach(function(e) {
    rows.push(mkRow(e.NetworkInterfaceId, 'ENI', e.Description || e.NetworkInterfaceId, e, { vpcId: e.VpcId || '', subnetId: e.SubnetId || '', az: e.AvailabilityZone || '', config: e.PrivateIpAddress || '', state: e.Status || '' }));
  });
  // 17. EBS Volumes
  (ctx.volumes || []).forEach(function(vol) {
    const attInsts = (vol.Attachments || []).map(function(a) { return a.InstanceId; }).filter(Boolean);
    let vpcId = ''; if (attInsts.length) vpcId = instVpcMap[attInsts[0]] || '';
    rows.push(mkRow(vol.VolumeId, 'EBS Volume', tag(vol) || vol.VolumeId, vol, { vpcId: vpcId, az: vol.AvailabilityZone || '', config: vol.Size + 'GB ' + (vol.VolumeType || ''), state: vol.State || '', encrypted: !!vol.Encrypted, related: attInsts }));
  });
  // 18. Snapshots
  (ctx.snapshots || []).forEach(function(snap) {
    rows.push(mkRow(snap.SnapshotId, 'Snapshot', snap.Description || snap.SnapshotId, snap, { config: (snap.VolumeSize || '') + 'GB', state: snap.State || '', encrypted: !!snap.Encrypted }));
  });
  // 19. S3 Buckets
  (ctx.s3bk || []).forEach(function(b) {
    rows.push(mkRow(b.Name, 'S3 Bucket', b.Name, b, { config: b.CreationDate || '' }));
  });
  // 20. Route 53 Zones
  (ctx.zones || []).forEach(function(z) {
    const recs = ctx.recsByZone && ctx.recsByZone[z.Id] ? ctx.recsByZone[z.Id].length : z.ResourceRecordSetCount || 0;
    const vis = z.Config && z.Config.PrivateZone ? 'private' : 'public';
    rows.push(mkRow(z.Id, 'Route 53', z.Name || z.Id, z, { config: recs + ' records ' + vis }));
  });
  // 21. WAF ACLs
  (ctx.wafAcls || []).forEach(function(w) {
    const ruleCount = (w.Rules || []).length;
    rows.push(mkRow(w.Id || w.Name, 'WAF', w.Name || w.Id || '', w, { config: ruleCount + ' rules' }));
  });
  // 22. CloudFront
  (ctx.cfDistributions || []).forEach(function(cf) {
    rows.push(mkRow(cf.Id, 'CloudFront', cf.DomainName || cf.Id, cf, { config: cf.Status || '', state: cf.Status || '' }));
  });
  // 23. VPC Peering
  (ctx.peerings || []).forEach(function(p) {
    const req = p.RequesterVpcInfo ? p.RequesterVpcInfo.VpcId : ''; let acc = p.AccepterVpcInfo ? p.AccepterVpcInfo.VpcId : '';
    rows.push(mkRow(p.VpcPeeringConnectionId, 'VPC Peering', tag(p) || p.VpcPeeringConnectionId, p, { config: req + '\u2194' + acc, state: p.Status ? p.Status.Code || '' : '' }));
  });
  // 24. VPN
  (ctx.vpns || []).forEach(function(v) {
    rows.push(mkRow(v.VpnConnectionId, 'VPN', tag(v) || v.VpnConnectionId, v, { config: (v.State || '') + ' ' + (v.Type || ''), state: v.State || '' }));
  });
  // 25. TGW Attachments
  (ctx.tgwAttachments || []).forEach(function(t) {
    const tid = t.TransitGatewayAttachmentId || (t.TransitGatewayId + '-' + (t.VpcId || ''));
    rows.push(mkRow(tid, 'TGW Attachment', tag(t) || tid, t, { vpcId: t.VpcId || '', config: (t.ResourceType || '') + ' ' + (t.TransitGatewayId || ''), state: t.State || '' }));
  });
  // 26. Target Groups
  (ctx.tgs || []).forEach(function(tg) {
    rows.push(mkRow(tg.TargetGroupName, 'Target Group', tg.TargetGroupName, tg, { vpcId: tg.VpcId || '', config: (tg.Protocol || '') + ':' + (tg.Port || ''), state: tg.TargetType || '' }));
  });
  // === Enrichment pass ===
  // 1. Classification tier lookup
  const classMap = {};
  (_classificationData || []).forEach(function(c) { classMap[c.id] = c; });
  // 2. BUDR assessment lookup - use window bridge for cross-region data
  const budrAssessments = (typeof window !== 'undefined' && window._budrAssessments) || [];
  const budrMap = {};
  (budrAssessments || []).forEach(function(a) {
    budrMap[a.id] = { tier: a.profile ? a.profile.tier : null, strategy: a.profile ? a.profile.strategy : null, rto: a.profile ? a.profile.rto : null, rpo: a.profile ? a.profile.rpo : null };
  });
  // 3. Compliance findings lookup (count per resource) — read the window bridge.
  //    state.js complianceFindings is never populated (setComplianceFindings is
  //    unused); compliance-engine writes window._complianceFindings.
  const compFindings = (typeof window !== 'undefined' && window._complianceFindings) || [];
  const compMap = {};
  (compFindings || []).forEach(function(f) {
    if (!f.resource) return;
    if (!compMap[f.resource]) compMap[f.resource] = { pass: 0, fail: 0 };
    if (f.status === 'PASS') compMap[f.resource].pass++;
    else compMap[f.resource].fail++;
  });
  // 4. Apply enrichment to all rows
  rows.forEach(function(r) {
    const cls = classMap[r.id];
    if (cls) r.classificationTier = cls.tier;
    const budr = budrMap[r.id];
    if (budr) { r.budrTier = budr.tier; r.budrStrategy = budr.strategy; r.rto = budr.rto; r.rpo = budr.rpo; }
    const comp = compMap[r.id];
    if (comp) { r.compliancePass = comp.pass; r.complianceFail = comp.fail; }
  });
  _inventoryData = rows;
}

/**
 * Filter and sort inventory items based on current _invState.
 * Uses _udashFilterByAccount from window bridge for account filtering.
 * @returns {Object[]} filtered/sorted inventory rows
 */
function _filterInventory() {
  let st = _invState;
  // _udashFilterByAccount is a global UI function - access via window bridge
  const filterFn = (typeof window !== 'undefined' && window._udashFilterByAccount) || function(x) { return x; };
  let items = filterFn(_inventoryData).slice();
  if (st.typeFilter !== 'all') items = items.filter(function(r) { return r.type === st.typeFilter; });
  if (st.regionFilter !== 'all') items = items.filter(function(r) { return r.region === st.regionFilter; });
  if (st.accountFilter !== 'all') items = items.filter(function(r) { return r.account === st.accountFilter; });
  if (st.vpcFilter !== 'all') items = items.filter(function(r) { return r.vpcId === st.vpcFilter; });
  if (st.search) {
    const q = st.search.toLowerCase();
    items = items.filter(function(r) {
      return (r.name || '').toLowerCase().indexOf(q) !== -1
        || (r.id || '').toLowerCase().indexOf(q) !== -1
        || (r.type || '').toLowerCase().indexOf(q) !== -1
        || (r.config || '').toLowerCase().indexOf(q) !== -1
        || (r.vpcName || '').toLowerCase().indexOf(q) !== -1
        || (r.region || '').toLowerCase().indexOf(q) !== -1
        || JSON.stringify(r.tags || {}).toLowerCase().indexOf(q) !== -1;
    });
  }
  const sortKey = st.sort; let dir = st.sortDir === 'asc' ? 1 : -1;
  items.sort(function(a, b) {
    if (sortKey === 'complianceFail') { return ((a.complianceFail || 0) - (b.complianceFail || 0)) * dir; }
    if (sortKey === 'tags') { return (Object.keys(a.tags || {}).length - Object.keys(b.tags || {}).length) * dir; }
    const av = (a[sortKey] || '').toString().toLowerCase();
    const bv = (b[sortKey] || '').toString().toLowerCase();
    return av < bv ? -dir : av > bv ? dir : 0;
  });
  return items;
}

/**
 * Extract tag map from an AWS resource object.
 * @param {Object} obj - AWS resource with Tags/tags/TagList property
 * @returns {Object} key-value map of tags
 */
function _getTagMap(obj) {
  const arr = obj.Tags || obj.tags || obj.TagList || [];
  const m = {}; arr.forEach(function(t) { if (t.Key) m[t.Key] = t.Value || ''; }); return m;
}

/**
 * Safely construct a RegExp, returning null on invalid patterns.
 * @param {string} pattern - regex pattern string
 * @returns {RegExp|null}
 */
function _safeRegex(pattern) {
  try {
    let re = new RegExp(pattern, 'i');
    if (/(\+|\*|\{)\s*\)(\+|\*|\{)/.test(pattern)) return null;
    return re;
  } catch (e) { return null; }
}

/**
 * Score a resource against classification rules.
 * @param {string} name - resource name
 * @param {string} type - resource type
 * @param {string} vpcName - VPC name for context
 * @param {Object[]} [rules] - classification rules (defaults to module rules)
 * @param {Object} [tagMap] - tag key-value map
 * @returns {{tier: string, weight: number}}
 */
function _scoreClassification(name, type, vpcName, rules, tagMap) {
  rules = rules || _classificationRules;
  tagMap = tagMap || {};
  let bestTier = 'low'; let bestWeight = -1;
  rules.forEach(function(rule) {
    if (rule.enabled === false) return;
    let p = rule.pattern; if (!p) return;
    p = p.replace(/^\|+|\|+$/g, '').replace(/\|{2,}/g, '|'); if (!p) return;
    let re = _safeRegex(p); if (!re) return;
    let text = '';
    if (rule.scope === 'any') text = (name || '') + ' ' + (type || '') + ' ' + (vpcName || '') + ' ' + Object.values(tagMap).join(' ');
    else if (rule.scope === 'vpc') text = vpcName || '';
    else if (rule.scope === 'type') text = type || '';
    else if (rule.scope === 'name') text = name || '';
    else if (rule.scope.indexOf('tag:') === 0) text = tagMap[rule.scope.substring(4)] || '';
    else text = (name || '') + ' ' + (type || '') + ' ' + (vpcName || '');
    if (re.test(text) && rule.weight > bestWeight) { bestWeight = rule.weight; bestTier = rule.tier; }
  });
  return { tier: bestTier, weight: bestWeight };
}

/**
 * Discover tag keys across all resource types in the context.
 * @param {Object} ctx - resource context
 * @returns {Object} tag key metadata (count, samples, types)
 */
function _discoverTagKeys(ctx) {
  if (!ctx) return {};
  const disc = {};
  function scan(arr, typeName) {
    (arr || []).forEach(function(obj) {
      const tagArr = obj.Tags || obj.tags || obj.TagList || [];
      tagArr.forEach(function(t) {
        if (!t.Key || t.Key.indexOf('aws:') === 0) return;
        if (!disc[t.Key]) disc[t.Key] = { count: 0, samples: [], types: {} };
        const d = disc[t.Key]; d.count++; d.types[typeName] = true;
        if (d.samples.length < 5 && t.Value && d.samples.indexOf(t.Value) < 0) d.samples.push(t.Value);
      });
    });
  }
  scan(ctx.instances, 'EC2'); scan(ctx.rdsInstances, 'RDS'); scan(ctx.ecacheClusters, 'ElastiCache');
  scan(ctx.albs, 'ALB'); scan(ctx.lambdaFns, 'Lambda'); scan(ctx.ecsServices, 'ECS');
  scan(ctx.redshiftClusters, 'Redshift'); scan(ctx.vpcs, 'VPC'); scan(ctx.subnets, 'Subnet');
  scan(ctx.sgs, 'SG'); scan(ctx.s3bk, 'S3');
  Object.keys(disc).forEach(function(k) { disc[k].types = Object.keys(disc[k].types); });
  return disc;
}

/**
 * Run the classification engine across all resources in context.
 * Populates _classificationData and _discoveredTags.
 * @param {Object} ctx - resource context
 * @returns {Object[]} classification results
 */
function runClassificationEngine(ctx) {
  if (!ctx) return [];
  const results = [];
  const vpcNameMap = {};
  (ctx.vpcs || []).forEach(function(v) { vpcNameMap[v.VpcId] = gn(v, v.VpcId); });
  // Build subnet->VPC lookup for resources that only have SubnetId
  const subnetVpcMap = {};
  (ctx.subnets || []).forEach(function(s) { if (s.VpcId) subnetVpcMap[s.SubnetId] = s.VpcId; });
  function resolveVpc(vpcId, subnetId) { return vpcId || subnetVpcMap[subnetId] || ''; }
  // Classify instances
  (ctx.instances || []).forEach(function(inst) {
    const name = inst.Tags ? ((inst.Tags.find(function(t) { return t.Key === 'Name'; }) || {}).Value || inst.InstanceId) : inst.InstanceId;
    let vpcId = resolveVpc(inst.VpcId, inst.SubnetId);
    const vpcName = vpcNameMap[vpcId] || '';
    const tm = _getTagMap(inst);
    const sc = _scoreClassification(name, 'instance', vpcName, null, tm);
    const tier = _classificationOverrides[inst.InstanceId] || sc.tier;
    const meta = _TIER_RPO_RTO[tier];
    results.push({ id: inst.InstanceId, name: name, type: 'EC2', tier: tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[inst.InstanceId], vpcId: vpcId, vpcName: vpcName, tags: tm });
  });
  // Classify RDS
  (ctx.rdsInstances || []).forEach(function(db) {
    const name = db.DBInstanceIdentifier;
    let vpcId = db.DBSubnetGroup ? db.DBSubnetGroup.VpcId : '';
    const vpcName = vpcNameMap[vpcId] || '';
    const tm = _getTagMap(db);
    const sc = _scoreClassification(name, 'rds', vpcName, null, tm);
    const tier = _classificationOverrides[name] || sc.tier;
    const meta = _TIER_RPO_RTO[tier];
    results.push({ id: name, name: name, type: 'RDS', tier: tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[name], vpcId: vpcId, vpcName: vpcName, tags: tm });
  });
  // Classify ElastiCache
  (ctx.ecacheClusters || []).forEach(function(ec) {
    const name = ec.CacheClusterId;
    let vpcId = ec.VpcId || '';
    const vpcName = vpcNameMap[vpcId] || '';
    const tm = _getTagMap(ec);
    const sc = _scoreClassification(name, 'elasticache', vpcName, null, tm);
    const tier = _classificationOverrides[name] || sc.tier;
    const meta = _TIER_RPO_RTO[tier];
    results.push({ id: name, name: name, type: 'ElastiCache', tier: tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[name], vpcId: vpcId, vpcName: vpcName, tags: tm });
  });
  // Classify ALBs
  (ctx.albs || []).forEach(function(alb) {
    const albId = alb.LoadBalancerArn ? alb.LoadBalancerArn.split('/').pop() : '';
    const name = alb.LoadBalancerName || albId;
    let vpcId = alb.VpcId || '';
    const vpcName = vpcNameMap[vpcId] || '';
    const tm = _getTagMap(alb);
    const sc = _scoreClassification(name, 'alb', vpcName, null, tm);
    const tier = _classificationOverrides[name] || sc.tier;
    const meta = _TIER_RPO_RTO[tier];
    results.push({ id: name, name: name, type: 'ALB', tier: tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[name], vpcId: vpcId, vpcName: vpcName, tags: tm });
  });
  // Classify Lambda
  (ctx.lambdaFns || []).forEach(function(fn) {
    const name = fn.FunctionName;
    let vpcId = fn.VpcConfig ? fn.VpcConfig.VpcId : '';
    if (!vpcId && fn.VpcConfig && fn.VpcConfig.SubnetIds && fn.VpcConfig.SubnetIds[0]) vpcId = subnetVpcMap[fn.VpcConfig.SubnetIds[0]] || '';
    const vpcName = vpcNameMap[vpcId] || '';
    const tm = _getTagMap(fn);
    const sc = _scoreClassification(name, 'lambda', vpcName, null, tm);
    const tier = _classificationOverrides[name] || sc.tier;
    const meta = _TIER_RPO_RTO[tier];
    results.push({ id: name, name: name, type: 'Lambda', tier: tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[name], vpcId: vpcId, vpcName: vpcName, tags: tm });
  });
  // Classify ECS
  (ctx.ecsServices || []).forEach(function(svc) {
    const name = svc.serviceName || '';
    const nc = svc.networkConfiguration && svc.networkConfiguration.awsvpcConfiguration;
    let vpcId = nc && nc.subnets && nc.subnets[0] ? subnetVpcMap[nc.subnets[0]] || '' : '';
    const vpcName = vpcNameMap[vpcId] || '';
    const tm = _getTagMap(svc);
    const sc = _scoreClassification(name, 'ecs', vpcName, null, tm);
    const tier = _classificationOverrides[name] || sc.tier;
    const meta = _TIER_RPO_RTO[tier];
    results.push({ id: name, name: name, type: 'ECS', tier: tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[name], vpcId: vpcId, vpcName: vpcName, tags: tm });
  });
  // Classify Redshift
  (ctx.redshiftClusters || []).forEach(function(rs) {
    const name = rs.ClusterIdentifier;
    let vpcId = rs.VpcId || '';
    const vpcName = vpcNameMap[vpcId] || '';
    const tm = _getTagMap(rs);
    const sc = _scoreClassification(name, 'redshift', vpcName, null, tm);
    const tier = _classificationOverrides[name] || sc.tier;
    const meta = _TIER_RPO_RTO[tier];
    results.push({ id: name, name: name, type: 'Redshift', tier: tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[name], vpcId: vpcId, vpcName: vpcName, tags: tm });
  });
  // Classify Security Groups
  (ctx.sgs || []).forEach(function(sg) {
    const id = sg.GroupId; let name = gn(sg, id);
    let vpcId = sg.VpcId || ''; let vpcName = vpcNameMap[vpcId] || ''; let tm = _getTagMap(sg);
    const sc = _scoreClassification(name, 'security-group', vpcName, null, tm);
    const tier = _classificationOverrides[id] || sc.tier; let meta = _TIER_RPO_RTO[tier];
    results.push({ id: id, name: name, type: 'Security Group', tier: tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[id], vpcId: vpcId, vpcName: vpcName, tags: tm });
  });
  // Classify VPCs
  (ctx.vpcs || []).forEach(function(v) {
    const id = v.VpcId; let name = gn(v, id); let tm = _getTagMap(v);
    const sc = _scoreClassification(name, 'vpc', name, null, tm);
    const tier = _classificationOverrides[id] || sc.tier; let meta = _TIER_RPO_RTO[tier];
    results.push({ id: id, name: name, type: 'VPC', tier: tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[id], vpcId: id, vpcName: name, tags: tm });
  });
  // Classify Subnets
  (ctx.subnets || []).forEach(function(s) {
    const id = s.SubnetId; let name = gn(s, id); let vpcId = s.VpcId || ''; let vpcName = vpcNameMap[vpcId] || ''; let tm = _getTagMap(s);
    const sc = _scoreClassification(name, 'subnet', vpcName, null, tm);
    const tier = _classificationOverrides[id] || sc.tier; let meta = _TIER_RPO_RTO[tier];
    results.push({ id: id, name: name, type: 'Subnet', tier: tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[id], vpcId: vpcId, vpcName: vpcName, tags: tm });
  });
  // Classify IGWs
  (ctx.igws || []).forEach(function(gw) {
    const id = gw.InternetGatewayId; let name = gn(gw, id); let vpcId = (gw.Attachments && gw.Attachments[0]) ? gw.Attachments[0].VpcId : ''; let vpcName = vpcNameMap[vpcId] || ''; let tm = _getTagMap(gw);
    const sc = _scoreClassification(name, 'igw', vpcName, null, tm);
    const tier = _classificationOverrides[id] || sc.tier; let meta = _TIER_RPO_RTO[tier];
    results.push({ id: id, name: name, type: 'IGW', tier: tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[id], vpcId: vpcId, vpcName: vpcName, tags: tm });
  });
  // Classify NAT GWs
  (ctx.nats || []).forEach(function(ng) {
    const id = ng.NatGatewayId; let name = gn(ng, id); let vpcId = ng.VpcId || ''; let vpcName = vpcNameMap[vpcId] || ''; let tm = _getTagMap(ng);
    const sc = _scoreClassification(name, 'nat-gateway', vpcName, null, tm);
    const tier = _classificationOverrides[id] || sc.tier; let meta = _TIER_RPO_RTO[tier];
    results.push({ id: id, name: name, type: 'NAT GW', tier: tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[id], vpcId: vpcId, vpcName: vpcName, tags: tm });
  });
  // Classify VPC Endpoints
  (ctx.vpces || []).forEach(function(ve) {
    const id = ve.VpcEndpointId; let name = ve.ServiceName || id; let vpcId = ve.VpcId || ''; let vpcName = vpcNameMap[vpcId] || ''; let tm = _getTagMap(ve);
    const sc = _scoreClassification(name, 'vpc-endpoint', vpcName, null, tm);
    const tier = _classificationOverrides[id] || sc.tier; let meta = _TIER_RPO_RTO[tier];
    results.push({ id: id, name: name, type: 'VPC Endpoint', tier: tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[id], vpcId: vpcId, vpcName: vpcName, tags: tm });
  });
  // Classify S3 Buckets
  (ctx.s3bk || []).forEach(function(b) {
    const name = b.Name || ''; let tm = _getTagMap(b);
    const sc = _scoreClassification(name, 's3', '', null, tm);
    const tier = _classificationOverrides[name] || sc.tier; let meta = _TIER_RPO_RTO[tier];
    results.push({ id: name, name: name, type: 'S3', tier: tier, rpo: meta.rpo, rto: meta.rto, auto: !_classificationOverrides[name], vpcId: '', vpcName: '', tags: tm });
  });
  // Enrich classification data with account IDs from source resources
  const _clResAcct = {};
  (ctx.instances || []).forEach(function(r) { _clResAcct[r.InstanceId] = r._accountId; });
  (ctx.rdsInstances || []).forEach(function(r) { _clResAcct[r.DBInstanceIdentifier] = r._accountId; });
  (ctx.ecacheClusters || []).forEach(function(r) { _clResAcct[r.CacheClusterId] = r._accountId; });
  (ctx.albs || []).forEach(function(r) { _clResAcct[r.LoadBalancerName || r.LoadBalancerArn] = r._accountId; });
  (ctx.lambdaFns || []).forEach(function(r) { _clResAcct[r.FunctionName] = r._accountId; });
  (ctx.ecsServices || []).forEach(function(r) { _clResAcct[r.serviceName || r.serviceArn] = r._accountId; });
  (ctx.sgs || []).forEach(function(r) { _clResAcct[r.GroupId] = r._accountId; });
  (ctx.vpcs || []).forEach(function(r) { _clResAcct[r.VpcId] = r._accountId; });
  (ctx.subnets || []).forEach(function(r) { _clResAcct[r.SubnetId] = r._accountId; });
  (ctx.s3bk || []).forEach(function(r) { _clResAcct[r.Name] = r._accountId; });
  results.forEach(function(r) { if (_clResAcct[r.id]) r._accountId = _clResAcct[r.id]; });
  _classificationData = results;
  _discoveredTags = _discoverTagKeys(ctx);
  return results;
}

/**
 * Prepare IAM review data from parsed IAM data.
 * Populates _iamReviewData with enriched principal rows.
 * @param {Object} iamData - parsed IAM data from parseIAMData()
 * @returns {Object[]} IAM review items
 */
function prepareIAMReviewData(iamData) {
  if (!iamData) return [];
  let items = [];
  // IAM findings live in window._complianceFindings (compliance-engine); the
  // state.js complianceFindings binding is never populated.
  const compFindings = (typeof window !== 'undefined' && window._complianceFindings) || [];
  // Process roles
  (iamData.roles || []).forEach(function(role) {
    const created = role.CreateDate ? new Date(role.CreateDate) : null;
    const lastUsed = role.RoleLastUsed && role.RoleLastUsed.LastUsedDate ? new Date(role.RoleLastUsed.LastUsedDate) : null;
    const trustDoc = role.AssumeRolePolicyDocument;
    let trustParsed = {};
    if (typeof trustDoc === 'string') { try { trustParsed = JSON.parse(trustDoc); } catch (e) { console.warn('Failed to parse trust policy:', e); } }
    else if (trustDoc) trustParsed = trustDoc;
    const crossAccts = [];
    _stmtArr(trustParsed.Statement).forEach(function(stmt) {
      if (stmt.Effect === 'Allow' && stmt.Principal) {
        const aws = stmt.Principal.AWS;
        if (aws) { const _own = (role.Arn || '').match(/:(\d{12}):/); const _ownAcct = _own ? _own[1] : ''; (Array.isArray(aws) ? aws : [aws]).forEach(function(arn) { const m = String(arn).match(/:(\d{12}):/); if (m && m[1] !== _ownAcct) crossAccts.push(m[1]); }); }
      }
    });
    const findings = (compFindings || []).filter(function(f) { return f.framework === 'IAM' && (f.resource === role.RoleName || f.resource === (role.Arn || '')); });
    const policyCount = (role.RolePolicyList || []).length + (role.AttachedManagedPolicies || []).length;
    const policyNames = (role.AttachedManagedPolicies || []).map(function(p) { return p.PolicyName || p.PolicyArn || ''; });
    const roleAcct = (role.Arn || '').match(/:(\d{12}):/);
    items.push({ name: role.RoleName || '', arn: role.Arn || '', type: 'Role', created: created, lastUsed: lastUsed, isAdmin: role._isAdmin || false, hasWildcard: role._hasWildcard || false, crossAccounts: Array.from(new Set(crossAccts)), policies: policyCount, policyNames: policyNames, permBoundary: role.PermissionsBoundary ? role.PermissionsBoundary.PermissionsBoundaryArn : '', findings: findings, _accountId: roleAcct ? roleAcct[1] : '', _raw: role });
  });
  // Process users
  (iamData.users || []).forEach(function(user) {
    const created = user.CreateDate ? new Date(user.CreateDate) : null;
    const lastUsed = user.PasswordLastUsed ? new Date(user.PasswordLastUsed) : null;
    const hasMFA = (user.MFADevices || []).length > 0;
    const hasConsole = !!user.LoginProfile;
    const activeKeys = (user.AccessKeys || []).filter(function(k) { return k.Status === 'Active'; }).length;
    const findings = (compFindings || []).filter(function(f) { return f.framework === 'IAM' && (f.resource === user.UserName || f.resource === (user.Arn || '')); });
    const policyCount = (user.UserPolicyList || []).length + (user.AttachedManagedPolicies || []).length;
    const policyNames = (user.AttachedManagedPolicies || []).map(function(p) { return p.PolicyName || p.PolicyArn || ''; });
    // Detect admin for users by analyzing actual policy documents
    let uIsAdmin = false;
    // Check inline policies
    (user.UserPolicyList || []).forEach(function(p) { if (uIsAdmin) return; let doc = _safePolicyParse(p.PolicyDocument); _stmtArr(doc.Statement).forEach(function(s) { if (s.Effect === 'Allow') { let a = Array.isArray(s.Action) ? s.Action : [s.Action || '']; let r = Array.isArray(s.Resource) ? s.Resource : [s.Resource || '']; if (a.some(function(x) { return x === '*'; }) && r.some(function(x) { return x === '*'; })) uIsAdmin = true; } }); });
    // Check managed policies
    (user.AttachedManagedPolicies || []).forEach(function(mp) { if (uIsAdmin) return; let pol = (iamData.policies || []).find(function(p) { return p.Arn === mp.PolicyArn || p.PolicyName === mp.PolicyName; }); if (pol) { let ver = (pol.PolicyVersionList || []).find(function(v) { return v.IsDefaultVersion; }); if (ver) { _stmtArr((_safePolicyParse(ver.Document)).Statement).forEach(function(s) { if (s.Effect === 'Allow') { let a = Array.isArray(s.Action) ? s.Action : [s.Action || '']; let r = Array.isArray(s.Resource) ? s.Resource : [s.Resource || '']; if (a.some(function(x) { return x === '*'; }) && r.some(function(x) { return x === '*'; })) uIsAdmin = true; } }); } } });
    const userAcct = (user.Arn || '').match(/:(\d{12}):/);
    items.push({ name: user.UserName || '', arn: user.Arn || '', type: 'User', created: created, lastUsed: lastUsed, isAdmin: uIsAdmin, hasWildcard: false, crossAccounts: [], policies: policyCount, policyNames: policyNames, permBoundary: user.PermissionsBoundary ? user.PermissionsBoundary.PermissionsBoundaryArn : '', findings: findings, _accountId: userAcct ? userAcct[1] : '', hasMFA: hasMFA, hasConsole: hasConsole, activeKeys: activeKeys, _raw: user });
  });
  _iamReviewData = items;
  return items;
}

// === EFFECTIVE PERMISSIONS ENGINE ===

/**
 * Match an IAM action pattern against an action string.
 * Supports wildcards (e.g., 's3:Get*' matches 's3:GetObject').
 * @param {string} pattern - IAM action pattern
 * @param {string} action - action to test
 * @returns {boolean}
 */
function matchAction(pattern, action) {
  if (!pattern || !action) return false;
  if (pattern === '*') return true;
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
  return re.test(action);
}

/**
 * Match an IAM resource ARN pattern against an ARN.
 * Supports wildcards in each colon-delimited segment.
 * @param {string} pattern - IAM resource pattern
 * @param {string} arn - ARN to test
 * @returns {boolean}
 */
function matchResource(pattern, arn) {
  if (!pattern || !arn) return false;
  if (pattern === '*') return true;
  const pParts = pattern.split(':'); const aParts = arn.split(':');
  if (pParts.length !== aParts.length && pParts.length < 6) return false;
  const reStr = pParts.map((p, i) => {
    if (p === '*' && i === pParts.length - 1) return '.*';
    if (p === '*') return '[^:]*';
    return p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  }).join(':');
  return new RegExp('^' + reStr + '$', 'i').test(arn);
}

/**
 * Evaluate an IAM condition block against a context.
 * @param {Object} condBlock - IAM Condition object
 * @param {Object} [context] - evaluation context (e.g., { mfa: true })
 * @returns {boolean}
 */
function evaluateCondition(condBlock, context) {
  if (!condBlock || Object.keys(condBlock).length === 0) return true;
  for (const [op, keys] of Object.entries(condBlock)) {
    for (const [ck, cv] of Object.entries(keys)) {
      if (op === 'Bool' && ck === 'aws:MultiFactorAuthPresent') {
        if (context && context.mfa !== undefined) return String(context.mfa) === String(cv);
      }
      if (op === 'StringEquals' || op === 'StringLike') {
        if (context && context[ck]) { const vals = Array.isArray(cv) ? cv : [cv]; if (!vals.some(v => v === context[ck])) return false; }
      }
    }
  }
  return true;
}

/**
 * Collect all IAM policy statements for a principal (role or user).
 * Resolves both inline and managed policies.
 * @param {Object} principal - IAM role or user object
 * @param {Object} iamData - parsed IAM data
 * @returns {Object[]} array of IAM statement objects
 */
function _collectStatements(principal, iamData) {
  const stmts = [];
  const policyLists = principal.RolePolicyList || principal.UserPolicyList || [];
  policyLists.forEach(p => {
    let doc = p.PolicyDocument;
    if (typeof doc === 'string') { try { doc = JSON.parse(decodeURIComponent(doc)); } catch (e) { try { doc = JSON.parse(doc); } catch (e2) { doc = {}; } } }
    if (!doc) doc = {};
    _stmtArr(doc.Statement).forEach(st => stmts.push(st));
  });
  (principal.AttachedManagedPolicies || []).forEach(mp => {
    const pol = (iamData.policies || []).find(p => p.Arn === mp.PolicyArn || p.PolicyName === mp.PolicyName);
    if (pol) {
      const ver = (pol.PolicyVersionList || []).find(v => v.IsDefaultVersion);
      if (ver) {
        let dd = ver.Document;
        if (typeof dd === 'string') { try { dd = JSON.parse(decodeURIComponent(dd)); } catch (e) { try { dd = JSON.parse(dd); } catch (e2) { dd = {}; } } }
        if (dd) { _stmtArr(dd.Statement).forEach(st => stmts.push(st)); }
      }
    }
  });
  return stmts;
}

/**
 * Check whether a principal can perform a specific action on a resource.
 * Evaluates deny statements first, then permission boundaries, then allows.
 * @param {Object} principal - IAM role or user object
 * @param {string} action - IAM action (e.g., 's3:GetObject')
 * @param {string} resource - resource ARN
 * @param {Object} iamData - parsed IAM data
 * @returns {{effect: string, reason: string, statements: Object[]}}
 */
function canDo(principal, action, resource, iamData) {
  const stmts = _collectStatements(principal, iamData);
  for (const s of stmts) {
    if (s.Effect !== 'Deny') continue;
    const acts = Array.isArray(s.Action) ? s.Action : [s.Action || ''];
    const res = Array.isArray(s.Resource) ? s.Resource : [s.Resource || ''];
    if (acts.some(a => matchAction(a, action)) && res.some(r => matchResource(r, resource))) {
      if (evaluateCondition(s.Condition)) return { effect: 'DENY', reason: 'Explicit deny in policy', statements: [s] };
    }
  }
  if (principal.PermissionsBoundary) {
    const bArn = principal.PermissionsBoundary.PermissionsBoundaryArn || principal.PermissionsBoundary;
    const bPol = (iamData.policies || []).find(p => p.Arn === bArn);
    if (bPol) {
      const ver = (bPol.PolicyVersionList || []).find(v => v.IsDefaultVersion);
      if (ver) {
        const dd = _safePolicyParse(ver.Document);
        const bStmts = _stmtArr(dd.Statement);
        const allowed = bStmts.some(s => {
          if (s.Effect !== 'Allow') return false;
          const ba = Array.isArray(s.Action) ? s.Action : [s.Action || ''];
          const br = Array.isArray(s.Resource) ? s.Resource : [s.Resource || ''];
          return ba.some(a => matchAction(a, action)) && br.some(r => matchResource(r, resource));
        });
        if (!allowed) return { effect: 'IMPLICIT_DENY', reason: 'Not allowed by permission boundary', statements: [] };
      }
    }
  }
  const matchedStmts = [];
  for (const s of stmts) {
    if (s.Effect !== 'Allow') continue;
    const acts = Array.isArray(s.Action) ? s.Action : [s.Action || ''];
    const res = Array.isArray(s.Resource) ? s.Resource : [s.Resource || ''];
    if (acts.some(a => matchAction(a, action)) && res.some(r => matchResource(r, resource))) {
      if (evaluateCondition(s.Condition)) matchedStmts.push(s);
    }
  }
  if (matchedStmts.length) return { effect: 'ALLOW', reason: 'Allowed by policy', statements: matchedStmts };
  return { effect: 'IMPLICIT_DENY', reason: 'No matching allow statement', statements: [] };
}

/**
 * Summarize all effective permissions for a principal.
 * Groups by service, accounts for permission boundaries.
 * @param {Object} principal - IAM role or user object
 * @param {Object} iamData - parsed IAM data
 * @returns {{services: Object, isAdmin: boolean, hasWildcard: boolean, permissionBoundary: string|null}}
 */
function summarizePermissions(principal, iamData) {
  const stmts = _collectStatements(principal, iamData);
  const services = {}; let isAdmin = false; let hasWildcard = false;
  const boundaryArn = principal.PermissionsBoundary?.PermissionsBoundaryArn || null;
  stmts.forEach(s => {
    const acts = Array.isArray(s.Action) ? s.Action : [s.Action || ''];
    const res = Array.isArray(s.Resource) ? s.Resource : [s.Resource || ''];
    if (s.NotAction) { const na = Array.isArray(s.NotAction) ? s.NotAction : [s.NotAction]; na.forEach(a => { const svc = a.includes(':') ? a.split(':')[0] : 'ALL'; if (!services[svc]) services[svc] = { allowed: [], denied: [], resources: {} }; services[svc].notActions = (services[svc].notActions || []).concat(a); }); return; }
    acts.forEach(a => {
      if (a === '*' || a === '*:*') { isAdmin = true; return; }
      const svc = a.includes(':') ? a.split(':')[0] : 'ALL';
      if (!services[svc]) services[svc] = { allowed: [], denied: [], resources: {} };
      const actionName = a.includes(':') ? a.split(':')[1] : a;
      if (s.Effect === 'Allow') {
        if (!services[svc].allowed.includes(actionName)) services[svc].allowed.push(actionName);
        const rr = services[svc].resources[actionName] || (services[svc].resources[actionName] = []);
        res.forEach(r => { if (r && !rr.includes(r)) rr.push(r); });
      } else if (s.Effect === 'Deny') {
        if (!services[svc].denied.includes(actionName)) services[svc].denied.push(actionName);
      }
    });
    if (res.some(r => r === '*')) hasWildcard = true;
  });
  if (boundaryArn) {
    const bPol = (iamData.policies || []).find(p => p.Arn === boundaryArn);
    if (bPol) {
      const ver = (bPol.PolicyVersionList || []).find(v => v.IsDefaultVersion);
      if (ver) {
        const dd = _safePolicyParse(ver.Document);
        const bStmts = _stmtArr(dd.Statement);
        const bAllowed = new Set();
        bStmts.forEach(s => {
          if (s.Effect !== 'Allow') return;
          const ba = Array.isArray(s.Action) ? s.Action : [s.Action || ''];
          ba.forEach(a => bAllowed.add(a));
        });
        if (!bAllowed.has('*')) {
          Object.keys(services).forEach(svc => {
            services[svc].allowed = services[svc].allowed.filter(a => {
              const full = svc + ':' + a;
              return Array.from(bAllowed).some(b => matchAction(b, full));
            });
          });
        }
      }
    }
  }
  return { services, isAdmin, hasWildcard, permissionBoundary: boundaryArn };
}

// === Window Bridge ===
// Expose all exports to window for inline callers that haven't migrated yet
if (typeof window !== 'undefined') {
  Object.assign(window, {
    // State variables - direct references (for backward compat reading)
    _govDashState, _iamDashState, _classificationData, _classificationOverrides,
    _iamReviewData, _inventoryData, _invState, _appRegistry, _appAutoDiscovered,
    _appSummaryState, _APP_TYPE_SUGGESTIONS, _invToolbarRendered,
    _INV_TYPE_COLORS, _INV_NO_MAP_TYPES, _invFilterCache, _invFilterKey,
    _DEFAULT_CLASS_RULES, _classificationRules, _discoveredTags, _TIER_RPO_RTO,
    // State accessors
    getGovDashState, setGovDashState, getIamDashState, setIamDashState,
    getClassificationData, setClassificationData,
    getClassificationOverrides, setClassificationOverrides,
    getIamReviewData, setIamReviewData, getInventoryData, setInventoryData,
    getInvState, setInvState, getAppRegistry, setAppRegistry,
    getAppAutoDiscovered, setAppAutoDiscovered,
    getAppSummaryState, setAppSummaryState,
    getInvToolbarRendered, setInvToolbarRendered,
    getInvFilterCache, setInvFilterCache, getInvFilterKey, setInvFilterKey,
    getClassificationRules, setClassificationRules,
    getDiscoveredTags, setDiscoveredTags,
    // Pure logic functions
    _buildInventoryData, _buildInventoryDataSync, _filterInventory, _getTagMap, _safeRegex,
    _scoreClassification, _discoverTagKeys, runClassificationEngine,
    prepareIAMReviewData, matchAction, matchResource, evaluateCondition,
    _collectStatements, canDo, summarizePermissions
  });
}

// === Backward Compat Exports ===
export {
  _govDashState, _iamDashState, _classificationData, _classificationOverrides,
  _iamReviewData, _inventoryData, _invState, _appRegistry, _appAutoDiscovered,
  _appSummaryState, _APP_TYPE_SUGGESTIONS, _invToolbarRendered,
  _INV_TYPE_COLORS, _INV_NO_MAP_TYPES, _invFilterCache, _invFilterKey,
  _DEFAULT_CLASS_RULES, _classificationRules, _discoveredTags, _TIER_RPO_RTO,
  _buildInventoryData, _buildInventoryDataSync, _filterInventory, _getTagMap, _safeRegex,
  _scoreClassification, _discoverTagKeys, runClassificationEngine,
  prepareIAMReviewData, matchAction, matchResource, evaluateCondition,
  _collectStatements, canDo, summarizePermissions
};

// Window bridge: expose mutable state to app-core.js via live bindings
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '_classificationData', {
    get() { return _classificationData; },
    set(v) { _classificationData = v; },
    configurable: true
  });
  Object.defineProperty(window, '_iamReviewData', {
    get() { return _iamReviewData; },
    set(v) { _iamReviewData = v; },
    configurable: true
  });
  Object.defineProperty(window, '_inventoryData', {
    get() { return _inventoryData; },
    set(v) { _inventoryData = v; },
    configurable: true
  });
  Object.defineProperty(window, '_appRegistry', {
    get() { return _appRegistry; },
    set(v) { _appRegistry = v; },
    configurable: true
  });
  Object.defineProperty(window, '_classificationRules', {
    get() { return _classificationRules; },
    set(v) { _classificationRules = v; },
    configurable: true
  });
  Object.defineProperty(window, '_discoveredTags', {
    get() { return _discoveredTags; },
    set(v) { _discoveredTags = v; },
    configurable: true
  });
  Object.defineProperty(window, '_classificationOverrides', {
    get() { return _classificationOverrides; },
    set(v) { _classificationOverrides = v; },
    configurable: true
  });
  Object.defineProperty(window, '_appAutoDiscovered', {
    get() { return _appAutoDiscovered; },
    set(v) { _appAutoDiscovered = v; },
    configurable: true
  });
}
