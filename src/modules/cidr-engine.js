// CIDR overlap detection and IP address manipulation
// Handles subnet overlap detection, IP range calculations, and CIDR validation
// Extracted from index.html for modularization

const ipToInt=(ip)=>{if(!ip||typeof ip!=='string')return null;const parts=ip.split('.');if(parts.length!==4)return null;let n=0;for(let i=0;i<4;i++){const o=parseInt(parts[i],10);if(isNaN(o)||o<0||o>255||parts[i]!==String(o))return null;n=(n*256)+o}return n>>>0};
const intToIp=(n)=>{n=n>>>0;return`${(n>>>24)&0xFF}.${(n>>>16)&0xFF}.${(n>>>8)&0xFF}.${n&0xFF}`};
const parseCIDR=(cidr)=>{if(!cidr||typeof cidr!=='string')return null;const parts=cidr.trim().split('/');if(parts.length!==2)return null;const network=ipToInt(parts[0]);const prefix=parseInt(parts[1],10);if(network===null||isNaN(prefix)||prefix<0||prefix>32||parts[1]!==String(prefix))return null;const mask=prefix===0?0:(0xFFFFFFFF<<(32-prefix))>>>0;if((network&mask)!==network)return null;const size=prefix===32?1:(1<<(32-prefix))>>>0;return{network,prefix,mask,size}};
const cidrToString=(network,prefix)=>`${intToIp(network)}/${prefix}`;
const splitCIDR=(cidr)=>{const p=parseCIDR(cidr);if(!p||p.prefix>=32)return null;const np=p.prefix+1;const half=p.size>>>1;return[cidrToString(p.network,np),cidrToString((p.network+half)>>>0,np)]};
const cidrContains=(parent,child)=>{const p=parseCIDR(parent);const c=parseCIDR(child);if(!p||!c||c.prefix<p.prefix)return false;return(c.network&p.mask)===p.network};
const cidrOverlap=(a,b)=>{const pa=parseCIDR(a);const pb=parseCIDR(b);if(!pa||!pb)return false;const bigger=pa.prefix<=pb.prefix?pa:pb;const smaller=pa.prefix<=pb.prefix?pb:pa;return(smaller.network&bigger.mask)===bigger.network};
const ipInCIDR=(ip,cidr)=>{const n=ipToInt(ip);const p=parseCIDR(cidr);if(n===null||!p)return false;return(n&p.mask)===p.network};

