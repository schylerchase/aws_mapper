// Compliance View — scoring, grouping, tier classification, and muting
// DOM rendering functions (_renderCompDash, _renderExecSummary, etc.)
// remain inline until modernized in Phase 5.

import { SEV_ORDER, PRIORITY_ORDER, PRIORITY_KEYS, EFFORT_LABELS, EFFORT_TIME, PRIORITY_META, MUTE_KEY } from './constants.js';
import { complianceFindings } from './state.js';

// === Effort Map (control → effort level) ===
export const EFFORT_MAP = {
  // CIS
  'CIS 5.1':'low','CIS 5.2':'low','CIS 5.3':'low','CIS 5.4':'low',
  'CIS 5.5':'med','NET-1':'med','NET-2':'low',
  // WAF
  'WAF-1':'med','WAF-2':'med','WAF-3':'med','WAF-4':'low',
  // ARCH
  'ARCH-N1':'med','ARCH-N2':'med','ARCH-N3':'high','ARCH-N5':'low',
  'ARCH-C1':'low','ARCH-C2':'low','ARCH-C3':'med','ARCH-C4':'med','ARCH-C5':'low','ARCH-C6':'med',
  'ARCH-D1':'low','ARCH-D2':'med','ARCH-D3':'high','ARCH-D4':'med','ARCH-D5':'high','ARCH-D6':'high','ARCH-D7':'low',
  'ARCH-S1':'low','ARCH-S2':'low','ARCH-E1':'med','ARCH-E2':'low',
  'ARCH-G1':'high','ARCH-G2':'low','ARCH-X1':'med',
  // SOC2
  'SOC2-CC6.1':'low','SOC2-CC6.3':'low','SOC2-CC6.6':'med','SOC2-CC6.7':'med',
  'SOC2-CC6.8':'low','SOC2-CC6.10':'med','SOC2-CC7.2':'med','SOC2-CC7.3':'low',
  'SOC2-CC8.1':'low','SOC2-A1.2':'med','SOC2-A1.3':'low','SOC2-A1.4':'med',
  'SOC2-C1.1':'low','SOC2-C1.2':'low','SOC2-C1.3':'high','SOC2-PI1.1':'med',
  // PCI
  'PCI-1.3.1':'low','PCI-1.3.2':'low','PCI-1.3.4':'med','PCI-2.2.1':'low',
  'PCI-2.3.1':'high','PCI-3.4.1':'med','PCI-3.5.1':'med',
  'PCI-4.2.1':'med','PCI-6.3.1':'med','PCI-6.4.1':'med','PCI-7.2.1':'low',
  'PCI-10.2.1':'med','PCI-11.3.1':'low','PCI-12.10.1':'med',
  // IAM
  'IAM-1':'med','IAM-2':'med','IAM-3':'low','IAM-4':'med','IAM-5':'low',
  'IAM-6':'low','IAM-7':'low','IAM-8':'med','IAM-9':'low','IAM-10':'low',
  'IAM-11':'low','IAM-12':'med','IAM-13':'low',
  // CKV (standalone Checkov checks)
  'CKV_AWS_79':'med','CKV_AWS_126':'med','CKV_AWS_21':'low','CKV_AWS_18':'low',
  'CKV_AWS_26':'low','CKV_AWS_45':'low','CKV_AWS_50':'low',
  // BUDR
  'BUDR-HA-1':'med','BUDR-HA-2':'med','BUDR-HA-3':'low','BUDR-HA-4':'med',
  'BUDR-HA-5':'med','BUDR-HA-6':'low',
  'BUDR-BAK-1':'low','BUDR-BAK-2':'med','BUDR-BAK-3':'med','BUDR-BAK-4':'low','BUDR-BAK-5':'low',
  'BUDR-DR-1':'high','BUDR-DR-2':'med',
  // Governance
  'CIS-2.1':'high','CIS-2.2':'low','CIS-2.3':'med','CIS-2.4':'med','CIS-2.7':'med',
  'GOV-GD1':'high','GOV-GD2':'low',
  'GOV-CFG1':'high','GOV-CFG2':'med',
  'GOV-SH1':'high','GOV-AA1':'med',
  'GOV-KMS1':'low','GOV-LOG1':'low',
  'GOV-ECR1':'low','GOV-ECR2':'low',
  'GOV-SEC1':'med','GOV-APIGW1':'low',
};

