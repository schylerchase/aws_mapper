#Requires -Version 7.0

param(
    [Alias("Profile")]
    [string]$AwsProfile = $env:AWS_PROFILE,

    [string]$DbInstanceIdentifier,

    [string[]]$LogFileName,

    [string]$FilenameContains,

    [string]$NameRegex,

    [string]$Region,

    [string]$OutDir,

    [ValidateRange(1, 64)]
    [int]$MaxParallel = 2,

    [ValidateRange(1, 20)]
    [int]$MaxRetries = 3,

    [switch]$RetryFailed,

    [switch]$Force,

    [switch]$AllowHighParallel,

    [ValidateRange(0, 10000)]
    [int]$PageDelayMilliseconds = 1500,

    [ValidateSet("Fast", "Manual")]
    [string]$DownloadMode = "Fast",

    [switch]$ZipByDay,

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

$RetryingFailedDownloads = $false

function Get-FailedLogFileNamesFromReport {
    $csvPath = Join-Path $OutDir "_download-errors.csv"

    if (-not (Test-Path -LiteralPath $csvPath)) {
        return @()
    }

    try {
        $failedRows = @(Import-Csv -LiteralPath $csvPath)
    }
    catch {
        throw "Could not read previous failure report '$csvPath': $($_.Exception.Message)"
    }

    return @(
        $failedRows |
            ForEach-Object { $_.LogFileName } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            Sort-Object -Unique
    )
}

function Clear-DownloadFailureReport {
    foreach ($fileName in @("_download-errors.csv", "_download-errors.txt")) {
        $path = Join-Path $OutDir $fileName

        if (Test-Path -LiteralPath $path) {
            Remove-Item -LiteralPath $path -Force
        }
    }
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

function Get-RdsLogResumeSelection {
    param(
        [Parameter(Mandatory)]
        [object[]]$AvailableLogs
    )

    $availableNames = @($AvailableLogs | Select-Object -ExpandProperty LogFileName)
    $missingNames = @()
    $existingCount = 0

    foreach ($availableName in $availableNames) {
        $safeName = ConvertTo-SafeFileName -LogName $availableName
        $targetPath = Join-Path $OutDir $safeName

        if (Test-Path -LiteralPath $targetPath) {
            $existingCount++
        } else {
            $missingNames += $availableName
        }
    }

    [pscustomobject]@{
        ExistingCount = $existingCount
        MissingNames = @($missingNames)
        TotalCount = $availableNames.Count
    }
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

    $resumeSelection = Get-RdsLogResumeSelection -AvailableLogs $AvailableLogs

    if ($resumeSelection.ExistingCount -gt 0) {
        if ($resumeSelection.MissingNames.Count -eq 0) {
            Write-Host "Resume mode: all $($resumeSelection.TotalCount) listed log file(s) already exist. Use -Force with -All or -LogFileName to redownload." -ForegroundColor Green
            return @()
        }

        Write-Host "Resume mode: found $($resumeSelection.ExistingCount) existing log file(s); downloading only $($resumeSelection.MissingNames.Count) missing file(s)." -ForegroundColor Yellow
        return @($resumeSelection.MissingNames)
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

function New-RdsLogSizeMap {
    param(
        [Parameter(Mandatory)]
        [object[]]$AvailableLogs
    )

    $sizeMap = @{}

    foreach ($log in $AvailableLogs) {
        if (-not $log.LogFileName) {
            continue
        }

        $size = 0
        if ($null -ne $log.Size -and [int64]::TryParse([string]$log.Size, [ref]$size)) {
            $sizeMap[[string]$log.LogFileName] = $size
        }
    }

    return $sizeMap
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
    $downloadExisting = [bool]$Force

    if ((Test-Path -LiteralPath $targetPath) -and -not $downloadExisting) {
        $file = Get-Item -LiteralPath $targetPath

        return [pscustomobject]@{
            LogFileName = $Name
            Path = $file.FullName
            Bytes = $file.Length
            Method = "existing-file"
            Attempts = 0
            Status = "SKIPPED"
        }
    }

    if ((Test-Path -LiteralPath $targetPath) -and $downloadExisting) {
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
        Status = "OK"
    }
}

function Save-RdsLogFilesParallel {
    param(
        [Parameter(Mandatory)]
        [string[]]$Names
    )

    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

    if (-not (Get-Command Start-ThreadJob -ErrorAction SilentlyContinue)) {
        Import-Module ThreadJob -ErrorAction Stop
    }

    $downloadQueue = [System.Collections.Generic.Queue[object]]::new()
    for ($index = 0; $index -lt $Names.Count; $index++) {
        $downloadQueue.Enqueue(
            [pscustomobject]@{
                Index = $index
                Name = $Names[$index]
            }
        )
    }

    $downloadScript = {
        param(
            [int]$index,
            [string]$name,
            [string]$localOutDir,
            [bool]$force,
            [string]$dbInstanceIdentifier,
            [string]$awsProfile,
            [string]$region,
            [int]$maxRetries,
            [int]$pageDelayMilliseconds,
            [hashtable]$logSizeMap,
            [string]$progressRoot,
            [string]$downloadMode
        )

        $attempt = 0
        $maxAttempts = 1 + $maxRetries
        $statusPath = Join-Path $progressRoot ("{0}.json" -f $index)

        function Write-WorkerStatus {
            param(
                [Parameter(Mandatory)]
                [string]$Phase,

                [int]$Attempt = $attempt,

                [int]$DelaySeconds = 0,

                [int]$Page = 0,

                [int]$EstimatedPages = 0,

                [string]$Message = "",

                [string]$PartialPath = "",

                [int64]$TotalBytes = 0
            )

            try {
                $payload = [pscustomobject]@{
                    Index = $index
                    Name = $name
                    Phase = $Phase
                    Attempt = $Attempt
                    MaxAttempts = $maxAttempts
                    DelaySeconds = $DelaySeconds
                    Page = $Page
                    EstimatedPages = $EstimatedPages
                    Message = $Message
                    PartialPath = $PartialPath
                    TotalBytes = $TotalBytes
                    Updated = (Get-Date).ToString("o")
                }

                $payload | ConvertTo-Json -Compress | Set-Content -LiteralPath $statusPath -Encoding utf8
            }
            catch {
                # Progress status is best-effort only; downloads should not fail because the terminal could not be updated.
                Write-Verbose "Could not update worker progress for '$name': $($_.Exception.Message)"
            }
        }

        function Invoke-FastRdsLogStream {
            param(
                [Parameter(Mandatory)]
                [string[]]$CliArguments,

                [Parameter(Mandatory)]
                [string]$PartialPath
            )

            $process = $null
            $outputStream = $null

            try {
                $processInfo = [System.Diagnostics.ProcessStartInfo]::new()
                $processInfo.FileName = "aws"
                $processInfo.UseShellExecute = $false
                $processInfo.RedirectStandardOutput = $true
                $processInfo.RedirectStandardError = $true
                $processInfo.CreateNoWindow = $true
                $processInfo.Environment["PYTHONIOENCODING"] = "utf-8"
                $processInfo.Environment["PYTHONUTF8"] = "1"
                $processInfo.Environment["AWS_PAGER"] = ""
                $processInfo.Environment["AWS_RETRY_MODE"] = "adaptive"
                $processInfo.Environment["AWS_MAX_ATTEMPTS"] = [string][Math]::Max(12, $maxAttempts)

                foreach ($argument in $CliArguments) {
                    [void]$processInfo.ArgumentList.Add($argument)
                }

                $process = [System.Diagnostics.Process]::new()
                $process.StartInfo = $processInfo
                [void]$process.Start()

                $stderrTask = $process.StandardError.ReadToEndAsync()
                $outputStream = [System.IO.File]::Open($PartialPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
                $buffer = [byte[]]::new(1048576)
                $bytesSinceFlush = 0

                while (($bytesRead = $process.StandardOutput.BaseStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                    $outputStream.Write($buffer, 0, $bytesRead)
                    $bytesSinceFlush += $bytesRead

                    if ($bytesSinceFlush -ge 33554432) {
                        $outputStream.Flush()
                        $bytesSinceFlush = 0
                    }
                }

                $outputStream.Flush()
                $process.WaitForExit()
                $stderr = $stderrTask.GetAwaiter().GetResult()

                [pscustomobject]@{
                    ExitCode = $process.ExitCode
                    Error = $stderr
                }
            }
            finally {
                if ($null -ne $outputStream) {
                    $outputStream.Dispose()
                }

                if ($null -ne $process) {
                    if (-not $process.HasExited) {
                        $process.Kill($true)
                    }

                    $process.Dispose()
                }
            }
        }

        try {
            $env:PYTHONIOENCODING = "utf-8"
            $env:PYTHONUTF8 = "1"
            $env:AWS_PAGER = ""
            $env:AWS_RETRY_MODE = "adaptive"
            $env:AWS_MAX_ATTEMPTS = [string][Math]::Max(12, $maxAttempts)
            New-Item -ItemType Directory -Path $localOutDir -Force | Out-Null

            $invalidChars = [Regex]::Escape((-join [IO.Path]::GetInvalidFileNameChars()))
            $safeName = ($name -replace "[$invalidChars]", "_").Replace("/", "_").Replace("\", "_")
            $targetPath = Join-Path $localOutDir $safeName
            $partialPath = "$targetPath.partial"
            $legacyMetaPath = Join-Path $localOutDir "$safeName.meta.json"

            if ((Test-Path -LiteralPath $targetPath) -and -not $force) {
                Write-WorkerStatus -Phase "skipped existing file" -Attempt 0
                $file = Get-Item -LiteralPath $targetPath

                return [pscustomobject]@{
                    Index = $index
                    Status = "SKIPPED"
                    LogFileName = $name
                    Path = $file.FullName
                    Bytes = $file.Length
                    Method = "existing-file"
                    Error = ""
                    Attempts = 0
                }
            }

            if ((Test-Path -LiteralPath $targetPath) -and $force) {
                Write-WorkerStatus -Phase "removing existing file" -Attempt 0
                Remove-Item -LiteralPath $targetPath -Force
            }
            if (Test-Path -LiteralPath $legacyMetaPath) {
                Remove-Item -LiteralPath $legacyMetaPath -Force
            }
            if (Test-Path -LiteralPath $partialPath) {
                Remove-Item -LiteralPath $partialPath -Force
            }

            $downloadCliArguments = @(
                "rds",
                "download-db-log-file-portion",
                "--db-instance-identifier",
                $dbInstanceIdentifier,
                "--log-file-name",
                $name
            )

            if ($awsProfile) {
                $downloadCliArguments += @("--profile", $awsProfile)
            }

            if ($region) {
                $downloadCliArguments += @("--region", $region)
            }

            $estimatedPages = 0
            $totalBytes = 0
            if ($logSizeMap -and $logSizeMap.ContainsKey($name)) {
                $totalBytes = [int64]$logSizeMap[$name]
                $estimatedPages = [Math]::Max(1, [int][Math]::Ceiling(([double]$totalBytes) / 1048576))
            }

            if ($downloadMode -eq "Fast") {
                $fastCliArguments = @($downloadCliArguments + @(
                    "--starting-token",
                    "0",
                    "--output",
                    "text",
                    "--query",
                    "LogFileData",
                    "--cli-read-timeout",
                    "0",
                    "--cli-connect-timeout",
                    "60"
                ))

                while ($attempt -lt $maxAttempts) {
                    $attempt++
                    Write-WorkerStatus -Phase "fast stream" -Attempt $attempt -PartialPath $partialPath -TotalBytes $totalBytes

                    $streamResult = Invoke-FastRdsLogStream -CliArguments $fastCliArguments -PartialPath $partialPath

                    if ($streamResult.ExitCode -eq 0) {
                        Write-WorkerStatus -Phase "moving file" -Attempt $attempt -PartialPath $partialPath -TotalBytes $totalBytes
                        Move-Item -LiteralPath $partialPath -Destination $targetPath -Force

                        $file = Get-Item -LiteralPath $targetPath
                        Write-WorkerStatus -Phase "complete" -Attempt $attempt -PartialPath $targetPath -TotalBytes $totalBytes

                        return [pscustomobject]@{
                            Index = $index
                            Status = "OK"
                            LogFileName = $name
                            Path = $file.FullName
                            Bytes = $file.Length
                            Method = "aws-cli-fast-stream"
                            Error = ""
                            Attempts = $attempt
                        }
                    }

                    $rawMessage = ([string]$streamResult.Error).Trim() -replace "\s+", " "
                    if (-not $rawMessage) {
                        $rawMessage = "No AWS CLI error output was returned."
                    }

                    Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue
                    $isRetryable = $rawMessage -match "(Throttl|TooManyRequests|Rate exceeded|RequestLimitExceeded|connection|timeout|temporarily unavailable|reset by peer)"

                    if ($isRetryable -and $attempt -lt $maxAttempts) {
                        $delaySeconds = [Math]::Min(90, [Math]::Pow(2, $attempt) + (Get-Random -Minimum 0 -Maximum 5))
                        Write-WorkerStatus -Phase "fast retry sleep" -Attempt $attempt -DelaySeconds $delaySeconds -PartialPath $partialPath -TotalBytes $totalBytes -Message $rawMessage
                        Start-Sleep -Seconds $delaySeconds
                        continue
                    }

                    Write-WorkerStatus -Phase "fast stream failed" -Attempt $attempt -PartialPath $partialPath -TotalBytes $totalBytes -Message $rawMessage
                    throw "AWS CLI failed after $attempt attempt(s): aws $($fastCliArguments -join ' ') :: $rawMessage"
                }
            }

            $logBuilder = [System.Text.StringBuilder]::new()
            $marker = "0"
            $page = 0
            $hasMoreData = $true

            while ($hasMoreData) {
                $page++
                $pageAttempt = 0
                $response = $null

                while ($pageAttempt -lt $maxAttempts) {
                    $pageAttempt++
                    $attempt++
                    $pageLabel = if ($estimatedPages -gt 0) { "page $page/~$estimatedPages" } else { "page $page" }
                    Write-WorkerStatus -Phase "$pageLabel downloading" -Attempt $pageAttempt -Page $page -EstimatedPages $estimatedPages

                    $pageCliArguments = @($downloadCliArguments + @(
                        "--marker",
                        $marker,
                        "--no-paginate",
                        "--output",
                        "json"
                    ))

                    $pageOutput = & aws @pageCliArguments 2>&1

                    if ($LASTEXITCODE -eq 0) {
                        $jsonText = ($pageOutput | Out-String).Trim()

                        try {
                            $response = if ($jsonText) { $jsonText | ConvertFrom-Json } else { $null }
                        }
                        catch {
                            throw "AWS CLI returned invalid JSON for '$name' page ${page}: $($_.Exception.Message)"
                        }

                        break
                    }

                    $rawMessage = ($pageOutput | Out-String).Trim() -replace "\s+", " "
                    if (-not $rawMessage) {
                        $rawMessage = "No AWS CLI error output was returned."
                    }

                    $isRetryable = $rawMessage -match "(Throttl|TooManyRequests|Rate exceeded|RequestLimitExceeded|connection|timeout|temporarily unavailable|reset by peer)"
                    if ($isRetryable -and $pageAttempt -lt $maxAttempts) {
                        $delaySeconds = [Math]::Min(90, [Math]::Pow(2, $pageAttempt) + (Get-Random -Minimum 0 -Maximum 5))
                        Write-WorkerStatus -Phase "$pageLabel retry sleep" -Attempt $pageAttempt -DelaySeconds $delaySeconds -Page $page -EstimatedPages $estimatedPages -Message $rawMessage
                        Start-Sleep -Seconds $delaySeconds
                        continue
                    }

                    Write-WorkerStatus -Phase "$pageLabel failed" -Attempt $pageAttempt -Page $page -EstimatedPages $estimatedPages -Message $rawMessage
                    throw "AWS CLI failed after $pageAttempt attempt(s) on page ${page}: aws $($pageCliArguments -join ' ') :: $rawMessage"
                }

                if ($null -eq $response) {
                    throw "AWS CLI returned no JSON response for '$name' page $page."
                }

                Write-WorkerStatus -Phase "$pageLabel received" -Attempt $pageAttempt -Page $page -EstimatedPages $estimatedPages
                if ($null -ne $response.LogFileData) {
                    [void]$logBuilder.Append([string]$response.LogFileData)
                }

                $nextMarker = [string]$response.Marker
                $hasMoreData = [bool]$response.AdditionalDataPending -and -not [string]::IsNullOrWhiteSpace($nextMarker) -and $nextMarker -ne $marker
                $marker = $nextMarker

                if ($hasMoreData -and $pageDelayMilliseconds -gt 0) {
                    Write-WorkerStatus -Phase "$pageLabel throttle pause" -Attempt 0 -DelaySeconds ([int][Math]::Ceiling($pageDelayMilliseconds / 1000)) -Page $page -EstimatedPages $estimatedPages
                    Start-Sleep -Milliseconds $pageDelayMilliseconds
                }
            }

            $logText = $logBuilder.ToString()

            if ($logText.Length -gt 0 -and -not $logText.EndsWith([Environment]::NewLine)) {
                $logText += [Environment]::NewLine
            }

            Write-WorkerStatus -Phase "writing file" -Attempt $attempt -Page $page -EstimatedPages $estimatedPages
            $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllText($targetPath, $logText, $utf8NoBom)

            $file = Get-Item -LiteralPath $targetPath
            Write-WorkerStatus -Phase "complete" -Attempt $attempt -Page $page -EstimatedPages $estimatedPages

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
                Method = if ($downloadMode -eq "Fast") { "aws-cli-fast-stream" } else { "aws-cli-paginated" }
                Error = $_.Exception.Message
                Attempts = if ($attempt) { $attempt } else { 0 }
            }
        }
    }

    $active = [System.Collections.ArrayList]::new()
    $results = [System.Collections.ArrayList]::new()
    $logSizeMap = New-RdsLogSizeMap -AvailableLogs $script:AvailableLogsForProgress
    $total = $Names.Count
    $slotCount = [Math]::Max(1, [Math]::Min($MaxParallel, $total))
    $freeSlots = [System.Collections.Generic.Queue[int]]::new()
    $progressRoot = Join-Path ([IO.Path]::GetTempPath()) ("rds-log-progress-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $progressRoot -Force | Out-Null

    for ($slot = 1; $slot -le $slotCount; $slot++) {
        $freeSlots.Enqueue($slot)
    }

    function Start-NextDownloadJob {
        if ($downloadQueue.Count -eq 0 -or $freeSlots.Count -eq 0) {
            return
        }

        $next = $downloadQueue.Dequeue()
        $slot = $freeSlots.Dequeue()
        $job = Start-ThreadJob -Name ("rds-log-{0}" -f $next.Index) -ScriptBlock $downloadScript -ArgumentList @(
            $next.Index,
            $next.Name,
            $OutDir,
            [bool]$Force,
            $ResolvedDbInstanceIdentifier,
            $ResolvedAwsProfile,
            $ResolvedRegion,
            $MaxRetries,
            $PageDelayMilliseconds,
            $logSizeMap,
            $progressRoot,
            $DownloadMode
        )

        $null = $active.Add(
            [pscustomobject]@{
                Job = $job
                Index = $next.Index
                Name = $next.Name
                Slot = $slot
                Started = Get-Date
            }
        )
    }

    function Write-DownloadProgressBars {
        $done = $results.Count
        $ok = @($results | Where-Object { $_.Status -eq "OK" }).Count
        $skipped = @($results | Where-Object { $_.Status -eq "SKIPPED" }).Count
        $failed = @($results | Where-Object { $_.Status -eq "ERROR" }).Count
        $overallPercent = if ($total -gt 0) { [Math]::Min(100, [int](($done / $total) * 100)) } else { 100 }

        Write-Progress -Id 1 -Activity "RDS log downloads" -Status "$done/$total complete | ok $ok | skipped $skipped | failed $failed | queued $($downloadQueue.Count)" -PercentComplete $overallPercent

        $activeSlots = @{}
        foreach ($entry in @($active)) {
            $elapsed = (Get-Date) - $entry.Started
            $elapsedText = "{0:hh\:mm\:ss}" -f $elapsed
            $workerPercent = [Math]::Min(95, [int](5 + ($elapsed.TotalSeconds / 60)))
            $shortName = if ($entry.Name.Length -gt 72) { "..." + $entry.Name.Substring($entry.Name.Length - 69) } else { $entry.Name }
            $activeSlots[$entry.Slot] = $true
            $phaseText = "starting"
            $statusPath = Join-Path $progressRoot ("{0}.json" -f $entry.Index)

            if (Test-Path -LiteralPath $statusPath) {
                try {
                    $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
                    $phaseText = [string]$status.Phase

                    if ($status.Attempt -gt 0) {
                        $phaseText += " attempt $($status.Attempt)/$($status.MaxAttempts)"
                    }

                    if ($status.DelaySeconds -gt 0) {
                        $phaseText += " ($($status.DelaySeconds)s backoff)"
                    }

                    if ($status.EstimatedPages -gt 0 -and $status.Page -gt 0) {
                        $pageNumerator = [int]$status.Page

                        if ($phaseText -match "downloading|retry sleep|failed") {
                            $pageNumerator = [Math]::Max(0, $pageNumerator - 1)
                        }

                        $pagePercent = [int][Math]::Floor(($pageNumerator / [double]$status.EstimatedPages) * 100)
                        $workerPercent = [Math]::Min(99, [Math]::Max(1, $pagePercent))
                    }

                    if ($status.TotalBytes -gt 0 -and -not [string]::IsNullOrWhiteSpace([string]$status.PartialPath) -and (Test-Path -LiteralPath ([string]$status.PartialPath))) {
                        $partialFile = Get-Item -LiteralPath ([string]$status.PartialPath)
                        $bytePercent = [int][Math]::Floor(($partialFile.Length / [double]$status.TotalBytes) * 100)
                        $workerPercent = [Math]::Min(99, [Math]::Max(1, $bytePercent))
                        $downloadedMiB = [Math]::Round($partialFile.Length / 1MB, 1)
                        $totalMiB = [Math]::Round($status.TotalBytes / 1MB, 1)
                        $phaseText += " [$downloadedMiB/$totalMiB MiB]"
                    }
                }
                catch {
                    $phaseText = "running"
                }
            }

            Write-Progress -Id (10 + $entry.Slot) -ParentId 1 -Activity ("Worker {0}" -f $entry.Slot) -Status "$shortName | $phaseText | elapsed $elapsedText" -PercentComplete $workerPercent
        }

        for ($slot = 1; $slot -le $slotCount; $slot++) {
            if (-not $activeSlots.ContainsKey($slot)) {
                Write-Progress -Id (10 + $slot) -ParentId 1 -Activity ("Worker {0}" -f $slot) -Completed
            }
        }
    }

    try {
        while ($downloadQueue.Count -gt 0 -and $active.Count -lt $slotCount) {
            Start-NextDownloadJob
        }

        while ($active.Count -gt 0 -or $downloadQueue.Count -gt 0) {
            Write-DownloadProgressBars

            $completedEntries = @($active | Where-Object { $_.Job.State -in @("Completed", "Failed", "Stopped") })

            foreach ($entry in $completedEntries) {
                $jobErrors = @()
                $received = @(Receive-Job -Job $entry.Job -ErrorAction SilentlyContinue -ErrorVariable jobErrors)

                if ($received.Count -gt 0) {
                    foreach ($item in $received) {
                        $null = $results.Add($item)
                    }
                } else {
                    $message = if ($jobErrors.Count -gt 0) {
                        ($jobErrors | Out-String).Trim() -replace "\s+", " "
                    } elseif ($entry.Job.ChildJobs.Count -gt 0 -and $entry.Job.ChildJobs[0].JobStateInfo.Reason) {
                        $entry.Job.ChildJobs[0].JobStateInfo.Reason.Message
                    } else {
                        "Worker stopped without returning a result."
                    }

                    $null = $results.Add(
                        [pscustomobject]@{
                            Index = $entry.Index
                            Status = "ERROR"
                            LogFileName = $entry.Name
                            Path = ""
                            Bytes = 0
                            Method = if ($DownloadMode -eq "Fast") { "aws-cli-fast-stream" } else { "aws-cli-paginated" }
                            Error = $message
                            Attempts = 0
                        }
                    )
                }

                Remove-Job -Job $entry.Job -Force
                $active.Remove($entry)
                $freeSlots.Enqueue($entry.Slot)
            }

            while ($downloadQueue.Count -gt 0 -and $active.Count -lt $slotCount) {
                Start-NextDownloadJob
            }

            if ($active.Count -gt 0 -or $downloadQueue.Count -gt 0) {
                Start-Sleep -Milliseconds 500
            }
        }

        Write-DownloadProgressBars
    }
    finally {
        Write-Progress -Id 1 -Activity "RDS log downloads" -Completed

        for ($slot = 1; $slot -le $slotCount; $slot++) {
            Write-Progress -Id (10 + $slot) -ParentId 1 -Activity ("Worker {0}" -f $slot) -Completed
        }

        foreach ($entry in @($active)) {
            Stop-Job -Job $entry.Job -ErrorAction SilentlyContinue
            Remove-Job -Job $entry.Job -Force -ErrorAction SilentlyContinue
        }

        Remove-Item -LiteralPath $progressRoot -Recurse -Force -ErrorAction SilentlyContinue
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
        "Rerun only failed logs with:",
        ".\Download-RdsLogs.ps1 -AwsProfile $ResolvedAwsProfile -Region $ResolvedRegion -DbInstanceIdentifier $ResolvedDbInstanceIdentifier -RetryFailed -MaxParallel 1",
        "",
        "Rerun a single failed log with:",
        ".\Download-RdsLogs.ps1 -AwsProfile $ResolvedAwsProfile -Region $ResolvedRegion -DbInstanceIdentifier $ResolvedDbInstanceIdentifier -LogFileName '<log-file-name>' -MaxParallel 1 -Force",
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

function Get-RdsLogDay {
    param(
        [Parameter(Mandatory)]
        [string]$LogFileName
    )

    $match = [regex]::Match($LogFileName, "\d{4}-\d{2}-\d{2}")

    if ($match.Success) {
        return $match.Value
    }

    return "undated"
}

function Convert-RdsDayToArchiveLabel {
    param(
        [Parameter(Mandatory)]
        [string]$Day
    )

    $parsedDate = [datetime]::MinValue

    if ([datetime]::TryParseExact($Day, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$parsedDate)) {
        return "{0}_{1}" -f $parsedDate.Month, $parsedDate.Day
    }

    return (ConvertTo-SafeFileName -LogName $Day)
}

function Get-RdsLogArchiveBaseName {
    param(
        [Parameter(Mandatory)]
        [string]$LogFileName
    )

    $baseName = $LogFileName -replace "\.\d{4}-\d{2}-\d{2}(?:-\d{2})?$", ""
    return ConvertTo-SafeFileName -LogName $baseName
}

function Compress-RdsLogsByDay {
    param(
        [Parameter(Mandatory)]
        [object[]]$Results
    )

    $completedResults = @(
        $Results |
            Where-Object {
                $_.PSObject.Properties["Status"] -and
                $_.PSObject.Properties["Path"] -and
                $_.Path -and
                $_.Status -in @("OK", "SKIPPED") -and
                (Test-Path -LiteralPath $_.Path)
            }
    )

    if ($completedResults.Count -eq 0) {
        Write-Host "Zip by day: no completed files were available to zip." -ForegroundColor Yellow
        return @()
    }

    $zipDirectory = Join-Path $OutDir "_zips"
    New-Item -ItemType Directory -Path $zipDirectory -Force | Out-Null

    $safeDbName = ConvertTo-SafeFileName -LogName $ResolvedDbInstanceIdentifier
    $safeAccountName = if ($ResolvedAwsAccountId) {
        ConvertTo-SafeFileName -LogName "account-$ResolvedAwsAccountId"
    } else {
        "account-unknown"
    }
    $tarCommand = Get-Command tar.exe -ErrorAction SilentlyContinue
    $archives = [System.Collections.ArrayList]::new()
    $groups = @(
        $completedResults |
            Group-Object {
                $day = Get-RdsLogDay -LogFileName $_.LogFileName
                $archiveBaseName = Get-RdsLogArchiveBaseName -LogFileName $_.LogFileName
                "$day|$archiveBaseName"
            } |
            Sort-Object Name
    )

    foreach ($group in $groups) {
        $groupParts = [string]$group.Name -split "\|", 2
        $groupDay = $groupParts[0]
        $archiveBaseName = if ($groupParts.Count -gt 1) { $groupParts[1] } else { "rds-log" }
        $paths = @(
            $group.Group |
                ForEach-Object { (Get-Item -LiteralPath $_.Path).FullName } |
                Sort-Object -Unique
        )

        if ($paths.Count -eq 0) {
            continue
        }

        $dayLabel = Convert-RdsDayToArchiveLabel -Day $groupDay
        $zipFileName = "{0}-{1}_{2}_{3}_{4}.zip" -f $dayLabel, $dayLabel, $safeAccountName, $safeDbName, $archiveBaseName
        $zipPath = Join-Path $zipDirectory $zipFileName

        if (Test-Path -LiteralPath $zipPath) {
            Remove-Item -LiteralPath $zipPath -Force
        }

        $sourceBytes = [int64]0
        foreach ($path in $paths) {
            $sourceBytes += (Get-Item -LiteralPath $path).Length
        }

        $parentDirectories = @($paths | ForEach-Object { Split-Path -Parent $_ } | Sort-Object -Unique)

        if ($tarCommand -and $parentDirectories.Count -eq 1) {
            $leafNames = @($paths | ForEach-Object { Split-Path -Leaf $_ })
            & $tarCommand.Source -a -cf $zipPath -C $parentDirectories[0] @leafNames

            if ($LASTEXITCODE -ne 0) {
                throw "Failed to create zip archive with tar.exe: $zipPath"
            }
        }
        else {
            Compress-Archive -LiteralPath $paths -DestinationPath $zipPath -CompressionLevel Fastest -Force
        }

        $zipFile = Get-Item -LiteralPath $zipPath
        $null = $archives.Add(
            [pscustomobject]@{
                Day = $groupDay
                ZipPath = $zipFile.FullName
                FileCount = $paths.Count
                SourceBytes = $sourceBytes
                ZipBytes = $zipFile.Length
            }
        )
    }

    return @($archives)
}

function Get-ExistingRdsLogDownloadResults {
    param(
        [Parameter(Mandatory)]
        [object[]]$AvailableLogs
    )

    $existingResults = [System.Collections.ArrayList]::new()

    foreach ($availableLog in $AvailableLogs) {
        $safeName = ConvertTo-SafeFileName -LogName $availableLog.LogFileName
        $targetPath = Join-Path $OutDir $safeName

        if (-not (Test-Path -LiteralPath $targetPath)) {
            continue
        }

        $targetFile = Get-Item -LiteralPath $targetPath
        $null = $existingResults.Add(
            [pscustomobject]@{
                LogFileName = $availableLog.LogFileName
                Status = "SKIPPED"
                Path = $targetFile.FullName
                Bytes = $targetFile.Length
                Method = "existing-local-file"
                Attempts = 0
                Error = ""
            }
        )
    }

    return @($existingResults)
}

Write-Host ""
Write-Host "Using AWS profile: $ResolvedAwsProfile"
Write-Host "Using AWS account: $($ResolvedAwsAccountId ? $ResolvedAwsAccountId : 'unknown')"
Write-Host "Using AWS region:  $ResolvedRegion"
Write-Host "Using RDS DB:      $ResolvedDbInstanceIdentifier"
Write-Host "Output folder:     $OutDir"
Write-Host "Requested workers: $MaxParallel"
Write-Host "Retry attempts:    $MaxRetries"
Write-Host "Differential mode: $((-not $Force) ? 'skip existing successful files' : 'force redownload selected files')"
Write-Host "Download mode:     $DownloadMode"
Write-Host "Zip by day:        $($ZipByDay ? 'yes' : 'no')"

$availableLogs = @(Get-RdsLogFileList)
$script:AvailableLogsForProgress = $availableLogs

if ($availableLogs.Count -eq 0) {
    throw "No log files were returned by AWS for '$ResolvedDbInstanceIdentifier'."
}

$failureReportCsvPath = Join-Path $OutDir "_download-errors.csv"
$shouldAutoRetryFailed = (
    -not $RetryFailed -and
    -not $Force -and
    -not $ListOnly -and
    -not $All -and
    -not $PSBoundParameters.ContainsKey("LogFileName") -and
    -not $PSBoundParameters.ContainsKey("FilenameContains") -and
    -not $PSBoundParameters.ContainsKey("NameRegex") -and
    (Test-Path -LiteralPath $failureReportCsvPath)
)

if ($RetryFailed -or $shouldAutoRetryFailed) {
    $failedLogFileNames = @(Get-FailedLogFileNamesFromReport)

    if ($failedLogFileNames.Count -gt 0 -and ($PSBoundParameters.ContainsKey("FilenameContains") -or $PSBoundParameters.ContainsKey("NameRegex"))) {
        $filteredAvailableNames = @($availableLogs | Select-Object -ExpandProperty LogFileName)
        $originalFailedCount = $failedLogFileNames.Count
        $failedLogFileNames = @($failedLogFileNames | Where-Object { $filteredAvailableNames -contains $_ })

        if ($originalFailedCount -ne $failedLogFileNames.Count) {
            Write-Host "Retry-failed filter: narrowed previous failures from $originalFailedCount to $($failedLogFileNames.Count) log(s) matching the current selector." -ForegroundColor Yellow
        }
    }

    if ($failedLogFileNames.Count -eq 0) {
        if ($RetryFailed) {
            throw "Retry failed was requested, but no failed log names were found in '$failureReportCsvPath'."
        }
    } else {
        $LogFileName = $failedLogFileNames
        $RetryingFailedDownloads = $true
        $retryMode = if ($RetryFailed) { "requested" } else { "detected from previous failure report" }
        Write-Host "Retry-failed mode ${retryMode}: downloading only $($failedLogFileNames.Count) failed log(s)." -ForegroundColor Yellow
    }
}

if ($RetryingFailedDownloads -and $MaxParallel -gt 1 -and -not $AllowHighParallel) {
    $requestedMaxParallel = $MaxParallel
    $MaxParallel = 1
    Write-Host "Retry-failed mode is safest with one RDS log worker; capping workers from $requestedMaxParallel to $MaxParallel. Use -AllowHighParallel to override." -ForegroundColor Yellow
}
elseif ($MaxParallel -gt 2 -and -not $AllowHighParallel) {
    $requestedMaxParallel = $MaxParallel
    $MaxParallel = 2
    Write-Host "AWS throttles RDS log downloads aggressively; capping workers from $requestedMaxParallel to $MaxParallel. Use -AllowHighParallel to override." -ForegroundColor Yellow
}

Write-Host "Effective workers: $MaxParallel"
Write-Host "Page delay:        $PageDelayMilliseconds ms"

$targetLogFileNames = @(Resolve-LogFileNamesToDownload -AvailableLogs $availableLogs)

if ($targetLogFileNames.Count -eq 0) {
    if ($ZipByDay -and -not $ListOnly) {
        $existingResults = @(Get-ExistingRdsLogDownloadResults -AvailableLogs $availableLogs)

        if ($existingResults.Count -gt 0) {
            New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
            Write-Host "No downloads needed; creating zip archive(s) from $($existingResults.Count) existing local file(s)..." -ForegroundColor Yellow
            $zipArchives = @(Compress-RdsLogsByDay -Results $existingResults)

            if ($zipArchives.Count -gt 0) {
                $zipArchives |
                    Select-Object Day, FileCount, ZipPath, SourceBytes, ZipBytes |
                    Format-Table -AutoSize
            }

            return
        }

        Write-Host "No logs selected for download, and no existing local files were available to zip."
        return
    }

    Write-Host "No logs selected for download."
    return
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

Write-Host "Downloading $($targetLogFileNames.Count) logs with up to $MaxParallel worker(s)..."
$results = Save-RdsLogFilesParallel -Names $targetLogFileNames
$zipArchives = @()

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

    if ($ZipByDay) {
        Write-Host ""
        Write-Host "Creating zip archive(s) for completed files..." -ForegroundColor Yellow
        $zipArchives = @(Compress-RdsLogsByDay -Results $results)

        if ($zipArchives.Count -gt 0) {
            $zipArchives |
                Select-Object Day, FileCount, ZipPath, SourceBytes, ZipBytes |
                Format-Table -AutoSize
        }
    }

    throw "$($failedResults.Count) RDS log download(s) failed. Successful files were kept in '$OutDir'."
}

$results |
    Select-Object LogFileName, Status, Path, Bytes, Method, Attempts |
    Format-Table -AutoSize

Clear-DownloadFailureReport

if ($ZipByDay) {
    Write-Host ""
    Write-Host "Creating zip archive(s) by day..."
    $zipArchives = @(Compress-RdsLogsByDay -Results $results)

    if ($zipArchives.Count -gt 0) {
        $zipArchives |
            Select-Object Day, FileCount, ZipPath, SourceBytes, ZipBytes |
            Format-Table -AutoSize
    }
}
