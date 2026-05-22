#Requires -Version 7.0
<#
.SYNOPSIS
    AWS Network Mapper — Data Export Script (PowerShell)
.DESCRIPTION
    Exports all AWS CLI data needed for the web-based mapper tool.
    Outputs individual JSON files into a timestamped directory.
    Supports multi-region sweep and parallel execution.
.PARAMETER AwsProfile
    AWS CLI profile name (optional, uses default if omitted). -Profile is a
    supported alias. To create one:
      aws configure --profile my-profile
    Or for AWS SSO:
      aws configure sso --profile my-profile
      aws sso login --profile my-profile
    Then run this script with:
      ./export-aws-data.ps1 -Profile my-profile -AllRegions
.PARAMETER Region
    AWS region (optional, uses CLI default if omitted). Required for
    single-region export unless the profile or environment already has a
    default region. Use -AllRegions to export every enabled region.
.PARAMETER OutputDir
    Output directory (optional, creates timestamped dir)
.PARAMETER AllRegions
    Sweep all enabled regions, exporting each into subfolders
.PARAMETER MaxParallel
    Maximum parallel API calls (default: 6). Higher = faster but may hit rate limits.
.EXAMPLE
    ./export-aws-data.ps1
    ./export-aws-data.ps1 -Profile prod -Region us-west-2
    ./export-aws-data.ps1 -Profile prod -AllRegions -MaxParallel 8
    ./export-aws-data.ps1 -Profile prod -Region us-east-1 -OutputDir ./my-export
    ./export-aws-data.ps1 -Profiles prod,staging,dev -AllRegions
    ./export-aws-data.ps1 -Profiles prod,staging -Region us-east-1
#>
[CmdletBinding()]
param(
    [Alias("p","Profile")][string]$AwsProfile,
    [Alias("r")][string]$Region,
    [Alias("o")][string]$OutputDir,
    [switch]$AllRegions,
    [string[]]$Profiles,
    [int]$MaxParallel = 12
)

$ErrorActionPreference = "Stop"

# ─── Validation ────────────────────────────────────────────────
if ($AwsProfile -and $AwsProfile -notmatch '^[a-zA-Z0-9_-]+$') {
    Write-Error "Invalid profile name. Use only letters, numbers, hyphens, underscores."
    exit 1
}
if ($Region -and $Region -notmatch '^[a-zA-Z0-9-]+$') {
    Write-Error "Invalid region name. Use only letters, numbers, hyphens."
    exit 1
}

# Parse -Profiles into array, merge with -Profile for backward compat
$profileList = @()
if ($Profiles) {
    $profileList = @($Profiles | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    foreach ($p in $profileList) {
        if ($p -notmatch '^[a-zA-Z0-9_-]+$') {
            Write-Error "Invalid profile name '$p'. Use only letters, numbers, hyphens, underscores."
            exit 1
        }
    }
}
if ($AwsProfile -and $profileList.Count -eq 0) {
    $profileList = @($AwsProfile)
}

# Check AWS CLI
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Error "AWS CLI not found. Install from https://aws.amazon.com/cli/"
    exit 1
}

function Resolve-AwsRegion {
    param(
        [string]$ProfileName,
        [string]$RequestedRegion,
        [switch]$AllowFallback
    )

    if ($RequestedRegion) { return $RequestedRegion }
    if ($env:AWS_REGION -and $env:AWS_REGION -match '^[a-zA-Z0-9-]+$') { return $env:AWS_REGION }
    if ($env:AWS_DEFAULT_REGION -and $env:AWS_DEFAULT_REGION -match '^[a-zA-Z0-9-]+$') { return $env:AWS_DEFAULT_REGION }

    $configArgs = @("configure", "get", "region")
    if ($ProfileName) { $configArgs += @("--profile", $ProfileName) }
    try {
        $configured = (& aws @configArgs 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -eq 0 -and $configured -match '^[a-zA-Z0-9-]+$') {
            return $configured
        }
    } catch {}

    if ($AllowFallback) { return "us-east-1" }
    return $null
}

function Get-RegionDiscoveryFlags {
    param([string]$ProfileName)

    $discoveryRegion = Resolve-AwsRegion -ProfileName $ProfileName -RequestedRegion $Region -AllowFallback
    $flags = @()
    if ($ProfileName) { $flags += @("--profile", $ProfileName) }
    $flags += @("--region", $discoveryRegion)
    return $flags
}

function Write-RegionRequiredMessage {
    param([string]$ProfileName)

    $label = if ($ProfileName) { $ProfileName } else { "default" }
    Write-Host ""
    Write-Host "  No AWS region is configured for profile '$label'." -ForegroundColor Red
    Write-Host "  Use one of these:" -ForegroundColor Yellow
    if ($ProfileName) {
        Write-Host "    .\export-aws-data.ps1 -Profile $ProfileName -AllRegions"
        Write-Host "    .\export-aws-data.ps1 -Profile $ProfileName -Region us-east-1"
        Write-Host "    aws configure set region us-east-1 --profile $ProfileName"
    } else {
        Write-Host "    .\export-aws-data.ps1 -AllRegions"
        Write-Host "    .\export-aws-data.ps1 -Region us-east-1"
        Write-Host "    aws configure set region us-east-1"
    }
    Write-Host ""
}

