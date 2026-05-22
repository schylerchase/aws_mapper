<#
.SYNOPSIS
    Enumerate AWS CLI permissions required by AWS Network Mapper.

.DESCRIPTION
    Runs small AWS CLI probes for the read-only actions used by the mapper export
    scripts. This is a preflight tool: it does not replace export-aws-data.ps1,
    which still performs its own access check and writes _export-log.json.

.EXAMPLE
    .\scripts\enumerate-aws-permissions.ps1 -Profile prod -Region us-east-1

.EXAMPLE
    .\scripts\enumerate-aws-permissions.ps1 -Profile prod -Region us-east-1 -Quick

.EXAMPLE
    .\scripts\enumerate-aws-permissions.ps1 -Profile prod -AllRegions -OutputPath .\aws-permission-report.json
#>

[CmdletBinding()]
param(
    [Alias("p", "Profile")]
    [string]$AwsProfile,

    [Alias("r")]
    [string]$Region,

    [switch]$AllRegions,

    [string]$OutputPath,

    [switch]$Strict,

    [switch]$Quick,

    [switch]$SkipDependentChecks,

    [switch]$ListActions
)

$ErrorActionPreference = "Stop"
$env:AWS_PAGER = ""

$AccessDeniedPattern = '(UnauthorizedOperation|AccessDenied|AccessDeniedException|AuthorizationError|not authorized|is not authorized|explicit deny)'
$ServiceUnavailablePattern = '(not subscribed|not enabled|not found|does not exist|NoSuch|OptInRequired|SubscriptionRequired|InvalidAccessException|UnsupportedOperation|disabled)'

$GlobalChecks = @(
    [pscustomobject]@{ Label = "CloudFront Distributions"; Action = "cloudfront:ListDistributions"; Cmd = @("cloudfront", "list-distributions") },
    [pscustomobject]@{ Label = "IAM Authorization"; Action = "iam:GetAccountAuthorizationDetails"; Cmd = @("iam", "get-account-authorization-details", "--max-items", "1") },
    [pscustomobject]@{ Label = "Route 53 Hosted Zones"; Action = "route53:ListHostedZones"; Cmd = @("route53", "list-hosted-zones") },
    [pscustomobject]@{ Label = "S3 Buckets"; Action = "s3:ListAllMyBuckets"; Cmd = @("s3api", "list-buckets") }
)

