#Requires -Version 7.0

[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSReviewUnusedParameter", "")]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSUseDeclaredVarsMoreThanAssignments", "")]
param(
    [string]$LogRoot = (Join-Path $PSScriptRoot "rds-logs"),

    [Alias("Path")]
    [string[]]$LogPath,

    [string]$DbInstanceIdentifier,

    [string]$AccountId,

    [string[]]$Day,

    [string]$NameRegex = "postgres",

    [string]$OutDir,

    [ValidateRange(1, 1000)]
    [int]$Top = 100,

    [ValidateRange(5, 3600)]
    [int]$ReadTimeoutSeconds = 30,

    [ValidateRange(1000, 1000000)]
    [int]$MaxLineChars = 20000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Get-LogDayFromName {
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )

    $match = [regex]::Match($Name, "\d{4}-\d{2}-\d{2}")

    if ($match.Success) {
        return $match.Value
    }

    return ""
}

function Get-PathSegmentValue {
    param(
        [Parameter(Mandatory)]
        [string]$FullName,

        [Parameter(Mandatory)]
        [string]$Pattern
    )

    $segments = @($FullName -split "[\\/]")
    $match = @($segments | Where-Object { $_ -match $Pattern } | Select-Object -First 1)

    if ($match.Count -gt 0) {
        return [string]$match[0]
    }

    return ""
}

function Get-DbNameFromPath {
    param(
        [Parameter(Mandatory)]
        [System.IO.FileInfo]$File
    )

    if ($DbInstanceIdentifier) {
        return $DbInstanceIdentifier
    }

    $parent = $File.Directory

    if ($null -ne $parent) {
        return $parent.Name
    }

    return ""
}

function ConvertTo-SafeReportName {
    param(
        [AllowEmptyString()]
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return "unknown"
    }

    $safeValue = $Value.Trim()
    $safeValue = $safeValue -replace '[<>:"/\\|?*\x00-\x1F]', "_"
    $safeValue = $safeValue -replace "\s+", "_"
    $safeValue = $safeValue -replace "_+", "_"
    $safeValue = $safeValue.Trim("_")

    if ([string]::IsNullOrWhiteSpace($safeValue)) {
        return "unknown"
    }

    return $safeValue
}

function Get-RegionFromPath {
    param(
        [Parameter(Mandatory)]
        [System.IO.FileInfo]$File
    )

    $segments = @($File.FullName -split "[\\/]")

    foreach ($segment in $segments) {
        if ($segment -match "^(?:us|af|ap|ca|cn|eu|il|me|mx|sa|us-gov)-[a-z]+-\d$") {
            return $segment
        }
    }

    return ""
}