function Format-AwsCliMessage {
    param(
        [object]$Value,
        [int]$MaxLength = 160
    )

    $message = ($Value | Out-String).Trim() -replace '\s+', ' '
    if (-not $message) { return "Unknown AWS CLI error" }
    if ($message.Length -gt $MaxLength) { return $message.Substring(0, $MaxLength) }
    return $message
}

function Test-AwsAccessDeniedMessage {
    param([string]$Message)

    return ($Message -match '(UnauthorizedOperation|AccessDenied|AccessDeniedException|AuthorizationError|not authorized|is not authorized)')
}

function ConvertTo-IamActionName {
    param([string[]]$Cmd)

    if (-not $Cmd -or $Cmd.Count -lt 2) { return $null }
    $service = $Cmd[0]
    $operation = $Cmd[1]

    $serviceMap = @{
        "accessanalyzer" = "access-analyzer"
        "configservice" = "config"
        "elbv2"         = "elasticloadbalancing"
        "s3api"         = "s3"
    }
    if ($serviceMap.ContainsKey($service)) { $service = $serviceMap[$service] }

    if ($service -eq "apigateway") { return "apigateway:GET" }
    if ($service -eq "s3" -and $operation -eq "list-buckets") { return "s3:ListAllMyBuckets" }
    if ($service -eq "wafv2" -and $operation -eq "list-web-acls") { return "wafv2:ListWebACLs" }

    $action = ($operation -split '-' | ForEach-Object {
        if (-not $_) { return }
        $_.Substring(0, 1).ToUpperInvariant() + $_.Substring(1)
    }) -join ''

    return "${service}:${action}"
}

function New-AwsCliFailure {
    param(
        [string]$Label,
        [object]$Value,
        [string]$Action
    )

    $rawMessage = Format-AwsCliMessage -Value $Value -MaxLength 1000
    if (Test-AwsAccessDeniedMessage -Message $rawMessage) {
        $detail = if ($Action) {
            "access denied - missing $Action"
        } else {
            "access denied - missing required read permission"
        }
    } else {
        $detail = Format-AwsCliMessage -Value $Value -MaxLength 220
    }

    return @{
        Label     = $Label
        Status    = "ERROR"
        Detail    = $detail
        RawDetail = $rawMessage
    }
}

function Test-AwsInventoryAccess {
    param(
        [string[]]$Flags,
        [string]$RegionName,
        [string]$ProfileName,
        [string]$OutPath
    )

    Write-Host "  Preflight EC2 read access..." -NoNewline
    $raw = & aws @Flags ec2 describe-vpcs --max-results 5 --output json 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
        return $true
    }

    $message = Format-AwsCliMessage -Value $raw -MaxLength 1000
    $label = if ($ProfileName) { $ProfileName } else { "default" }
    $detail = if (Test-AwsAccessDeniedMessage -Message $message) {
        "access denied - missing ec2:DescribeVpcs"
    } else {
        Format-AwsCliMessage -Value $raw -MaxLength 220
    }
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "    $detail" -ForegroundColor Red
    Write-Host "    Profile '$label' is logged in, but cannot read EC2 inventory in $RegionName." -ForegroundColor Yellow
    Write-Host "    Choose an AWS SSO role/permission set with ReadOnlyAccess or equivalent Describe/List/Get permissions." -ForegroundColor Yellow
    Write-Host "    Run .\scripts\enumerate-aws-permissions.ps1 to test the full mapper permission set." -ForegroundColor Yellow

    if ($OutPath) {
        New-Item -ItemType Directory -Path $OutPath -Force | Out-Null
        @(
            [pscustomobject]@{
                label     = "Preflight EC2 read access"
                status    = "ERROR"
                detail    = $detail
                rawDetail = $message
            }
        ) | ConvertTo-Json -Depth 3 |
            Out-File -FilePath (Join-Path $OutPath "_export-log.json") -Encoding utf8
    }
    return $false
}

# ─── Common flags ──────────────────────────────────────────────
$awsFlags = @()
if ($AwsProfile) { $awsFlags += @("--profile", $AwsProfile) }

function Get-BaseFlags([string]$reg) {
    $flags = @()
    if ($AwsProfile) { $flags += @("--profile", $AwsProfile) }
    if ($reg) { $flags += @("--region", $reg) }
    return $flags
}

