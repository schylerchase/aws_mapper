// Report HTML generators — builds HTML sections for the assessment report.
// Extracted from app-core.js REPORT BUILDER region.
// Functions produce HTML strings consumed by the report preview/export flow.

import { safeParse, esc, gn, gv } from './utils.js';
import { showToast } from './dom-helpers.js';
import {
  SEV_ORDER,
  FW_LABELS,
  EFFORT_LABELS,
  EFFORT_TIME,
  PRIORITY_META,
  TIER_META,
  PRIORITY_ORDER,
  PRIORITY_KEYS,
  MUTE_KEY
} from './constants.js';
import {
  _BUDR_STRATEGY,
  _BUDR_STRATEGY_ORDER,
  _BUDR_STRATEGY_LEGEND,
  _BUDR_EST_MINUTES
} from './budr-engine.js';
import { parseIAMData as _parseIAMData } from './iam-engine.js';

// Re-export constants under underscore-prefixed names for backward compat with app-core.js
export const _EFFORT_LABELS = EFFORT_LABELS;
export const _EFFORT_TIME = EFFORT_TIME;
export const _PRIORITY_META = PRIORITY_META;
export const _TIER_META = TIER_META;
export const _PRIORITY_ORDER = PRIORITY_ORDER;
export const _PRIORITY_KEYS = PRIORITY_KEYS;
export const _MUTE_KEY = MUTE_KEY;
export const _SEV_ORDER = SEV_ORDER;
export const _FW_LABELS = FW_LABELS;

// --- Muted findings (localStorage) ---
let _mutedFindings = new Set();
try {
  const raw = localStorage.getItem(MUTE_KEY);
  if (raw) _mutedFindings = new Set(JSON.parse(raw));
} catch (e) {
  console.warn('Failed to load muted findings:', e);
}

export function _saveMuted() {
  try {
    localStorage.setItem(MUTE_KEY, JSON.stringify([..._mutedFindings]));
  } catch (e) {
    console.warn('Failed to save muted findings:', e);
  }
}
export function _muteKey(f) {
  return f.control + '::' + f.resource;
}
export function _isMuted(f) {
  return _mutedFindings.has(_muteKey(f));
}
export function _toggleMute(f) {
  const k = _muteKey(f);
  if (_mutedFindings.has(k)) _mutedFindings.delete(k);
  else _mutedFindings.add(k);
  _saveMuted();
}

// --- Compliance reference links ---
export const _complianceRefs = {
  'CIS 5.1': {
    url: 'https://docs.aws.amazon.com/securityhub/latest/userguide/nacl-controls.html',
    ref: 'CIS AWS Foundations 5.1'
  },
  'CIS 5.2': {
    url: 'https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html#ec2-13',
    ref: 'CIS AWS Foundations 5.2'
  },
  'CIS 5.3': {
    url: 'https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html#ec2-14',
    ref: 'CIS AWS Foundations 5.3'
  },
  'CIS 5.4': {
    url: 'https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html#ec2-2',
    ref: 'CIS AWS Foundations 5.4'
  },
  'CIS 5.5': {
    url: 'https://docs.aws.amazon.com/vpc/latest/peering/peering-configurations-partial-access.html',
    ref: 'CIS AWS Foundations 5.5'
  },
  'NET-1': {
    url: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Scenario2.html',
    ref: 'VPC Private Subnet Design'
  },
  'NET-2': {
    url: 'https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html',
    ref: 'Security Group Best Practices'
  },
  'WAF-1': {
    url: 'https://docs.aws.amazon.com/waf/latest/developerguide/waf-rules.html',
    ref: 'AWS WAF Rules'
  },
  'WAF-2': {
    url: 'https://docs.aws.amazon.com/waf/latest/developerguide/waf-rate-based-rules.html',
    ref: 'WAF Rate-Based Rules'
  },
  'WAF-3': {
    url: 'https://docs.aws.amazon.com/waf/latest/developerguide/waf-protections.html',
    ref: 'WAF ALB Protection'
  },
  'WAF-4': {
    url: 'https://docs.aws.amazon.com/waf/latest/developerguide/waf-default-action.html',
    ref: 'WAF Default Action'
  },
  'ARCH-N1': {
    url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-ip-addressing.html',
    ref: 'Well-Architected SEC05-BP01'
  },
  'ARCH-N2': {
    url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html',
    ref: 'Well-Architected REL-10'
  },
  'ARCH-N3': {
    url: 'https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/use-fault-isolation-to-protect-your-workload.html',
    ref: 'Well-Architected REL-10'
  },
  'ARCH-N5': {
    url: 'https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html',
    ref: 'Well-Architected SEC05-BP02'
  },
  'ARCH-C1': {
    url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html',
    ref: 'Well-Architected SEC05-BP01'
  },
  'ARCH-C2': {
    url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html',
    ref: 'Well-Architected SEC08-BP02'
  },
  'ARCH-C3': {
    url: 'https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html',
    ref: 'Lambda VPC Config'
  },
  'ARCH-D1': {
    url: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.Security.html',
    ref: 'Well-Architected SEC05-BP01'
  },
  'ARCH-D2': {
    url: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html',
    ref: 'Well-Architected REL-09'
  },
  'ARCH-D3': {
    url: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html',
    ref: 'Well-Architected SEC08-BP02'
  },
  'ARCH-D4': {
    url: 'https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/Replication.html',
    ref: 'Well-Architected REL-09'
  },
  'ARCH-D5': {
    url: 'https://docs.aws.amazon.com/redshift/latest/mgmt/working-with-db-encryption.html',
    ref: 'Well-Architected SEC08-BP02'
  },
  'ARCH-S1': {
    url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-bucket-encryption.html',
    ref: 'Well-Architected SEC08-BP02'
  },
  'ARCH-S2': {
    url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSSnapshots.html',
    ref: 'Well-Architected REL-09'
  },
  'ARCH-E1': {
    url: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html',
    ref: 'Well-Architected PERF04-BP01'
  },
  'ARCH-G1': {
    url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html',
    ref: 'Well-Architected REL-10'
  },
  'ARCH-G2': {
    url: 'https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html',
    ref: 'Well-Architected COST07-BP01'
  },
  'ARCH-X1': {
    url: 'https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-routing.html',
    ref: 'VPC Peering Routing'
  },
  'SOC2-CC6.1': {
    url: 'https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html',
    ref: 'SOC2 CC6.1 Logical Access Security'
  },
  'SOC2-CC6.3': {
    url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html',
    ref: 'SOC2 CC6.3 Role-Based Access'
  },
  'SOC2-CC6.6': {
    url: 'https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html',
    ref: 'SOC2 CC6.6 Network Boundaries'
  },
  'SOC2-CC6.7': {
    url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/data-protection.html',
    ref: 'SOC2 CC6.7 Data Transmission'
  },
  'SOC2-CC6.8': {
    url: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/infrastructure-protection.html',
    ref: 'SOC2 CC6.8 Malicious Software'
  },
  'SOC2-CC7.2': {
    url: 'https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html',
    ref: 'SOC2 CC7.2 Monitoring'
  },
  'SOC2-CC8.1': {
    url: 'https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html',
    ref: 'SOC2 CC8.1 Change Management'
  },
  'SOC2-A1.2': {
    url: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html',
    ref: 'SOC2 A1.2 Availability'
  },
  'SOC2-A1.3': {
    url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSSnapshots.html',
    ref: 'SOC2 A1.3 Recovery'
  },
  'SOC2-C1.1': {
    url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-bucket-encryption.html',
    ref: 'SOC2 C1.1 Confidentiality'
  },
  'SOC2-C1.2': {
    url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html',
    ref: 'SOC2 C1.2 Data Protection'
  },
  'SOC2-PI1.1': {
    url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html',
    ref: 'SOC2 PI1.1 Processing Integrity'
  },
  'PCI-1.3.1': {
    url: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_SecurityGroups.html',
    ref: 'PCI DSS 4.0 Req 1.3.1 Inbound Traffic'
  },
  'PCI-1.3.2': {
    url: 'https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html',
    ref: 'PCI DSS 4.0 Req 1.3.2 Outbound Traffic'
  },
  'PCI-1.3.4': {
    url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html',
    ref: 'PCI DSS 4.0 Req 1.3.4 Network Segmentation'
  },
  'PCI-2.2.1': {
    url: 'https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html',
    ref: 'PCI DSS 4.0 Req 2.2.1 Configuration Standards'
  },
  'PCI-3.4.1': {
    url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html',
    ref: 'PCI DSS 4.0 Req 3.4.1 Data Encryption'
  },
  'PCI-3.5.1': {
    url: 'https://docs.aws.amazon.com/kms/latest/developerguide/overview.html',
    ref: 'PCI DSS 4.0 Req 3.5.1 Key Management'
  },
  'PCI-4.2.1': {
    url: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-https-listener.html',
    ref: 'PCI DSS 4.0 Req 4.2.1 TLS'
  },
  'PCI-6.4.1': {
    url: 'https://docs.aws.amazon.com/waf/latest/developerguide/waf-chapter.html',
    ref: 'PCI DSS 4.0 Req 6.4.1 Web App Firewall'
  },
  'PCI-7.2.1': {
    url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html',
    ref: 'PCI DSS 4.0 Req 7.2.1 Least Privilege'
  },
  'PCI-8.3.1': {
    url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa.html',
    ref: 'PCI DSS 4.0 Req 8.3.1 MFA'
  },
  'PCI-10.2.1': {
    url: 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html',
    ref: 'PCI DSS 4.0 Req 10.2.1 Audit Logging'
  },
  'PCI-11.3.1': {
    url: 'https://docs.aws.amazon.com/inspector/latest/user/what-is-inspector.html',
    ref: 'PCI DSS 4.0 Req 11.3.1 Vulnerability Scanning'
  },
  'PCI-12.10.1': {
    url: 'https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html',
    ref: 'PCI DSS 4.0 Req 12.10.1 Incident Response'
  },
  'IAM-1': {
    url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html',
    ref: 'IAM Best Practices'
  },
  'IAM-2': {
    url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege',
    ref: 'IAM Least Privilege'
  },
  'IAM-3': {
    url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios_third-party.html',
    ref: 'Cross-Account MFA'
  },
  'IAM-4': {
    url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege',
    ref: 'IAM Service Wildcards'
  },
  'IAM-5': {
    url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_finding-unused.html',
    ref: 'Unused IAM Roles'
  },
  'IAM-6': {
    url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-user_externalid.html',
    ref: 'External ID Best Practice'
  },
  'IAM-7': {
    url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#bp-use-aws-defined-policies',
    ref: 'Managed vs Inline Policies'
  },
  'IAM-8': {
    url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html',
    ref: 'Permission Boundaries'
  },
  CKV_AWS_79: {
    url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html',
    ref: 'Checkov CKV_AWS_79 \u2014 IMDSv2'
  },
  CKV_AWS_126: {
    url: 'https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html',
    ref: 'Checkov CKV_AWS_126 \u2014 VPC Flow Logs'
  },
  CKV_AWS_21: {
    url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html',
    ref: 'Checkov CKV_AWS_21 \u2014 S3 Versioning'
  },
  CKV_AWS_18: {
    url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/ServerLogs.html',
    ref: 'Checkov CKV_AWS_18 \u2014 S3 Access Logging'
  },
  CKV_AWS_26: {
    url: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html',
    ref: 'Checkov CKV_AWS_26 \u2014 RDS Backup Retention'
  },
  CKV_AWS_45: {
    url: 'https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html',
    ref: 'Checkov CKV_AWS_45 \u2014 Lambda Env Encryption'
  },
  CKV_AWS_50: {
    url: 'https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html',
    ref: 'Checkov CKV_AWS_50 \u2014 Lambda X-Ray Tracing'
  },
  'BUDR-HA-1': {
    url: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html',
    ref: 'RDS Multi-AZ Deployments'
  },
  'BUDR-HA-2': {
    url: 'https://docs.aws.amazon.com/autoscaling/ec2/userguide/what-is-amazon-ec2-auto-scaling.html',
    ref: 'EC2 Auto Scaling'
  },
  'BUDR-HA-3': {
    url: 'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html',
    ref: 'ECS Service Scaling'
  },
  'BUDR-HA-4': {
    url: 'https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/Replication.html',
    ref: 'ElastiCache Replication'
  },
  'BUDR-HA-5': {
    url: 'https://docs.aws.amazon.com/redshift/latest/mgmt/managing-clusters-console.html',
    ref: 'Redshift Cluster Management'
  },
  'BUDR-HA-6': {
    url: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-subnets.html',
    ref: 'ALB Availability Zones'
  },
  'BUDR-BAK-1': {
    url: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html',
    ref: 'RDS Automated Backups'
  },
  'BUDR-BAK-2': {
    url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSSnapshots.html',
    ref: 'EBS Snapshots'
  },
  'BUDR-BAK-3': {
    url: 'https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/backups.html',
    ref: 'ElastiCache Backups'
  },
  'BUDR-BAK-4': {
    url: 'https://docs.aws.amazon.com/redshift/latest/mgmt/working-with-snapshots.html',
    ref: 'Redshift Snapshots'
  },
  'BUDR-BAK-5': {
    url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSSnapshots.html',
    ref: 'EBS Snapshot Scheduling'
  },
  'BUDR-DR-1': {
    url: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html',
    ref: 'RDS DR Strategy'
  },
  'BUDR-DR-2': {
    url: 'https://docs.aws.amazon.com/prescriptive-guidance/latest/backup-recovery/ec2-backup.html',
    ref: 'EC2 DR Strategy'
  }
};

