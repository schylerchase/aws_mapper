#Requires -Version 7.0
<#
.SYNOPSIS
    AWS Network Mapper — Data Export Script (PowerShell)
.DESCRIPTION
    Exports all AWS CLI data needed for the web-based mapper tool.
    Outputs individual JSON files into a timestamped directory.
    Supports multi-region sweep and parallel execution.
.PARAMETER Profile
    AWS CLI profile name (optional, uses default if omitted)
.PARAMETER Region
    AWS region (optional, uses CLI default if omitted)
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
    [Alias("p")][string]$Profile,
    [Alias("r")][string]$Region,
    [Alias("o")][string]$OutputDir,
    [switch]$AllRegions,
    [string[]]$Profiles,
    [int]$MaxParallel = 12
)

$ErrorActionPreference = "Stop"

# Prevent PowerShell's automatic $PROFILE from being mistaken for user input
if (-not $PSBoundParameters.ContainsKey('Profile')) {
    $Profile = $null
}

# ─── Validation ────────────────────────────────────────────────
if ($Profile -and $Profile -notmatch '^[a-zA-Z0-9_-]+$') {
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
if ($Profile -and $profileList.Count -eq 0) {
    $profileList = @($Profile)
}

# Check AWS CLI
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Error "AWS CLI not found. Install from https://aws.amazon.com/cli/"
    exit 1
}

# ─── Common flags ──────────────────────────────────────────────
$awsFlags = @()
if ($Profile) { $awsFlags += @("--profile", $Profile) }

