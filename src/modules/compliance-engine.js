// Compliance checks engine (CIS, WAF, SOC2, PCI, IAM, BUDR)
// Runs automated compliance checks and generates findings
// Extracted from index.html for modularization

// === CHECKOV (CKV) ID MAPPING ===
// Maps existing control IDs to their Checkov equivalents for unified compliance view
const _CKV_MAP={
  // CIS / NET → Checkov
  'CIS 5.2':'CKV_AWS_24',   // SSH from 0.0.0.0/0
  'CIS 5.3':'CKV_AWS_25',   // RDP from 0.0.0.0/0
  'CIS 5.4':'CKV_AWS_277',  // Default SG restricts all traffic
  'NET-2':'CKV_AWS_260',    // All traffic from 0.0.0.0/0
  // ARCH → Checkov
  'ARCH-C2':'CKV_AWS_189',  // EBS encryption
  'ARCH-D1':'CKV_AWS_17',   // RDS publicly accessible
  'ARCH-D2':'CKV_AWS_157',  // RDS Multi-AZ
  'ARCH-D3':'CKV_AWS_16',   // RDS encryption at rest
  'ARCH-D5':'CKV_AWS_64',   // Redshift encryption
  'ARCH-D6':'CKV_AWS_29',   // ElastiCache at-rest encryption
  'ARCH-D7':'CKV_AWS_142',  // Redshift publicly accessible
  'ARCH-S1':'CKV_AWS_19',   // S3 default encryption
  'ARCH-E2':'CKV_AWS_34',   // CloudFront viewer protocol
  'ARCH-C4':'CKV_AWS_363',  // Lambda deprecated runtime
  // SOC2 → Checkov
  'SOC2-CC7.2':'CKV_AWS_126',// VPC flow logs
  'SOC2-C1.2':'CKV_AWS_3',  // EBS encryption
  'SOC2-C1.3':'CKV_AWS_30', // ElastiCache transit encryption
  // PCI → Checkov
  'PCI-3.4.1':'CKV_AWS_3',  // Encryption at rest (EBS/RDS/S3)
  'PCI-10.2.1':'CKV_AWS_126',// VPC flow logs
  'PCI-11.3.1':'CKV_AWS_17',// RDS publicly accessible
  // IAM → Checkov
  'IAM-1':'CKV_AWS_274',    // Admin access (*:*)
  'IAM-3':'CKV_AWS_36',     // MFA for IAM users
  'IAM-11':'CKV_AWS_273',   // Console without MFA
  'IAM-13':'CKV_AWS_56',    // Password policy
};

// Resource list panel - opened by clicking stats bar chips
let _rlCtx=null; // store context for stat chip clicks
let _mapSvg=null,_mapZoom=null,_mapG=null; // global map refs for navigation
let _showNested=false;
let _detailLevel=0; // 0=collapsed(VPC+subnet names), 1=normal(resources), 2=expanded(nested children)
let _dnsRecordsExpanded=false; // DNS zones always show; toggle for individual record rows

