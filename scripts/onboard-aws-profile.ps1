<#
.SYNOPSIS
    Interactive AWS CLI profile onboarding for AWS Network Mapper.

.DESCRIPTION
    Creates or updates an AWS CLI profile for long-term IAM user credentials.
    When MFA is enabled, -Profile is the usable MFA session profile and
    -SourceProfile is the long-term credential profile used to request temporary
    STS credentials. Local CLI username/password login is not supported by AWS;
    this script expects access keys already available or entered during
    onboarding.

.EXAMPLE
    .\scripts\onboard-aws-profile.ps1

.EXAMPLE
    .\scripts\onboard-aws-profile.ps1 -Profile prod-mfa -SourceProfile prod -Region us-east-1 -Mfa
#>

[CmdletBinding()]
param(
    [Alias("p", "Profile")]
    [string]$ProfileName,

    [string]$SourceProfile,

    [Alias("r")]
    [string]$Region,

    [string]$Output = "json",

    [switch]$UseExistingCredentials,

    [switch]$Mfa,

    [switch]$NoMfa,

    [string]$MfaArn,

    # Legacy explicit target. Prefer naming the MFA target with -Profile.
    [string]$SessionProfile,

    [ValidateRange(900, 129600)]
    [int]$DurationSeconds = 43200,

    [switch]$RunPermissionCheck
)

$ErrorActionPreference = "Stop"
$env:AWS_PAGER = ""

function Read-RequiredValue {
    param(
        [string]$Prompt,
        [string]$DefaultValue
    )

    while ($true) {
        $label = if ($DefaultValue) { "$Prompt [$DefaultValue]" } else { $Prompt }
        $value = Read-Host $label
        if ([string]::IsNullOrWhiteSpace($value) -and $DefaultValue) { return $DefaultValue }
        if (-not [string]::IsNullOrWhiteSpace($value)) { return $value.Trim() }
        Write-Host "Value is required." -ForegroundColor Yellow
    }
}

function Read-YesNo {
    param(
        [string]$Prompt,
        [bool]$Default = $false
    )

    $suffix = if ($Default) { " [Y/n]" } else { " [y/N]" }
    while ($true) {
        $answer = Read-Host ($Prompt + $suffix)
        if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
        switch -Regex ($answer.Trim()) {
            '^(y|yes)$' { return $true }
            '^(n|no)$'  { return $false }
            default     { Write-Host "Enter yes or no." -ForegroundColor Yellow }
        }
    }
}