function Get-BaseFlags([string]$reg) {
    $flags = @()
    if ($Profile) { $flags += @("--profile", $Profile) }
    if ($reg) { $flags += @("--region", $reg) }
    return $flags
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
    @{ Label="IAM Authorization";    File="iam.json";                  Cmd=@("iam","get-account-authorization-details") }
)

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
            $result | Out-File -FilePath $filePath -Encoding utf8
            $size = (Get-Item $filePath).Length
            return @{ Label=$Label; Status="OK"; Detail="${size} bytes" }
        } else {
            $msg = ($result | Out-String).Trim()
            if ($msg.Length -gt 60) { $msg = $msg.Substring(0, 60) }
            return @{ Label=$Label; Status="SKIP"; Detail=$msg }
        }
    } catch {
        $errMsg = if ($_.Exception.Message) {
            $_.Exception.Message.Substring(0, [Math]::Min(60, $_.Exception.Message.Length))
        } else { "Unknown error" }
        return @{ Label=$Label; Status="SKIP"; Detail=$errMsg }
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

# ─── Region export orchestrator ────────────────────────────────
function Export-Region {
    param(
        [string]$RegionName,
        [string]$OutPath,
        [int]$Parallel
    )
    $flags = Get-BaseFlags $RegionName
    New-Item -ItemType Directory -Path $OutPath -Force | Out-Null

    # Run all standard exports in parallel
    $results = $exports | ForEach-Object -ThrottleLimit $Parallel -Parallel {
        $localFlags = $using:flags
        $localOutPath = $using:OutPath
        $filePath = Join-Path $localOutPath $_.File
        try {
            $result = & aws @localFlags @($_.Cmd) 2>&1
            if ($LASTEXITCODE -eq 0) {
                $result | Out-File -FilePath $filePath -Encoding utf8
                $size = (Get-Item $filePath).Length
                @{ Label=$_.Label; Status="OK"; Detail="${size} bytes" }
            } else {
                $msg = ($result | Out-String).Trim()
                if ($msg.Length -gt 60) { $msg = $msg.Substring(0, 60) }
                @{ Label=$_.Label; Status="SKIP"; Detail=$msg }
            }
        } catch {
            $errMsg = if ($_.Exception.Message) {
                $_.Exception.Message.Substring(0, [Math]::Min(60, $_.Exception.Message.Length))
            } else { "Unknown error" }
            @{ Label=$_.Label; Status="SKIP"; Detail=$errMsg }
        }
    }

    # Print results
    foreach ($r in $results) {
        $color = if ($r.Status -eq "OK") { "Green" } else { "Yellow" }
        $line = "  {0,-35} {1} ({2})" -f $r.Label, $r.Status, $r.Detail
        Write-Host $line -ForegroundColor $color
    }

    # Multi-step exports (sequential — they depend on prior outputs)
    Write-Host ""
    Write-Host "  Multi-step exports:" -ForegroundColor Cyan
    Export-Route53Records -Flags $flags -OutPath $OutPath
    Export-EcsServices -Flags $flags -OutPath $OutPath
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
        $Profile = $prof
        $awsFlags = @("--profile", $prof)
        $profDir = Join-Path $OutputDir $prof

        Write-Host ""
        Write-Host "  ╔═ Profile $profIdx/$($profileList.Count): $prof ═══════════════════════" -ForegroundColor Magenta

        if ($AllRegions) {
            $regRaw = & aws @awsFlags ec2 describe-regions --query 'Regions[].RegionName' --output json 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  ║ Failed to list regions for profile '$prof': $regRaw" -ForegroundColor Red
                Write-Host "  ╚═ Skipped" -ForegroundColor Red
                continue
            }
            $regions = $regRaw | ConvertFrom-Json | Sort-Object
            Write-Host "  ║ Found $($regions.Count) regions" -ForegroundColor Green

            $regionIdx = 0
            foreach ($reg in $regions) {
                $regionIdx++
                $regDir = Join-Path $profDir $reg
                Write-Host ""
                Write-Host "  ║ ┌─ Region $regionIdx/$($regions.Count): $reg ─────────────────────" -ForegroundColor Cyan
                Export-Region -RegionName $reg -OutPath $regDir -Parallel $MaxParallel
                $fileCount = (Get-ChildItem -Path $regDir -Filter "*.json" -ErrorAction SilentlyContinue | Measure-Object).Count
                Write-Host "  ║ └─ $fileCount files" -ForegroundColor Cyan
            }
        } else {
            Export-Region -RegionName $Region -OutPath $profDir -Parallel $MaxParallel
        }

        $profFiles = (Get-ChildItem -Path $profDir -Filter "*.json" -Recurse -ErrorAction SilentlyContinue | Measure-Object).Count
        Write-Host "  ╚═ Profile '$prof' complete: $profFiles files" -ForegroundColor Magenta
    }
} elseif ($AllRegions) {
    # Discover enabled regions
    Write-Host "  Mode    : All Regions (parallel x$MaxParallel)" -ForegroundColor Cyan
    Write-Host "  Profile : $($Profile ? $Profile : 'default')"
    Write-Host ""

    $regRaw = & aws @awsFlags ec2 describe-regions --query 'Regions[].RegionName' --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to list regions: $regRaw"
        exit 1
    }
    $regions = $regRaw | ConvertFrom-Json | Sort-Object

    if (-not $OutputDir) {
        $ts = Get-Date -Format "yyyyMMdd-HHmmss"
        $label = if ($Profile) { $Profile } else { "default" }
        $OutputDir = "./aws-export-${label}-allregions-${ts}"
    }
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

    Write-Host "  Found $($regions.Count) regions" -ForegroundColor Green
    Write-Host "  Output: $OutputDir"
    Write-Host ""

    $regionIdx = 0
    foreach ($reg in $regions) {
        $regionIdx++
        $regDir = Join-Path $OutputDir $reg
        Write-Host ""
        Write-Host "  ┌─ Region $regionIdx/$($regions.Count): $reg ─────────────────────" -ForegroundColor Cyan
        Export-Region -RegionName $reg -OutPath $regDir -Parallel $MaxParallel
        $fileCount = (Get-ChildItem -Path $regDir -Filter "*.json" -ErrorAction SilentlyContinue | Measure-Object).Count
        Write-Host "  └─ $fileCount files" -ForegroundColor Cyan
    }
} else {
    # Single region
    $displayRegion = if ($Region) { $Region } else { "default" }
    Write-Host "  Profile : $($Profile ? $Profile : 'default')"
    Write-Host "  Region  : $displayRegion"
    Write-Host "  Parallel: $MaxParallel concurrent calls"

    if (-not $OutputDir) {
        $ts = Get-Date -Format "yyyyMMdd-HHmmss"
        $label = if ($Profile) { $Profile } else { "default" }
        $OutputDir = "./aws-export-${label}-${ts}"
    }

    Write-Host "  Output  : $OutputDir"
    Write-Host ""

    Export-Region -RegionName $Region -OutPath $OutputDir -Parallel $MaxParallel
}

# ─── Summary ───────────────────────────────────────────────────
Write-Host ""
$allFiles = Get-ChildItem -Path $OutputDir -Filter "*.json" -Recurse -ErrorAction SilentlyContinue
$fileCount = ($allFiles | Measure-Object).Count
$totalBytes = ($allFiles | Measure-Object -Property Length -Sum).Sum
$totalSize = if ($totalBytes -gt 1MB) { "{0:N1} MB" -f ($totalBytes / 1MB) }
             elseif ($totalBytes -gt 1KB) { "{0:N0} KB" -f ($totalBytes / 1KB) }
             else { "$totalBytes bytes" }

Write-Host "  ═══════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Done! $fileCount files exported ($totalSize)" -ForegroundColor Green
Write-Host "  Output: $OutputDir" -ForegroundColor Green
Write-Host ""
Write-Host "  To use: drag the folder onto the mapper's"
Write-Host "  'UPLOAD JSON FILES' button, or open individual"
Write-Host "  files and paste into the corresponding text areas."
Write-Host "  ═══════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""