function Test-RegionHasResources([string[]]$Flags) {
    # Quick check: count non-default VPCs. Skip region if only default VPC or none.
    try {
        $raw = & aws @Flags ec2 describe-vpcs --query 'Vpcs[?IsDefault==`false`].VpcId' --output json 2>&1
        if ($LASTEXITCODE -ne 0) {
            $script:LastRegionProbeError = Format-AwsCliMessage -Value $raw -MaxLength 1000
            return $null
        }
        $vpcs = $raw | ConvertFrom-Json
        return ($vpcs.Count -gt 0)
    } catch {
        $script:LastRegionProbeError = Format-AwsCliMessage -Value $_.Exception.Message -MaxLength 1000
        return $null
    }
}

# ─── Export definitions ────────────────────────────────────────
# Each export: [label, filename, aws-service, aws-command, ...extra-args]
$exports = @(
    # Network
    @{ Label="VPCs";                  File="vpcs.json";                 Cmd=@("ec2","describe-vpcs") },
    @{ Label="Subnets";              File="subnets.json";              Cmd=@("ec2","describe-subnets") },
    @{ Label="Route Tables";         File="route-tables.json";         Cmd=@("ec2","describe-route-tables") },
    @{ Label="Security Groups";      File="security-groups.json";      Cmd=@("ec2","describe-security-groups") },
    @{ Label="Network ACLs";         File="network-acls.json";         Cmd=@("ec2","describe-network-acls") },
    @{ Label="ENIs";                 File="network-interfaces.json";   Cmd=@("ec2","describe-network-interfaces") },
    # Gateways
    @{ Label="Internet Gateways";    File="internet-gateways.json";    Cmd=@("ec2","describe-internet-gateways") },
    @{ Label="NAT Gateways";         File="nat-gateways.json";         Cmd=@("ec2","describe-nat-gateways") },
    @{ Label="VPC Endpoints";        File="vpc-endpoints.json";        Cmd=@("ec2","describe-vpc-endpoints") },
    # Compute
    @{ Label="EC2 Instances";        File="ec2-instances.json";        Cmd=@("ec2","describe-instances") },
    @{ Label="RDS Instances";        File="rds-instances.json";        Cmd=@("rds","describe-db-instances") },
    @{ Label="Lambda Functions";     File="lambda-functions.json";     Cmd=@("lambda","list-functions") },
    @{ Label="ElastiCache";          File="elasticache-clusters.json"; Cmd=@("elasticache","describe-cache-clusters","--show-cache-node-info") },
    @{ Label="Redshift";             File="redshift-clusters.json";    Cmd=@("redshift","describe-clusters") },
    # Load Balancing
    @{ Label="ALBs / NLBs";         File="load-balancers.json";       Cmd=@("elbv2","describe-load-balancers") },
    @{ Label="Target Groups";        File="target-groups.json";        Cmd=@("elbv2","describe-target-groups") },
    # Connectivity
    @{ Label="VPC Peering";          File="vpc-peering.json";          Cmd=@("ec2","describe-vpc-peering-connections") },
    @{ Label="VPN Connections";      File="vpn-connections.json";      Cmd=@("ec2","describe-vpn-connections") },
    @{ Label="TGW Attachments";      File="tgw-attachments.json";      Cmd=@("ec2","describe-transit-gateway-attachments") },
    # Storage
    @{ Label="EBS Volumes";          File="volumes.json";              Cmd=@("ec2","describe-volumes") },
    @{ Label="EBS Snapshots";        File="snapshots.json";            Cmd=@("ec2","describe-snapshots","--owner-ids","self") },
    @{ Label="S3 Buckets";           File="s3-buckets.json";           Cmd=@("s3api","list-buckets") },
    # DNS
    @{ Label="Route 53 Zones";       File="hosted-zones.json";        Cmd=@("route53","list-hosted-zones") },
    # Security
    @{ Label="WAF WebACLs";          File="waf-web-acls.json";        Cmd=@("wafv2","list-web-acls","--scope","REGIONAL") },
    @{ Label="CloudFront";           File="cloudfront.json";           Cmd=@("cloudfront","list-distributions") },
    # IAM
    @{ Label="IAM Authorization";    File="iam.json";                  Cmd=@("iam","get-account-authorization-details") },
    # Governance / Security Posture
    @{ Label="CloudTrail Trails";     File="cloudtrail-trails.json";     Cmd=@("cloudtrail","describe-trails") },
    @{ Label="CloudWatch Alarms";     File="cloudwatch-alarms.json";     Cmd=@("cloudwatch","describe-alarms") },
    @{ Label="CloudWatch Log Groups"; File="log-groups.json";            Cmd=@("logs","describe-log-groups") },
    @{ Label="VPC Flow Logs";         File="flow-logs.json";             Cmd=@("ec2","describe-flow-logs") },
    @{ Label="Config Recorders";      File="config-recorders.json";      Cmd=@("configservice","describe-configuration-recorders") },
    @{ Label="Config Rules";          File="config-rules.json";          Cmd=@("configservice","describe-config-rules") },
    @{ Label="Config Conformance";    File="config-conformance-packs.json"; Cmd=@("configservice","describe-conformance-packs") },
    @{ Label="Security Hub Standards";File="securityhub-standards.json"; Cmd=@("securityhub","get-enabled-standards") },
    @{ Label="IAM Access Analyzer";   File="access-analyzers.json";      Cmd=@("accessanalyzer","list-analyzers") },
    @{ Label="Secrets Manager";       File="secrets.json";               Cmd=@("secretsmanager","list-secrets") },
    @{ Label="SSM Parameters";        File="ssm-parameters.json";        Cmd=@("ssm","describe-parameters") },
    # Containers / Compute
    @{ Label="ECR Repositories";      File="ecr-repositories.json";      Cmd=@("ecr","describe-repositories") },
    @{ Label="Auto Scaling Groups";   File="auto-scaling-groups.json";   Cmd=@("autoscaling","describe-auto-scaling-groups") },
    # Integration
    @{ Label="API Gateway REST APIs"; File="api-gateways.json";          Cmd=@("apigateway","get-rest-apis") },
    @{ Label="SNS Topics";            File="sns-topics.json";            Cmd=@("sns","list-topics") },
    @{ Label="SQS Queues";            File="sqs-queues.json";            Cmd=@("sqs","list-queues") }
)

