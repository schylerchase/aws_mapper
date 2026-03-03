// Firewall Editor — pure logic (state, validation, CRUD, CLI generation)
// DOM rendering and form creation remain inline in index.html.

// ── State ──────────────────────────────────────────────────────────────
let _fwEdits = [];
let _fwSnapshot = null;
let _fwFpType = null;
let _fwFpResId = null;
let _fwFpSub = null;
let _fwFpVpcId = null;
let _fwFpLk = null;
let _fwFpDir = 'ingress';

// ── State accessors ────────────────────────────────────────────────────

export function getFwEdits() { return _fwEdits; }
export function setFwEdits(v) { _fwEdits = v; }

export function getFwSnapshot() { return _fwSnapshot; }
export function setFwSnapshot(v) { _fwSnapshot = v; }

export function getFwFpType() { return _fwFpType; }
export function setFwFpType(v) { _fwFpType = v; }

export function getFwFpResId() { return _fwFpResId; }
export function setFwFpResId(v) { _fwFpResId = v; }

export function getFwFpSub() { return _fwFpSub; }
export function setFwFpSub(v) { _fwFpSub = v; }

export function getFwFpVpcId() { return _fwFpVpcId; }
export function setFwFpVpcId(v) { _fwFpVpcId = v; }

export function getFwFpLk() { return _fwFpLk; }
export function setFwFpLk(v) { _fwFpLk = v; }

export function getFwFpDir() { return _fwFpDir; }
export function setFwFpDir(v) { _fwFpDir = v; }

// ── Protocol label helper ──────────────────────────────────────────────

/**
 * Human-readable label for a numeric IP protocol.
 * @param {string|number} proto
 * @returns {string}
 */
export function fwProtoLabel(proto) {
  const p = String(proto);
  if (p === '6') return 'TCP';
  if (p === '17') return 'UDP';
  if (p === '1') return 'ICMP';
  if (p === '-1') return 'ALL';
  return p;
}

// ── Rule equality ──────────────────────────────────────────────────────

/**
 * Compare two SG permission objects for logical equality.
 * Matches on protocol, port range, CIDRs, and SG references.
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
export function fwRuleMatch(a, b) {
  if (!a || !b) return false;
  if (String(a.IpProtocol) !== String(b.IpProtocol)) return false;
  if ((a.FromPort || 0) !== (b.FromPort || 0)) return false;
  if ((a.ToPort || 0) !== (b.ToPort || 0)) return false;
  const aCidrs = (a.IpRanges || []).map(r => r.CidrIp).sort().join(',');
  const bCidrs = (b.IpRanges || []).map(r => r.CidrIp).sort().join(',');
  if (aCidrs !== bCidrs) return false;
  const aGrps = (a.UserIdGroupPairs || []).map(g => g.GroupId).sort().join(',');
  const bGrps = (b.UserIdGroupPairs || []).map(g => g.GroupId).sort().join(',');
  return aGrps === bGrps;
}

// ── Edit count ─────────────────────────────────────────────────────────

/**
 * Count edits targeting a specific resource.
 * @param {string} resourceId
 * @returns {number}
 */
export function fwEditCount(resourceId) {
  return _fwEdits.filter(e => e.resourceId === resourceId).length;
}

// ── Validation ─────────────────────────────────────────────────────────

/**
 * Validate a CIDR string (IPv4 only).
 * @param {string} cidr
 * @returns {boolean}
 */
export function fwValidateCidr(cidr) {
  if (!cidr || typeof cidr !== 'string') return false;
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(cidr)) return false;
  const parts = cidr.split('/');
  const octets = parts[0].split('.');
  for (let i = 0; i < 4; i++) {
    if (parseInt(octets[i], 10) > 255) return false;
  }
  if (parseInt(parts[1], 10) > 32) return false;
  return true;
}

/**
 * Validate a NACL rule object.
 * @param {Object} rule - Rule with RuleNumber, Protocol, CidrBlock, PortRange
 * @param {Object[]} existingEntries - Current entries (for duplicate check)
 * @param {string} direction - 'ingress' or 'egress'
 * @returns {string[]} Array of error messages (empty = valid)
 */
