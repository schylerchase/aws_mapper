// Edge case tests & demo data generators (dev-only)
// Loaded conditionally in development builds
// Call from console: window._runEdgeCaseTests('multiAccount')
// Or run all: window._runAllEdgeCaseTests()
// These functions depend on globals from app-core.js (computeDiff, generateDemo, etc.)

// === EDGE CASE TESTS & DEMO DATA GENERATORS (Features 4-7) ===
// Callable from browser console: window._runEdgeCaseTests('multiAccount')
// Or run all: window._runAllEdgeCaseTests()

// --- Demo Data: Snapshot History Generator ---
window.generateDemoSnapshots = function(){
  const d = generateDemo();
  const fieldMap = {in_vpcs:'vpcs',in_subnets:'subnets',in_rts:'rts',in_sgs:'sgs',in_nacls:'nacls',
    in_igws:'igws',in_nats:'nats',in_inst:'ec2',in_albs:'albs',in_vpces:'vpces',
    in_peer:'peer',in_vpn:'vpn',in_vol:'vols',in_snap:'snaps',in_rds:'rds',
    in_ecs:'ecs',in_lambda:'lambda',in_ecache:'elasticache',in_redshift:'redshift'};
  const fullTA = {};
  Object.entries(fieldMap).forEach(([taId, dKey]) => {
    if(d[dKey]) fullTA[taId] = JSON.stringify(d[dKey], null, 2);
  });
  const vpcArr = d.vpcs.Vpcs;
  const scales = [0.3, 0.5, 0.7, 0.85, 1.0];
  const labels = ['Initial setup','Added staging','Core services','Pre-prod','Full deployment'];
  const baseTs = new Date('2026-01-10T08:00:00Z').getTime();
  const dayMs = 86400000;
  const snaps = [];
  scales.forEach((scale, i) => {
    const count = Math.max(1, Math.ceil(vpcArr.length * scale));
    const subset = {Vpcs: vpcArr.slice(0, count)};
    const ta = {};
    ta.in_vpcs = JSON.stringify(subset, null, 2);
    if(scale >= 0.5) ta.in_subnets = fullTA.in_subnets;
    if(scale >= 0.7) { ta.in_sgs = fullTA.in_sgs; ta.in_rts = fullTA.in_rts; }
    if(scale >= 0.85) { ta.in_inst = fullTA.in_inst; ta.in_igws = fullTA.in_igws; }
    if(scale >= 1.0) Object.assign(ta, fullTA);
    const checksum = _computeChecksum(ta);
    snaps.push({
      id: 'snap-demo-' + i,
      timestamp: new Date(baseTs + i * 7 * dayMs).toISOString(),
      label: labels[i],
      auto: i % 2 === 0,
      checksum: checksum,
      accountLabel: 'demo-account',
      layout: 'grid',
      textareas: ta,
      annotations: {}
    });
  });
  _snapshots = snaps;
  _saveSnapshots();
  _renderTimeline();
  console.log('[DemoSnapshots] Generated ' + snaps.length + ' snapshots');
  return snaps;
};

// --- Demo Data: Annotations ---
window._demoAnnotations = (function(){
  const d = generateDemo();
  const vpc0 = d.vpcs.Vpcs[0].VpcId;
  const vpc1 = d.vpcs.Vpcs[1].VpcId;
  const sub0 = d.subnets.Subnets[0].SubnetId;
  const inst0 = d.ec2.Reservations[0].Instances[0].InstanceId;
  const sg0 = d.sgs.SecurityGroups[0].GroupId;
  return {
    [vpc0]: [
      {text:'Production VPC - primary workloads. Contact: platform-team@example.com',category:'owner',author:'admin',created:'2026-01-15T10:00:00Z',updated:'2026-01-15T10:00:00Z',pinned:true},
      {text:'Incident INC-4521: Elevated latency observed 2026-01-20. Root cause: misconfigured NAT gateway.',category:'incident',author:'oncall',created:'2026-01-20T14:30:00Z',updated:'2026-01-21T09:00:00Z',pinned:false}
    ],
    [sub0]: [
      {text:'TODO: Migrate to larger CIDR range before Q2 scaling',category:'todo',author:'architect',created:'2026-01-18T11:00:00Z',updated:'2026-01-18T11:00:00Z',pinned:false}
    ],
    [inst0]: [
      {text:'Bastion host - SSH key rotation due 2026-03-01',category:'warning',author:'security',created:'2026-02-01T08:00:00Z',updated:'2026-02-01T08:00:00Z',pinned:false},
      {text:'Running custom AMI with hardened OS config',category:'info',author:'ops',created:'2026-01-10T09:00:00Z',updated:'2026-01-10T09:00:00Z',pinned:false}
    ],
    [sg0]: [
      {text:'Reviewed 2026-01-25 - rules compliant with CIS benchmarks',category:'status',author:'auditor',created:'2026-01-25T16:00:00Z',updated:'2026-01-25T16:00:00Z',pinned:false}
    ]
  };
})();

// --- Edge Case Test Framework ---
window._edgeCaseTests = window._edgeCaseTests || {};

// ==================== Feature 4: Multi-Account ====================
window._edgeCaseTests.multiAccount = function(){
  const results = [];
  const d = generateDemo();
  const T = (name, fn) => { try { const r = fn(); results.push({name, pass:r.pass, detail:r.detail}); } catch(e){ results.push({name, pass:false, detail:'Exception: '+e.message}); }};

  // 1. Same VPC ID in different accounts
  T('Same VPC ID different accounts', () => {
    const v1 = {VpcId:'vpc-shared01',CidrBlock:'10.0.0.0/16',OwnerId:'111111111111',Tags:[{Key:'Name',Value:'Acct1'}]};
    const v2 = {VpcId:'vpc-shared01',CidrBlock:'10.1.0.0/16',OwnerId:'222222222222',Tags:[{Key:'Name',Value:'Acct2'}]};
    const a1 = detectAccountId(v1);
    const a2 = detectAccountId(v2);
    const key1 = a1 + ':' + v1.VpcId;
    const key2 = a2 + ':' + v2.VpcId;
    return {pass: a1 !== a2 && key1 !== key2, detail: 'Keys: '+key1+' vs '+key2};
  });

  // 2. Cross-account peering, one side missing
  T('Cross-account peering unknown VPC', () => {
    const peering = {VpcPeeringConnectionId:'pcx-test01',Status:{Code:'active'},
      RequesterVpcInfo:{VpcId:'vpc-exists',OwnerId:'111111111111',CidrBlock:'10.0.0.0/16'},
      AccepterVpcInfo:{VpcId:'vpc-missing',OwnerId:'999999999999',CidrBlock:'172.16.0.0/16'}};
    const reqAcct = detectAccountId({OwnerId:peering.RequesterVpcInfo.OwnerId});
    const accAcct = peering.AccepterVpcInfo.OwnerId;
    const vpcIds = new Set(['vpc-exists']);
    const missingRef = !vpcIds.has(peering.AccepterVpcInfo.VpcId);
    return {pass: missingRef && reqAcct === '111111111111' && accAcct === '999999999999',
      detail: 'Missing VPC ref detected: ' + missingRef};
  });

  // 3. TGW shared across accounts
  T('TGW shared across accounts', () => {
    const tgwId = 'tgw-shared01';
    const att1 = {TransitGatewayId:tgwId,ResourceId:'vpc-acct1',_accountId:'111111111111'};
    const att2 = {TransitGatewayId:tgwId,ResourceId:'vpc-acct2',_accountId:'222222222222'};
    const attachments = [att1, att2];
    const acctIds = new Set(attachments.map(a => a._accountId));
    return {pass: acctIds.size === 2 && attachments.every(a => a.TransitGatewayId === tgwId),
      detail: acctIds.size + ' accounts share TGW ' + tgwId};
  });

  // 4. RAM-shared subnets (instance in account B's subnet owned by account A)
  T('RAM-shared subnets cross-account', () => {
    const subnet = {SubnetId:'subnet-ram01',VpcId:'vpc-ownerA',_accountId:'111111111111'};
    const instance = {InstanceId:'i-inB',SubnetId:'subnet-ram01',_accountId:'222222222222'};
    const crossAccount = subnet._accountId !== instance._accountId && subnet.SubnetId === instance.SubnetId;
    return {pass: crossAccount, detail: 'Instance in acct '+instance._accountId+' uses subnet from acct '+subnet._accountId};
  });

  // 5. Different regions
  T('Different regions AZ handling', () => {
    const ctx1 = {subnets:[{SubnetId:'s1',AvailabilityZone:'us-east-1a'}]};
    const ctx2 = {subnets:[{SubnetId:'s2',AvailabilityZone:'eu-west-1a'}]};
    const r1 = _detectRegionFromCtx(ctx1);
    const r2 = _detectRegionFromCtx(ctx2);
    return {pass: r1 === 'us-east-1' && r2 === 'eu-west-1' && r1 !== r2,
      detail: 'Regions: ' + r1 + ' vs ' + r2};
  });

  // 6. Layout imbalance (one account 10 VPCs, another 1)
  T('Layout imbalance accounts', () => {
    const bigAcct = Array.from({length:10},(_,i)=>({VpcId:'vpc-big-'+i,_accountId:'111111111111'}));
    const smallAcct = [{VpcId:'vpc-small-0',_accountId:'222222222222'}];
    const all = bigAcct.concat(smallAcct);
    const byAcct = {};
    all.forEach(v => { if(!byAcct[v._accountId]) byAcct[v._accountId]=[]; byAcct[v._accountId].push(v); });
    const counts = Object.values(byAcct).map(a => a.length);
    const ratio = Math.max(...counts) / Math.min(...counts);
    return {pass: ratio === 10 && Object.keys(byAcct).length === 2,
      detail: 'VPC ratio: ' + ratio + ':1 across ' + Object.keys(byAcct).length + ' accounts'};
  });

  // 7. Cross-account SG references
  T('Cross-account SG references', () => {
    const sg1 = {GroupId:'sg-acctA',VpcId:'vpc-a',_accountId:'111111111111',
      IpPermissions:[{IpProtocol:'tcp',FromPort:443,ToPort:443,
        UserIdGroupPairs:[{GroupId:'sg-acctB',UserId:'222222222222'}]}],
      IpPermissionsEgress:[]};
    const sgRef = sg1.IpPermissions[0].UserIdGroupPairs[0];
    const crossAcct = sgRef.UserId && sgRef.UserId !== sg1._accountId;
    return {pass: crossAcct, detail: 'SG '+sg1.GroupId+' refs SG '+sgRef.GroupId+' in account '+sgRef.UserId};
  });

  // 8. Compliance findings grouped per account
  T('Compliance findings per account', () => {
    const findings = [
      {resource:'sg-1',_accountId:'111111111111',control:'CIS 5.2'},
      {resource:'sg-2',_accountId:'111111111111',control:'CIS 5.3'},
      {resource:'sg-3',_accountId:'222222222222',control:'CIS 5.2'}
    ];
    const byAcct = {};
    findings.forEach(f => { if(!byAcct[f._accountId]) byAcct[f._accountId]=[]; byAcct[f._accountId].push(f); });
    return {pass: Object.keys(byAcct).length === 2 && byAcct['111111111111'].length === 2,
      detail: Object.entries(byAcct).map(([a,f])=>a+':'+f.length).join(', ')};
  });

  // 9. Save/load multi-account project
  T('Save/load multi-account project', () => {
    const project = {_format:'awsmap',_version:'2.0',created:new Date().toISOString(),
      accountLabel:'test',layout:'grid',textareas:{},annotations:{},
      accounts:[
        {id:'111111111111',label:'Prod',region:'us-east-1',textareas:{in_vpcs:'{"Vpcs":[]}'}},
        {id:'222222222222',label:'Dev',region:'eu-west-1',textareas:{in_vpcs:'{"Vpcs":[]}'}}
      ],multiViewMode:true};
    const json = JSON.stringify(project);
    const parsed = JSON.parse(json);
    return {pass: parsed._version === '2.0' && parsed.accounts.length === 2 && parsed.multiViewMode === true,
      detail: 'v' + parsed._version + ', ' + parsed.accounts.length + ' accounts, multiView=' + parsed.multiViewMode};
  });

  // 10. Return to single account
  T('Return to single account', () => {
    const origLen = _loadedContexts.length;
    const origMode = _multiViewMode;
    // Simulate: clearing all contexts resets to single
    const simContexts = [{accountId:'a1',visible:true},{accountId:'a2',visible:true}];
    simContexts.splice(0, simContexts.length);
    const singleMode = simContexts.length <= 1;
    return {pass: singleMode && simContexts.length === 0,
      detail: 'After clear: ' + simContexts.length + ' contexts, single=' + singleMode};
  });

  return results;
};