foreach ($export in $exports) {
    $export["Action"] = ConvertTo-IamActionName -Cmd $export.Cmd
}

# ─── Single-export runner ──────────────────────────────────────
function Invoke-AwsExport {
    param(
        [string]$Label,
        [string]$File,
        [string[]]$Cmd,
        [string[]]$Flags,
        [string]$OutPath
    )
    $filePath = Join-Path $OutPath $File
    try {
        $result = & aws @Flags @Cmd 2>&1
        if ($LASTEXITCODE -eq 0) {
            $json = ($result | Out-String) | ConvertFrom-Json
            $hasData = $false
            foreach ($prop in $json.PSObject.Properties) {
                if ($prop.Value -is [System.Array] -and $prop.Value.Count -gt 0) {
                    $hasData = $true; break
                }
            }
            if (-not $hasData) {
                return @{ Label=$Label; Status="EMPTY"; Detail="no data" }
            }
            $result | Out-File -FilePath $filePath -Encoding utf8
            $size = (Get-Item $filePath).Length
            return @{ Label=$Label; Status="OK"; Detail="${size} bytes" }
        } else {
            return New-AwsCliFailure -Label $Label -Value $result -Action (ConvertTo-IamActionName -Cmd $Cmd)
        }
    } catch {
        return New-AwsCliFailure -Label $Label -Value $_.Exception.Message -Action (ConvertTo-IamActionName -Cmd $Cmd)
    }
}

# ─── Multi-step: Route 53 records (pure PowerShell) ────────────
function Export-Route53Records {
    param([string[]]$Flags, [string]$OutPath)
    $zonesFile = Join-Path $OutPath "hosted-zones.json"
    if (-not (Test-Path $zonesFile)) { return }
    $zones = (Get-Content $zonesFile -Raw | ConvertFrom-Json).HostedZones
    if (-not $zones -or $zones.Count -eq 0) { return }

    $allRecords = @()
    foreach ($zone in $zones) {
        $zoneId = $zone.Id -replace '/hostedzone/', ''
        if ($zoneId -notmatch '^[A-Z0-9]+$') { continue }
        Write-Host "    Records ($zoneId)..." -NoNewline
        try {
            $raw = & aws @Flags route53 list-resource-record-sets --hosted-zone-id $zoneId 2>&1
            if ($LASTEXITCODE -eq 0) {
                $data = $raw | ConvertFrom-Json
                $allRecords += $data.ResourceRecordSets
                Write-Host " OK" -ForegroundColor Green
            } else {
                Write-Host " SKIP" -ForegroundColor Yellow
            }
        } catch {
            Write-Host " SKIP" -ForegroundColor Yellow
        }
    }
    if ($allRecords.Count -gt 0) {
        @{ RecordSets = $allRecords } | ConvertTo-Json -Depth 10 |
            Out-File -FilePath (Join-Path $OutPath "r53-records.json") -Encoding utf8
    }
}

