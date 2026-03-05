/**
 * Pure diff logic — resource normalization, field diffing, change classification.
 * No DOM dependencies. Consumed by app-core.js via window._core at call time.
 */

const DIFF_KEYS = {
  vpcs:'VpcId',subnets:'SubnetId',instances:'InstanceId',
  sgs:'GroupId',rts:'RouteTableId',nacls:'NetworkAclId',
  igws:'InternetGatewayId',nats:'NatGatewayId',
  vpces:'VpcEndpointId',albs:'LoadBalancerArn',
  rdsInstances:'DBInstanceIdentifier',ecsServices:'serviceName',
  lambdaFns:'FunctionName',ecacheClusters:'CacheClusterId',
  redshiftClusters:'ClusterIdentifier',peerings:'VpcPeeringConnectionId'
};

const DIFF_VOLATILE = new Set([
  'LaunchTime','CreateTime','CreateDate','AttachTime','StartTime',
  'StatusMessage','TransitionReason','LastModifiedTime',
  'InstanceCreateTime','LatestRestorableTime','ReadyDateTime',
  'ClusterCreateTime',
  '_accountId','_accountLabel','_sourceFile','_vpcId'
]);

const DIFF_STRUCTURAL = new Set([
  'CidrBlock','AvailabilityZone','InstanceType','Engine','EngineVersion',
  'VpcId','SubnetId','FromPort','ToPort','IpProtocol','CidrIp',
  'Port','DBInstanceClass','NodeType','Runtime','MemorySize','Timeout',
  'CacheNodeType','ClusterType','NumberOfNodes','Scheme','Type'
]);

function normalizeResource(resource) {
  const clone = structuredClone(resource);
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      const mapped = obj.map(walk);
      const ser = mapped.map(x => JSON.stringify(x));
      const idx = ser.map((_, i) => i);
      idx.sort((a, b) => ser[a].localeCompare(ser[b]));
      return idx.map(i => mapped[i]);
    }
    const out = {};
    Object.keys(obj).sort().forEach(k => {
      if (DIFF_VOLATILE.has(k)) return;
      out[k] = walk(obj[k]);
    });
    return out;
  }
  return walk(clone);
}

function normalizeSG(sg) {
  const clone = structuredClone(sg);
  function sortPerms(perms) {
    if (!Array.isArray(perms)) return perms;
    return perms.map(p => {
      const np = { ...p };
      if (np.IpRanges) np.IpRanges = [...np.IpRanges].sort((a, b) => (a.CidrIp || '').localeCompare(b.CidrIp || ''));
      if (np.Ipv6Ranges) np.Ipv6Ranges = [...np.Ipv6Ranges].sort((a, b) => (a.CidrIpv6 || '').localeCompare(b.CidrIpv6 || ''));
      if (np.UserIdGroupPairs) np.UserIdGroupPairs = [...np.UserIdGroupPairs].sort((a, b) => (a.GroupId || '').localeCompare(b.GroupId || ''));
      if (np.PrefixListIds) np.PrefixListIds = [...np.PrefixListIds].sort((a, b) => (a.PrefixListId || '').localeCompare(b.PrefixListId || ''));
      return np;
    }).sort((a, b) => {
      const ak = (a.FromPort || 0) + '-' + (a.ToPort || 0) + '-' + (a.IpProtocol || '');
      const bk = (b.FromPort || 0) + '-' + (b.ToPort || 0) + '-' + (b.IpProtocol || '');
      return ak.localeCompare(bk);
    });
  }
  if (clone.IpPermissions) clone.IpPermissions = sortPerms(clone.IpPermissions);
  if (clone.IpPermissionsEgress) clone.IpPermissionsEgress = sortPerms(clone.IpPermissionsEgress);
  return normalizeResource(clone);
}

function classifyChange(field) {
  if (DIFF_STRUCTURAL.has(field)) return 'structural';
  if (field === 'Tags' || field === 'TagSet' || field === 'Name' || field === 'Description') return 'metadata';
  return 'structural';
}

const _diffStrCache = new WeakMap();
function _diffStr(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (_diffStrCache.has(obj)) return _diffStrCache.get(obj);
  var s = JSON.stringify(obj);
  _diffStrCache.set(obj, s);
  return s;
}

