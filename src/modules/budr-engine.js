// Backup, Uptime & Disaster Recovery (BUDR) assessment engine
// Evaluates backup coverage, HA configuration, and DR readiness
// Extracted from index.html for modularization

// === BUDR: BACKUP, UPTIME, DISASTER RECOVERY ===
const _BUDR_STRATEGY={hot:'Hot',warm:'Warm',pilot:'Pilot Light',cold:'Cold'};
const _BUDR_STRATEGY_ORDER={hot:0,warm:1,pilot:2,cold:3};
const _BUDR_RTO_RPO={
  rds_multi_az:{rto:'~5 min',rpo:'~1 min',tier:'protected',strategy:'warm'},
  rds_single_backup:{rto:'~30 min',rpo:'backup interval',tier:'partial',strategy:'pilot'},
  rds_no_backup:{rto:'~hours',rpo:'unrecoverable',tier:'at_risk',strategy:'cold'},
  rds_aurora:{rto:'<30s',rpo:'<5 min (PITR)',tier:'protected',strategy:'hot'},
  ec2_asg:{rto:'~3 min',rpo:'~0 (stateless)',tier:'protected',strategy:'warm'},
  ec2_ami_snap:{rto:'~15 min',rpo:'snapshot age',tier:'partial',strategy:'pilot'},
  ec2_standalone:{rto:'~hours',rpo:'unrecoverable',tier:'at_risk',strategy:'cold'},
  ecs_multi:{rto:'~1 min',rpo:'~0',tier:'protected',strategy:'hot'},
  ecs_single:{rto:'~5 min',rpo:'~0',tier:'partial',strategy:'warm'},
  lambda:{rto:'~0',rpo:'~0',tier:'protected',strategy:'hot'},
  ecache_multi:{rto:'~2 min',rpo:'~seconds',tier:'protected',strategy:'warm'},
  ecache_single:{rto:'~15 min',rpo:'snapshot age',tier:'partial',strategy:'pilot'},
  ecache_no_snap:{rto:'~15 min',rpo:'unrecoverable',tier:'at_risk',strategy:'cold'},
  redshift_snap:{rto:'~30 min',rpo:'snapshot interval',tier:'partial',strategy:'pilot'},
  redshift_multi:{rto:'~15 min',rpo:'~minutes',tier:'protected',strategy:'warm'},
  redshift_none:{rto:'~hours',rpo:'unrecoverable',tier:'at_risk',strategy:'cold'},
  alb_multi_az:{rto:'~0',rpo:'N/A',tier:'protected',strategy:'hot'},
  alb_single_az:{rto:'~5 min',rpo:'N/A',tier:'partial',strategy:'warm'},
  s3:{rto:'~0',rpo:'~0',tier:'protected',strategy:'hot'},
  s3_versioned:{rto:'~0',rpo:'0 (versioned)',tier:'protected',strategy:'hot'},
  s3_unversioned:{rto:'~0',rpo:'Unrecoverable',tier:'at_risk',strategy:'cold'},
  s3_mfa_delete:{rto:'~0',rpo:'0 (immutable)',tier:'protected',strategy:'hot'},
  ebs_snap:{rto:'~15 min',rpo:'snapshot age',tier:'partial',strategy:'pilot'},
  ebs_no_snap:{rto:'~hours',rpo:'unrecoverable',tier:'at_risk',strategy:'cold'}
};
let _budrFindings=[];
let _budrAssessments=[];
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
  _budrFindings=f;
  _budrAssessments=assessments;
  return f;
}
function _getBUDRTierCounts(){
  const counts={protected:0,partial:0,at_risk:0};
  _budrAssessments.forEach(a=>{
    if(a.profile)counts[a.profile.tier]=(counts[a.profile.tier]||0)+1;
  });
  return counts;
}