// === Compliance References (control → documentation URL) ===
export const complianceRefs = {
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
  'CKV_AWS_79':{url:'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html',ref:'Checkov CKV_AWS_79 - IMDSv2'},
  'CKV_AWS_126':{url:'https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html',ref:'Checkov CKV_AWS_126 - VPC Flow Logs'},
  'CKV_AWS_21':{url:'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html',ref:'Checkov CKV_AWS_21 - S3 Versioning'},
  'CKV_AWS_18':{url:'https://docs.aws.amazon.com/AmazonS3/latest/userguide/ServerLogs.html',ref:'Checkov CKV_AWS_18 - S3 Access Logging'},
  'CKV_AWS_26':{url:'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html',ref:'Checkov CKV_AWS_26 - RDS Backup Retention'},
  'CKV_AWS_45':{url:'https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html',ref:'Checkov CKV_AWS_45 - Lambda Env Encryption'},
  'CKV_AWS_50':{url:'https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html',ref:'Checkov CKV_AWS_50 - Lambda X-Ray Tracing'},
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
  // Governance
  'CIS-2.1':{url:'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-create-and-update-a-trail.html',ref:'CIS AWS 2.1 CloudTrail Multi-Region'},
  'CIS-2.2':{url:'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-intro.html',ref:'CIS AWS 2.2 Log Validation'},
  'CIS-2.3':{url:'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/encrypting-cloudtrail-log-files-with-aws-kms.html',ref:'CIS AWS 2.3 KMS Encryption'},
  'CIS-2.4':{url:'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/send-cloudtrail-events-to-cloudwatch-logs.html',ref:'CIS AWS 2.4 CloudWatch Integration'},
  'CIS-2.7':{url:'https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html',ref:'CIS AWS 2.7 VPC Flow Logs'},
  'GOV-GD1':{url:'https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_settingup.html',ref:'GuardDuty Setup'},
  'GOV-GD2':{url:'https://docs.aws.amazon.com/guardduty/latest/ug/guardduty-features-activation-model.html',ref:'GuardDuty Features'},
  'GOV-CFG1':{url:'https://docs.aws.amazon.com/config/latest/developerguide/stop-start-recorder.html',ref:'AWS Config Recorder'},
  'GOV-CFG2':{url:'https://docs.aws.amazon.com/config/latest/developerguide/evaluate-config.html',ref:'AWS Config Rules'},
  'GOV-SH1':{url:'https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-standards.html',ref:'Security Hub Standards'},
  'GOV-AA1':{url:'https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-access-analyzer.html',ref:'IAM Access Analyzer'},
  'GOV-KMS1':{url:'https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html',ref:'KMS Key Rotation'},
  'GOV-LOG1':{url:'https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html',ref:'CloudWatch Logs Retention'},
  'GOV-ECR1':{url:'https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-tag-mutability.html',ref:'ECR Tag Immutability'},
  'GOV-ECR2':{url:'https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning.html',ref:'ECR Image Scanning'},
  'GOV-SEC1':{url:'https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html',ref:'Secrets Manager Rotation'},
  'GOV-APIGW1':{url:'https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-custom-domain-tls-version.html',ref:'API Gateway TLS Policy'},
};

// === Module State ===
let _compDashState = { sevFilter: 'ALL', fwFilter: 'all', search: '', sort: 'severity', showMuted: false, execSummary: false, view: 'action' };
let _mutedFindings = new Set();

// Initialize muted findings from localStorage
try { const raw = localStorage.getItem(MUTE_KEY); if (raw) _mutedFindings = new Set(JSON.parse(raw)); } catch (e) {}

// === State Accessors ===
export function getCompDashState() { return _compDashState; }
export function setCompDashState(v) { _compDashState = v; }
export function getMutedFindings() { return _mutedFindings; }
export function setMutedFindings(v) { _mutedFindings = v; }

// === Mute System ===

/** Save muted findings to localStorage. */
export function saveMuted() {
  try { localStorage.setItem(MUTE_KEY, JSON.stringify([..._mutedFindings])); } catch (e) {}
}

/** Build a mute key from a finding. */
export function muteKey(f) { return f.control + '::' + f.resource; }

/** Check if a finding is muted. */
export function isMuted(f) { return _mutedFindings.has(muteKey(f)); }

/** Toggle mute state of a finding. */
export function toggleMute(f) {
  const k = muteKey(f);
  if (_mutedFindings.has(k)) _mutedFindings.delete(k);
  else _mutedFindings.add(k);
  saveMuted();
}

// === Tier Classification ===

/** Get effort level for a finding. */
export function getEffort(f) { return EFFORT_MAP[f.control] || 'med'; }

