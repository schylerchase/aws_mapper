# AWS Export Permissions

AWS Network Mapper only needs read-only inventory access. The simplest setup is
an AWS CLI profile, role, or SSO permission set with the AWS managed
`ReadOnlyAccess` policy. For security-focused dashboards, adding
`SecurityAudit` usually fills more IAM, Security Hub, Access Analyzer,
GuardDuty, and Config data.

If you need a narrower custom policy, start with the actions below. All actions
can use `Resource: "*"` because these AWS inventory/list APIs either require it
or are account/region scoped.

## Full Exporter Action List

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AwsMapperReadOnlyInventory",
      "Effect": "Allow",
      "Action": [
        "access-analyzer:ListAnalyzers",
        "apigateway:GET",
        "autoscaling:DescribeAutoScalingGroups",
        "cloudfront:ListDistributions",
        "cloudtrail:DescribeTrails",
        "cloudwatch:DescribeAlarms",
        "config:DescribeConfigurationRecorders",
        "config:DescribeConfigRules",
        "config:DescribeConformancePacks",
        "ec2:DescribeFlowLogs",
        "ec2:DescribeInstances",
        "ec2:DescribeInternetGateways",
        "ec2:DescribeNatGateways",
        "ec2:DescribeNetworkAcls",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DescribeRegions",
        "ec2:DescribeRouteTables",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeSnapshots",
        "ec2:DescribeSubnets",
        "ec2:DescribeTransitGatewayAttachments",
        "ec2:DescribeVolumes",
        "ec2:DescribeVpcEndpoints",
        "ec2:DescribeVpcPeeringConnections",
        "ec2:DescribeVpcs",
        "ec2:DescribeVpnConnections",
        "ecr:DescribeRepositories",
        "ecs:DescribeServices",
        "ecs:ListClusters",
        "ecs:ListServices",
        "elasticache:DescribeCacheClusters",
        "elasticloadbalancing:DescribeLoadBalancers",
        "elasticloadbalancing:DescribeTargetGroups",
        "guardduty:GetDetector",
        "guardduty:ListDetectors",
        "iam:GetAccountAuthorizationDetails",
        "kms:DescribeKey",
        "kms:GetKeyRotationStatus",
        "kms:ListKeys",
        "lambda:ListFunctions",
        "logs:DescribeLogGroups",
        "rds:DescribeDBInstances",
        "redshift:DescribeClusters",
        "route53:ListHostedZones",
        "route53:ListResourceRecordSets",
        "s3:ListAllMyBuckets",
        "secretsmanager:ListSecrets",
        "securityhub:GetEnabledStandards",
        "sns:ListTopics",
        "sqs:ListQueues",
        "ssm:DescribeParameters",
        "wafv2:ListWebACLs"
      ],
      "Resource": "*"
    }
  ]
}
```

## Notes

- `ec2:DescribeRegions` is needed when using `-AllRegions`.
- `route53:ListResourceRecordSets` is used after hosted zones are discovered.
- `ecs:ListClusters`, `ecs:ListServices`, and `ecs:DescribeServices` are used
  together for ECS service inventory.
- `iam:GetAccountAuthorizationDetails` is needed for the IAM Review dashboard.
  If it is denied, the network map can still render, but IAM review data will be
  missing.
- KMS and GuardDuty calls are currently part of the PowerShell exporter. They are
  safe read-only calls and can be omitted if those governance details are not
  required.
- If an export reports `UnauthorizedOperation`, `AccessDenied`, or
  `AccessDeniedException`, compare the missing action in `_export-log.json`
  against this list.