// === REPORT RENDER FUNCTIONS ===

export function _awsConsoleUrl(type, id, region) {
  if (!id) return '';
  const r = region && region !== 'global' && region !== '-' ? region : 'us-east-1';
  const base = 'https://' + r + '.console.aws.amazon.com/';
  const map = {
    VPC: 'vpc/home?region=' + r + '#VpcDetails:VpcId=' + id,
    Subnet: 'vpc/home?region=' + r + '#subnets:SubnetId=' + id,
    EC2: 'ec2/home?region=' + r + '#InstanceDetails:instanceId=' + id,
    RDS: 'rds/home?region=' + r + '#database:id=' + id + ';is-cluster=false',
    ALB: 'ec2/home?region=' + r + '#LoadBalancers:search=' + encodeURIComponent(id),
    Lambda: 'lambda/home?region=' + r + '#/functions/' + encodeURIComponent(id),
    ECS: 'ecs/home?region=' + r + '#/services',
    ElastiCache: 'elasticache/home?region=' + r + '#/redis/' + encodeURIComponent(id),
    Redshift: 'redshiftv2/home?region=' + r + '#cluster-details?cluster=' + encodeURIComponent(id),
    'Security Group': 'vpc/home?region=' + r + '#SecurityGroup:groupId=' + id,
    SG: 'vpc/home?region=' + r + '#SecurityGroup:groupId=' + id,
    NACL: 'vpc/home?region=' + r + '#NetworkAclDetails:networkAclId=' + id,
    'Route Table': 'vpc/home?region=' + r + '#RouteTableDetails:RouteTableId=' + id,
    IGW: 'vpc/home?region=' + r + '#InternetGateway:internetGatewayId=' + id,
    'NAT Gateway': 'vpc/home?region=' + r + '#NatGateway:natGatewayId=' + id,
    'VPC Endpoint': 'vpc/home?region=' + r + '#Endpoints:vpcEndpointId=' + id,
    'EBS Volume': 'ec2/home?region=' + r + '#VolumeDetails:volumeId=' + id,
    'EBS Snapshot': 'ec2/home?region=' + r + '#SnapshotDetails:snapshotId=' + id,
    ENI: 'ec2/home?region=' + r + '#NetworkInterface:networkInterfaceId=' + id,
    'S3 Bucket': 's3/buckets/' + encodeURIComponent(id) + '?region=' + r,
    CloudFront: 'cloudfront/home#/distributions/' + id,
    'Route 53': 'route53/home#/hostedzone/' + id.replace(/^\/hostedzone\//, ''),
    WAF: 'wafv2/homev2/web-acl/' + id + '?region=' + r,
    VPN: 'vpc/home?region=' + r + '#VpnConnections:vpnConnectionId=' + id,
    'TGW Attachment':
      'vpc/home?region=' + r + '#TransitGatewayAttachments:transitGatewayAttachmentId=' + id,
    'Target Group': 'ec2/home?region=' + r + '#TargetGroups:search=' + encodeURIComponent(id),
    'VPC Peering': 'vpc/home?region=' + r + '#PeeringConnections:vpcPeeringConnectionId=' + id,
    CloudTrail: 'cloudtrailv2/home?region=' + r + '#/trails',
    GuardDuty: 'guardduty/home?region=' + r + '#/findings',
    'Flow Logs': 'vpc/home?region=' + r + '#FlowLogs:',
    'CloudWatch Alarms': 'cloudwatch/home?region=' + r + '#alarmsV2:',
    Config: 'config/home?region=' + r + '#/dashboard',
    'Security Hub': 'securityhub/home?region=' + r + '#/summary',
    'Access Analyzer': 'access-analyzer/home?region=' + r + '#/analyzers',
    'Config Rules': 'config/home?region=' + r + '#/rules',
    KMS: 'kms/home?region=' + r + '#/kms/keys',
    'Secrets Manager': 'secretsmanager/home?region=' + r + '#!/listSecrets/',
    'SSM Parameters': 'systems-manager/parameters?region=' + r,
    ECR: 'ecr/repositories?region=' + r,
    'CloudWatch Logs': 'cloudwatch/home?region=' + r + '#logsV2:log-groups',
    'API Gateway': 'apigateway/main/apis?region=' + r,
    SNS: 'sns/v3/home?region=' + r + '#/topics',
    SQS: 'sqs/v3/home?region=' + r + '#/queues'
  };
  const path = map[type];
  if (!path) return '';
  return base + path;
}

export function _rptLink(type, id, region, text) {
  const url = _awsConsoleUrl(type, id, region);
  if (!url) return esc(text || id || '');
  return (
    '<a href="' +
    esc(url) +
    '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline dotted;text-underline-offset:2px" title="Open in AWS Console">' +
    esc(text || id) +
    '</a>'
  );
}

export function _rptCSS() {
  const lt = document.documentElement.dataset.theme === 'light';
  const bg = lt ? '#f1f5f9' : '#0f172a';
  const card = lt ? '#ffffff' : '#1e293b';
  const hd = lt ? '#0f172a' : '#f8fafc';
  const tx = lt ? '#1e293b' : '#e2e8f0';
  const mt = lt ? '#475569' : '#94a3b8';
  const dm = lt ? '#64748b' : '#64748b';
  const bd = lt ? '#cbd5e1' : '#334155';
  const link = lt ? '#2563eb' : '#60a5fa';
  const sub = lt ? '#cbd5e1' : '#cbd5e1';
  const evenRow = lt ? 'rgba(0,0,0,.03)' : 'rgba(30,41,59,.5)';
  const codeBg = lt ? '#f8fafc' : '#0f172a';
  return [
    '.rpt-preview-content{margin:0;padding:24px 40px;background:' + bg + ';color:' + tx + ';',
    'font-family:"Segoe UI",system-ui,sans-serif;line-height:1.6}',
    '@media print{body{background:#fff;color:#1e293b}',
    '.rpt-header{background:#1e293b!important;color:#fff!important}',
    'table th{background:#334155!important;color:#fff!important}',
    '.stat-box{border-color:#cbd5e1!important}}',
    '.rpt-header{background:' + card + ';padding:32px;border-radius:8px;margin-bottom:32px}',
    '.rpt-header h1{margin:0 0 8px;font-size:28px;color:' + hd + '}',
    '.rpt-header .subtitle{color:' + mt + ';font-size:14px}',
    '.rpt-logo{margin-bottom:16px}',
    '.rpt-logo img{max-height:60px;max-width:200px;object-fit:contain}',
    '.rpt-toc{background:' + card + ';padding:20px 28px;border-radius:8px;margin-bottom:32px}',
    '.rpt-toc h2{margin:0 0 12px;font-size:18px;color:' + hd + '}',
    '.rpt-toc a{color:' +
      link +
      ';text-decoration:none;display:block;padding:4px 0;font-size:14px}',
    '.rpt-toc a:hover{text-decoration:underline}',
    '.rpt-section{margin-bottom:40px}',
    '.rpt-section h2{font-size:22px;color:' +
      hd +
      ';border-bottom:2px solid ' +
      bd +
      ';padding-bottom:8px;margin-bottom:16px}',
    '.rpt-section h3{font-size:16px;color:' + sub + ';margin:20px 0 10px}',
    '.rpt-section:not(:first-child){page-break-before:always}',
    'table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px}',
    'th{background:' + card + ';color:' + tx + ';text-align:left;padding:8px 10px;font-weight:600}',
    'td{padding:8px 10px;border-bottom:1px solid ' + bd + '}',
    'tr:nth-child(even){background:' + evenRow + '}',
    '.sev-badge{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700}',
    '.sev-CRITICAL{background:#dc2626;color:#fff}',
    '.sev-HIGH{background:#ea580c;color:#fff}',
    '.sev-MEDIUM{background:#d97706;color:#fff}',
    '.sev-LOW{background:#2563eb;color:#fff}',
    '.tier-protected{color:#10b981;border-left:3px solid #10b981;padding-left:6px}',
    '.tier-partial{color:#f59e0b;border-left:3px solid #f59e0b;padding-left:6px}',
    '.tier-at_risk{color:#ef4444;border-left:3px solid #ef4444;padding-left:6px}',
    '.stat-grid{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}',
    '.stat-box{background:' + card + ';border-radius:8px;padding:16px;min-width:120px;',
    'text-align:center;border:2px solid ' + bd + '}',
    '.stat-box .val{font-size:28px;font-weight:700;display:block}',
    '.stat-box .lbl{font-size:12px;color:' + mt + ';margin-top:4px;display:block}',
    '.rpt-import-notice{background:' +
      card +
      ';border:1px solid ' +
      bd +
      ';border-radius:6px;padding:8px 12px;font-size:11px;color:' +
      mt +
      ';margin-bottom:12px}',
    '.code-block{background:' + codeBg + ';border:1px solid ' + bd + ';border-radius:6px;',
    'padding:16px;font-family:"Fira Code",monospace;font-size:12px;',
    'white-space:pre-wrap;margin:8px 0;overflow-x:auto}',
    '.rpt-footer-bar{margin-top:40px;padding:16px;text-align:center;',
    'font-size:12px;color:' + dm + ';border-top:1px solid ' + bd + '}',
    '.diagram-img{max-width:100%;height:auto;border-radius:8px;margin:16px 0}',
    '.rpt-kv-grid{display:flex;flex-wrap:wrap;gap:16px;margin:16px 0}',
    '.rpt-kv{display:flex;flex-direction:column;min-width:130px;background:' +
      card +
      ';border:1px solid ' +
      bd +
      ';border-radius:8px;padding:12px 16px}',
    '.rpt-kv-label{font-size:12px;color:' + mt + ';margin-bottom:4px}',
    '.rpt-kv-val{font-size:24px;font-weight:700}'
  ].join('\n');
}

export function _rptInteractiveCSS() {
  const lt = document.documentElement.dataset.theme === 'light';
  const deepBg = lt ? '#f1f5f9' : '#0b1120';
  const inputBg = lt ? '#ffffff' : '#0a0e17';
  const cardBg = lt ? '#ffffff' : '#1e293b';
  const bd = lt ? '#cbd5e1' : '#1e2d4a';
  const bdHeavy = lt ? '#94a3b8' : '#334155';
  const tx = lt ? '#1e293b' : '#e2e8f0';
  const mt = lt ? '#475569' : '#94a3b8';
  const dm = lt ? '#64748b' : '#64748b';
  const link = lt ? '#2563eb' : '#60a5fa';
  const linkHover = lt ? '#1d4ed8' : '#93c5fd';
  const linkPale = lt ? '#bfdbfe' : '#93c5fd';
  const linkBd = lt ? '#93c5fd' : '#1e3a5f';
  const stickyBg = lt ? '#f1f5f9' : '#0f172a';
  const sub = lt ? '#475569' : '#cbd5e1';
  const pillHover = lt ? 'rgba(0,0,0,.06)' : 'rgba(30,41,59,.5)';
  const btnShadow = lt ? 'rgba(0,0,0,.1)' : 'rgba(0,0,0,.3)';
  const btnShadowHover = lt ? 'rgba(0,0,0,.15)' : 'rgba(0,0,0,.4)';
  const detailBg = lt ? '#f8fafc' : '#0b1120';
  const detailBd = lt ? '#e2e8f0' : '#0f172a';
  const resLink = lt ? '#0891b2' : '#67e8f9';
  const resLinkHover = lt ? '#06b6d4' : '#a5f3fc';
  const resLinkBd = lt ? 'rgba(8,145,178,.3)' : 'rgba(103,232,249,.3)';
  const pillCritActive = lt ? '#fecaca' : '#991b1b';
  const pillHighActive = lt ? '#fed7aa' : '#9a3412';
  const pillMedActive = lt ? '#fde68a' : '#92400e';
  const pillLowActive = lt ? '#bfdbfe' : '#1e3a5f';
  const pillProtActive = lt ? '#a7f3d0' : '#064e3b';
  const pillPartActive = lt ? '#fde68a' : '#78350f';
  const pillRiskActive = lt ? '#fecaca' : '#7f1d1d';
  const pillHotActive = lt ? '#fecaca' : '#7f1d1d';
  const pillWarmActive = lt ? '#fde68a' : '#78350f';
  const pillPilotActive = lt ? '#c7d2fe' : '#312e81';
  const pillColdActive = lt ? '#e2e8f0' : '#1e293b';
  const stratHotTx = lt ? '#dc2626' : '#f87171';
  const stratWarmTx = lt ? '#d97706' : '#fbbf24';
  const stratPilotTx = lt ? '#4f46e5' : '#a5b4fc';
  const stratColdTx = lt ? '#475569' : '#94a3b8';
  const pillDisabledTx = lt ? '#cbd5e1' : '#334155';
  return [
    '/* === Interactive report controls === */',
    '.rpt-jump-nav{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;padding:10px 14px;background:' +
      deepBg +
      ';border:1px solid ' +
      bd +
      ';border-radius:8px}',
    '.rpt-jump-link{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;color:' +
      link +
      ';text-decoration:none;border:1px solid ' +
      linkBd +
      ';background:rgba(37,99,235,.08);transition:all .15s;white-space:nowrap;letter-spacing:.2px}',
    '.rpt-jump-link:hover{background:rgba(37,99,235,.18);color:' +
      linkHover +
      ';border-color:#2563eb}',
    '.rpt-jump-link .rpt-jump-ct{font-size:10px;font-weight:700;color:' +
      (lt ? '#1e40af' : '#93c5fd') +
      ';background:rgba(37,99,235,' +
      (lt ? '.15' : '.2') +
      ');padding:2px 7px;border-radius:10px;min-width:20px;text-align:center;transition:all .15s}',
    '.rpt-jump-link:hover .rpt-jump-ct{background:rgba(37,99,235,.35);color:#bfdbfe}',
    '.rpt-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 12px;margin-bottom:4px;background:' +
      deepBg +
      ';border:1px solid ' +
      bd +
      ';border-radius:8px}',
    '.rpt-toolbar input[type="text"]{background:' +
      inputBg +
      ';color:' +
      tx +
      ';border:1px solid ' +
      bd +
      ";border-radius:6px;padding:5px 10px 5px 28px;font-size:12px;width:180px;outline:none;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='%2364748b' viewBox='0 0 24 24'%3E%3Cpath d='M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:8px center}",
    '.rpt-toolbar input[type="text"]:focus{border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.15)}',
    '.rpt-toolbar input[type="text"]::placeholder{color:' + dm + '}',
    '.rpt-pill-sep{width:1px;height:20px;background:' + bd + ';margin:0 2px;flex-shrink:0}',
    '.rpt-pill{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid ' +
      bd +
      ';color:' +
      dm +
      ';background:transparent;transition:all .15s;user-select:none;letter-spacing:.3px}',
    '.rpt-pill:hover{border-color:' + dm + ';color:' + mt + ';background:' + pillHover + '}',
    '.rpt-pill.active{color:' + (lt ? '#1e293b' : '#fff') + '}',
    '.rpt-pill-ct{font-size:10px;opacity:.7;margin-left:3px;font-weight:400}',
    '.rpt-pill-ct:empty{display:none}',
    '.rpt-pill-crit{border-color:rgba(220,38,38,.25);color:' + (lt ? '#dc2626' : '#f87171') + '}',
    '.rpt-pill-crit:hover{background:rgba(220,38,38,.1);border-color:rgba(220,38,38,.4)}',
    '.rpt-pill-crit.active{background:' + pillCritActive + ';border-color:#dc2626}',
    '.rpt-pill-high{border-color:rgba(234,88,12,.25);color:' + (lt ? '#ea580c' : '#fb923c') + '}',
    '.rpt-pill-high:hover{background:rgba(234,88,12,.1);border-color:rgba(234,88,12,.4)}',
    '.rpt-pill-high.active{background:' + pillHighActive + ';border-color:#ea580c}',
    '.rpt-pill-med{border-color:rgba(217,119,6,.25);color:' + (lt ? '#d97706' : '#fbbf24') + '}',
    '.rpt-pill-med:hover{background:rgba(217,119,6,.1);border-color:rgba(217,119,6,.4)}',
    '.rpt-pill-med.active{background:' + pillMedActive + ';border-color:#d97706}',
    '.rpt-pill-low{border-color:rgba(37,99,235,.25);color:' + link + '}',
    '.rpt-pill-low:hover{background:rgba(37,99,235,.1);border-color:rgba(37,99,235,.4)}',
    '.rpt-pill-low.active{background:' + pillLowActive + ';border-color:#2563eb}',
    '.rpt-pill-protected{border-color:rgba(16,185,129,.25);color:' +
      (lt ? '#059669' : '#34d399') +
      '}',
    '.rpt-pill-protected:hover{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.4)}',
    '.rpt-pill-protected.active{background:' + pillProtActive + ';border-color:#10b981}',
    '.rpt-pill-partial{border-color:rgba(245,158,11,.25);color:' +
      (lt ? '#d97706' : '#fbbf24') +
      '}',
    '.rpt-pill-partial:hover{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.4)}',
    '.rpt-pill-partial.active{background:' + pillPartActive + ';border-color:#f59e0b}',
    '.rpt-pill-atrisk{border-color:rgba(239,68,68,.25);color:' + (lt ? '#dc2626' : '#f87171') + '}',
    '.rpt-pill-atrisk:hover{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.4)}',
    '.rpt-pill-atrisk.active{background:' + pillRiskActive + ';border-color:#ef4444}',
    '.rpt-pill-hot{border-color:rgba(239,68,68,.25);color:' + (lt ? '#dc2626' : '#f87171') + '}',
    '.rpt-pill-hot:hover{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.4)}',
    '.rpt-pill-hot.active{background:' + pillHotActive + ';border-color:#ef4444}',
    '.rpt-pill-warm{border-color:rgba(245,158,11,.25);color:' + (lt ? '#d97706' : '#fbbf24') + '}',
    '.rpt-pill-warm:hover{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.4)}',
    '.rpt-pill-warm.active{background:' + pillWarmActive + ';border-color:#f59e0b}',
    '.rpt-pill-pilot{border-color:rgba(99,102,241,.25);color:' + (lt ? '#4f46e5' : '#a5b4fc') + '}',
    '.rpt-pill-pilot:hover{background:rgba(99,102,241,.1);border-color:rgba(99,102,241,.4)}',
    '.rpt-pill-pilot.active{background:' + pillPilotActive + ';border-color:#6366f1}',
    '.rpt-pill-cold{border-color:rgba(100,116,139,.25);color:' + mt + '}',
    '.rpt-pill-cold:hover{background:rgba(100,116,139,.1);border-color:rgba(100,116,139,.4)}',
    '.rpt-pill-cold.active{background:' + pillColdActive + ';border-color:#64748b}',
    '.strategy-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.5px;text-transform:uppercase}',
    '.strategy-hot{background:rgba(239,68,68,.15);color:' +
      stratHotTx +
      ';border:1px solid rgba(239,68,68,.3)}',
    '.strategy-warm{background:rgba(245,158,11,.15);color:' +
      stratWarmTx +
      ';border:1px solid rgba(245,158,11,.3)}',
    '.strategy-pilot{background:rgba(99,102,241,.15);color:' +
      stratPilotTx +
      ';border:1px solid rgba(99,102,241,.3)}',
    '.strategy-cold{background:rgba(100,116,139,.15);color:' +
      stratColdTx +
      ';border:1px solid rgba(100,116,139,.3)}',
    '.rpt-res-link{color:' +
      resLink +
      ';text-decoration:none;border-bottom:1px dashed ' +
      resLinkBd +
      ';transition:all .15s}',
    '.rpt-res-link:hover{color:' + resLinkHover + ';border-bottom-color:' + resLink + '}',
    '.rpt-row-count{font-size:10px;color:' +
      dm +
      ';margin-left:auto;white-space:nowrap;font-weight:500;letter-spacing:.3px}',
    '.rpt-clear{font-size:11px;color:' +
      dm +
      ';cursor:pointer;border:1px solid ' +
      bd +
      ';background:transparent;padding:4px 10px;border-radius:6px;transition:all .15s;font-weight:500}',
    '.rpt-clear:hover{color:' + mt + ';border-color:' + dm + ';background:' + pillHover + '}',
    'table thead.rpt-sticky{position:sticky;top:0;z-index:2}',
    'table thead.rpt-sticky th{background:' + stickyBg + ';border-bottom:2px solid ' + bd + '}',
    '.rpt-section-toggle{cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px}',
    '.rpt-section-toggle::before{content:"";display:inline-block;width:8px;height:8px;border-right:2px solid ' +
      dm +
      ';border-bottom:2px solid ' +
      dm +
      ';transform:rotate(45deg);transition:transform .2s;flex-shrink:0}',
    '.rpt-section-toggle.collapsed::before{transform:rotate(-45deg)}',
    '.rpt-section-body{transition:max-height .3s ease;overflow:hidden}',
    '.rpt-section-body.collapsed{max-height:0!important;overflow:hidden}',
    '.rpt-section h3{font-size:15px;color:' +
      sub +
      ';margin:24px 0 8px;padding-bottom:6px;border-bottom:1px solid ' +
      bd +
      '}',
    '#rpt-back-top{position:fixed;bottom:24px;right:24px;width:36px;height:36px;border-radius:8px;background:' +
      cardBg +
      ';border:1px solid ' +
      bdHeavy +
      ';color:' +
      mt +
      ';font-size:16px;cursor:pointer;display:none;align-items:center;justify-content:center;z-index:100;transition:all .2s;box-shadow:0 4px 12px ' +
      btnShadow +
      '}',
    '#rpt-back-top:hover{background:' +
      bdHeavy +
      ';color:' +
      tx +
      ';transform:translateY(-2px);box-shadow:0 6px 16px ' +
      btnShadowHover +
      '}',
    '.rpt-pagination{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 0;font-size:12px;color:' +
      mt +
      '}',
    '.rpt-page-btn{padding:4px 10px;border-radius:5px;border:1px solid ' +
      bd +
      ';background:transparent;color:' +
      link +
      ';cursor:pointer;font-size:11px;font-weight:500;transition:all .15s}',
    '.rpt-page-btn:hover:not(:disabled){background:rgba(37,99,235,.15);border-color:#2563eb}',
    '.rpt-page-btn:disabled{color:' + pillDisabledTx + ';border-color:' + bd + ';cursor:default}',
    '.rpt-page-info{color:' + dm + ';font-size:11px;min-width:100px;text-align:center}',
    '.rpt-per-page{background:' +
      inputBg +
      ';color:' +
      mt +
      ';border:1px solid ' +
      bd +
      ';border-radius:5px;padding:3px 6px;font-size:11px;outline:none}',
    '.rpt-per-page:focus{border-color:#3b82f6}',
    'th.rpt-sortable{cursor:pointer;user-select:none;position:relative;padding-right:18px!important;white-space:nowrap}',
    'th.rpt-sortable:hover{color:' + linkHover + '}',
    'th.rpt-sortable::after{content:"\\2195";position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:10px;color:' +
      dm +
      ';transition:color .15s}',
    'th.rpt-sort-asc::after{content:"\\25B2";color:' + link + '}',
    'th.rpt-sort-desc::after{content:"\\25BC";color:' + link + '}',
    '.rpt-ctrl-row{cursor:pointer;transition:background .1s}',
    '.rpt-ctrl-row:hover{background:rgba(37,99,235,.08)!important}',
    '.rpt-ctrl-toggle{display:inline-block;width:16px;font-size:10px;color:' +
      dm +
      ';transition:transform .15s}',
    '.rpt-ctrl-row.expanded .rpt-ctrl-toggle{transform:rotate(90deg);color:' + link + '}',
    '.rpt-ctrl-detail{display:none}',
    '.rpt-ctrl-detail.show{display:table-row}',
    '.rpt-ctrl-detail>td{padding:0!important}',
    '.rpt-detail-table{width:100%;font-size:12px;margin:0;background:' +
      detailBg +
      ';border-collapse:collapse}',
    '.rpt-detail-table td{padding:5px 10px!important;border-bottom:1px solid ' +
      detailBd +
      ';color:' +
      mt +
      ';font-size:11px}',
    '.rpt-detail-table tr:last-child td{border-bottom:none}',
    '.rpt-expand-all{font-size:11px;color:' +
      dm +
      ';cursor:pointer;border:1px solid ' +
      bd +
      ';background:transparent;padding:4px 10px;border-radius:6px;transition:all .15s;font-weight:500;margin:4px 0 8px;display:inline-block}',
    '.rpt-expand-all:hover{color:' + mt + ';border-color:' + dm + '}',
    '@media print{.rpt-toolbar,.rpt-clear,.rpt-jump-nav,.rpt-pagination,#rpt-back-top{display:none!important}',
    '.rpt-section-body.collapsed{max-height:none!important;overflow:visible!important}',
    'table thead.rpt-sticky{position:static}',
    '.rpt-ctrl-detail{display:table-row!important}',
    'tr[style*="display: none"]{display:table-row!important}}'
  ].join('\n');
}

export function _rptInteractiveJS() {
  return (
    '<scr' +
    'ipt>\n' +
    '(function(){\n' +
    '  var SEV_ORD={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};\n' +
    '  var TIER_ORD={at_risk:0,partial:1,protected:2};\n' +
    '  var STRAT_ORD={hot:0,warm:1,pilot:2,cold:3};\n' +
    '\n' +
    '  /* ── Pagination ── */\n' +
    '  function rptPaginate(tableId){\n' +
    '    var wrap=document.getElementById(tableId);\n' +
    '    if(!wrap)return;\n' +
    '    var table=wrap.querySelector("table");\n' +
    '    if(!table)return;\n' +
    '    var tbody=table.querySelector(":scope > tbody");\n' +
    '    if(!tbody)return;\n' +
    '    var allRows=Array.prototype.slice.call(tbody.querySelectorAll(":scope > tr:not(.rpt-ctrl-detail)"));\n' +
    '    var visible=allRows.filter(function(r){return r.dataset.filtered!=="0"});\n' +
    '    var perPage=parseInt(wrap.dataset.perPage)||50;\n' +
    '    if(perPage<=0)perPage=visible.length||1;\n' +
    '    var totalPages=Math.max(1,Math.ceil(visible.length/perPage));\n' +
    '    var page=Math.min(parseInt(wrap.dataset.page)||1,totalPages);\n' +
    '    wrap.dataset.page=page;\n' +
    '    var start=(page-1)*perPage,end=start+perPage;\n' +
    '    allRows.forEach(function(r){r.style.display="none"});\n' +
    '    visible.forEach(function(r,i){r.style.display=(i>=start&&i<end)?"":"none"});\n' +
    '    /* hide detail rows for non-visible control rows */\n' +
    '    table.querySelectorAll(".rpt-ctrl-detail").forEach(function(d){var p=d.previousElementSibling;d.style.display=(p&&p.style.display!==""&&p.classList.contains("expanded"))?"table-row":"none"});\n' +
    '    var bar=wrap.querySelector(".rpt-pagination");\n' +
    '    if(!bar)return;\n' +
    '    bar.querySelector(".rpt-page-info").textContent="Page "+page+" of "+totalPages+" ("+visible.length+" rows)";\n' +
    '    bar.querySelector(".rpt-page-prev").disabled=(page<=1);\n' +
    '    bar.querySelector(".rpt-page-next").disabled=(page>=totalPages);\n' +
    '  }\n' +
    '\n' +
    '  /* ── Filter ── */\n' +
    '  function rptFilter(tableId){\n' +
    '    var wrap=document.getElementById(tableId);\n' +
    '    if(!wrap)return;\n' +
    '    var pills=wrap.querySelectorAll(".rpt-pill");\n' +
    '    var active={};\n' +
    '    pills.forEach(function(p){\n' +
    '      if(!p.classList.contains("active"))return;\n' +
    '      var attr=p.dataset.attr;\n' +
    '      if(!active[attr])active[attr]=[];\n' +
    '      active[attr].push(p.dataset.val.toUpperCase());\n' +
    '    });\n' +
    '    var searchInput=wrap.querySelector(".rpt-search");\n' +
    '    var query=searchInput?searchInput.value.toLowerCase():"";\n' +
    '    var table=wrap.querySelector("table");\n' +
    '    if(!table)return;\n' +
    '    var tbody=table.querySelector(":scope > tbody");\n' +
    '    if(!tbody)return;\n' +
    '    var rows=tbody.querySelectorAll(":scope > tr:not(.rpt-ctrl-detail)");\n' +
    '    var shown=0,attrCounts={},total=rows.length;\n' +
    '    rows.forEach(function(tr){\n' +
    '      var vis=true;\n' +
    '      Object.keys(active).forEach(function(attr){\n' +
    '        var raw=(tr.dataset[attr]||"").toUpperCase();\n' +
    '        if(attr==="account"&&raw.indexOf("|")!==-1){\n' +
    '          var parts=raw.split("|");\n' +
    '          var match=parts.some(function(p){return active[attr].indexOf(p)!==-1});\n' +
    '          if(!match)vis=false;\n' +
    '        }else{\n' +
    '          if(active[attr].indexOf(raw)===-1)vis=false;\n' +
    '        }\n' +
    '      });\n' +
    '      if(vis&&query){\n' +
    '        if(tr.textContent.toLowerCase().indexOf(query)===-1)vis=false;\n' +
    '      }\n' +
    '      tr.dataset.filtered=vis?"1":"0";\n' +
    '      if(vis)shown++;\n' +
    '      ["sev","tier","fw","strategy","account"].forEach(function(attr){\n' +
    '        var v=(tr.dataset[attr]||"").toUpperCase();\n' +
    '        if(attr==="account"&&v.indexOf("|")!==-1){\n' +
    '          v.split("|").forEach(function(p){if(p){if(!attrCounts[p])attrCounts[p]=0;if(vis)attrCounts[p]++}});\n' +
    '        }else{\n' +
    '          if(v){if(!attrCounts[v])attrCounts[v]=0;if(vis)attrCounts[v]++}\n' +
    '        }\n' +
    '      });\n' +
    '    });\n' +
    '    var badge=wrap.querySelector(".rpt-row-count");\n' +
    '    if(badge)badge.textContent=shown+" of "+total;\n' +
    '    /* update pill counts */\n' +
    '    pills.forEach(function(p){\n' +
    '      var ct=p.querySelector(".rpt-pill-ct");\n' +
    '      if(!ct)return;\n' +
    '      var val=p.dataset.val.toUpperCase();\n' +
    '      ct.textContent=attrCounts[val]||0;\n' +
    '    });\n' +
    '    wrap.dataset.page="1";\n' +
    '    rptPaginate(tableId);\n' +
    '  }\n' +
    '\n' +
    '  /* ── Sort ── */\n' +
    '  function rptSort(th){\n' +
    '    var table=th.closest("table");\n' +
    '    if(!table)return;\n' +
    '    var idx=Array.prototype.indexOf.call(th.parentElement.children,th);\n' +
    '    var type=th.dataset.sortType||"text";\n' +
    '    var dir=th.classList.contains("rpt-sort-asc")?"desc":th.classList.contains("rpt-sort-desc")?"none":"asc";\n' +
    '    th.parentElement.querySelectorAll("th").forEach(function(h){h.classList.remove("rpt-sort-asc","rpt-sort-desc")});\n' +
    '    if(dir!=="none")th.classList.add("rpt-sort-"+dir);\n' +
    '    var tbody=table.querySelector("tbody");\n' +
    '    var rows=Array.prototype.slice.call(tbody.querySelectorAll(":scope > tr:not(.rpt-ctrl-detail)"));\n' +
    '    if(dir==="none")return;\n' +
    '    rows.sort(function(a,b){\n' +
    '      var av=a.children[idx]?a.children[idx].textContent.trim():"";\n' +
    '      var bv=b.children[idx]?b.children[idx].textContent.trim():"";\n' +
    '      var cmp=0;\n' +
    '      if(type==="severity")cmp=(SEV_ORD[av]===undefined?9:SEV_ORD[av])-(SEV_ORD[bv]===undefined?9:SEV_ORD[bv]);\n' +
    '      else if(type==="tier")cmp=(TIER_ORD[av]===undefined?9:TIER_ORD[av])-(TIER_ORD[bv]===undefined?9:TIER_ORD[bv]);\n' +
    '      else if(type==="strategy")cmp=(STRAT_ORD[av.toLowerCase()]===undefined?9:STRAT_ORD[av.toLowerCase()])-(STRAT_ORD[bv.toLowerCase()]===undefined?9:STRAT_ORD[bv.toLowerCase()]);\n' +
    '      else cmp=av.localeCompare(bv);\n' +
    '      return dir==="desc"?-cmp:cmp;\n' +
    '    });\n' +
    '    var pairs=rows.map(function(r){var d=r.nextElementSibling;return{row:r,detail:(d&&d.classList.contains("rpt-ctrl-detail"))?d:null}});\n' +
    '    pairs.forEach(function(p){tbody.appendChild(p.row);if(p.detail)tbody.appendChild(p.detail)});\n' +
    '    var wrap=th.closest(".rpt-table-wrap");\n' +
    '    if(wrap){wrap.dataset.page="1";rptPaginate(wrap.id)}\n' +
    '  }\n' +
    '\n' +
    '  /* ── Pill click ── */\n' +
    '  document.addEventListener("click",function(e){\n' +
    '    var pill=e.target.closest(".rpt-pill");\n' +
    '    if(!pill)return;\n' +
    '    pill.classList.toggle("active");\n' +
    '    var wrap=pill.closest(".rpt-table-wrap");\n' +
    '    if(wrap)rptFilter(wrap.id);\n' +
    '  });\n' +
    '\n' +
    '  /* ── Clear filters ── */\n' +
    '  document.addEventListener("click",function(e){\n' +
    '    if(!e.target.classList.contains("rpt-clear"))return;\n' +
    '    var wrap=e.target.closest(".rpt-table-wrap");\n' +
    '    if(!wrap)return;\n' +
    '    wrap.querySelectorAll(".rpt-pill.active").forEach(function(p){p.classList.remove("active")});\n' +
    '    var si=wrap.querySelector(".rpt-search");\n' +
    '    if(si)si.value="";\n' +
    '    rptFilter(wrap.id);\n' +
    '  });\n' +
    '\n' +
    '  /* ── Sortable header click ── */\n' +
    '  document.addEventListener("click",function(e){\n' +
    '    var th=e.target.closest("th.rpt-sortable");\n' +
    '    if(!th)return;\n' +
    '    rptSort(th);\n' +
    '  });\n' +
    '\n' +
    '  /* ── Pagination click ── */\n' +
    '  document.addEventListener("click",function(e){\n' +
    '    var btn=e.target.closest(".rpt-page-prev,.rpt-page-next");\n' +
    '    if(!btn)return;\n' +
    '    var wrap=btn.closest(".rpt-table-wrap");\n' +
    '    if(!wrap)return;\n' +
    '    var page=parseInt(wrap.dataset.page)||1;\n' +
    '    wrap.dataset.page=btn.classList.contains("rpt-page-prev")?Math.max(1,page-1):page+1;\n' +
    '    rptPaginate(wrap.id);\n' +
    '  });\n' +
    '  document.addEventListener("change",function(e){\n' +
    '    if(!e.target.classList.contains("rpt-per-page"))return;\n' +
    '    var wrap=e.target.closest(".rpt-table-wrap");\n' +
    '    if(!wrap)return;\n' +
    '    wrap.dataset.perPage=e.target.value;\n' +
    '    wrap.dataset.page="1";\n' +
    '    rptPaginate(wrap.id);\n' +
    '  });\n' +
    '\n' +
    '  /* ── Group-by-control expand/collapse ── */\n' +
    '  document.addEventListener("click",function(e){\n' +
    '    var row=e.target.closest(".rpt-ctrl-row");\n' +
    '    if(!row)return;\n' +
    '    row.classList.toggle("expanded");\n' +
    '    var next=row.nextElementSibling;\n' +
    '    while(next&&next.classList.contains("rpt-ctrl-detail")){\n' +
    '      next.classList.toggle("show");\n' +
    '      next.style.display=next.classList.contains("show")?"table-row":"none";\n' +
    '      next=next.nextElementSibling;\n' +
    '    }\n' +
    '  });\n' +
    '  document.addEventListener("click",function(e){\n' +
    '    if(!e.target.classList.contains("rpt-expand-all"))return;\n' +
    '    var wrap=e.target.closest(".rpt-table-wrap");\n' +
    '    if(!wrap)return;\n' +
    '    var anyCollapsed=wrap.querySelector(".rpt-ctrl-row:not(.expanded)");\n' +
    '    var expand=!!anyCollapsed;\n' +
    '    wrap.querySelectorAll(".rpt-ctrl-row").forEach(function(r){r.classList.toggle("expanded",expand)});\n' +
    '    wrap.querySelectorAll(".rpt-ctrl-detail").forEach(function(d){d.classList.toggle("show",expand);d.style.display=expand?"table-row":"none"});\n' +
    '    e.target.textContent=expand?"Collapse All":"Expand All";\n' +
    '  });\n' +
    '\n' +
    '  /* ── Debounced search ── */\n' +
    '  var _searchTimer=0;\n' +
    '  document.addEventListener("input",function(e){\n' +
    '    if(!e.target.classList.contains("rpt-search"))return;\n' +
    '    clearTimeout(_searchTimer);\n' +
    '    var wrap=e.target.closest(".rpt-table-wrap");\n' +
    '    _searchTimer=setTimeout(function(){if(wrap)rptFilter(wrap.id)},300);\n' +
    '  });\n' +
    '\n' +
    '  /* ── Section collapse/expand ── */\n' +
    '  document.addEventListener("click",function(e){\n' +
    '    var tog=e.target.closest(".rpt-section-toggle");\n' +
    '    if(!tog)return;\n' +
    '    tog.classList.toggle("collapsed");\n' +
    '    var body=tog.parentElement.querySelector(".rpt-section-body");\n' +
    '    if(body)body.classList.toggle("collapsed");\n' +
    '  });\n' +
    '\n' +
    '  /* ── Back to top ── */\n' +
    '  var btn=document.getElementById("rpt-back-top");\n' +
    '  if(btn){\n' +
    '    window.addEventListener("scroll",function(){\n' +
    '      btn.style.display=window.scrollY>400?"flex":"none";\n' +
    '    });\n' +
    '    btn.addEventListener("click",function(){\n' +
    '      window.scrollTo({top:0,behavior:"smooth"});\n' +
    '    });\n' +
    '  }\n' +
    '\n' +
    '  /* ── Init pagination on all tables ── */\n' +
    '  document.querySelectorAll(".rpt-table-wrap").forEach(function(w){\n' +
    '    if(!w.dataset.perPage)w.dataset.perPage="50";\n' +
    '    w.dataset.page="1";\n' +
    '    rptFilter(w.id);\n' +
    '  });\n' +
    '})();\n' +
    '</' +
    'script>'
  );
}

export function _rptBuildToolbar(tableId, opts) {
  opts = opts || {};
  let h = '<div class="rpt-toolbar">';
  h += '<input type="text" class="rpt-search" placeholder="Search..." aria-label="Search table">';
  const hasPills =
    opts.severities || opts.frameworks || opts.tiers || opts.strategies || opts.accounts;
  if (hasPills) h += '<span class="rpt-pill-sep"></span>';
  if (opts.severities) {
    const sevs = [
      { val: 'CRITICAL', cls: 'rpt-pill-crit', label: 'Critical' },
      { val: 'HIGH', cls: 'rpt-pill-high', label: 'High' },
      { val: 'MEDIUM', cls: 'rpt-pill-med', label: 'Medium' },
      { val: 'LOW', cls: 'rpt-pill-low', label: 'Low' }
    ];
    sevs.forEach(function (s) {
      h +=
        '<span class="rpt-pill ' +
        s.cls +
        '" data-attr="sev" data-val="' +
        s.val +
        '">' +
        s.label +
        ' <span class="rpt-pill-ct"></span></span>';
    });
  }
  if (opts.frameworks) {
    if (opts.severities) h += '<span class="rpt-pill-sep"></span>';
    const fws = opts.frameworks;
    fws.forEach(function (fw) {
      h +=
        '<span class="rpt-pill" data-attr="fw" data-val="' + esc(fw) + '">' + esc(fw) + '</span>';
    });
  }
  if (opts.tiers) {
    const tiers = [
      { val: 'protected', cls: 'rpt-pill-protected', label: 'Protected' },
      { val: 'partial', cls: 'rpt-pill-partial', label: 'Partial' },
      { val: 'at_risk', cls: 'rpt-pill-atrisk', label: 'At Risk' }
    ];
    tiers.forEach(function (t) {
      h +=
        '<span class="rpt-pill ' +
        t.cls +
        '" data-attr="tier" data-val="' +
        t.val +
        '">' +
        t.label +
        ' <span class="rpt-pill-ct"></span></span>';
    });
  }
  if (opts.strategies) {
    if (opts.tiers || opts.severities) h += '<span class="rpt-pill-sep"></span>';
    const strats = [
      { val: 'hot', cls: 'rpt-pill-hot', label: 'Hot' },
      { val: 'warm', cls: 'rpt-pill-warm', label: 'Warm' },
      { val: 'pilot', cls: 'rpt-pill-pilot', label: 'Pilot Light' },
      { val: 'cold', cls: 'rpt-pill-cold', label: 'Cold' }
    ];
    strats.forEach(function (s) {
      h +=
        '<span class="rpt-pill ' +
        s.cls +
        '" data-attr="strategy" data-val="' +
        s.val +
        '">' +
        s.label +
        ' <span class="rpt-pill-ct"></span></span>';
    });
  }
  if (opts.accounts && opts.accounts.length > 1) {
    if (hasPills) h += '<span class="rpt-pill-sep"></span>';
    opts.accounts.forEach(function (a) {
      h +=
        '<span class="rpt-pill" data-attr="account" data-val="' +
        esc(a.id) +
        '">' +
        esc(a.label) +
        ' <span class="rpt-pill-ct"></span></span>';
    });
  }
  if (hasPills) h += '<span class="rpt-pill-sep"></span>';
  h += '<button class="rpt-clear" type="button">Clear</button>';
  h += '<span class="rpt-row-count"></span>';
  h += '</div>';
  h += '<div class="rpt-pagination">';
  h += '<button class="rpt-page-btn rpt-page-prev" title="Previous page">&lsaquo; Prev</button>';
  h += '<span class="rpt-page-info">Page 1 of 1</span>';
  h += '<button class="rpt-page-btn rpt-page-next" title="Next page">Next &rsaquo;</button>';
  h += '<select class="rpt-per-page" title="Rows per page">';
  h += '<option value="25">25</option><option value="50" selected>50</option>';
  h += '<option value="100">100</option><option value="0">All</option>';
  h += '</select>';
  h += '</div>';
  return h;
}

export function _rptGetAccountFilter() {
  const el = document.getElementById('rptAccountFilter');
  return el ? el.value : 'all';
}

export function _rptAccountLabel(accountId) {
  if (!accountId) return '';
  const ctx = window._loadedContexts.find(function (c) {
    return c.accountId === accountId;
  });
  if (ctx && ctx.accountLabel && ctx.accountLabel !== ctx.accountId) return ctx.accountLabel;
  if (accountId.length > 12) return accountId.slice(0, 4) + '\u2026' + accountId.slice(-4);
  return accountId;
}

export function _rptFilterByAccount(items, acctId) {
  if (!acctId || acctId === 'all') return items;
  const lbl = _rptAccountLabel(acctId);
  return items.filter(function (item) {
    const id = item._accountId || item.account || '';
    return id === acctId || id === lbl;
  });
}

export function _rptUniqueAccounts() {
  if (window._loadedContexts.length > 1) {
    return window._loadedContexts.map(function (c) {
      return { id: c.accountId, label: c.accountLabel || c.accountId };
    });
  }
  return [];
}

// Security note: innerHTML in report modules follows existing app-core.js pattern.
// All content is from parsed AWS API responses, escaped via esc().
export function _rptSecurityPosture(ctx, opts) {
  const c = ctx || window._rlCtx;
  if (!c)
    return '<section class="rpt-section" id="s-security-posture"><h2>Security Posture</h2><p>No data loaded.</p></section>';
  const acctFilter = typeof _rptGetAccountFilter === 'function' ? _rptGetAccountFilter() : 'all';
  function filt(arr) {
    return typeof _rptFilterByAccount === 'function'
      ? _rptFilterByAccount(arr || [], acctFilter)
      : arr || [];
  }
  const trails = filt(c.cloudtrailTrails);
  const gd = filt(c.guarddutyDetectors);
  const fl = c.flowLogs || [];
  const rec = filt(c.configRecorders);
  const rules = filt(c.configRules);
  const sh = filt(c.securityHubStds);
  const aa = filt(c.accessAnalyzers);
  const keys = filt(c.kmsKeys);
  const secs = filt(c.secrets);
  const ecr = filt(c.ecrRepos);
  const logs = c.logGroups || [];
  const apis = filt(c.apiGateways);
  const vpcs = c.vpcs || [];
  function st(ok) {
    return ok
      ? '<span style="color:#22c55e;font-weight:700">PASS</span>'
      : '<span style="color:#ef4444;font-weight:700">FAIL</span>';
  }
  function stp(ok, partial) {
    return ok
      ? '<span style="color:#22c55e;font-weight:700">PASS</span>'
      : partial
        ? '<span style="color:#eab308;font-weight:700">PARTIAL</span>'
        : '<span style="color:#ef4444;font-weight:700">FAIL</span>';
  }
  let h = '<section class="rpt-section" id="s-security-posture"><h2>Security Posture</h2>';
  h +=
    '<h3>Detection &amp; Monitoring</h3><table class="rpt-tbl"><thead><tr><th>Service</th><th>Status</th><th>Details</th></tr></thead><tbody>';
  const trailOk = trails.some(function (t) {
    return (
      t.IsMultiRegionTrail &&
      t.LogFileValidationEnabled &&
      t.KmsKeyId &&
      t.CloudWatchLogsLogGroupArn
    );
  });
  h +=
    '<tr><td>CloudTrail</td><td>' +
    stp(trailOk, trails.length > 0 && !trailOk) +
    '</td><td>' +
    esc(trails.length ? trails.length + ' trail(s)' : 'No trails') +
    '</td></tr>';
  const gdOk = gd.some(function (d) {
    return d.Status === 'ENABLED';
  });
  h +=
    '<tr><td>GuardDuty</td><td>' +
    stp(gdOk, gd.length > 0 && !gdOk) +
    '</td><td>' +
    esc(gd.length ? gd.length + ' detector(s)' : 'No detectors') +
    '</td></tr>';
  const flVpcs = new Set(
    fl
      .filter(function (f) {
        return f.ResourceId && f.ResourceId.startsWith('vpc-');
      })
      .map(function (f) {
        return f.ResourceId;
      })
  );
  const flCov = vpcs.length
    ? vpcs.filter(function (v) {
        return flVpcs.has(v.VpcId);
      }).length
    : 0;
  h +=
    '<tr><td>VPC Flow Logs</td><td>' +
    stp(vpcs.length > 0 && flCov === vpcs.length, flCov > 0) +
    '</td><td>' +
    esc(flCov + ' of ' + vpcs.length + ' VPCs') +
    '</td></tr>';
  h += '</tbody></table>';
  h +=
    '<h3>Configuration &amp; Compliance</h3><table class="rpt-tbl"><thead><tr><th>Service</th><th>Status</th><th>Details</th></tr></thead><tbody>';
  h +=
    '<tr><td>AWS Config</td><td>' +
    st(
      rec.some(function (r) {
        return (r.recordingGroup || {}).allSupported;
      })
    ) +
    '</td><td>' +
    esc(rec.length ? rec.length + ' recorder(s)' : 'No recorder') +
    '</td></tr>';
  h +=
    '<tr><td>Security Hub</td><td>' +
    st(sh.length > 0) +
    '</td><td>' +
    esc(sh.length ? sh.length + ' standard(s)' : 'Not enabled') +
    '</td></tr>';
  h +=
    '<tr><td>IAM Access Analyzer</td><td>' +
    st(
      aa.some(function (a) {
        return a.status === 'ACTIVE';
      })
    ) +
    '</td><td>' +
    esc(aa.length ? aa.length + ' analyzer(s)' : 'Not configured') +
    '</td></tr>';
  h +=
    '<tr><td>Config Rules</td><td>' +
    st(rules.length > 0) +
    '</td><td>' +
    esc(rules.length + ' rule(s)') +
    '</td></tr>';
  h += '</tbody></table>';
  h +=
    '<h3>Encryption &amp; Secrets</h3><table class="rpt-tbl"><thead><tr><th>Service</th><th>Status</th><th>Details</th></tr></thead><tbody>';
  const custKeys = keys.filter(function (k) {
    return k.KeyManager === 'CUSTOMER' && k.KeyState === 'Enabled';
  });
  const rotKeys = custKeys.filter(function (k) {
    return k.RotationEnabled;
  }).length;
  h +=
    '<tr><td>KMS Keys</td><td>' +
    stp(custKeys.length > 0 && rotKeys === custKeys.length, rotKeys > 0) +
    '</td><td>' +
    esc(rotKeys + ' of ' + custKeys.length + ' with rotation') +
    '</td></tr>';
  const secRot = secs.filter(function (s) {
    return s.RotationEnabled;
  }).length;
  h +=
    '<tr><td>Secrets Manager</td><td>' +
    stp(secs.length > 0 && secRot === secs.length, secRot > 0) +
    '</td><td>' +
    esc(secRot + ' of ' + secs.length + ' with rotation') +
    '</td></tr>';
  const ecrScan = ecr.filter(function (r) {
    return (r.imageScanningConfiguration || {}).scanOnPush;
  }).length;
  const ecrImm = ecr.filter(function (r) {
    return r.imageTagMutability === 'IMMUTABLE';
  }).length;
  h +=
    '<tr><td>ECR Repositories</td><td>' +
    stp(
      ecr.length > 0 && ecrScan === ecr.length && ecrImm === ecr.length,
      ecrScan > 0 || ecrImm > 0
    ) +
    '</td><td>' +
    esc(ecr.length + ' repo(s): ' + ecrScan + ' scan, ' + ecrImm + ' immutable') +
    '</td></tr>';
  const logRet = logs.filter(function (l) {
    return l.retentionInDays;
  }).length;
  h +=
    '<tr><td>Log Groups</td><td>' +
    stp(logs.length > 0 && logRet === logs.length, logRet > 0) +
    '</td><td>' +
    esc(logRet + ' of ' + logs.length + ' with retention') +
    '</td></tr>';
  h += '</tbody></table>';
  if (apis.length)
    h +=
      '<p style="color:var(--text-muted);font-size:12px">Integration: ' +
      esc(apis.length) +
      ' API Gateway(s)</p>';
  h += '</section>';
  return h;
}

export function _rptExecSummary(ctx, opts) {
  const c = window._rlCtx;
  if (!c && !window._importedReportData)
    return '<section class="rpt-section" id="s-exec-summary"><h2>Executive Summary</h2><p>No data loaded.</p></section>';
  if (!c && window._importedReportData) {
    let h = '<section class="rpt-section" id="s-exec-summary"><h2>Executive Summary</h2>';
    h +=
      '<p class="rpt-import-notice">Data imported from previous report' +
      (window._importedReportData.date ? ' (' + esc(window._importedReportData.date) + ')' : '') +
      '.</p>';
    const _acctF = _rptGetAccountFilter();
    const _efF = _rptFilterByAccount(window._complianceFindings || [], _acctF);
    const _ebF = _rptFilterByAccount(window._budrAssessments || [], _acctF);
    const _eiF = _rptFilterByAccount(window._inventoryData || [], _acctF);
    h += '<div class="stat-grid">';
    h +=
      '<div class="stat-box"><span class="val">' +
      _efF.length +
      '</span><span class="lbl">Findings</span></div>';
    h +=
      '<div class="stat-box"><span class="val">' +
      _ebF.length +
      '</span><span class="lbl">BUDR Assessments</span></div>';
    h +=
      '<div class="stat-box"><span class="val">' +
      _eiF.length +
      '</span><span class="lbl">Inventory Resources</span></div>';
    h += '</div>';
    h += _rptExecCompliance();
    h += _rptExecBUDR();
    h += '</section>';
    return h;
  }
  const counts = [
    { key: 'vpcs', label: 'VPCs' },
    { key: 'subnets', label: 'Subnets' },
    { key: 'instances', label: 'EC2' },
    { key: 'rdsInstances', label: 'RDS' },
    { key: 'albs', label: 'ALBs' },
    { key: 'ecsServices', label: 'ECS' },
    { key: 'lambdaFns', label: 'Lambda' },
    { key: 'sgs', label: 'Sec Groups' }
  ];
  let h = '<section class="rpt-section" id="s-exec-summary"><h2>Executive Summary</h2>';
  h += '<div class="stat-grid">';
  counts.forEach(function (item) {
    const v = (c[item.key] || []).length;
    h += '<div class="stat-box"><span class="val">' + v + '</span>';
    h += '<span class="lbl">' + esc(item.label) + '</span></div>';
  });
  h += '</div>';
  h += _rptExecCompliance();
  h += _rptExecBUDR();
  h += '</section>';
  return h;
}

export function _rptExecCompliance() {
  const f = _rptFilterByAccount(window._complianceFindings || [], _rptGetAccountFilter());
  if (!f || !f.length) return '';
  const sevs = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  f.forEach(function (x) {
    sevs[x.severity] = (sevs[x.severity] || 0) + 1;
  });
  let h = '<h3>Compliance Posture</h3><p>' + f.length + ' total findings: ';
  const parts = [];
  ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].forEach(function (s) {
    if (sevs[s] > 0)
      parts.push('<span class="sev-badge sev-' + s + '">' + sevs[s] + ' ' + s + '</span>');
  });
  h += parts.join(' ') + '</p>';
  return h;
}

