// Backup, Uptime & Disaster Recovery (BUDR) assessment engine
// Evaluates backup coverage, HA configuration, and DR readiness
// Extracted from index.html for modularization

// --- Transitional window references ---
// _classificationData and runClassificationEngine live in the governance region
// of index.html and have not been extracted to a module yet. During this
// transition period we access them via window globals. Once the governance
// module is extracted, replace these with proper imports.
function _getClassificationData() { return window._classificationData || []; }
function _runClassificationEngine(ctx) { if (typeof window.runClassificationEngine === 'function') window.runClassificationEngine(ctx); }

// === BUDR: BACKUP, UPTIME, DISASTER RECOVERY ===
const _BUDR_STRATEGY={hot:'Hot',warm:'Warm',pilot:'Pilot Light',cold:'Cold'};
const _BUDR_STRATEGY_ORDER={hot:0,warm:1,pilot:2,cold:3};
const _BUDR_STRATEGY_LEGEND=[
  {k:'critical',label:'Critical (Hot)',color:'#ef4444',icon:'🔴',desc:'Active-active — full replica running at all times. Near-zero RTO & RPO.'},
  {k:'high',label:'High (Warm)',color:'#f59e0b',icon:'🟡',desc:'Scaled-down replica running. Scale up on failover. Minutes to recover.'},
  {k:'medium',label:'Medium (Pilot Light)',color:'#6366f1',icon:'🟣',desc:'Data replicated continuously, compute stopped. Spin up on failover. ~10-30 min.'},
  {k:'low',label:'Low (Cold)',color:'#64748b',icon:'⚪',desc:'Backups only, no standby. Rebuild from scratch. Hours to recover.'}
];
const _BUDR_RTO_RPO={
  rds_multi_az:{rto:'~5 min',rpo:'~1 min',tier:'protected',strategy:'warm'},
  rds_single_backup:{rto:'~30 min',rpo:'~24 hr',tier:'partial',strategy:'pilot'},
  rds_no_backup:{rto:'~8 hr',rpo:'total loss',tier:'at_risk',strategy:'cold'},
  rds_aurora:{rto:'<30 sec',rpo:'~5 min (PITR)',tier:'protected',strategy:'hot'},
  ec2_asg:{rto:'~3 min',rpo:'0 (stateless)',tier:'protected',strategy:'warm'},
  ec2_ami_snap:{rto:'~15 min',rpo:'~7 days',tier:'partial',strategy:'pilot'},
  ec2_standalone:{rto:'~8 hr',rpo:'total loss',tier:'at_risk',strategy:'cold'},
  ecs_multi:{rto:'~1 min',rpo:'0 (stateless)',tier:'protected',strategy:'hot'},
  ecs_single:{rto:'~5 min',rpo:'0 (stateless)',tier:'partial',strategy:'warm'},
  lambda:{rto:'0 (managed)',rpo:'0 (stateless)',tier:'protected',strategy:'hot'},
  ecache_multi:{rto:'~2 min',rpo:'~seconds',tier:'protected',strategy:'warm'},
  ecache_single:{rto:'~15 min',rpo:'~7 days',tier:'partial',strategy:'pilot'},
  ecache_no_snap:{rto:'~15 min',rpo:'total loss',tier:'at_risk',strategy:'cold'},
  redshift_snap:{rto:'~30 min',rpo:'~8 hr',tier:'partial',strategy:'pilot'},
  redshift_multi:{rto:'~15 min',rpo:'~5 min',tier:'protected',strategy:'warm'},
  redshift_none:{rto:'~8 hr',rpo:'total loss',tier:'at_risk',strategy:'cold'},
  alb_multi_az:{rto:'0 (managed)',rpo:'N/A',tier:'protected',strategy:'hot'},
  alb_single_az:{rto:'~5 min',rpo:'N/A',tier:'partial',strategy:'warm'},
  s3:{rto:'0 (managed)',rpo:'0 (durable)',tier:'protected',strategy:'hot'},
  s3_versioned:{rto:'0 (managed)',rpo:'0 (versioned)',tier:'protected',strategy:'hot'},
  s3_unversioned:{rto:'0 (managed)',rpo:'total loss',tier:'at_risk',strategy:'cold'},
  s3_mfa_delete:{rto:'0 (managed)',rpo:'0 (immutable)',tier:'protected',strategy:'hot'},
  ebs_snap:{rto:'~15 min',rpo:'~7 days',tier:'partial',strategy:'pilot'},
  ebs_no_snap:{rto:'~8 hr',rpo:'total loss',tier:'at_risk',strategy:'cold'}
};
// Estimated minutes for each BUDR profile (for tier compliance comparison)
// rtoWhy/rpoWhy: justification for estimated values
const _BUDR_EST_MINUTES={
  rds_multi_az:{rto:5,rpo:1,rtoWhy:'Multi-AZ automatic failover completes in 1-2 min; DNS propagation adds ~3 min',rpoWhy:'Synchronous replication to standby — data loss limited to in-flight transactions (~seconds)'},
  rds_single_backup:{rto:30,rpo:1440,rtoWhy:'Restore from automated snapshot requires instance provisioning + data load (~20-30 min)',rpoWhy:'Automated backups run daily — worst case RPO is 24 hours since last backup window'},
  rds_no_backup:{rto:480,rpo:Infinity,rtoWhy:'No backups — requires manual rebuild from application layer or external source',rpoWhy:'No backup mechanism configured — all data since creation is unrecoverable'},
  rds_aurora:{rto:0.5,rpo:5,rtoWhy:'Aurora automatic failover promotes read replica in <30 sec; DNS TTL is 5 sec',rpoWhy:'Aurora replicates 6 copies across 3 AZs — RPO limited to last committed transaction (~seconds)'},
  ec2_asg:{rto:3,rpo:0,rtoWhy:'ASG detects failure via health check (1-2 min) and launches replacement from AMI (~1-2 min)',rpoWhy:'Stateless compute — no persistent data on instance; state lives in external stores'},
  ec2_ami_snap:{rto:15,rpo:10080,rtoWhy:'Manual AMI launch + EBS restore from snapshot (~10-15 min depending on volume size)',rpoWhy:'Snapshot frequency is typically weekly — worst case RPO is 7 days since last snapshot'},
  ec2_standalone:{rto:480,rpo:Infinity,rtoWhy:'No AMI/snapshot — requires full OS install, config, and application deployment from scratch',rpoWhy:'No backup mechanism — local EBS data is unrecoverable if instance or volume is lost'},
  ecs_multi:{rto:1,rpo:0,rtoWhy:'ECS service scheduler replaces failed tasks in ~30-60 sec from container image',rpoWhy:'Stateless containers — no persistent data; state lives in external stores (RDS, S3, etc.)'},
  ecs_single:{rto:5,rpo:0,rtoWhy:'Single task replacement takes ~2-5 min including image pull and health check',rpoWhy:'Stateless containers — no persistent data; state lives in external stores'},
  lambda:{rto:0,rpo:0,rtoWhy:'Fully managed — AWS handles all availability; cold start adds <1 sec latency',rpoWhy:'Stateless execution — no persistent data; code stored in S3 with versioning'},
  ecache_multi:{rto:2,rpo:0.1,rtoWhy:'Multi-AZ auto-failover promotes replica in 1-2 min; DNS endpoint updates automatically',rpoWhy:'Async replication lag is typically <100ms — data loss limited to replication lag'},
  ecache_single:{rto:15,rpo:10080,rtoWhy:'Restore from snapshot requires new cluster provisioning + data load (~10-15 min)',rpoWhy:'Snapshot frequency is typically daily/weekly — worst case RPO equals snapshot interval'},
  ecache_no_snap:{rto:15,rpo:Infinity,rtoWhy:'New cluster provisioning takes ~10-15 min but cache starts cold (empty)',rpoWhy:'No snapshots — entire cache contents are lost; must be rebuilt from source of truth'},
  redshift_snap:{rto:30,rpo:1440,rtoWhy:'Restore from snapshot creates new cluster (~20-30 min depending on data size)',rpoWhy:'Automated snapshots run every 8 hours by default — worst case RPO is snapshot interval'},
  redshift_multi:{rto:15,rpo:5,rtoWhy:'Multi-node cluster redistributes work to surviving nodes (~10-15 min recovery)',rpoWhy:'Synchronous replication across nodes — RPO limited to in-flight queries (~minutes)'},
  redshift_none:{rto:480,rpo:Infinity,rtoWhy:'No snapshots — requires full data reload from S3/source systems (hours to days)',rpoWhy:'No backup mechanism — all warehouse data is unrecoverable'},
  alb_multi_az:{rto:0,rpo:0,rtoWhy:'Fully managed multi-AZ — AWS handles node replacement transparently',rpoWhy:'Stateless load balancer — no data to lose; config stored in AWS control plane'},
  alb_single_az:{rto:5,rpo:0,rtoWhy:'Single-AZ ALB may need DNS failover if AZ goes down (~3-5 min)',rpoWhy:'Stateless load balancer — no data to lose'},
  s3:{rto:0,rpo:0,rtoWhy:'11 nines durability — service is always available across 3+ AZs',rpoWhy:'Objects replicated across multiple AZs automatically'},
  s3_versioned:{rto:0,rpo:0,rtoWhy:'Versioned objects can be restored to any previous version instantly',rpoWhy:'Every object change creates a new version — zero data loss possible'},
  s3_unversioned:{rto:0,rpo:Infinity,rtoWhy:'Bucket is always available, but deleted/overwritten objects cannot be recovered',rpoWhy:'No versioning — overwrites and deletes are permanent and unrecoverable'},
  s3_mfa_delete:{rto:0,rpo:0,rtoWhy:'MFA Delete prevents accidental deletion — objects recoverable from versions',rpoWhy:'Versioning + MFA Delete = immutable storage; data cannot be accidentally lost'},
  ebs_snap:{rto:15,rpo:10080,rtoWhy:'Create new volume from snapshot + attach to instance (~10-15 min)',rpoWhy:'Snapshot frequency is typically weekly — worst case RPO is 7 days since last snapshot'},
  ebs_no_snap:{rto:480,rpo:Infinity,rtoWhy:'No snapshots — volume data is unrecoverable if volume fails (rare but possible)',rpoWhy:'No backup mechanism — all volume data is permanently lost on failure'}
};
// Classification tier targets in minutes (from compliance policy)
const _TIER_TARGETS={
  critical:{rto:240,rpo:60,rtoLabel:'2-4 hours',rpoLabel:'Hourly'},
  high:{rto:480,rpo:360,rtoLabel:'4-8 hours',rpoLabel:'6 hours'},
  medium:{rto:720,rpo:1440,rtoLabel:'12 hours',rpoLabel:'Daily'},
  low:{rto:1440,rpo:10080,rtoLabel:'24 hours',rpoLabel:'Weekly'}
};
// Compare estimated restore capability vs tier target — returns compliance status
function _budrTierCompliance(profileKey,classTier){
  if(!profileKey||!classTier)return{status:'unknown',issues:[]};
  var est=_BUDR_EST_MINUTES[profileKey];var target=_TIER_TARGETS[classTier];
  if(!est||!target)return{status:'unknown',issues:[]};
  var issues=[];
  if(est.rpo===Infinity)issues.push({field:'RPO',severity:'critical',msg:'No backup — RPO unrecoverable (target: '+target.rpoLabel+')'});
  else if(est.rpo>target.rpo)issues.push({field:'RPO',severity:'warning',msg:'Est. RPO ~'+_fmtMin(est.rpo)+' exceeds '+classTier+' target of '+target.rpoLabel});
  if(est.rto>target.rto)issues.push({field:'RTO',severity:'warning',msg:'Est. RTO ~'+_fmtMin(est.rto)+' exceeds '+classTier+' target of '+target.rtoLabel});
  var status=issues.some(function(i){return i.severity==='critical'})?'fail':issues.length?'warn':'pass';
  return{status:status,issues:issues,estRto:est.rto,estRpo:est.rpo,targetRto:target.rto,targetRpo:target.rpo,rtoWhy:est.rtoWhy||'',rpoWhy:est.rpoWhy||''};
}
function _fmtMin(m){if(m===0)return '0';if(m===Infinity)return '∞';if(m<60)return Math.round(m)+' min';if(m<1440)return Math.round(m/60*10)/10+' hr';return Math.round(m/1440*10)/10+' days'}