export function fwValidateNaclRule(rule, existingEntries, direction) {
  const errs = [];
  const num = parseInt(rule.RuleNumber, 10);
  if (isNaN(num) || num < 1 || num > 32766) {
    errs.push('Rule number must be 1-32766');
  }
  const isEgress = direction === 'egress';
  if (existingEntries && !isNaN(num)) {
    const dup = existingEntries.some(e =>
      e.RuleNumber === num && e.Egress === isEgress
    );
    if (dup) errs.push('Duplicate rule number ' + num + ' in ' + direction + ' direction');
  }
  if (!fwValidateCidr(rule.CidrBlock)) errs.push('Invalid CIDR format');
  const proto = String(rule.Protocol);
  if (proto === '6' || proto === '17') {
    if (!rule.PortRange) {
      errs.push('Port range required for TCP/UDP');
    } else {
      const from = parseInt(rule.PortRange.From, 10);
      const to = parseInt(rule.PortRange.To, 10);
      if (isNaN(from) || isNaN(to)) {
        errs.push('Invalid port range values');
      } else {
        if (from < 0 || from > 65535) errs.push('From port must be 0-65535');
        if (to < 0 || to > 65535) errs.push('To port must be 0-65535');
        if (from > to) errs.push('From port must be <= To port');
      }
    }
  }
  return errs;
}

/**
 * Validate a Security Group rule object.
 * @param {Object} rule - Rule with IpProtocol, FromPort, ToPort, IpRanges, UserIdGroupPairs
 * @returns {string[]} Array of error messages (empty = valid)
 */
export function fwValidateSgRule(rule) {
  const errs = [];
  const proto = String(rule.IpProtocol || '');
  const validProtos = ['tcp', 'udp', 'icmp', '-1'];
  if (!validProtos.includes(proto)) errs.push('Invalid protocol: ' + proto);
  if (proto === 'tcp' || proto === 'udp') {
    const from = parseInt(rule.FromPort, 10);
    const to = parseInt(rule.ToPort, 10);
    if (isNaN(from) || isNaN(to)) {
      errs.push('Port range required for TCP/UDP');
    } else {
      if (from < 0 || from > 65535) errs.push('FromPort must be 0-65535');
      if (to < 0 || to > 65535) errs.push('ToPort must be 0-65535');
      if (from > to) errs.push('FromPort must be <= ToPort');
    }
  }
  const hasCidr = (rule.IpRanges || []).some(r => r.CidrIp);
  const hasSgRef = (rule.UserIdGroupPairs || []).some(g => g.GroupId);
  if (!hasCidr && !hasSgRef) {
    errs.push('At least one source (CIDR or SG reference) required');
  }
  if (hasCidr) {
    (rule.IpRanges || []).forEach(r => {
      if (r.CidrIp && !fwValidateCidr(r.CidrIp)) errs.push('Invalid CIDR: ' + r.CidrIp);
    });
  }
  return errs;
}

/**
 * Validate a route table route object.
 * @param {Object} route - Route with DestinationCidrBlock and target fields
 * @param {Object[]} existingRoutes - Current routes (for duplicate check)
 * @returns {string[]} Array of error messages (empty = valid)
 */
export function fwValidateRoute(route, existingRoutes) {
  const errs = [];
  if (!fwValidateCidr(route.DestinationCidrBlock)) errs.push('Invalid destination CIDR');
  if (existingRoutes) {
    const dup = existingRoutes.some(r =>
      r.DestinationCidrBlock === route.DestinationCidrBlock
    );
    if (dup) errs.push('Duplicate destination CIDR: ' + route.DestinationCidrBlock);
  }
  const hasTarget = route.GatewayId || route.NatGatewayId ||
    route.TransitGatewayId || route.VpcPeeringConnectionId || route.VpcEndpointId;
  if (!hasTarget) errs.push('Route target required');
  return errs;
}

// ── Shadow detection ───────────────────────────────────────────────────

/**
 * Detect NACL rules that are shadowed by earlier (lower-numbered) rules.
 * @param {Object} nacl - NACL object with Entries array
 * @param {string} direction - 'ingress' or 'egress'
 * @returns {string[]} Human-readable warning messages
 */
export function fwCheckNaclShadow(nacl, direction) {
  if (!nacl || !nacl.Entries) return [];
  const isEgress = direction === 'egress';
  const entries = (nacl.Entries || [])
    .filter(e => e.Egress === isEgress && e.RuleNumber !== 32767)
    .sort((a, b) => a.RuleNumber - b.RuleNumber);
  const warnings = [];
  for (let i = 1; i < entries.length; i++) {
    for (let j = 0; j < i; j++) {
      const hi = entries[i];
      const lo = entries[j];
      const sameCidr = (hi.CidrBlock || '') === (lo.CidrBlock || '');
      const sameProto = (hi.Protocol || '') === (lo.Protocol || '') || lo.Protocol === '-1';
      if (sameCidr && sameProto && hi.RuleAction !== lo.RuleAction) {
        warnings.push(
          'Rule #' + hi.RuleNumber + ' (' + hi.RuleAction + ') is shadowed by #' +
          lo.RuleNumber + ' (' + lo.RuleAction + ') — same CIDR ' +
          (hi.CidrBlock || 'any') + ', evaluated first'
        );
      }
    }
  }
  return warnings;
}