# ─── Multi-step: ECS services (pure PowerShell) ────────────────
function Export-EcsServices {
    param([string[]]$Flags, [string]$OutPath)
    Write-Host "    ECS Services..." -NoNewline
    try {
        $raw = & aws @Flags ecs list-clusters --query 'clusterArns[]' --output json 2>&1
        if ($LASTEXITCODE -ne 0 -or -not $raw) {
            Write-Host " SKIP (no clusters)" -ForegroundColor Yellow
            return
        }
        $clusters = $raw | ConvertFrom-Json
        if (-not $clusters -or $clusters.Count -eq 0) {
            Write-Host " SKIP (no clusters)" -ForegroundColor Yellow
            return
        }
        $allServices = @()
        foreach ($cluster in $clusters) {
            if ($cluster -notmatch '^arn:aws') { continue }
            $svcRaw = & aws @Flags ecs list-services --cluster $cluster --query 'serviceArns[]' --output json 2>$null
            if ($LASTEXITCODE -ne 0 -or -not $svcRaw) { continue }
            $svcArns = $svcRaw | ConvertFrom-Json
            foreach ($svcArn in $svcArns) {
                if ($svcArn -notmatch '^arn:aws') { continue }
                $descRaw = & aws @Flags ecs describe-services --cluster $cluster --services $svcArn 2>$null
                if ($LASTEXITCODE -eq 0 -and $descRaw) {
                    $desc = $descRaw | ConvertFrom-Json
                    $allServices += $desc.services
                }
            }
        }
        @{ services = $allServices } | ConvertTo-Json -Depth 10 |
            Out-File -FilePath (Join-Path $OutPath "ecs-services.json") -Encoding utf8
        Write-Host " OK ($($allServices.Count) services)" -ForegroundColor Green
    } catch {
        $errMsg = if ($_.Exception.Message) { $_.Exception.Message.Substring(0, [Math]::Min(40, $_.Exception.Message.Length)) } else { "Unknown error" }
        Write-Host " SKIP ($errMsg)" -ForegroundColor Yellow
    }
}

# ─── Multi-step: KMS keys (customer-managed + rotation) ───────
function Export-KmsKeys {
    param([string[]]$Flags, [string]$OutPath)
    Write-Host "    KMS Keys..." -NoNewline
    try {
        $raw = & aws @Flags kms list-keys --query 'Keys[].KeyId' --output json 2>&1
        if ($LASTEXITCODE -ne 0 -or -not $raw) {
            Write-Host " SKIP" -ForegroundColor Yellow
            return
        }
        $keyIds = $raw | ConvertFrom-Json
        if (-not $keyIds -or $keyIds.Count -eq 0) {
            Write-Host " SKIP (no keys)" -ForegroundColor Yellow
            return
        }
        $allKeys = @()
        foreach ($keyId in $keyIds) {
            $descRaw = & aws @Flags kms describe-key --key-id $keyId 2>$null
            if ($LASTEXITCODE -ne 0 -or -not $descRaw) { continue }
            $desc = ($descRaw | ConvertFrom-Json).KeyMetadata
            if ($desc.KeyManager -eq "AWS") { continue }
            $rotRaw = & aws @Flags kms get-key-rotation-status --key-id $keyId 2>$null
            $rotation = if ($LASTEXITCODE -eq 0 -and $rotRaw) {
                ($rotRaw | ConvertFrom-Json).KeyRotationEnabled
            } else { $null }
            $desc | Add-Member -NotePropertyName "KeyRotationEnabled" -NotePropertyValue $rotation -Force
            $allKeys += $desc
        }
        if ($allKeys.Count -gt 0) {
            @{ Keys = $allKeys } | ConvertTo-Json -Depth 10 |
                Out-File -FilePath (Join-Path $OutPath "kms-keys.json") -Encoding utf8
        }
        Write-Host " OK ($($allKeys.Count) customer keys)" -ForegroundColor Green
    } catch {
        $errMsg = if ($_.Exception.Message) { $_.Exception.Message.Substring(0, [Math]::Min(40, $_.Exception.Message.Length)) } else { "Unknown error" }
        Write-Host " SKIP ($errMsg)" -ForegroundColor Yellow
    }
}

# ─── Multi-step: GuardDuty detectors ─────────────────────────
function Export-GuardDuty {
    param([string[]]$Flags, [string]$OutPath)
    Write-Host "    GuardDuty..." -NoNewline
    try {
        $raw = & aws @Flags guardduty list-detectors --query 'DetectorIds[]' --output json 2>&1
        if ($LASTEXITCODE -ne 0 -or -not $raw) {
            Write-Host " SKIP" -ForegroundColor Yellow
            return
        }
        $detectorIds = $raw | ConvertFrom-Json
        if (-not $detectorIds -or $detectorIds.Count -eq 0) {
            Write-Host " SKIP (no detectors)" -ForegroundColor Yellow
            return
        }
        $allDetectors = @()
        foreach ($detId in $detectorIds) {
            $descRaw = & aws @Flags guardduty get-detector --detector-id $detId 2>$null
            if ($LASTEXITCODE -eq 0 -and $descRaw) {
                $desc = $descRaw | ConvertFrom-Json
                $desc | Add-Member -NotePropertyName "DetectorId" -NotePropertyValue $detId -Force
                $allDetectors += $desc
            }
        }
        if ($allDetectors.Count -gt 0) {
            @{ Detectors = $allDetectors } | ConvertTo-Json -Depth 10 |
                Out-File -FilePath (Join-Path $OutPath "guardduty-detectors.json") -Encoding utf8
        }
        Write-Host " OK ($($allDetectors.Count) detectors)" -ForegroundColor Green
    } catch {
        $errMsg = if ($_.Exception.Message) { $_.Exception.Message.Substring(0, [Math]::Min(40, $_.Exception.Message.Length)) } else { "Unknown error" }
        Write-Host " SKIP ($errMsg)" -ForegroundColor Yellow
    }
}