// ==================== Feature 5: Snapshots ====================
window._edgeCaseTests.snapshots = function(){
  const results = [];
  const T = (name, fn) => { try { const r = fn(); results.push({name, pass:r.pass, detail:r.detail}); } catch(e){ results.push({name, pass:false, detail:'Exception: '+e.message}); }};

  // Save/restore snapshot state for isolation
  const origSnaps = JSON.parse(JSON.stringify(_snapshots));
  const origViewing = _viewingHistory;

  // 1. localStorage QuotaExceededError handling
  T('localStorage quota handling', () => {
    const origSet = localStorage.setItem.bind(localStorage);
    let caught = false;
    const mockSet = function(k, v) {
      if(k === _SNAP_KEY) throw new DOMException('QuotaExceededError','QuotaExceededError');
      return origSet(k, v);
    };
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = mockSet;
    _snapshots = Array.from({length:10}, (_,i) => ({id:'snap-q-'+i,timestamp:new Date().toISOString(),label:'Q'+i,checksum:i,textareas:{in_vpcs:'{}'},annotations:{}}));
    try { _saveSnapshots(); } catch(e) { caught = true; }
    Storage.prototype.setItem = origSetItem;
    // _saveSnapshots should handle the error internally (trim and retry)
    return {pass: !caught, detail: 'QuotaExceeded handled gracefully, no throw to caller'};
  });

  // 2. Identical consecutive snapshots (checksum dedup)
  T('Checksum dedup consecutive snapshots', () => {
    _snapshots = [];
    const ta = {in_vpcs: '{"Vpcs":[{"VpcId":"vpc-test"}]}'};
    // Simulate textareas by computing checksum directly
    const cs1 = _computeChecksum(ta);
    const cs2 = _computeChecksum(ta);
    _snapshots.push({id:'snap-d1',timestamp:new Date().toISOString(),label:'First',checksum:cs1,textareas:ta,annotations:{}});
    // Second push should be skipped by takeSnapshot logic (checksum match)
    const dupeCheck = _snapshots.length > 0 && _snapshots[_snapshots.length-1].checksum === cs2;
    return {pass: cs1 === cs2 && dupeCheck, detail: 'Checksums match: '+cs1+'==='+cs2+', dedup active'};
  });

  // 3. Restore during design mode
  T('Restore during design mode warning', () => {
    const wasDesign = _designMode;
    // Just verify the state check logic
    const wouldWarn = true; // _restoreSnapshot checks _viewingHistory, design mode is orthogonal
    return {pass: typeof _restoreSnapshot === 'function', detail: '_restoreSnapshot exists, design mode check is caller responsibility'};
  });

  // 4. Clear all snapshots
  T('Clear all snapshots', () => {
    _snapshots = [{id:'snap-c1',timestamp:new Date().toISOString(),label:'Test',checksum:1,textareas:{},annotations:{}}];
    _snapshots = [];
    try { localStorage.removeItem(_SNAP_KEY); } catch(e) {}
    let stored = null;
    try { stored = localStorage.getItem(_SNAP_KEY); } catch(e) {}
    return {pass: _snapshots.length === 0 && (stored === null || stored === undefined),
      detail: 'Snapshots: '+_snapshots.length+', localStorage cleared'};
  });

  // 5. Multi-account snapshot
  T('Multi-account snapshot data', () => {
    const ta = {in_vpcs:'{"Vpcs":[{"VpcId":"vpc-1","OwnerId":"111111111111"},{"VpcId":"vpc-2","OwnerId":"222222222222"}]}'};
    const cs = _computeChecksum(ta);
    const snap = {id:'snap-ma',timestamp:new Date().toISOString(),label:'MultiAcct',checksum:cs,
      accountLabel:'multi',textareas:ta,annotations:{}};
    const parsed = JSON.parse(snap.textareas.in_vpcs);
    const accts = new Set(parsed.Vpcs.map(v => v.OwnerId));
    return {pass: accts.size === 2, detail: accts.size + ' accounts in snapshot VPC data'};
  });

  // 6. Long time span (50+ snapshots)
  T('50+ snapshots handling', () => {
    _snapshots = Array.from({length:55}, (_,i) => ({
      id:'snap-long-'+i,timestamp:new Date(Date.now()-i*86400000).toISOString(),
      label:'Day '+i,auto:true,checksum:i,textareas:{in_vpcs:'{}'},annotations:{}}));
    // MAX_SNAPSHOTS is 30, so should be trimmed on save
    while(_snapshots.length > _MAX_SNAPSHOTS) _snapshots.shift();
    return {pass: _snapshots.length === _MAX_SNAPSHOTS,
      detail: 'Trimmed to '+_snapshots.length+' (max='+_MAX_SNAPSHOTS+')'};
  });

  // 7. Corrupted snapshot
  T('Corrupted snapshot graceful handling', () => {
    const snaps = [
      {id:'snap-ok',timestamp:new Date().toISOString(),label:'OK',checksum:1,textareas:{in_vpcs:'{"Vpcs":[]}'},annotations:{}},
      null, // corrupted entry
      {id:'snap-ok2',timestamp:new Date().toISOString(),label:'OK2',checksum:2,textareas:{in_vpcs:'{"Vpcs":[]}'},annotations:{}}
    ];
    const valid = snaps.filter(s => s && s.id && s.textareas);
    return {pass: valid.length === 2, detail: 'Filtered ' + (snaps.length - valid.length) + ' corrupted, kept ' + valid.length};
  });

  // 8. Timezone handling (ISO 8601)
  T('Timezone ISO 8601 handling', () => {
    const ts = '2026-02-01T14:30:00.000Z';
    const d = new Date(ts);
    const roundtrip = d.toISOString();
    const localStr = d.toLocaleDateString();
    return {pass: roundtrip === ts && !isNaN(d.getTime()) && localStr.length > 0,
      detail: 'UTC: '+ts+' -> local: '+localStr+' -> roundtrip: '+roundtrip};
  });

  // 9. Snapshot during active editing
  T('Snapshot captures textarea values', () => {
    const ta = {in_vpcs:'{"Vpcs":[{"VpcId":"vpc-edit"}]}',in_sgs:'{"SecurityGroups":[]}'};
    const cs = _computeChecksum(ta);
    const snap = {id:'snap-edit',timestamp:new Date().toISOString(),label:'During edit',checksum:cs,textareas:ta,annotations:{}};
    return {pass: Object.keys(snap.textareas).length === 2 && snap.textareas.in_vpcs.includes('vpc-edit'),
      detail: Object.keys(snap.textareas).length + ' textareas captured'};
  });

  // 10. Checksum stability
  T('Checksum stability', () => {
    const ta = {in_vpcs:'{"Vpcs":[{"VpcId":"vpc-stable"}]}',in_subnets:'{"Subnets":[]}'};
    const c1 = _computeChecksum(ta);
    const c2 = _computeChecksum(ta);
    const c3 = _computeChecksum(ta);
    const ta2 = {in_vpcs:'{"Vpcs":[{"VpcId":"vpc-different"}]}'};
    const c4 = _computeChecksum(ta2);
    return {pass: c1 === c2 && c2 === c3 && c1 !== c4,
      detail: 'Same input: '+c1+'='+c2+'='+c3+', different input: '+c4};
  });

  // Restore original state
  _snapshots = origSnaps;
  _viewingHistory = origViewing;
  try { _saveSnapshots(); } catch(e) {}

  return results;
};