// ── CLI generation ─────────────────────────────────────────────────────

/**
 * Build AWS CLI commands for a list of edits.
 * @param {Object[]} [edits] - Edit objects; defaults to internal _fwEdits
 * @returns {string[]} Array of CLI command strings
 */
export function fwGenerateCli(edits) {
  const list = edits || _fwEdits;
  const cmds = [];
  list.forEach(edit => {
    if (edit.type === 'nacl') fwGenNaclCli(edit, cmds);
    else if (edit.type === 'sg') fwGenSgCli(edit, cmds);
    else if (edit.type === 'route') fwGenRouteCli(edit, cmds);
  });
  return cmds;
}

/**
 * Append NACL CLI command(s) for a single edit.
 * @param {Object} edit
 * @param {string[]} cmds - Accumulator array
 */
export function fwGenNaclCli(edit, cmds) {
  const id = edit.resourceId;
  const dirFlag = edit.direction === 'egress' ? '--egress' : '--ingress';
  if (edit.action === 'add') {
    cmds.push(_fwNaclEntryCmd('create-network-acl-entry', id, edit.rule, dirFlag));
  } else if (edit.action === 'modify') {
    cmds.push(_fwNaclEntryCmd('replace-network-acl-entry', id, edit.rule, dirFlag));
  } else if (edit.action === 'delete') {
    cmds.push(
      'aws ec2 delete-network-acl-entry --network-acl-id ' + id +
      ' --rule-number ' + edit.rule.RuleNumber + ' ' + dirFlag
    );
  }
}

function _fwNaclEntryCmd(verb, naclId, rule, dirFlag) {
  let cmd = 'aws ec2 ' + verb + ' --network-acl-id ' + naclId +
    ' --rule-number ' + rule.RuleNumber + ' ' + dirFlag +
    ' --protocol ' + rule.Protocol +
    ' --cidr-block ' + rule.CidrBlock;
  if (rule.PortRange) {
    cmd += ' --port-range From=' + rule.PortRange.From + ',To=' + rule.PortRange.To;
  }
  cmd += ' --rule-action ' + rule.RuleAction;
  return cmd;
}

/**
 * Append SG CLI command(s) for a single edit.
 * @param {Object} edit
 * @param {string[]} cmds - Accumulator array
 */
export function fwGenSgCli(edit, cmds) {
  const id = edit.resourceId;
  const suffix = edit.direction === 'ingress' ? 'ingress' : 'egress';
  if (edit.action === 'add') {
    cmds.push(_fwSgRuleCmd('authorize-security-group-' + suffix, id, edit.rule));
  } else if (edit.action === 'delete') {
    cmds.push(_fwSgRuleCmd('revoke-security-group-' + suffix, id, edit.rule));
  } else if (edit.action === 'modify') {
    if (edit.originalRule) {
      cmds.push(_fwSgRuleCmd('revoke-security-group-' + suffix, id, edit.originalRule));
    }
    cmds.push(_fwSgRuleCmd('authorize-security-group-' + suffix, id, edit.rule));
  }
}

function _fwSgRuleCmd(verb, sgId, rule) {
  let cmd = 'aws ec2 ' + verb + ' --group-id ' + sgId +
    ' --protocol ' + rule.IpProtocol;
  if (rule.FromPort !== undefined && rule.FromPort !== -1) {
    cmd += ' --port ' + rule.FromPort;
    if (rule.ToPort !== undefined && rule.ToPort !== rule.FromPort) {
      cmd += '-' + rule.ToPort;
    }
  }
  const cidrs = (rule.IpRanges || []).map(r => r.CidrIp).filter(Boolean);
  const sgRefs = (rule.UserIdGroupPairs || []).map(g => g.GroupId).filter(Boolean);
  if (cidrs.length) cmd += ' --cidr ' + cidrs[0];
  else if (sgRefs.length) cmd += ' --source-group ' + sgRefs[0];
  return cmd;
}

/**
 * Append route CLI command(s) for a single edit.
 * @param {Object} edit
 * @param {string[]} cmds - Accumulator array
 */