# ─── Region export orchestrator ────────────────────────────────
function Export-Region {
    param(
        [string]$RegionName,
        [string]$OutPath,
        [int]$Parallel
    )
    $flags = Get-BaseFlags $RegionName
    New-Item -ItemType Directory -Path $OutPath -Force | Out-Null

    if (-not (Test-AwsInventoryAccess -Flags $flags -RegionName $RegionName -ProfileName $AwsProfile -OutPath $OutPath)) {
        return
    }

    # Run all standard exports in parallel
    $results = $exports | ForEach-Object -ThrottleLimit $Parallel -Parallel {
        $localFlags = $using:flags
        $localOutPath = $using:OutPath
        $filePath = Join-Path $localOutPath $_.File
        try {
            $result = & aws @localFlags @($_.Cmd) 2>&1
            if ($LASTEXITCODE -eq 0) {
                $json = ($result | Out-String) | ConvertFrom-Json
                $hasData = $false
                foreach ($prop in $json.PSObject.Properties) {
                    if ($prop.Value -is [System.Array] -and $prop.Value.Count -gt 0) {
                        $hasData = $true; break
                    }
                }
                if ($hasData) {
                    $result | Out-File -FilePath $filePath -Encoding utf8
                    $size = (Get-Item $filePath).Length
                    @{ Label=$_.Label; Status="OK"; Detail="${size} bytes" }
                } else {
                    @{ Label=$_.Label; Status="EMPTY"; Detail="no data" }
                }
            } else {
                $rawMessage = ($result | Out-String).Trim() -replace '\s+', ' '
                if (-not $rawMessage) { $rawMessage = "Unknown AWS CLI error" }
                $detail = if ($rawMessage -match '(UnauthorizedOperation|AccessDenied|AccessDeniedException|AuthorizationError|not authorized|is not authorized)') {
                    if ($_.Action) { "access denied - missing $($_.Action)" } else { "access denied - missing required read permission" }
                } else {
                    if ($rawMessage.Length -gt 220) { $rawMessage.Substring(0, 220) } else { $rawMessage }
                }
                @{ Label=$_.Label; Status="ERROR"; Detail=$detail; RawDetail=$rawMessage }
            }
        } catch {
            $rawMessage = if ($_.Exception.Message) { $_.Exception.Message } else { "Unknown error" }
            @{ Label=$_.Label; Status="ERROR"; Detail=$rawMessage; RawDetail=$rawMessage }
        }
    }

    # Print results
    foreach ($r in $results) {
        $color = switch ($r.Status) {
            "OK"    { "Green" }
            "EMPTY" { "Yellow" }
            "ERROR" { "Red" }
            default { "Yellow" }
        }
        $line = "  {0,-35} {1} ({2})" -f $r.Label, $r.Status, $r.Detail
        Write-Host $line -ForegroundColor $color
    }

    # Multi-step exports (sequential — they depend on prior outputs)
    Write-Host ""
    Write-Host "  Multi-step exports:" -ForegroundColor Cyan
    Export-Route53Records -Flags $flags -OutPath $OutPath
    Export-EcsServices -Flags $flags -OutPath $OutPath
    Export-KmsKeys -Flags $flags -OutPath $OutPath
    Export-GuardDuty -Flags $flags -OutPath $OutPath

    # Write export log
    $logEntries = @($results | ForEach-Object {
        $entry = @{ label = $_.Label; status = $_.Status }
        if ($_.Detail) { $entry.detail = $_.Detail }
        if ($_.RawDetail) { $entry.rawDetail = $_.RawDetail }
        if ($_.Status -eq "OK" -and $_.Detail -match '(\d+) bytes') {
            $entry.bytes = [int]$Matches[1]
        }
        $entry
    })
    $logEntries | ConvertTo-Json -Depth 3 |
        Out-File -FilePath (Join-Path $OutPath "_export-log.json") -Encoding utf8
}

# ─── Main ──────────────────────────────────────────────────────
$banner = @"

  ╔══════════════════════════════════════════════════════╗
  ║       AWS Network Mapper — Data Export (PS)          ║
  ╚══════════════════════════════════════════════════════╝

"@
Write-Host $banner -ForegroundColor Magenta