function ConvertFrom-SecureStringPlainText {
    param([securestring]$SecureValue)

    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Invoke-AwsCli {
    param([string[]]$Arguments)

    $raw = & aws @Arguments 2>&1
    [pscustomobject]@{
        ExitCode = $LASTEXITCODE
        Raw      = $raw
        Text     = (($raw | Out-String).Trim() -replace '\s+', ' ')
    }
}

function Set-AwsProfileValue {
    param(
        [string]$Profile,
        [string]$Key,
        [string]$Value
    )

    $result = Invoke-AwsCli -Arguments @("configure", "set", $Key, $Value, "--profile", $Profile)
    if ($result.ExitCode -ne 0) {
        throw "Failed to set $Key for profile '$Profile': $($result.Text)"
    }
}

function Get-AwsProfileValue {
    param(
        [string]$Profile,
        [string]$Key
    )

    $result = Invoke-AwsCli -Arguments @("configure", "get", $Key, "--profile", $Profile)
    if ($result.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($result.Text)) {
        return $result.Text.Trim()
    }
    return $null
}

function Get-CallerIdentity {
    param([string]$Profile)

    $args = @("sts", "get-caller-identity", "--profile", $Profile, "--output", "json")
    if ($Region) { $args += @("--region", $Region) }
    $result = Invoke-AwsCli -Arguments $args
    if ($result.ExitCode -ne 0) {
        return [pscustomobject]@{ Ok = $false; Error = $result.Text; Identity = $null }
    }

    try {
        return [pscustomobject]@{ Ok = $true; Error = ""; Identity = (($result.Raw | Out-String) | ConvertFrom-Json) }
    } catch {
        return [pscustomobject]@{ Ok = $false; Error = "Could not parse sts identity response."; Identity = $null }
    }
}

function Find-MfaArn {
    param(
        [string]$Profile,
        [object]$Identity
    )

    $listResult = Invoke-AwsCli -Arguments @(
        "iam", "list-mfa-devices",
        "--profile", $Profile,
        "--query", "MFADevices[0].SerialNumber",
        "--output", "text"
    )
    if ($listResult.ExitCode -eq 0) {
        $candidate = $listResult.Text.Trim()
        if ($candidate -and $candidate -ne "None") { return $candidate }
    }

    if ($Identity -and $Identity.Arn -match '^arn:(?<partition>aws[a-zA-Z-]*):iam::(?<account>\d+):user/(?<user>.+)$') {
        return "arn:$($Matches.partition):iam::$($Matches.account):mfa/$($Matches.user)"
    }

    return $null
}

function Write-NextCommands {
    param(
        [string]$ActiveProfile,
        [string]$RegionName
    )

    Write-Host ""
    Write-Host "Next commands:" -ForegroundColor Cyan
    Write-Host "  aws sts get-caller-identity --profile $ActiveProfile"
    Write-Host "  .\scripts\enumerate-aws-permissions.ps1 -Profile $ActiveProfile -Region $RegionName -Quick"
    Write-Host "  .\scripts\export-aws-data.ps1 -Profile $ActiveProfile -Region $RegionName"
}

function Get-DefaultSourceProfile {
    param([string]$TargetProfile)

    if ($TargetProfile -match '^(?<base>.+?)([-_.]?mfa)$' -and $Matches.base) {
        return $Matches.base
    }
    return "$TargetProfile-source"
}

if ($Mfa -and $NoMfa) {
    throw "Use either -Mfa or -NoMfa, not both."
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI was not found on PATH."
}

Write-Host ""
Write-Host "AWS Network Mapper profile onboarding" -ForegroundColor Cyan
Write-Host ""

if (-not $ProfileName) {
    $ProfileName = Read-RequiredValue -Prompt "Profile name to use for mapper commands" -DefaultValue ""
}
if ($ProfileName -notmatch '^[a-zA-Z0-9_.-]+$') {
    throw "Profile names should only use letters, numbers, dots, underscores, and dashes."
}

$useMfa = if ($Mfa) {
    $true
} elseif ($NoMfa) {
    $false
} else {
    Read-YesNo -Prompt "Does this profile require MFA for CLI/API access?" -Default $true
}

$activeProfile = $ProfileName
$credentialProfile = $ProfileName

if ($useMfa) {
    if ($SessionProfile) {
        if (-not $SourceProfile) { $SourceProfile = $ProfileName }
        $activeProfile = $SessionProfile
    } else {
        if (-not $SourceProfile) {
            $SourceProfile = Read-RequiredValue -Prompt "Long-term credential source profile" -DefaultValue (Get-DefaultSourceProfile -TargetProfile $ProfileName)
        }
        $activeProfile = $ProfileName
    }

    if ($SourceProfile -notmatch '^[a-zA-Z0-9_.-]+$') {
        throw "Source profile names should only use letters, numbers, dots, underscores, and dashes."
    }
    if ($activeProfile -notmatch '^[a-zA-Z0-9_.-]+$') {
        throw "MFA profile names should only use letters, numbers, dots, underscores, and dashes."
    }
    if ($SourceProfile -eq $activeProfile) {
        throw "The MFA profile and long-term source profile must be different so temporary credentials do not overwrite long-term keys."
    }

    $credentialProfile = $SourceProfile
    Write-Host ""
    Write-Host "MFA profile model:" -ForegroundColor Cyan
    Write-Host "  Use this profile for mapper commands : $activeProfile"
    Write-Host "  Long-term credential source profile  : $credentialProfile"
}

$existingAccessKey = Get-AwsProfileValue -Profile $credentialProfile -Key "aws_access_key_id"
if (-not $UseExistingCredentials) {
    $useExisting = $false
    if ($existingAccessKey) {
        Write-Host "Profile '$credentialProfile' already has an access key configured: $existingAccessKey" -ForegroundColor Yellow
        $useExisting = Read-YesNo -Prompt "Use the existing credentials for this long-term credential profile?" -Default $true
    }

    if (-not $useExisting) {
        Write-Host ""
        Write-Host "Enter long-term IAM access key credentials for '$credentialProfile'." -ForegroundColor Cyan
        $accessKeyId = Read-RequiredValue -Prompt "AWS access key ID" -DefaultValue ""
        $secretSecure = Read-Host "AWS secret access key" -AsSecureString
        $secretAccessKey = ConvertFrom-SecureStringPlainText -SecureValue $secretSecure
        if ([string]::IsNullOrWhiteSpace($secretAccessKey)) { throw "AWS secret access key is required." }

        Set-AwsProfileValue -Profile $credentialProfile -Key "aws_access_key_id" -Value $accessKeyId
        Set-AwsProfileValue -Profile $credentialProfile -Key "aws_secret_access_key" -Value $secretAccessKey
    }
}

if (-not $Region) {
    $configuredRegion = Get-AwsProfileValue -Profile $credentialProfile -Key "region"
    $Region = Read-RequiredValue -Prompt "Default region" -DefaultValue $(if ($configuredRegion) { $configuredRegion } else { "us-east-1" })
}
Set-AwsProfileValue -Profile $credentialProfile -Key "region" -Value $Region
Set-AwsProfileValue -Profile $credentialProfile -Key "output" -Value $Output

$baseIdentity = Get-CallerIdentity -Profile $credentialProfile
if ($baseIdentity.Ok) {
    Write-Host ""
    Write-Host "Long-term credential profile authenticated as:" -ForegroundColor Green
    Write-Host "  $($baseIdentity.Identity.Arn)"
} else {
    Write-Host ""
    Write-Host "Long-term credential profile could not call sts:GetCallerIdentity yet:" -ForegroundColor Yellow
    Write-Host "  $($baseIdentity.Error)" -ForegroundColor Yellow
    Write-Host "Continuing, because some accounts require an MFA session before inventory calls." -ForegroundColor Yellow
}

if ($useMfa) {
    if (-not $MfaArn) {
        $candidateMfaArn = Find-MfaArn -Profile $credentialProfile -Identity $baseIdentity.Identity
        $MfaArn = Read-RequiredValue -Prompt "MFA device ARN" -DefaultValue $candidateMfaArn
    }

    $mfaCode = Read-RequiredValue -Prompt "Current MFA code" -DefaultValue ""
    Write-Host ""
    Write-Host "Requesting temporary MFA session credentials..." -ForegroundColor Cyan

    $sessionResult = Invoke-AwsCli -Arguments @(
        "sts", "get-session-token",
        "--profile", $credentialProfile,
        "--serial-number", $MfaArn,
        "--token-code", $mfaCode,
        "--duration-seconds", [string]$DurationSeconds,
        "--output", "json"
    )
    if ($sessionResult.ExitCode -ne 0) {
        throw "Failed to get MFA session token: $($sessionResult.Text)"
    }

    $session = ($sessionResult.Raw | Out-String) | ConvertFrom-Json
    Set-AwsProfileValue -Profile $activeProfile -Key "aws_access_key_id" -Value $session.Credentials.AccessKeyId
    Set-AwsProfileValue -Profile $activeProfile -Key "aws_secret_access_key" -Value $session.Credentials.SecretAccessKey
    Set-AwsProfileValue -Profile $activeProfile -Key "aws_session_token" -Value $session.Credentials.SessionToken
    Set-AwsProfileValue -Profile $activeProfile -Key "region" -Value $Region
    Set-AwsProfileValue -Profile $activeProfile -Key "output" -Value $Output

    $sessionIdentity = Get-CallerIdentity -Profile $activeProfile
    if (-not $sessionIdentity.Ok) {
        throw "Session profile was written, but sts:GetCallerIdentity failed: $($sessionIdentity.Error)"
    }

    Write-Host ""
    Write-Host "MFA session profile ready: $activeProfile" -ForegroundColor Green
    Write-Host "  Source : $credentialProfile" -ForegroundColor Green
    Write-Host "  Expires: $($session.Credentials.Expiration)" -ForegroundColor Green
    Write-Host "  ARN    : $($sessionIdentity.Identity.Arn)" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Profile ready: $activeProfile" -ForegroundColor Green
}

if ($RunPermissionCheck -or (Read-YesNo -Prompt "Run the quick mapper permission check now?" -Default $true)) {
    $checker = Join-Path $PSScriptRoot "enumerate-aws-permissions.ps1"
    if (Test-Path -LiteralPath $checker) {
        & $checker -Profile $activeProfile -Region $Region -Quick
    } else {
        Write-Host "Permission checker not found at $checker" -ForegroundColor Yellow
    }
}

Write-NextCommands -ActiveProfile $activeProfile -RegionName $Region
