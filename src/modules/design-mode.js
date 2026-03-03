// Design Mode — pure logic, state, constants, and validation engine
// Extracted from index.html DESIGN MODE region (lines 3535-4502)
// DOM-dependent functions (showDesignForm, renderChangeLog, injectDesignToolbar,
// exportDesignPlan) remain inline in index.html.

import { safeParse, ext, esc, gn } from './utils.js';
import { parseCIDR, cidrContains, cidrOverlap, splitCIDR, ipInCIDR } from './cidr-engine.js';

// ---------------------------------------------------------------------------
// State variables
// ---------------------------------------------------------------------------
let _designMode = false;
let _designChanges = [];
let _designBaseline = null;
let _designDebounce = null;
let _lastDesignValidation = null;
let _sidebarWasCollapsed = false;
let _designRegion = 'us-east-1';

// ---------------------------------------------------------------------------
// Getters / setters for state consumed by inline code
// ---------------------------------------------------------------------------
export function getDesignMode() { return _designMode; }
export function setDesignMode(v) { _designMode = v; }

export function getDesignChanges() { return _designChanges; }
export function setDesignChanges(v) { _designChanges = v; }

export function getDesignBaseline() { return _designBaseline; }
export function setDesignBaseline(v) { _designBaseline = v; }

export function getDesignDebounce() { return _designDebounce; }
export function setDesignDebounce(v) { _designDebounce = v; }

export function getLastDesignValidation() { return _lastDesignValidation; }
export function setLastDesignValidation(v) { _lastDesignValidation = v; }

export function getSidebarWasCollapsed() { return _sidebarWasCollapsed; }
export function setSidebarWasCollapsed(v) { _sidebarWasCollapsed = v; }

export function getDesignRegion() { return _designRegion; }
export function setDesignRegion(v) { _designRegion = v; }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Region to AZ mapping (common regions)
export const _regionAZs = {
  'us-east-1': ['us-east-1a','us-east-1b','us-east-1c','us-east-1d','us-east-1e','us-east-1f'],
  'us-east-2': ['us-east-2a','us-east-2b','us-east-2c'],
  'us-west-1': ['us-west-1a','us-west-1b'],
  'us-west-2': ['us-west-2a','us-west-2b','us-west-2c','us-west-2d'],
  'eu-west-1': ['eu-west-1a','eu-west-1b','eu-west-1c'],
  'eu-west-2': ['eu-west-2a','eu-west-2b','eu-west-2c'],
  'eu-central-1': ['eu-central-1a','eu-central-1b','eu-central-1c'],
  'ap-southeast-1': ['ap-southeast-1a','ap-southeast-1b','ap-southeast-1c'],
  'ap-southeast-2': ['ap-southeast-2a','ap-southeast-2b','ap-southeast-2c'],
  'ap-northeast-1': ['ap-northeast-1a','ap-northeast-1b','ap-northeast-1c','ap-northeast-1d'],
  'ca-central-1': ['ca-central-1a','ca-central-1b','ca-central-1d'],
  'sa-east-1': ['sa-east-1a','sa-east-1b','sa-east-1c'],
};

// AWS Constraints Registry (sourced from official AWS docs)
export const _awsConstraints = {
  vpc: {
    cidrPrefixMin: 16, cidrPrefixMax: 28, maxCidrsPerVpc: 5, maxPerRegion: 5,
    reservedCidrs: ['172.17.0.0/16'],
    rfc1918: ['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16']
  },
  subnet: { cidrPrefixMin: 16, cidrPrefixMax: 28, reservedIps: 5, maxPerVpc: 200 },
  igw: { maxPerVpc: 1 },
  nat: { maxPerAz: 5, requiresPublicSubnet: true },
  routeTable: { maxPerVpc: 200, maxRoutesPerTable: 500, reservedDestinations: ['169.254.168.0/22'], localRouteImmutable: true },
  securityGroup: { maxPerVpc: 500, maxInboundRules: 60, maxOutboundRules: 60, maxPerEni: 5, hardLimitRulesPerEni: 1000 },
  nacl: { maxPerVpc: 200, maxRulesPerDirection: 20, ruleNumberMin: 1, ruleNumberMax: 32766 },
  peering: { maxActivePerVpc: 50, noOverlappingCidrs: true, onePeerPerVpcPair: true }
};

// ---------------------------------------------------------------------------
// Validation Engine
// ---------------------------------------------------------------------------

/**
 * Validate a single design change against AWS constraints.
 * @param {Object} change - The design change to validate
 * @param {Object} ctx - Render-context (_rlCtx) or null
 * @returns {{valid:boolean, errors:string[], warnings:string[]}}
 */