// === COMPLIANCE ENGINE ===
let _complianceFindings=[];
function _hasOpenCidr(perm){return(perm.IpRanges||[]).some(r=>r.CidrIp==='0.0.0.0/0')||(perm.Ipv6Ranges||[]).some(r=>r.CidrIpv6==='::/0')}
function _hasPort(perm,port){if(perm.IpProtocol==='-1')return true;const p=String(perm.IpProtocol);if(p!=='6'&&p!=='17'&&p!=='tcp'&&p!=='udp')return false;const from=perm.FromPort,to=perm.ToPort;if(from===undefined||to===undefined)return false;return from<=port&&to>=port}
function _naclCoversPort(e,port){if(e.Protocol==='-1')return true;const p=parseInt(e.Protocol,10);if(p!==6&&p!==17)return false;const pr=e.PortRange;if(!pr||pr.From===undefined||pr.To===undefined)return false;return pr.From<=port&&pr.To>=port}
function runCISChecks(ctx){
  const f=[];
  // CIS 5.2: SG allows SSH from 0.0.0.0/0
  (ctx.sgs||[]).forEach(sg=>{(sg.IpPermissions||[]).forEach(p=>{
    if(_hasPort(p,22)&&_hasOpenCidr(p))f.push({severity:'HIGH',control:'CIS 5.2',framework:'CIS',resource:sg.GroupId,resourceName:sg.GroupName||'',message:'SG allows SSH (22) from 0.0.0.0/0',remediation:'Restrict SSH to specific CIDR ranges or bastion host SG'});
  })});
  // CIS 5.3: SG allows RDP from 0.0.0.0/0
  (ctx.sgs||[]).forEach(sg=>{(sg.IpPermissions||[]).forEach(p=>{
    if(_hasPort(p,3389)&&_hasOpenCidr(p))f.push({severity:'HIGH',control:'CIS 5.3',framework:'CIS',resource:sg.GroupId,resourceName:sg.GroupName||'',message:'SG allows RDP (3389) from 0.0.0.0/0',remediation:'Restrict RDP to specific CIDR ranges or VPN'});
  })});
  // CIS 5.4: Default SG restricts all traffic
  (ctx.sgs||[]).forEach(sg=>{if(sg.GroupName==='default'){
    const hasIngress=(sg.IpPermissions||[]).length>0;const hasEgress=(sg.IpPermissionsEgress||[]).length>0;
    if(hasIngress||hasEgress)f.push({severity:'MEDIUM',control:'CIS 5.4',framework:'CIS',resource:sg.GroupId,resourceName:'default',message:`Default SG in VPC ${sg.VpcId} has ${hasIngress?'ingress':''}${hasIngress&&hasEgress?' and ':''}${hasEgress?'egress':''} rules`,remediation:'Remove all rules from default SGs; use custom SGs instead'});
  }});
  // CIS 5.1: NACLs allow ingress from 0.0.0.0/0 to admin ports
  (ctx.nacls||[]).forEach(nacl=>{(nacl.Entries||[]).forEach(e=>{
    if(!e.Egress&&e.RuleAction==='allow'&&(e.CidrBlock==='0.0.0.0/0'||e.Ipv6CidrBlock==='::/0')){
      if(_naclCoversPort(e,22))f.push({severity:'HIGH',control:'CIS 5.1',framework:'CIS',resource:nacl.NetworkAclId,resourceName:gn(nacl,nacl.NetworkAclId),message:'NACL allows SSH (22) from 0.0.0.0/0',remediation:'Restrict NACL ingress to specific source CIDRs'});
      if(_naclCoversPort(e,3389))f.push({severity:'HIGH',control:'CIS 5.1',framework:'CIS',resource:nacl.NetworkAclId,resourceName:gn(nacl,nacl.NetworkAclId),message:'NACL allows RDP (3389) from 0.0.0.0/0',remediation:'Restrict NACL ingress to specific source CIDRs'});
    }
  })});
  // CIS 5.5: Peering route tables least-access
  (ctx.rts||[]).forEach(rt=>{(rt.Routes||[]).forEach(r=>{
    if(r.VpcPeeringConnectionId&&r.DestinationCidrBlock==='0.0.0.0/0')f.push({severity:'MEDIUM',control:'CIS 5.5',framework:'CIS',resource:rt.RouteTableId,resourceName:gn(rt,rt.RouteTableId),message:'Peering route has overly broad 0.0.0.0/0 destination',remediation:'Use specific CIDR ranges for peering routes'});
  })});
  // NET-1: Private subnets with IGW routes
  const pubSubIds=ctx.pubSubs||new Set();
  (ctx.subnets||[]).forEach(sub=>{
    if(pubSubIds.has&&pubSubIds.has(sub.SubnetId))return;
    const rt=ctx.subRT&&ctx.subRT[sub.SubnetId];if(!rt)return;
    const hasIgw=(rt.Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('igw-')&&r.State==='active');
    if(hasIgw)f.push({severity:'MEDIUM',control:'NET-1',framework:'CIS',resource:sub.SubnetId,resourceName:gn(sub,sub.SubnetId),message:'Private subnet has direct IGW route',remediation:'Remove IGW route from private subnet route table'});
  });
  // NET-2: SG allows all protocols from 0.0.0.0/0
  (ctx.sgs||[]).forEach(sg=>{(sg.IpPermissions||[]).forEach(p=>{
    if(p.IpProtocol==='-1'&&_hasOpenCidr(p))f.push({severity:'CRITICAL',control:'NET-2',framework:'CIS',resource:sg.GroupId,resourceName:sg.GroupName||'',message:'SG allows ALL traffic from 0.0.0.0/0',remediation:'Restrict to specific ports and source CIDRs'});
  })});
  // CKV_AWS_79: EC2 IMDSv2 not enforced
  (ctx.instances||[]).forEach(inst=>{
    const mo=inst.MetadataOptions||{};
    if(mo.HttpTokens!=='required')f.push({severity:'HIGH',control:'CKV_AWS_79',framework:'CIS',resource:inst.InstanceId,resourceName:gn(inst,inst.InstanceId),message:'EC2 instance not enforcing IMDSv2 (HttpTokens != required)',remediation:'Set MetadataOptions.HttpTokens to "required" to enforce IMDSv2'});
  });
  // CKV_AWS_126: VPC flow logs not enabled (standalone CKV check)
  // Note: FlowLogs field requires enrichment (describe-flow-logs); only flag if data is available
  if((ctx.vpcs||[]).some(v=>v.FlowLogs!==undefined)){
    (ctx.vpcs||[]).forEach(vpc=>{
      if(!vpc.FlowLogs||vpc.FlowLogs.length===0)f.push({severity:'MEDIUM',control:'CKV_AWS_126',framework:'CIS',resource:vpc.VpcId,resourceName:gn(vpc,vpc.VpcId),message:'VPC does not have flow logs enabled',remediation:'Enable VPC Flow Logs to CloudWatch or S3'});
    });
  }
  // CKV_AWS_21: S3 versioning not enabled
  // Note: Versioning field requires per-bucket get-bucket-versioning call
  if((ctx.s3bk||[]).some(b=>b.Versioning!==undefined)){
    (ctx.s3bk||[]).forEach(bk=>{
      if(!bk.Versioning||bk.Versioning.Status!=='Enabled')f.push({severity:'MEDIUM',control:'CKV_AWS_21',framework:'CIS',resource:bk.Name,resourceName:bk.Name,message:'S3 bucket versioning not enabled',remediation:'Enable versioning for data protection and recovery'});
    });
  }
  // CKV_AWS_18: S3 access logging not configured
  // Note: LoggingConfiguration requires per-bucket get-bucket-logging call
  if((ctx.s3bk||[]).some(b=>b.LoggingConfiguration!==undefined||b.LoggingEnabled!==undefined)){
    (ctx.s3bk||[]).forEach(bk=>{
      if(!bk.LoggingConfiguration&&!bk.LoggingEnabled)f.push({severity:'LOW',control:'CKV_AWS_18',framework:'CIS',resource:bk.Name,resourceName:bk.Name,message:'S3 bucket access logging not configured',remediation:'Enable server access logging to an audit bucket'});
    });
  }
  // CKV_AWS_26: RDS backup retention < 7 days
  (ctx.rdsInstances||[]).forEach(db=>{
    if((db.BackupRetentionPeriod||0)<7)f.push({severity:'MEDIUM',control:'CKV_AWS_26',framework:'CIS',resource:db.DBInstanceIdentifier,resourceName:db.DBInstanceIdentifier,message:'RDS backup retention is '+(db.BackupRetentionPeriod||0)+' days (should be >=7)',remediation:'Set BackupRetentionPeriod to at least 7 days'});
  });
  // CKV_AWS_338: CloudWatch log group retention
  // CKV_AWS_45: Lambda environment variables not encrypted with KMS
  (ctx.lambdaFns||[]).forEach(fn=>{
    if(fn.Environment&&fn.Environment.Variables&&Object.keys(fn.Environment.Variables).length>0&&!fn.KMSKeyArn)
      f.push({severity:'LOW',control:'CKV_AWS_45',framework:'CIS',resource:fn.FunctionName,resourceName:fn.FunctionName,message:'Lambda has environment variables without KMS encryption',remediation:'Set KMSKeyArn to encrypt environment variables at rest'});
  });
  // CKV_AWS_50: Lambda X-Ray tracing not enabled
  (ctx.lambdaFns||[]).forEach(fn=>{
    if(!fn.TracingConfig||fn.TracingConfig.Mode!=='Active')
      f.push({severity:'LOW',control:'CKV_AWS_50',framework:'CIS',resource:fn.FunctionName,resourceName:fn.FunctionName,message:'Lambda X-Ray tracing not active',remediation:'Enable active tracing for distributed tracing and debugging'});
  });
  return f;
}
function runWAFChecks(ctx){
  const f=[];
  const acls=ctx.wafAcls||[];
  // WAF-1: Empty WebACL
  acls.forEach(acl=>{if(!(acl.Rules||[]).length)f.push({severity:'HIGH',control:'WAF-1',framework:'WAF',resource:acl.Id||acl.WebACLId||'',resourceName:acl.Name||'',message:'WebACL has zero rules',remediation:'Add rate-limiting and IP-filtering rules to WebACL'})});
  // WAF-2: No rate-limiting rule
  acls.forEach(acl=>{const hasRate=(acl.Rules||[]).some(r=>(r.Statement&&r.Statement.RateBasedStatement)||(r.Type==='RATE_BASED'));
    if(!hasRate&&(acl.Rules||[]).length>0)f.push({severity:'MEDIUM',control:'WAF-2',framework:'WAF',resource:acl.Id||acl.WebACLId||'',resourceName:acl.Name||'',message:'WebACL has no rate-limiting rule',remediation:'Add a rate-based rule to prevent DDoS/brute-force'})});
  // WAF-3: ALB not protected by WAF
  const protectedArns=new Set();acls.forEach(acl=>{(acl.ResourceArns||[]).forEach(a=>protectedArns.add(a))});
  (ctx.albs||[]).forEach(alb=>{if(alb.LoadBalancerArn&&!protectedArns.has(alb.LoadBalancerArn))f.push({severity:'MEDIUM',control:'WAF-3',framework:'WAF',resource:alb.LoadBalancerArn,resourceName:alb.LoadBalancerName||'',message:'ALB not associated with any WebACL',remediation:'Associate this ALB with a WAF WebACL'})});
  // WAF-4: Default action is ALLOW
  acls.forEach(acl=>{const da=acl.DefaultAction||{};if(da.Allow||da.Type==='ALLOW')f.push({severity:'MEDIUM',control:'WAF-4',framework:'WAF',resource:acl.Id||acl.WebACLId||'',resourceName:acl.Name||'',message:'WebACL default action is ALLOW (should be BLOCK)',remediation:'Set default action to BLOCK and add explicit ALLOW rules'})});
  return f;
}
function runArchChecks(ctx){
  const f=[];const gn2=(o,id)=>{const t=(o.Tags||o.tags||[]);const n=t.find(t=>t.Key==='Name');return n?n.Value:id};
  const pubSubs=ctx.pubSubs||new Set();const subRT=ctx.subRT||{};
  // ARCH-N1: Public subnet with no IGW route
  (ctx.subnets||[]).forEach(sub=>{
    if(!sub.MapPublicIpOnLaunch)return;
    const rt=subRT[sub.SubnetId];if(!rt)return;
    const hasIgw=(rt.Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('igw-')&&r.State!=='blackhole');
    if(!hasIgw)f.push({severity:'HIGH',control:'ARCH-N1',framework:'ARCH',resource:sub.SubnetId,resourceName:gn2(sub,sub.SubnetId),message:'Subnet has MapPublicIpOnLaunch=true but no IGW route',remediation:'Add an IGW route to the route table or disable MapPublicIpOnLaunch'});
  });
  // ARCH-N2: Private subnet resources with no NAT route
  (ctx.subnets||[]).forEach(sub=>{
    if(pubSubs.has(sub.SubnetId))return;
    const rt=subRT[sub.SubnetId];if(!rt)return;
    const hasNat=(rt.Routes||[]).some(r=>r.NatGatewayId);
    const hasVpce=(rt.Routes||[]).some(r=>r.GatewayId&&r.GatewayId.startsWith('vpce-'));
    const cnt=((ctx.instBySub||{})[sub.SubnetId]||[]).length+((ctx.lambdaBySub||{})[sub.SubnetId]||[]).length+((ctx.ecsBySub||{})[sub.SubnetId]||[]).length;
    if(cnt>0&&!hasNat&&!hasVpce)f.push({severity:'HIGH',control:'ARCH-N2',framework:'ARCH',resource:sub.SubnetId,resourceName:gn2(sub,sub.SubnetId),message:'Private subnet has '+cnt+' resources but no NAT gateway or VPC endpoint route',remediation:'Add a NAT gateway in a public subnet and route 0.0.0.0/0 through it'});
  });
  // ARCH-N3: VPC with all subnets in single AZ
  const subByVpc={};(ctx.subnets||[]).forEach(s=>{(subByVpc[s.VpcId]=subByVpc[s.VpcId]||[]).push(s)});
  Object.entries(subByVpc).forEach(([vid,subs])=>{
    const azs=new Set(subs.map(s=>s.AvailabilityZone).filter(Boolean));
    if(subs.length>1&&azs.size===1){const vpc=(ctx.vpcs||[]).find(v=>v.VpcId===vid);
      f.push({severity:'HIGH',control:'ARCH-N3',framework:'ARCH',resource:vid,resourceName:gn2(vpc||{},vid),message:'All '+subs.length+' subnets in single AZ ('+[...azs][0]+') — no HA',remediation:'Create subnets across at least 2 AZs for fault tolerance'});}
  });
  // ARCH-N5: Overly broad SG egress
  (ctx.sgs||[]).forEach(sg=>{if(sg.GroupName==='default')return;
    (sg.IpPermissionsEgress||[]).forEach(p=>{
      if(p.IpProtocol==='-1'&&_hasOpenCidr(p)){const inst=(ctx.instances||[]).filter(i=>(i.SecurityGroups||[]).some(g=>g.GroupId===sg.GroupId));
        if(inst.length>0)f.push({severity:'LOW',control:'ARCH-N5',framework:'ARCH',resource:sg.GroupId,resourceName:sg.GroupName||'',message:'SG has unrestricted egress attached to '+inst.length+' instance(s)',remediation:'Restrict egress to required ports/CIDRs only'});}
    });
  });
  // ARCH-C1: EC2 in public subnet with wide-open SG
  (ctx.instances||[]).forEach(inst=>{if(!pubSubs.has(inst.SubnetId))return;
    const sgIds=(inst.SecurityGroups||[]).map(g=>g.GroupId);
    const hasBroad=sgIds.some(gid=>{const sg=(ctx.sgs||[]).find(s=>s.GroupId===gid);return sg&&(sg.IpPermissions||[]).some(p=>p.IpProtocol==='-1'&&_hasOpenCidr(p))});
    if(hasBroad)f.push({severity:'CRITICAL',control:'ARCH-C1',framework:'ARCH',resource:inst.InstanceId,resourceName:gn2(inst,inst.InstanceId),message:'EC2 in public subnet with SG allowing all traffic from 0.0.0.0/0',remediation:'Restrict to specific ports; use ALB/NLB as entry point'});
  });
  // ARCH-C2: EC2 without EBS encryption
  (ctx.instances||[]).forEach(inst=>{const vols=(inst.BlockDeviceMappings||[]).map(b=>b.Ebs?.VolumeId).filter(Boolean);
    const unenc=vols.filter(vid=>{const v=(ctx.volumes||[]).find(x=>x.VolumeId===vid);return v&&!v.Encrypted});
    if(unenc.length>0)f.push({severity:'MEDIUM',control:'ARCH-C2',framework:'ARCH',resource:inst.InstanceId,resourceName:gn2(inst,inst.InstanceId),message:unenc.length+' unencrypted EBS volume(s)',remediation:'Enable EBS encryption by default in account settings'});
  });
  // ARCH-C3: Lambda in VPC single AZ
  (ctx.lambdaFns||[]).forEach(fn=>{const vc=fn.VpcConfig;if(!vc||!vc.SubnetIds||!vc.SubnetIds.length)return;
    const azs=new Set(vc.SubnetIds.map(sid=>{const s=(ctx.subnets||[]).find(x=>x.SubnetId===sid);return s?s.AvailabilityZone:null}).filter(Boolean));
    if(azs.size<2)f.push({severity:'MEDIUM',control:'ARCH-C3',framework:'ARCH',resource:fn.FunctionName,resourceName:fn.FunctionName,message:'Lambda in single AZ only',remediation:'Configure Lambda VPC subnets across at least 2 AZs'});
  });
  // ARCH-D1: RDS publicly accessible
  (ctx.rdsInstances||[]).forEach(db=>{if(db.PubliclyAccessible)f.push({severity:'CRITICAL',control:'ARCH-D1',framework:'ARCH',resource:db.DBInstanceIdentifier,resourceName:db.DBInstanceIdentifier,message:'RDS instance is publicly accessible',remediation:'Set PubliclyAccessible=false; access via VPN/bastion'})});
  // ARCH-D2: RDS without Multi-AZ
  (ctx.rdsInstances||[]).forEach(db=>{if(db.MultiAZ)return;if((db.DBInstanceClass||'').includes('.micro'))return;
    f.push({severity:'MEDIUM',control:'ARCH-D2',framework:'ARCH',resource:db.DBInstanceIdentifier,resourceName:db.DBInstanceIdentifier,message:'RDS not configured for Multi-AZ',remediation:'Enable Multi-AZ for production databases'})});
  // ARCH-D3: RDS without encryption
  (ctx.rdsInstances||[]).forEach(db=>{if(!db.StorageEncrypted)f.push({severity:'HIGH',control:'ARCH-D3',framework:'ARCH',resource:db.DBInstanceIdentifier,resourceName:db.DBInstanceIdentifier,message:'RDS storage not encrypted',remediation:'Enable encryption at rest'})});
  // ARCH-D4: ElastiCache single node
  (ctx.ecacheClusters||[]).forEach(ec=>{if(ec.NumCacheNodes>1||(ec.CacheNodeType||'').includes('.micro'))return;
    f.push({severity:'MEDIUM',control:'ARCH-D4',framework:'ARCH',resource:ec.CacheClusterId,resourceName:ec.CacheClusterId,message:'ElastiCache cluster has only 1 node',remediation:'Add read replicas or enable cluster mode'})});
  // ARCH-D5: Redshift without encryption
  (ctx.redshiftClusters||[]).forEach(rs=>{if(!rs.Encrypted)f.push({severity:'HIGH',control:'ARCH-D5',framework:'ARCH',resource:rs.ClusterIdentifier,resourceName:rs.ClusterIdentifier,message:'Redshift cluster not encrypted at rest',remediation:'Enable encryption (requires snapshot migration)'})});
  // ARCH-S1: S3 without encryption
  (ctx.s3bk||[]).forEach(bk=>{if(!bk.ServerSideEncryption&&!bk.BucketEncryption)f.push({severity:'MEDIUM',control:'ARCH-S1',framework:'ARCH',resource:bk.Name,resourceName:bk.Name,message:'S3 bucket may lack default encryption',remediation:'Enable default encryption (SSE-S3 or SSE-KMS)'})});
  // ARCH-S2: EBS volumes without snapshots
  (ctx.volumes||[]).forEach(vol=>{const snaps=(ctx.snapByVol||{})[vol.VolumeId]||[];
    if(snaps.length>0||vol.State!=='in-use')return;
    f.push({severity:'LOW',control:'ARCH-S2',framework:'ARCH',resource:vol.VolumeId,resourceName:gn2(vol,vol.VolumeId),message:'In-use EBS volume has no snapshots',remediation:'Create regular snapshots using AWS Backup or DLM'})});
  // ARCH-E1: Internet-facing ALB without CloudFront
  const cfOrigins=new Set();(ctx.cfDistributions||[]).forEach(d=>{(d.Origins?.Items||[]).forEach(o=>{cfOrigins.add(o.DomainName)})});
  (ctx.albs||[]).forEach(alb=>{if(alb.Scheme!=='internet-facing'||cfOrigins.has(alb.DNSName))return;
    f.push({severity:'LOW',control:'ARCH-E1',framework:'ARCH',resource:alb.LoadBalancerName,resourceName:alb.LoadBalancerName,message:'Internet-facing ALB without CloudFront',remediation:'Place CloudFront in front for caching and DDoS protection'})});
  // ARCH-G1: NAT Gateway in single AZ
  const natByVpc={};(ctx.nats||[]).forEach(n=>{(natByVpc[n.VpcId]=natByVpc[n.VpcId]||[]).push(n)});
  Object.entries(natByVpc).forEach(([vid,nats])=>{
    const azs=new Set(nats.map(n=>{const s=(ctx.subnets||[]).find(x=>x.SubnetId===n.SubnetId);return s?s.AvailabilityZone:null}).filter(Boolean));
    if(nats.length>=1&&azs.size===1&&(subByVpc[vid]||[]).length>2){const vpc=(ctx.vpcs||[]).find(v=>v.VpcId===vid);
      f.push({severity:'MEDIUM',control:'ARCH-G1',framework:'ARCH',resource:vid,resourceName:gn2(vpc||{},vid),message:'NAT Gateway(s) only in 1 AZ',remediation:'Deploy NAT Gateways in each AZ for resilience'});}
  });
  // ARCH-G2: Missing S3 VPC Endpoint
  const vpcHasS3Vpce={};(ctx.vpces||[]).forEach(e=>{if((e.ServiceName||'').includes('.s3'))vpcHasS3Vpce[e.VpcId]=true});
  (ctx.vpcs||[]).forEach(vpc=>{
    const hasFns=(ctx.lambdaFns||[]).some(fn=>fn.VpcConfig&&fn.VpcConfig.VpcId===vpc.VpcId);
    const hasInst=(ctx.instances||[]).some(i=>i.VpcId===vpc.VpcId);
    if((hasFns||hasInst)&&!vpcHasS3Vpce[vpc.VpcId])f.push({severity:'LOW',control:'ARCH-G2',framework:'ARCH',resource:vpc.VpcId,resourceName:gn2(vpc,vpc.VpcId),message:'VPC has compute but no S3 Gateway Endpoint (traffic routes through NAT)',remediation:'Create an S3 Gateway Endpoint (free) to reduce NAT costs'});
  });
  // ARCH-X1: VPC peering without return route
  (ctx.peerings||[]).forEach(p=>{if(p.Status?.Code!=='active')return;
    [p.RequesterVpcInfo?.VpcId,p.AccepterVpcInfo?.VpcId].forEach(vid=>{if(!vid)return;
      const hasRoute=(ctx.rts||[]).some(rt=>rt.VpcId===vid&&(rt.Routes||[]).some(r=>r.VpcPeeringConnectionId===p.VpcPeeringConnectionId));
      if(!hasRoute)f.push({severity:'HIGH',control:'ARCH-X1',framework:'ARCH',resource:p.VpcPeeringConnectionId,resourceName:p.VpcPeeringConnectionId,message:'VPC '+vid+' has no route for peering '+p.VpcPeeringConnectionId,remediation:'Add routes in both VPCs for the peering connection'});
    });
  });
  // ARCH-C4: Lambda using deprecated/EOL runtime
  (ctx.lambdaFns||[]).forEach(fn=>{if(fn.Runtime&&_EOL_RUNTIMES.has(fn.Runtime))
    f.push({severity:'HIGH',control:'ARCH-C4',framework:'ARCH',resource:fn.FunctionName,resourceName:fn.FunctionName,message:'Lambda uses deprecated runtime: '+fn.Runtime,remediation:'Upgrade to a supported runtime version to receive security patches'})});
  // ARCH-C5: Lambda with excessive timeout and no DLQ
  (ctx.lambdaFns||[]).forEach(fn=>{if((fn.Timeout||3)>300&&!fn.DeadLetterConfig?.TargetArn)
    f.push({severity:'LOW',control:'ARCH-C5',framework:'ARCH',resource:fn.FunctionName,resourceName:fn.FunctionName,message:'Lambda timeout >5min with no dead letter queue',remediation:'Add an SQS or SNS DLQ for failed invocations'})});
  // ARCH-D6: ElastiCache without encryption at rest
  (ctx.ecacheClusters||[]).forEach(ec=>{if(ec.AtRestEncryptionEnabled===false||(!ec.AtRestEncryptionEnabled&&ec.Engine==='redis'))
    f.push({severity:'MEDIUM',control:'ARCH-D6',framework:'ARCH',resource:ec.CacheClusterId,resourceName:ec.CacheClusterId,message:'ElastiCache cluster without encryption at rest',remediation:'Enable at-rest encryption (requires creating a new cluster)'})});
  // ARCH-D7: Redshift publicly accessible
  (ctx.redshiftClusters||[]).forEach(rs=>{if(rs.PubliclyAccessible)
    f.push({severity:'CRITICAL',control:'ARCH-D7',framework:'ARCH',resource:rs.ClusterIdentifier,resourceName:rs.ClusterIdentifier,message:'Redshift cluster is publicly accessible',remediation:'Disable public access; connect via VPN or bastion in private subnet'})});
  // ARCH-E2: CloudFront allowing HTTP (not redirect/https-only)
  (ctx.cfDistributions||[]).forEach(d=>{const vpp=d.DefaultCacheBehavior?.ViewerProtocolPolicy;
    if(vpp==='allow-all')f.push({severity:'MEDIUM',control:'ARCH-E2',framework:'ARCH',resource:d.Id||d.ARN||'',resourceName:d.DomainName||d.Id||'',message:'CloudFront allows HTTP connections',remediation:'Set ViewerProtocolPolicy to redirect-to-https or https-only'})});
  // ARCH-C6: ECS service with desiredCount=0 or mismatch
  (ctx.ecsServices||[]).forEach(svc=>{if(svc.desiredCount>0&&svc.runningCount===0)
    f.push({severity:'HIGH',control:'ARCH-C6',framework:'ARCH',resource:svc.serviceName,resourceName:svc.serviceName,message:'ECS service has 0 running tasks (desired: '+svc.desiredCount+')',remediation:'Check task definition, IAM role, and container health checks'})});
  return f;
}
function runSOC2Checks(ctx){
  const f=[];const gn2=(o,id)=>{const t=(o.Tags||o.tags||[]);const n=t.find(t=>t.Key==='Name');return n?n.Value:id};
  const pubSubs=ctx.pubSubs||new Set();
  // CC6.1 – Logical Access: SGs with 0.0.0.0/0 on sensitive ports (SSH/RDP/DB)
  const sensPorts=[22,3389,3306,5432,1433,1521,6379,27017];
  (ctx.sgs||[]).forEach(sg=>{(sg.IpPermissions||[]).forEach(p=>{
    sensPorts.forEach(port=>{if(_hasPort(p,port)&&_hasOpenCidr(p))
      f.push({severity:'HIGH',control:'SOC2-CC6.1',framework:'SOC2',resource:sg.GroupId,resourceName:sg.GroupName||'',message:'SG allows port '+port+' from 0.0.0.0/0 — logical access control gap',remediation:'Restrict to known CIDR ranges; use bastion hosts or SSM Session Manager'})});
  })});
  // CC6.3 – Role-Based Access: default SG with rules (should have no inbound)
  (ctx.sgs||[]).forEach(sg=>{if(sg.GroupName!=='default')return;
    if((sg.IpPermissions||[]).length>0)f.push({severity:'MEDIUM',control:'SOC2-CC6.3',framework:'SOC2',resource:sg.GroupId,resourceName:'default',message:'Default SG has inbound rules — violates least-privilege',remediation:'Remove all inbound rules from default SG; create explicit SGs per role'});
  });
  // CC6.6 – Network boundaries: VPC without NACL customization
  (ctx.vpcs||[]).forEach(vpc=>{
    const nacls=(ctx.nacls||[]).filter(n=>n.VpcId===vpc.VpcId&&!n.IsDefault);
    if(nacls.length===0)f.push({severity:'MEDIUM',control:'SOC2-CC6.6',framework:'SOC2',resource:vpc.VpcId,resourceName:gn2(vpc,vpc.VpcId),message:'VPC uses only default NACLs — no network boundary segmentation',remediation:'Create custom NACLs for each subnet tier (public/private/data)'});
  });
  // CC6.7 – Data in transit: ALB without HTTPS listener
  (ctx.albs||[]).forEach(alb=>{
    const hasHttps=(alb.Listeners||[]).some(l=>l.Protocol==='HTTPS');
    if(alb.Scheme==='internet-facing'&&!hasHttps)f.push({severity:'HIGH',control:'SOC2-CC6.7',framework:'SOC2',resource:alb.LoadBalancerName,resourceName:alb.LoadBalancerName,message:'Internet-facing ALB has no HTTPS listener — data transmitted unencrypted',remediation:'Add HTTPS listener with TLS 1.2+ certificate via ACM'});
  });
  // CC6.8 – Malicious software: EC2 in public subnet without SG restricting outbound
  (ctx.instances||[]).forEach(inst=>{if(!pubSubs.has(inst.SubnetId))return;
    const sgIds=(inst.SecurityGroups||[]).map(g=>g.GroupId);
    const anyOpen=sgIds.some(gid=>{const sg=(ctx.sgs||[]).find(s=>s.GroupId===gid);return sg&&(sg.IpPermissionsEgress||[]).some(p=>p.IpProtocol==='-1'&&_hasOpenCidr(p))});
    if(anyOpen)f.push({severity:'MEDIUM',control:'SOC2-CC6.8',framework:'SOC2',resource:inst.InstanceId,resourceName:gn2(inst,inst.InstanceId),message:'Public EC2 with unrestricted egress — C2 callback risk',remediation:'Restrict outbound to required ports; use VPC endpoints for AWS services'});
  });
  // CC7.2 – Monitoring: VPC without flow logs indication
  if((ctx.vpcs||[]).some(v=>v.FlowLogs!==undefined)){(ctx.vpcs||[]).forEach(vpc=>{
    if(!vpc.FlowLogs||vpc.FlowLogs.length===0)f.push({severity:'HIGH',control:'SOC2-CC7.2',framework:'SOC2',resource:vpc.VpcId,resourceName:gn2(vpc,vpc.VpcId),message:'VPC has no flow logs enabled — insufficient monitoring',remediation:'Enable VPC Flow Logs to CloudWatch or S3 for audit trail'});
  });}
  // CC8.1 – Change mgmt: resources without Name tags
  let untagged=0;
  (ctx.instances||[]).forEach(inst=>{if(!gn2(inst,null))untagged++});
  (ctx.rdsInstances||[]).forEach(db=>{if(!(db.TagList||[]).some(t=>t.Key==='Name'))untagged++});
  if(untagged>0)f.push({severity:'LOW',control:'SOC2-CC8.1',framework:'SOC2',resource:'Multiple',resourceName:untagged+' resources',message:untagged+' resource(s) missing Name tags — change tracking gap',remediation:'Apply consistent tagging policy (Name, Environment, Owner, CostCenter)'});
  // A1.2 – Availability: single-AZ databases
  (ctx.rdsInstances||[]).forEach(db=>{if(!db.MultiAZ&&!(db.DBInstanceClass||'').includes('.micro'))
    f.push({severity:'HIGH',control:'SOC2-A1.2',framework:'SOC2',resource:db.DBInstanceIdentifier,resourceName:db.DBInstanceIdentifier,message:'RDS not Multi-AZ — does not meet availability commitment',remediation:'Enable Multi-AZ for production databases'})});
  // A1.3 – Recovery: EBS volumes without snapshots
  (ctx.volumes||[]).forEach(vol=>{const snaps=(ctx.snapByVol||{})[vol.VolumeId]||[];
    if(snaps.length===0&&vol.State==='in-use')f.push({severity:'MEDIUM',control:'SOC2-A1.3',framework:'SOC2',resource:vol.VolumeId,resourceName:gn2(vol,vol.VolumeId),message:'In-use EBS volume with no backup snapshots — recovery gap',remediation:'Configure AWS Backup or DLM lifecycle policy'})});
  // C1.1 – Confidentiality: S3 without encryption
  (ctx.s3bk||[]).forEach(bk=>{if(!bk.ServerSideEncryption&&!bk.BucketEncryption)
    f.push({severity:'HIGH',control:'SOC2-C1.1',framework:'SOC2',resource:bk.Name,resourceName:bk.Name,message:'S3 bucket without default encryption — confidentiality risk',remediation:'Enable SSE-S3 or SSE-KMS default encryption'})});
  // C1.2 – Data at rest: unencrypted EBS
  (ctx.volumes||[]).forEach(vol=>{if(!vol.Encrypted&&vol.State==='in-use')
    f.push({severity:'HIGH',control:'SOC2-C1.2',framework:'SOC2',resource:vol.VolumeId,resourceName:gn2(vol,vol.VolumeId),message:'EBS volume not encrypted at rest — data protection gap',remediation:'Enable EBS encryption by default in account settings'})});
  // C1.3 – Confidentiality: ElastiCache without transit encryption
  (ctx.ecacheClusters||[]).forEach(ec=>{if(ec.TransitEncryptionEnabled===false||(ec.Engine==='redis'&&!ec.TransitEncryptionEnabled))
    f.push({severity:'HIGH',control:'SOC2-C1.3',framework:'SOC2',resource:ec.CacheClusterId,resourceName:ec.CacheClusterId,message:'ElastiCache without in-transit encryption — data exposure risk',remediation:'Enable transit encryption (requires new cluster for existing Redis)'})});
  // CC7.3 – Monitoring: CloudFront permissive protocol policy
  (ctx.cfDistributions||[]).forEach(d=>{const vpp=d.DefaultCacheBehavior?.ViewerProtocolPolicy;
    if(vpp==='allow-all')f.push({severity:'MEDIUM',control:'SOC2-CC7.3',framework:'SOC2',resource:d.Id||d.ARN||'',resourceName:d.DomainName||d.Id||'',message:'CloudFront allows unencrypted HTTP — monitoring blind spot',remediation:'Set ViewerProtocolPolicy to redirect-to-https'})});
  // A1.4 – Availability: ECS services not meeting desired count
  (ctx.ecsServices||[]).forEach(svc=>{if(svc.desiredCount>0&&svc.runningCount<svc.desiredCount)
    f.push({severity:'HIGH',control:'SOC2-A1.4',framework:'SOC2',resource:svc.serviceName,resourceName:svc.serviceName,message:'ECS service running '+svc.runningCount+'/'+svc.desiredCount+' tasks — availability gap',remediation:'Check task health, resource limits, and container image availability'})});
  // CC6.10 – Runtime security: Lambda deprecated runtimes
  (ctx.lambdaFns||[]).forEach(fn=>{if(fn.Runtime&&_EOL_RUNTIMES.has(fn.Runtime))
    f.push({severity:'HIGH',control:'SOC2-CC6.10',framework:'SOC2',resource:fn.FunctionName,resourceName:fn.FunctionName,message:'Lambda using EOL runtime '+fn.Runtime+' — no security patches',remediation:'Upgrade to supported runtime version'})});
  // PI1.1 – Processing integrity: VPC without custom route table
  (ctx.vpcs||[]).forEach(vpc=>{
    const customRts=(ctx.rts||[]).filter(rt=>rt.VpcId===vpc.VpcId&&!(rt.Associations||[]).some(a=>a.Main));
    if(customRts.length===0&&(ctx.subnets||[]).filter(s=>s.VpcId===vpc.VpcId).length>1)
      f.push({severity:'LOW',control:'SOC2-PI1.1',framework:'SOC2',resource:vpc.VpcId,resourceName:gn2(vpc,vpc.VpcId),message:'VPC uses only main route table for all subnets — processing integrity risk',remediation:'Create custom route tables per subnet tier for explicit routing control'});
  });
  return f;
}
function runPCIDSSChecks(ctx){
  const f=[];const gn2=(o,id)=>{const t=(o.Tags||o.tags||[]);const n=t.find(t=>t.Key==='Name');return n?n.Value:id};
  const pubSubs=ctx.pubSubs||new Set();
  // 1.3.1 – Restrict inbound to CDE: SGs with 0.0.0.0/0 on DB ports
  const dbPorts=[3306,5432,1433,1521,6379,27017,5439];
  (ctx.sgs||[]).forEach(sg=>{(sg.IpPermissions||[]).forEach(p=>{
    dbPorts.forEach(port=>{if(_hasPort(p,port)&&_hasOpenCidr(p))
      f.push({severity:'CRITICAL',control:'PCI-1.3.1',framework:'PCI',resource:sg.GroupId,resourceName:sg.GroupName||'',message:'SG allows DB port '+port+' from 0.0.0.0/0 — CDE exposure',remediation:'Restrict database ports to application-tier SGs only; never expose to 0.0.0.0/0'})});
  })});
  // 1.3.2 – Restrict outbound from CDE: DB instances with unrestricted egress
  (ctx.rdsInstances||[]).forEach(db=>{
    const sgIds=(db.VpcSecurityGroups||[]).map(g=>g.VpcSecurityGroupId);
    const allOpen=sgIds.some(gid=>{const sg=(ctx.sgs||[]).find(s=>s.GroupId===gid);return sg&&(sg.IpPermissionsEgress||[]).some(p=>p.IpProtocol==='-1'&&_hasOpenCidr(p))});
    if(allOpen)f.push({severity:'HIGH',control:'PCI-1.3.2',framework:'PCI',resource:db.DBInstanceIdentifier,resourceName:db.DBInstanceIdentifier,message:'RDS SG has unrestricted outbound — must restrict CDE egress',remediation:'Restrict egress to specific app-tier SGs and required AWS service endpoints'});
  });
  // 1.3.4 – Network segmentation: public subnet resources sharing SG with private
  const pubSgIds=new Set();const privSgIds=new Set();
  (ctx.instances||[]).forEach(inst=>{
    const sgs=(inst.SecurityGroups||[]).map(g=>g.GroupId);
    if(pubSubs.has(inst.SubnetId))sgs.forEach(g=>pubSgIds.add(g));
    else sgs.forEach(g=>privSgIds.add(g));
  });
  pubSgIds.forEach(gid=>{if(privSgIds.has(gid)){
    const sg=(ctx.sgs||[]).find(s=>s.GroupId===gid);
    f.push({severity:'HIGH',control:'PCI-1.3.4',framework:'PCI',resource:gid,resourceName:(sg?sg.GroupName:'')||gid,message:'SG shared between public and private subnets — network segmentation failure',remediation:'Create separate SGs for each network tier; never share across CDE boundary'})}
  });
  // 2.2.1 – Configuration standards: instances with default SG attached
  (ctx.instances||[]).forEach(inst=>{
    const hasDefault=(inst.SecurityGroups||[]).some(g=>{const sg=(ctx.sgs||[]).find(s=>s.GroupId===g.GroupId);return sg&&sg.GroupName==='default'});
    if(hasDefault)f.push({severity:'MEDIUM',control:'PCI-2.2.1',framework:'PCI',resource:inst.InstanceId,resourceName:gn2(inst,inst.InstanceId),message:'EC2 using default SG — non-compliant with configuration standards',remediation:'Replace default SG with purpose-built SG following least privilege'});
  });
  // 3.4.1 – Encryption at rest: unencrypted storage
  (ctx.rdsInstances||[]).forEach(db=>{if(!db.StorageEncrypted)
    f.push({severity:'CRITICAL',control:'PCI-3.4.1',framework:'PCI',resource:db.DBInstanceIdentifier,resourceName:db.DBInstanceIdentifier,message:'RDS storage not encrypted — cardholder data at risk',remediation:'Enable encryption at rest (requires snapshot + restore for existing instances)'})});
  (ctx.volumes||[]).forEach(vol=>{if(!vol.Encrypted&&vol.State==='in-use')
    f.push({severity:'CRITICAL',control:'PCI-3.4.1',framework:'PCI',resource:vol.VolumeId,resourceName:gn2(vol,vol.VolumeId),message:'EBS volume not encrypted — stored data exposure risk',remediation:'Enable EBS encryption by default; migrate existing volumes via snapshot'})});
  (ctx.s3bk||[]).forEach(bk=>{if(!bk.ServerSideEncryption&&!bk.BucketEncryption)
    f.push({severity:'CRITICAL',control:'PCI-3.4.1',framework:'PCI',resource:bk.Name,resourceName:bk.Name,message:'S3 bucket without default encryption — data at rest violation',remediation:'Enable SSE-S3 or SSE-KMS default encryption; add bucket policy to deny unencrypted uploads'})});
  // 3.5.1 – Key management: encrypted resources without KMS (using default keys)
  (ctx.rdsInstances||[]).forEach(db=>{if(db.StorageEncrypted&&db.KmsKeyId&&db.KmsKeyId.includes('aws/rds'))
    f.push({severity:'LOW',control:'PCI-3.5.1',framework:'PCI',resource:db.DBInstanceIdentifier,resourceName:db.DBInstanceIdentifier,message:'RDS using AWS-managed key instead of CMK — limited key control',remediation:'Use customer-managed KMS key for full key rotation and access control'})});
  // 4.2.1 – Encrypt data in transit: ALB without HTTPS
  (ctx.albs||[]).forEach(alb=>{
    const hasHttps=(alb.Listeners||[]).some(l=>l.Protocol==='HTTPS');
    if(alb.Scheme==='internet-facing'&&!hasHttps)f.push({severity:'CRITICAL',control:'PCI-4.2.1',framework:'PCI',resource:alb.LoadBalancerName,resourceName:alb.LoadBalancerName,message:'Internet-facing ALB without HTTPS — data in transit unencrypted',remediation:'Add HTTPS listener with TLS 1.2+ via ACM certificate; redirect HTTP to HTTPS'});
  });
  // 6.4.1 – Web application firewall: internet-facing ALB without WAF
  const albsWithWaf=new Set();(ctx.wafAcls||[]).forEach(acl=>{
    (acl.ResourceArns||[]).forEach(arn=>{const m=arn.match(/loadbalancer\/app\/([^/]+)/);if(m)albsWithWaf.add(m[1])})});
  (ctx.albs||[]).forEach(alb=>{if(alb.Scheme!=='internet-facing')return;
    if(!albsWithWaf.has(alb.LoadBalancerName))f.push({severity:'HIGH',control:'PCI-6.4.1',framework:'PCI',resource:alb.LoadBalancerName,resourceName:alb.LoadBalancerName,message:'Internet-facing ALB without WAF — web app firewall required',remediation:'Associate AWS WAF WebACL with ALB; add OWASP Top 10 managed rule group'});
  });
  // 7.2.1 – Least privilege: SGs with all-traffic rules
  (ctx.sgs||[]).forEach(sg=>{if(sg.GroupName==='default')return;
    (sg.IpPermissions||[]).forEach(p=>{if(p.IpProtocol==='-1'&&_hasOpenCidr(p))
      f.push({severity:'HIGH',control:'PCI-7.2.1',framework:'PCI',resource:sg.GroupId,resourceName:sg.GroupName||'',message:'SG allows all inbound traffic — violates least privilege',remediation:'Replace with specific port/protocol rules matching business need'})});
  });
  // 10.2.1 – Audit logging: VPC without flow logs
  if((ctx.vpcs||[]).some(v=>v.FlowLogs!==undefined)){(ctx.vpcs||[]).forEach(vpc=>{
    if(!vpc.FlowLogs||vpc.FlowLogs.length===0)f.push({severity:'HIGH',control:'PCI-10.2.1',framework:'PCI',resource:vpc.VpcId,resourceName:gn2(vpc,vpc.VpcId),message:'VPC flow logs not enabled — insufficient audit logging',remediation:'Enable VPC Flow Logs with at least 1 year retention for PCI compliance'});
  });}
  // 11.3.1 – Vulnerability management: publicly accessible RDS
  (ctx.rdsInstances||[]).forEach(db=>{if(db.PubliclyAccessible)
    f.push({severity:'CRITICAL',control:'PCI-11.3.1',framework:'PCI',resource:db.DBInstanceIdentifier,resourceName:db.DBInstanceIdentifier,message:'RDS publicly accessible — immediate vulnerability exposure',remediation:'Set PubliclyAccessible=false; access only via private subnet or VPN'})});
  // 12.10.1 – Incident response: no GuardDuty detection (indicated by no config)
  (ctx.vpcs||[]).forEach(vpc=>{
    const instCount=(ctx.instances||[]).filter(i=>i.VpcId===vpc.VpcId).length;
    if(instCount>5&&vpc.FlowLogs!==undefined&&!vpc.FlowLogs)f.push({severity:'MEDIUM',control:'PCI-12.10.1',framework:'PCI',resource:vpc.VpcId,resourceName:gn2(vpc,vpc.VpcId),message:'Large VPC ('+instCount+' instances) without monitoring — incident response gap',remediation:'Enable GuardDuty, CloudTrail, and VPC Flow Logs; create SNS alerts'});
  });
  // PCI-2.3.1 – Encrypt services: ElastiCache without transit encryption
  (ctx.ecacheClusters||[]).forEach(ec=>{if(ec.TransitEncryptionEnabled===false||(ec.Engine==='redis'&&!ec.TransitEncryptionEnabled))
    f.push({severity:'HIGH',control:'PCI-2.3.1',framework:'PCI',resource:ec.CacheClusterId,resourceName:ec.CacheClusterId,message:'ElastiCache without in-transit encryption — data exposed in network',remediation:'Enable transit encryption; use TLS for Redis connections'})});
  // PCI-3.4.1 – ElastiCache without at-rest encryption
  (ctx.ecacheClusters||[]).forEach(ec=>{if(ec.AtRestEncryptionEnabled===false||(ec.Engine==='redis'&&!ec.AtRestEncryptionEnabled))
    f.push({severity:'HIGH',control:'PCI-3.4.1',framework:'PCI',resource:ec.CacheClusterId,resourceName:ec.CacheClusterId,message:'ElastiCache without at-rest encryption — cached data at risk',remediation:'Enable at-rest encryption (requires new cluster)'})});
  // PCI-6.3.1 – Patch management: Lambda deprecated runtime
  (ctx.lambdaFns||[]).forEach(fn=>{if(fn.Runtime&&_EOL_RUNTIMES.has(fn.Runtime))
    f.push({severity:'CRITICAL',control:'PCI-6.3.1',framework:'PCI',resource:fn.FunctionName,resourceName:fn.FunctionName,message:'Lambda on EOL runtime '+fn.Runtime+' — unpatched vulnerabilities',remediation:'Upgrade to supported runtime for security patch coverage'})});
  // PCI-4.2.1 – CloudFront allowing HTTP
  (ctx.cfDistributions||[]).forEach(d=>{const vpp=d.DefaultCacheBehavior?.ViewerProtocolPolicy;
    if(vpp==='allow-all')f.push({severity:'HIGH',control:'PCI-4.2.1',framework:'PCI',resource:d.Id||d.ARN||'',resourceName:d.DomainName||d.Id||'',message:'CloudFront allows unencrypted HTTP — data in transit violation',remediation:'Set ViewerProtocolPolicy to redirect-to-https or https-only'})});
  // PCI-11.3.1 – Redshift publicly accessible
  (ctx.redshiftClusters||[]).forEach(rs=>{if(rs.PubliclyAccessible)
    f.push({severity:'CRITICAL',control:'PCI-11.3.1',framework:'PCI',resource:rs.ClusterIdentifier,resourceName:rs.ClusterIdentifier,message:'Redshift publicly accessible — data warehouse exposed',remediation:'Disable public access; use private subnet with VPN access only'})});
  return f;
}
function runComplianceChecks(ctx){
  _complianceFindings=[...runCISChecks(ctx),...runWAFChecks(ctx),...runArchChecks(ctx),...runSOC2Checks(ctx),...runPCIDSSChecks(ctx),...runBUDRChecks(ctx)];
  try{const iamRaw=safeParse(gv('in_iam'));
  if(iamRaw){const iamData=parseIAMData(iamRaw);_complianceFindings=_complianceFindings.concat(runIAMChecks(iamData))}}catch(e){console.warn('IAM compliance checks failed:',e)}
  // Annotate all findings with Checkov CKV IDs where mapping exists
  _complianceFindings.forEach(f=>{if(_CKV_MAP[f.control])f.ckv=_CKV_MAP[f.control]});
  return _complianceFindings;
}
