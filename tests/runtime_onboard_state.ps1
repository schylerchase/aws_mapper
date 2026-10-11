param([string]$SourceRoot, [ValidateSet('renew','invalid','mfa')][string]$Mode, [string]$Receipt)
$ErrorActionPreference='Stop'
$global:FixtureProfile=@{aws_access_key_id='OLD-KEY';aws_secret_access_key='MOCK-SECRET';aws_session_token='EXPIRED-TOKEN'}
$global:FixtureWrites=@()
function aws {
    $arguments=@($args)
    $global:LASTEXITCODE=0
    if($arguments[0] -eq 'configure') {
        if($arguments[1] -eq 'get') { return $global:FixtureProfile[$arguments[2]] }
        if($arguments[1] -eq 'set') {
            if($arguments[-1] -notin @('mock-profile','mock-source')) { throw 'Unexpected profile target' }
            $global:FixtureProfile[$arguments[2]]=$arguments[3]
            $global:FixtureWrites+=@{key=$arguments[2];value=$arguments[3];profile=$arguments[-1]}
            return
        }
    }
    if($arguments[0] -eq 'sts' -and $arguments[1] -eq 'get-session-token') {
        return '{"Credentials":{"AccessKeyId":"MOCK-SESSION-KEY","SecretAccessKey":"MOCK-SESSION-SECRET","SessionToken":"VALID-TOKEN","Expiration":"2030-01-01T00:00:00Z"}}'
    }
    if($arguments[0] -eq 'sts' -and $arguments[1] -eq 'get-caller-identity') {
        if($Mode -eq 'invalid' -or $global:FixtureProfile.aws_session_token -eq 'EXPIRED-TOKEN') {
            $global:LASTEXITCODE=1; return 'InvalidClientTokenId: invalid fixture credentials'
        }
        return '{"Account":"111122223333","Arn":"arn:aws:iam::111122223333:user/fixture"}'
    }
    throw 'Unexpected AWS command; real AWS operations are forbidden in this fixture'
}
function Read-Host {
    param([string]$Prompt,[switch]$AsSecureString)
    if($AsSecureString) { return ConvertTo-SecureString 'NEW-MOCK-SECRET' -AsPlainText -Force }
    if($Prompt -match 'access key ID') { return 'NEW-MOCK-IAM-KEY' }
    if($Prompt -match 'Current MFA code') { return '123456' }
    if($Prompt -match 'existing credentials|permission check') { return 'n' }
    throw "Unexpected fixture prompt: $Prompt"
}
$parameters=@{Profile='mock-profile';Region='us-east-1'}
if($Mode -eq 'mfa') {
    $parameters.Mfa=$true;$parameters.SourceProfile='mock-source';$parameters.MfaArn='arn:aws:iam::111122223333:mfa/fixture'
} else { $parameters.NoMfa=$true }
if($Mode -eq 'invalid') { $parameters.UseExistingCredentials=$true }
$failed=$false
$log="$Receipt.log"
try { & (Join-Path $SourceRoot 'scripts/onboard-aws-profile.ps1') @parameters *> $log }
catch { $failed=$true; $_.Exception.Message | Add-Content -LiteralPath $log }
[ordered]@{failed=$failed;profile=$global:FixtureProfile;writes=$global:FixtureWrites;ready=(Get-Content -Raw -LiteralPath $log).Contains('profile ready:') -or (Get-Content -Raw -LiteralPath $log).Contains('Profile ready:');realAwsCalls=0} |
    ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Receipt -Encoding utf8