function Get-ReportScopeLabel {
    param(
        [Parameter(Mandatory)]
        [System.IO.FileInfo[]]$Files,

        [Parameter(Mandatory)]
        [string]$Stamp
    )

    $accounts = @(
        foreach ($file in $Files) {
            $accountSegment = Get-PathSegmentValue -FullName $file.FullName -Pattern "^account-\d{12}"
            if ($accountSegment -match "account-(\d{12})") {
                $Matches[1]
            }
        }
    )
    $accounts = @($accounts | Where-Object { $_ } | Sort-Object -Unique)

    $regions = @(
        foreach ($file in $Files) {
            Get-RegionFromPath -File $file
        }
    )
    $regions = @($regions | Where-Object { $_ } | Sort-Object -Unique)

    $dbs = @(
        foreach ($file in $Files) {
            Get-DbNameFromPath -File $file
        }
    )
    $dbs = @($dbs | Where-Object { $_ } | Sort-Object -Unique)

    $days = @(
        if ($Day -and $Day.Count -gt 0) {
            foreach ($dayValue in $Day) {
                $dayValue
            }
        }
        else {
            foreach ($file in $Files) {
                Get-LogDayFromName -Name $file.Name
            }
        }
    )
    $days = @($days | Where-Object { $_ } | Sort-Object -Unique)

    if ($AccountId) {
        $accountLabel = "account-$AccountId"
    }
    elseif ($accounts.Count -eq 1) {
        $accountLabel = "account-$($accounts[0])"
    }
    elseif ($accounts.Count -gt 1) {
        $accountLabel = "accounts-mixed-$($accounts.Count)"
    }
    else {
        $accountLabel = "account-unknown"
    }

    if ($regions.Count -eq 1) {
        $regionLabel = $regions[0]
    }
    elseif ($regions.Count -gt 1) {
        $regionLabel = "regions-mixed-$($regions.Count)"
    }
    else {
        $regionLabel = "region-unknown"
    }

    if ($DbInstanceIdentifier) {
        $dbLabel = $DbInstanceIdentifier
    }
    elseif ($dbs.Count -eq 1) {
        $dbLabel = $dbs[0]
    }
    elseif ($dbs.Count -gt 1) {
        $dbLabel = "dbs-mixed-$($dbs.Count)"
    }
    else {
        $dbLabel = "db-unknown"
    }

    if ($days.Count -eq 0) {
        $dayLabel = "days-undated"
    }
    elseif ($days.Count -eq 1) {
        $dayLabel = $days[0]
    }
    elseif ($days.Count -le 3) {
        $dayLabel = $days -join "+"
    }
    else {
        $dayLabel = "$($days[0])_to_$($days[-1])"
    }

    return ConvertTo-SafeReportName -Value (@($accountLabel, $regionLabel, $dbLabel, $dayLabel, $Stamp) -join "_")
}

function Get-FileSourceKey {
    param(
        [Parameter(Mandatory)]
        [System.IO.FileInfo]$File
    )

    $accountSegment = Get-PathSegmentValue -FullName $File.FullName -Pattern "^account-\d{12}"
    $accountValue = if ($accountSegment -match "account-(\d{12})") { $Matches[1] } else { "account-unknown" }
    $regionValue = Get-RegionFromPath -File $File

    if (-not $regionValue) {
        $regionValue = "region-unknown"
    }

    $dbValue = Get-DbNameFromPath -File $File

    if (-not $dbValue) {
        $dbValue = "db-unknown"
    }

    return "$accountValue|$regionValue|$dbValue"
}

function ConvertTo-NormalizedMessage {
    param(
        [Parameter(Mandatory)]
        [string]$Message
    )

    $value = $Message
    $value = $value -replace "'[^']*'", "'?'"
    $value = $value -replace "\b\d+(?:\.\d+)?\b", "#"
    $value = $value -replace "\s+", " "
    $value = $value.Trim()

    if ($value.Length -gt 500) {
        return $value.Substring(0, 500)
    }

    return $value
}