// large-scale demo generator -- enterprise AWS environment
function generateDemo(){
  // OPTIMIZED: Seeded PRNG for deterministic demo data (reproducible across reloads)
  let _seed=12345;
  const _random=()=>{_seed=((_seed*1664525+1013904223)|0);return((_seed>>>0)/0x100000000)};
  const AZS=['us-east-1a','us-east-1b','us-east-1c'];
  const INST_TYPES=['t3.micro','t3.small','t3.medium','t3.large','m5.large','m5.xlarge','m5.2xlarge','r5.large','r5.xlarge','r5.2xlarge','c5.large','c5.xlarge'];
  const STATES=['running','running','running','running','running','stopped'];
  const LB_TYPES=['application','network'];
  const SVC_ENDPOINTS=['s3','dynamodb','ssm','ssmmessages','ec2messages','logs','monitoring','kms','secretsmanager','sts','ecr.api','ecr.dkr','execute-api','elasticloadbalancing','autoscaling','sqs','sns','events'];
  let iid=1;function nid(p){return p+'-'+String(iid++).padStart(5,'0')}

  // VPC definitions -- enterprise multi-account pattern
  const vpcDefs=[
    {name:'Production',cidr:'10.0.0.0/16',tiers:['public','private-web','private-app','private-api','private-data','private-cache','private-queue','private-mgmt'],azsUsed:3,instancesPer:[4,6,10,8,6,4,3,2],albCount:5},
    {name:'Staging',cidr:'10.1.0.0/16',tiers:['public','private-web','private-app','private-data','private-cache'],azsUsed:3,instancesPer:[2,4,6,4,2],albCount:3},
    {name:'Development',cidr:'10.2.0.0/16',tiers:['public','private-app','private-data','private-test'],azsUsed:2,instancesPer:[2,6,3,4],albCount:2},
    {name:'QA-Automation',cidr:'10.3.0.0/16',tiers:['public','private-runners','private-selenium','private-data'],azsUsed:2,instancesPer:[1,8,6,2],albCount:1},
    {name:'Shared-Services',cidr:'10.10.0.0/16',tiers:['public','private-tools','private-monitoring','private-cicd','private-artifact','private-vault'],azsUsed:3,instancesPer:[2,5,4,6,3,2],albCount:3},
    {name:'Data-Platform',cidr:'10.20.0.0/16',tiers:['private-ingest','private-streaming','private-processing','private-warehouse','private-analytics','private-ml'],azsUsed:3,instancesPer:[5,4,8,4,3,6],albCount:2},
    {name:'Security',cidr:'10.30.0.0/16',tiers:['public','private-siem','private-scanner','private-forensics','private-logging'],azsUsed:2,instancesPer:[1,4,3,2,4],albCount:1},
    {name:'DR-Recovery',cidr:'10.40.0.0/16',tiers:['public','private-web','private-app','private-data'],azsUsed:2,instancesPer:[2,3,5,3],albCount:2},
    {name:'Edge-Services',cidr:'10.50.0.0/16',tiers:['public','private-proxy','private-waf','private-cdn-origin'],azsUsed:3,instancesPer:[3,4,3,2],albCount:3},
    {name:'Management',cidr:'10.100.0.0/16',tiers:['public','private-bastion','private-logging','private-backup','private-config'],azsUsed:2,instancesPer:[1,3,4,3,2],albCount:1},
    {name:'Sandbox',cidr:'10.200.0.0/16',tiers:['public','private-dev1','private-dev2','private-experiment'],azsUsed:2,instancesPer:[1,5,5,3],albCount:1},
    {name:'PCI-Compliant',cidr:'10.60.0.0/16',tiers:['private-dmz','private-app','private-tokenize','private-vault','private-audit'],azsUsed:3,instancesPer:[3,6,4,2,2],albCount:2},
  ];

  const vpcs=[],subnets=[],rts=[],sgs=[],nacls=[],igwsList=[],natsList=[];
  const ec2Instances=[],albsList=[],vpceList=[];
  const volsList=[],enisList=[],snapsList=[],tgsList=[];
  let subOct=0;

  vpcDefs.forEach((vd,vi)=>{
    const vpcId='vpc-'+vd.name.toLowerCase().replace(/[^a-z0-9]/g,'');
    vpcs.push({VpcId:vpcId,CidrBlock:vd.cidr,State:'available',Tags:[{Key:'Name',Value:vd.name}]});

    // IGW for VPCs with public tiers
    const hasPublic=vd.tiers.some(t=>t.startsWith('public'));
    const igwId=nid('igw');
    if(hasPublic){igwsList.push({InternetGatewayId:igwId,Attachments:[{VpcId:vpcId,State:'available'}],Tags:[{Key:'Name',Value:vd.name+'-igw'}]})}

    // NAT per AZ for non-public tiers
    const natIds=[];
    if(hasPublic){
      for(let a=0;a<Math.min(vd.azsUsed,2);a++){
        const natId=nid('nat');
        natIds.push(natId);
        natsList.push({NatGatewayId:natId,VpcId:vpcId,SubnetId:null,State:'available',Tags:[{Key:'Name',Value:vd.name+'-nat-'+AZS[a].slice(-2)}]});
      }
    }

    // SGs per VPC -- realistic set per tier
    const sgDefs=['web-https','web-http','app-internal','api-gateway','db-mysql','db-postgres','db-redis',
      'monitoring-agents','ssh-bastion','alb-external','alb-internal','efs-mount','elasticsearch','memcached',
      'vpn-access','mgmt-rdp'];
    const sgCount=Math.min(sgDefs.length, vd.tiers.length*2+4);
    for(let si=0;si<sgCount;si++){
      const sgName=sgDefs[si];
      const ports={https:[443,443],http:[80,80],'app-internal':[8080,8099],'api-gateway':[8443,8443],
        'db-mysql':[3306,3306],'db-postgres':[5432,5432],'db-redis':[6379,6379],
        'monitoring-agents':[9090,9100],elasticsearch:[9200,9300],memcached:[11211,11211],
        'mgmt-rdp':[3389,3389],'ssh-bastion':[22,22]}[sgName]||[443,443];
      sgs.push({GroupId:nid('sg'),GroupName:vd.name.toLowerCase()+'-'+sgName,VpcId:vpcId,
        IpPermissions:[{IpProtocol:'tcp',FromPort:ports[0],ToPort:ports[1],IpRanges:[{CidrIp:sgName.includes('ssh')||sgName.includes('rdp')?'10.0.0.0/8':'0.0.0.0/0'}]},
          {IpProtocol:'tcp',FromPort:22,ToPort:22,IpRanges:[{CidrIp:'10.0.0.0/8'}]}],
        IpPermissionsEgress:[{IpProtocol:'-1',IpRanges:[{CidrIp:'0.0.0.0/0'}]}],
        Tags:[{Key:'Name',Value:vd.name.toLowerCase()+'-'+sgName}]
      });
    }

    // subnets and route tables per tier
    vd.tiers.forEach((tier,ti)=>{
      const isPub=tier.startsWith('public');
      const rtId=nid('rtb');
      const routes=[{DestinationCidrBlock:vd.cidr,GatewayId:'local'}];
      if(isPub)routes.push({DestinationCidrBlock:'0.0.0.0/0',GatewayId:igwId});
      // cross-VPC via TGW
      routes.push({DestinationCidrBlock:'10.0.0.0/8',TransitGatewayId:'tgw-enterprise01'});

      // NACL per tier
      const naclId=nid('acl');
      const naclAssocs=[];
      const naclEntries=[
        {RuleNumber:100,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:443,To:443}},
        {RuleNumber:110,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'10.0.0.0/8',PortRange:{From:0,To:65535}},
        {RuleNumber:120,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:1024,To:65535}},
      ];
      if(isPub)naclEntries.push({RuleNumber:130,Protocol:'6',RuleAction:'allow',Egress:false,CidrBlock:'0.0.0.0/0',PortRange:{From:80,To:80}});
      naclEntries.push({RuleNumber:32767,Protocol:'-1',RuleAction:'deny',Egress:false,CidrBlock:'0.0.0.0/0'});

      const assocs=[];
      for(let a=0;a<vd.azsUsed;a++){
        const subId=nid('subnet');
        const oct2=ti*10+subOct;
        subnets.push({SubnetId:subId,VpcId:vpcId,CidrBlock:vd.cidr.replace(/\.0\.0\//,'.'+oct2+'.'+a+'/').replace(/\/16/,'/24'),
          AvailabilityZone:AZS[a],MapPublicIpOnLaunch:isPub,
          Tags:[{Key:'Name',Value:vd.name.toLowerCase()+'-'+tier+'-'+AZS[a].slice(-2)}]});
        if(!isPub && natIds.length){
          const azRtId=nid('rtb');
          rts.push({RouteTableId:azRtId,VpcId:vpcId,
            Routes:[{DestinationCidrBlock:vd.cidr,GatewayId:'local'},
              {DestinationCidrBlock:'0.0.0.0/0',NatGatewayId:natIds[Math.min(a,natIds.length-1)]},
              {DestinationCidrBlock:'10.0.0.0/8',TransitGatewayId:'tgw-enterprise01'}],
            Associations:[{SubnetId:subId,RouteTableAssociationId:nid('rtbassoc')}],
            Tags:[{Key:'Name',Value:vd.name.toLowerCase()+'-'+tier+'-'+AZS[a].slice(-2)+'-rt'}]});
        }else{
          assocs.push({SubnetId:subId,RouteTableAssociationId:nid('rtbassoc')});
        }
        naclAssocs.push({SubnetId:subId});

        // assign NAT subnet
        if(isPub&&a<natIds.length&&natsList[natsList.length-vd.azsUsed+a+Math.min(a,natIds.length-1)])
          natsList.forEach(n=>{if(n.NatGatewayId===natIds[a]&&!n.SubnetId)n.SubnetId=subId});

        // EC2 instances
        const instCount=vd.instancesPer[ti]||0;
        for(let ii=0;ii<instCount;ii++){
          const instId=nid('i');
          const iType=INST_TYPES[Math.floor(_random()*INST_TYPES.length)];
          const st=STATES[Math.floor(_random()*STATES.length)];
          const isBastionSlot=isPub&&ii===0&&a===0&&vd.tiers.length>2;
          const instName=isBastionSlot?vd.name.toLowerCase()+'-bastion':vd.name.toLowerCase()+'-'+tier.replace('private-','')+'-'+String(ii+1).padStart(2,'0');
          const _ec2Entry={InstanceId:instId,SubnetId:subId,InstanceType:isBastionSlot?'t3.micro':iType,
            PrivateIpAddress:'10.'+Math.floor(_random()*255)+'.'+Math.floor(_random()*255)+'.'+Math.floor(_random()*254+1),
            Placement:{AvailabilityZone:AZS[a]},
            State:{Name:isBastionSlot?'running':st,Code:isBastionSlot?16:(st==='running'?16:80)},
            Tags:[{Key:'Name',Value:instName}]};
          if(vi===0)_ec2Entry.IamInstanceProfile={Arn:'arn:aws:iam::111222333444:instance-profile/EC2InstanceRole',Id:'AIPA000000001'};
          ec2Instances.push(_ec2Entry);

          // volume per instance (root)
          const volSize=[50,100,200,500][Math.floor(_random()*4)];
          volsList.push({VolumeId:nid('vol'),Size:volSize,State:'in-use',VolumeType:'gp3',
            AvailabilityZone:AZS[a],Attachments:[{InstanceId:instId,Device:'/dev/sda1',State:'attached'}]});

          // data volume for data/cache/warehouse tiers
          if(tier.includes('data')||tier.includes('cache')||tier.includes('warehouse')||tier.includes('ml')){
            const dataSize=[200,500,1000,2000][Math.floor(_random()*4)];
            volsList.push({VolumeId:nid('vol'),Size:dataSize,State:'in-use',VolumeType:'io2',
              AvailabilityZone:AZS[a],Attachments:[{InstanceId:instId,Device:'/dev/sdf',State:'attached'}]});
          }

          // ENI per instance
          enisList.push({NetworkInterfaceId:nid('eni'),SubnetId:subId,VpcId:vpcId,
            InterfaceType:'interface',Status:'in-use',
            Attachment:{InstanceId:instId,Status:'attached'}});

          // secondary ENI for multi-homed instances
          if(tier.includes('app')||tier.includes('proxy')||tier.includes('web')){
            enisList.push({NetworkInterfaceId:nid('eni'),SubnetId:subId,VpcId:vpcId,
              InterfaceType:'interface',Status:'in-use',
              Attachment:{InstanceId:instId,Status:'attached'}});
          }

          // snapshot for ~40% of volumes
          if(_random()>0.6){snapsList.push({SnapshotId:nid('snap'),VolumeId:volsList[volsList.length-1].VolumeId,
            State:'completed',VolumeSize:volSize,StartTime:'2025-01-15T00:00:00Z'})}
        }
      }

      if(isPub || !natIds.length) rts.push({RouteTableId:rtId,VpcId:vpcId,Routes:routes,Associations:assocs,
        Tags:[{Key:'Name',Value:vd.name.toLowerCase()+'-'+tier+'-rt'}]});
      nacls.push({NetworkAclId:naclId,VpcId:vpcId,Associations:naclAssocs,Entries:naclEntries,
        Tags:[{Key:'Name',Value:vd.name.toLowerCase()+'-'+tier+'-nacl'}]});
      subOct++;
    });

    // ALBs
    for(let lb=0;lb<vd.albCount;lb++){
      const pubSubs=subnets.filter(s=>s.VpcId===vpcId&&(s.Tags[0]?.Value||'').includes('public'));
      const prvSubs=subnets.filter(s=>s.VpcId===vpcId&&!(s.Tags[0]?.Value||'').includes('public'));
      const lbSubs=pubSubs.length?pubSubs:prvSubs;
      const scheme=pubSubs.length&&lb===0?'internet-facing':'internal';
      const lbType=LB_TYPES[lb%2];
      albsList.push({
        LoadBalancerArn:'arn:aws:elasticloadbalancing:us-east-1:111222333444:loadbalancer/'+lbType+'/'+vd.name.toLowerCase()+'-'+lbType.slice(0,3)+'-'+lb+'/abc'+lb,
        LoadBalancerName:vd.name.toLowerCase()+'-'+lbType.slice(0,3)+'-'+lb,
        Type:lbType,Scheme:scheme,VpcId:vpcId,
        AvailabilityZones:lbSubs.slice(0,vd.azsUsed).map(s=>({SubnetId:s.SubnetId,ZoneName:s.AvailabilityZone})),
        State:{Code:'active'},DNSName:vd.name.toLowerCase()+'-'+lb+'.us-east-1.elb.amazonaws.com'
      });
    }

    // VPC endpoints -- prod/shared/data get all 18, others scale down
    const epCount=Math.min(SVC_ENDPOINTS.length, vi<3?18:vi<6?12:6+vi);
    for(let e=0;e<epCount;e++){
      vpceList.push({VpcEndpointId:nid('vpce'),VpcId:vpcId,
        ServiceName:'com.amazonaws.us-east-1.'+SVC_ENDPOINTS[e],
        VpcEndpointType:e<2?'Gateway':'Interface',State:'available',
        SubnetIds:subnets.filter(s=>s.VpcId===vpcId).slice(0,2).map(s=>s.SubnetId),
        Tags:[{Key:'Name',Value:vd.name.toLowerCase()+'-'+SVC_ENDPOINTS[e]}]});
    }

    // Target Groups for each ALB
    // OPTIMIZED: Pre-index VPC subnets to avoid O(albs × instances × subnets) nested scan
    const vpcSubnetIds=new Set(subnets.filter(s=>s.VpcId===vpcId).map(s=>s.SubnetId));
    const vpcInstances=ec2Instances.filter(i=>i.SubnetId&&vpcSubnetIds.has(i.SubnetId));
    albsList.filter(a=>a.VpcId===vpcId).forEach((alb,li)=>{
      const tgInsts=vpcInstances.slice(0,3+li);
      const tgType=alb.Type==='application'?'instance':'ip';
      tgsList.push({
        TargetGroupArn:'arn:aws:elasticloadbalancing:us-east-1:111222333444:targetgroup/'+vd.name.toLowerCase()+'-tg-'+li+'/abc'+li,
        TargetGroupName:vd.name.toLowerCase()+'-tg-'+li,
        Protocol:li%2===0?'HTTPS':'HTTP',Port:li%2===0?443:80,
        VpcId:vpcId,TargetType:tgType,
        HealthCheckProtocol:'HTTP',HealthCheckPort:'traffic-port',HealthCheckPath:'/health',
        HealthCheckIntervalSeconds:30,HealthyThresholdCount:3,UnhealthyThresholdCount:3,
        LoadBalancerArns:[alb.LoadBalancerArn],
        Targets:tgInsts.map(i=>({Id:i.InstanceId,Port:li%2===0?443:80}))
      });
    });
  });

  // peering connections -- hub-spoke from shared-services + key pairs
  const peerings=[];
  const sharedIdx=4; // Shared-Services
  vpcs.forEach((v,i)=>{
    if(i===sharedIdx)return;
    peerings.push({VpcPeeringConnectionId:nid('pcx'),Status:{Code:'active'},
      RequesterVpcInfo:{VpcId:vpcs[sharedIdx].VpcId,CidrBlock:vpcs[sharedIdx].CidrBlock},
      AccepterVpcInfo:{VpcId:v.VpcId,CidrBlock:v.CidrBlock},
      Tags:[{Key:'Name',Value:'shared-to-'+v.Tags[0].Value.toLowerCase()}]});
  });
  // extra direct peerings
  [{r:0,a:1,n:'prod-to-staging'},{r:0,a:7,n:'prod-to-dr'},{r:5,a:11,n:'data-to-pci'},
   {r:6,a:9,n:'security-to-mgmt'},{r:0,a:8,n:'prod-to-edge'}].forEach(p=>{
    if(vpcs[p.r]&&vpcs[p.a])peerings.push({VpcPeeringConnectionId:nid('pcx'),Status:{Code:'active'},
      RequesterVpcInfo:{VpcId:vpcs[p.r].VpcId,CidrBlock:vpcs[p.r].CidrBlock},
      AccepterVpcInfo:{VpcId:vpcs[p.a].VpcId,CidrBlock:vpcs[p.a].CidrBlock},
      Tags:[{Key:'Name',Value:p.n}]});
  });

  // VPN connections
  const vpnConns=[
    {VpnConnectionId:nid('vpn'),State:'available',VpnGatewayId:'vgw-onprem01',CustomerGatewayId:'cgw-dc01',Tags:[{Key:'Name',Value:'datacenter-east-primary'}]},
    {VpnConnectionId:nid('vpn'),State:'available',VpnGatewayId:'vgw-onprem01',CustomerGatewayId:'cgw-dc02',Tags:[{Key:'Name',Value:'datacenter-east-backup'}]},
    {VpnConnectionId:nid('vpn'),State:'available',VpnGatewayId:'vgw-onprem02',CustomerGatewayId:'cgw-dc03',Tags:[{Key:'Name',Value:'datacenter-west-primary'}]},
    {VpnConnectionId:nid('vpn'),State:'available',VpnGatewayId:'vgw-onprem02',CustomerGatewayId:'cgw-dc04',Tags:[{Key:'Name',Value:'datacenter-west-backup'}]},
  ];

  // S3 buckets
  const s3Buckets=[];
  ['prod-assets','prod-logs','prod-backups','prod-media','prod-static','prod-config',
   'staging-deploy','staging-logs','staging-assets',
   'dev-artifacts','dev-sandbox','dev-test-data',
   'shared-terraform-state','shared-ami-store','shared-lambda-layers','shared-container-images',
   'data-lake-raw','data-lake-processed','data-lake-curated','data-lake-archive','data-lake-temp',
   'ml-training-data','ml-models','ml-experiments',
   'audit-logs','config-history','cloudtrail-logs','vpc-flow-logs','dns-query-logs',
   'dr-backup-primary','dr-backup-secondary','dr-config-mirror',
   'pci-audit-trail','pci-transaction-logs','pci-encryption-keys',
   'app-uploads','static-frontend','lambda-packages','cloudformation-templates','codepipeline-artifacts'
  ].forEach(n=>{
    s3Buckets.push({Name:n+'-'+Math.floor(_random()*99999),CreationDate:'2024-'+String(Math.floor(_random()*12)+1).padStart(2,'0')+'-15'});
  });

  // Route53
  const zones=[
    {Id:'/hostedzone/Z001',Name:'example.com.',Config:{PrivateZone:false},ResourceRecordSetCount:187},
    {Id:'/hostedzone/Z002',Name:'internal.example.com.',Config:{PrivateZone:true},ResourceRecordSetCount:342,VPCs:[{VPCId:'vpc-production'},{VPCId:'vpc-dataplatform'},{VPCId:'vpc-management'}]},
    {Id:'/hostedzone/Z003',Name:'staging.example.com.',Config:{PrivateZone:false},ResourceRecordSetCount:64},
    {Id:'/hostedzone/Z004',Name:'api.example.com.',Config:{PrivateZone:false},ResourceRecordSetCount:96},
    {Id:'/hostedzone/Z005',Name:'dev.example.com.',Config:{PrivateZone:false},ResourceRecordSetCount:78},
    {Id:'/hostedzone/Z006',Name:'data.internal.example.com.',Config:{PrivateZone:true},ResourceRecordSetCount:124,VPCs:[{VPCId:'vpc-dataplatform'}]},
    {Id:'/hostedzone/Z007',Name:'pci.example.com.',Config:{PrivateZone:true},ResourceRecordSetCount:45,VPCs:[{VPCId:'vpc-pcicompliant'},{VPCId:'vpc-security'}]},
    {Id:'/hostedzone/Z008',Name:'dr.example.com.',Config:{PrivateZone:false},ResourceRecordSetCount:52},
  ];

  // Route53 Record Sets (sample per zone)
  const r53records=[];
  zones.forEach(z=>{
    const zid=z.Id.replace('/hostedzone/','');
    const base=z.Name;
    r53records.push({HostedZoneId:zid,Name:base,Type:'NS',TTL:172800,ResourceRecords:[{Value:'ns-1.awsdns-01.org.'},{Value:'ns-2.awsdns-02.co.uk.'}]});
    r53records.push({HostedZoneId:zid,Name:base,Type:'SOA',TTL:900,ResourceRecords:[{Value:'ns-1.awsdns-01.org. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400'}]});
    r53records.push({HostedZoneId:zid,Name:'www.'+base,Type:'A',AliasTarget:{DNSName:'dualstack.elb-prod-123456.us-east-1.elb.amazonaws.com.',HostedZoneId:'Z35SXDOTRQ7X7K',EvaluateTargetHealth:true}});
    r53records.push({HostedZoneId:zid,Name:'api.'+base,Type:'CNAME',TTL:300,ResourceRecords:[{Value:'api-gateway.execute-api.us-east-1.amazonaws.com'}]});
    r53records.push({HostedZoneId:zid,Name:'mail.'+base,Type:'MX',TTL:300,ResourceRecords:[{Value:'10 inbound-smtp.us-east-1.amazonaws.com'}]});
    r53records.push({HostedZoneId:zid,Name:'_dmarc.'+base,Type:'TXT',TTL:300,ResourceRecords:[{Value:'"v=DMARC1; p=quarantine; rua=mailto:dmarc@'+base+'"'}]});
  });

  // WAF WebACLs
  const wafAcls=[];
  const internetFacingAlbs=albsList.filter(a=>a.Scheme==='internet-facing');
  if(internetFacingAlbs.length>0){
    wafAcls.push({
      Name:'prod-web-acl',Id:'waf-001',
      ARN:'arn:aws:wafv2:us-east-1:111222333444:regional/webacl/prod-web-acl/abc1',
      Description:'Production WAF - OWASP rules',
      DefaultAction:{Allow:{}},
      Rules:[{Name:'AWSManagedRulesCommonRuleSet',Priority:1},{Name:'AWSManagedRulesSQLiRuleSet',Priority:2},{Name:'RateLimit-1000',Priority:3}],
      ResourceArns:internetFacingAlbs.slice(0,2).map(a=>a.LoadBalancerArn)
    });
  }
  if(internetFacingAlbs.length>2){
    wafAcls.push({
      Name:'staging-web-acl',Id:'waf-002',
      ARN:'arn:aws:wafv2:us-east-1:111222333444:regional/webacl/staging-web-acl/abc2',
      Description:'Staging WAF - basic protection',
      DefaultAction:{Allow:{}},
      Rules:[{Name:'AWSManagedRulesCommonRuleSet',Priority:1}],
      ResourceArns:internetFacingAlbs.slice(2,4).map(a=>a.LoadBalancerArn)
    });
  }
  wafAcls.push({
    Name:'pci-web-acl',Id:'waf-003',
    ARN:'arn:aws:wafv2:us-east-1:111222333444:regional/webacl/pci-web-acl/abc3',
    Description:'PCI DSS compliant WAF',
    DefaultAction:{Block:{}},
    Rules:[{Name:'AWSManagedRulesCommonRuleSet',Priority:1},{Name:'AWSManagedRulesSQLiRuleSet',Priority:2},{Name:'AWSManagedRulesKnownBadInputsRuleSet',Priority:3},{Name:'AWSManagedRulesLinuxRuleSet',Priority:4}],
    ResourceArns:[]
  });

  // RDS instances - placed in private subnets
  const rdsInstances=[];
  const rdsConfigs=[
    {vpc:0,name:'prod-primary-db',engine:'aurora-mysql',cls:'db.r6g.xlarge',multi:true,storage:500},
    {vpc:0,name:'prod-replica-db',engine:'aurora-mysql',cls:'db.r6g.large',multi:false,storage:500},
    {vpc:1,name:'staging-db',engine:'postgres',cls:'db.t3.medium',multi:false,storage:100},
    {vpc:3,name:'data-warehouse-db',engine:'aurora-postgresql',cls:'db.r6g.2xlarge',multi:true,storage:2000},
    {vpc:6,name:'pci-db',engine:'mysql',cls:'db.r6g.large',multi:true,storage:200},
  ];
  rdsConfigs.forEach((rc,ri)=>{
    const vpcId=vpcs[rc.vpc]?.VpcId;if(!vpcId)return;
    const prvSubs=subnets.filter(s=>s.VpcId===vpcId&&!(s.Tags[0]?.Value||'').includes('public'));
    const sub=prvSubs[ri%Math.max(prvSubs.length,1)];
    rdsInstances.push({
      DBInstanceIdentifier:rc.name,DBInstanceClass:rc.cls,Engine:rc.engine,
      DBInstanceStatus:'available',MultiAZ:rc.multi,AllocatedStorage:rc.storage,
      Endpoint:{Address:rc.name+'.cluster-abc.us-east-1.rds.amazonaws.com',Port:rc.engine.includes('postgres')?5432:3306},
      DBSubnetGroup:{VpcId:vpcId,DBSubnetGroupName:rc.name+'-subnet-group',
        Subnets:prvSubs.slice(0,3).map(s=>({SubnetIdentifier:s.SubnetId,SubnetAvailabilityZone:{Name:s.AvailabilityZone}}))},
      VpcSecurityGroups:sgs.filter(sg=>sg.VpcId===vpcId).slice(0,1).map(sg=>({VpcSecurityGroupId:sg.GroupId,Status:'active'})),
      StorageEncrypted:true,AvailabilityZone:sub?.AvailabilityZone||'us-east-1a'
    });
  });

  // ECS services
  const ecsServices=[];
  const ecsConfigs=[
    {vpc:0,name:'prod-api',cluster:'prod-cluster',tasks:4,cpu:'512',mem:'1024'},
    {vpc:0,name:'prod-worker',cluster:'prod-cluster',tasks:2,cpu:'1024',mem:'2048'},
    {vpc:1,name:'staging-api',cluster:'staging-cluster',tasks:2,cpu:'256',mem:'512'},
    {vpc:3,name:'data-pipeline',cluster:'data-cluster',tasks:3,cpu:'2048',mem:'4096'},
  ];
  ecsConfigs.forEach(ec=>{
    const vpcId=vpcs[ec.vpc]?.VpcId;if(!vpcId)return;
    const prvSubs=subnets.filter(s=>s.VpcId===vpcId&&!(s.Tags[0]?.Value||'').includes('public'));
    ecsServices.push({
      serviceName:ec.name,clusterArn:'arn:aws:ecs:us-east-1:111222333444:cluster/'+ec.cluster,
      taskRoleArn:'arn:aws:iam::111222333444:role/ECSTaskRole',
      status:'ACTIVE',desiredCount:ec.tasks,runningCount:ec.tasks,launchType:'FARGATE',
      networkConfiguration:{awsvpcConfiguration:{
        subnets:prvSubs.slice(0,2).map(s=>s.SubnetId),
        securityGroups:sgs.filter(sg=>sg.VpcId===vpcId).slice(0,1).map(sg=>sg.GroupId),
        assignPublicIp:'DISABLED'
      }},
      taskDefinition:'arn:aws:ecs:us-east-1:111222333444:task-definition/'+ec.name+':12',
      cpu:ec.cpu,memory:ec.mem
    });
  });

  // Lambda VPC functions
  const lambdaFunctions=[];
  const lambdaConfigs=[
    {vpc:0,name:'prod-auth-handler',runtime:'nodejs20.x',mem:256,timeout:30},
    {vpc:0,name:'prod-image-processor',runtime:'python3.12',mem:1024,timeout:300},
    {vpc:3,name:'data-etl-trigger',runtime:'python3.12',mem:512,timeout:900},
    {vpc:4,name:'shared-log-shipper',runtime:'nodejs20.x',mem:128,timeout:60},
  ];
  lambdaConfigs.forEach(lc=>{
    const vpcId=vpcs[lc.vpc]?.VpcId;if(!vpcId)return;
    const prvSubs=subnets.filter(s=>s.VpcId===vpcId&&!(s.Tags[0]?.Value||'').includes('public'));
    lambdaFunctions.push({
      FunctionName:lc.name,Runtime:lc.runtime,MemorySize:lc.mem,Timeout:lc.timeout,
      FunctionArn:'arn:aws:lambda:us-east-1:111222333444:function:'+lc.name,
      Role:'arn:aws:iam::111222333444:role/LambdaExecutionRole',
      State:'Active',LastModified:'2025-01-20T00:00:00Z',
      VpcConfig:{
        VpcId:vpcId,
        SubnetIds:prvSubs.slice(0,2).map(s=>s.SubnetId),
        SecurityGroupIds:sgs.filter(sg=>sg.VpcId===vpcId).slice(0,1).map(sg=>sg.GroupId)
      }
    });
  });

  // ElastiCache
  const ecacheClusters=[];
  const ecConfigs=[
    {vpc:0,name:'prod-redis',engine:'redis',type:'cache.r6g.large',nodes:3},
    {vpc:1,name:'staging-redis',engine:'redis',type:'cache.t3.micro',nodes:1},
    {vpc:3,name:'data-redis',engine:'redis',type:'cache.r6g.xlarge',nodes:2},
  ];
  ecConfigs.forEach(ec=>{
    const vpcId=vpcs[ec.vpc]?.VpcId;if(!vpcId)return;
    ecacheClusters.push({
      CacheClusterId:ec.name,Engine:ec.engine,CacheNodeType:ec.type,
      CacheClusterStatus:'available',NumCacheNodes:ec.nodes,
      CacheSubnetGroupName:ec.name+'-subnet-group',
      VpcId:vpcId,
      CacheNodes:Array.from({length:ec.nodes},(_,i)=>({
        CacheNodeId:'000'+(i+1),CacheNodeStatus:'available',
        Endpoint:{Address:ec.name+'.abc.0001.use1.cache.amazonaws.com',Port:6379}
      })),
      SecurityGroups:sgs.filter(sg=>sg.VpcId===vpcId).slice(0,1).map(sg=>({SecurityGroupId:sg.GroupId,Status:'active'}))
    });
  });

  // Redshift
  const redshiftClusters=[];
  if(vpcs[3]){
    const vpcId=vpcs[3].VpcId;
    const prvSubs=subnets.filter(s=>s.VpcId===vpcId&&!(s.Tags[0]?.Value||'').includes('public'));
    redshiftClusters.push({
      ClusterIdentifier:'data-analytics-cluster',NodeType:'ra3.xlplus',
      ClusterStatus:'available',NumberOfNodes:4,DBName:'analytics',
      Endpoint:{Address:'data-analytics-cluster.abc.us-east-1.redshift.amazonaws.com',Port:5439},
      VpcId:vpcId,ClusterSubnetGroupName:'data-redshift-subnet-group',
      VpcSecurityGroups:sgs.filter(sg=>sg.VpcId===vpcId).slice(0,1).map(sg=>({VpcSecurityGroupId:sg.GroupId,Status:'active'})),
      Encrypted:true,
      ClusterNodes:Array.from({length:4},(_,i)=>({NodeRole:i===0?'LEADER':'COMPUTE'}))
    });
  }

  // Transit Gateway Attachments
  const tgwAttachments=[];
  vpcs.forEach(vpc=>{
    const hasRoute=rts.some(rt=>rt.VpcId===vpc.VpcId&&(rt.Routes||[]).some(r=>r.TransitGatewayId));
    if(hasRoute){
      tgwAttachments.push({
        TransitGatewayAttachmentId:nid('tgw-attach'),
        TransitGatewayId:'tgw-enterprise01',
        ResourceId:vpc.VpcId,ResourceType:'vpc',
        State:'available',
        Association:{TransitGatewayRouteTableId:'tgw-rtb-main',State:'associated'}
      });
    }
  });

  // CloudFront
  const cfDistributions=[];
  const cfAlbs=albsList.filter(a=>a.Scheme==='internet-facing').slice(0,2);
  cfAlbs.forEach((alb,ci)=>{
    cfDistributions.push({
      Id:'E'+String(ci+1).padStart(13,'0'),DomainName:'d'+String(ci+1).padStart(13,'0')+'.cloudfront.net',
      Status:'Deployed',Enabled:true,
      Origins:{Items:[{
        DomainName:alb.DNSName,Id:'ALB-'+alb.LoadBalancerName,
        CustomOriginConfig:{HTTPPort:80,HTTPSPort:443,OriginProtocolPolicy:'https-only'}
      }]},
      DefaultCacheBehavior:{ViewerProtocolPolicy:'redirect-to-https',Compress:true},
      ViewerCertificate:{ACMCertificateArn:'arn:aws:acm:us-east-1:111222333444:certificate/abc-'+ci},
      Aliases:{Items:ci===0?['www.example.com','api.example.com']:['staging.example.com']},
      WebACLId:wafAcls.length>ci?wafAcls[ci].ARN:''
    });
  });
  if(s3Buckets.length>0){
    cfDistributions.push({
      Id:'E0000000000003',DomainName:'d0000000000003.cloudfront.net',
      Status:'Deployed',Enabled:true,
      Origins:{Items:[{
        DomainName:s3Buckets[4].Name+'.s3.amazonaws.com',Id:'S3-'+s3Buckets[4].Name,
        S3OriginConfig:{OriginAccessIdentity:'origin-access-identity/cloudfront/EOAI123'}
      }]},
      DefaultCacheBehavior:{ViewerProtocolPolicy:'redirect-to-https',Compress:true},
      Aliases:{Items:['static.example.com']}
    });
  }

  // IAM Demo Data
  const iamRoles=[
    {RoleName:'EC2InstanceRole',Arn:'arn:aws:iam::111222333444:role/EC2InstanceRole',
     CreateDate:'2024-01-15T00:00:00Z',
     AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'ec2.amazonaws.com'},Action:'sts:AssumeRole'}]},
     RolePolicyList:[{PolicyName:'EC2InlinePolicy',PolicyDocument:{Version:'2012-10-17',Statement:[
       {Effect:'Allow',Action:['s3:GetObject','s3:PutObject'],Resource:'arn:aws:s3:::prod-app-data/*'},
       {Effect:'Allow',Action:['logs:CreateLogGroup','logs:CreateLogStream','logs:PutLogEvents'],Resource:'arn:aws:logs:*:111222333444:*'}
     ]}}],
     AttachedManagedPolicies:[{PolicyArn:'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore',PolicyName:'AmazonSSMManagedInstanceCore'}],
     RoleLastUsed:{LastUsedDate:new Date().toISOString()}},
    {RoleName:'LambdaExecutionRole',Arn:'arn:aws:iam::111222333444:role/LambdaExecutionRole',
     CreateDate:'2024-02-01T00:00:00Z',
     AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'lambda.amazonaws.com'},Action:'sts:AssumeRole'}]},
     RolePolicyList:[{PolicyName:'LambdaInlinePolicy',PolicyDocument:{Version:'2012-10-17',Statement:[
       {Effect:'Allow',Action:['logs:CreateLogGroup','logs:CreateLogStream','logs:PutLogEvents'],Resource:'arn:aws:logs:*:111222333444:*'},
       {Effect:'Allow',Action:['dynamodb:GetItem','dynamodb:PutItem','dynamodb:Query','dynamodb:UpdateItem','dynamodb:DeleteItem'],Resource:'arn:aws:dynamodb:us-east-1:111222333444:table/prod-*'}
     ]}}],
     AttachedManagedPolicies:[],
     RoleLastUsed:{LastUsedDate:new Date().toISOString()}},
    {RoleName:'ECSTaskRole',Arn:'arn:aws:iam::111222333444:role/ECSTaskRole',
     CreateDate:'2024-03-10T00:00:00Z',
     AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'ecs-tasks.amazonaws.com'},Action:'sts:AssumeRole'}]},
     RolePolicyList:[{PolicyName:'ECSInlinePolicy',PolicyDocument:{Version:'2012-10-17',Statement:[
       {Effect:'Allow',Action:['ecr:GetDownloadUrlForLayer','ecr:BatchGetImage','ecr:GetAuthorizationToken'],Resource:'*'},
       {Effect:'Allow',Action:['s3:GetObject','s3:ListBucket'],Resource:['arn:aws:s3:::prod-assets','arn:aws:s3:::prod-assets/*']},
       {Effect:'Allow',Action:['sqs:SendMessage','sqs:ReceiveMessage','sqs:DeleteMessage'],Resource:'arn:aws:sqs:us-east-1:111222333444:prod-*'}
     ]}}],
     AttachedManagedPolicies:[],
     RoleLastUsed:{LastUsedDate:new Date().toISOString()}},
    {RoleName:'AdminRole',Arn:'arn:aws:iam::111222333444:role/AdminRole',
     CreateDate:'2023-06-01T00:00:00Z',
     AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{AWS:'arn:aws:iam::111222333444:root'},Action:'sts:AssumeRole'}]},
     RolePolicyList:[],
     AttachedManagedPolicies:[{PolicyArn:'arn:aws:iam::aws:policy/AdministratorAccess',PolicyName:'AdministratorAccess'}],
     RoleLastUsed:{LastUsedDate:new Date(Date.now()-86400000).toISOString()}},
    {RoleName:'ReadOnlyRole',Arn:'arn:aws:iam::111222333444:role/ReadOnlyRole',
     CreateDate:'2024-04-15T00:00:00Z',
     AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{AWS:'arn:aws:iam::111222333444:root'},Action:'sts:AssumeRole'}]},
     RolePolicyList:[{PolicyName:'ReadOnlyInline',PolicyDocument:{Version:'2012-10-17',Statement:[
       {Effect:'Allow',Action:['ec2:Describe*','s3:Get*','s3:List*','rds:Describe*','lambda:List*','lambda:Get*','ecs:Describe*','ecs:List*','iam:Get*','iam:List*','cloudwatch:Get*','cloudwatch:List*','logs:Describe*','logs:Get*'],Resource:'*'}
     ]}}],
     AttachedManagedPolicies:[],
     RoleLastUsed:{LastUsedDate:new Date().toISOString()}},
    {RoleName:'DeployRole',Arn:'arn:aws:iam::111222333444:role/DeployRole',
     CreateDate:'2024-05-20T00:00:00Z',
     AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{AWS:'arn:aws:iam::111222333444:root'},Action:'sts:AssumeRole',Condition:{Bool:{'aws:MultiFactorAuthPresent':'true'}}}]},
     PermissionsBoundary:{PermissionsBoundaryType:'Policy',PermissionsBoundaryArn:'arn:aws:iam::111222333444:policy/DeployBoundary'},
     RolePolicyList:[{PolicyName:'DeployInline',PolicyDocument:{Version:'2012-10-17',Statement:[
       {Effect:'Allow',Action:['codedeploy:*','s3:GetObject','s3:PutObject','s3:ListBucket'],Resource:'*'},
       {Effect:'Allow',Action:['ec2:DescribeInstances','ec2:DescribeInstanceStatus'],Resource:'*'}
     ]}}],
     AttachedManagedPolicies:[],
     RoleLastUsed:{LastUsedDate:new Date().toISOString()}},
    {RoleName:'CrossAccountRole',Arn:'arn:aws:iam::111222333444:role/CrossAccountRole',
     CreateDate:'2024-06-01T00:00:00Z',
     AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{AWS:'arn:aws:iam::555666777888:root'},Action:'sts:AssumeRole'}]},
     RolePolicyList:[{PolicyName:'CrossAccountPolicy',PolicyDocument:{Version:'2012-10-17',Statement:[
       {Effect:'Allow',Action:['s3:GetObject','s3:ListBucket'],Resource:['arn:aws:s3:::shared-data','arn:aws:s3:::shared-data/*']}
     ]}}],
     AttachedManagedPolicies:[],
     RoleLastUsed:{LastUsedDate:new Date(Date.now()-7776000000).toISOString()}},
    {RoleName:'DataAnalystRole',Arn:'arn:aws:iam::111222333444:role/DataAnalystRole',
     CreateDate:'2024-07-01T00:00:00Z',
     AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{AWS:'arn:aws:iam::111222333444:root'},Action:'sts:AssumeRole'}]},
     RolePolicyList:[{PolicyName:'DataAnalystInline',PolicyDocument:{Version:'2012-10-17',Statement:[
       {Effect:'Allow',Action:'s3:*',Resource:'*'},
       {Effect:'Allow',Action:'redshift:*',Resource:'*'}
     ]}}],
     AttachedManagedPolicies:[],
     RoleLastUsed:{LastUsedDate:new Date().toISOString()}},
    {RoleName:'AWSServiceRoleForECS',Arn:'arn:aws:iam::111222333444:role/aws-service-role/ecs.amazonaws.com/AWSServiceRoleForECS',
     CreateDate:'2023-01-01T00:00:00Z',Path:'/aws-service-role/ecs.amazonaws.com/',
     AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'ecs.amazonaws.com'},Action:'sts:AssumeRole'}]},
     RolePolicyList:[],
     AttachedManagedPolicies:[{PolicyArn:'arn:aws:iam::aws:policy/aws-service-role/AmazonECSServiceRolePolicy',PolicyName:'AmazonECSServiceRolePolicy'}],
     RoleLastUsed:{LastUsedDate:new Date().toISOString()}},
    {RoleName:'SecurityAuditRole',Arn:'arn:aws:iam::111222333444:role/SecurityAuditRole',
     CreateDate:'2024-08-01T00:00:00Z',
     AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{AWS:'arn:aws:iam::111222333444:root'},Action:'sts:AssumeRole'}]},
     RolePolicyList:[],
     AttachedManagedPolicies:[
       {PolicyArn:'arn:aws:iam::aws:policy/SecurityAudit',PolicyName:'SecurityAudit'},
       {PolicyArn:'arn:aws:iam::aws:policy/ReadOnlyAccess',PolicyName:'ReadOnlyAccess'}
     ],
     RoleLastUsed:{LastUsedDate:new Date().toISOString()}}
  ];
  const iamUsers=[
    {UserName:'admin-user',Arn:'arn:aws:iam::111222333444:user/admin-user',
     CreateDate:'2023-01-15T00:00:00Z',
     MFADevices:[{SerialNumber:'arn:aws:iam::111222333444:mfa/admin-user'}],
     UserPolicyList:[],
     AttachedManagedPolicies:[{PolicyArn:'arn:aws:iam::aws:policy/AdministratorAccess',PolicyName:'AdministratorAccess'}]},
    {UserName:'dev-user',Arn:'arn:aws:iam::111222333444:user/dev-user',
     CreateDate:'2024-03-01T00:00:00Z',
     MFADevices:[],
     UserPolicyList:[{PolicyName:'DevInlinePolicy',PolicyDocument:{Version:'2012-10-17',Statement:[
       {Effect:'Allow',Action:'ec2:*',Resource:'*'},
       {Effect:'Allow',Action:'s3:GetObject',Resource:'arn:aws:s3:::dev-*/*'}
     ]}}],
     AttachedManagedPolicies:[]},
    {UserName:'ci-bot',Arn:'arn:aws:iam::111222333444:user/ci-bot',
     CreateDate:'2024-05-01T00:00:00Z',
     MFADevices:[],
     UserPolicyList:[{PolicyName:'CIBotPolicy',PolicyDocument:{Version:'2012-10-17',Statement:[
       {Effect:'Allow',Action:['codedeploy:CreateDeployment','codedeploy:GetDeployment','codedeploy:RegisterApplicationRevision'],Resource:'*'},
       {Effect:'Allow',Action:['s3:GetObject','s3:PutObject'],Resource:'arn:aws:s3:::ci-artifacts/*'}
     ]}}],
     AttachedManagedPolicies:[]},
    {UserName:'readonly-user',Arn:'arn:aws:iam::111222333444:user/readonly-user',
     CreateDate:'2024-06-01T00:00:00Z',
     MFADevices:[{SerialNumber:'arn:aws:iam::111222333444:mfa/readonly-user'}],
     UserPolicyList:[],
     AttachedManagedPolicies:[{PolicyArn:'arn:aws:iam::aws:policy/ReadOnlyAccess',PolicyName:'ReadOnlyAccess'}]}
  ];
  const iamPolicies=[
    {PolicyName:'AdministratorAccess',Arn:'arn:aws:iam::aws:policy/AdministratorAccess',
     PolicyVersionList:[{Document:JSON.stringify({Version:'2012-10-17',Statement:[{Effect:'Allow',Action:'*',Resource:'*'}]}),IsDefaultVersion:true}]},
    {PolicyName:'ReadOnlyAccess',Arn:'arn:aws:iam::aws:policy/ReadOnlyAccess',
     PolicyVersionList:[{Document:JSON.stringify({Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['ec2:Describe*','s3:Get*','s3:List*','rds:Describe*','lambda:List*','lambda:Get*','ecs:Describe*','ecs:List*','iam:Get*','iam:List*','cloudwatch:Get*','cloudwatch:List*','logs:Describe*','logs:Get*'],Resource:'*'}]}),IsDefaultVersion:true}]},
    {PolicyName:'AmazonSSMManagedInstanceCore',Arn:'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore',
     PolicyVersionList:[{Document:JSON.stringify({Version:'2012-10-17',Statement:[
       {Effect:'Allow',Action:['ssm:UpdateInstanceInformation','ssmmessages:CreateControlChannel','ssmmessages:CreateDataChannel','ssmmessages:OpenControlChannel','ssmmessages:OpenDataChannel','ec2messages:GetMessages'],Resource:'*'}
     ]}),IsDefaultVersion:true}]},
    {PolicyName:'SecurityAudit',Arn:'arn:aws:iam::aws:policy/SecurityAudit',
     PolicyVersionList:[{Document:JSON.stringify({Version:'2012-10-17',Statement:[
       {Effect:'Allow',Action:['access-analyzer:Get*','access-analyzer:List*','config:Describe*','config:Get*','config:List*','guardduty:Get*','guardduty:List*','inspector:Describe*','inspector:Get*','inspector:List*','iam:Get*','iam:List*','iam:GenerateCredentialReport','cloudtrail:Describe*','cloudtrail:Get*','cloudtrail:LookupEvents'],Resource:'*'}
     ]}),IsDefaultVersion:true}]}
  ];

  return {
    vpcs:{Vpcs:vpcs},subnets:{Subnets:subnets},rts:{RouteTables:rts},
    sgs:{SecurityGroups:sgs},nacls:{NetworkAcls:nacls},
    igws:{InternetGateways:igwsList},nats:{NatGateways:natsList},
    ec2:{Reservations:[{Instances:ec2Instances}]},
    albs:{LoadBalancers:albsList},vpces:{VpcEndpoints:vpceList},
    peer:{VpcPeeringConnections:peerings},vpn:{VpnConnections:vpnConns},
    vols:{Volumes:volsList},snaps:{Snapshots:snapsList},
    s3:{Buckets:s3Buckets},r53:{HostedZones:zones},r53records:{ResourceRecordSets:r53records},tgs:{TargetGroups:tgsList},
    enis:{NetworkInterfaces:enisList},waf:{WebACLs:wafAcls},
    rds:{DBInstances:rdsInstances},ecs:{services:ecsServices},
    lambda:{Functions:lambdaFunctions},elasticache:{CacheClusters:ecacheClusters},
    redshift:{Clusters:redshiftClusters},tgwatt:{TransitGatewayAttachments:tgwAttachments},
    cf:{DistributionList:{Items:cfDistributions}},
    iam:{RoleDetailList:iamRoles,UserDetailList:iamUsers,Policies:iamPolicies}
  };
}
// OPTIMIZED: Lazy-load demo data only when user clicks "Load Demo" (saves ~5MB at startup)
let demo=null;

