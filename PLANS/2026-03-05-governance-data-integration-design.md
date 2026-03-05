# Governance Data Integration Design

**Date**: 2026-03-05
**Status**: Approved
**Scope**: Full integration of 18 new AWS data sources into aws_mapper

## Overview

Add 18 new AWS data sources (exported by `scripts/export-aws-data.ps1`) to the mapper's import pipeline, compliance engine, dashboards, and reports. No topology/SVG rendering changes — all new data is governance posture, not network topology.

## Data Sources

### Governance (13 sources)
| Textarea ID | Label | File Pattern | Root Key |
|---|---|---|---|
| `in_cloudtrail` | CloudTrail | `cloudtrail-trails` | `trailList` |
| `in_cwalarms` | CW Alarms | `cloudwatch-alarms` | `MetricAlarms` |
| `in_loggroups` | Log Groups | `log-groups` | `logGroups` |
| `in_flowlogs` | Flow Logs | `flow-logs` | `FlowLogs` |
| `in_configrecorders` | Config Recorders | `config-recorders` | `ConfigurationRecorders` |
| `in_configrules` | Config Rules | `config-rules` | `ConfigRules` |
| `in_configconformance` | Config Conformance | `config-conformance` | `ConformancePackDetails` |
| `in_securityhub` | Security Hub | `securityhub-standards` | `StandardsSubscriptions` |
| `in_accessanalyzer` | Access Analyzer | `access-analyzers` | `analyzers` |
| `in_kmskeys` | KMS Keys | `kms-keys` | `Keys` |
| `in_guardduty` | GuardDuty | `guardduty-detectors` | `Detectors` |
| `in_secrets` | Secrets Manager | `secrets` | `SecretList` |
| `in_ssmparams` | SSM Parameters | `ssm-parameters` | `Parameters` |

### Integration (5 sources)
| Textarea ID | Label | File Pattern | Root Key |
|---|---|---|---|
| `in_ecr` | ECR Repos | `ecr-repositories` | `repositories` |
| `in_asg` | Auto Scaling | `auto-scaling-groups` | `AutoScalingGroups` |
| `in_apigw` | API Gateway | `api-gateways` | `items` |
| `in_sns` | SNS Topics | `sns-topics` | `Topics` |
| `in_sqs` | SQS Queues | `sqs-queues` | `QueueUrls` |

## Architecture Decisions

### No Topology Changes
None of these resources belong on the network topology map:
- Account-level services (CloudTrail, GuardDuty, Config, KMS, etc.) have no VPC/subnet attachment
- Flow Logs are a property of VPCs/ENIs, not standalone resources
- ECR is a registry, not a network resource
- API Gateways connect via VPC Endpoints already on the map
- ASGs manage EC2 instances already on the map

### Integration Points
1. **Textarea import pipeline** — 18 new textareas + file mapping in `matchFile()`
2. **Context parsing** — `_renderMapInner()` parses into `ctx.*` fields
3. **Resource enrichment** — Cross-reference maps link new data to existing resources
4. **Compliance findings** — New `runGovernanceChecks(ctx)` in compliance-engine.js
5. **Security Posture dashboard** — New unified dashboard tab
6. **Detail panel enrichment** — Existing resource panels show related new data
7. **Report module** — New `security-posture` module in report builder

## Section 1: Data Import Pipeline

18 new textareas in `index.html` sidebar in two new sections ("Governance" and "Integration"). File patterns added to `fileMap` in `matchFile()` with content-based fallback via `_hasKey()`. Project save/load works automatically — existing serialization loop covers all `in_` prefix textareas.

## Section 2: Context Parsing & Resource Enrichment

### Parsing
In `_renderMapInner()`, after existing parse block:
```
ctx.cloudtrailTrails, ctx.cwAlarms, ctx.logGroups, ctx.flowLogs,
ctx.configRecorders, ctx.configRules, ctx.configConformance,
ctx.securityHubStds, ctx.accessAnalyzers, ctx.kmsKeys,
ctx.guarddutyDetectors, ctx.secrets, ctx.ssmParams,
ctx.ecrRepos, ctx.asgs, ctx.apiGateways, ctx.snsTopics, ctx.sqsQueues
```

### Cross-Reference Maps
| Map | Lookup | Purpose |
|-----|--------|---------|
| `flowLogsByVpc` | `ResourceId` -> VPC | VPC detail panel shows Flow Logs |
| `flowLogsByEni` | `ResourceId` -> ENI | ENI detail panel shows Flow Logs |
| `alarmsByNamespace` | `Namespace` + `Dimensions` | Group alarms by AWS service |
| `logGroupsByPrefix` | `/aws/<service>/` prefix | Associate log groups with services |
| `kmsKeysByArn` | `Arn` -> key | Resources show encryption key details |
| `secretsByTag` | Tag matching | Link secrets to RDS, ECS via tags |
| `apiGwByVpce` | `vpcEndpointIds[]` -> API GW | VPC Endpoint shows connected API GW |
| `ecrByName` | `repositoryName` -> repo | ECS shows image source repo |