export function _rptExecBUDR() {
  const filteredBudr = _rptFilterByAccount(window._budrAssessments || [], _rptGetAccountFilter());
  if (!filteredBudr.length) return '';
  const counts = { protected: 0, partial: 0, at_risk: 0 };
  filteredBudr.forEach(function (a) {
    if (a.profile && counts[a.profile.tier] !== undefined) counts[a.profile.tier]++;
  });
  let h = '<h3>BUDR Posture</h3><div class="stat-grid">';
  const tiers = [
    { k: 'protected', label: 'Protected', cls: 'tier-protected', color: '#10b981' },
    { k: 'partial', label: 'Partial', cls: 'tier-partial', color: '#f59e0b' },
    { k: 'at_risk', label: 'At Risk', cls: 'tier-at_risk', color: '#ef4444' }
  ];
  tiers.forEach(function (t) {
    const v = counts[t.k] || 0;
    h += '<div class="stat-box" style="border-color:' + t.color + '">';
    h += '<span class="val" style="color:' + t.color + '">' + v + '</span>';
    h += '<span class="lbl">' + esc(t.label) + '</span></div>';
  });
  h += '</div>';
  return h;
}

export function _rptAppSummary(ctx, opts) {
  if (!window._appRegistry.length) return '';
  const tierPri = { critical: 1, high: 2, medium: 3, low: 4 };
  let h = '<section class="rpt-section" id="s-app-summary"><h2>Application Summary</h2>';
  h +=
    '<p>' +
    window._appRegistry.length +
    ' applications identified across ' +
    window._classificationData.length +
    ' resources.</p>';
  const appRows = [];
  window._appRegistry.forEach(function (app) {
    const matched = window._matchAppResources(app);
    let bestTier = 'low';
    matched.forEach(function (r) {
      if ((tierPri[r.tier] || 99) < (tierPri[bestTier] || 99)) bestTier = r.tier;
    });
    const tier = app.tier || bestTier;
    appRows.push({ name: app.name, type: app.type || '\u2014', tier: tier, matched: matched });
  });
  appRows.sort(function (a, b) {
    return (tierPri[a.tier] || 99) - (tierPri[b.tier] || 99);
  });
  const tierColors = { critical: '#ef4444', high: '#f59e0b', medium: '#22d3ee', low: '#64748b' };
  h += '<table class="rpt-tbl" style="width:100%;border-collapse:collapse;margin:12px 0 20px">';
  h +=
    '<thead><tr><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #334155">Application</th>';
  h += '<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #334155">Type</th>';
  h +=
    '<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #334155">Criticality</th>';
  h +=
    '<th style="text-align:center;padding:6px 10px;border-bottom:2px solid #334155">Resources</th>';
  h += '<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #334155">RPO</th>';
  h +=
    '<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #334155">RTO</th></tr></thead><tbody>';
  appRows.forEach(function (a) {
    const meta = window._TIER_RPO_RTO[a.tier] || window._TIER_RPO_RTO.low;
    h +=
      '<tr><td style="padding:5px 10px;border-bottom:1px solid #1e293b;font-weight:500">' +
      esc(a.name) +
      '</td>';
    h += '<td style="padding:5px 10px;border-bottom:1px solid #1e293b">' + esc(a.type) + '</td>';
    h +=
      '<td style="padding:5px 10px;border-bottom:1px solid #1e293b"><span style="color:' +
      meta.color +
      ';font-weight:600;text-transform:uppercase">' +
      a.tier +
      '</span></td>';
    h +=
      '<td style="padding:5px 10px;border-bottom:1px solid #1e293b;text-align:center">' +
      a.matched.length +
      '</td>';
    h += '<td style="padding:5px 10px;border-bottom:1px solid #1e293b">' + meta.rpo + '</td>';
    h += '<td style="padding:5px 10px;border-bottom:1px solid #1e293b">' + meta.rto + '</td></tr>';
  });
  h += '</tbody></table>';
  appRows.forEach(function (a) {
    if (!a.matched.length) return;
    const meta = window._TIER_RPO_RTO[a.tier] || window._TIER_RPO_RTO.low;
    h +=
      '<h3 style="margin-top:18px;color:' +
      meta.color +
      '">' +
      esc(a.name) +
      ' <span style="font-weight:normal;font-size:12px;color:#94a3b8">(' +
      a.matched.length +
      ' resources)</span></h3>';
    h +=
      '<table class="rpt-tbl" style="width:100%;border-collapse:collapse;margin:6px 0 16px;font-size:12px">';
    h +=
      '<thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #334155">Resource</th>';
    h += '<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #334155">Type</th>';
    h += '<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #334155">Tier</th>';
    h +=
      '<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #334155">VPC</th></tr></thead><tbody>';
    a.matched.forEach(function (r) {
      const rm = window._TIER_RPO_RTO[r.tier] || window._TIER_RPO_RTO.low;
      h +=
        '<tr><td style="padding:3px 8px;border-bottom:1px solid #1e293b">' + esc(r.name) + '</td>';
      h += '<td style="padding:3px 8px;border-bottom:1px solid #1e293b">' + esc(r.type) + '</td>';
      h +=
        '<td style="padding:3px 8px;border-bottom:1px solid #1e293b;color:' +
        rm.color +
        '">' +
        r.tier +
        '</td>';
      h +=
        '<td style="padding:3px 8px;border-bottom:1px solid #1e293b">' +
        esc(r.vpcName || '\u2014') +
        '</td></tr>';
    });
    h += '</tbody></table>';
  });
  h += '</section>';
  return h;
}