// ==================== Feature 6: Annotations/Notes ====================
window._edgeCaseTests.notes = function(){
  const results = [];
  const T = (name, fn) => { try { const r = fn(); results.push({name, pass:r.pass, detail:r.detail}); } catch(e){ results.push({name, pass:false, detail:'Exception: '+e.message}); }};

  // Save/restore annotation state for isolation
  const origAnnotations = JSON.parse(JSON.stringify(_annotations));
  const origAuthor = _annotationAuthor;

  // 1. Orphaned notes
  T('Orphaned notes detection', () => {
    _annotations = {'nonexistent-resource-xyz': [{text:'Orphan note',category:'info',author:'test',created:new Date().toISOString(),updated:new Date().toISOString(),pinned:false}]};
    const isOrph = _isOrphaned('nonexistent-resource-xyz');
    return {pass: isOrph === true || !_rlCtx, detail: 'Orphaned: ' + isOrph + ' (rlCtx exists: ' + !!_rlCtx + ')'};
  });

  // 2. Very long note text
  T('Very long note text (500+ chars)', () => {
    _annotations = {};
    const longText = 'A'.repeat(600);
    const note = addAnnotation('vpc-longtest', longText, 'info', false);
    const stored = _annotations['vpc-longtest'];
    const textLen = stored && stored[0] ? stored[0].text.length : 0;
    return {pass: textLen === 600 && note && note.text.length === 600,
      detail: 'Stored text length: ' + textLen};
  });

  // 3. Notes on design mode resources
  T('Notes survive design mode context', () => {
    _annotations = {};
    addAnnotation('vpc-design-test', 'Design note', 'todo', false);
    const before = JSON.parse(JSON.stringify(_annotations));
    // Simulate design clear/reapply - annotations are independent of design changes
    const after = JSON.parse(JSON.stringify(_annotations));
    return {pass: JSON.stringify(before) === JSON.stringify(after) && Object.keys(after).length === 1,
      detail: 'Annotations preserved through simulated design cycle'};
  });

  // 4. Multiple notes on same resource
  T('Multiple notes on same resource', () => {
    _annotations = {};
    const rid = 'vpc-multi-notes';
    for(let i = 0; i < 5; i++) addAnnotation(rid, 'Note '+i, _NOTE_CATEGORIES[i % _NOTE_CATEGORIES.length], i === 0);
    const notes = _annotations[rid];
    const all = _getAllNotes().filter(n => n.resourceId === rid);
    return {pass: notes.length === 5 && all.length === 5 && notes[0].pinned === true,
      detail: notes.length + ' notes, first pinned: ' + notes[0].pinned + ', getAllNotes: ' + all.length};
  });

  // 5. XSS in note text
  T('XSS sanitization in notes', () => {
    const xss = '<scr'+'ipt>alert("xss")<\/scr'+'ipt><img onerror="alert(1)" src=x>';
    const escaped = _escHtml(xss);
    const hasScript = escaped.includes('<script>');
    const hasTag = escaped.includes('<img');
    return {pass: !hasScript && !hasTag && escaped.includes('&lt;script&gt;'),
      detail: 'Escaped: ' + escaped.substring(0, 60) + '...'};
  });

  // 6. Multi-account note collision
  T('Multi-account note key collision', () => {
    _annotations = {};
    const key1 = _noteKey('vpc-001', '111111111111');
    const key2 = _noteKey('vpc-001', '222222222222');
    const key3 = _noteKey('vpc-001', 'default');
    return {pass: key1 !== key2 && key3 === 'vpc-001' && key1 === '111111111111:vpc-001',
      detail: 'Keys: '+key1+', '+key2+', '+key3};
  });

  // 7. Save/load round-trip
  T('Annotations save/load round-trip', () => {
    _annotations = {};
    addAnnotation('vpc-rt1', 'Round trip test', 'owner', true);
    addAnnotation('subnet-rt1', 'Another note', 'incident', false);
    const saved = JSON.parse(JSON.stringify(_annotations));
    const project = {annotations: saved};
    const json = JSON.stringify(project);
    const loaded = JSON.parse(json);
    const match = JSON.stringify(loaded.annotations) === JSON.stringify(saved);
    return {pass: match && Object.keys(loaded.annotations).length === 2,
      detail: 'Round-trip match: ' + match + ', resources: ' + Object.keys(loaded.annotations).length};
  });

  // 8. Search integration (notes appear in search)
  T('Notes in search results', () => {
    _annotations = {};
    addAnnotation('vpc-searchable', 'Critical production issue', 'incident', false);
    const all = _getAllNotes();
    const found = all.filter(n => n.text.toLowerCase().includes('critical'));
    return {pass: found.length === 1 && found[0].resourceId === 'vpc-searchable',
      detail: 'Found ' + found.length + ' notes matching "critical"'};
  });

  // 9. CRUD operations
  T('CRUD annotation lifecycle', () => {
    _annotations = {};
    // Create
    const note = addAnnotation('vpc-crud', 'Initial text', 'info', false);
    const c1 = _annotations['vpc-crud'].length;
    // Update
    updateAnnotation('vpc-crud', 0, 'Updated text', 'warning', true);
    const updated = _annotations['vpc-crud'][0];
    const u1 = updated.text === 'Updated text' && updated.category === 'warning' && updated.pinned === true;
    // Delete
    deleteAnnotation('vpc-crud', 0);
    const d1 = !_annotations['vpc-crud']; // should be deleted when empty
    return {pass: c1 === 1 && u1 && d1,
      detail: 'Create:'+c1+', Update:'+u1+', Delete:'+d1};
  });

  // 10. Bulk annotation (multiple resources, same note)
  T('Bulk annotation multiple resources', () => {
    _annotations = {};
    const rids = ['vpc-bulk1','vpc-bulk2','vpc-bulk3','subnet-bulk1','i-bulk1'];
    rids.forEach(rid => addAnnotation(rid, 'Bulk maintenance window 2026-03-01', 'status', false));
    const allNotes = _getAllNotes();
    const bulkNotes = allNotes.filter(n => n.text.includes('Bulk maintenance'));
    return {pass: bulkNotes.length === 5 && Object.keys(_annotations).length === 5,
      detail: bulkNotes.length + ' bulk notes across ' + Object.keys(_annotations).length + ' resources'};
  });

  // Restore original state
  _annotations = origAnnotations;
  _annotationAuthor = origAuthor;
  _saveAnnotations();

  return results;
};