if ($Profiles) {
    # Multi-profile mode (even single -Profiles value nests into profile subfolder)
    Write-Host "  Mode    : Multi-Profile ($($profileList.Count) profiles, parallel x$MaxParallel)" -ForegroundColor Cyan
    Write-Host "  Profiles: $($profileList -join ', ')"
    if ($AllRegions) { Write-Host "  Regions : All (auto-discover per profile)" }
    elseif ($Region) { Write-Host "  Region  : $Region" }
    else { Write-Host "  Region  : default" }
    Write-Host ""

    if (-not $OutputDir) {
        $ts = Get-Date -Format "yyyyMMdd-HHmmss"
        $OutputDir = "./aws-export-multi-${ts}"
    }
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    Write-Host "  Output  : $OutputDir"
    Write-Host ""

    $profIdx = 0
    foreach ($prof in $profileList) {
        $profIdx++
        $AwsProfile = $prof
        $awsFlags = @("--profile", $prof)
        $profDir = Join-Path $OutputDir $prof

        Write-Host ""
        Write-Host "  ╔═ Profile $profIdx/$($profileList.Count): $prof ═══════════════════════" -ForegroundColor Magenta

        if ($AllRegions) {
            $regionFlags = Get-RegionDiscoveryFlags -ProfileName $prof
            $regRaw = & aws @regionFlags ec2 describe-regions --query 'Regions[].RegionName' --output json 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  ║ Failed to list regions for profile '$prof': $regRaw" -ForegroundColor Red
                Write-Host "  ╚═ Skipped" -ForegroundColor Red
                continue
            }
            $regions = $regRaw | ConvertFrom-Json | Sort-Object
            Write-Host "  ║ Found $($regions.Count) regions" -ForegroundColor Green

            $regionIdx = 0
            $skipped = 0
            foreach ($reg in $regions) {
                $regionIdx++
                $regFlags = Get-BaseFlags $reg
                $hasResources = Test-RegionHasResources $regFlags
                if ($null -eq $hasResources) {
                    $regDir = Join-Path $profDir $reg
                    Test-AwsInventoryAccess -Flags $regFlags -RegionName $reg -ProfileName $prof -OutPath $regDir | Out-Null
                    Write-Host "  ║ Stopping profile '$prof': EC2 Describe permissions are required for inventory export." -ForegroundColor Red
                    break
                }
                if (-not $hasResources) {
                    $skipped++
                    Write-Host "  ║   Region $regionIdx/$($regions.Count): $reg — no resources, skipping" -ForegroundColor DarkGray
                    continue
                }
                $regDir = Join-Path $profDir $reg
                Write-Host ""
                Write-Host "  ║ ┌─ Region $regionIdx/$($regions.Count): $reg ─────────────────────" -ForegroundColor Cyan
                Export-Region -RegionName $reg -OutPath $regDir -Parallel $MaxParallel
                $fileCount = (Get-ChildItem -Path $regDir -Filter "*.json" -ErrorAction SilentlyContinue | Measure-Object).Count
                Write-Host "  ║ └─ $fileCount files" -ForegroundColor Cyan
            }
            if ($skipped) { Write-Host "  ║ Skipped $skipped empty regions" -ForegroundColor DarkGray }
        } else {
            $exportRegion = Resolve-AwsRegion -ProfileName $prof -RequestedRegion $Region
            if (-not $exportRegion) {
                Write-RegionRequiredMessage -ProfileName $prof
                Write-Host "  ╚═ Profile '$prof' skipped: no region" -ForegroundColor Red
                continue
            }
            Export-Region -RegionName $exportRegion -OutPath $profDir -Parallel $MaxParallel
        }

        $profFiles = (Get-ChildItem -Path $profDir -Filter "*.json" -Recurse -ErrorAction SilentlyContinue | Measure-Object).Count
        Write-Host "  ╚═ Profile '$prof' complete: $profFiles files" -ForegroundColor Magenta
    }
} elseif ($AllRegions) {
    # Discover enabled regions
    Write-Host "  Mode    : All Regions (parallel x$MaxParallel)" -ForegroundColor Cyan
    Write-Host "  Profile : $($AwsProfile ? $AwsProfile : 'default')"
    Write-Host ""

    $regionFlags = Get-RegionDiscoveryFlags -ProfileName $AwsProfile
    $regRaw = & aws @regionFlags ec2 describe-regions --query 'Regions[].RegionName' --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to list regions: $regRaw"
        exit 1
    }
    $regions = $regRaw | ConvertFrom-Json | Sort-Object

    if (-not $OutputDir) {
        $ts = Get-Date -Format "yyyyMMdd-HHmmss"
        $label = if ($AwsProfile) { $AwsProfile } else { "default" }
        $OutputDir = "./aws-export-${label}-allregions-${ts}"
    }
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

    Write-Host "  Found $($regions.Count) regions" -ForegroundColor Green
    Write-Host "  Output: $OutputDir"
    Write-Host ""

    $regionIdx = 0
    $skipped = 0
    foreach ($reg in $regions) {
        $regionIdx++
        $regFlags = Get-BaseFlags $reg
        $hasResources = Test-RegionHasResources $regFlags
        if ($null -eq $hasResources) {
            $regDir = Join-Path $OutputDir $reg
            Test-AwsInventoryAccess -Flags $regFlags -RegionName $reg -ProfileName $AwsProfile -OutPath $regDir | Out-Null
            Write-Host "  Stopping all-region export: EC2 Describe permissions are required for inventory export." -ForegroundColor Red
            break
        }
        if (-not $hasResources) {
            $skipped++
            Write-Host "    Region $regionIdx/$($regions.Count): $reg — no resources, skipping" -ForegroundColor DarkGray
            continue
        }
        $regDir = Join-Path $OutputDir $reg
        Write-Host ""
        Write-Host "  ┌─ Region $regionIdx/$($regions.Count): $reg ─────────────────────" -ForegroundColor Cyan
        Export-Region -RegionName $reg -OutPath $regDir -Parallel $MaxParallel
        $fileCount = (Get-ChildItem -Path $regDir -Filter "*.json" -ErrorAction SilentlyContinue | Measure-Object).Count
        Write-Host "  └─ $fileCount files" -ForegroundColor Cyan
    }
    if ($skipped) { Write-Host "  Skipped $skipped empty regions" -ForegroundColor DarkGray }
} else {
    # Single region
    $exportRegion = Resolve-AwsRegion -ProfileName $AwsProfile -RequestedRegion $Region
    if (-not $exportRegion) {
        Write-RegionRequiredMessage -ProfileName $AwsProfile
        exit 1
    }
    $displayRegion = $exportRegion
    Write-Host "  Profile : $($AwsProfile ? $AwsProfile : 'default')"
    Write-Host "  Region  : $displayRegion"
    Write-Host "  Parallel: $MaxParallel concurrent calls"

    if (-not $OutputDir) {
        $ts = Get-Date -Format "yyyyMMdd-HHmmss"
        $label = if ($AwsProfile) { $AwsProfile } else { "default" }
        $OutputDir = "./aws-export-${label}-${ts}"
    }

    Write-Host "  Output  : $OutputDir"
    Write-Host ""

    Export-Region -RegionName $exportRegion -OutPath $OutputDir -Parallel $MaxParallel
}