$RegionalChecks = @(
    [pscustomobject]@{ Label = "Access Analyzer"; Action = "access-analyzer:ListAnalyzers"; Cmd = @("accessanalyzer", "list-analyzers") },
    [pscustomobject]@{ Label = "API Gateway REST APIs"; Action = "apigateway:GET"; Cmd = @("apigateway", "get-rest-apis", "--limit", "1") },
    [pscustomobject]@{ Label = "Auto Scaling Groups"; Action = "autoscaling:DescribeAutoScalingGroups"; Cmd = @("autoscaling", "describe-auto-scaling-groups") },
    [pscustomobject]@{ Label = "CloudTrail Trails"; Action = "cloudtrail:DescribeTrails"; Cmd = @("cloudtrail", "describe-trails") },
    [pscustomobject]@{ Label = "CloudWatch Alarms"; Action = "cloudwatch:DescribeAlarms"; Cmd = @("cloudwatch", "describe-alarms") },
    [pscustomobject]@{ Label = "Config Conformance Packs"; Action = "config:DescribeConformancePacks"; Cmd = @("configservice", "describe-conformance-packs") },
    [pscustomobject]@{ Label = "Config Recorders"; Action = "config:DescribeConfigurationRecorders"; Cmd = @("configservice", "describe-configuration-recorders") },
    [pscustomobject]@{ Label = "Config Rules"; Action = "config:DescribeConfigRules"; Cmd = @("configservice", "describe-config-rules") },
    [pscustomobject]@{ Label = "EBS Snapshots"; Action = "ec2:DescribeSnapshots"; Cmd = @("ec2", "describe-snapshots", "--owner-ids", "self") },
    [pscustomobject]@{ Label = "EBS Volumes"; Action = "ec2:DescribeVolumes"; Cmd = @("ec2", "describe-volumes") },
    [pscustomobject]@{ Label = "EC2 Instances"; Action = "ec2:DescribeInstances"; Cmd = @("ec2", "describe-instances") },
    [pscustomobject]@{ Label = "ECR Repositories"; Action = "ecr:DescribeRepositories"; Cmd = @("ecr", "describe-repositories") },
    [pscustomobject]@{ Label = "ECS Clusters"; Action = "ecs:ListClusters"; Cmd = @("ecs", "list-clusters") },
    [pscustomobject]@{ Label = "ElastiCache"; Action = "elasticache:DescribeCacheClusters"; Cmd = @("elasticache", "describe-cache-clusters", "--show-cache-node-info") },
    [pscustomobject]@{ Label = "Flow Logs"; Action = "ec2:DescribeFlowLogs"; Cmd = @("ec2", "describe-flow-logs") },
    [pscustomobject]@{ Label = "GuardDuty Detectors"; Action = "guardduty:ListDetectors"; Cmd = @("guardduty", "list-detectors") },
    [pscustomobject]@{ Label = "Internet Gateways"; Action = "ec2:DescribeInternetGateways"; Cmd = @("ec2", "describe-internet-gateways") },
    [pscustomobject]@{ Label = "KMS Keys"; Action = "kms:ListKeys"; Cmd = @("kms", "list-keys") },
    [pscustomobject]@{ Label = "Lambda Functions"; Action = "lambda:ListFunctions"; Cmd = @("lambda", "list-functions") },
    [pscustomobject]@{ Label = "Load Balancers"; Action = "elasticloadbalancing:DescribeLoadBalancers"; Cmd = @("elbv2", "describe-load-balancers") },
    [pscustomobject]@{ Label = "Log Groups"; Action = "logs:DescribeLogGroups"; Cmd = @("logs", "describe-log-groups") },
    [pscustomobject]@{ Label = "NAT Gateways"; Action = "ec2:DescribeNatGateways"; Cmd = @("ec2", "describe-nat-gateways") },
    [pscustomobject]@{ Label = "Network ACLs"; Action = "ec2:DescribeNetworkAcls"; Cmd = @("ec2", "describe-network-acls") },
    [pscustomobject]@{ Label = "Network Interfaces"; Action = "ec2:DescribeNetworkInterfaces"; Cmd = @("ec2", "describe-network-interfaces") },
    [pscustomobject]@{ Label = "RDS Instances"; Action = "rds:DescribeDBInstances"; Cmd = @("rds", "describe-db-instances") },
    [pscustomobject]@{ Label = "Redshift Clusters"; Action = "redshift:DescribeClusters"; Cmd = @("redshift", "describe-clusters") },
    [pscustomobject]@{ Label = "Route Tables"; Action = "ec2:DescribeRouteTables"; Cmd = @("ec2", "describe-route-tables") },
    [pscustomobject]@{ Label = "SNS Topics"; Action = "sns:ListTopics"; Cmd = @("sns", "list-topics") },
    [pscustomobject]@{ Label = "SQS Queues"; Action = "sqs:ListQueues"; Cmd = @("sqs", "list-queues") },
    [pscustomobject]@{ Label = "SSM Parameters"; Action = "ssm:DescribeParameters"; Cmd = @("ssm", "describe-parameters") },
    [pscustomobject]@{ Label = "Secrets"; Action = "secretsmanager:ListSecrets"; Cmd = @("secretsmanager", "list-secrets") },
    [pscustomobject]@{ Label = "Security Groups"; Action = "ec2:DescribeSecurityGroups"; Cmd = @("ec2", "describe-security-groups") },
    [pscustomobject]@{ Label = "Security Hub Standards"; Action = "securityhub:GetEnabledStandards"; Cmd = @("securityhub", "get-enabled-standards") },
    [pscustomobject]@{ Label = "Subnets"; Action = "ec2:DescribeSubnets"; Cmd = @("ec2", "describe-subnets") },
    [pscustomobject]@{ Label = "Target Groups"; Action = "elasticloadbalancing:DescribeTargetGroups"; Cmd = @("elbv2", "describe-target-groups") },
    [pscustomobject]@{ Label = "Transit Gateway Attachments"; Action = "ec2:DescribeTransitGatewayAttachments"; Cmd = @("ec2", "describe-transit-gateway-attachments") },
    [pscustomobject]@{ Label = "VPC Endpoints"; Action = "ec2:DescribeVpcEndpoints"; Cmd = @("ec2", "describe-vpc-endpoints") },
    [pscustomobject]@{ Label = "VPC Peering"; Action = "ec2:DescribeVpcPeeringConnections"; Cmd = @("ec2", "describe-vpc-peering-connections") },
    [pscustomobject]@{ Label = "VPCs"; Action = "ec2:DescribeVpcs"; Cmd = @("ec2", "describe-vpcs") },
    [pscustomobject]@{ Label = "VPN Connections"; Action = "ec2:DescribeVpnConnections"; Cmd = @("ec2", "describe-vpn-connections") },
    [pscustomobject]@{ Label = "WAF WebACLs"; Action = "wafv2:ListWebACLs"; Cmd = @("wafv2", "list-web-acls", "--scope", "REGIONAL") }
)