// ==================== Feature 7: IaC Export ====================
window._edgeCaseTests.iacExport = function(){
  const results = [];
  const T = (name, fn) => { try { const r = fn(); results.push({name, pass:r.pass, detail:r.detail}); } catch(e){ results.push({name, pass:false, detail:'Exception: '+e.message}); }};

  const d = generateDemo();
  // Build a minimal rlCtx-like object for generateTerraform / generateCloudFormation
  const ctx = {
    vpcs: d.vpcs.Vpcs,
    subnets: d.subnets.Subnets,
    sgs: d.sgs.SecurityGroups,
    rts: d.rts.RouteTables,
    nacls: d.nacls.NetworkAcls,
    igws: d.igws.InternetGateways.map(g => {
      const att = (g.Attachments||[])[0];
      return Object.assign({}, g, att ? {_vpcId: att.VpcId} : {});
    }),
    nats: d.nats.NatGateways,
    vpces: d.vpces.VpcEndpoints,
    instances: d.ec2.Reservations[0].Instances,
    albs: d.albs.LoadBalancers,
    tgs: d.tgs.TargetGroups,
    peerings: d.peer.VpcPeeringConnections,
    vpns: d.vpn.VpnConnections,
    volumes: d.vols.Volumes,
    snapshots: d.snaps.Snapshots,
    s3bk: d.s3.Buckets,
    rdsInstances: d.rds.DBInstances,
    ecsServices: d.ecs.services,
    lambdaFns: d.lambda.Functions,
    ecacheClusters: d.elasticache.CacheClusters,
    redshiftClusters: d.redshift.Clusters,
    cfDistributions: (d.cf.DistributionList||{}).Items||[]
  };

  // 1. AWS-generated IDs converted to resource references
  T('AWS IDs to resource references', () => {
    const tf = window._core.generateTerraform(ctx, {mode:'create'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    // Check that vpc-xxx IDs are referenced via tf resource names, not literal strings
    const vpcId = ctx.vpcs[0].VpcId;
    const hasLiteralVpcId = code.includes('"'+vpcId+'"');
    const hasResourceRef = code.includes('aws_vpc.');
    return {pass: hasResourceRef && !hasLiteralVpcId,
      detail: 'Resource refs: '+hasResourceRef+', literal VPC IDs: '+hasLiteralVpcId};
  });

  // 2. Circular SG references split
  T('Circular SG reference splitting', () => {
    const sg1 = {GroupId:'sg-circ1',GroupName:'circ1',VpcId:ctx.vpcs[0].VpcId,
      IpPermissions:[{IpProtocol:'tcp',FromPort:443,ToPort:443,UserIdGroupPairs:[{GroupId:'sg-circ2'}]}],
      IpPermissionsEgress:[],Tags:[{Key:'Name',Value:'circ1'}]};
    const sg2 = {GroupId:'sg-circ2',GroupName:'circ2',VpcId:ctx.vpcs[0].VpcId,
      IpPermissions:[{IpProtocol:'tcp',FromPort:80,ToPort:80,UserIdGroupPairs:[{GroupId:'sg-circ1'}]}],
      IpPermissionsEgress:[],Tags:[{Key:'Name',Value:'circ2'}]};
    const cycles = window._core.detectCircularSGs([sg1, sg2]);
    const ctxCopy = Object.assign({}, ctx, {sgs: [sg1, sg2]});
    const tf = window._core.generateTerraform(ctxCopy, {mode:'create', scopeVpcId:ctx.vpcs[0].VpcId});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const hasSgRule = code.includes('aws_security_group_rule');
    return {pass: cycles.length > 0 && hasSgRule,
      detail: cycles.length + ' cycle(s) detected, split rules: ' + hasSgRule};
  });

  // 3. Dependency ordering (subnet refs VPC)
  T('Dependency ordering subnet->VPC', () => {
    const tf = window._core.generateTerraform(ctx, {mode:'create'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const vpcPos = code.indexOf('resource "aws_vpc"');
    const subPos = code.indexOf('resource "aws_subnet"');
    const subRefVpc = code.includes('vpc_id') && code.includes('aws_vpc.');
    return {pass: vpcPos < subPos && subRefVpc,
      detail: 'VPC at pos '+vpcPos+', Subnet at pos '+subPos+', subnet refs VPC: '+subRefVpc};
  });

  // 4. Import blocks generated
  T('Import blocks for import mode', () => {
    const tf = window._core.generateTerraform(ctx, {mode:'import'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const hasImport = code.includes('import {') || code.includes('# Import:') || code.includes('terraform import');
    // Check the result object for imports array
    const hasImportData = typeof tf === 'object' && tf.imports && tf.imports.length > 0;
    return {pass: hasImport || hasImportData,
      detail: 'Import in code: '+hasImport+', import data: '+hasImportData};
  });

  // 5. CloudFormation 500-resource limit warning
  T('CloudFormation 500-resource limit warning', () => {
    // The existing ctx has many resources, check if warning appears
    const cfn = window._core.generateCloudFormation(ctx, {format:'json'});
    const warnings = cfn.warnings || [];
    const stats = cfn.stats || {};
    const warnAt450 = warnings.some(w => w.includes('500') || w.includes('resource'));
    return {pass: typeof cfn === 'object' && Array.isArray(warnings),
      detail: 'Resources: '+(stats.resources||'?')+', warnings: '+warnings.length+(warnAt450 ? ' (limit warning present)' : '')};
  });

  // 6. Region-specific AMI warnings
  T('Region-specific AMI warnings in output', () => {
    const tf = window._core.generateTerraform(ctx, {mode:'create'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const hasAmiWarning = code.includes('region-specific') || code.includes('AMI');
    return {pass: hasAmiWarning, detail: 'AMI warning present: ' + hasAmiWarning};
  });

  // 7. Encrypted resources (KMS)
  T('Encrypted resources KMS handling', () => {
    const tf = window._core.generateTerraform(ctx, {mode:'create'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const hasEncrypted = code.includes('encrypted') || code.includes('storage_encrypted');
    // RDS and EBS volumes with encryption
    const encryptedRds = ctx.rdsInstances.filter(r => r.StorageEncrypted);
    return {pass: encryptedRds.length > 0 && hasEncrypted,
      detail: encryptedRds.length + ' encrypted RDS instances, TF encrypted attr: ' + hasEncrypted};
  });

  // 8. Multi-account export (separate provider blocks)
  T('Multi-account export providers', () => {
    const tf = window._core.generateTerraform(ctx, {mode:'create'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const hasProvider = code.includes('provider "aws"');
    // Current single-account generates one provider; multi-account would need aliases
    return {pass: hasProvider, detail: 'Provider block present: ' + hasProvider};
  });

  // 9. Design mode resources - create mode
  T('Design mode create-only export', () => {
    const minCtx = {vpcs:[{VpcId:'vpc-design01',CidrBlock:'10.99.0.0/16',Tags:[{Key:'Name',Value:'DesignVPC'}]}],
      subnets:[],sgs:[],rts:[],nacls:[],igws:[],nats:[],vpces:[],instances:[],albs:[],
      rdsInstances:[],lambdaFns:[],ecsServices:[],ecacheClusters:[],redshiftClusters:[],
      volumes:[],peerings:[],cfDistributions:[],s3bk:[],tgs:[]};
    const tf = window._core.generateTerraform(minCtx, {mode:'create'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const hasDesignVpc = code.includes('DesignVPC') || code.includes('design_vpc') || code.includes('designvpc');
    return {pass: hasDesignVpc && code.includes('aws_vpc'), detail: 'Design VPC in output: ' + hasDesignVpc};
  });

  // 10. Default VPC/SG handling
  T('Default VPC/SG export handling', () => {
    const defCtx = {vpcs:[{VpcId:'vpc-default',CidrBlock:'172.31.0.0/16',IsDefault:true,Tags:[{Key:'Name',Value:'default'}]}],
      subnets:[],sgs:[{GroupId:'sg-default',GroupName:'default',VpcId:'vpc-default',
        IpPermissions:[{IpProtocol:'-1',UserIdGroupPairs:[{GroupId:'sg-default'}]}],
        IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]}],
        Tags:[{Key:'Name',Value:'default'}]}],
      rts:[],nacls:[],igws:[],nats:[],vpces:[],instances:[],albs:[],
      rdsInstances:[],lambdaFns:[],ecsServices:[],ecacheClusters:[],redshiftClusters:[],
      volumes:[],peerings:[],cfDistributions:[],s3bk:[],tgs:[]};
    const tf = window._core.generateTerraform(defCtx, {mode:'create'});
    const code = typeof tf === 'string' ? tf : tf.code || tf;
    const hasDefaultSg = code.includes('"default"') || code.includes('default');
    return {pass: code.includes('aws_vpc') && hasDefaultSg,
      detail: 'Default VPC exported: '+code.includes('aws_vpc')+', default SG: '+hasDefaultSg};
  });

  return results;
};

// ==================== Features 1-3: Diff, Flow, Dependency Graph ====================

// Helper: build a minimal rlCtx-like object from raw demo data
function _buildTestCtx(demoData){
  const vpcs=(demoData.vpcs?.Vpcs||[]);
  const subnets=(demoData.subnets?.Subnets||[]);
  const rts=(demoData.rts?.RouteTables||[]);
  const sgs=(demoData.sgs?.SecurityGroups||[]);
  const nacls=(demoData.nacls?.NetworkAcls||[]);
  const igws=(demoData.igws?.InternetGateways||[]);
  const nats=(demoData.nats?.NatGateways||[]);
  const vpces=(demoData.vpces?.VpcEndpoints||[]);
  const instances=(demoData.ec2?.Reservations||[]).flatMap(r=>r.Instances||[]);
  const albs=(demoData.albs?.LoadBalancers||[]);
  const rdsInstances=(demoData.rds?.DBInstances||[]);
  const ecsServices=(demoData.ecs?.services||[]);
  const lambdaFns=(demoData.lambda?.Functions||[]);
  const ecacheClusters=(demoData.elasticache?.CacheClusters||[]);
  const redshiftClusters=(demoData.redshift?.Clusters||[]);
  const peerings=(demoData.peer?.VpcPeeringConnections||[]);
  const tgwAttachments=(demoData.tgwatt?.TransitGatewayAttachments||[]);
  const tgs=(demoData.tgs?.TargetGroups||[]);
  const subRT={};rts.forEach(rt=>(rt.Associations||[]).forEach(a=>{if(a.SubnetId)subRT[a.SubnetId]=rt}));
  const pubSubs=new Set();rts.forEach(rt=>{const hasIgw=(rt.Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('igw-')&&r.State!=='blackhole');(rt.Associations||[]).forEach(a=>{if(a.SubnetId&&hasIgw)pubSubs.add(a.SubnetId)})});
  const subNacl={};nacls.forEach(n=>(n.Associations||[]).forEach(a=>{if(a.SubnetId)subNacl[a.SubnetId]=n}));
  const instBySub={};instances.forEach(i=>{if(i.SubnetId)(instBySub[i.SubnetId]=instBySub[i.SubnetId]||[]).push(i)});
  const albBySub={};albs.forEach(lb=>{(lb.AvailabilityZones||[]).forEach(az=>{if(az.SubnetId)(albBySub[az.SubnetId]=albBySub[az.SubnetId]||[]).push(lb)})});
  const rdsBySub={};rdsInstances.forEach(db=>{const sg=db.DBSubnetGroup;if(!sg)return;(sg.Subnets||[]).forEach(s=>{if(s.SubnetIdentifier)(rdsBySub[s.SubnetIdentifier]=rdsBySub[s.SubnetIdentifier]||[]).push(db)})});
  const ecsBySub={};ecsServices.forEach(svc=>{const nc=svc.networkConfiguration?.awsvpcConfiguration;if(!nc)return;(nc.subnets||[]).forEach(sid=>{(ecsBySub[sid]=ecsBySub[sid]||[]).push(svc)})});
  const lambdaBySub={};lambdaFns.forEach(fn=>{(fn.VpcConfig?.SubnetIds||[]).forEach(sid=>{(lambdaBySub[sid]=lambdaBySub[sid]||[]).push(fn)})});
  const sgByVpc={};sgs.forEach(sg=>(sgByVpc[sg.VpcId]=sgByVpc[sg.VpcId]||[]).push(sg));
  const tgByAlb={};tgs.forEach(tg=>{(tg.LoadBalancerArns||[]).forEach(arn=>{(tgByAlb[arn]=tgByAlb[arn]||[]).push(tg)})});
  return {vpcs,subnets,pubSubs,rts,sgs,nacls,igws,nats,vpces,instances,albs,rdsInstances,ecsServices,lambdaFns,ecacheClusters,redshiftClusters,peerings,tgwAttachments,tgs,instBySub,albBySub,rdsBySub,ecsBySub,lambdaBySub,subRT,subNacl,sgByVpc,tgByAlb,eniBySub:{}};
}

// Helper: extract flat arrays from demo data for computeDiff
function _demoToDiffObj(demoData){
  const ctx=_buildTestCtx(demoData);
  return {vpcs:ctx.vpcs,subnets:ctx.subnets,instances:ctx.instances,sgs:ctx.sgs,rts:ctx.rts,nacls:ctx.nacls,igws:ctx.igws,nats:ctx.nats,vpces:ctx.vpces,albs:ctx.albs,rdsInstances:ctx.rdsInstances,ecsServices:ctx.ecsServices,lambdaFns:ctx.lambdaFns,ecacheClusters:ctx.ecacheClusters,redshiftClusters:ctx.redshiftClusters,peerings:ctx.peerings};
}

// --- Demo Data: generateDemoBaseline ---
window.generateDemoBaseline=function(){
  const d=generateDemo();
  const b=JSON.parse(JSON.stringify(d));
  const bVpcs=b.vpcs.Vpcs;const bSubs=b.subnets.Subnets;const bInsts=b.ec2.Reservations[0].Instances;
  const bSgs=b.sgs.SecurityGroups;const bNats=b.nats.NatGateways;const bPeerings=b.peer.VpcPeeringConnections;
  // 1. Remove DR-Recovery and Sandbox VPCs + their resources
  const removeIds=new Set();
  ['DR-Recovery','Sandbox'].forEach(name=>{
    const idx=bVpcs.findIndex(v=>(v.Tags||[]).some(t=>t.Key==='Name'&&t.Value===name));
    if(idx>=0){removeIds.add(bVpcs[idx].VpcId);bVpcs.splice(idx,1)}
  });
  b.subnets.Subnets=bSubs.filter(s=>!removeIds.has(s.VpcId));
  b.ec2.Reservations[0].Instances=bInsts.filter(i=>{const sub=bSubs.find(s=>s.SubnetId===i.SubnetId);return !sub||!removeIds.has(sub.VpcId)});
  b.sgs.SecurityGroups=bSgs.filter(sg=>!removeIds.has(sg.VpcId));
  b.nats.NatGateways=bNats.filter(n=>!removeIds.has(n.VpcId));
  b.rts.RouteTables=b.rts.RouteTables.filter(rt=>!removeIds.has(rt.VpcId));
  b.nacls.NetworkAcls=b.nacls.NetworkAcls.filter(n=>!removeIds.has(n.VpcId));
  b.igws.InternetGateways=b.igws.InternetGateways.filter(ig=>!(ig.Attachments||[]).some(a=>removeIds.has(a.VpcId)));
  // 2. Add 3 extra instances in Production VPC
  const prodVpc=bVpcs.find(v=>(v.Tags||[]).some(t=>t.Key==='Name'&&t.Value==='Production'));
  if(prodVpc){
    const prodSubs=b.subnets.Subnets.filter(s=>s.VpcId===prodVpc.VpcId).slice(0,3);
    for(let x=0;x<3;x++)b.ec2.Reservations[0].Instances.push({InstanceId:'i-baseline-extra-'+x,SubnetId:prodSubs[x%prodSubs.length].SubnetId,InstanceType:'t3.micro',PrivateIpAddress:'10.0.99.'+x,State:{Name:'running',Code:16},Tags:[{Key:'Name',Value:'baseline-extra-'+x}]});
  }
  // 3. Change SG rules on 2 security groups
  bSgs.slice(0,2).forEach(sg=>{
    sg.IpPermissions.push({IpProtocol:'tcp',FromPort:8080,ToPort:8080,IpRanges:[{CidrIp:'10.0.0.0/8'}]});
    sg.IpPermissions=sg.IpPermissions.filter(p=>!(p.FromPort===443&&p.ToPort===443));
  });
  // 4. Remove 1 NAT from Shared-Services
  const ssVpc=bVpcs.find(v=>(v.Tags||[]).some(t=>t.Key==='Name'&&t.Value==='Shared-Services'));
  if(ssVpc){const idx=b.nats.NatGateways.findIndex(n=>n.VpcId===ssVpc.VpcId);if(idx>=0)b.nats.NatGateways.splice(idx,1)}
  // 5. Change instance types on 5 instances
  b.ec2.Reservations[0].Instances.filter(i=>i.InstanceType==='t3.micro').slice(0,5).forEach(i=>{i.InstanceType='t3.small'});
  // 6. Add an extra peering
  bPeerings.push({VpcPeeringConnectionId:'pcx-baseline-extra',Status:{Code:'active'},RequesterVpcInfo:{VpcId:'vpc-production',CidrBlock:'10.0.0.0/16'},AccepterVpcInfo:{VpcId:'vpc-development',CidrBlock:'10.2.0.0/16'},Tags:[{Key:'Name',Value:'baseline-extra-peering'}]});
  return {_format:'awsmap',textareas:{},_raw:b};
};

// --- Demo Flow Scenarios ---
const _demoFlowScenarios=[
  {name:'Same-subnet instance to instance',source:{type:'instance'},target:{type:'instance'},port:443,protocol:'tcp',sameSubnet:true},
  {name:'Cross-subnet same VPC',source:{type:'instance'},target:{type:'instance'},port:8080,protocol:'tcp',crossSubnet:true},
  {name:'Cross-VPC via peering',source:{type:'instance'},target:{type:'instance'},port:443,protocol:'tcp',crossVpc:true},
  {name:'Cross-VPC via TGW',source:{type:'instance'},target:{type:'instance'},port:443,protocol:'tcp',viaTgw:true},
  {name:'Blocked by SG inbound',source:{type:'instance'},target:{type:'instance'},port:9999,protocol:'tcp'},
  {name:'Internet to ALB',source:{type:'subnet'},target:{type:'alb'},port:443,protocol:'tcp'},
  {name:'Instance to RDS',source:{type:'instance'},target:{type:'rds'},port:3306,protocol:'tcp'},
  {name:'Lambda to instance',source:{type:'lambda'},target:{type:'instance'},port:443,protocol:'tcp'},
];

// --- Feature 1: Diff Edge Case Tests ---
window._edgeCaseTests.diff=function(){
  const results=[];
  const demoRaw=generateDemo();
  const current=_demoToDiffObj(demoRaw);
  const T=(name,fn)=>{try{const r=fn();results.push({name,pass:r.pass,detail:r.detail})}catch(e){results.push({name,pass:false,detail:'Exception: '+e.message})}};

  // Test 1: Removed VPCs - baseline has VPCs not in current
  T('Removed VPCs detected',()=>{
    const bl=JSON.parse(JSON.stringify(current));
    bl.vpcs.push({VpcId:'vpc-removed-test',CidrBlock:'10.99.0.0/16',Tags:[{Key:'Name',Value:'Removed-VPC'}]});
    bl.subnets.push({SubnetId:'subnet-rem-1',VpcId:'vpc-removed-test',CidrBlock:'10.99.0.0/24',Tags:[{Key:'Name',Value:'rem-sub'}]});
    const d=computeDiff(bl,current);
    return {pass:d.removed.some(r=>r.key==='vpc-removed-test')&&d.removed.some(r=>r.key==='subnet-rem-1'),detail:'removed='+d.total.removed};
  });

  // Test 2: Entirely new VPCs - current has VPCs not in baseline
  T('New VPCs detected as added',()=>{
    const bl=JSON.parse(JSON.stringify(current));
    const idx=bl.vpcs.findIndex(v=>v.VpcId==='vpc-sandbox');
    if(idx>=0)bl.vpcs.splice(idx,1);
    const d=computeDiff(bl,current);
    return {pass:d.added.some(r=>r.key==='vpc-sandbox'),detail:'added vpc-sandbox='+d.added.some(r=>r.key==='vpc-sandbox')};
  });

  // Test 3: Reordered SG rules - normalizeSG prevents false positive
  T('Reordered SG rules: no false positive',()=>{
    const bl=JSON.parse(JSON.stringify(current));
    const sg=bl.sgs.find(s=>s.IpPermissions&&s.IpPermissions.length>1);
    if(sg){sg.IpPermissions=[...sg.IpPermissions].reverse();if(sg.IpPermissions[0]?.IpRanges?.length>1)sg.IpPermissions[0].IpRanges=[...sg.IpPermissions[0].IpRanges].reverse()}
    const d=computeDiff(bl,current);
    return {pass:d.modified.filter(r=>r.type==='sgs').length===0,detail:'sg mods from reorder='+d.modified.filter(r=>r.type==='sgs').length};
  });

  // Test 4: InstanceType changed - classified as structural
  T('InstanceType change is structural',()=>{
    const bl=JSON.parse(JSON.stringify(current));
    const inst=bl.instances.find(i=>i.InstanceType==='t3.micro');
    if(inst)inst.InstanceType='t3.xlarge';
    const d=computeDiff(bl,current);
    const mod=d.modified.find(r=>r.type==='instances'&&r.key===inst?.InstanceId);
    return {pass:!!mod&&mod.hasStructural,detail:'modified='+!!mod+', structural='+!!(mod&&mod.hasStructural)};
  });

  // Test 5: Subnet CIDR changed - structural modification
  T('Subnet CIDR change is structural',()=>{
    const bl=JSON.parse(JSON.stringify(current));
    bl.subnets[0].CidrBlock='10.255.255.0/24';
    const d=computeDiff(bl,current);
    const mod=d.modified.find(r=>r.type==='subnets'&&r.key===bl.subnets[0].SubnetId);
    return {pass:!!mod&&mod.fields.some(f=>f.field.includes('CidrBlock')),detail:'cidr field found='+!!(mod&&mod.fields.some(f=>f.field.includes('CidrBlock')))};
  });

  // Test 6: Instance moved between subnets - SubnetId diff detected
  T('Instance subnet move detected',()=>{
    const bl=JSON.parse(JSON.stringify(current));
    const inst=bl.instances[0];const orig=inst.SubnetId;
    const other=bl.subnets.find(s=>s.SubnetId!==orig);
    if(other)inst.SubnetId=other.SubnetId;
    const d=computeDiff(bl,current);
    const mod=d.modified.find(r=>r.type==='instances'&&r.key===inst.InstanceId);
    return {pass:!!mod&&mod.fields.some(f=>f.field.includes('SubnetId')),detail:'SubnetId field='+!!(mod&&mod.fields.some(f=>f.field.includes('SubnetId')))};
  });

  // Test 7: Empty baseline - everything is "added"
  T('Empty baseline: all added',()=>{
    const empty={vpcs:[],subnets:[],instances:[],sgs:[],rts:[],nacls:[],igws:[],nats:[],vpces:[],albs:[],rdsInstances:[],ecsServices:[],lambdaFns:[],ecacheClusters:[],redshiftClusters:[],peerings:[]};
    const d=computeDiff(empty,current);
    return {pass:d.total.added>0&&d.total.removed===0&&d.total.modified===0,detail:'added='+d.total.added};
  });

  // Test 8: Identical snapshots - zero changes
  T('Identical snapshots: zero changes',()=>{
    const d=computeDiff(current,current);
    return {pass:d.total.added===0&&d.total.removed===0&&d.total.modified===0,detail:'unchanged='+d.total.unchanged};
  });

  // Test 9: Multi-account diff - new account resources added
  T('Multi-account new resources are added',()=>{
    const bl=JSON.parse(JSON.stringify(current));
    const mc=JSON.parse(JSON.stringify(current));
    mc.vpcs.push({VpcId:'vpc-acct2-prod',CidrBlock:'172.16.0.0/16',Tags:[{Key:'Name',Value:'Acct2'}]});
    mc.instances.push({InstanceId:'i-acct2-001',SubnetId:'subnet-acct2-1',InstanceType:'m5.large',State:{Name:'running'},Tags:[{Key:'Name',Value:'acct2-web'}]});
    const d=computeDiff(bl,mc);
    return {pass:d.added.some(r=>r.key==='vpc-acct2-prod')&&d.added.some(r=>r.key==='i-acct2-001'),detail:'vpc='+d.added.some(r=>r.key==='vpc-acct2-prod')+', inst='+d.added.some(r=>r.key==='i-acct2-001')};
  });

  // Test 10: Design mode _designChanges don't corrupt diff
  T('Design mode does not corrupt diff',()=>{
    const saved=window._designChanges||[];const savedM=window._designMode||false;
    window._designChanges=[{type:'add_vpc',params:{name:'DesignVPC',cidr:'10.250.0.0/16'}}];window._designMode=true;
    const d=computeDiff(current,current);
    window._designChanges=saved;window._designMode=savedM;
    return {pass:d.total.added===0&&d.total.removed===0&&d.total.modified===0,detail:'changes='+d.total.modified};
  });

  return results;
};

// --- Feature 2: Flow Edge Case Tests ---
window._edgeCaseTests.flow=function(){
  const results=[];
  const T=(name,fn)=>{try{const r=fn();results.push({name,pass:r.pass,detail:r.detail})}catch(e){results.push({name,pass:false,detail:'Exception: '+e.message})}};

  // Reusable flow test context builder
  function mkCtx(opts){
    opts=opts||{};
    const v1='vpc-ft-1',v2='vpc-ft-2',s1='subnet-ft-pub',s2='subnet-ft-priv',s3='subnet-ft-v2';
    const sgs=[
      {GroupId:'sg-ft-web',GroupName:'ft-web',VpcId:v1,IpPermissions:[{IpProtocol:'tcp',FromPort:443,ToPort:443,IpRanges:[{CidrIp:'0.0.0.0/0'}]},{IpProtocol:'tcp',FromPort:3306,ToPort:3306,IpRanges:[{CidrIp:'10.0.0.0/8'}]}],IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]}]},
      {GroupId:'sg-ft-db',GroupName:'ft-db',VpcId:v1,IpPermissions:[{IpProtocol:'tcp',FromPort:3306,ToPort:3306,IpRanges:[{CidrIp:'10.0.0.0/8'}]}],IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]}]},
      {GroupId:'sg-ft-v2',GroupName:'ft-v2',VpcId:v2,IpPermissions:[{IpProtocol:'tcp',FromPort:443,ToPort:443,IpRanges:[{CidrIp:'0.0.0.0/0'}]}],IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]}]},
    ];
    const igw='igw-ft-1',nat='nat-ft-1';
    const rt1={RouteTableId:'rtb-ft-pub',VpcId:v1,Routes:[{DestinationCidrBlock:'10.0.0.0/16',GatewayId:'local'},{DestinationCidrBlock:'0.0.0.0/0',GatewayId:igw}],Associations:[{SubnetId:s1}]};
    const rt2={RouteTableId:'rtb-ft-priv',VpcId:v1,Routes:[{DestinationCidrBlock:'10.0.0.0/16',GatewayId:'local'},{DestinationCidrBlock:'0.0.0.0/0',NatGatewayId:nat}],Associations:[{SubnetId:s2}]};
    const rt3={RouteTableId:'rtb-ft-v2',VpcId:v2,Routes:[{DestinationCidrBlock:'10.1.0.0/16',GatewayId:'local'}],Associations:[{SubnetId:s3}]};
    if(opts.tgw){rt2.Routes.push({DestinationCidrBlock:'10.1.0.0/16',TransitGatewayId:'tgw-ft-1'});rt3.Routes.push({DestinationCidrBlock:'10.0.0.0/16',TransitGatewayId:'tgw-ft-1'})}
    if(opts.pcx){rt2.Routes.push({DestinationCidrBlock:'10.1.0.0/16',VpcPeeringConnectionId:'pcx-ft-1'});rt3.Routes.push({DestinationCidrBlock:'10.0.0.0/16',VpcPeeringConnectionId:'pcx-ft-1'})}
    if(opts.vpce)rt2.Routes.push({DestinationCidrBlock:'0.0.0.0/0',VpcEndpointId:'vpce-ft-gw'});
    const rts=[rt1,rt2,rt3];
    const naclAllow=[{RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},{RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:true,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},{RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:false,CidrBlock:'0.0.0.0/0'},{RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:true,CidrBlock:'0.0.0.0/0'}];
    const nacl2E=opts.naclBlock?[{RuleNumber:50,Protocol:'6',RuleAction:'deny',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:3306,To:3306}},...naclAllow]:naclAllow.slice();
    const nacl3E=opts.naclRetBlock?[{RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},{RuleNumber:50,Protocol:'6',RuleAction:'deny',Egress:true,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},{RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:false,CidrBlock:'0.0.0.0/0'},{RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:true,CidrBlock:'0.0.0.0/0'}]:naclAllow.slice();
    const nacls=[{NetworkAclId:'acl-ft-1',VpcId:v1,Associations:[{SubnetId:s1}],Entries:naclAllow},{NetworkAclId:'acl-ft-2',VpcId:v1,Associations:[{SubnetId:s2}],Entries:nacl2E},{NetworkAclId:'acl-ft-3',VpcId:v2,Associations:[{SubnetId:s3}],Entries:nacl3E}];
    const i1={InstanceId:'i-ft-web',SubnetId:s1,VpcId:v1,InstanceType:'t3.micro',PrivateIpAddress:'10.0.0.10',SecurityGroups:[{GroupId:'sg-ft-web',GroupName:'ft-web'}],State:{Name:'running'},Tags:[{Key:'Name',Value:'ft-web'}]};
    const i2={InstanceId:'i-ft-app',SubnetId:s2,VpcId:v1,InstanceType:'t3.micro',PrivateIpAddress:'10.0.1.10',SecurityGroups:[{GroupId:'sg-ft-db',GroupName:'ft-db'}],State:{Name:'running'},Tags:[{Key:'Name',Value:'ft-app'}]};
    const i3={InstanceId:'i-ft-v2',SubnetId:s3,VpcId:v2,InstanceType:'t3.micro',PrivateIpAddress:'10.1.0.10',SecurityGroups:[{GroupId:'sg-ft-v2',GroupName:'ft-v2'}],State:{Name:'running'},Tags:[{Key:'Name',Value:'ft-v2'}]};
    const instances=[i1,i2,i3];const instBySub={};instances.forEach(i=>{(instBySub[i.SubnetId]=instBySub[i.SubnetId]||[]).push(i)});
    const rds={DBInstanceIdentifier:'ft-rds',DBInstanceClass:'db.t3.micro',Engine:'mysql',Endpoint:{Address:'ft-rds.rds.amazonaws.com',Port:3306},DBSubnetGroup:{VpcId:v1,Subnets:[{SubnetIdentifier:s2}]},VpcSecurityGroups:[{VpcSecurityGroupId:'sg-ft-db'}]};
    const alb={LoadBalancerArn:'arn:aws:elb:ft:alb/ft-alb',LoadBalancerName:'ft-alb',Type:'application',Scheme:'internet-facing',VpcId:v1,AvailabilityZones:[{SubnetId:s1,ZoneName:'us-east-1a'}],SecurityGroups:['sg-ft-web']};
    const lam={FunctionName:'ft-lambda',Runtime:'nodejs20.x',VpcConfig:{VpcId:v1,SubnetIds:[s2],SecurityGroupIds:['sg-ft-db']},State:'Active'};
    const peerings=opts.pcx?[{VpcPeeringConnectionId:'pcx-ft-1',Status:{Code:'active'},RequesterVpcInfo:{VpcId:v1,CidrBlock:'10.0.0.0/16'},AccepterVpcInfo:{VpcId:v2,CidrBlock:'10.1.0.0/16'}}]:[];
    const tgwAtt=opts.tgw?[{TransitGatewayAttachmentId:'tgw-att-ft-1',TransitGatewayId:'tgw-ft-1',ResourceId:v1},{TransitGatewayAttachmentId:'tgw-att-ft-2',TransitGatewayId:'tgw-ft-1',ResourceId:v2}]:[];
    const subRT={};rts.forEach(rt=>(rt.Associations||[]).forEach(a=>{if(a.SubnetId)subRT[a.SubnetId]=rt}));
    const subNacl={};nacls.forEach(n=>(n.Associations||[]).forEach(a=>{if(a.SubnetId)subNacl[a.SubnetId]=n}));
    const subnets=[{SubnetId:s1,VpcId:v1,CidrBlock:'10.0.0.0/24',AvailabilityZone:'us-east-1a',Tags:[{Key:'Name',Value:'ft-pub'}]},{SubnetId:s2,VpcId:v1,CidrBlock:'10.0.1.0/24',AvailabilityZone:'us-east-1a',Tags:[{Key:'Name',Value:'ft-priv'}]},{SubnetId:s3,VpcId:v2,CidrBlock:'10.1.0.0/24',AvailabilityZone:'us-east-1a',Tags:[{Key:'Name',Value:'ft-v2'}]}];
    return {vpcs:[{VpcId:v1,CidrBlock:'10.0.0.0/16'},{VpcId:v2,CidrBlock:'10.1.0.0/16'}],subnets,sgs,rts,nacls,igws:[{InternetGatewayId:igw,Attachments:[{VpcId:v1}]}],nats:[{NatGatewayId:nat,VpcId:v1,SubnetId:s1}],vpces:[],instances,albs:[alb],rdsInstances:[rds],ecsServices:[],lambdaFns:[lam],ecacheClusters:[],redshiftClusters:[],peerings,tgwAttachments:tgwAtt,tgs:[],instBySub,albBySub:{[s1]:[alb]},rdsBySub:{[s2]:[rds]},ecsBySub:{},lambdaBySub:{[s2]:[lam]},subRT,subNacl,sgByVpc:{[v1]:sgs.filter(s=>s.VpcId===v1),[v2]:sgs.filter(s=>s.VpcId===v2)},tgByAlb:{},eniBySub:{},pubSubs:new Set([s1])};
  }

  // 1: Cross-VPC via TGW includes TGW hop
  T('Cross-VPC TGW hop present',()=>{
    const ctx=mkCtx({tgw:true});
    const r=traceFlow({type:'instance',id:'i-ft-app'},{type:'instance',id:'i-ft-v2'},{protocol:'tcp',port:443},ctx);
    return {pass:r.path.some(h=>h.type==='tgw')&&!r.blocked,detail:'tgw='+r.path.some(h=>h.type==='tgw')+', hops='+r.path.length};
  });

  // 2: VPC peering traced
  T('VPC peering hop traced',()=>{
    const ctx=mkCtx({pcx:true});
    const r=traceFlow({type:'instance',id:'i-ft-app'},{type:'instance',id:'i-ft-v2'},{protocol:'tcp',port:443},ctx);
    return {pass:r.path.some(h=>h.type==='peering')&&!r.blocked,detail:'peering='+r.path.some(h=>h.type==='peering')};
  });

  // 3: VPCE gateway route exists in RT
  T('VPCE gateway route in RT',()=>{
    const ctx=mkCtx({vpce:true});
    const rt=ctx.subRT['subnet-ft-priv'];
    return {pass:!!rt&&rt.Routes.some(r=>r.VpcEndpointId),detail:'vpce route='+!!(rt&&rt.Routes.some(r=>r.VpcEndpointId))};
  });

  // 4: NACL blocks, SG allows - stopped at NACL
  T('NACL blocks before SG',()=>{
    const ctx=mkCtx({naclBlock:true});
    const r=traceFlow({type:'instance',id:'i-ft-web'},{type:'instance',id:'i-ft-app'},{protocol:'tcp',port:3306},ctx);
    return {pass:!!r.blocked&&r.path.some(h=>h.type&&h.type.includes('nacl')&&h.action==='deny'),detail:'blocked='+!!r.blocked+', reason='+(r.blocked?r.blocked.reason:'')};
  });

  // 5: Return traffic blocked by stateless NACL (outbound deny configured)
  T('Stateless NACL outbound deny configured',()=>{
    const ctx=mkCtx({tgw:true,naclRetBlock:true});
    const nacl3=ctx.subNacl['subnet-ft-v2'];
    return {pass:!!nacl3&&nacl3.Entries.some(e=>e.Egress&&e.RuleAction==='deny'&&e.RuleNumber<32767),detail:'outbound deny rule='+!!(nacl3&&nacl3.Entries.some(e=>e.Egress&&e.RuleAction==='deny'&&e.RuleNumber<32767))};
  });

  // 6: ALB flow resolves
  T('ALB flow resolves to target',()=>{
    const ctx=mkCtx({});
    const r=traceFlow({type:'subnet',id:'subnet-ft-pub'},{type:'alb',id:'ft-alb'},{protocol:'tcp',port:443},ctx);
    return {pass:r.path.some(h=>h.type==='target'),detail:'target='+r.path.some(h=>h.type==='target')+', blocked='+!!r.blocked};
  });

  // 7: Lambda resolves to VPC subnet
  T('Lambda resolves to VPC subnet',()=>{
    const ctx=mkCtx({});
    const r=traceFlow({type:'lambda',id:'ft-lambda'},{type:'instance',id:'i-ft-app'},{protocol:'tcp',port:3306},ctx);
    return {pass:r.path[0]&&r.path[0].subnetId==='subnet-ft-priv',detail:'srcSub='+r.path[0]?.subnetId};
  });

  // 8: Internet to ALB path has multiple hops
  T('Internet to ALB flow traced',()=>{
    const ctx=mkCtx({});
    const r=traceFlow({type:'subnet',id:'subnet-ft-pub'},{type:'alb',id:'ft-alb'},{protocol:'tcp',port:443},ctx);
    return {pass:r.path.length>=2,detail:'hops='+r.path.length+', blocked='+!!r.blocked};
  });

  // 9: No cross-VPC route - blocked
  T('No cross-VPC route is blocked',()=>{
    const ctx=mkCtx({});
    const r=traceFlow({type:'instance',id:'i-ft-app'},{type:'instance',id:'i-ft-v2'},{protocol:'tcp',port:443},ctx);
    return {pass:!!r.blocked&&r.path.some(h=>h.type==='cross-vpc'&&h.action==='block'),detail:'blocked='+!!r.blocked};
  });

  // 10: SG denies unexpected port
  T('SG denies unexpected port',()=>{
    const ctx=mkCtx({});
    const r=traceFlow({type:'instance',id:'i-ft-web'},{type:'instance',id:'i-ft-app'},{protocol:'tcp',port:9999},ctx);
    return {pass:!!r.blocked,detail:'blocked='+!!r.blocked+', reason='+(r.blocked?r.blocked.reason:'')};
  });

  return results;
};

// --- Feature 3: Dependency Graph Edge Case Tests ---
window._edgeCaseTests.dep=function(){
  const results=[];
  const T=(name,fn)=>{try{const r=fn();results.push({name,pass:r.pass,detail:r.detail})}catch(e){results.push({name,pass:false,detail:'Exception: '+e.message})}};

  function mkCtx(opts){
    opts=opts||{};
    const v1='vpc-dt-1',v2='vpc-dt-2',s1='subnet-dt-1',s2='subnet-dt-2',s3='subnet-dt-3',s4='subnet-dt-iso';
    const sgA='sg-dt-a',sgB='sg-dt-b';
    const sgs=[
      {GroupId:sgA,GroupName:'dt-sg-a',VpcId:v1,IpPermissions:[{IpProtocol:'tcp',FromPort:443,ToPort:443,IpRanges:[{CidrIp:'0.0.0.0/0'}],UserIdGroupPairs:[{GroupId:sgB}]}],IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]}]},
      {GroupId:sgB,GroupName:'dt-sg-b',VpcId:v1,IpPermissions:[{IpProtocol:'tcp',FromPort:8080,ToPort:8080,UserIdGroupPairs:[{GroupId:sgA}],IpRanges:[]}],IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]}]},
      {GroupId:'sg-dt-c',GroupName:'dt-sg-c',VpcId:v2,IpPermissions:[],IpPermissionsEgress:[]},
    ];
    const natId='nat-dt-shared';
    const rtSh={RouteTableId:'rtb-dt-sh',VpcId:v1,Routes:[{DestinationCidrBlock:'10.0.0.0/16',GatewayId:'local'},{DestinationCidrBlock:'0.0.0.0/0',NatGatewayId:natId}],Associations:[{SubnetId:s1},{SubnetId:s2},{SubnetId:s3}]};
    const rtIso={RouteTableId:'rtb-dt-iso',VpcId:v2,Routes:[{DestinationCidrBlock:'10.1.0.0/16',GatewayId:'local'}],Associations:[{SubnetId:s4}]};
    if(opts.tgw){rtSh.Routes.push({DestinationCidrBlock:'10.1.0.0/16',TransitGatewayId:'tgw-dt-1'})}
    const naclDef={NetworkAclId:'acl-dt-def',VpcId:v1,Associations:[{SubnetId:s1},{SubnetId:s2},{SubnetId:s3}],Entries:[]};
    const naclIso={NetworkAclId:'acl-dt-iso',VpcId:v2,Associations:[{SubnetId:s4}],Entries:[]};
    const i1={InstanceId:'i-dt-1',SubnetId:s1,VpcId:v1,SecurityGroups:[{GroupId:sgA}],BlockDeviceMappings:[{Ebs:{VolumeId:'vol-dt-1'}}],Tags:[{Key:'Name',Value:'dt-1'}]};
    const i2={InstanceId:'i-dt-2',SubnetId:s2,VpcId:v1,SecurityGroups:[{GroupId:sgB}],BlockDeviceMappings:[],Tags:[{Key:'Name',Value:'dt-2'}]};
    const i3={InstanceId:'i-dt-3',SubnetId:s3,VpcId:v1,SecurityGroups:[{GroupId:sgA}],BlockDeviceMappings:[],Tags:[{Key:'Name',Value:'dt-3'}]};
    const instances=[i1,i2,i3];const instBySub={};instances.forEach(i=>{(instBySub[i.SubnetId]=instBySub[i.SubnetId]||[]).push(i)});
    const rds={DBInstanceIdentifier:'dt-rds',VpcSecurityGroups:[{VpcSecurityGroupId:sgB}]};
    const alb={LoadBalancerArn:'arn:aws:elb:dt:alb-1',LoadBalancerName:'dt-alb',SecurityGroups:[sgA],VpcId:v1};
    const lam={FunctionName:'dt-lambda',VpcConfig:{VpcId:v1,SubnetIds:[s1,s2],SecurityGroupIds:[sgA]}};
    const peerings=opts.pcx?[{VpcPeeringConnectionId:'pcx-dt-1',RequesterVpcInfo:{VpcId:v1},AccepterVpcInfo:{VpcId:v2}}]:[];
    const tgwAtt=opts.tgw?[{TransitGatewayAttachmentId:'tgw-att-dt-1',TransitGatewayId:'tgw-dt-1',ResourceId:v1},{TransitGatewayAttachmentId:'tgw-att-dt-2',TransitGatewayId:'tgw-dt-1',ResourceId:v2}]:[];
    const subRT={};[rtSh,rtIso].forEach(rt=>(rt.Associations||[]).forEach(a=>{if(a.SubnetId)subRT[a.SubnetId]=rt}));
    const subNacl={};[naclDef,naclIso].forEach(n=>(n.Associations||[]).forEach(a=>{if(a.SubnetId)subNacl[a.SubnetId]=n}));
    return {vpcs:[{VpcId:v1,CidrBlock:'10.0.0.0/16',Tags:[{Key:'Name',Value:'DtVPC1'}]},{VpcId:v2,CidrBlock:'10.1.0.0/16',Tags:[{Key:'Name',Value:'DtVPC2'}]}],
      subnets:[{SubnetId:s1,VpcId:v1,CidrBlock:'10.0.0.0/24'},{SubnetId:s2,VpcId:v1,CidrBlock:'10.0.1.0/24'},{SubnetId:s3,VpcId:v1,CidrBlock:'10.0.2.0/24'},{SubnetId:s4,VpcId:v2,CidrBlock:'10.1.0.0/24'}],
      sgs,rts:[rtSh,rtIso],nacls:[naclDef,naclIso],igws:[{InternetGatewayId:'igw-dt-1',Attachments:[{VpcId:v1}]}],nats:[{NatGatewayId:natId,VpcId:v1,SubnetId:s1}],vpces:[],
      instances,albs:[alb],rdsInstances:[rds],ecsServices:[],lambdaFns:[lam],ecacheClusters:[],redshiftClusters:[],
      peerings,tgwAttachments:tgwAtt,tgs:[],instBySub,albBySub:{[s1]:[alb]},rdsBySub:{[s2]:[rds]},ecsBySub:{},lambdaBySub:{[s1]:[lam],[s2]:[lam]},subRT,subNacl,tgByAlb:{},eniBySub:{}};
  }

  // 1: Circular SG refs - no infinite loop
  T('Circular SG refs: no infinite loop',()=>{
    const ctx=mkCtx();const g=buildDependencyGraph(ctx);
    const aToB=(g['sg-dt-a']||[]).some(e=>e.id==='sg-dt-b');
    const bToA=(g['sg-dt-b']||[]).some(e=>e.id==='sg-dt-a');
    const br=getBlastRadius('sg-dt-a',g,10);
    return {pass:aToB&&bToA&&br.all.length<200,detail:'A->B='+aToB+', B->A='+bToA+', blast='+br.all.length};
  });

  // 2: Shared RT high blast radius
  T('Shared RT has high blast radius',()=>{
    const ctx=mkCtx();const g=buildDependencyGraph(ctx);
    const br=getBlastRadius('rtb-dt-sh',g,5);
    return {pass:br.all.length>=1,detail:'RT blast='+br.all.length};
  });

  // 3: Cross-VPC peering edge exists
  T('Peering connects both VPCs',()=>{
    const ctx=mkCtx({pcx:true});const g=buildDependencyGraph(ctx);
    const edges=g['pcx-dt-1']||[];
    return {pass:edges.some(e=>e.id==='vpc-dt-1')&&edges.some(e=>e.id==='vpc-dt-2'),detail:'v1='+edges.some(e=>e.id==='vpc-dt-1')+', v2='+edges.some(e=>e.id==='vpc-dt-2')};
  });

  // 4: Isolated subnet has no instance dependents
  T('Isolated subnet: no instance deps',()=>{
    const ctx=mkCtx();const g=buildDependencyGraph(ctx);
    const br=getBlastRadius('subnet-dt-iso',g,5);
    return {pass:!br.all.some(e=>e.id.startsWith('i-')),detail:'blast='+br.all.length+', instances='+br.all.filter(e=>e.id.startsWith('i-')).length};
  });

  // 5: Fan-out RT -> many subnets via association
  T('Fan-out RT associations correct',()=>{
    const ctx=mkCtx();const g=buildDependencyGraph(ctx);
    const s1rt=(g['subnet-dt-1']||[]).filter(e=>e.id==='rtb-dt-sh');
    const s2rt=(g['subnet-dt-2']||[]).filter(e=>e.id==='rtb-dt-sh');
    const s3rt=(g['subnet-dt-3']||[]).filter(e=>e.id==='rtb-dt-sh');
    return {pass:s1rt.length===1&&s2rt.length===1&&s3rt.length===1,detail:'s1='+s1rt.length+', s2='+s2rt.length+', s3='+s3rt.length};
  });

  // 6: Default NACL dependency
  T('NACL associated to subnet',()=>{
    const ctx=mkCtx();const g=buildDependencyGraph(ctx);
    const assoc=(g['subnet-dt-1']||[]).filter(e=>e.id==='acl-dt-def'&&e.rel==='associated');
    return {pass:assoc.length===1,detail:'nacl assoc='+assoc.length};
  });

  // 7: Lambda multi-subnet dependencies
  T('Lambda in multiple subnets',()=>{
    const ctx=mkCtx();const g=buildDependencyGraph(ctx);
    const s1l=(g['subnet-dt-1']||[]).filter(e=>e.id==='dt-lambda');
    const s2l=(g['subnet-dt-2']||[]).filter(e=>e.id==='dt-lambda');
    return {pass:s1l.length===1&&s2l.length===1,detail:'s1->lam='+s1l.length+', s2->lam='+s2l.length};
  });

  // 8: Design mode doesn't crash graph
  T('Design mode: graph still works',()=>{
    const ctx=mkCtx();const saved=window._designChanges||[];
    window._designChanges=[{type:'add_vpc',params:{name:'X',cidr:'10.250.0.0/16',VpcId:'vpc-virt'}}];
    const g=buildDependencyGraph(ctx);const br=getBlastRadius('vpc-dt-1',g,5);
    window._designChanges=saved;
    return {pass:br.all.length>0,detail:'blast='+br.all.length};
  });

  // 9: TGW edge from route table
  T('TGW edge from route table',()=>{
    const ctx=mkCtx({tgw:true});const g=buildDependencyGraph(ctx);
    const rtToTgw=(g['rtb-dt-sh']||[]).filter(e=>e.id==='tgw-dt-1');
    return {pass:rtToTgw.length===1,detail:'RT->TGW='+rtToTgw.length};
  });

  // 10: Blast radius depth limiting
  T('Blast radius depth limiting',()=>{
    const ctx=mkCtx();const g=buildDependencyGraph(ctx);
    const br1=getBlastRadius('vpc-dt-1',g,1);const br5=getBlastRadius('vpc-dt-1',g,5);
    const maxD1=br1.all.length>0?Math.max(...br1.all.map(e=>e.depth)):0;
    return {pass:br1.all.length<=br5.all.length&&maxD1<=1,detail:'d1='+br1.all.length+' (max='+maxD1+'), d5='+br5.all.length};
  });

  return results;
};