### Detail Panel Enrichment
- VPC: Flow Logs (status, traffic type, destination)
- VPC Endpoint: Connected API Gateway (name, type, TLS policy)
- ECS Service: ECR repo (image source, scan-on-push, tag mutability)
- RDS Instance: Associated secret (rotation status, last rotated)

## Section 3: Compliance Engine Checks

New `runGovernanceChecks(ctx)` function, ~20 checks:

### CIS AWS Foundations / Architecture
| Control | Severity | Condition |
|---------|----------|-----------|
| CIS-2.1 | CRITICAL | No CloudTrail or not multi-region |
| CIS-2.2 | HIGH | CloudTrail log validation disabled |
| CIS-2.3 | HIGH | CloudTrail not encrypted with KMS |
| CIS-2.4 | HIGH | CloudTrail not integrated with CloudWatch |
| CIS-2.7 | HIGH | VPC has no Flow Logs |
| CIS-3.x | MEDIUM | Log group has no retention policy |
| ARCH-G1 | HIGH | GuardDuty not enabled |
| ARCH-G2 | MEDIUM | GuardDuty feature disabled |
| ARCH-G3 | HIGH | Config not recording all resources |
| ARCH-G4 | MEDIUM | No Config rules configured |
| ARCH-G5 | HIGH | Access Analyzer not configured |
| ARCH-G6 | HIGH | Security Hub not enabled |

### Encryption / Key Management
| Control | Severity | Condition |
|---------|----------|-----------|
| CIS-2.8 | HIGH | KMS key rotation disabled |
| ARCH-E1 | MEDIUM | Log group not encrypted with KMS |

### Container Security
| Control | Severity | Condition |
|---------|----------|-----------|
| ARCH-C2 | MEDIUM | ECR tag mutability enabled |
| ARCH-C3 | MEDIUM | ECR scan-on-push disabled |
| ARCH-C4 | LOW | ECR using default encryption |

### Secrets / Parameters
| Control | Severity | Condition |
|---------|----------|-----------|
| SOC2-CC6.7 | HIGH | Secret rotation disabled |
| SOC2-CC6.8 | MEDIUM | Secret rotation > 90 days |

### API Gateway
| Control | Severity | Condition |
|---------|----------|-----------|
| ARCH-N3 | LOW | Not enforcing TLS 1.2 |

Each check includes `remediation` text, effort rating in `EFFORT_MAP`, and documentation URL in `complianceRefs`.

## Section 4: Security Posture Dashboard Tab

New `posture` tab in unified dashboard. Three-column card grid:

### Column 1: Detection & Monitoring
- **CloudTrail**: multi-region + validation + KMS + CW integration status
- **GuardDuty**: enabled status + per-feature breakdown (10 features)
- **VPC Flow Logs**: coverage ratio (X of Y VPCs), traffic type
- **CloudWatch Alarms**: count by state (OK/ALARM/INSUFFICIENT_DATA)

### Column 2: Configuration & Compliance
- **AWS Config**: recorder + rules configured status
- **Security Hub**: standards subscription status
- **IAM Access Analyzer**: active status, last analyzed
- **Config Rules**: count by source (AWS managed vs custom)

### Column 3: Encryption & Secrets
- **KMS Keys**: rotation coverage, per-key details
- **Secrets Manager**: rotation coverage percentage
- **SSM Parameters**: count by type (SecureString vs String)
- **ECR Repositories**: scan + immutability coverage

Status badges: green (fully configured), yellow (partial), red (missing), gray (no data).

Integration counts row at bottom: API Gateway, SNS Topics, SQS Queues (simple counts).

## Section 5: Report Integration

### Existing Module Enrichment
- `exec-summary`: Add Security Posture Score (average of service statuses)
- `compliance`: New findings auto-included (no change needed)
- `action-plan`: New findings auto-included with effort estimates
- `inventory`: New resource type rows (KMS, ECR, API GW, Secrets, SSM)

### New Module: `security-posture`
Inserted after `exec-summary` in `_RPT_MODULES`. Renders static posture table.

### Cross-Environment Comparison
When multiple profiles loaded, posture table shows column per account to highlight governance drift:
```
| Service     | prod   | staging | dev    |
|-------------|--------|---------|--------|
| Config Rules| NONE   | 15 rules| 15 rules|
```