export function _rptArchDiagram(ctx, opts) {
  let h = '<section class="rpt-section" id="s-architecture"><h2>Architecture Diagram</h2>';
  const svgEl = document.getElementById('mapSvg');
  const root = svgEl ? svgEl.querySelector('.map-root') : null;
  if (!root) {
    return h + '<p>No map rendered.</p></section>';
  }
  try {
    const uri = _rptBuildSvgUri(svgEl, root);
    h += '<img class="diagram-img" src="' + uri + '" alt="Architecture diagram">';
  } catch (e) {
    h += '<p>Error generating diagram: ' + esc(e.message) + '</p>';
  }
  h += '</section>';
  return h;
}

export function _rptBuildSvgUri(svgEl, root) {
  const clone = svgEl.cloneNode(true);
  window._rptPrepClone(clone, root);
  const xml = new XMLSerializer().serializeToString(clone);
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
}

let _cachedStyles = null;
let _cachedStylesTheme = null;
export function _rptCollectStyles() {
  const theme = document.documentElement.getAttribute('data-theme') || '';
  if (_cachedStyles && _cachedStylesTheme === theme) return _cachedStyles;
  let css = '';
  for (let i = 0; i < document.styleSheets.length; i++) {
    try {
      const rules = document.styleSheets[i].cssRules;
      if (!rules) continue;
      for (let j = 0; j < rules.length; j++) css += rules[j].cssText + '\n';
    } catch (e) {
      /* cross-origin */
    }
  }
  _cachedStyles = css;
  _cachedStylesTheme = theme;
  return css;
}