export function fwGenRouteCli(edit, cmds) {
  const id = edit.resourceId;
  if (edit.action === 'add') {
    cmds.push(_fwRouteCmd('create-route', id, edit.rule));
  } else if (edit.action === 'modify') {
    cmds.push(_fwRouteCmd('replace-route', id, edit.rule));
  } else if (edit.action === 'delete') {
    cmds.push(
      'aws ec2 delete-route --route-table-id ' + id +
      ' --destination-cidr-block ' + edit.rule.DestinationCidrBlock
    );
  }
}

function _fwRouteCmd(verb, rtId, route) {
  let cmd = 'aws ec2 ' + verb + ' --route-table-id ' + rtId +
    ' --destination-cidr-block ' + route.DestinationCidrBlock;
  if (route.GatewayId) cmd += ' --gateway-id ' + route.GatewayId;
  else if (route.NatGatewayId) cmd += ' --nat-gateway-id ' + route.NatGatewayId;
  else if (route.TransitGatewayId) cmd += ' --transit-gateway-id ' + route.TransitGatewayId;
  else if (route.VpcPeeringConnectionId) cmd += ' --vpc-peering-connection-id ' + route.VpcPeeringConnectionId;
  else if (route.VpcEndpointId) cmd += ' --vpc-endpoint-id ' + route.VpcEndpointId;
  return cmd;
}

// ── Snapshot / reset ───────────────────────────────────────────────────

/**
 * Take a deep-copy snapshot of nacls/sgs/rts from the given context.
 * No-op if a snapshot already exists.
 * @param {Object} ctx - The _rlCtx context object
 */
export function fwTakeSnapshot(ctx) {
  if (_fwSnapshot) return;
  if (!ctx) return;
  _fwSnapshot = {
    nacls: JSON.parse(JSON.stringify(ctx.nacls || [])),
    sgs: JSON.parse(JSON.stringify(ctx.sgs || [])),
    rts: JSON.parse(JSON.stringify(ctx.rts || []))
  };
}

/**
 * Restore nacls/sgs/rts from the snapshot, clear edits, and rebuild lookups.
 * Preserves the original array references in ctx.
 * @param {Object} ctx - The _rlCtx context object
 */
export function fwResetAll(ctx) {
  if (!_fwSnapshot || !ctx) return;
  ctx.nacls.length = 0;
  _fwSnapshot.nacls.forEach(n => ctx.nacls.push(JSON.parse(JSON.stringify(n))));
  ctx.sgs.length = 0;
  _fwSnapshot.sgs.forEach(s => ctx.sgs.push(JSON.parse(JSON.stringify(s))));
  ctx.rts.length = 0;
  _fwSnapshot.rts.forEach(r => ctx.rts.push(JSON.parse(JSON.stringify(r))));
  fwRebuildLookups(ctx);
  _fwEdits = [];
  _fwSnapshot = null;
}

// ── Lookup rebuilding ──────────────────────────────────────────────────

/**
 * Rebuild derived lookup maps (subNacl, subRT, sgByVpc) on ctx.
 * @param {Object} ctx - The _rlCtx context object
 */
export function fwRebuildLookups(ctx) {
  if (!ctx) return;

  // subNacl: SubnetId -> NACL
  const subNacl = {};
  (ctx.nacls || []).forEach(n => {
    (n.Associations || []).forEach(a => {
      if (a.SubnetId) subNacl[a.SubnetId] = n;
    });
  });
  ctx.subNacl = subNacl;

  // subRT: SubnetId -> RouteTable (with main RT fallback)
  const mainRT = {};
  (ctx.rts || []).forEach(rt => {
    if ((rt.Associations || []).some(a => a.Main)) mainRT[rt.VpcId] = rt;
  });
  const subRT = {};
  (ctx.rts || []).forEach(rt => {
    (rt.Associations || []).forEach(a => {
      if (a.SubnetId) subRT[a.SubnetId] = rt;
    });
  });
  (ctx.subnets || []).forEach(s => {
    if (!subRT[s.SubnetId] && mainRT[s.VpcId]) subRT[s.SubnetId] = mainRT[s.VpcId];
  });
  ctx.subRT = subRT;

  // sgByVpc: VpcId -> SG[]
  const sgByVpc = {};
  (ctx.sgs || []).forEach(sg => {
    (sgByVpc[sg.VpcId] = sgByVpc[sg.VpcId] || []).push(sg);
  });
  ctx.sgByVpc = sgByVpc;
}

// ── Rule CRUD ──────────────────────────────────────────────────────────

/**
 * Remove a rule from context arrays based on an edit descriptor.
 * @param {Object} edit - Edit object with type, resourceId, direction, rule
 * @param {Object} ctx - The _rlCtx context object
 */