function _fieldDiff(normA, normB, path) {
  const changes = [];
  if (normA === normB) return changes;
  if (typeof normA !== typeof normB || normA === null || normB === null || typeof normA !== 'object') {
    changes.push({ field: path, old: normA, new: normB, kind: classifyChange(path.split('.').pop()) });
    return changes;
  }
  if (Array.isArray(normA) && Array.isArray(normB)) {
    if (_diffStr(normA) !== _diffStr(normB)) changes.push({ field: path, old: normA, new: normB, kind: classifyChange(path.split('.').pop()) });
    return changes;
  }
  const allKeys = new Set([...Object.keys(normA), ...Object.keys(normB)]);
  allKeys.forEach(k => {
    const sub = path ? path + '.' + k : k;
    if (!(k in normA)) { changes.push({ field: sub, old: undefined, new: normB[k], kind: classifyChange(k) }); return; }
    if (!(k in normB)) { changes.push({ field: sub, old: normA[k], new: undefined, kind: classifyChange(k) }); return; }
    if (_diffStr(normA[k]) !== _diffStr(normB[k])) {
      if (typeof normA[k] === 'object' && typeof normB[k] === 'object' && normA[k] && normB[k]) {
        changes.push(..._fieldDiff(normA[k], normB[k], sub));
      } else {
        changes.push({ field: sub, old: normA[k], new: normB[k], kind: classifyChange(k) });
      }
    }
  });
  return changes;
}

function _diffResName(res, fallback) {
  if (!res) return fallback;
  const tags = res.Tags || res.TagSet || [];
  const nt = tags.find(t => t.Key === 'Name');
  if (nt && nt.Value) return nt.Value;
  return res.DBInstanceIdentifier || res.FunctionName || res.serviceName || res.CacheClusterId || res.ClusterIdentifier || fallback;
}

function computeDiff(baseline, current) {
  const results = { added: [], removed: [], modified: [], unchanged: [], total: { added: 0, removed: 0, modified: 0, unchanged: 0 } };
  Object.entries(DIFF_KEYS).forEach(([type, pk]) => {
    const bArr = baseline[type] || [];
    const cArr = current[type] || [];
    const bMap = new Map();
    const cMap = new Map();
    bArr.forEach(r => { const key = r[pk]; if (key) bMap.set(key, r); });
    cArr.forEach(r => { const key = r[pk]; if (key) cMap.set(key, r); });
    cMap.forEach((res, key) => {
      if (!bMap.has(key)) {
        results.added.push({ type, key, name: _diffResName(res, key), resource: res });
        results.total.added++;
      }
    });
    bMap.forEach((res, key) => {
      if (!cMap.has(key)) {
        results.removed.push({ type, key, name: _diffResName(res, key), resource: res });
        results.total.removed++;
      }
    });
    bMap.forEach((bRes, key) => {
      if (!cMap.has(key)) return;
      const cRes = cMap.get(key);
      const normB = type === 'sgs' ? normalizeSG(bRes) : normalizeResource(bRes);
      const normC = type === 'sgs' ? normalizeSG(cRes) : normalizeResource(cRes);
      const sB = JSON.stringify(normB);
      const sC = JSON.stringify(normC);
      if (sB === sC) {
        results.unchanged.push({ type, key, name: _diffResName(cRes, key), resource: cRes });
        results.total.unchanged++;
      } else {
        const fields = _fieldDiff(normB, normC, '');
        if (fields.length === 0) {
          results.unchanged.push({ type, key, name: _diffResName(cRes, key), resource: cRes });
          results.total.unchanged++;
        } else {
          const hasStructural = fields.some(f => f.kind === 'structural');
          results.modified.push({ type, key, name: _diffResName(cRes, key), fields, hasStructural, resource: cRes, baseline: bRes });
          results.total.modified++;
        }
      }
    });
  });
  return results;
}

export {
  DIFF_KEYS as _DIFF_KEYS,
  DIFF_VOLATILE as _DIFF_VOLATILE,
  DIFF_STRUCTURAL as _DIFF_STRUCTURAL,
  normalizeResource, normalizeSG, classifyChange,
  _fieldDiff, computeDiff, _diffResName
};
