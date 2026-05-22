#Requires -Version 7.0

param(
    [string]$AwsProfile = $env:AWS_PROFILE,

    [string]$DbInstanceIdentifier,

    [string[]]$LogFileName,

    [string]$FilenameContains,

    [string]$NameRegex,

    [string]$Region,

    [string]$OutDir,

    [ValidateRange(1, 64)]
    [int]$MaxParallel = 6,

    [ValidateRange(1, 10)]
    [int]$MaxRetries = 3,

    [switch]$All,

    [switch]$ListOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Invoke-AwsText {
    param(
        [Parameter(Mandatory)]
        [string[]]$CliArguments,

        [switch]$AllowFailure
    )

    $output = & aws @CliArguments

    if ($LASTEXITCODE -ne 0) {
        if ($AllowFailure) {
            return ""
        }

        throw "AWS CLI failed: aws $($CliArguments -join ' ')"
    }

    return ($output -join "`n").Trim()
}

function Resolve-AwsProfile {
    if ($AwsProfile) {
        return $AwsProfile
    }

    $profileText = Invoke-AwsText -AllowFailure -CliArguments @(
        "configure",
        "list-profiles"
    )
    $profiles = @($profileText -split "`r?`n" | Where-Object { $_ })

    if ($profiles.Count -eq 1) {
        Write-Host "Using AWS profile '$($profiles[0])'."
        return $profiles[0]
    }

    if ($profiles.Count -gt 1) {
        Write-Host ""
        Write-Host "Available AWS profiles:"

        for ($index = 0; $index -lt $profiles.Count; $index++) {
            "{0,3}. {1}" -f ($index + 1), $profiles[$index] | Write-Host
        }

        Write-Host ""
        $selection = Read-Host "Enter AWS profile number or name"

        $selectedIndex = 0
        if ([int]::TryParse($selection, [ref]$selectedIndex)) {
            if ($selectedIndex -lt 1 -or $selectedIndex -gt $profiles.Count) {
                throw "Invalid AWS profile selection '$selection'."
            }

            return $profiles[$selectedIndex - 1]
        }

        if ($profiles -contains $selection) {
            return $selection
        }

        throw "No AWS profile named '$selection' was found."
    }

    $manualProfile = Read-Host "Enter AWS profile name, or leave blank to use ambient AWS CLI credentials"
    return $manualProfile
}

$ResolvedAwsProfile = Resolve-AwsProfile

function Resolve-AwsRegion {
    if ($Region) {
        return $Region
    }

    if ($ResolvedAwsProfile) {
        $profileRegion = Invoke-AwsText -AllowFailure -CliArguments @(
            "configure",
            "get",
            "region",
            "--profile",
            $ResolvedAwsProfile
        )

        if ($profileRegion) {
            return $profileRegion
        }
    }

    if ($env:AWS_REGION) {
        return $env:AWS_REGION
    }

    if ($env:AWS_DEFAULT_REGION) {
        return $env:AWS_DEFAULT_REGION
    }

    $defaultRegion = Invoke-AwsText -AllowFailure -CliArguments @(
        "configure",
        "get",
        "region"
    )

    if ($defaultRegion) {
        return $defaultRegion
    }

    if ($ResolvedAwsProfile) {
        throw "No AWS region was found. Set one with: aws configure set region us-west-1 --profile $ResolvedAwsProfile"
    }

    throw "No AWS region was found. Set one with: aws configure set region us-west-1"
}

$ResolvedRegion = Resolve-AwsRegion

function New-AwsCliArguments {
    param(
        [Parameter(Mandatory)]
        [string[]]$CliArguments,

        [string]$RegionOverride
    )

    $allCliArguments = @($CliArguments)

    if ($ResolvedAwsProfile) {
        $allCliArguments += @("--profile", $ResolvedAwsProfile)
    }

    $effectiveRegion = if ($RegionOverride) { $RegionOverride } else { $ResolvedRegion }

    if ($effectiveRegion) {
        $allCliArguments += @("--region", $effectiveRegion)
    }

    return $allCliArguments
}

function Invoke-AwsJson {
    param(
        [Parameter(Mandatory)]
        [string[]]$CliArguments,

        [string]$RegionOverride,

        [switch]$AllowFailure
    )

    $awsCliArguments = New-AwsCliArguments -RegionOverride $RegionOverride -CliArguments ($CliArguments + @("--output", "json"))
    $json = & aws @awsCliArguments

    if ($LASTEXITCODE -ne 0) {
        if ($AllowFailure) {
            return $null
        }

        throw "AWS CLI failed: aws $($awsCliArguments -join ' ')"
    }

    if ([string]::IsNullOrWhiteSpace(($json -join ""))) {
        if ($AllowFailure) {
            return $null
        }

        throw "AWS CLI returned no JSON: aws $($awsCliArguments -join ' ')"
    }

    return ($json | ConvertFrom-Json)
}

function Resolve-AwsAccountId {
    $identityCliArguments = New-AwsCliArguments -CliArguments @(
        "sts",
        "get-caller-identity",
        "--query",
        "Account",
        "--output",
        "text"
    )

    $accountId = Invoke-AwsText -AllowFailure -CliArguments $identityCliArguments

    if ($accountId -match "^\d{12}$") {
        return $accountId
    }

    return ""
}

function ConvertTo-SafeFileName {
    param(
        [Parameter(Mandatory)]
        [string]$LogName
    )

    $invalidChars = [Regex]::Escape((-join [IO.Path]::GetInvalidFileNameChars()))
    return ($LogName -replace "[$invalidChars]", "_").Replace("/", "_").Replace("\", "_")
}

function ConvertFrom-AwsLogFileDataJson {
    param(
        [Parameter(Mandatory)]
        [object[]]$AwsOutput,

        [Parameter(Mandatory)]
        [string]$LogName
    )

    $jsonText = ($AwsOutput | Out-String).Trim()

    if (-not $jsonText) {
        return ""
    }

    try {
        $logText = $jsonText | ConvertFrom-Json
    }
    catch {
        throw "AWS CLI returned invalid JSON for '$LogName': $($_.Exception.Message)"
    }

    if ($null -eq $logText) {
        return ""
    }

    return [string]$logText
}

function Format-RdsLastWritten {
    param($LastWritten)

    if ($null -eq $LastWritten) {
        return ""
    }

    try {
        return [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$LastWritten).LocalDateTime.ToString("yyyy-MM-dd HH:mm:ss")
    }
    catch {
        return [string]$LastWritten
    }
}

function Get-AwsRegionList {
    $response = Invoke-AwsJson -AllowFailure -CliArguments @(
        "ec2",
        "describe-regions",
        "--all-regions"
    )

    $discoveredRegions = @()

    if ($response -and $response.Regions) {
        $discoveredRegions = @($response.Regions | Select-Object -ExpandProperty RegionName)
    }

    if ($discoveredRegions.Count -eq 0) {
        $discoveredRegions = @(
            "us-east-1",
            "us-east-2",
            "us-west-1",
            "us-west-2",
            "ca-central-1",
            "eu-west-1",
            "eu-west-2",
            "eu-central-1",
            "ap-south-1",
            "ap-southeast-1",
            "ap-southeast-2",
            "ap-northeast-1"
        )
    }

    return @($discoveredRegions | Sort-Object -Unique)
}

function Get-RdsDbInstanceList {
    param(
        [Parameter(Mandatory)]
        [string]$RegionName,

        [switch]$AllowFailure
    )

    $response = Invoke-AwsJson -RegionOverride $RegionName -AllowFailure:$AllowFailure -CliArguments @(
        "rds",
        "describe-db-instances"
    )

    if (-not $response) {
        return @()
    }

    $instances = @($response.DBInstances)

    foreach ($instance in $instances) {
        $instance | Add-Member -NotePropertyName RegionName -NotePropertyValue $RegionName -Force
    }

    return $instances
}

function Resolve-RdsDbInstanceIdentifier {
    if ($DbInstanceIdentifier) {
        return [pscustomobject]@{
            Identifier = $DbInstanceIdentifier
            Region = $ResolvedRegion
        }
    }

    $instances = @(Get-RdsDbInstanceList -RegionName $ResolvedRegion -AllowFailure | Sort-Object DBInstanceIdentifier)

    if ($instances.Count -eq 0) {
        Write-Host ""
        Write-Host "No RDS DB instances were found in configured region '$ResolvedRegion'. Searching other regions for this profile..."

        $searchedRegions = @($ResolvedRegion)

        foreach ($regionName in Get-AwsRegionList) {
            if ($searchedRegions -contains $regionName) {
                continue
            }

            $searchedRegions += $regionName
            $regionalInstances = @(Get-RdsDbInstanceList -RegionName $regionName -AllowFailure)

            if ($regionalInstances.Count -gt 0) {
                $instances += $regionalInstances
            }
        }

        $instances = @($instances | Sort-Object RegionName, DBInstanceIdentifier)
    }

    if ($instances.Count -eq 0) {
        throw "No RDS DB instances were found for profile '$ResolvedAwsProfile'. Searched configured region '$ResolvedRegion' and other discoverable regions. Confirm the profile/account, RDS permissions, and region."
    }

    Write-Host ""
    Write-Host "Available RDS DB instances for profile '$ResolvedAwsProfile':"

    for ($index = 0; $index -lt $instances.Count; $index++) {
        $instance = $instances[$index]
        "{0,3}. {1}  ({2}, {3}, {4})" -f ($index + 1), $instance.DBInstanceIdentifier, $instance.Engine, $instance.DBInstanceStatus, $instance.RegionName | Write-Host
    }

    Write-Host ""
    $selection = Read-Host "Enter DB number or DB instance identifier"

    $selectedIndex = 0
    if ([int]::TryParse($selection, [ref]$selectedIndex)) {
        if ($selectedIndex -lt 1 -or $selectedIndex -gt $instances.Count) {
            throw "Invalid DB selection '$selection'."
        }

        $selectedInstance = $instances[$selectedIndex - 1]
        return [pscustomobject]@{
            Identifier = [string]$selectedInstance.DBInstanceIdentifier
            Region = [string]$selectedInstance.RegionName
        }
    }

    $matchingInstance = $instances | Where-Object { $_.DBInstanceIdentifier -eq $selection } | Select-Object -First 1

    if (-not $matchingInstance) {
        throw "No DB instance named '$selection' was found."
    }

    return [pscustomobject]@{
        Identifier = [string]$matchingInstance.DBInstanceIdentifier
        Region = [string]$matchingInstance.RegionName
    }
}

$resolvedDbInstance = Resolve-RdsDbInstanceIdentifier
$ResolvedDbInstanceIdentifier = $resolvedDbInstance.Identifier
$ResolvedRegion = $resolvedDbInstance.Region
$ResolvedAwsAccountId = Resolve-AwsAccountId

if (-not $OutDir) {
    $accountFolder = if ($ResolvedAwsAccountId) {
        "account-$ResolvedAwsAccountId"
    } else {
        "account-unknown"
    }

    if ($ResolvedAwsProfile) {
        $accountFolder = "$accountFolder`_profile-$ResolvedAwsProfile"
    }

    $safeAccountFolder = ConvertTo-SafeFileName -LogName $accountFolder
    $safeRegionFolder = ConvertTo-SafeFileName -LogName $ResolvedRegion
    $safeDbFolder = ConvertTo-SafeFileName -LogName $ResolvedDbInstanceIdentifier
    $OutDir = Join-Path $PSScriptRoot "rds-logs"
    $OutDir = Join-Path $OutDir $safeAccountFolder
    $OutDir = Join-Path $OutDir $safeRegionFolder
    $OutDir = Join-Path $OutDir $safeDbFolder
}

function Get-RdsLogFileList {
    $describeCliArguments = @(
        "rds",
        "describe-db-log-files",
        "--db-instance-identifier",
        $ResolvedDbInstanceIdentifier
    )

    if ($FilenameContains) {
        $describeCliArguments += @("--filename-contains", $FilenameContains)
    }

    $response = Invoke-AwsJson -CliArguments $describeCliArguments
    $logs = @($response.DescribeDBLogFiles)

    if ($NameRegex) {
        $logs = @($logs | Where-Object { $_.LogFileName -match $NameRegex })
    }

    return $logs
}

function Show-RdsLogFileList {
    param(
        [Parameter(Mandatory)]
        [object[]]$Logs
    )

    $Logs |
        Sort-Object LastWritten -Descending |
        Select-Object LogFileName, @{Name = "LastWrittenLocal"; Expression = { Format-RdsLastWritten $_.LastWritten } }, Size |
        Format-Table -AutoSize |
        Out-Host
}

function Resolve-LogFileNamesToDownload {
    param(
        [Parameter(Mandatory)]
        [object[]]$AvailableLogs
    )

    if ($ListOnly) {
        Show-RdsLogFileList -Logs $AvailableLogs
        return @()
    }

    if ($LogFileName -and $LogFileName.Count -gt 0) {
        $availableNames = @($AvailableLogs | Select-Object -ExpandProperty LogFileName)
        $missingNames = @($LogFileName | Where-Object { $availableNames -notcontains $_ })

        if ($missingNames.Count -gt 0) {
            throw "These requested log files were not returned by AWS for '$ResolvedDbInstanceIdentifier': $($missingNames -join ', ')"
        }

        return @($LogFileName)
    }

    if ($All) {
        return @($AvailableLogs | Select-Object -ExpandProperty LogFileName)
    }

    if ($FilenameContains -or $NameRegex) {
        return @($AvailableLogs | Select-Object -ExpandProperty LogFileName)
    }

    Write-Host ""
    Write-Host "Available logs for DB '$ResolvedDbInstanceIdentifier':"
    Show-RdsLogFileList -Logs $AvailableLogs
    Write-Host ""
    Write-Host "No log selector was provided."
    $selection = Read-Host "Enter A to download all listed logs, L to list only, or enter a regex to filter log names"

    if ($selection -match "^[aA]$") {
        return @($AvailableLogs | Select-Object -ExpandProperty LogFileName)
    }

    if ($selection -match "^[lL]$") {
        return @()
    }

    $selectedLogs = @($AvailableLogs | Where-Object { $_.LogFileName -match $selection })

    if ($selectedLogs.Count -eq 0) {
        throw "No available logs matched regex '$selection'."
    }

    Write-Host ""
    Write-Host "Matched logs:"
    Show-RdsLogFileList -Logs $selectedLogs

    return @($selectedLogs | Select-Object -ExpandProperty LogFileName)
}

function Save-RdsLogFile {
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )

    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

    $safeName = ConvertTo-SafeFileName -LogName $Name
    $targetPath = Join-Path $OutDir $safeName
    $legacyMetaPath = Join-Path $OutDir "$safeName.meta.json"

    if (Test-Path -LiteralPath $targetPath) {
        Remove-Item -LiteralPath $targetPath -Force
    }
    if (Test-Path -LiteralPath $legacyMetaPath) {
        Remove-Item -LiteralPath $legacyMetaPath -Force
    }

    $downloadCliArguments = New-AwsCliArguments -CliArguments @(
        "rds",
        "download-db-log-file-portion",
        "--db-instance-identifier",
        $ResolvedDbInstanceIdentifier,
        "--log-file-name",
        $Name,
        "--starting-token",
        "0",
        "--output",
        "json",
        "--query",
        "LogFileData"
    )

    $logFileDataJson = & aws @downloadCliArguments 2>&1

    if ($LASTEXITCODE -ne 0) {
        $rawMessage = ($logFileDataJson | Out-String).Trim() -replace "\s+", " "
        throw "AWS CLI failed: aws $($downloadCliArguments -join ' ') :: $rawMessage"
    }

    $logText = ConvertFrom-AwsLogFileDataJson -AwsOutput $logFileDataJson -LogName $Name
    if ($logText.Length -gt 0 -and -not $logText.EndsWith([Environment]::NewLine)) {
        $logText += [Environment]::NewLine
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($targetPath, $logText, $utf8NoBom)

    $file = Get-Item -LiteralPath $targetPath

    [pscustomobject]@{
        LogFileName = $Name
        Path = $file.FullName
        Bytes = $file.Length
        Method = "aws-cli-paginated"
        Attempts = 1
    }
}

function Save-RdsLogFilesParallel {
    param(
        [Parameter(Mandatory)]
        [string[]]$Names
    )

    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

    $downloadQueue = for ($index = 0; $index -lt $Names.Count; $index++) {
        [pscustomobject]@{
            Index = $index
            Name = $Names[$index]
        }
    }

    $results = $downloadQueue | ForEach-Object -ThrottleLimit $MaxParallel -Parallel {
        $name = [string]$_.Name
        $index = [int]$_.Index
        $attempt = 0

        try {
            $localOutDir = $using:OutDir
            $env:PYTHONIOENCODING = "utf-8"
            $env:PYTHONUTF8 = "1"
            New-Item -ItemType Directory -Path $localOutDir -Force | Out-Null

            $invalidChars = [Regex]::Escape((-join [IO.Path]::GetInvalidFileNameChars()))
            $safeName = ($name -replace "[$invalidChars]", "_").Replace("/", "_").Replace("\", "_")
            $targetPath = Join-Path $localOutDir $safeName
            $legacyMetaPath = Join-Path $localOutDir "$safeName.meta.json"

            if (Test-Path -LiteralPath $targetPath) {
                Remove-Item -LiteralPath $targetPath -Force
            }
            if (Test-Path -LiteralPath $legacyMetaPath) {
                Remove-Item -LiteralPath $legacyMetaPath -Force
            }

            $downloadCliArguments = @(
                "rds",
                "download-db-log-file-portion",
                "--db-instance-identifier",
                $using:ResolvedDbInstanceIdentifier,
                "--log-file-name",
                $name,
                "--starting-token",
                "0",
                "--output",
                "json",
                "--query",
                "LogFileData"
            )

            if ($using:ResolvedAwsProfile) {
                $downloadCliArguments += @("--profile", $using:ResolvedAwsProfile)
            }

            if ($using:ResolvedRegion) {
                $downloadCliArguments += @("--region", $using:ResolvedRegion)
            }

            $maxAttempts = 1 + $using:MaxRetries
            $logText = $null

            while ($attempt -lt $maxAttempts) {
                $attempt++
                $logFileDataJson = & aws @downloadCliArguments 2>&1

                if ($LASTEXITCODE -eq 0) {
                    $jsonText = ($logFileDataJson | Out-String).Trim()
                    if ($jsonText) {
                        try {
                            $logText = [string]($jsonText | ConvertFrom-Json)
                        }
                        catch {
                            throw "AWS CLI returned invalid JSON for '$name': $($_.Exception.Message)"
                        }
                    } else {
                        $logText = ""
                    }

                    break
                }

                $rawMessage = ($logFileDataJson | Out-String).Trim() -replace "\s+", " "
                if (-not $rawMessage) {
                    $rawMessage = "No AWS CLI error output was returned."
                }

                $isRetryable = $rawMessage -match "(Throttl|TooManyRequests|Rate exceeded|RequestLimitExceeded|connection|timeout|temporarily unavailable|reset by peer)"
                if ($isRetryable -and $attempt -lt $maxAttempts) {
                    $delaySeconds = [Math]::Min(30, [Math]::Pow(2, $attempt) + (Get-Random -Minimum 0 -Maximum 3))
                    Start-Sleep -Seconds $delaySeconds
                    continue
                }

                throw "AWS CLI failed after $attempt attempt(s): aws $($downloadCliArguments -join ' ') :: $rawMessage"
            }

            if ($null -eq $logText) {
                throw "AWS CLI returned no log data for '$name'."
            }

            if ($logText.Length -gt 0 -and -not $logText.EndsWith([Environment]::NewLine)) {
                $logText += [Environment]::NewLine
            }

            $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllText($targetPath, $logText, $utf8NoBom)

            $file = Get-Item -LiteralPath $targetPath

            [pscustomobject]@{
                Index = $index
                Status = "OK"
                LogFileName = $name
                Path = $file.FullName
                Bytes = $file.Length
                Method = "aws-cli-paginated"
                Error = ""
                Attempts = $attempt
            }
        }
        catch {
            [pscustomobject]@{
                Index = $index
                Status = "ERROR"
                LogFileName = $name
                Path = ""
                Bytes = 0
                Method = "aws-cli-paginated"
                Error = $_.Exception.Message
                Attempts = if ($attempt) { $attempt } else { 0 }
            }
        }
    }

    return @($results | Sort-Object Index)
}

function Write-DownloadFailureReport {
    param(
        [Parameter(Mandatory)]
        [object[]]$Results
    )

    $failedDownloads = @($Results | Where-Object { $_.PSObject.Properties["Status"] -and $_.Status -eq "ERROR" })

    if ($failedDownloads.Count -eq 0) {
        return $null
    }

    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

    $csvPath = Join-Path $OutDir "_download-errors.csv"
    $txtPath = Join-Path $OutDir "_download-errors.txt"

    $failedDownloads |
        Select-Object LogFileName, Attempts, Error |
        Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding utf8

    $reportLines = @(
        "RDS log download failures",
        "Generated: $(Get-Date -Format o)",
        "Profile: $ResolvedAwsProfile",
        "Account: $($ResolvedAwsAccountId ? $ResolvedAwsAccountId : 'unknown')",
        "Region: $ResolvedRegion",
        "DB: $ResolvedDbInstanceIdentifier",
        "Failed: $($failedDownloads.Count)",
        "",
        "Rerun a single failed log with:",
        ".\Download-RdsLogs.ps1 -Profile $ResolvedAwsProfile -Region $ResolvedRegion -DbInstanceIdentifier $ResolvedDbInstanceIdentifier -LogFileName '<log-file-name>' -MaxParallel 1",
        ""
    )

    foreach ($failure in $failedDownloads) {
        $reportLines += "[$($failure.LogFileName)]"
        $reportLines += "Attempts: $($failure.Attempts)"
        $reportLines += "Error: $($failure.Error)"
        $reportLines += ""
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($txtPath, $reportLines, $utf8NoBom)

    [pscustomobject]@{
        CsvPath = $csvPath
        TxtPath = $txtPath
    }
}

Write-Host ""
Write-Host "Using AWS profile: $ResolvedAwsProfile"
Write-Host "Using AWS account: $($ResolvedAwsAccountId ? $ResolvedAwsAccountId : 'unknown')"
Write-Host "Using AWS region:  $ResolvedRegion"
Write-Host "Using RDS DB:      $ResolvedDbInstanceIdentifier"
Write-Host "Output folder:     $OutDir"
Write-Host "Parallel workers:  $MaxParallel"
Write-Host "Retry attempts:    $MaxRetries"

$availableLogs = @(Get-RdsLogFileList)

if ($availableLogs.Count -eq 0) {
    throw "No log files were returned by AWS for '$ResolvedDbInstanceIdentifier'."
}

$targetLogFileNames = @(Resolve-LogFileNamesToDownload -AvailableLogs $availableLogs)

if ($targetLogFileNames.Count -eq 0) {
    Write-Host "No logs selected for download."
    return
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

if ($MaxParallel -le 1 -or $targetLogFileNames.Count -eq 1) {
    $results = foreach ($name in $targetLogFileNames) {
        Write-Host "Downloading $name ..."
        Save-RdsLogFile -Name $name
    }
} else {
    Write-Host "Downloading $($targetLogFileNames.Count) logs with up to $MaxParallel parallel workers..."
    $results = Save-RdsLogFilesParallel -Names $targetLogFileNames
}

$failedResults = @($results | Where-Object { $_.PSObject.Properties["Status"] -and $_.Status -eq "ERROR" })

if ($failedResults.Count -gt 0) {
    $failureReport = Write-DownloadFailureReport -Results $results

    $results |
        Select-Object LogFileName, Status, Attempts, Error |
        Format-Table -AutoSize

    if ($failureReport) {
        Write-Host ""
        Write-Host "Failure report CSV: $($failureReport.CsvPath)" -ForegroundColor Yellow
        Write-Host "Failure report TXT: $($failureReport.TxtPath)" -ForegroundColor Yellow
    }

    throw "$($failedResults.Count) RDS log download(s) failed. Successful files were kept in '$OutDir'."
}

$results |
    Select-Object LogFileName, Path, Bytes, Method, Attempts |
    Format-Table -AutoSize
