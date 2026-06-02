// AWS export filename + content -> input bucket classifier.
//
// Characterization snapshot of the `fileMap` table and `matchFile()` function
// that currently live inline in `src/app-core.js` (lines 18664-18792 as of
// 2026-06-01). Copied VERBATIM so `tests/unit/file-classify.test.mjs` can pin
// the file-routing behavior before the inline copy is replaced by a delegating
// call (Humify plan unit EXT1). Until EXT1 removes the duplication, keep this
// byte-for-byte in sync with `app-core.js`.
//
// `matchFile(fname, content)` returns an input id string (e.g. 'in_vpcs'), or
// `null` when no bucket matches or a filename match is contradicted by content.
// A `null` return silently drops the uploaded file in the UI, which is exactly
// why this routing logic needs characterization coverage.

// filename-to-input mapping
export const fileMap=[
  {id:'in_vpcs',patterns:['vpc','vpcs']},
  {id:'in_subnets',patterns:['subnet','subnets']},
  {id:'in_rts',patterns:['route-table','route_table','routetable','rt']},
  {id:'in_sgs',patterns:['security-group','security_group','securitygroup','sg']},
  {id:'in_nacls',patterns:['nacl','network-acl','network_acl','networkacl']},
  {id:'in_enis',patterns:['eni','network-interface','network_interface','networkinterface']},
  {id:'in_igws',patterns:['igw','internet-gateway','internet_gateway','internetgateway']},
  {id:'in_nats',patterns:['nat-gw','nat_gw','natgw','nat-gateway','nat_gateway','natgateway']},
  {id:'in_vpces',patterns:['vpc-endpoint','vpc_endpoint','vpcendpoint','vpce']},
  {id:'in_ec2',patterns:['instance','instances','ec2']},
  {id:'in_albs',patterns:['alb','nlb','elb','load-balancer','load_balancer','loadbalancer']},
  {id:'in_tgs',patterns:['target-group','target_group','targetgroup','tg']},
  {id:'in_peer',patterns:['peering','vpc-peering','peer']},
  {id:'in_vpn',patterns:['vpn','vpn-connection','vpn_connection']},
  {id:'in_vols',patterns:['volume','volumes','vol']},
  {id:'in_snaps',patterns:['snapshot','snapshots','snap']},
  {id:'in_s3',patterns:['s3-bucket','s3_bucket','s3bucket','s3']},
  {id:'in_r53',patterns:['hosted-zone','hosted_zone','hostedzone','r53','route53']},
  {id:'in_r53records',patterns:['record-set','recordset','resource-record','resourcerecord','r53record','r53-record']},
  {id:'in_waf',patterns:['waf','web-acl','webacl','web_acl']},
  {id:'in_rds',patterns:['rds','db-instance','dbinstance','db_instance']},
  {id:'in_ecs',patterns:['ecs','ecs-service','ecs_service','ecsservice']},
  {id:'in_lambda',patterns:['lambda','function','lambda-function']},
  {id:'in_elasticache',patterns:['elasticache','cache-cluster','cachecluster','redis','memcached']},
  {id:'in_redshift',patterns:['redshift','redshift-cluster']},
  {id:'in_tgwatt',patterns:['transit-gateway-attachment','tgw-attachment','tgw_attachment','tgwattachment']},
  {id:'in_cf',patterns:['cloudfront','cf-distribution','distribution']},
  {id:'in_iam',patterns:['iam','iam-auth','iam_auth','iamauth','account-authorization']},
  // Governance
  {id:'in_cloudtrail',patterns:['cloudtrail-trail','cloudtrail_trail','cloudtrail']},
  {id:'in_cwalarms',patterns:['cloudwatch-alarm','cloudwatch_alarm','cwalarm','cw-alarm']},
  {id:'in_loggroups',patterns:['log-group','log_group','loggroup']},
  {id:'in_flowlogs',patterns:['flow-log','flow_log','flowlog']},
  {id:'in_configrecorders',patterns:['config-recorder','config_recorder','configrecorder']},
  {id:'in_configrules',patterns:['config-rule','config_rule','configrule']},
  {id:'in_configconformance',patterns:['config-conformance','config_conformance','conformance-pack','conformance_pack']},
  {id:'in_securityhub',patterns:['securityhub-standard','securityhub_standard','securityhub','security-hub']},
  {id:'in_accessanalyzer',patterns:['access-analyzer','access_analyzer','accessanalyzer']},
  {id:'in_kmskeys',patterns:['kms-key','kms_key','kmskey','kms']},
  {id:'in_guardduty',patterns:['guardduty-detector','guardduty_detector','guardduty']},
  {id:'in_secrets',patterns:['secret','secrets']},
  {id:'in_ssmparams',patterns:['ssm-parameter','ssm_parameter','ssmparameter','ssm']},
  // Integration
  {id:'in_ecr',patterns:['ecr-repositor','ecr_repositor','ecrrepositor','ecr']},
  {id:'in_asg',patterns:['auto-scaling-group','auto_scaling_group','autoscalinggroup','asg']},
  {id:'in_apigw',patterns:['api-gateway','api_gateway','apigateway','apigw']},
  {id:'in_sns',patterns:['sns-topic','sns_topic','snstopic','sns']},
  {id:'in_sqs',patterns:['sqs-queue','sqs_queue','sqsqueue','sqs']},
];