/** Classify a finding into priority tier. */
export function classifyTier(f) {
  const e = getEffort(f), s = f.severity;
  if (s === 'CRITICAL') return 'crit';
  if (s === 'HIGH' && e === 'low') return 'crit';
  if (s === 'HIGH') return 'high';
  if (s === 'MEDIUM' && e === 'low') return 'high';
  if (s === 'MEDIUM') return 'med';
  return 'low';
}

// === Resource Grouping ===

/** Group findings by resource, computing worst severity/tier per group. */
export function groupByResource(findings) {
  const map = {};
  findings.forEach(f => {
    const k = f.resource;
    if (!map[k]) map[k] = { resource: f.resource, resourceName: f.resourceName || f.resource, findings: [], worstSev: 'LOW', worstTier: 'low', _accountId: f._accountId };
    const tier = classifyTier(f);
    map[k].findings.push(Object.assign({}, f, { effort: getEffort(f), tier: tier }));
    if ((SEV_ORDER[f.severity] || 9) < (SEV_ORDER[map[k].worstSev] || 9)) map[k].worstSev = f.severity;
    if ((PRIORITY_ORDER[tier] || 9) < (PRIORITY_ORDER[map[k].worstTier] || 9)) map[k].worstTier = tier;
  });
  return Object.values(map).sort((a, b) => {
    if (a.worstTier !== b.worstTier) return (PRIORITY_ORDER[a.worstTier] || 9) - (PRIORITY_ORDER[b.worstTier] || 9);
    return (SEV_ORDER[a.worstSev] || 9) - (SEV_ORDER[b.worstSev] || 9);
  });
}

/** Group resource groups by their worst tier. */
export function getTierGroups(findings) {
  const g = { crit: [], high: [], med: [], low: [] };
  groupByResource(findings).forEach(rg => { g[rg.worstTier].push(rg); });
  return g;
}

/** Group resource groups by their worst severity. */
export function getSeverityGroups(findings) {
  const g = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };
  groupByResource(findings).forEach(rg => { g[rg.worstSev].push(rg); });
  return g;
}

/** Estimate total remediation effort from resource groups. */
export function estimateTotalEffort(resourceGroups) {
  var mins = 0;
  resourceGroups.forEach(rg => { rg.findings.forEach(f => {
    if (f.effort === 'low') mins += 5;
    else if (f.effort === 'med') mins += 90;
    else mins += 480;
  }); });
  if (mins < 60) return '~' + mins + ' min';
  if (mins < 480) return '~' + Math.round(mins / 60) + ' hrs';
  return '~' + Math.round(mins / 480) + ' days';
}

// === Scoring ===

/** Calculate compliance score (0-100) with letter grade. */
export function calcComplianceScore(findings) {
  const active = findings.filter(f => !isMuted(f));
  if (!active.length) return { score: 100, grade: 'A', color: '#22c55e' };
  const w = { CRITICAL: 10, HIGH: 5, MEDIUM: 2, LOW: 0.5 };
  const penalty = active.reduce((s, f) => s + (w[f.severity] || 0), 0);
  const maxPenalty = active.length * 10;
  const score = Math.max(0, Math.round(100 - (penalty / maxPenalty) * 100));
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 50 ? 'D' : 'F';
  const color = score >= 90 ? '#22c55e' : score >= 70 ? '#eab308' : score >= 50 ? '#f97316' : '#ef4444';
  return { score, grade, color };
}

/** Aggregate findings by resource, sorted by worst severity then count. */
export function aggregateTopResources(findings, limit) {
  const map = {};
  findings.forEach(f => {
    const r = f.resourceName || f.resource;
    if (!r || r === 'Multiple') return;
    if (!map[r]) map[r] = { count: 0, worst: 'LOW', sevs: {} };
    map[r].count++;
    map[r].sevs[f.severity] = (map[r].sevs[f.severity] || 0) + 1;
    if ((SEV_ORDER[f.severity] || 9) < (SEV_ORDER[map[r].worst] || 9)) map[r].worst = f.severity;
  });
  return Object.entries(map).sort((a, b) => {
    const sd = (SEV_ORDER[a[1].worst] || 9) - (SEV_ORDER[b[1].worst] || 9);
    return sd !== 0 ? sd : b[1].count - a[1].count;
  }).slice(0, limit);
}

// === Unified Compliance View Builder ===

// TODO: import from owning module when available
// Transitional: _rptFilterByAccount is defined in the report builder region
function _rptFilterByAccount(items, acctId) {
  if (typeof window !== 'undefined' && window._rptFilterByAccount) {
    return window._rptFilterByAccount(items, acctId);
  }
  if (!acctId || acctId === 'all') return items;
  return items.filter(item => (item._accountId || item.account || '') === acctId);
}