function Get-ShortText {
    param(
        [string]$Text,
        [int]$MaxLength = 4000
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    $singleLine = ($Text -replace "\s+", " ").Trim()

    if ($singleLine.Length -le $MaxLength) {
        return $singleLine
    }

    return $singleLine.Substring(0, $MaxLength)
}

function Add-TopDuration {
    param(
        [System.Collections.ArrayList]$TopDurations,

        [Parameter(Mandatory)]
        [pscustomobject]$Candidate,

        [Parameter(Mandatory)]
        [int]$Limit
    )

    $null = $TopDurations.Add($Candidate)

    if ($TopDurations.Count -gt ($Limit * 4)) {
        $trimmed = @($TopDurations | Sort-Object DurationMs -Descending | Select-Object -First $Limit)
        $TopDurations.Clear()

        foreach ($item in $trimmed) {
            $null = $TopDurations.Add($item)
        }
    }
}

function Get-ParseErrorSummary {
    param(
        [Parameter(Mandatory)]
        [System.IO.FileInfo]$File,

        [Parameter(Mandatory)]
        [string]$ErrorMessage
    )

    $accountSegment = Get-PathSegmentValue -FullName $File.FullName -Pattern "^account-\d{12}"
    $accountValue = if ($accountSegment -match "account-(\d{12})") { $Matches[1] } else { "" }

    [pscustomobject]@{
        Status = "ERROR"
        Error = $ErrorMessage
        Account = $accountValue
        Db = Get-DbNameFromPath -File $File
        Day = Get-LogDayFromName -Name $File.Name
        LogFile = $File.Name
        Path = $File.FullName
        Bytes = $File.Length
        Lines = [int64]0
        Errors = [int64]0
        Warnings = [int64]0
        Fatals = [int64]0
        StatementLines = [int64]0
        DurationLines = [int64]0
        TotalDurationMs = [double]0
        MaxDurationMs = [double]0
        MaxDurationStatement = ""
        FirstTimestamp = ""
        LastTimestamp = ""
    }
}

function Resolve-LogFileSelection {
    param(
        [string[]]$InputPath
    )

    $roots = @()

    if ($InputPath -and $InputPath.Count -gt 0) {
        $roots = @($InputPath)
    }
    else {
        $roots = @($LogRoot)
    }

    $files = [System.Collections.ArrayList]::new()

    foreach ($root in $roots) {
        if (-not (Test-Path -LiteralPath $root)) {
            throw "Path not found: $root"
        }

        $item = Get-Item -LiteralPath $root

        if ($item.PSIsContainer) {
            Get-ChildItem -LiteralPath $item.FullName -Recurse -File |
                Where-Object {
                    $_.Name -notlike "*.zip" -and
                    $_.Name -notlike "*.partial" -and
                    $_.Name -notlike "_download-errors.*" -and
                    $_.FullName -notmatch "[\\/]_parse-reports[\\/]" -and
                    $_.FullName -notmatch "[\\/]_zips[\\/]" -and
                    $_.FullName -notmatch "[\\/]_run-logs[\\/]"
                } |
                ForEach-Object { $null = $files.Add($_) }
        }
        else {
            $null = $files.Add($item)
        }
    }

    $selected = @($files | Sort-Object FullName -Unique)

    if ($NameRegex) {
        $selected = @($selected | Where-Object { $_.Name -match $NameRegex })
    }

    if ($DbInstanceIdentifier) {
        $selected = @($selected | Where-Object { $_.FullName -match [regex]::Escape($DbInstanceIdentifier) })
    }

    if ($AccountId) {
        $selected = @($selected | Where-Object { $_.FullName -match [regex]::Escape($AccountId) })
    }

    if ($Day -and $Day.Count -gt 0) {
        $wantedDays = @{}
        foreach ($dayValue in $Day) {
            $wantedDays[$dayValue] = $true
        }

        $selected = @($selected | Where-Object { $wantedDays.ContainsKey((Get-LogDayFromName -Name $_.Name)) })
    }

    return @($selected)
}

function Read-PostgresLogFile {
    param(
        [Parameter(Mandatory)]
        [System.IO.FileInfo]$File,

        [System.Collections.ArrayList]$GlobalTopDurations,

        [hashtable]$GlobalErrorGroups,

        [hashtable]$GlobalMessageGroups,

        [int]$LineReadTimeoutSeconds = 30,

        [int]$MaxLineCharacters = 20000
    )

    $accountSegment = Get-PathSegmentValue -FullName $File.FullName -Pattern "^account-\d{12}"
    $accountValue = if ($accountSegment -match "account-(\d{12})") { $Matches[1] } else { "" }
    $dbName = Get-DbNameFromPath -File $File
    $dayValue = Get-LogDayFromName -Name $File.Name

    $lineCount = [int64]0
    $errorCount = [int64]0
    $warningCount = [int64]0
    $fatalCount = [int64]0
    $statementCount = [int64]0
    $durationCount = [int64]0
    $totalDurationMs = [double]0
    $maxDurationMs = [double]0
    $maxDurationStatement = ""
    $firstTimestamp = ""
    $lastTimestamp = ""

    $fileTopDurations = [System.Collections.ArrayList]::new()

    function Write-FileProgress {
        $bytesRead = [Math]::Min($File.Length, $stream.Position)
        $filePercent = if ($File.Length -gt 0) {
            [int][Math]::Floor(($bytesRead / [double]$File.Length) * 100)
        }
        else {
            100
        }
        $readMiB = [Math]::Round($bytesRead / 1MB, 1)
        $totalMiB = [Math]::Round($File.Length / 1MB, 1)
        Write-Progress -Id 2 -Activity "Parsing $($File.Name)" -Status "$lineCount lines | $readMiB/$totalMiB MiB" -PercentComplete ([Math]::Min(99, [Math]::Max(1, $filePercent)))
    }

    $processLogLine = {
        param(
            [AllowEmptyString()]
            [string]$Line
        )

        $lineCount++

        if (($lineCount % 50000) -eq 0) {
            Write-FileProgress
        }

        $timestampMatch = [regex]::Match($Line, "^(?<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?(?: UTC)?)")
        if ($timestampMatch.Success) {
            $lastTimestamp = $timestampMatch.Groups["ts"].Value
            if (-not $firstTimestamp) {
                $firstTimestamp = $lastTimestamp
            }
        }

        $severityMatch = [regex]::Match($Line, "(?:^|[:\s])(LOG|ERROR|FATAL|PANIC|WARNING|STATEMENT|DETAIL|HINT|CONTEXT):\s*(?<msg>.*)$")

        if ($severityMatch.Success) {
            $severity = $severityMatch.Groups[1].Value
            $message = $severityMatch.Groups["msg"].Value
            $normalized = ConvertTo-NormalizedMessage -Message "${severity}: $message"

            if (-not $GlobalMessageGroups.ContainsKey($normalized)) {
                $GlobalMessageGroups[$normalized] = [pscustomobject]@{
                    Count = [int64]0
                    Severity = $severity
                    Sample = Get-ShortText -Text "${severity}: $message" -MaxLength 1000
                }
            }
            $GlobalMessageGroups[$normalized].Count++

            switch ($severity) {
                "ERROR" {
                    $errorCount++
                    if (-not $GlobalErrorGroups.ContainsKey($normalized)) {
                        $GlobalErrorGroups[$normalized] = [pscustomobject]@{
                            Count = [int64]0
                            Severity = $severity
                            Sample = Get-ShortText -Text $message -MaxLength 1000
                            FirstFile = $File.Name
                        }
                    }
                    $GlobalErrorGroups[$normalized].Count++
                }
                "FATAL" {
                    $fatalCount++
                    if (-not $GlobalMessageGroups.ContainsKey($normalized)) {
                        $GlobalMessageGroups[$normalized] = [pscustomobject]@{
                            Count = [int64]0
                            Severity = $severity
                            Sample = Get-ShortText -Text "${severity}: $message" -MaxLength 1000
                        }
                    }
                    if (-not $GlobalErrorGroups.ContainsKey($normalized)) {
                        $GlobalErrorGroups[$normalized] = [pscustomobject]@{
                            Count = [int64]0
                            Severity = $severity
                            Sample = Get-ShortText -Text $message -MaxLength 1000
                            FirstFile = $File.Name
                        }
                    }
                    $GlobalErrorGroups[$normalized].Count++
                }
                "PANIC" {
                    $fatalCount++
                    if (-not $GlobalErrorGroups.ContainsKey($normalized)) {
                        $GlobalErrorGroups[$normalized] = [pscustomobject]@{
                            Count = [int64]0
                            Severity = $severity
                            Sample = Get-ShortText -Text $message -MaxLength 1000
                            FirstFile = $File.Name
                        }
                    }
                    $GlobalErrorGroups[$normalized].Count++
                }
                "WARNING" { $warningCount++ }
                "STATEMENT" { $statementCount++ }
            }
        }

        $durationMatch = [regex]::Match($Line, "duration:\s*(?<ms>\d+(?:\.\d+)?)\s*ms\s*(?:(?:statement|execute\s+[^:]+):\s*)?(?<stmt>.*)$", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

        if ($durationMatch.Success) {
            $durationMs = [double]::Parse($durationMatch.Groups["ms"].Value, [Globalization.CultureInfo]::InvariantCulture)
            $statement = Get-ShortText -Text $durationMatch.Groups["stmt"].Value
            $durationCount++
            $totalDurationMs += $durationMs

            if ($durationMs -gt $maxDurationMs) {
                $maxDurationMs = $durationMs
                $maxDurationStatement = $statement
            }

            $candidate = [pscustomobject]@{
                DurationMs = [Math]::Round($durationMs, 3)
                Account = $accountValue
                Db = $dbName
                Day = $dayValue
                LogFile = $File.Name
                Line = $lineCount
                Statement = $statement
            }

            Add-TopDuration -TopDurations $fileTopDurations -Candidate $candidate -Limit $Top
            Add-TopDuration -TopDurations $GlobalTopDurations -Candidate $candidate -Limit $Top
        }
    }

    $stream = [System.IO.File]::Open($File.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)

    try {
        $reader = [System.IO.StreamReader]::new($stream, [System.Text.UTF8Encoding]::new($false), $true, 1048576)

        try {
            $buffer = [char[]]::new(1048576)
            $lineBuilder = [System.Text.StringBuilder]::new([int][Math]::Min($MaxLineCharacters, 65536))
            $lastProgress = Get-Date
            $progressEverySeconds = [Math]::Max(1, [Math]::Min(10, [int]($LineReadTimeoutSeconds / 3)))

            while (($charsRead = $reader.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $chunk = [string]::new($buffer, 0, $charsRead)
                $offset = 0

                while (($newlineIndex = $chunk.IndexOf("`n", $offset)) -ge 0) {
                    $segmentLength = $newlineIndex - $offset
                    $remainingCapacity = $MaxLineCharacters - $lineBuilder.Length

                    if ($segmentLength -gt 0 -and $remainingCapacity -gt 0) {
                        $takeLength = [Math]::Min($remainingCapacity, $segmentLength)
                        [void]$lineBuilder.Append($chunk.Substring($offset, $takeLength))
                    }

                    . $processLogLine -Line ($lineBuilder.ToString().TrimEnd("`r"))
                    [void]$lineBuilder.Clear()
                    $offset = $newlineIndex + 1
                }

                if ($offset -lt $chunk.Length) {
                    $segmentLength = $chunk.Length - $offset
                    $remainingCapacity = $MaxLineCharacters - $lineBuilder.Length

                    if ($segmentLength -gt 0 -and $remainingCapacity -gt 0) {
                        $takeLength = [Math]::Min($remainingCapacity, $segmentLength)
                        [void]$lineBuilder.Append($chunk.Substring($offset, $takeLength))
                    }
                }

                if (((Get-Date) - $lastProgress).TotalSeconds -ge $progressEverySeconds) {
                    Write-FileProgress
                    $lastProgress = Get-Date
                }
            }

            if ($lineBuilder.Length -gt 0) {
                . $processLogLine -Line ($lineBuilder.ToString().TrimEnd("`r"))
            }
        }
        finally {
            $reader.Dispose()
        }
    }
    finally {
        $stream.Dispose()
        Write-Progress -Id 2 -Activity "Parsing $($File.Name)" -Completed
    }

    [pscustomobject]@{
        Status = "OK"
        Error = ""
        Account = $accountValue
        Db = $dbName
        Day = $dayValue
        LogFile = $File.Name
        Path = $File.FullName
        Bytes = $File.Length
        Lines = $lineCount
        Errors = $errorCount
        Warnings = $warningCount
        Fatals = $fatalCount
        StatementLines = $statementCount
        DurationLines = $durationCount
        TotalDurationMs = [Math]::Round($totalDurationMs, 3)
        MaxDurationMs = [Math]::Round($maxDurationMs, 3)
        MaxDurationStatement = $maxDurationStatement
        FirstTimestamp = $firstTimestamp
        LastTimestamp = $lastTimestamp
    }
}

$filesToParse = @(Resolve-LogFileSelection -InputPath $LogPath)

if ($filesToParse.Count -eq 0) {
    throw "No log files matched. LogRoot='$LogRoot', DbInstanceIdentifier='$DbInstanceIdentifier', AccountId='$AccountId', Day='$($Day -join ',')', NameRegex='$NameRegex'."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

if (-not $OutDir) {
    $reportRoot = Join-Path $LogRoot "_parse-reports"
    $sourceGroups = @($filesToParse | Group-Object { Get-FileSourceKey -File $_ } | Sort-Object Name)

    if ($sourceGroups.Count -gt 1) {
        $parentRunFolder = Join-Path $reportRoot (Get-ReportScopeLabel -Files $filesToParse -Stamp $stamp)
        New-Item -ItemType Directory -Path $parentRunFolder -Force | Out-Null

        $manifestPath = Join-Path $parentRunFolder "parse-groups-$stamp.csv"
        $manifestRows = [System.Collections.ArrayList]::new()
        $scriptPath = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path }

        Write-Host "Parsing $($filesToParse.Count) RDS PostgreSQL log file(s) across $($sourceGroups.Count) source group(s)..."
        Write-Host "Output folder: $parentRunFolder"

        foreach ($sourceGroup in $sourceGroups) {
            $groupFiles = @($sourceGroup.Group)
            $groupOutDir = Join-Path $parentRunFolder (Get-ReportScopeLabel -Files $groupFiles -Stamp $stamp)

            Write-Host ""
            Write-Host "Parsing source group: $($sourceGroup.Name)"
            Write-Host "Group output folder: $groupOutDir"

            $childParams = @{
                LogPath = @($groupFiles | ForEach-Object { $_.FullName })
                OutDir = $groupOutDir
                Top = $Top
                ReadTimeoutSeconds = $ReadTimeoutSeconds
                MaxLineChars = $MaxLineChars
            }

            if ($NameRegex) {
                $childParams.NameRegex = $NameRegex
            }

            & $scriptPath @childParams

            $null = $manifestRows.Add([pscustomobject]@{
                SourceKey = $sourceGroup.Name
                FileCount = $groupFiles.Count
                OutputFolder = $groupOutDir
            })
        }

        @($manifestRows) |
            Export-Csv -LiteralPath $manifestPath -NoTypeInformation -Encoding utf8

        Write-Host ""
        Write-Host "Grouped parse complete."
        Write-Host "Parent output folder: $parentRunFolder"
        Write-Host "Group manifest CSV:  $manifestPath"
        return
    }

    $runFolderName = Get-ReportScopeLabel -Files $filesToParse -Stamp $stamp
    $OutDir = Join-Path $reportRoot $runFolderName
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

Write-Host "Parsing $($filesToParse.Count) RDS PostgreSQL log file(s)..."
Write-Host "Output folder: $OutDir"

$topDurations = [System.Collections.ArrayList]::new()
$errorGroups = @{}
$messageGroups = @{}
$summaries = [System.Collections.ArrayList]::new()
$fileIndex = 0
$summaryPath = Join-Path $OutDir "postgres-summary-$stamp.csv"
$topDurationPath = Join-Path $OutDir "postgres-top-durations-$stamp.csv"
$errorPath = Join-Path $OutDir "postgres-errors-$stamp.csv"
$messagePath = Join-Path $OutDir "postgres-noisy-messages-$stamp.csv"
$readmePath = Join-Path $OutDir "postgres-parse-report-$stamp.txt"
$checkpointPath = Join-Path $OutDir "postgres-parse-checkpoint-$stamp.txt"

foreach ($file in $filesToParse) {
    $fileIndex++
    $overallPercent = [int][Math]::Floor((($fileIndex - 1) / [double]$filesToParse.Count) * 100)
    Write-Progress -Id 1 -Activity "Parsing RDS logs" -Status "$fileIndex/$($filesToParse.Count): $($file.Name)" -PercentComplete $overallPercent
    [System.IO.File]::WriteAllText($checkpointPath, "Started $fileIndex/$($filesToParse.Count): $($file.FullName)`r`n$(Get-Date -Format o)", [System.Text.UTF8Encoding]::new($false))

    try {
        $summary = Read-PostgresLogFile -File $file -GlobalTopDurations $topDurations -GlobalErrorGroups $errorGroups -GlobalMessageGroups $messageGroups -LineReadTimeoutSeconds $ReadTimeoutSeconds
    }
    catch {
        $summary = Get-ParseErrorSummary -File $file -ErrorMessage $_.Exception.Message
        Write-Warning "Skipping '$($file.FullName)': $($_.Exception.Message)"
    }

    $null = $summaries.Add($summary)

    @($summaries) |
        Sort-Object Day, LogFile |
        Export-Csv -LiteralPath $summaryPath -NoTypeInformation -Encoding utf8
}

Write-Progress -Id 1 -Activity "Parsing RDS logs" -Completed

@($summaries) |
    Sort-Object Day, LogFile |
    Export-Csv -LiteralPath $summaryPath -NoTypeInformation -Encoding utf8

@($topDurations | Sort-Object DurationMs -Descending | Select-Object -First $Top) |
    Export-Csv -LiteralPath $topDurationPath -NoTypeInformation -Encoding utf8

@(
    foreach ($key in $errorGroups.Keys) {
        $entry = $errorGroups[$key]
        [pscustomobject]@{
            Count = $entry.Count
            Severity = $entry.Severity
            Sample = $entry.Sample
            FirstFile = $entry.FirstFile
            Normalized = $key
        }
    }
) |
    Sort-Object Count -Descending |
    Select-Object -First $Top |
    Export-Csv -LiteralPath $errorPath -NoTypeInformation -Encoding utf8

@(
    foreach ($key in $messageGroups.Keys) {
        $entry = $messageGroups[$key]
        [pscustomobject]@{
            Count = $entry.Count
            Severity = $entry.Severity
            Sample = $entry.Sample
            Normalized = $key
        }
    }
) |
    Sort-Object Count -Descending |
    Select-Object -First $Top |
    Export-Csv -LiteralPath $messagePath -NoTypeInformation -Encoding utf8

$totalBytes = [int64]0
$totalLines = [int64]0
$totalErrors = [int64]0
$totalWarnings = [int64]0
$totalFatals = [int64]0
$totalDurationLines = [int64]0

foreach ($summary in $summaries) {
    $totalBytes += $summary.Bytes
    $totalLines += $summary.Lines
    $totalErrors += $summary.Errors
    $totalWarnings += $summary.Warnings
    $totalFatals += $summary.Fatals
    $totalDurationLines += $summary.DurationLines
}

$reportLines = @(
    "RDS PostgreSQL parse report",
    "Generated: $(Get-Date -Format o)",
    "Files parsed: $($filesToParse.Count)",
    "Total bytes: $totalBytes",
    "Total lines: $totalLines",
    "Errors: $totalErrors",
    "Warnings: $totalWarnings",
    "Fatals/Panics: $totalFatals",
    "Duration lines: $totalDurationLines",
    "",
    "Summary CSV: $summaryPath",
    "Top durations CSV: $topDurationPath",
    "Errors CSV: $errorPath",
    "Noisy messages CSV: $messagePath"
)

[System.IO.File]::WriteAllLines($readmePath, $reportLines, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Parse complete."
Write-Host "Summary CSV:       $summaryPath"
Write-Host "Top durations CSV: $topDurationPath"
Write-Host "Errors CSV:        $errorPath"
Write-Host "Noisy messages CSV:$messagePath"
Write-Host "Report TXT:        $readmePath"

@($summaries) |
    Sort-Object Day, LogFile |
    Select-Object Day, LogFile, Lines, Errors, Warnings, Fatals, DurationLines, MaxDurationMs |
    Format-Table -AutoSize