let gwNames={};

// Compliance reference documentation links
const _complianceRefs={
  'CIS 5.1':{url:'https://docs.aws.amazon.com/securityhub/latest/userguide/nacl-controls.html',ref:'CIS AWS Foundations 5.1'},
  'CIS 5.2':{url:'https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html#ec2-13',ref:'CIS AWS Foundations 5.2'},
  'CIS 5.3':{url:'https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html#ec2-14',ref:'CIS AWS Foundations 5.3'},
  'CIS 5.4':{url:'https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html#ec2-2',ref:'CIS AWS Foundations 5.4'},
  'CIS 5.5':{url:'https://docs.aws.amazon.com/vpc/latest/peering/peering-configurations-partial-access.html',ref:'CIS AWS Foundations 5.5'},
  'NET-1':{url:'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Scenario2.html',ref:'VPC Private Subnet Design'},
  'NET-2':{url:'https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html',ref:'Security Group Best Practices'},
  'WAF-1':{url:'https://docs.aws.amazon.com/waf/latest/developerguide/waf-rules.html',ref:'AWS WAF Rules'},
  'WAF-2':{url:'https://docs.aws.amazon.com/waf/latest/developerguide/waf-rate-based-rules.html',ref:'WAF Rate-Based Rules'},
  'WAF-3':{url:'https://docs.aws.amazon.com/waf/latest/developerguide/waf-protections.html',ref:'WAF ALB Protection'},
  'WAF-4':{url:'https://docs.aws.amazon.com/waf/latest/developerguide/waf-default-action.html',ref:'WAF Default Action'},
  'ARCH-N1':{url:'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-ip-addressing.html',ref:'Well-Architected SEC05-BP01'},
  'ARCH-N2':{url:'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html',ref:'Well-Architected REL-10'},
  'ARCH-N3':{url:'https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/use-fault-isolation-to-protect-your-workload.html',ref:'Well-Architected REL-10'},
  'ARCH-N5':{url:'https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html',ref:'Well-Architected SEC05-BP02'},
  'ARCH-C1':{url:'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html',ref:'Well-Architected SEC05-BP01'},
  'ARCH-C2':{url:'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html',ref:'Well-Architected SEC08-BP02'},
  'ARCH-C3':{url:'https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html',ref:'Lambda VPC Config'},
  'ARCH-D1':{url:'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.Security.html',ref:'Well-Architected SEC05-BP01'},
  'ARCH-D2':{url:'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html',ref:'Well-Architected REL-09'},
  'ARCH-D3':{url:'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html',ref:'Well-Architected SEC08-BP02'},
  'ARCH-D4':{url:'https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/Replication.html',ref:'Well-Architected REL-09'},
  'ARCH-D5':{url:'https://docs.aws.amazon.com/redshift/latest/mgmt/working-with-db-encryption.html',ref:'Well-Architected SEC08-BP02'},
  'ARCH-S1':{url:'https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-bucket-encryption.html',ref:'Well-Architected SEC08-BP02'},
  'ARCH-S2':{url:'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSSnapshots.html',ref:'Well-Architected REL-09'},
  'ARCH-E1':{url:'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html',ref:'Well-Architected PERF04-BP01'},
  'ARCH-G1':{url:'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html',ref:'Well-Architected REL-10'},
  'ARCH-G2':{url:'https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html',ref:'Well-Architected COST07-BP01'},
  'ARCH-X1':{url:'https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-routing.html',ref:'VPC Peering Routing'},
  'SOC2-CC6.1':{url:'https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html',ref:'SOC2 CC6.1 Logical Access Security'},
  'SOC2-CC6.3':{url:'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html',ref:'SOC2 CC6.3 Role-Based Access'},
  'SOC2-CC6.6':{url:'https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html',ref:'SOC2 CC6.6 Network Boundaries'},
  'SOC2-CC6.7':{url:'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/data-protection.html',ref:'SOC2 CC6.7 Data Transmission'},
  'SOC2-CC6.8':{url:'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/infrastructure-protection.html',ref:'SOC2 CC6.8 Malicious Software'},
  'SOC2-CC7.2':{url:'https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html',ref:'SOC2 CC7.2 Monitoring'},
  'SOC2-CC8.1':{url:'https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html',ref:'SOC2 CC8.1 Change Management'},
  'SOC2-A1.2':{url:'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html',ref:'SOC2 A1.2 Availability'},
  'SOC2-A1.3':{url:'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSSnapshots.html',ref:'SOC2 A1.3 Recovery'},
  'SOC2-C1.1':{url:'https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-bucket-encryption.html',ref:'SOC2 C1.1 Confidentiality'},
  'SOC2-C1.2':{url:'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html',ref:'SOC2 C1.2 Data Protection'},
  'SOC2-PI1.1':{url:'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html',ref:'SOC2 PI1.1 Processing Integrity'},
  'PCI-1.3.1':{url:'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_SecurityGroups.html',ref:'PCI DSS 4.0 Req 1.3.1 Inbound Traffic'},
  'PCI-1.3.2':{url:'https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html',ref:'PCI DSS 4.0 Req 1.3.2 Outbound Traffic'},
  'PCI-1.3.4':{url:'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html',ref:'PCI DSS 4.0 Req 1.3.4 Network Segmentation'},
  'PCI-2.2.1':{url:'https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html',ref:'PCI DSS 4.0 Req 2.2.1 Configuration Standards'},
  'PCI-3.4.1':{url:'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html',ref:'PCI DSS 4.0 Req 3.4.1 Data Encryption'},
  'PCI-3.5.1':{url:'https://docs.aws.amazon.com/kms/latest/developerguide/overview.html',ref:'PCI DSS 4.0 Req 3.5.1 Key Management'},
  'PCI-4.2.1':{url:'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-https-listener.html',ref:'PCI DSS 4.0 Req 4.2.1 TLS'},
  'PCI-6.4.1':{url:'https://docs.aws.amazon.com/waf/latest/developerguide/waf-chapter.html',ref:'PCI DSS 4.0 Req 6.4.1 Web App Firewall'},
  'PCI-7.2.1':{url:'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html',ref:'PCI DSS 4.0 Req 7.2.1 Least Privilege'},
  'PCI-8.3.1':{url:'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa.html',ref:'PCI DSS 4.0 Req 8.3.1 MFA'},
  'PCI-10.2.1':{url:'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html',ref:'PCI DSS 4.0 Req 10.2.1 Audit Logging'},
  'PCI-11.3.1':{url:'https://docs.aws.amazon.com/inspector/latest/user/what-is-inspector.html',ref:'PCI DSS 4.0 Req 11.3.1 Vulnerability Scanning'},
  'PCI-12.10.1':{url:'https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html',ref:'PCI DSS 4.0 Req 12.10.1 Incident Response'},
  'IAM-1':{url:'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html',ref:'IAM Best Practices'},
  'IAM-2':{url:'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege',ref:'IAM Least Privilege'},
  'IAM-3':{url:'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios_third-party.html',ref:'Cross-Account MFA'},
  'IAM-4':{url:'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege',ref:'IAM Service Wildcards'},
  'IAM-5':{url:'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_finding-unused.html',ref:'Unused IAM Roles'},
  'IAM-6':{url:'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-user_externalid.html',ref:'External ID Best Practice'},
  'IAM-7':{url:'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#bp-use-aws-defined-policies',ref:'Managed vs Inline Policies'},
  'IAM-8':{url:'https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html',ref:'Permission Boundaries'},
  // CKV (standalone Checkov checks)
  'CKV_AWS_79':{url:'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html',ref:'Checkov CKV_AWS_79 — IMDSv2'},
  'CKV_AWS_126':{url:'https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html',ref:'Checkov CKV_AWS_126 — VPC Flow Logs'},
  'CKV_AWS_21':{url:'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html',ref:'Checkov CKV_AWS_21 — S3 Versioning'},
  'CKV_AWS_18':{url:'https://docs.aws.amazon.com/AmazonS3/latest/userguide/ServerLogs.html',ref:'Checkov CKV_AWS_18 — S3 Access Logging'},
  'CKV_AWS_26':{url:'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html',ref:'Checkov CKV_AWS_26 — RDS Backup Retention'},
  'CKV_AWS_45':{url:'https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html',ref:'Checkov CKV_AWS_45 — Lambda Env Encryption'},
  'CKV_AWS_50':{url:'https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html',ref:'Checkov CKV_AWS_50 — Lambda X-Ray Tracing'},
  // BUDR
  'BUDR-HA-1':{url:'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html',ref:'RDS Multi-AZ Deployments'},
  'BUDR-HA-2':{url:'https://docs.aws.amazon.com/autoscaling/ec2/userguide/what-is-amazon-ec2-auto-scaling.html',ref:'EC2 Auto Scaling'},
  'BUDR-HA-3':{url:'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html',ref:'ECS Service Scaling'},
  'BUDR-HA-4':{url:'https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/Replication.html',ref:'ElastiCache Replication'},
  'BUDR-HA-5':{url:'https://docs.aws.amazon.com/redshift/latest/mgmt/managing-clusters-console.html',ref:'Redshift Cluster Management'},
  'BUDR-HA-6':{url:'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-subnets.html',ref:'ALB Availability Zones'},
  'BUDR-BAK-1':{url:'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html',ref:'RDS Automated Backups'},
  'BUDR-BAK-2':{url:'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSSnapshots.html',ref:'EBS Snapshots'},
  'BUDR-BAK-3':{url:'https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/backups.html',ref:'ElastiCache Backups'},
  'BUDR-BAK-4':{url:'https://docs.aws.amazon.com/redshift/latest/mgmt/working-with-snapshots.html',ref:'Redshift Snapshots'},
  'BUDR-BAK-5':{url:'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSSnapshots.html',ref:'EBS Snapshot Scheduling'},
  'BUDR-DR-1':{url:'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html',ref:'RDS DR Strategy'},
  'BUDR-DR-2':{url:'https://docs.aws.amazon.com/prescriptive-guidance/latest/backup-recovery/ec2-backup.html',ref:'EC2 DR Strategy'},
};
