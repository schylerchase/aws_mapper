param([string]$SourceRoot, [string]$Mode, [string]$Receipt)
$ErrorActionPreference = 'Stop'
$global:fix9Validation = $null
$global:fix9AwsCalls = 0
function global:aws { $global:fix9AwsCalls++; throw 'Real AWS calls are forbidden in this test' }
function global:Get-Command {
    param([string]$Name)
    if ($Name -ne 'aws') { throw "Unexpected command lookup: $Name" }
    $global:fix9Validation = [ordered]@{
        profile = (Get-Variable -Name AwsProfile -Scope 1 -ValueOnly)
        profiles = (Get-Variable -Name profileList -Scope 1 -ValueOnly)
    }
    # Stop immediately after real argument binding and profile validation,
    # before inventory orchestration or any AWS/profile/file operations.
    throw 'FIX9_VALIDATION_COMPLETE'
}
$cases = @{
    single = @{ Profile = 'team.readonly'; Region = 'us-east-1' }
    multiple = @{ Profiles = @('team.readonly,prod.ops', ' qa.test '); Region = 'us-east-1' }
    classic = @{ Profile = 'team_readonly-123'; Region = 'us-east-1' }
    semicolon = @{ Profile = 'team;readonly'; Region = 'us-east-1' }
    slash = @{ Profile = 'team/readonly'; Region = 'us-east-1' }
    spaces = @{ Profiles = @('team.readonly', 'team readonly'); Region = 'us-east-1' }
    dotSingle = @{ Profile = '.'; Region = 'us-east-1' }
    parentSingle = @{ Profile = '..'; Region = 'us-east-1' }
    dotMultiple = @{ Profiles = @('team.readonly', '.'); Region = 'us-east-1' }
    parentMultiple = @{ Profiles = @('team.readonly', '..'); Region = 'us-east-1' }
}
if (-not $cases.ContainsKey($Mode)) { throw "Unknown test mode: $Mode" }
$arguments = $cases[$Mode]
$errorMessage = $null
try { & (Join-Path $SourceRoot 'scripts/export-aws-data.ps1') @arguments }
catch { $errorMessage = $_.Exception.Message }
[ordered]@{ accepted = ($errorMessage -eq 'FIX9_VALIDATION_COMPLETE'); error = $errorMessage;
            validation = $global:fix9Validation; aws_calls = $global:fix9AwsCalls } |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $Receipt -Encoding utf8
if ($global:fix9AwsCalls -ne 0) { throw 'AWS stub was reached unexpectedly' }