function Get-ExportSummary {
    param([string]$RootPath)

    $jsonFiles = @(Get-ChildItem -Path $RootPath -Filter "*.json" -Recurse -ErrorAction SilentlyContinue)
    $dataFiles = @($jsonFiles | Where-Object { $_.Name -ne "_export-log.json" })
    $logs = @($jsonFiles | Where-Object { $_.Name -eq "_export-log.json" })
    $okCount = 0
    $errorCount = 0
    $emptyCount = 0

    foreach ($log in $logs) {
        try {
            $entries = @(Get-Content -LiteralPath $log.FullName -Raw | ConvertFrom-Json)
            foreach ($entry in $entries) {
                switch ($entry.status) {
                    "OK" { $okCount++ }
                    "ERROR" { $errorCount++ }
                    "EMPTY" { $emptyCount++ }
                }
            }
        } catch {}
    }

    [pscustomobject]@{
        JsonFiles   = $jsonFiles
        DataFiles   = $dataFiles
        Logs        = $logs
        OkCount     = $okCount
        ErrorCount  = $errorCount
        EmptyCount  = $emptyCount
    }
}

# ─── Summary ───────────────────────────────────────────────────
Write-Host ""
$summary = Get-ExportSummary -RootPath $OutputDir
$fileCount = ($summary.DataFiles | Measure-Object).Count
$totalBytes = ($summary.DataFiles | Measure-Object -Property Length -Sum).Sum
$totalSize = if ($totalBytes -gt 1MB) { "{0:N1} MB" -f ($totalBytes / 1MB) }
             elseif ($totalBytes -gt 1KB) { "{0:N0} KB" -f ($totalBytes / 1KB) }
             else { "$totalBytes bytes" }

Write-Host "  ═══════════════════════════════════════════════════════" -ForegroundColor Magenta
if ($summary.ErrorCount -gt 0 -and $summary.OkCount -eq 0) {
    Write-Host "  Export failed: no importable AWS data files were written." -ForegroundColor Red
    Write-Host "  $($summary.ErrorCount) AWS inventory call(s) were denied or failed." -ForegroundColor Red
    Write-Host "  The selected profile is logged in, but its AWS role needs read-only inventory permissions." -ForegroundColor Yellow
    Write-Host "  Ask for ReadOnlyAccess or equivalent Describe/List/Get permissions, then rerun the export." -ForegroundColor Yellow
    Write-Host "  Output: $OutputDir" -ForegroundColor Yellow
    Write-Host "  ═══════════════════════════════════════════════════════" -ForegroundColor Magenta
    Write-Host ""
    exit 2
}

if ($summary.ErrorCount -gt 0) {
    Write-Host "  Done with warnings: $fileCount data files exported ($totalSize)" -ForegroundColor Yellow
    Write-Host "  $($summary.ErrorCount) AWS inventory call(s) were denied or failed." -ForegroundColor Yellow
} else {
    Write-Host "  Done! $fileCount data files exported ($totalSize)" -ForegroundColor Green
}
Write-Host "  Output: $OutputDir" -ForegroundColor Green
Write-Host ""
Write-Host "  To use: drag the folder onto the mapper's"
Write-Host "  'UPLOAD JSON FILES' button, or open individual"
Write-Host "  files and paste into the corresponding text areas."
Write-Host "  ═══════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""