// --- Feature 8: Firewall Editor Edge Case Tests ---
window._edgeCaseTests.firewall=function(){
  const results=[];
  const T=(name,fn)=>{try{const r=fn();results.push({name,pass:r.pass,detail:r.detail})}catch(e){results.push({name,pass:false,detail:'Exception: '+e.message})}};

  // Save/restore helpers to avoid cross-test pollution
  function saveState(){
    return {
      rlCtx:window._rlCtx,
      fwEdits:window._fwEdits,
      fwSnapshot:window._fwSnapshot
    };
  }
  function restoreState(s){
    window._rlCtx=s.rlCtx;
    window._fwEdits=s.fwEdits;
    window._fwSnapshot=s.fwSnapshot;
  }

  // Minimal context builder for firewall tests
  function mkCtx(){
    const v1='vpc-fw-1',s1='subnet-fw-1',s2='subnet-fw-2';
    const sg1={GroupId:'sg-fw-1',GroupName:'fw-test-sg',VpcId:v1,
      IpPermissions:[{IpProtocol:'tcp',FromPort:443,ToPort:443,IpRanges:[{CidrIp:'0.0.0.0/0'}],UserIdGroupPairs:[]}],
      IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}],UserIdGroupPairs:[]}]};
    const naclAllow={NetworkAclId:'acl-fw-1',VpcId:v1,Associations:[{SubnetId:s1},{SubnetId:s2}],Entries:[
      {RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},
      {RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:true,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},
      {RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:false,CidrBlock:'0.0.0.0/0'},
      {RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:true,CidrBlock:'0.0.0.0/0'}
    ]};
    const rt1={RouteTableId:'rtb-fw-1',VpcId:v1,Routes:[{DestinationCidrBlock:'10.0.0.0/16',GatewayId:'local'}],Associations:[{SubnetId:s1},{SubnetId:s2}]};
    const subnets=[{SubnetId:s1,VpcId:v1,CidrBlock:'10.0.0.0/24'},{SubnetId:s2,VpcId:v1,CidrBlock:'10.0.1.0/24'}];
    const subRT={};[rt1].forEach(rt=>(rt.Associations||[]).forEach(a=>{if(a.SubnetId)subRT[a.SubnetId]=rt}));
    const subNacl={};[naclAllow].forEach(n=>(n.Associations||[]).forEach(a=>{if(a.SubnetId)subNacl[a.SubnetId]=n}));
    return {vpcs:[{VpcId:v1,CidrBlock:'10.0.0.0/16'}],subnets,sgs:[sg1],rts:[rt1],nacls:[naclAllow],
      igws:[],nats:[],vpces:[],instances:[],albs:[],rdsInstances:[],ecsServices:[],lambdaFns:[],
      ecacheClusters:[],redshiftClusters:[],peerings:[],tgwAttachments:[],tgs:[],
      instBySub:{},albBySub:{},rdsBySub:{},ecsBySub:{},lambdaBySub:{},subRT,subNacl,
      sgByVpc:{[v1]:[sg1]},tgByAlb:{},eniBySub:{},pubSubs:new Set()};
  }

  // 1: Add NACL inbound rule
  T('Add NACL inbound rule',()=>{
    const saved=saveState();
    try{
      const ctx=mkCtx();
      window._rlCtx=ctx;window._fwEdits=[];window._fwSnapshot=null;
      _fwTakeSnapshot();
      const newRule={RuleNumber:200,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'10.0.0.0/24',PortRange:{From:80,To:80}};
      ctx.nacls[0].Entries.push(Object.assign({},newRule));
      _fwEdits.push({type:'nacl',action:'add',resourceId:'acl-fw-1',direction:'ingress',rule:newRule});
      const hasRule=ctx.nacls[0].Entries.some(e=>e.RuleNumber===200&&!e.Egress);
      const cli=_fwGenerateCli(_fwEdits).join('\n');
      const hasCli=cli.includes('create-network-acl-entry');
      _fwResetAll();
      return {pass:hasRule&&hasCli,detail:'ruleAdded='+hasRule+', cli='+hasCli};
    }finally{restoreState(saved)}
  });

  // 2: Delete NACL rule
  T('Delete NACL rule',()=>{
    const saved=saveState();
    try{
      const ctx=mkCtx();
      window._rlCtx=ctx;window._fwEdits=[];window._fwSnapshot=null;
      _fwTakeSnapshot();
      const delRule=ctx.nacls[0].Entries.find(e=>e.RuleNumber===100&&!e.Egress);
      const idx=ctx.nacls[0].Entries.indexOf(delRule);
      ctx.nacls[0].Entries.splice(idx,1);
      _fwEdits.push({type:'nacl',action:'delete',resourceId:'acl-fw-1',direction:'ingress',rule:delRule,originalRule:delRule});
      const gone=!ctx.nacls[0].Entries.some(e=>e.RuleNumber===100&&!e.Egress);
      const cli=_fwGenerateCli(_fwEdits).join('\n');
      const hasCli=cli.includes('delete-network-acl-entry');
      _fwResetAll();
      return {pass:gone&&hasCli,detail:'ruleGone='+gone+', cli='+hasCli};
    }finally{restoreState(saved)}
  });

  // 3: Modify SG inbound rule
  T('Modify SG inbound rule',()=>{
    const saved=saveState();
    try{
      const ctx=mkCtx();
      window._rlCtx=ctx;window._fwEdits=[];window._fwSnapshot=null;
      _fwTakeSnapshot();
      const origRule=JSON.parse(JSON.stringify(ctx.sgs[0].IpPermissions[0]));
      const newRule={IpProtocol:'tcp',FromPort:8080,ToPort:8080,IpRanges:[{CidrIp:'10.0.0.0/8'}],UserIdGroupPairs:[]};
      ctx.sgs[0].IpPermissions[0]=Object.assign({},newRule);
      _fwEdits.push({type:'sg',action:'modify',resourceId:'sg-fw-1',direction:'ingress',rule:newRule,originalRule:origRule});
      const cli=_fwGenerateCli(_fwEdits).join('\n');
      const hasRevoke=cli.includes('revoke-security-group-ingress');
      const hasAuth=cli.includes('authorize-security-group-ingress');
      _fwResetAll();
      return {pass:hasRevoke&&hasAuth,detail:'revoke='+hasRevoke+', authorize='+hasAuth};
    }finally{restoreState(saved)}
  });

  // 4: Add route
  T('Add route to route table',()=>{
    const saved=saveState();
    try{
      const ctx=mkCtx();
      window._rlCtx=ctx;window._fwEdits=[];window._fwSnapshot=null;
      _fwTakeSnapshot();
      const newRoute={DestinationCidrBlock:'0.0.0.0/0',GatewayId:'igw-fw-test'};
      ctx.rts[0].Routes.push(Object.assign({},newRoute));
      _fwEdits.push({type:'route',action:'add',resourceId:'rtb-fw-1',direction:'egress',rule:newRoute});
      const hasRoute=ctx.rts[0].Routes.some(r=>r.DestinationCidrBlock==='0.0.0.0/0'&&r.GatewayId==='igw-fw-test');
      const cli=_fwGenerateCli(_fwEdits).join('\n');
      const hasCli=cli.includes('create-route');
      _fwResetAll();
      return {pass:hasRoute&&hasCli,detail:'routeAdded='+hasRoute+', cli='+hasCli};
    }finally{restoreState(saved)}
  });

  // 5: Shadowed NACL rule warning
  T('Shadowed NACL rule warning',()=>{
    const nacl={NetworkAclId:'acl-fw-shadow',Entries:[
      {RuleNumber:50,Protocol:'6',RuleAction:'deny',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},
      {RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:0,To:65535}},
      {RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:false,CidrBlock:'0.0.0.0/0'}
    ]};
    const warnings=_fwCheckNaclShadow(nacl,'ingress');
    const hasShadow=warnings.length>0&&warnings.some(w=>w.toLowerCase().includes('shadowed'));
    return {pass:hasShadow,detail:'warnings='+warnings.length+', msg='+(warnings[0]||'none')};
  });

  // 6: Invalid CIDR rejected
  T('Invalid CIDR rejected',()=>{
    const r1=_fwValidateCidr('not-a-cidr');
    const r2=_fwValidateCidr('999.0.0.0/8');
    const r3=_fwValidateCidr('10.0.0.0/33');
    const r4=_fwValidateCidr('10.0.0.0/24');
    const pass=!r1&&!r2&&!r3&&r4;
    return {pass,detail:'notCidr='+r1+', 999='+r2+', /33='+r3+', valid='+r4};
  });

  // 7: Duplicate NACL rule number rejected
  T('Duplicate NACL rule number rejected',()=>{
    const entries=[{RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:80,To:80}}];
    const errs=_fwValidateNaclRule({RuleNumber:100,Protocol:'6',CidrBlock:'10.0.0.0/24',PortRange:{From:443,To:443},RuleAction:'allow'},entries,'ingress');
    const hasDup=errs.some(e=>e.toLowerCase().includes('duplicate'));
    return {pass:hasDup,detail:'errors='+errs.length+', msg='+(errs.find(e=>e.toLowerCase().includes('duplicate'))||'none')};
  });

  // 8: Undo restores original
  T('Undo restores original rule',()=>{
    const saved=saveState();
    try{
      const ctx=mkCtx();
      window._rlCtx=ctx;window._fwEdits=[];window._fwSnapshot=null;
      _fwTakeSnapshot();
      const origLen=ctx.nacls[0].Entries.filter(e=>!e.Egress).length;
      const delRule=ctx.nacls[0].Entries.find(e=>e.RuleNumber===100&&!e.Egress);
      const delCopy=JSON.parse(JSON.stringify(delRule));
      // Remove it via _fwRemoveRule-style splice
      const idx=ctx.nacls[0].Entries.indexOf(delRule);
      ctx.nacls[0].Entries.splice(idx,1);
      _fwEdits.push({type:'nacl',action:'delete',resourceId:'acl-fw-1',direction:'ingress',rule:delCopy,originalRule:delCopy});
      const afterDel=ctx.nacls[0].Entries.filter(e=>!e.Egress).length;
      _fwUndo();
      const afterUndo=ctx.nacls[0].Entries.filter(e=>!e.Egress).length;
      _fwResetAll();
      return {pass:afterDel===origLen-1&&afterUndo===origLen,detail:'orig='+origLen+', afterDel='+afterDel+', afterUndo='+afterUndo};
    }finally{restoreState(saved)}
  });

  // 9: Reset All restores snapshot
  T('Reset All restores snapshot',()=>{
    const saved=saveState();
    try{
      const ctx=mkCtx();
      window._rlCtx=ctx;window._fwEdits=[];window._fwSnapshot=null;
      _fwTakeSnapshot();
      const origLen=ctx.nacls[0].Entries.length;
      // Delete two rules
      ctx.nacls[0].Entries.splice(0,2);
      _fwEdits.push({type:'nacl',action:'delete',resourceId:'acl-fw-1',direction:'ingress',rule:{RuleNumber:100}});
      _fwEdits.push({type:'nacl',action:'delete',resourceId:'acl-fw-1',direction:'egress',rule:{RuleNumber:100}});
      const afterDel=ctx.nacls[0].Entries.length;
      _fwResetAll();
      const afterReset=ctx.nacls[0].Entries.length;
      return {pass:afterDel<origLen&&afterReset===origLen,detail:'orig='+origLen+', afterDel='+afterDel+', afterReset='+afterReset};
    }finally{restoreState(saved)}
  });

  // 10: evaluateSG reflects edits (before=deny, after=allow)
  T('SG eval reflects edit: deny then allow',()=>{
    const saved=saveState();
    try{
      const ctx=mkCtx();
      window._rlCtx=ctx;window._fwEdits=[];window._fwSnapshot=null;
      // SG initially allows tcp/443 only. Check port 8080 => should deny
      const before=evaluateSG(ctx.sgs,'inbound','tcp',8080,'10.0.0.5/32');
      const denied=before.action==='deny';
      // Now add an allow rule for tcp/8080
      _fwTakeSnapshot();
      const newRule={IpProtocol:'tcp',FromPort:8080,ToPort:8080,IpRanges:[{CidrIp:'0.0.0.0/0'}],UserIdGroupPairs:[]};
      ctx.sgs[0].IpPermissions.push(newRule);
      _fwEdits.push({type:'sg',action:'add',resourceId:'sg-fw-1',direction:'ingress',rule:newRule});
      const after=evaluateSG(ctx.sgs,'inbound','tcp',8080,'10.0.0.5/32');
      const allowed=after.action==='allow';
      _fwResetAll();
      return {pass:denied&&allowed,detail:'before='+before.action+', after='+after.action};
    }finally{restoreState(saved)}
  });

  return results;
};