export function validateDesignChange(change, ctx) {
  const errors = [], warnings = [];
  const vpcs = ctx ? ctx.vpcs || [] : [];
  const subnets = ctx ? ctx.subnets || [] : [];
  const igws = ctx ? ctx.igws || [] : [];
  const nats = ctx ? ctx.nats || [] : [];
  const sgs = ctx ? ctx.sgs || [] : [];
  const rts = ctx ? ctx.rts || [] : [];
  const pubSubs = ctx ? ctx.pubSubs || new Set() : new Set();

  if (change.action === 'add_vpc') {
    const p = change.params;
    const cidr = parseCIDR(p.CidrBlock);
    if (!cidr) { errors.push('Invalid CIDR: ' + p.CidrBlock); return { valid: false, errors, warnings }; }
    const prefix = parseInt(p.CidrBlock.split('/')[1], 10);
    if (prefix < _awsConstraints.vpc.cidrPrefixMin || prefix > _awsConstraints.vpc.cidrPrefixMax)
      errors.push('VPC CIDR must be /16 to /28, got /' + prefix);
    const isRfc1918 = _awsConstraints.vpc.rfc1918.some(r => cidrContains(r, p.CidrBlock));
    if (!isRfc1918) warnings.push('CIDR ' + p.CidrBlock + ' is not RFC 1918 — private subnets may have issues');
    if (_awsConstraints.vpc.reservedCidrs.some(r => cidrOverlap(p.CidrBlock, r)))
      warnings.push('172.17.0.0/16 conflicts with Docker/SageMaker internal ranges');
    vpcs.forEach(v => { if (cidrOverlap(p.CidrBlock, v.CidrBlock)) errors.push('Overlaps existing VPC ' + gn(v, v.VpcId) + ' (' + v.CidrBlock + ')'); });
    if (vpcs.length >= _awsConstraints.vpc.maxPerRegion) warnings.push('Exceeds default quota of ' + _awsConstraints.vpc.maxPerRegion + ' VPCs per region (adjustable)');
  }

  if (change.action === 'add_subnet') {
    const p = change.params;
    const cidr = parseCIDR(p.CidrBlock);
    if (!cidr) { errors.push('Invalid CIDR: ' + p.CidrBlock); return { valid: false, errors, warnings }; }
    const prefix = parseInt(p.CidrBlock.split('/')[1], 10);
    if (prefix < _awsConstraints.subnet.cidrPrefixMin || prefix > _awsConstraints.subnet.cidrPrefixMax)
      errors.push('Subnet CIDR must be /16 to /28, got /' + prefix);
    const vpc = vpcs.find(v => v.VpcId === p.VpcId);
    if (!vpc) { errors.push('VPC ' + p.VpcId + ' not found'); return { valid: false, errors, warnings }; }
    if (!cidrContains(vpc.CidrBlock, p.CidrBlock)) errors.push('Subnet CIDR ' + p.CidrBlock + ' is not within VPC CIDR ' + vpc.CidrBlock);
    const vpcSubs = subnets.filter(s => s.VpcId === p.VpcId);
    vpcSubs.forEach(s => { if (cidrOverlap(p.CidrBlock, s.CidrBlock)) errors.push('Overlaps subnet ' + gn(s, s.SubnetId) + ' (' + s.CidrBlock + ')'); });
    if (vpcSubs.length >= _awsConstraints.subnet.maxPerVpc) warnings.push('Exceeds default quota of ' + _awsConstraints.subnet.maxPerVpc + ' subnets per VPC');
    const usable = Math.pow(2, 32 - prefix) - _awsConstraints.subnet.reservedIps;
    warnings.push(usable + ' usable IPs (' + _awsConstraints.subnet.reservedIps + ' reserved by AWS)');
    // HA check: is there a subnet in another AZ for this VPC?
    const otherAZSubs = vpcSubs.filter(s => s.AvailabilityZone && s.AvailabilityZone !== p.AZ);
    if (vpcSubs.length > 0 && otherAZSubs.length === 0) warnings.push('All subnets in same AZ — consider multi-AZ for high availability');
  }

  if (change.action === 'split_subnet') {
    const prefix = parseInt((change.target.CidrBlock || '').split('/')[1], 10);
    if (prefix >= _awsConstraints.subnet.cidrPrefixMax) errors.push('Cannot split /' + prefix + ' subnet (minimum is /' + _awsConstraints.subnet.cidrPrefixMax + ')');
    else {
      const newPrefix = prefix + 1;
      const usable = Math.pow(2, 32 - newPrefix) - _awsConstraints.subnet.reservedIps;
      warnings.push('Each half: /' + newPrefix + ' = ' + usable + ' usable IPs');
      if (usable < 16) warnings.push('Very small subnets — limited IP capacity');
    }
    const insts = ctx ? (ctx.instBySub || {})[change.target.SubnetId] || [] : [];
    if (insts.length) warnings.push(insts.length + ' instance(s) will require IP-based migration');
  }

  if (change.action === 'add_gateway') {
    const p = change.params;
    if (p.GatewayType === 'IGW') {
      const vpcIgws = igws.filter(g => (g.Attachments || []).some(a => a.VpcId === p.VpcId));
      if (vpcIgws.length >= _awsConstraints.igw.maxPerVpc)
        errors.push('VPC already has an Internet Gateway (hard limit: 1 per VPC)');
    }
    if (p.GatewayType === 'NAT') {
      if (p.SubnetId && !pubSubs.has(p.SubnetId))
        errors.push('NAT Gateway must be placed in a public subnet (one with 0.0.0.0/0 → IGW route)');
      const subnetAZ = (subnets.find(s => s.SubnetId === p.SubnetId) || {}).AvailabilityZone;
      if (subnetAZ) {
        const azNats = nats.filter(n => n.State !== 'deleted' && (subnets.find(s => s.SubnetId === n.SubnetId) || {}).AvailabilityZone === subnetAZ);
        if (azNats.length >= _awsConstraints.nat.maxPerAz) errors.push('Exceeds limit of ' + _awsConstraints.nat.maxPerAz + ' NAT Gateways in ' + subnetAZ);
        else if (azNats.length > 0) warnings.push(subnetAZ + ' already has ' + azNats.length + ' NAT GW(s) — AWS recommends 1 per AZ');
      }
    }
  }

  if (change.action === 'add_route') {
    const p = change.params; const t = change.target;
    const dest = p.DestinationCidrBlock;
    if (!parseCIDR(dest) && dest !== '0.0.0.0/0') errors.push('Invalid destination CIDR: ' + dest);
    if (_awsConstraints.routeTable.reservedDestinations.some(r => cidrContains(r, dest) || cidrContains(dest, r)))
      errors.push('Cannot add routes to 169.254.168.0/22 (reserved for AWS services)');
    const rt = rts.find(r => r.RouteTableId === t.RouteTableId);
    if (rt) {
      if ((rt.Routes || []).some(r => r.DestinationCidrBlock === dest))
        errors.push('Route table already has a route for ' + dest);
      if ((rt.Routes || []).length >= _awsConstraints.routeTable.maxRoutesPerTable)
        warnings.push('Exceeds default quota of ' + _awsConstraints.routeTable.maxRoutesPerTable + ' routes per table');
    }
    if (dest === '0.0.0.0/0' && p.TargetId && p.TargetId.startsWith('igw-'))
      warnings.push('This will make associated subnets public');
  }

  if (change.action === 'add_security_group') {
    const p = change.params;
    const vpcSgs = sgs.filter(s => s.VpcId === p.VpcId);
    if (vpcSgs.length >= _awsConstraints.securityGroup.maxPerVpc)
      warnings.push('Exceeds default quota of ' + _awsConstraints.securityGroup.maxPerVpc + ' SGs per VPC');
    if ((p.IngressRules || []).length > _awsConstraints.securityGroup.maxInboundRules)
      errors.push('Exceeds limit of ' + _awsConstraints.securityGroup.maxInboundRules + ' inbound rules per SG');
    (p.IngressRules || []).forEach(r => {
      if (r.CidrIp === '0.0.0.0/0' && r.FromPort !== 80 && r.FromPort !== 443 && r.Protocol !== '-1')
        warnings.push('Rule allows 0.0.0.0/0 on port ' + r.FromPort + ' — consider restricting source CIDR');
    });
  }

  if (change.action === 'add_resource') {
    const p = change.params;
    if (p.SubnetId) {
      const sub = subnets.find(s => s.SubnetId === p.SubnetId);
      if (sub) {
        const prefix = parseInt(sub.CidrBlock.split('/')[1], 10);
        const usable = Math.pow(2, 32 - prefix) - _awsConstraints.subnet.reservedIps;
        const currentInst = (ctx ? (ctx.instBySub || {})[p.SubnetId] || [] : []).length;
        const remaining = usable - currentInst;
        if (remaining <= 0) warnings.push('Subnet ' + gn(sub, sub.SubnetId) + ' has no remaining IP capacity (' + usable + ' usable, ' + currentInst + ' used)');
        else if (remaining < 5) warnings.push('Subnet ' + gn(sub, sub.SubnetId) + ' has only ' + remaining + ' IPs remaining');
      }
    }
  }

  if (change.action === 'remove_resource') {
    const t = change.target;
    if (t.ResourceType === 'IGW') {
      const affectedRts = rts.filter(rt => (rt.Routes || []).some(r => r.GatewayId === t.ResourceId));
      if (affectedRts.length) warnings.push(affectedRts.length + ' route table(s) reference this IGW — subnets will lose internet access');
    }
    if (t.ResourceType === 'NAT') {
      const affectedRts = rts.filter(rt => (rt.Routes || []).some(r => r.NatGatewayId === t.ResourceId));
      if (affectedRts.length) warnings.push(affectedRts.length + ' route table(s) route through this NAT — private subnets will lose outbound access');
    }
    if (t.ResourceType === 'Subnet') {
      const sub = subnets.find(s => s.SubnetId === t.ResourceId);
      if (sub) {
        const insts = ctx ? (ctx.instBySub || {})[t.ResourceId] || [] : [];
        if (insts.length) warnings.push(insts.length + ' instance(s) in this subnet will be terminated');
        const subNats = nats.filter(n => n.SubnetId === t.ResourceId);
        if (subNats.length) warnings.push(subNats.length + ' NAT Gateway(s) in this subnet will be deleted');
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Full-state cross-change validation.
 * @param {Object[]} changes - Array of design changes
 * @param {Object} ctx - Render context (_rlCtx)
 * @returns {{valid:boolean, errors:string[], warnings:string[], stats:Object}}
 */
export function validateDesignState(changes, ctx) {
  const errors = [], warnings = [], stats = {
    subnetsAdded: 0, gatewaysAdded: 0, resourcesAdded: 0, removed: 0, routes: 0, sgs: 0
  };
  changes.forEach(ch => {
    if (ch.action === 'add_subnet') stats.subnetsAdded++;
    if (ch.action === 'add_gateway') stats.gatewaysAdded++;
    if (ch.action === 'add_resource') stats.resourcesAdded++;
    if (ch.action === 'remove_resource') stats.removed++;
    if (ch.action === 'add_route') stats.routes++;
    if (ch.action === 'add_security_group') stats.sgs++;
  });
  if (ctx) {
    // Cross-check: IGW count per VPC
    const igwCounts = {};
    (ctx.igws || []).forEach(g => { (g.Attachments || []).forEach(a => { igwCounts[a.VpcId] = (igwCounts[a.VpcId] || 0) + 1; }); });
    Object.entries(igwCounts).forEach(([vid, count]) => {
      if (count > 1) { const v = (ctx.vpcs || []).find(x => x.VpcId === vid); errors.push('VPC ' + (v ? gn(v, vid) : vid) + ' has ' + count + ' IGWs (hard limit: 1)'); }
    });
    // Cross-check: subnet overlaps within each VPC
    const subsByVpc = {};
    (ctx.subnets || []).forEach(s => { (subsByVpc[s.VpcId] = subsByVpc[s.VpcId] || []).push(s); });
    Object.entries(subsByVpc).forEach(([vid, subs]) => {
      for (let i = 0; i < subs.length; i++) {
        for (let j = i + 1; j < subs.length; j++) {
          if (cidrOverlap(subs[i].CidrBlock, subs[j].CidrBlock))
            errors.push('Subnets ' + gn(subs[i], subs[i].SubnetId) + ' and ' + gn(subs[j], subs[j].SubnetId) + ' have overlapping CIDRs');
        }
      }
    });
    // HA analysis: single-AZ VPCs
    Object.entries(subsByVpc).forEach(([vid, subs]) => {
      const azs = new Set(subs.map(s => s.AvailabilityZone).filter(Boolean));
      if (subs.length > 1 && azs.size === 1) { const v = (ctx.vpcs || []).find(x => x.VpcId === vid); warnings.push('VPC ' + (v ? gn(v, vid) : vid) + ' — all ' + subs.length + ' subnets in single AZ (' + [...azs][0] + ') — no HA'); }
    });
    // NAT in private subnet check
    (ctx.nats || []).forEach(n => {
      if (n.SubnetId && ctx.pubSubs && !ctx.pubSubs.has(n.SubnetId))
        warnings.push('NAT Gateway ' + gn(n, n.NatGatewayId) + ' is in a private subnet — will not function');
    });
    // Peering CIDR overlap check
    const peerPairs = [];
    (ctx.peerings || []).forEach(p => {
      const rv = p.RequesterVpcInfo, av = p.AccepterVpcInfo;
      if (rv && av && rv.CidrBlock && av.CidrBlock) {
        if (cidrOverlap(rv.CidrBlock, av.CidrBlock))
          errors.push('VPC Peering ' + gn(p, p.VpcPeeringConnectionId) + ' — CIDRs overlap: ' + rv.CidrBlock + ' / ' + av.CidrBlock);
        const pair = [rv.VpcId, av.VpcId].sort().join(':');
        if (peerPairs.includes(pair)) warnings.push('Duplicate peering between ' + rv.VpcId + ' and ' + av.VpcId);
        peerPairs.push(pair);
      }
    });
  }
  return { valid: errors.length === 0, errors, warnings, stats };
}

// ---------------------------------------------------------------------------
// Design Apply Functions — mutate textarea JSON via getter/setter callbacks
//
// Each function receives:
//   ch        - the design change object
//   getTa(id) - returns the current value string for a textarea ID
//   setTa(id, value) - sets the value string for a textarea ID
// ---------------------------------------------------------------------------

function _applyAddVpc(ch, getTa, setTa) {
  const raw = safeParse(getTa('in_vpcs')); const vpcs = raw ? ext(raw, ['Vpcs']) : [];
  const id = ch.params.VpcId || ('vpc-design-' + Date.now()); ch.params.VpcId = id;
  const vpc = { VpcId: id, CidrBlock: ch.params.CidrBlock, State: 'available', IsDefault: false, OwnerId: ch.params.AccountId || 'design', Tags: [{ Key: 'Name', Value: ch.params.Name || 'New VPC' }] };
  vpcs.push(vpc);
  setTa('in_vpcs', JSON.stringify({ Vpcs: vpcs }));
  ch._addedIds = [id];
  // Create default route table with local route
  const rtRaw = safeParse(getTa('in_rts')); const rts = rtRaw ? ext(rtRaw, ['RouteTables']) : [];
  const rtId = ch.params._rtId || ('rtb-design-' + Date.now()); ch.params._rtId = rtId;
  rts.push({ RouteTableId: rtId, VpcId: id, Associations: [{ Main: true, RouteTableId: rtId }], Routes: [{ DestinationCidrBlock: ch.params.CidrBlock, GatewayId: 'local', State: 'active', Origin: 'CreateRouteTable' }], Tags: [{ Key: 'Name', Value: (ch.params.Name || 'vpc') + '-main-rt' }] });
  setTa('in_rts', JSON.stringify({ RouteTables: rts }));
  // Create default NACL (allow all)
  const naclRaw = safeParse(getTa('in_nacls')); const nacls = naclRaw ? ext(naclRaw, ['NetworkAcls']) : [];
  const naclId = ch.params._naclId || ('acl-design-' + Date.now()); ch.params._naclId = naclId;
  nacls.push({ NetworkAclId: naclId, VpcId: id, IsDefault: true, Entries: [{ RuleNumber: 100, Protocol: '-1', RuleAction: 'allow', Egress: false, CidrBlock: '0.0.0.0/0' }, { RuleNumber: 100, Protocol: '-1', RuleAction: 'allow', Egress: true, CidrBlock: '0.0.0.0/0' }, { RuleNumber: 32767, Protocol: '-1', RuleAction: 'deny', Egress: false, CidrBlock: '0.0.0.0/0' }, { RuleNumber: 32767, Protocol: '-1', RuleAction: 'deny', Egress: true, CidrBlock: '0.0.0.0/0' }], Tags: [{ Key: 'Name', Value: (ch.params.Name || 'vpc') + '-default-nacl' }] });
  setTa('in_nacls', JSON.stringify({ NetworkAcls: nacls }));
  // Create default SG
  const sgRaw = safeParse(getTa('in_sgs')); const sgs = sgRaw ? ext(sgRaw, ['SecurityGroups']) : [];
  const sgId = ch.params._sgId || ('sg-design-' + Date.now()); ch.params._sgId = sgId;
  sgs.push({ GroupId: sgId, GroupName: 'default', VpcId: id, Description: 'default VPC security group', IpPermissions: [{ IpProtocol: '-1', IpRanges: [], UserIdGroupPairs: [{ GroupId: sgId }] }], IpPermissionsEgress: [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }], Tags: [{ Key: 'Name', Value: 'default' }] });
  setTa('in_sgs', JSON.stringify({ SecurityGroups: sgs }));
}

function _applyAddSubnet(ch, getTa, setTa) {
  const raw = safeParse(getTa('in_subnets'));
  const subs = raw ? ext(raw, ['Subnets']) : [];
  const subId = ch.params.SubnetId || ('subnet-design-' + Date.now()); ch.params.SubnetId = subId;
  subs.push({ SubnetId: subId, VpcId: ch.params.VpcId, CidrBlock: ch.params.CidrBlock, AvailabilityZone: ch.params.AZ, MapPublicIpOnLaunch: ch.params.isPublic || false, Tags: [{ Key: 'Name', Value: ch.params.Name || 'New Subnet' }] });
  setTa('in_subnets', JSON.stringify({ Subnets: subs }));
  ch._addedIds = [subId];
}

function _applySplitSubnet(ch, getTa, setTa) {
  const raw = safeParse(getTa('in_subnets'));
  const subs = raw ? ext(raw, ['Subnets']) : [];
  const idx = subs.findIndex(s => s.SubnetId === ch.target.SubnetId);
  if (idx < 0) return;
  const orig = subs[idx];
  const halves = splitCIDR(orig.CidrBlock);
  if (!halves) return;
  if (!ch.params.newIds) ch.params.newIds = ['subnet-split-a-' + Date.now(), 'subnet-split-b-' + Date.now()];
  const sub1 = { ...orig, SubnetId: ch.params.newIds[0], CidrBlock: halves[0], Tags: [{ Key: 'Name', Value: (ch.params.names?.[0]) || gn(orig, '') + '_a' }] };
  const sub2 = { ...orig, SubnetId: ch.params.newIds[1], CidrBlock: halves[1], Tags: [{ Key: 'Name', Value: (ch.params.names?.[1]) || gn(orig, '') + '_b' }] };
  subs.splice(idx, 1, sub1, sub2);
  setTa('in_subnets', JSON.stringify({ Subnets: subs }));
  ch._removedIds = [ch.target.SubnetId]; ch._addedIds = [sub1.SubnetId, sub2.SubnetId];
  // Migrate instances by IP
  const instRaw = safeParse(getTa('in_ec2'));
  if (instRaw) {
    const reservations = ext(instRaw, ['Reservations']);
    reservations.forEach(res => { (res.Instances || []).forEach(inst => {
      if (inst.SubnetId === ch.target.SubnetId && inst.PrivateIpAddress) {
        inst.SubnetId = ipInCIDR(inst.PrivateIpAddress, halves[0]) ? sub1.SubnetId : sub2.SubnetId;
      }
    }); });
    setTa('in_ec2', JSON.stringify({ Reservations: reservations }));
  }
}

function _applyAddGateway(ch, getTa, setTa) {
  const type = ch.params.GatewayType;
  if (type === 'IGW') {
    const raw = safeParse(getTa('in_igws')); const igws = raw ? ext(raw, ['InternetGateways']) : [];
    const id = ch.params.GatewayId || ('igw-design-' + Date.now()); ch.params.GatewayId = id;
    igws.push({ InternetGatewayId: id, Attachments: [{ VpcId: ch.params.VpcId, State: 'available' }], Tags: [{ Key: 'Name', Value: ch.params.Name || 'New IGW' }] });
    setTa('in_igws', JSON.stringify({ InternetGateways: igws }));
    ch._addedIds = [id];
  } else if (type === 'NAT') {
    const raw = safeParse(getTa('in_nats')); const nats = raw ? ext(raw, ['NatGateways']) : [];
    const id = ch.params.GatewayId || ('nat-design-' + Date.now()); ch.params.GatewayId = id;
    nats.push({ NatGatewayId: id, VpcId: ch.params.VpcId, SubnetId: ch.params.SubnetId, State: 'available', Tags: [{ Key: 'Name', Value: ch.params.Name || 'New NAT' }] });
    setTa('in_nats', JSON.stringify({ NatGateways: nats }));
    ch._addedIds = [id];
  } else if (type === 'VPCE') {
    const raw = safeParse(getTa('in_vpces')); const vpces = raw ? ext(raw, ['VpcEndpoints']) : [];
    const id = ch.params.GatewayId || ('vpce-design-' + Date.now()); ch.params.GatewayId = id;
    vpces.push({ VpcEndpointId: id, VpcId: ch.params.VpcId, ServiceName: ch.params.ServiceName || 'com.amazonaws.region.s3', VpcEndpointType: ch.params.EndpointType || 'Gateway', State: 'available', Tags: [{ Key: 'Name', Value: ch.params.Name || 'New VPCE' }] });
    setTa('in_vpces', JSON.stringify({ VpcEndpoints: vpces }));
    ch._addedIds = [id];
  }
}

function _applyAddRoute(ch, getTa, setTa) {
  const raw = safeParse(getTa('in_rts')); const rts = raw ? ext(raw, ['RouteTables']) : [];
  const rt = rts.find(r => r.RouteTableId === ch.target.RouteTableId);
  if (!rt) return;
  rt.Routes = rt.Routes || [];
  rt.Routes.push({ DestinationCidrBlock: ch.params.DestinationCidrBlock, GatewayId: ch.params.TargetId, State: 'active' });
  setTa('in_rts', JSON.stringify({ RouteTables: rts }));
  ch._modifiedIds = [ch.target.RouteTableId];
}

function _applyAddResource(ch, getTa, setTa) {
  const type = ch.params.ResourceType;
  if (type === 'EC2') {
    const raw = safeParse(getTa('in_ec2'));
    const reservations = raw ? ext(raw, ['Reservations']) : [];
    const id = ch.params.ResourceId || ('i-design-' + Date.now()); ch.params.ResourceId = id;
    reservations.push({ Instances: [{ InstanceId: id, SubnetId: ch.params.SubnetId, VpcId: ch.params.VpcId, InstanceType: ch.params.InstanceType || 't3.micro', State: { Name: 'running' }, PrivateIpAddress: ch.params.PrivateIp || '', Tags: [{ Key: 'Name', Value: ch.params.Name || 'New Instance' }] }] });
    setTa('in_ec2', JSON.stringify({ Reservations: reservations }));
    ch._addedIds = [id];
  } else if (type === 'RDS') {
    const raw = safeParse(getTa('in_rds')); const rds = raw ? ext(raw, ['DBInstances']) : [];
    const id = ch.params.ResourceId || ('db-design-' + Date.now()); ch.params.ResourceId = id;
    rds.push({ DBInstanceIdentifier: id, DBSubnetGroup: { VpcId: ch.params.VpcId, Subnets: [{ SubnetIdentifier: ch.params.SubnetId }] }, DBInstanceClass: ch.params.InstanceClass || 'db.t3.micro', Engine: ch.params.Engine || 'mysql', DBInstanceStatus: 'available' });
    setTa('in_rds', JSON.stringify({ DBInstances: rds }));
    ch._addedIds = [id];
  } else if (type === 'ElastiCache') {
    const raw = safeParse(getTa('in_elasticache')); const clusters = raw ? ext(raw, ['CacheClusters']) : [];
    const id = ch.params.ResourceId || ('cache-design-' + Date.now()); ch.params.ResourceId = id;
    clusters.push({ CacheClusterId: id, CacheNodeType: ch.params.NodeType || 'cache.t3.micro', Engine: ch.params.Engine || 'redis', CacheClusterStatus: 'available', CacheNodes: [{ CacheNodeId: '0001', Endpoint: { Address: id + '.cache.amazonaws.com', Port: 6379 } }], ConfigurationEndpoint: { Address: id + '.cache.amazonaws.com', Port: 6379 } });
    setTa('in_elasticache', JSON.stringify({ CacheClusters: clusters }));
    ch._addedIds = [id];
  } else if (type === 'Lambda') {
    const raw = safeParse(getTa('in_lambda')); const fns = raw ? ext(raw, ['Functions']) : [];
    const id = ch.params.ResourceId || ('lambda-design-' + Date.now()); ch.params.ResourceId = id;
    fns.push({ FunctionName: ch.params.Name || 'new-function', FunctionArn: 'arn:aws:lambda:::function:' + (ch.params.Name || id), VpcConfig: { VpcId: ch.params.VpcId, SubnetIds: [ch.params.SubnetId], SecurityGroupIds: ch.params.SGIds || [] }, Runtime: ch.params.Runtime || 'nodejs18.x', MemorySize: 128 });
    setTa('in_lambda', JSON.stringify({ Functions: fns }));
    ch._addedIds = [id];
  } else if (type === 'ECS') {
    const raw = safeParse(getTa('in_ecs')); const svcs = raw ? ext(raw, ['services', 'Services']) : [];
    const id = ch.params.ResourceId || ('ecs-svc-design-' + Date.now()); ch.params.ResourceId = id;
    svcs.push({ serviceName: ch.params.Name || 'new-service', serviceArn: 'arn:aws:ecs:::service/' + id, networkConfiguration: { awsvpcConfiguration: { subnets: [ch.params.SubnetId], securityGroups: ch.params.SGIds || [] } }, runningCount: ch.params.DesiredCount || 1, desiredCount: ch.params.DesiredCount || 1, launchType: 'FARGATE' });
    setTa('in_ecs', JSON.stringify({ services: svcs }));
    ch._addedIds = [id];
  } else if (type === 'Redshift') {
    const raw = safeParse(getTa('in_redshift')); const clusters = raw ? ext(raw, ['Clusters']) : [];
    const id = ch.params.ResourceId || ('redshift-design-' + Date.now()); ch.params.ResourceId = id;
    clusters.push({ ClusterIdentifier: id, NodeType: ch.params.NodeType || 'dc2.large', ClusterStatus: 'available', DBName: ch.params.DBName || 'dev', Endpoint: { Address: id + '.redshift.amazonaws.com', Port: 5439 }, VpcId: ch.params.VpcId, ClusterSubnetGroupName: 'design-subnet-group' });
    setTa('in_redshift', JSON.stringify({ Clusters: clusters }));
    ch._addedIds = [id];
  }
}

function _applyAddSecurityGroup(ch, getTa, setTa) {
  const raw = safeParse(getTa('in_sgs')); const sgs = raw ? ext(raw, ['SecurityGroups']) : [];
  const id = ch.params.GroupId || ('sg-design-' + Date.now()); ch.params.GroupId = id;
  const sg = { GroupId: id, GroupName: ch.params.Name || 'new-sg', VpcId: ch.params.VpcId, Description: ch.params.Description || 'Design mode security group', IpPermissions: [], IpPermissionsEgress: [], Tags: [{ Key: 'Name', Value: ch.params.Name || 'new-sg' }] };
  if (ch.params.IngressRules) { ch.params.IngressRules.forEach(r => { sg.IpPermissions.push({ IpProtocol: r.Protocol || 'tcp', FromPort: r.FromPort, ToPort: r.ToPort, IpRanges: [{ CidrIp: r.CidrIp || '0.0.0.0/0' }] }); }); }
  sgs.push(sg);
  setTa('in_sgs', JSON.stringify({ SecurityGroups: sgs }));
  ch._addedIds = [id];
}

function _applyRemoveResource(ch, getTa, setTa) {
  ch._removedIds = [ch.target.ResourceId];
  const type = ch.target.ResourceType;
  if (type === 'EC2') {
    const raw = safeParse(getTa('in_ec2')); if (!raw) return;
    const reservations = ext(raw, ['Reservations']);
    reservations.forEach(res => { res.Instances = (res.Instances || []).filter(i => i.InstanceId !== ch.target.ResourceId); });
    setTa('in_ec2', JSON.stringify({ Reservations: reservations.filter(r => (r.Instances || []).length) }));
  } else if (type === 'RDS') {
    const raw = safeParse(getTa('in_rds')); const rds = raw ? ext(raw, ['DBInstances']) : [];
    setTa('in_rds', JSON.stringify({ DBInstances: rds.filter(d => d.DBInstanceIdentifier !== ch.target.ResourceId) }));
  } else if (type === 'ElastiCache') {
    const raw = safeParse(getTa('in_elasticache')); const c = raw ? ext(raw, ['CacheClusters']) : [];
    setTa('in_elasticache', JSON.stringify({ CacheClusters: c.filter(d => d.CacheClusterId !== ch.target.ResourceId) }));
  } else if (type === 'Lambda') {
    const raw = safeParse(getTa('in_lambda')); const fns = raw ? ext(raw, ['Functions']) : [];
    setTa('in_lambda', JSON.stringify({ Functions: fns.filter(f => f.FunctionName !== ch.target.ResourceId && f.FunctionArn !== ch.target.ResourceId) }));
  } else if (type === 'Subnet') {
    const raw = safeParse(getTa('in_subnets')); const subs = raw ? ext(raw, ['Subnets']) : [];
    setTa('in_subnets', JSON.stringify({ Subnets: subs.filter(s => s.SubnetId !== ch.target.ResourceId) }));
  } else if (type === 'Redshift') {
    const raw = safeParse(getTa('in_redshift')); const c = raw ? ext(raw, ['Clusters']) : [];
    setTa('in_redshift', JSON.stringify({ Clusters: c.filter(d => d.ClusterIdentifier !== ch.target.ResourceId) }));
  } else if (type === 'IGW') {
    const raw = safeParse(getTa('in_igws')); const igws = raw ? ext(raw, ['InternetGateways']) : [];
    setTa('in_igws', JSON.stringify({ InternetGateways: igws.filter(g => g.InternetGatewayId !== ch.target.ResourceId) }));
  } else if (type === 'NAT') {
    const raw = safeParse(getTa('in_nats')); const nats = raw ? ext(raw, ['NatGateways']) : [];
    setTa('in_nats', JSON.stringify({ NatGateways: nats.filter(g => g.NatGatewayId !== ch.target.ResourceId) }));
  } else if (type === 'VPCE') {
    const raw = safeParse(getTa('in_vpces')); const vpces = raw ? ext(raw, ['VpcEndpoints']) : [];
    setTa('in_vpces', JSON.stringify({ VpcEndpoints: vpces.filter(g => g.VpcEndpointId !== ch.target.ResourceId) }));
  }
}

/**
 * Map of action names to apply functions.
 * Each apply fn signature: (change, getTa, setTa)
 *   getTa(id) => string   — read textarea value
 *   setTa(id, val)        — write textarea value
 */
export const _designApplyFns = {
  add_vpc: _applyAddVpc,
  add_subnet: _applyAddSubnet,
  split_subnet: _applySplitSubnet,
  add_gateway: _applyAddGateway,
  add_route: _applyAddRoute,
  add_resource: _applyAddResource,
  add_security_group: _applyAddSecurityGroup,
  remove_resource: _applyRemoveResource,
};

// ---------------------------------------------------------------------------
// CLI / Warning generators (pure logic, no DOM)
// ---------------------------------------------------------------------------

/**
 * Generate AWS CLI commands for a single design change.
 * @param {Object} ch - Design change object
 * @returns {string[]} Array of CLI command strings
 */
export function _generateCLI(ch) {
  const cmds = [];
  if (ch.action === 'add_vpc') { cmds.push(`aws ec2 create-vpc --cidr-block ${ch.params.CidrBlock}${ch.params.Name ? " --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=" + ch.params.Name + "}]'" : ''}`); cmds.push('# Default route table, NACL, and SG are created automatically by AWS'); }
  if (ch.action === 'add_subnet') cmds.push(`aws ec2 create-subnet --vpc-id ${ch.params.VpcId} --cidr-block ${ch.params.CidrBlock} --availability-zone ${ch.params.AZ}${ch.params.Name ? " --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=" + ch.params.Name + "}]'" : ''}`);
  if (ch.action === 'split_subnet') {
    cmds.push('# Split subnet: delete original, create two new');
    cmds.push(`aws ec2 delete-subnet --subnet-id ${ch.target.SubnetId}`);
    const halves = splitCIDR(ch.target.CidrBlock);
    if (halves) {
      const az = ch.params.AZ || '$AZ';
      cmds.push(`aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block ${halves[0]} --availability-zone ${az}${ch.params.names?.[0] ? " --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=" + ch.params.names[0] + "}]'" : ''}`);
      cmds.push(`aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block ${halves[1]} --availability-zone ${az}${ch.params.names?.[1] ? " --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=" + ch.params.names[1] + "}]'" : ''}`);
    }
  }
  if (ch.action === 'add_gateway') {
    if (ch.params.GatewayType === 'IGW') { cmds.push(`aws ec2 create-internet-gateway${ch.params.Name ? " --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=" + ch.params.Name + "}]'" : ''}`); cmds.push(`aws ec2 attach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id ${ch.params.VpcId}`); }
    if (ch.params.GatewayType === 'NAT') { cmds.push('# Allocate EIP first: aws ec2 allocate-address --domain vpc'); cmds.push(`aws ec2 create-nat-gateway --subnet-id ${ch.params.SubnetId || '$SUBNET_ID'} --allocation-id $EIP_ALLOC_ID${ch.params.Name ? " --tag-specifications 'ResourceType=natgateway,Tags=[{Key=Name,Value=" + ch.params.Name + "}]'" : ''}`); }
    if (ch.params.GatewayType === 'VPCE') cmds.push(`aws ec2 create-vpc-endpoint --vpc-id ${ch.params.VpcId} --service-name ${ch.params.ServiceName || 'com.amazonaws.REGION.s3'} --vpc-endpoint-type ${ch.params.EndpointType || 'Gateway'}`);
  }
  if (ch.action === 'add_route') cmds.push(`aws ec2 create-route --route-table-id ${ch.target.RouteTableId} --destination-cidr-block ${ch.params.DestinationCidrBlock} --gateway-id ${ch.params.TargetId}`);
  if (ch.action === 'add_resource') {
    if (ch.params.ResourceType === 'EC2') cmds.push(`aws ec2 run-instances --subnet-id ${ch.params.SubnetId} --instance-type ${ch.params.InstanceType || 't3.micro'} --image-id $AMI_ID${ch.params.Name ? " --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=" + ch.params.Name + "}]'" : ''}`);
    if (ch.params.ResourceType === 'RDS') cmds.push(`aws rds create-db-instance --db-instance-identifier ${ch.params.Name || 'new-db'} --db-instance-class ${ch.params.InstanceClass || 'db.t3.micro'} --engine ${ch.params.Engine || 'mysql'} --master-username admin --master-user-password $DB_PASSWORD`);
    if (ch.params.ResourceType === 'Lambda') cmds.push(`aws lambda create-function --function-name ${ch.params.Name || 'new-function'} --runtime ${ch.params.Runtime || 'nodejs18.x'} --role $LAMBDA_ROLE_ARN --handler index.handler --zip-file fileb://function.zip --vpc-config SubnetIds=${ch.params.SubnetId}`);
    if (ch.params.ResourceType === 'ElastiCache') cmds.push(`aws elasticache create-cache-cluster --cache-cluster-id ${ch.params.Name || 'new-cache'} --cache-node-type ${ch.params.NodeType || 'cache.t3.micro'} --engine ${ch.params.Engine || 'redis'} --num-cache-nodes 1`);
    if (ch.params.ResourceType === 'ECS') cmds.push(`aws ecs create-service --cluster $CLUSTER --service-name ${ch.params.Name || 'new-service'} --task-definition $TASK_DEF --desired-count ${ch.params.DesiredCount || 1} --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[${ch.params.SubnetId}]}"`);
    if (ch.params.ResourceType === 'Redshift') cmds.push(`aws redshift create-cluster --cluster-identifier ${ch.params.Name || 'new-cluster'} --node-type ${ch.params.NodeType || 'dc2.large'} --master-username admin --master-user-password $RS_PASSWORD --number-of-nodes 1`);
  }
  if (ch.action === 'add_security_group') {
    cmds.push(`aws ec2 create-security-group --group-name ${ch.params.Name || 'new-sg'} --description "${ch.params.Description || 'Design mode SG'}" --vpc-id ${ch.params.VpcId}`);
    if (ch.params.IngressRules) { ch.params.IngressRules.forEach(r => {
      if (r.Protocol === '-1') cmds.push(`aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol -1 --cidr ${r.CidrIp || '0.0.0.0/0'}`);
      else cmds.push(`aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol ${r.Protocol} --port ${r.FromPort} --cidr ${r.CidrIp || '0.0.0.0/0'}`);
    }); }
  }
  if (ch.action === 'remove_resource') {
    const id = ch.target.ResourceId; const t = ch.target.ResourceType;
    if (t === 'EC2') cmds.push(`aws ec2 terminate-instances --instance-ids ${id}`);
    if (t === 'RDS') cmds.push(`aws rds delete-db-instance --db-instance-identifier ${id} --skip-final-snapshot`);
    if (t === 'Lambda') cmds.push(`aws lambda delete-function --function-name ${id}`);
    if (t === 'Subnet') cmds.push(`aws ec2 delete-subnet --subnet-id ${id}`);
    if (t === 'IGW') { cmds.push(`aws ec2 detach-internet-gateway --internet-gateway-id ${id} --vpc-id $VPC_ID`); cmds.push(`aws ec2 delete-internet-gateway --internet-gateway-id ${id}`); }
    if (t === 'NAT') cmds.push(`aws ec2 delete-nat-gateway --nat-gateway-id ${id}`);
    if (t === 'VPCE') cmds.push(`aws ec2 delete-vpc-endpoints --vpc-endpoint-ids ${id}`);
  }
  return cmds;
}

/**
 * Generate high-level warnings for the design plan.
 * @returns {string[]} Array of warning strings
 */
export function _generateWarnings() {
  const w = [];
  const splits = _designChanges.filter(c => c.action === 'split_subnet');
  if (splits.length) w.push(splits.length + ' subnet split(s) require instance migration');
  const removes = _designChanges.filter(c => c.action === 'remove_resource');
  if (removes.length) w.push(removes.length + ' resource removal(s) — verify dependencies first');
  return w;
}

/**
 * Import a previously exported design plan (JSON).
 * Requires enterDesignMode() and addDesignChange() to be provided as callbacks
 * since they have DOM dependencies.
 * @param {string|Object} json - Plan JSON string or object
 * @param {Function} enterFn - enterDesignMode callback
 * @param {Function} addChangeFn - addDesignChange callback
 */
export function importDesignPlan(json, enterFn, addChangeFn) {
  try {
    const plan = typeof json === 'string' ? JSON.parse(json) : json;
    if (!plan.changes || !Array.isArray(plan.changes)) { alert('Invalid plan format'); return; }
    if (!_designMode) enterFn();
    if (plan.region) _designRegion = plan.region;
    let imported = 0, blocked = 0;
    plan.changes.forEach(ch => {
      addChangeFn(ch);
      if (ch._invalid) blocked++; else imported++;
    });
    if (blocked > 0) alert('Imported ' + imported + ' changes, ' + blocked + ' blocked by validation errors. Check the change log for details.');
  } catch (e) { alert('Failed to import plan: ' + e.message); }
}

/**
 * Detect AZs from a subnets array, falling back to design region, then default.
 * @param {Object[]} subnets - Array of subnet objects (from parsed textarea)
 * @returns {string[]} Sorted list of AZ names
 */
export function detectAZs(subnets) {
  const azSet = new Set();
  (subnets || []).forEach(s => { if (s.AvailabilityZone) azSet.add(s.AvailabilityZone); });
  if (azSet.size > 0) return Array.from(azSet).sort();
  if (_regionAZs[_designRegion]) return _regionAZs[_designRegion];
  return ['us-east-1a', 'us-east-1b', 'us-east-1c'];
}

// ---------------------------------------------------------------------------
// Window bridge: expose to inline code that still calls these functions
// ---------------------------------------------------------------------------
// Controlled access to design state — prevents unaudited external mutations
Object.defineProperty(window, '_designMode', {
  get() { return _designMode; },
  set(v) { _designMode = v; },
  configurable: true
});
Object.defineProperty(window, '_designChanges', {
  get() { return _designChanges; },
  set(v) { _designChanges = v; },
  configurable: true
});
Object.defineProperty(window, '_designBaseline', {
  get() { return _designBaseline; },
  set(v) { _designBaseline = v; },
  configurable: true
});
Object.defineProperty(window, '_designDebounce', {
  get() { return _designDebounce; },
  set(v) { _designDebounce = v; },
  configurable: true
});
Object.defineProperty(window, '_lastDesignValidation', {
  get() { return _lastDesignValidation; },
  set(v) { _lastDesignValidation = v; },
  configurable: true
});
Object.defineProperty(window, '_sidebarWasCollapsed', {
  get() { return _sidebarWasCollapsed; },
  set(v) { _sidebarWasCollapsed = v; },
  configurable: true
});
Object.defineProperty(window, '_designRegion', {
  get() { return _designRegion; },
  set(v) { _designRegion = v; },
  configurable: true
});
window._regionAZs = _regionAZs;
window._awsConstraints = _awsConstraints;
window._designApplyFns = _designApplyFns;
window.validateDesignChange = validateDesignChange;
window.validateDesignState = validateDesignState;
window._generateCLI = _generateCLI;
window._generateWarnings = _generateWarnings;
window.importDesignPlan = importDesignPlan;
window.detectAZs = detectAZs;

// State sync helpers: inline code mutates the module state via these
window.getDesignMode = getDesignMode;
window.setDesignMode = setDesignMode;
window.getDesignChanges = getDesignChanges;
window.setDesignChanges = setDesignChanges;
window.getDesignBaseline = getDesignBaseline;
window.setDesignBaseline = setDesignBaseline;
window.getDesignDebounce = getDesignDebounce;
window.setDesignDebounce = setDesignDebounce;
window.getLastDesignValidation = getLastDesignValidation;
window.setLastDesignValidation = setLastDesignValidation;
window.getSidebarWasCollapsed = getSidebarWasCollapsed;
window.setSidebarWasCollapsed = setSidebarWasCollapsed;
window.getDesignRegion = getDesignRegion;
window.setDesignRegion = setDesignRegion;