export function fwRemoveRule(edit, ctx) {
  if (edit.type === 'nacl') {
    const nacl = (ctx.nacls || []).find(n => n.NetworkAclId === edit.resourceId);
    if (!nacl) return;
    const isEgress = edit.direction === 'egress';
    const idx = (nacl.Entries || []).findIndex(e =>
      e.RuleNumber === edit.rule.RuleNumber && e.Egress === isEgress
    );
    if (idx >= 0) nacl.Entries.splice(idx, 1);
  } else if (edit.type === 'sg') {
    const sg = (ctx.sgs || []).find(s => s.GroupId === edit.resourceId);
    if (!sg) return;
    const arr = edit.direction === 'ingress' ? sg.IpPermissions : sg.IpPermissionsEgress;
    if (!arr) return;
    const idx = arr.findIndex(p => fwRuleMatch(p, edit.rule));
    if (idx >= 0) arr.splice(idx, 1);
  } else if (edit.type === 'route') {
    const rt = (ctx.rts || []).find(r => r.RouteTableId === edit.resourceId);
    if (!rt || !rt.Routes) return;
    const idx = rt.Routes.findIndex(r => r.DestinationCidrBlock === edit.rule.DestinationCidrBlock);
    if (idx >= 0) rt.Routes.splice(idx, 1);
  }
}

/**
 * Restore a previously deleted rule via its originalRule field.
 * @param {Object} edit - Edit object (must have originalRule)
 * @param {Object} ctx - The _rlCtx context object
 */
export function fwRestoreRule(edit, ctx) {
  if (edit.originalRule) {
    fwApplyRule(edit.type, edit.resourceId, edit.direction, edit.originalRule, ctx);
  }
}

/**
 * Upsert a rule into the appropriate context array.
 * @param {string} type - 'nacl', 'sg', or 'route'
 * @param {string} resourceId - The resource ID
 * @param {string} direction - 'ingress' or 'egress'
 * @param {Object} ruleData - The rule to apply
 * @param {Object} ctx - The _rlCtx context object
 */
export function fwApplyRule(type, resourceId, direction, ruleData, ctx) {
  if (type === 'nacl') {
    const nacl = (ctx.nacls || []).find(n => n.NetworkAclId === resourceId);
    if (!nacl) return;
    if (!nacl.Entries) nacl.Entries = [];
    const isEgress = direction === 'egress';
    const idx = nacl.Entries.findIndex(e =>
      e.RuleNumber === ruleData.RuleNumber && e.Egress === isEgress
    );
    const entry = Object.assign({}, ruleData, { Egress: isEgress });
    if (idx >= 0) nacl.Entries[idx] = entry;
    else nacl.Entries.push(entry);
  } else if (type === 'sg') {
    const sg = (ctx.sgs || []).find(s => s.GroupId === resourceId);
    if (!sg) return;
    const key = direction === 'ingress' ? 'IpPermissions' : 'IpPermissionsEgress';
    if (!sg[key]) sg[key] = [];
    const arr = sg[key];
    const idx = arr.findIndex(p => fwRuleMatch(p, ruleData));
    if (idx >= 0) arr[idx] = Object.assign({}, ruleData);
    else arr.push(Object.assign({}, ruleData));
  } else if (type === 'route') {
    const rt = (ctx.rts || []).find(r => r.RouteTableId === resourceId);
    if (!rt) return;
    if (!rt.Routes) rt.Routes = [];
    const idx = rt.Routes.findIndex(r => r.DestinationCidrBlock === ruleData.DestinationCidrBlock);
    if (idx >= 0) rt.Routes[idx] = Object.assign({}, ruleData);
    else rt.Routes.push(Object.assign({}, ruleData));
  }
}

// ── Undo ───────────────────────────────────────────────────────────────

/**
 * Undo the most recent edit, reversing its effect on ctx arrays.
 * @param {Object} ctx - The _rlCtx context object
 * @returns {Object|null} The undone edit, or null if nothing to undo
 */
export function fwUndo(ctx) {
  if (!_fwEdits.length) return null;
  const edit = _fwEdits.pop();
  if (edit.action === 'add') fwRemoveRule(edit, ctx);
  else if (edit.action === 'delete') fwRestoreRule(edit, ctx);
  else if (edit.action === 'modify') {
    fwApplyRule(edit.type, edit.resourceId, edit.direction, edit.originalRule, ctx);
  }
  fwRebuildLookups(ctx);
  return edit;
}