/**
 * Build a unified compliance view — single source of truth for all filter/count consumers.
 * @param {Object} [opts] - Filter options
 * @returns {Object} View with base, filtered, tiers, sevCounts, score, etc.
 */
export function buildComplianceView(opts) {
  opts = opts || {};
  var src = (opts.findings || complianceFindings || []).slice();
  // Account filter (reports)
  if (opts.accountFilter) src = _rptFilterByAccount(src, opts.accountFilter);
  // Framework filter
  if (Array.isArray(opts.frameworks)) src = src.filter(f => opts.frameworks.indexOf(f.framework) !== -1);
  else if (opts.frameworks && opts.frameworks !== 'all') src = src.filter(f => f.framework === opts.frameworks);
  // Severity pre-filter (export modal multi-select)
  if (Array.isArray(opts.severities)) src = src.filter(f => opts.severities.indexOf(f.severity) !== -1);
  // Search filter
  if (opts.search) {
    var q = opts.search.toLowerCase();
    src = src.filter(f =>
      (f.message || '').toLowerCase().indexOf(q) !== -1 ||
      (f.resource || '').toLowerCase().indexOf(q) !== -1 ||
      (f.resourceName || '').toLowerCase().indexOf(q) !== -1 ||
      (f.control || '').toLowerCase().indexOf(q) !== -1 ||
      (f.ckv || '').toLowerCase().indexOf(q) !== -1 ||
      (f.remediation || '').toLowerCase().indexOf(q) !== -1
    );
  }
  // Mute filter
  if (!opts.includeMuted) src = src.filter(f => !isMuted(f));
  // Stamp _tier and _effort on every finding ONCE
  var base = src.map(f => Object.assign({}, f, { _tier: classifyTier(f), _effort: getEffort(f) }));
  // Severity sub-filter (dashboard pill selection)
  var filtered = (typeof opts.severity === 'string' && opts.severity !== 'ALL')
    ? base.filter(f => f.severity === opts.severity) : base;
  // Pre-compute counts from base (before severity pill filter)
  var sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  var tierCounts = { crit: 0, high: 0, med: 0, low: 0 };
  base.forEach(f => { sevCounts[f.severity]++; tierCounts[f._tier]++; });
  // Filtered tier counts (after severity pill filter)
  var filteredTierCounts = { crit: 0, high: 0, med: 0, low: 0 };
  var filteredSevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  filtered.forEach(f => { filteredTierCounts[f._tier]++; filteredSevCounts[f.severity]++; });
  // Tier-grouped resource groups
  var tiers = getTierGroups(filtered);
  var baseTiers = (typeof opts.severity === 'string' && opts.severity !== 'ALL') ? getTierGroups(base) : tiers;
  // Severity-grouped resource groups
  var sevGroups = getSeverityGroups(filtered);
  return {
    base, filtered, tiers, baseTiers, sevGroups,
    sevCounts, tierCounts, filteredTierCounts, filteredSevCounts,
    score: calcComplianceScore(base),
    effort: estimateTotalEffort(groupByResource(base)),
    mutedCount: (complianceFindings || []).filter(f => isMuted(f)).length
  };
}

// Bridge: expose to window for legacy callers in app-core.js
// TODO: replace with proper imports when app-core.js is modularized
if (typeof window !== 'undefined') {
  // === Window bridge — legacy callers require these globals ===
  window._EFFORT_MAP = EFFORT_MAP;
  window._complianceRefs = complianceRefs;
  window._compDashState = _compDashState;
  window._mutedFindings = _mutedFindings;
  window._saveMuted = saveMuted;
  window._muteKey = muteKey;
  window._isMuted = isMuted;
  window._toggleMute = toggleMute;
  window._getEffort = getEffort;
  window._classifyTier = classifyTier;
  window._groupByResource = groupByResource;
  window._getTierGroups = getTierGroups;
  window._getSeverityGroups = getSeverityGroups;
  window._estimateTotalEffort = estimateTotalEffort;
  window._calcComplianceScore = calcComplianceScore;
  window._aggregateTopResources = aggregateTopResources;
  window._buildComplianceView = buildComplianceView;
}

// === Backward Compat Exports ===
export {
  EFFORT_MAP as _EFFORT_MAP,
  _compDashState,
  _mutedFindings,
  complianceRefs as _complianceRefs
};