$DependentActions = @(
    "ecs:DescribeServices",
    "ecs:ListServices",
    "guardduty:GetDetector",
    "kms:DescribeKey",
    "kms:GetKeyRotationStatus",
    "route53:ListResourceRecordSets"
)

$QuickGlobalActions = @(
    "iam:GetAccountAuthorizationDetails",
    "route53:ListHostedZones",
    "s3:ListAllMyBuckets"
)

$QuickRegionalActions = @(
    "ec2:DescribeInstances",
    "ec2:DescribeVpcs",
    "ecs:ListClusters",
    "elasticloadbalancing:DescribeLoadBalancers",
    "guardduty:ListDetectors",
    "kms:ListKeys",
    "lambda:ListFunctions",
    "rds:DescribeDBInstances"
)

if ($Quick) {
    $GlobalChecks = @($GlobalChecks | Where-Object { $QuickGlobalActions -contains $_.Action })
    $RegionalChecks = @($RegionalChecks | Where-Object { $QuickRegionalActions -contains $_.Action })
    $SkipDependentChecks = $true
}

function Format-AwsCliMessage {
    param(
        [object]$Value,
        [int]$MaxLength = 220
    )

    $message = ($Value | Out-String).Trim() -replace '\s+', ' '
    if (-not $message) { return "Unknown AWS CLI error" }
    if ($message.Length -gt $MaxLength) { return $message.Substring(0, $MaxLength) }
    return $message
}

function Test-AccessDenied {
    param([string]$Message)
    return ($Message -match $AccessDeniedPattern)
}

function New-CheckResult {
    param(
        [string]$Action,
        [string]$Label,
        [string]$Scope,
        [string]$RegionName,
        [string]$Status,
        [string]$Detail
    )

    [pscustomobject]@{
        action = $Action
        label  = $Label
        scope  = $Scope
        region = $RegionName
        status = $Status
        detail = $Detail
    }
}

function Get-AwsFlags {
    param(
        [string]$RegionName,
        [switch]$Global
    )

    $flags = @()
    if ($AwsProfile) { $flags += @("--profile", $AwsProfile) }
    if (-not $Global -and $RegionName) { $flags += @("--region", $RegionName) }
    $flags += @("--output", "json", "--no-cli-pager", "--no-paginate")
    return $flags
}

function Invoke-AwsCli {
    param(
        [string[]]$Flags,
        [string[]]$Cmd
    )

    $raw = & aws @Flags @Cmd 2>&1
    $code = $LASTEXITCODE
    [pscustomobject]@{
        exitCode = $code
        raw      = $raw
        text     = Format-AwsCliMessage -Value $raw -MaxLength 1000
    }
}