export function _rptCompliance(ctx, opts) {
  const f = _rptFilterByAccount(window._complianceFindings || [], _rptGetAccountFilter());
  let h =
    '<section class="rpt-section" id="s-compliance"><h2 class="rpt-section-toggle">Compliance Findings</h2>';
  if (!f || !f.length) {
    return h + '<p>No compliance findings.</p></section>';
  }
  const fwMap = {};
  f.forEach(function (x) {
    const fw = x.framework || 'OTHER';
    if (!fwMap[fw]) fwMap[fw] = [];
    fwMap[fw].push(x);
  });
  const fwKeys = Object.keys(fwMap);
  h += '<div class="rpt-section-body">';
  h += '<nav class="rpt-jump-nav">';
  fwKeys.forEach(function (fw) {
    const label = FW_LABELS[fw] || fw;
    h +=
      '<a href="#s-compliance-' +
      esc(fw) +
      '" class="rpt-jump-link">' +
      esc(label) +
      '<span class="rpt-jump-ct">' +
      fwMap[fw].length +
      '</span></a>';
  });
  h += '</nav>';
  fwKeys.forEach(function (fw) {
    const label = FW_LABELS[fw] || fw;
    const items = fwMap[fw];
    const tableId = 'rpt-tbl-compliance-' + fw;
    h += '<div id="s-compliance-' + esc(fw) + '">';
    h += '<h3>' + esc(label) + ' (' + items.length + ')</h3>';
    h += '<div class="rpt-table-wrap" id="' + tableId + '">';
    const hasAcctData = items.some(function (f) {
      return !!f._accountId;
    });
    h += _rptBuildToolbar(tableId, {
      severities: true,
      accounts: hasAcctData ? _rptUniqueAccounts() : []
    });
    h += _rptGroupedFindingsTable(items);
    h += '</div></div>';
  });
  h += '</div>';
  h += '</section>';
  return h;
}