// --- Module state ---
// Exported as both underscore (backward compat with inline code) and clean names.
// Use setter functions to reassign from outside the module.
let budrFindings=[];
let budrAssessments=[];
let budrOverrides={};
function setBudrFindings(v) { budrFindings = v; }
function setBudrAssessments(v) { budrAssessments = v; }
function setBudrOverrides(v) { budrOverrides = v; }

function runBUDRChecks(ctx){
  const f=[];const assessments=[];
  const gn=(o,id)=>{const t=(o.Tags||o.tags||[]);const n=t.find(t=>t.Key==='Name');return n?n.Value:id};
  // RDS
  (ctx.rdsInstances||[]).forEach(db=>{
    if(db.ReadReplicaSourceDBInstanceIdentifier)return;
    const id=db.DBInstanceIdentifier;const name=id;
    const hasMultiAZ=!!db.MultiAZ;
    const hasBackup=(db.BackupRetentionPeriod||0)>0;
    const encrypted=!!db.StorageEncrypted;
    const isMicro=(db.DBInstanceClass||'').includes('.micro');
    const hasPITR=!!db.LatestRestorableTime;
    const isAurora=(db.Engine||'').startsWith('aurora');
    let profile,sev;
    if(hasMultiAZ&&hasBackup){profile=_BUDR_RTO_RPO.rds_multi_az;sev=null}
    else if(hasBackup){profile=_BUDR_RTO_RPO.rds_single_backup;sev=isMicro?null:'MEDIUM';
      f.push({severity:'MEDIUM',control:'BUDR-HA-1',framework:'BUDR',resource:id,resourceName:name,message:'RDS not Multi-AZ — single point of failure',remediation:'Enable Multi-AZ for automatic failover'})}
    else{profile=_BUDR_RTO_RPO.rds_no_backup;sev='CRITICAL';
      f.push({severity:'CRITICAL',control:'BUDR-BAK-1',framework:'BUDR',resource:id,resourceName:name,message:'RDS has no automated backups (retention=0)',remediation:'Set BackupRetentionPeriod to at least 7 days'})}
    if(isAurora&&hasBackup){profile=_BUDR_RTO_RPO.rds_aurora}
    if(!hasMultiAZ&&!isMicro&&hasBackup)
      f.push({severity:'HIGH',control:'BUDR-DR-1',framework:'BUDR',resource:id,resourceName:name,message:'RDS single-AZ with backups only — extended RTO on AZ failure',remediation:'Enable Multi-AZ or create cross-region read replica'});
    if(!db.DeletionProtection&&!isMicro)
      f.push({severity:'MEDIUM',control:'BUDR-DEL-1',framework:'BUDR',resource:id,resourceName:name,message:'RDS deletion protection disabled',remediation:'Enable DeletionProtection to prevent accidental deletion'});
    assessments.push({type:'RDS',id,name,profile,signals:{MultiAZ:hasMultiAZ,Backup:hasBackup,Encrypted:encrypted,DeletionProtection:!!db.DeletionProtection,ReadReplicas:(db.ReadReplicaDBInstanceIdentifiers||[]).length,PITR:hasPITR}});
  });
  // EC2
  const asgInstIds=new Set();
  // Detect ASG membership from tags
  (ctx.instances||[]).forEach(inst=>{
    const asgTag=(inst.Tags||[]).find(t=>t.Key==='aws:autoscaling:groupName');
    if(asgTag&&asgTag.Value)asgInstIds.add(inst.InstanceId);
  });
  (ctx.instances||[]).forEach(inst=>{
    const id=inst.InstanceId;const name=gn(inst,id);
    const inASG=asgInstIds.has(id);
    const vols=(inst.BlockDeviceMappings||[]).map(b=>b.Ebs?.VolumeId).filter(Boolean);
    const hasSnaps=vols.some(vid=>{const s=(ctx.snapByVol||{})[vid];return s&&s.length>0});
    let newestSnap=null;
    vols.forEach(vid=>{const ss=(ctx.snapByVol||{})[vid]||[];ss.forEach(s=>{
      const d=new Date(s.StartTime);if(!newestSnap||d>newestSnap)newestSnap=d;
    })});
    const snapAgeDays=newestSnap?Math.floor((Date.now()-newestSnap.getTime())/(864e5)):null;
    if(hasSnaps&&snapAgeDays!==null&&snapAgeDays>7){
      f.push({severity:'MEDIUM',control:'BUDR-AGE-1',framework:'BUDR',resource:id,resourceName:name,message:'Newest EBS snapshot is '+snapAgeDays+' days old (>7 days)',remediation:'Configure AWS Backup or DLM to take snapshots at least weekly'});
    }
    const encrypted=vols.some(vid=>{const vs=(ctx.volumes||[]).filter(v=>v.VolumeId===vid);return vs.length&&vs[0].Encrypted});
    let profile;
    if(inASG){profile=_BUDR_RTO_RPO.ec2_asg}
    else if(hasSnaps){profile=_BUDR_RTO_RPO.ec2_ami_snap;
      f.push({severity:'LOW',control:'BUDR-HA-2',framework:'BUDR',resource:id,resourceName:name,message:'EC2 not in Auto Scaling group — manual recovery required',remediation:'Place behind ASG or create AMI + launch template for quick recovery'})}
    else{profile=_BUDR_RTO_RPO.ec2_standalone;
      f.push({severity:'HIGH',control:'BUDR-BAK-2',framework:'BUDR',resource:id,resourceName:name,message:'EC2 standalone with no EBS snapshots — unrecoverable on failure',remediation:'Create regular EBS snapshots via AWS Backup or DLM; consider ASG'});
      if(!inASG)f.push({severity:'MEDIUM',control:'BUDR-DR-2',framework:'BUDR',resource:id,resourceName:name,message:'EC2 has no disaster recovery strategy',remediation:'Create AMI, configure ASG with multi-AZ, or use EBS snapshots'})}
    assessments.push({type:'EC2',id,name,profile,signals:{ASG:inASG,Snapshots:hasSnaps,SnapAgeDays:snapAgeDays,Encrypted:encrypted}});
  });
  // ECS
  (ctx.ecsServices||[]).forEach(svc=>{
    const id=svc.serviceName||svc.serviceArn;const name=svc.serviceName||id;
    const desired=svc.desiredCount||0;
    const multi=desired>1;
    let profile;
    if(multi){profile=_BUDR_RTO_RPO.ecs_multi}
    else{profile=_BUDR_RTO_RPO.ecs_single;
      f.push({severity:'LOW',control:'BUDR-HA-3',framework:'BUDR',resource:id,resourceName:name,message:'ECS service has desiredCount='+desired+' — no redundancy',remediation:'Set desiredCount ≥ 2 across multiple AZs'})}
    assessments.push({type:'ECS',id,name,profile,signals:{DesiredCount:desired,MultiTask:multi}});
  });
  // Lambda (inherently resilient)
  (ctx.lambdaFns||[]).forEach(fn=>{
    assessments.push({type:'Lambda',id:fn.FunctionName,name:fn.FunctionName,profile:_BUDR_RTO_RPO.lambda,signals:{Managed:true}});
  });
  // ElastiCache
  (ctx.ecacheClusters||[]).forEach(ec=>{
    const id=ec.CacheClusterId;const name=id;
    const multiNode=(ec.NumCacheNodes||1)>1;
    const hasSnap=!!(ec.SnapshotWindow||ec.SnapshotRetentionLimit);
    const autoFailover=ec.AutomaticFailover==='enabled';
    let profile;
    if(multiNode){profile=_BUDR_RTO_RPO.ecache_multi}
    else if(hasSnap){profile=_BUDR_RTO_RPO.ecache_single;
      f.push({severity:'MEDIUM',control:'BUDR-HA-4',framework:'BUDR',resource:id,resourceName:name,message:'ElastiCache single node — failover requires manual intervention',remediation:'Add replicas or enable cluster mode for automatic failover'})}
    else{profile=_BUDR_RTO_RPO.ecache_no_snap;
      f.push({severity:'HIGH',control:'BUDR-BAK-3',framework:'BUDR',resource:id,resourceName:name,message:'ElastiCache single node with no snapshots — data loss risk',remediation:'Enable automatic snapshots and add read replicas'})}
    assessments.push({type:'ElastiCache',id,name,profile,signals:{MultiNode:multiNode,Snapshots:hasSnap,AutoFailover:autoFailover}});
  });
  // Redshift
  (ctx.redshiftClusters||[]).forEach(rs=>{
    const id=rs.ClusterIdentifier;const name=id;
    const multiNode=(rs.NumberOfNodes||1)>1;
    const hasSnap=(rs.AutomatedSnapshotRetentionPeriod||0)>0;
    let profile;
    if(multiNode&&hasSnap){profile=_BUDR_RTO_RPO.redshift_multi}
    else if(hasSnap){profile=_BUDR_RTO_RPO.redshift_snap;
      f.push({severity:'MEDIUM',control:'BUDR-HA-5',framework:'BUDR',resource:id,resourceName:name,message:'Redshift single-node cluster — no compute redundancy',remediation:'Resize to multi-node cluster for HA'})}
    else{profile=_BUDR_RTO_RPO.redshift_none;
      f.push({severity:'HIGH',control:'BUDR-BAK-4',framework:'BUDR',resource:id,resourceName:name,message:'Redshift with no automated snapshots — data loss risk',remediation:'Enable automated snapshots with ≥7 day retention'})}
    assessments.push({type:'Redshift',id,name,profile,signals:{MultiNode:multiNode,Snapshots:hasSnap}});
  });
  // ALBs
  (ctx.albs||[]).forEach(alb=>{
    const id=alb.LoadBalancerName||alb.LoadBalancerArn;const name=alb.LoadBalancerName||id;
    const azs=(alb.AvailabilityZones||[]).length;
    let profile;
    if(azs>=2){profile=_BUDR_RTO_RPO.alb_multi_az}
    else{profile=_BUDR_RTO_RPO.alb_single_az;
      f.push({severity:'MEDIUM',control:'BUDR-HA-6',framework:'BUDR',resource:id,resourceName:name,message:'ALB in single AZ only — no failover',remediation:'Register subnets in at least 2 AZs'})}
    assessments.push({type:'ALB',id,name,profile,signals:{AZCount:azs}});
  });
  // EBS volumes (standalone — not already counted via EC2)
  (ctx.volumes||[]).forEach(vol=>{
    if(vol.State!=='in-use')return;
    const id=vol.VolumeId;const name=gn(vol,id);
    const snaps=(ctx.snapByVol||{})[id]||[];
    if(snaps.length===0){
      f.push({severity:'MEDIUM',control:'BUDR-BAK-5',framework:'BUDR',resource:id,resourceName:name,message:'In-use EBS volume has no snapshots',remediation:'Create snapshot schedule via AWS Backup or DLM lifecycle policy'});
    }
  });
  // S3
  (ctx.s3bk||[]).forEach(bk=>{
    const id=bk.Name||'unknown';const name=id;
    const versioned=bk.Versioning&&bk.Versioning.Status==='Enabled';
    const mfaDel=bk.Versioning&&bk.Versioning.MFADelete==='Enabled';
    let profile;
    if(mfaDel){profile=_BUDR_RTO_RPO.s3_mfa_delete}
    else if(versioned){profile=_BUDR_RTO_RPO.s3_versioned}
    else{profile=_BUDR_RTO_RPO.s3_unversioned;
      f.push({severity:'HIGH',control:'BUDR-S3-1',framework:'BUDR',resource:id,resourceName:name,message:'S3 bucket has no versioning \u2014 data loss risk',remediation:'Enable versioning to protect against accidental deletes and overwrites'})}
    assessments.push({type:'S3',id,name,profile,signals:{Versioned:versioned,MFADelete:mfaDel}});
  });
  // Enrich assessments with account/vpc/region from raw resources
  var _budrLookup={};
  var _bSubVpc={};(ctx.subnets||[]).forEach(function(s){if(s.SubnetId)_bSubVpc[s.SubnetId]=s.VpcId||''});
  (ctx.rdsInstances||[]).forEach(function(r){_budrLookup['RDS:'+r.DBInstanceIdentifier]={a:r._accountId||'',r:r._region||'',v:(r.DBSubnetGroup&&r.DBSubnetGroup.VpcId)||''}});
  (ctx.instances||[]).forEach(function(r){_budrLookup['EC2:'+r.InstanceId]={a:r._accountId||'',r:r._region||'',v:r.VpcId||_bSubVpc[r.SubnetId]||''}});
  (ctx.ecsServices||[]).forEach(function(r){var nc=r.networkConfiguration&&r.networkConfiguration.awsvpcConfiguration;var sid=nc&&nc.subnets&&nc.subnets[0]?nc.subnets[0]:'';_budrLookup['ECS:'+(r.serviceName||r.serviceArn)]={a:r._accountId||'',r:r._region||'',v:sid?_bSubVpc[sid]||'':''}});
  (ctx.lambdaFns||[]).forEach(function(r){_budrLookup['Lambda:'+r.FunctionName]={a:r._accountId||'',r:r._region||'',v:(r.VpcConfig&&r.VpcConfig.VpcId)||''}});
  (ctx.ecacheClusters||[]).forEach(function(r){_budrLookup['ElastiCache:'+r.CacheClusterId]={a:r._accountId||'',r:r._region||'',v:r.VpcId||''}});
  (ctx.redshiftClusters||[]).forEach(function(r){_budrLookup['Redshift:'+r.ClusterIdentifier]={a:r._accountId||'',r:r._region||'',v:r.VpcId||''}});
  (ctx.albs||[]).forEach(function(r){_budrLookup['ALB:'+(r.LoadBalancerName||r.LoadBalancerArn)]={a:r._accountId||'',r:r._region||'',v:r.VpcId||''}});
  (ctx.s3bk||[]).forEach(function(r){_budrLookup['S3:'+r.Name]={a:r._accountId||'',r:r._region||'',v:''}});
  (ctx.volumes||[]).forEach(function(r){_budrLookup['EBS:'+r.VolumeId]={a:r._accountId||'',r:r._region||'',v:''}});
  (ctx.snapshots||[]).forEach(function(r){_budrLookup['Snapshot:'+r.SnapshotId]={a:r._accountId||'',r:r._region||'',v:''}});
  assessments.forEach(function(a){var info=_budrLookup[a.type+':'+a.id];if(info){a.account=info.a;a.region=info.r;a.vpcId=info.v}});
  // Fallback: unmatched assessments get primary account
  var _bAccts=new Set();(ctx.vpcs||[]).forEach(function(v){if(v._accountId&&v._accountId!=='default')_bAccts.add(v._accountId)});
  if(_bAccts.size>=1){var _bPri=[..._bAccts][0];assessments.forEach(function(a){if(!a.account)a.account=_bPri})}
  // Enrich BUDR findings with account/region (for Action Plan sheet)
  var _bResLookup={};
  Object.keys(_budrLookup).forEach(function(k){var id=k.split(':').slice(1).join(':');_bResLookup[id]=_budrLookup[k]});
  f.forEach(function(finding){var info=_bResLookup[finding.resource];if(info){finding._accountId=info.a;finding._region=info.r;finding._vpcId=info.v}});
  if(_bAccts.size>=1){var _bPri2=[..._bAccts][0];f.forEach(function(finding){if(!finding._accountId)finding._accountId=_bPri2})};
  budrFindings=f;
  budrAssessments=assessments;
  // Cross-reference with classification engine for tier compliance
  _enrichBudrWithClassification(ctx,f);
  return f;
}
function _enrichBudrWithClassification(ctx,findings){
  // Run classification if not already done
  // NOTE: _classificationData and runClassificationEngine are from the governance
  // region (not yet extracted). Access via window globals during transition.
  var classData = _getClassificationData();
  if(!classData.length&&ctx) _runClassificationEngine(ctx);
  classData = _getClassificationData();
  // Build lookup by resource id/name (type-qualified keys take priority to avoid cross-type collisions)
  var classMap={};var classMapTyped={};
  classData.forEach(function(c){classMap[c.id]=c;classMap[c.name]=c;classMapTyped[c.type+'|'+c.id]=c;classMapTyped[c.type+'|'+c.name]=c});
  // Enrich each BUDR assessment
  budrAssessments.forEach(function(a){
    var cls=classMapTyped[a.type+'|'+a.id]||classMapTyped[a.type+'|'+a.name]||classMap[a.id]||classMap[a.name];
    a.classTier=cls?cls.tier:'low';
    a.classVpcName=cls?cls.vpcName:'';
    // Find which profile key this assessment uses
    var profileKey=null;
    for(var k in _BUDR_RTO_RPO){if(_BUDR_RTO_RPO[k]===a.profile){profileKey=k;break}}
    a.profileKey=profileKey;
    a.compliance=_budrTierCompliance(profileKey,a.classTier);
    // Generate findings for compliance gaps
    if(a.compliance.issues.length>0){
      a.compliance.issues.forEach(function(issue){
        var sev=issue.severity==='critical'?'CRITICAL':'HIGH';
        findings.push({severity:sev,control:'BUDR-TIER-'+issue.field,framework:'BUDR',resource:a.id,resourceName:a.name,
          message:issue.msg+' ['+a.classTier+' tier]',
          remediation:issue.field==='RPO'?'Configure automated backups to meet '+a.classTier+' RPO target':'Improve HA/DR strategy to meet '+a.classTier+' RTO target'});
      });
    }
    // Apply manual override if present
    var ov=budrOverrides[a.id];
    if(ov){
      a.overridden=true;
      a.autoProfile={strategy:a.profile.strategy,rto:a.profile.rto,rpo:a.profile.rpo,tier:a.profile.tier};
      if(ov.strategy){
        a.profile=Object.assign({},a.profile);
        var sm={critical:'hot',high:'warm',medium:'pilot',low:'cold'};
        var tm={critical:'protected',high:'protected',medium:'partial',low:'at_risk'};
        a.profile.strategy=sm[ov.strategy]||ov.strategy;
        a.profile.tier=tm[ov.strategy]||a.profile.tier;
      }
      if(ov.rto) a.profile.rto=ov.rto;
      if(ov.rpo) a.profile.rpo=ov.rpo;
    }
  });
}
function _reapplyBUDROverrides(){
  budrAssessments.forEach(function(a){
    // Restore auto values first
    if(a.autoProfile){
      a.profile=Object.assign({},a.profile);
      a.profile.strategy=a.autoProfile.strategy;
      a.profile.rto=a.autoProfile.rto;
      a.profile.rpo=a.autoProfile.rpo;
      a.profile.tier=a.autoProfile.tier;
      a.overridden=false;
    }
    var ov=budrOverrides[a.id];
    if(ov){
      a.overridden=true;
      if(!a.autoProfile)a.autoProfile={strategy:a.profile.strategy,rto:a.profile.rto,rpo:a.profile.rpo,tier:a.profile.tier};
      a.profile=Object.assign({},a.profile);
      if(ov.strategy){
        var sm={critical:'hot',high:'warm',medium:'pilot',low:'cold'};
        var tm={critical:'protected',high:'protected',medium:'partial',low:'at_risk'};
        a.profile.strategy=sm[ov.strategy]||ov.strategy;
        a.profile.tier=tm[ov.strategy]||a.profile.tier;
      }
      if(ov.rto)a.profile.rto=ov.rto;
      if(ov.rpo)a.profile.rpo=ov.rpo;
    }
  });
}
function _getBUDRTierCounts(){
  const counts={protected:0,partial:0,at_risk:0};
  budrAssessments.forEach(a=>{
    if(a.profile)counts[a.profile.tier]=(counts[a.profile.tier]||0)+1;
  });
  return counts;
}
function _getBudrComplianceCounts(){
  var counts={pass:0,warn:0,fail:0,unknown:0};
  budrAssessments.forEach(function(a){
    var s=a.compliance?a.compliance.status:'unknown';
    counts[s]=(counts[s]||0)+1;
  });
  return counts;
}

// === Exports ===
// Constants
export {
  _BUDR_STRATEGY,
  _BUDR_STRATEGY_ORDER,
  _BUDR_STRATEGY_LEGEND,
  _BUDR_RTO_RPO,
  _BUDR_EST_MINUTES,
  _TIER_TARGETS
};

// Functions
export {
  runBUDRChecks,
  _budrTierCompliance,
  _fmtMin,
  _enrichBudrWithClassification,
  _reapplyBUDROverrides,
  _getBUDRTierCounts,
  _getBudrComplianceCounts
};

// State — clean names + setters
export {
  budrFindings,
  budrAssessments,
  budrOverrides,
  setBudrFindings,
  setBudrAssessments,
  setBudrOverrides
};

// Backward-compat aliases for inline code that references underscore names.
// ES module `export let` bindings are live, so these getters stay current.
export {
  budrFindings as _budrFindings,
  budrAssessments as _budrAssessments,
  budrOverrides as _budrOverrides
};