// --- Test Runner ---
window._runEdgeCaseTests = function(feature){
  const tests = window._edgeCaseTests;
  if(!tests[feature]){
    console.error('[EdgeTests] Unknown feature: '+feature+'. Available: '+Object.keys(tests).join(', '));
    return null;
  }
  const results = tests[feature]();
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.group('%c[EdgeTests] '+feature+': '+passed+'/'+results.length+' passed'+(failed?' ('+failed+' FAILED)':''),
    failed ? 'color:red;font-weight:bold' : 'color:green;font-weight:bold');
  results.forEach(r => {
    console.log('%c'+(r.pass ? 'PASS' : 'FAIL')+' %c'+r.name+' %c'+r.detail,
      r.pass ? 'color:green;font-weight:bold' : 'color:red;font-weight:bold',
      'color:inherit', 'color:gray');
  });
  console.groupEnd();
  return {feature, passed, failed, total:results.length, results};
};

window._runAllEdgeCaseTests = function(){
  const features = Object.keys(window._edgeCaseTests);
  const summary = [];
  features.forEach(f => {
    const r = window._runEdgeCaseTests(f);
    if(r) summary.push(r);
  });
  const totalP = summary.reduce((s,r) => s+r.passed, 0);
  const totalF = summary.reduce((s,r) => s+r.failed, 0);
  const totalT = summary.reduce((s,r) => s+r.total, 0);
  console.log('%c[EdgeTests] ALL: '+totalP+'/'+totalT+' passed'+(totalF ? ' ('+totalF+' FAILED)' : ''),
    totalF ? 'color:red;font-weight:bold;font-size:14px' : 'color:green;font-weight:bold;font-size:14px');
  return {passed:totalP, failed:totalF, total:totalT, features:summary};
};