export function _rptGroupedFindingsTable(items) {
  const ctrlMap = {};
  items.forEach(function (f) {
    const key = f.control || 'UNKNOWN';
    if (!ctrlMap[key])
      ctrlMap[key] = { control: key, severity: f.severity, finding: f.message, resources: [] };
    ctrlMap[key].resources.push(f);
    const cur = SEV_ORDER[ctrlMap[key].severity] || 9;
    const nw = SEV_ORDER[f.severity] || 9;
    if (nw < cur) ctrlMap[key].severity = f.severity;
  });
  const groups = Object.keys(ctrlMap).map(function (k) {
    return ctrlMap[k];
  });
  groups.sort(function (a, b) {
    return (SEV_ORDER[a.severity] || 9) - (SEV_ORDER[b.severity] || 9);
  });
  let h = '<button class="rpt-expand-all" type="button">Expand All</button>';
  h += '<table><thead class="rpt-sticky"><tr>';
  h += '<th class="rpt-sortable" data-sort-type="severity">Severity</th>';
  h += '<th class="rpt-sortable" data-sort-type="text">Control</th>';
  h += '<th class="rpt-sortable" data-sort-type="text">Affected</th>';
  h += '<th>Finding</th>';
  h += '</tr></thead><tbody>';
  groups.forEach(function (g) {
    const sev = g.severity;
    const accts = {};
    g.resources.forEach(function (f) {
      if (f._accountId) accts[f._accountId] = 1;
    });
    const acctStr = Object.keys(accts).join('|');
    h +=
      '<tr class="rpt-ctrl-row" data-sev="' +
      esc(sev) +
      '"' +
      (acctStr ? ' data-account="' + esc(acctStr) + '"' : '') +
      '>';
    h += '<td><span class="sev-badge sev-' + esc(sev) + '">' + esc(sev) + '</span></td>';
    h += '<td><span class="rpt-ctrl-toggle">&#9654;</span> ' + esc(g.control) + '</td>';
    h += '<td>' + g.resources.length + '</td>';
    h += '<td>' + esc(g.finding) + '</td>';
    h += '</tr>';
    h += '<tr class="rpt-ctrl-detail" data-sev="' + esc(sev) + '" style="display:none">';
    h += '<td colspan="4"><table class="rpt-detail-table"><tbody>';
    g.resources.forEach(function (f) {
      h += '<tr>';
      h +=
        '<td><span class="sev-badge sev-' +
        esc(f.severity) +
        '">' +
        esc(f.severity) +
        '</span></td>';
      h += '<td>' + esc(_rptAccountLabel(f._accountId)) + '</td>';
      h += '<td>' + esc(f.resourceName || f.resource) + '</td>';
      h += '<td>' + esc(f.message) + '</td>';
      h += '<td>' + esc(f.remediation) + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></td></tr>';
  });
  h += '</tbody></table>';
  return h;
}

export function _rptBUDR(ctx, opts) {
  const _filteredBudr = _rptFilterByAccount(window._budrAssessments || [], _rptGetAccountFilter());
  let h =
    '<section class="rpt-section" id="s-budr"><h2 class="rpt-section-toggle">BUDR Assessment</h2>';
  if (!_filteredBudr || !_filteredBudr.length) {
    return h + '<p>No BUDR assessments available.</p></section>';
  }
  const counts = { protected: 0, partial: 0, at_risk: 0 };
  _filteredBudr.forEach(function (a) {
    if (a.profile && counts[a.profile.tier] !== undefined) counts[a.profile.tier]++;
  });
  const filteredBudrFindings = _rptFilterByAccount(
    window._budrFindings || [],
    _rptGetAccountFilter()
  );
  h += '<div class="rpt-section-body">';
  h += '<nav class="rpt-jump-nav">';
  h += '<a href="#s-budr-summary" class="rpt-jump-link">Summary</a>';
  h +=
    '<a href="#s-budr-assessments" class="rpt-jump-link">Assessments<span class="rpt-jump-ct">' +
    _filteredBudr.length +
    '</span></a>';
  if (filteredBudrFindings.length)
    h +=
      '<a href="#s-budr-findings" class="rpt-jump-link">Findings<span class="rpt-jump-ct">' +
      filteredBudrFindings.length +
      '</span></a>';
  h += '</nav>';
  h += '<div id="s-budr-summary">';
  h += _rptBUDRStatGrid(counts);
  h += _rptBUDRStrategyGrid(_filteredBudr);
  h += '</div>';
  h += _rptBUDRAssessmentTable(_filteredBudr);
  if (filteredBudrFindings.length) {
    h += '<div id="s-budr-findings"><h3>BUDR Findings (' + filteredBudrFindings.length + ')</h3>';
    h += '<div class="rpt-table-wrap" id="rpt-tbl-budr-findings">';
    h += _rptBuildToolbar('rpt-tbl-budr-findings', {
      severities: true,
      accounts: _rptUniqueAccounts()
    });
    h += _rptGroupedFindingsTable(
      filteredBudrFindings.slice().sort(function (a, b) {
        return (SEV_ORDER[a.severity] || 9) - (SEV_ORDER[b.severity] || 9);
      })
    );
    h += '</div></div>';
  }
  h += '</div></section>';
  return h;
}

export function _rptBUDRStatGrid(counts) {
  const tiers = [
    { k: 'protected', label: 'Protected', color: '#10b981' },
    { k: 'partial', label: 'Partial', color: '#f59e0b' },
    { k: 'at_risk', label: 'At Risk', color: '#ef4444' }
  ];
  let h = '<div class="stat-grid">';
  tiers.forEach(function (t) {
    const v = counts[t.k] || 0;
    h += '<div class="stat-box" style="border-color:' + t.color + '">';
    h += '<span class="val" style="color:' + t.color + '">' + v + '</span>';
    h += '<span class="lbl">' + esc(t.label) + '</span></div>';
  });
  h += '</div>';
  return h;
}

export function _rptBUDRStrategyGrid(filteredAssessments) {
  const strats = [
    { k: 'hot', label: 'Hot', color: '#ef4444' },
    { k: 'warm', label: 'Warm', color: '#f59e0b' },
    { k: 'pilot', label: 'Pilot Light', color: '#6366f1' },
    { k: 'cold', label: 'Cold', color: '#64748b' }
  ];
  const counts = {};
  (filteredAssessments || window._budrAssessments).forEach(function (a) {
    const s = a.profile ? a.profile.strategy : 'unknown';
    counts[s] = (counts[s] || 0) + 1;
  });
  let h = '<div class="stat-grid" style="margin-top:12px">';
  strats.forEach(function (s) {
    const v = counts[s.k] || 0;
    h += '<div class="stat-box" style="border-color:' + s.color + '">';
    h += '<span class="val" style="color:' + s.color + '">' + v + '</span>';
    h += '<span class="lbl">' + esc(s.label) + '</span></div>';
  });
  h += '</div>';
  h += _rptBUDRStrategyLegend();
  return h;
}

export function _rptBUDRStrategyLegend() {
  let h =
    '<div style="margin-top:10px;padding:10px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:11px;font-family:Segoe UI,system-ui,sans-serif">';
  h +=
    '<div style="color:var(--text-muted);font-weight:600;margin-bottom:6px;font-size:10px;letter-spacing:.5px">DR STRATEGY REFERENCE</div>';
  _BUDR_STRATEGY_LEGEND.forEach(function (s) {
    h += '<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:3px">';
    h +=
      '<span style="color:' +
      s.color +
      ';font-weight:700;min-width:100px">' +
      s.icon +
      ' ' +
      esc(s.label) +
      '</span>';
    h += '<span style="color:var(--text-secondary)">' + esc(s.desc) + '</span>';
    h += '</div>';
  });
  h += '</div>';
  return h;
}

export function _rptBUDRAssessmentTable(assessments) {
  const data = assessments || window._budrAssessments;
  const tierOrder = { at_risk: 0, partial: 1, protected: 2 };
  const sorted = data.slice().sort(function (a, b) {
    const ta = a.profile ? tierOrder[a.profile.tier] : 9;
    const tb = b.profile ? tierOrder[b.profile.tier] : 9;
    if (ta !== tb) return ta - tb;
    const sa = a.profile ? _BUDR_STRATEGY_ORDER[a.profile.strategy] || 9 : 9;
    const sb = b.profile ? _BUDR_STRATEGY_ORDER[b.profile.strategy] || 9 : 9;
    return sa - sb;
  });
  let h = '<div id="s-budr-assessments"><h3>Assessments (' + sorted.length + ')</h3>';
  h += '<div class="rpt-table-wrap" id="rpt-tbl-budr">';
  h += _rptBuildToolbar('rpt-tbl-budr', {
    tiers: true,
    strategies: true,
    accounts: _rptUniqueAccounts()
  });
  h += '<table><thead class="rpt-sticky"><tr>';
  h += '<th class="rpt-sortable" data-sort-type="text">Account</th>';
  h += '<th class="rpt-sortable" data-sort-type="text">Type</th>';
  h += '<th class="rpt-sortable" data-sort-type="text">Resource</th>';
  h += '<th class="rpt-sortable" data-sort-type="tier">Tier</th>';
  h += '<th class="rpt-sortable" data-sort-type="strategy">Strategy</th>';
  h += '<th class="rpt-sortable" data-sort-type="text">RTO</th>';
  h += '<th class="rpt-sortable" data-sort-type="text">RPO</th>';
  h += '<th>Signals</th>';
  h += '</tr></thead><tbody>';
  sorted.forEach(function (a) {
    const tier = a.profile ? a.profile.tier : 'unknown';
    const cls = 'tier-' + tier;
    const tierLabel =
      { protected: 'Protected', partial: 'Partial', at_risk: 'At Risk' }[tier] || tier;
    const rto = a.profile ? a.profile.rto : 'N/A';
    const rpo = a.profile ? a.profile.rpo : 'N/A';
    const strategy = a.profile ? a.profile.strategy : 'unknown';
    const stratLabel = _BUDR_STRATEGY[strategy] || strategy;
    const sigs = a.signals ? _rptFormatSignals(a.signals) : '';
    h +=
      '<tr data-tier="' +
      esc(tier) +
      '" data-strategy="' +
      esc(strategy) +
      '" data-account="' +
      esc(a.account || '') +
      '">';
    h += '<td>' + esc(_rptAccountLabel(a.account)) + '</td>';
    h += '<td>' + esc(a.type) + '</td>';
    h +=
      '<td><a href="#res-' +
      esc(a.id) +
      '" class="rpt-res-link">' +
      esc(a.name || a.id) +
      '</a></td>';
    h += '<td><span class="' + cls + '">' + esc(tierLabel) + '</span></td>';
    h +=
      '<td><span class="strategy-badge strategy-' +
      esc(strategy) +
      '">' +
      esc(stratLabel) +
      '</span></td>';
    const estM = _BUDR_EST_MINUTES[a.profileKey] || {};
    h += '<td title="' + (estM.rtoWhy ? esc(estM.rtoWhy) : '') + '">' + esc(rto) + '</td>';
    h += '<td title="' + (estM.rpoWhy ? esc(estM.rpoWhy) : '') + '">' + esc(rpo) + '</td>';
    h += '<td>' + esc(sigs) + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table></div></div>';
  return h;
}

export function _rptFormatSignals(sigs) {
  return Object.keys(sigs)
    .map(function (k) {
      return k + ':' + sigs[k];
    })
    .join(', ');
}

export function _rptIAMReview(ctx, opts) {
  if (!window._iamReviewData.length) {
    const raw = safeParse(gv('in_iam'));
    if (raw) {
      const p = _parseIAMData(raw);
      if (p) window.prepareIAMReviewData(p);
    }
  }
  let h =
    '<section class="rpt-section" id="s-iam-review"><h2 class="rpt-section-toggle">IAM Review</h2>';
  if (!window._iamReviewData.length) {
    return h + '<p>No IAM data available.</p></section>';
  }
  h += '<div class="rpt-section-body">';
  const roles = window._iamReviewData.filter(function (r) {
    return r.type === 'Role';
  });
  const users = window._iamReviewData.filter(function (r) {
    return r.type === 'User';
  });
  const admins = window._iamReviewData.filter(function (r) {
    return r.isAdmin;
  });
  const withFindings = window._iamReviewData.filter(function (r) {
    return r.findings.length > 0;
  });
  const crossAcct = window._iamReviewData.filter(function (r) {
    return r.crossAccounts.length > 0;
  });
  h += '<div class="rpt-kv-grid">';
  h +=
    '<div class="rpt-kv"><span class="rpt-kv-label">Total Entities</span><span class="rpt-kv-val">' +
    window._iamReviewData.length +
    '</span></div>';
  h +=
    '<div class="rpt-kv"><span class="rpt-kv-label">Roles</span><span class="rpt-kv-val">' +
    roles.length +
    '</span></div>';
  h +=
    '<div class="rpt-kv"><span class="rpt-kv-label">Users</span><span class="rpt-kv-val">' +
    users.length +
    '</span></div>';
  h +=
    '<div class="rpt-kv"><span class="rpt-kv-label" style="color:#ef4444">Admin Access</span><span class="rpt-kv-val" style="color:#ef4444">' +
    admins.length +
    '</span></div>';
  h +=
    '<div class="rpt-kv"><span class="rpt-kv-label" style="color:#f59e0b">Cross-Account Trusts</span><span class="rpt-kv-val" style="color:#f59e0b">' +
    crossAcct.length +
    '</span></div>';
  h +=
    '<div class="rpt-kv"><span class="rpt-kv-label" style="color:#f97316">With Findings</span><span class="rpt-kv-val" style="color:#f97316">' +
    withFindings.length +
    '</span></div>';
  h += '</div>';
  if (admins.length) {
    h +=
      '<h4 style="color:#ef4444;margin-top:16px">Admin Access Entities (' +
      admins.length +
      ')</h4>';
    h +=
      '<table><thead><tr><th>Name</th><th>Type</th><th>Created</th><th>Last Used</th><th>Policies</th><th>Findings</th></tr></thead><tbody>';
    admins.forEach(function (r) {
      h += '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.type) + '</td>';
      h += '<td>' + (r.created ? r.created.toISOString().split('T')[0] : '\u2014') + '</td>';
      h += '<td>' + (r.lastUsed ? r.lastUsed.toISOString().split('T')[0] : 'Never') + '</td>';
      h += '<td>' + r.policies + '</td>';
      h += '<td>' + (r.findings.length || '\u2014') + '</td></tr>';
    });
    h += '</tbody></table>';
  }
  if (crossAcct.length) {
    h +=
      '<h4 style="color:#f59e0b;margin-top:16px">Cross-Account Trust Roles (' +
      crossAcct.length +
      ')</h4>';
    h +=
      '<table><thead><tr><th>Role</th><th>Trusted Accounts</th><th>Admin</th><th>Findings</th></tr></thead><tbody>';
    crossAcct.forEach(function (r) {
      h += '<tr><td>' + esc(r.name) + '</td><td>' + r.crossAccounts.map(esc).join(', ') + '</td>';
      h += '<td>' + (r.isAdmin ? '<span style="color:#ef4444">Yes</span>' : 'No') + '</td>';
      h += '<td>' + (r.findings.length || '\u2014') + '</td></tr>';
    });
    h += '</tbody></table>';
  }
  const usersWithIssues = users.filter(function (u) {
    return u.findings.length > 0 || u.isAdmin || (!u.hasMFA && u.hasConsole);
  });
  if (usersWithIssues.length) {
    h +=
      '<h4 style="color:#f97316;margin-top:16px">Users Requiring Attention (' +
      usersWithIssues.length +
      ')</h4>';
    h +=
      '<table><thead><tr><th>User</th><th>MFA</th><th>Console</th><th>Active Keys</th><th>Admin</th><th>Findings</th></tr></thead><tbody>';
    usersWithIssues.forEach(function (u) {
      h += '<tr><td>' + esc(u.name) + '</td>';
      h += '<td>' + (u.hasMFA ? 'Yes' : '<span style="color:#ef4444">No</span>') + '</td>';
      h += '<td>' + (u.hasConsole ? 'Yes' : 'No') + '</td>';
      h += '<td>' + (u.activeKeys || 0) + '</td>';
      h += '<td>' + (u.isAdmin ? '<span style="color:#ef4444">Yes</span>' : 'No') + '</td>';
      h += '<td>' + (u.findings.length || '\u2014') + '</td></tr>';
    });
    h += '</tbody></table>';
  }
  h += '</div></section>';
  return h;
}

export function _rptInventory(ctx, opts) {
  let h =
    '<section class="rpt-section" id="s-inventory"><h2 class="rpt-section-toggle">Resource Inventory</h2>';
  if (!window._rlCtx && !window._importedReportData) {
    return h + '<p>No data loaded.</p></section>';
  }
  if (!window._inventoryData.length && window._rlCtx) window._buildInventoryDataSync();
  const filteredInv = _rptFilterByAccount(window._inventoryData, _rptGetAccountFilter());
  if (!filteredInv.length) {
    return h + '<p>No resources found.</p></section>';
  }
  h += '<div class="rpt-section-body">';

  const byType = {};
  filteredInv.forEach(function (r) {
    if (!byType[r.type]) byType[r.type] = [];
    byType[r.type].push(r);
  });
  const typeKeys = Object.keys(byType).sort();

  h += '<nav class="rpt-jump-nav">';
  typeKeys.forEach(function (t) {
    const cnt = byType[t].length;
    const anchor = 's-inv-' + t.toLowerCase().replace(/\s+/g, '-');
    h +=
      '<a href="#' +
      esc(anchor) +
      '" class="rpt-jump-link">' +
      esc(t) +
      '<span class="rpt-jump-ct">' +
      cnt +
      '</span></a>';
  });
  h += '</nav>';

  const accounts = _rptUniqueAccounts();
  typeKeys.forEach(function (t) {
    const items = byType[t];
    const anchor = 's-inv-' + t.toLowerCase().replace(/\s+/g, '-');
    const tableId = 'rpt-tbl-inv-' + t.toLowerCase().replace(/\s+/g, '-');
    const hasConfig = items.some(function (r) {
      return r.config && r.config !== '-';
    });
    const hasState = items.some(function (r) {
      return r.state && r.state !== '-';
    });
    const hasVpc = items.some(function (r) {
      return !!r.vpcId;
    });
    h += '<h3 id="' + esc(anchor) + '">' + esc(t) + ' (' + items.length + ')</h3>';
    h += '<div class="rpt-table-wrap" id="' + esc(tableId) + '">';
    h += _rptBuildToolbar(tableId, { accounts: accounts });
    h += '<table><thead class="rpt-sticky"><tr>';
    h += '<th class="rpt-sortable" data-sort-type="text">Account</th>';
    h += '<th>Name</th><th>ID</th>';
    if (hasConfig) h += '<th>Config</th>';
    if (hasState) h += '<th>State</th>';
    if (hasVpc) h += '<th>VPC</th>';
    h += '<th>Region</th>';
    h += '</tr></thead><tbody>';
    items.forEach(function (r) {
      const acctId = r._raw && r._raw._accountId ? r._raw._accountId : r.account || '';
      h += '<tr id="res-' + esc(r.id) + '" data-account="' + esc(acctId) + '">';
      h += '<td>' + esc(r.account || '') + '</td>';
      h += '<td>' + esc(r.name || '') + '</td>';
      h += '<td>' + _rptLink(r.type, r.id, r.region, r.id) + '</td>';
      if (hasConfig) h += '<td>' + esc(r.config || '') + '</td>';
      if (hasState) h += '<td>' + esc(r.state || '-') + '</td>';
      if (hasVpc)
        h +=
          '<td>' +
          (r.vpcId ? _rptLink('VPC', r.vpcId, r.region, r.vpcName || r.vpcId) : '-') +
          '</td>';
      h += '<td>' + esc(r.region || '-') + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
  });

  h += '</div></section>';
  return h;
}

export function _rptTagName(o) {
  const t = (o.Tags || []).find(function (t) {
    return t.Key === 'Name';
  });
  return t ? t.Value : '';
}

export function _rptActionPlan(ctx, opts) {
  let h =
    '<section class="rpt-section" id="s-action-plan"><h2 class="rpt-section-toggle">Action Plan</h2>';
  const view = window._buildComplianceView({
    accountFilter: _rptGetAccountFilter(),
    includeMuted: true
  });
  if (!view.filtered.length) {
    return h + '<p>No findings to prioritize.</p></section>';
  }
  h += '<div class="rpt-section-body">';
  const tiers = view.tiers;
  const tierNames = { crit: 'critical', high: 'high', med: 'medium', low: 'low' };
  h += '<nav class="rpt-jump-nav">';
  PRIORITY_KEYS.forEach(function (t) {
    const rgs = tiers[t];
    if (!rgs || !rgs.length) return;
    const total = view.filteredTierCounts[t];
    h +=
      '<a href="#s-action-' +
      tierNames[t] +
      '" class="rpt-jump-link" style="color:' +
      PRIORITY_META[t].color +
      '">' +
      PRIORITY_META[t].name +
      '<span class="rpt-jump-ct" style="color:' +
      PRIORITY_META[t].color +
      '">' +
      total +
      '</span></a>';
  });
  h += '</nav>';
  PRIORITY_KEYS.forEach(function (t) {
    const rgs = tiers[t];
    if (!rgs || !rgs.length) return;
    const meta = PRIORITY_META[t];
    h +=
      '<h3 id="s-action-' + tierNames[t] + '" style="color:' + meta.color + '">' + esc(meta.name);
    const total = view.filteredTierCounts[t];
    h += ' (' + total + ' findings)</h3>';
    const tableId = 'rpt-tbl-action-' + t;
    h += '<div class="rpt-table-wrap" id="' + tableId + '">';
    h += _rptBuildToolbar(tableId, { severities: true, accounts: _rptUniqueAccounts() });
    h += _rptActionTierTable(rgs);
    h += '</div>';
  });
  h += '</div></section>';
  return h;
}

export function _rptActionTierTable(resourceGroups) {
  let h = '<table><thead class="rpt-sticky"><tr>';
  h += '<th class="rpt-sortable" data-sort-type="text">Account</th>';
  h += '<th class="rpt-sortable" data-sort-type="severity">Severity</th>';
  h += '<th class="rpt-sortable" data-sort-type="text">Framework</th>';
  h += '<th class="rpt-sortable" data-sort-type="text">Control</th>';
  h += '<th class="rpt-sortable" data-sort-type="text">Resource</th>';
  h += '<th>Finding</th><th>Remediation</th>';
  h += '</tr></thead><tbody>';
  resourceGroups.forEach(function (rg) {
    rg.findings.forEach(function (f) {
      h += '<tr data-sev="' + esc(f.severity) + '" data-account="' + esc(f._accountId || '') + '">';
      h += '<td>' + esc(_rptAccountLabel(f._accountId)) + '</td>';
      h +=
        '<td><span class="sev-badge sev-' +
        esc(f.severity) +
        '">' +
        esc(f.severity) +
        '</span></td>';
      h += '<td>' + esc(FW_LABELS[f.framework] || f.framework) + '</td>';
      h +=
        '<td>' +
        esc(f.control) +
        (f.ckv ? ' <span style="opacity:.5;font-size:9px">(' + esc(f.ckv) + ')</span>' : '') +
        '</td>';
      h += '<td>' + esc(f.resourceName || f.resource) + '</td>';
      h += '<td>' + esc(f.message) + '</td>';
      h += '<td>' + esc(f.remediation) + '</td>';
      h += '</tr>';
    });
  });
  h += '</tbody></table>';
  return h;
}

export function _rptIaCRecs(ctx, opts) {
  let h = '<section class="rpt-section" id="s-iac-recs"><h2>IaC Recommendations</h2>';
  const f = _rptFilterByAccount(window._complianceFindings || [], _rptGetAccountFilter()).filter(
    function (x) {
      return x.severity === 'CRITICAL' || x.severity === 'HIGH';
    }
  );
  if (!f.length) {
    return h + '<p>No critical/high findings.</p></section>';
  }
  f.sort(function (a, b) {
    return (SEV_ORDER[a.severity] || 9) - (SEV_ORDER[b.severity] || 9);
  });
  const limit = f.slice(0, 10);
  limit.forEach(function (item) {
    h += '<div class="code-block">';
    h +=
      '<span class="sev-badge sev-' + esc(item.severity) + '">' + esc(item.severity) + '</span> ';
    h += esc(item.control) + ' &mdash; ' + esc(item.resourceName || item.resource);
    h += '<br><br><strong>Finding:</strong> ' + esc(item.message);
    h += '<br><strong>Remediation:</strong> ' + esc(item.remediation);
    h += '</div>';
  });
  h += '</section>';
  return h;
}