export function matchFile(fname, content){
  const base=fname.replace(/\.json$/i,'').toLowerCase().replace(/[^a-z0-9-_]/g,'');
  // Helper: check if content has a key (works for both objects and strings)
  function _hasKey(k){
    if(!content)return false;
    if(typeof content==='object')return k in content;
    return content.slice(0,500).includes('"'+k+'"');
  }
  // exact match first
  for(const fm of fileMap){
    for(const p of fm.patterns){if(base===p||base===p+'s')return fm.id}
  }
  // contains match — sort candidates by longest pattern first to avoid partial matches
  const candidates=[];
  for(const fm of fileMap){
    for(const p of fm.patterns){if(base.includes(p))candidates.push({id:fm.id,p,len:p.length})}
  }
  if(candidates.length){
    candidates.sort((a,b)=>b.len-a.len);
    const best=candidates[0].id;
    // content-override: verify filename match doesn't contradict content
    if(content){
      if(best==='in_ec2'){
        if(_hasKey('DBInstances')&&!_hasKey('Reservations'))return 'in_rds';
        if(_hasKey('CacheClusters'))return 'in_elasticache';
      }
      // Verify critical inputs have expected AWS key — reject mismatched content
      const expectedKey={in_rts:'RouteTables',in_vpcs:'Vpcs',in_subnets:'Subnets',in_sgs:'SecurityGroups',in_nacls:'NetworkAcls',in_igws:'InternetGateways',in_nats:'NatGateways'};
      if(expectedKey[best]&&!_hasKey(expectedKey[best]))return null;
    }
    return best;
  }
  // content-based fallback — detect by JSON keys
  if(content){
    if(_hasKey('Reservations'))return 'in_ec2';
    if(_hasKey('DBInstances'))return 'in_rds';
    if(_hasKey('Vpcs'))return 'in_vpcs';
    if(_hasKey('Subnets'))return 'in_subnets';
    if(_hasKey('RouteTables'))return 'in_rts';
    if(_hasKey('SecurityGroups'))return 'in_sgs';
    if(_hasKey('NetworkAcls'))return 'in_nacls';
    if(_hasKey('NetworkInterfaces'))return 'in_enis';
    if(_hasKey('InternetGateways'))return 'in_igws';
    if(_hasKey('NatGateways'))return 'in_nats';
    if(_hasKey('VpcEndpoints'))return 'in_vpces';
    if(_hasKey('LoadBalancers'))return 'in_albs';
    if(_hasKey('TargetGroups'))return 'in_tgs';
    if(_hasKey('VpcPeeringConnections'))return 'in_peer';
    if(_hasKey('VpnConnections'))return 'in_vpn';
    if(_hasKey('Volumes'))return 'in_vols';
    if(_hasKey('Snapshots'))return 'in_snaps';
    if(_hasKey('Buckets'))return 'in_s3';
    if(_hasKey('HostedZones'))return 'in_r53';
    if(_hasKey('ResourceRecordSets'))return 'in_r53records';
    if(_hasKey('WebACLs'))return 'in_waf';
    if(_hasKey('TransitGatewayAttachments'))return 'in_tgwatt';
    if(_hasKey('DistributionList'))return 'in_cf';
    if(_hasKey('CacheClusters'))return 'in_elasticache';
    if(_hasKey('Clusters')&&_hasKey('Redshift'))return 'in_redshift';
    if(_hasKey('UserDetailList')||_hasKey('RoleDetailList')||_hasKey('GroupDetailList'))return 'in_iam';
    // Governance
    if(_hasKey('trailList'))return 'in_cloudtrail';
    if(_hasKey('MetricAlarms'))return 'in_cwalarms';
    if(_hasKey('logGroups'))return 'in_loggroups';
    if(_hasKey('FlowLogs'))return 'in_flowlogs';
    if(_hasKey('ConfigurationRecorders'))return 'in_configrecorders';
    if(_hasKey('ConfigRules'))return 'in_configrules';
    if(_hasKey('ConformancePackDetails'))return 'in_configconformance';
    if(_hasKey('StandardsSubscriptions'))return 'in_securityhub';
    if(_hasKey('analyzers'))return 'in_accessanalyzer';
    if(_hasKey('SecretList'))return 'in_secrets';
    // Integration
    if(_hasKey('repositories')&&_hasKey('repositoryArn'))return 'in_ecr';
    if(_hasKey('AutoScalingGroups'))return 'in_asg';
    if(_hasKey('QueueUrls'))return 'in_sqs';
  }
  return null;
}