function ConvertFrom-JsonOutput {
    param([object]$Raw)

    try {
        $text = ($Raw | Out-String).Trim()
        if (-not $text) { return $null }
        return $text | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Convert-ToCheckResult {
    param(
        [pscustomobject]$Probe,
        [pscustomobject]$Check,
        [string]$Scope,
        [string]$RegionName,
        [switch]$NonAccessFailureMeansAllowed
    )

    if ($Probe.exitCode -eq 0) {
        return New-CheckResult -Action $Check.Action -Label $Check.Label -Scope $Scope -RegionName $RegionName -Status "OK" -Detail "allowed"
    }

    if (Test-AccessDenied -Message $Probe.text) {
        return New-CheckResult -Action $Check.Action -Label $Check.Label -Scope $Scope -RegionName $RegionName -Status "MISSING" -Detail $Probe.text
    }

    if ($NonAccessFailureMeansAllowed) {
        return New-CheckResult -Action $Check.Action -Label $Check.Label -Scope $Scope -RegionName $RegionName -Status "OK" -Detail ("API reached: " + (Format-AwsCliMessage -Value $Probe.text -MaxLength 180))
    }

    if ($Probe.text -match $ServiceUnavailablePattern) {
        return New-CheckResult -Action $Check.Action -Label $Check.Label -Scope $Scope -RegionName $RegionName -Status "UNTESTED" -Detail $Probe.text
    }

    return New-CheckResult -Action $Check.Action -Label $Check.Label -Scope $Scope -RegionName $RegionName -Status "ERROR" -Detail $Probe.text
}

function Invoke-DirectCheck {
    param(
        [pscustomobject]$Check,
        [string[]]$Flags,
        [string]$Scope,
        [string]$RegionName,
        [switch]$NonAccessFailureMeansAllowed
    )

    $probe = Invoke-AwsCli -Flags $Flags -Cmd $Check.Cmd
    Convert-ToCheckResult -Probe $probe -Check $Check -Scope $Scope -RegionName $RegionName -NonAccessFailureMeansAllowed:$NonAccessFailureMeansAllowed
}

function Write-CheckResult {
    param([pscustomobject]$Result)

    $color = switch ($Result.status) {
        "OK"       { "Green" }
        "MISSING"  { "Red" }
        "ERROR"    { "Red" }
        "UNTESTED" { "Yellow" }
        default    { "Gray" }
    }
    $where = if ($Result.region) { $Result.region } else { $Result.scope }
    Write-Host ("  {0,-42} {1,-9} {2}" -f $Result.action, $Result.status, "[$where] $($Result.detail)") -ForegroundColor $color
}

function Get-ConfiguredRegion {
    $flags = @()
    if ($AwsProfile) { $flags += @("--profile", $AwsProfile) }
    $regionValue = & aws @flags configure get region 2>$null
    if ($LASTEXITCODE -eq 0 -and $regionValue) {
        return (($regionValue | Out-String).Trim())
    }
    return $null
}

function Invoke-Route53RecordSetCheck {
    param([string[]]$GlobalFlags)

    $zonesProbe = Invoke-AwsCli -Flags $GlobalFlags -Cmd @("route53", "list-hosted-zones")
    if ($zonesProbe.exitCode -ne 0) {
        return New-CheckResult -Action "route53:ListResourceRecordSets" -Label "Route 53 Record Sets" -Scope "global" -RegionName "" -Status "UNTESTED" -Detail "hosted zones could not be listed"
    }

    $zones = ConvertFrom-JsonOutput -Raw $zonesProbe.raw
    $zone = @($zones.HostedZones | Select-Object -First 1)
    if (-not $zone) {
        return New-CheckResult -Action "route53:ListResourceRecordSets" -Label "Route 53 Record Sets" -Scope "global" -RegionName "" -Status "UNTESTED" -Detail "no hosted zones available to probe"
    }

    $zoneId = [string]$zone[0].Id -replace "/hostedzone/", ""
    $check = [pscustomobject]@{ Label = "Route 53 Record Sets"; Action = "route53:ListResourceRecordSets"; Cmd = @("route53", "list-resource-record-sets", "--hosted-zone-id", $zoneId, "--max-items", "1") }
    Invoke-DirectCheck -Check $check -Flags $GlobalFlags -Scope "global" -RegionName ""
}

function Invoke-EcsDependentChecks {
    param(
        [string[]]$Flags,
        [string]$RegionName
    )

    $out = @()
    $clustersProbe = Invoke-AwsCli -Flags $Flags -Cmd @("ecs", "list-clusters", "--query", "clusterArns[]")
    if ($clustersProbe.exitCode -ne 0) {
        $out += New-CheckResult -Action "ecs:ListServices" -Label "ECS Services" -Scope "regional" -RegionName $RegionName -Status "UNTESTED" -Detail "clusters could not be listed"
        $out += New-CheckResult -Action "ecs:DescribeServices" -Label "ECS Service Details" -Scope "regional" -RegionName $RegionName -Status "UNTESTED" -Detail "clusters could not be listed"
        return $out
    }

    $clusters = @(ConvertFrom-JsonOutput -Raw $clustersProbe.raw)
    $cluster = $clusters | Select-Object -First 1
    if (-not $cluster) {
        $out += New-CheckResult -Action "ecs:ListServices" -Label "ECS Services" -Scope "regional" -RegionName $RegionName -Status "UNTESTED" -Detail "no ECS clusters available to probe"
        $out += New-CheckResult -Action "ecs:DescribeServices" -Label "ECS Service Details" -Scope "regional" -RegionName $RegionName -Status "UNTESTED" -Detail "no ECS services available to probe"
        return $out
    }

    $listCheck = [pscustomobject]@{ Label = "ECS Services"; Action = "ecs:ListServices"; Cmd = @("ecs", "list-services", "--cluster", $cluster, "--query", "serviceArns[]") }
    $listProbe = Invoke-AwsCli -Flags $Flags -Cmd $listCheck.Cmd
    $out += Convert-ToCheckResult -Probe $listProbe -Check $listCheck -Scope "regional" -RegionName $RegionName
    if ($listProbe.exitCode -ne 0) { return $out }

    $services = @(ConvertFrom-JsonOutput -Raw $listProbe.raw)
    $service = $services | Select-Object -First 1
    if (-not $service) {
        $out += New-CheckResult -Action "ecs:DescribeServices" -Label "ECS Service Details" -Scope "regional" -RegionName $RegionName -Status "UNTESTED" -Detail "no ECS services available to probe"
        return $out
    }

    $descCheck = [pscustomobject]@{ Label = "ECS Service Details"; Action = "ecs:DescribeServices"; Cmd = @("ecs", "describe-services", "--cluster", $cluster, "--services", $service) }
    $out += Invoke-DirectCheck -Check $descCheck -Flags $Flags -Scope "regional" -RegionName $RegionName
    return $out
}

function Invoke-KmsDependentChecks {
    param(
        [string[]]$Flags,
        [string]$RegionName
    )

    $out = @()
    $keysProbe = Invoke-AwsCli -Flags $Flags -Cmd @("kms", "list-keys", "--query", "Keys[].KeyId")
    if ($keysProbe.exitCode -ne 0) {
        $out += New-CheckResult -Action "kms:DescribeKey" -Label "KMS Key Details" -Scope "regional" -RegionName $RegionName -Status "UNTESTED" -Detail "keys could not be listed"
        $out += New-CheckResult -Action "kms:GetKeyRotationStatus" -Label "KMS Rotation Status" -Scope "regional" -RegionName $RegionName -Status "UNTESTED" -Detail "keys could not be listed"
        return $out
    }

    $keys = @(ConvertFrom-JsonOutput -Raw $keysProbe.raw)
    $keyId = $keys | Select-Object -First 1
    if (-not $keyId) {
        $out += New-CheckResult -Action "kms:DescribeKey" -Label "KMS Key Details" -Scope "regional" -RegionName $RegionName -Status "UNTESTED" -Detail "no KMS keys available to probe"
        $out += New-CheckResult -Action "kms:GetKeyRotationStatus" -Label "KMS Rotation Status" -Scope "regional" -RegionName $RegionName -Status "UNTESTED" -Detail "no KMS keys available to probe"
        return $out
    }

    $descCheck = [pscustomobject]@{ Label = "KMS Key Details"; Action = "kms:DescribeKey"; Cmd = @("kms", "describe-key", "--key-id", $keyId) }
    $out += Invoke-DirectCheck -Check $descCheck -Flags $Flags -Scope "regional" -RegionName $RegionName

    $rotationCheck = [pscustomobject]@{ Label = "KMS Rotation Status"; Action = "kms:GetKeyRotationStatus"; Cmd = @("kms", "get-key-rotation-status", "--key-id", $keyId) }
    $out += Invoke-DirectCheck -Check $rotationCheck -Flags $Flags -Scope "regional" -RegionName $RegionName -NonAccessFailureMeansAllowed
    return $out
}

function Invoke-GuardDutyDependentChecks {
    param(
        [string[]]$Flags,
        [string]$RegionName
    )

    $detectorsProbe = Invoke-AwsCli -Flags $Flags -Cmd @("guardduty", "list-detectors", "--query", "DetectorIds[]")
    if ($detectorsProbe.exitCode -ne 0) {
        return New-CheckResult -Action "guardduty:GetDetector" -Label "GuardDuty Detector Details" -Scope "regional" -RegionName $RegionName -Status "UNTESTED" -Detail "detectors could not be listed"
    }

    $detectors = @(ConvertFrom-JsonOutput -Raw $detectorsProbe.raw)
    $detectorId = $detectors | Select-Object -First 1
    if (-not $detectorId) {
        return New-CheckResult -Action "guardduty:GetDetector" -Label "GuardDuty Detector Details" -Scope "regional" -RegionName $RegionName -Status "UNTESTED" -Detail "no GuardDuty detectors available to probe"
    }

    $check = [pscustomobject]@{ Label = "GuardDuty Detector Details"; Action = "guardduty:GetDetector"; Cmd = @("guardduty", "get-detector", "--detector-id", $detectorId) }
    Invoke-DirectCheck -Check $check -Flags $Flags -Scope "regional" -RegionName $RegionName
}

function Get-RequiredActions {
    $actions = @(
        $GlobalChecks.Action
        "ec2:DescribeRegions"
        $RegionalChecks.Action
    )
    if (-not $SkipDependentChecks) { $actions += $DependentActions }
    $actions | Sort-Object -Unique
}

if ($ListActions) {
    Get-RequiredActions | ForEach-Object { Write-Output $_ }
    exit 0
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Error "AWS CLI was not found on PATH."
    exit 1
}

$profileLabel = if ($AwsProfile) { $AwsProfile } else { "default" }
$resolvedRegion = if ($Region) { $Region } else { Get-ConfiguredRegion }
if (-not $resolvedRegion) {
    $resolvedRegion = "us-east-1"
    Write-Host "No region was supplied or configured; using us-east-1 for permission probes." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "AWS Network Mapper permission preflight" -ForegroundColor Cyan
Write-Host "  Profile: $profileLabel"
Write-Host "  Region : $(if ($AllRegions) { 'all enabled regions' } else { $resolvedRegion })"
if ($Quick) { Write-Host "  Mode   : quick parent-permission check" }
elseif ($SkipDependentChecks) { Write-Host "  Mode   : direct checks only, dependent probes skipped" }
else { Write-Host "  Mode   : full check" }
Write-Host ""

$globalFlags = Get-AwsFlags -Global
$authFlags = Get-AwsFlags -RegionName $resolvedRegion
$authProbe = Invoke-AwsCli -Flags $authFlags -Cmd @("sts", "get-caller-identity")
if ($authProbe.exitCode -ne 0) {
    Write-Host "Could not authenticate with AWS CLI profile '$profileLabel'." -ForegroundColor Red
    Write-Host "  $($authProbe.text)" -ForegroundColor Red
    exit 1
}

$identity = ConvertFrom-JsonOutput -Raw $authProbe.raw
if ($identity) {
    Write-Host "Authenticated as $($identity.Arn)" -ForegroundColor Green
}

$results = @()
$regionFlags = Get-AwsFlags -RegionName $resolvedRegion
$regionProbe = Invoke-AwsCli -Flags $regionFlags -Cmd @("ec2", "describe-regions", "--query", "Regions[].RegionName")
$regionCheck = [pscustomobject]@{ Label = "AWS Regions"; Action = "ec2:DescribeRegions"; Cmd = @("ec2", "describe-regions", "--query", "Regions[].RegionName") }
$regionResult = Convert-ToCheckResult -Probe $regionProbe -Check $regionCheck -Scope "regional" -RegionName $resolvedRegion
$results += $regionResult
Write-CheckResult -Result $regionResult

if ($AllRegions -and $regionProbe.exitCode -eq 0) {
    $regions = @(ConvertFrom-JsonOutput -Raw $regionProbe.raw) | Where-Object { $_ }
    if (-not $regions) { $regions = @($resolvedRegion) }
} else {
    if ($AllRegions) {
        Write-Host "Falling back to $resolvedRegion because regions could not be enumerated." -ForegroundColor Yellow
    }
    $regions = @($resolvedRegion)
}

foreach ($check in $GlobalChecks) {
    $result = Invoke-DirectCheck -Check $check -Flags $globalFlags -Scope "global" -RegionName ""
    $results += $result
    Write-CheckResult -Result $result
}

if (-not $SkipDependentChecks) {
    $route53Result = Invoke-Route53RecordSetCheck -GlobalFlags $globalFlags
    $results += $route53Result
    Write-CheckResult -Result $route53Result
}

foreach ($reg in $regions) {
    Write-Host ""
    Write-Host "Regional checks: $reg" -ForegroundColor Cyan
    $flags = Get-AwsFlags -RegionName $reg
    foreach ($check in $RegionalChecks) {
        $result = Invoke-DirectCheck -Check $check -Flags $flags -Scope "regional" -RegionName $reg
        $results += $result
        Write-CheckResult -Result $result
    }

    if (-not $SkipDependentChecks) {
        foreach ($result in (Invoke-EcsDependentChecks -Flags $flags -RegionName $reg)) {
            $results += $result
            Write-CheckResult -Result $result
        }
        foreach ($result in (Invoke-KmsDependentChecks -Flags $flags -RegionName $reg)) {
            $results += $result
            Write-CheckResult -Result $result
        }
        foreach ($result in (Invoke-GuardDutyDependentChecks -Flags $flags -RegionName $reg)) {
            $results += $result
            Write-CheckResult -Result $result
        }
    }
}

$missing = @($results | Where-Object { $_.status -eq "MISSING" })
$errors = @($results | Where-Object { $_.status -eq "ERROR" })
$untested = @($results | Where-Object { $_.status -eq "UNTESTED" })

Write-Host ""
Write-Host "Summary" -ForegroundColor Cyan
Write-Host ("  OK       : {0}" -f @($results | Where-Object { $_.status -eq "OK" }).Count) -ForegroundColor Green
Write-Host ("  MISSING  : {0}" -f $missing.Count) -ForegroundColor $(if ($missing.Count) { "Red" } else { "Green" })
Write-Host ("  UNTESTED : {0}" -f $untested.Count) -ForegroundColor $(if ($untested.Count) { "Yellow" } else { "Green" })
Write-Host ("  ERROR    : {0}" -f $errors.Count) -ForegroundColor $(if ($errors.Count) { "Red" } else { "Green" })

if ($missing.Count) {
    Write-Host ""
    Write-Host "Missing actions:" -ForegroundColor Red
    $missing | Select-Object -ExpandProperty action -Unique | Sort-Object | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Red
    }
}

if ($OutputPath) {
    $report = [pscustomobject]@{
        generatedAt = (Get-Date).ToString("o")
        profile     = $profileLabel
        allRegions  = [bool]$AllRegions
        regions     = @($regions)
        results     = @($results)
        summary     = [pscustomobject]@{
            ok       = @($results | Where-Object { $_.status -eq "OK" }).Count
            missing  = $missing.Count
            untested = $untested.Count
            errors   = $errors.Count
        }
    }
    $report | ConvertTo-Json -Depth 6 | Out-File -FilePath $OutputPath -Encoding utf8
    Write-Host ""
    Write-Host "Wrote report: $OutputPath" -ForegroundColor Green
}

if ($missing.Count) { exit 2 }
if ($errors.Count) { exit 1 }
if ($Strict -and $untested.Count) { exit 3 }
exit 0
