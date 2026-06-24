$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure {
    param([string] $Message)
    $failures.Add($Message) | Out-Null
}

function Assert-SetEquals {
    param(
        [string] $Name,
        [string[]] $Expected,
        [string[]] $Actual
    )

    $missing = $Expected | Where-Object { $_ -notin $Actual }
    $extra = $Actual | Where-Object { $_ -notin $Expected }

    foreach ($item in $missing) {
        Add-Failure "$Name is missing '$item'"
    }
    foreach ($item in $extra) {
        Add-Failure "$Name has undocumented value '$item'"
    }
}

function Read-TypeUnionValues {
    param(
        [string] $Raw,
        [string] $TypeName
    )

    $match = [regex]::Match($Raw, "export\s+type\s+$TypeName\s*=\s*(?<body>.*?)(?=\r?\nexport\s+|\z)", "Singleline")
    if (-not $match.Success) {
        Add-Failure "Type union '$TypeName' was not found in src/api.ts"
        return @()
    }

    return [regex]::Matches($match.Groups["body"].Value, "'([^']+)'") |
        ForEach-Object { $_.Groups[1].Value } |
        Sort-Object -Unique
}

function Read-MonitoringSubscriptions {
    param([string] $Raw)

    $match = [regex]::Match($Raw, "const\s+eventTypes\s*=\s*\[(?<body>.*?)\]", "Singleline")
    if (-not $match.Success) {
        Add-Failure "Monitoring event subscription list was not found in src/api.ts"
        return @()
    }

    return [regex]::Matches($match.Groups["body"].Value, "'([^']+)'") |
        ForEach-Object { $_.Groups[1].Value } |
        Sort-Object -Unique
}

Write-Host "[harness] Frontend harness check started"

$forbiddenDependencies = @(
    "kafka",
    "rabbitmq",
    "socket.io",
    "websocket",
    "@tanstack/react-query",
    "zustand"
)

$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$allDependencies = @{}
foreach ($section in @("dependencies", "devDependencies")) {
    if ($packageJson.$section) {
        $packageJson.$section.PSObject.Properties | ForEach-Object {
            $allDependencies[$_.Name] = $_.Value
        }
    }
}

foreach ($dependency in $forbiddenDependencies) {
    foreach ($name in $allDependencies.Keys) {
        if ($name -like "*$dependency*") {
            Add-Failure "Forbidden dependency detected: $name"
        }
    }
}

$forbiddenStatuses = @(
    "BUSY",
    "RUNNING",
    "OFFLINE",
    "MAINTENANCE",
    "PAUSED",
    "DONE",
    "IN_PROGRESS"
)

$sourceFiles = Get-ChildItem -Path "src" -Recurse -File -Include *.ts,*.tsx,*.css |
    Where-Object { $_.FullName -notmatch "\\dist\\" }

foreach ($status in $forbiddenStatuses) {
    $pattern = "['""]$status['""]"
    $matches = $sourceFiles | Select-String -Pattern $pattern -CaseSensitive
    foreach ($match in $matches) {
        Add-Failure "Undocumented status literal '$status' detected: $($match.Path):$($match.LineNumber)"
    }
}

$apiRaw = Get-Content "src/api.ts" -Raw

Assert-SetEquals "TransferStatus type" `
    @("WAITING", "ASSIGNED", "MOVING", "COMPLETED", "FAILED", "CANCELED") `
    (Read-TypeUnionValues $apiRaw "TransferStatus")

Assert-SetEquals "TransferPriority type" `
    @("LOW", "NORMAL", "HIGH", "URGENT") `
    (Read-TypeUnionValues $apiRaw "TransferPriority")

Assert-SetEquals "OhtStatus type" `
    @("IDLE", "RESERVED", "MOVING", "ERROR") `
    (Read-TypeUnionValues $apiRaw "OhtStatus")

Assert-SetEquals "NodeType type" `
    @("STOCKER", "EQP", "PORT", "JUNCTION", "CHARGER", "BUFFER") `
    (Read-TypeUnionValues $apiRaw "NodeType")

Assert-SetEquals "OperationActionType type" `
    @("TRANSFER_CANCELED", "EDGE_BLOCKED", "EDGE_UNBLOCKED", "OHT_MARKED_ERROR", "OHT_RECOVERED") `
    (Read-TypeUnionValues $apiRaw "OperationActionType")

$expectedMonitoringEvents = @(
    "TRANSFER_CREATED",
    "OHT_ASSIGNED",
    "TRANSFER_STARTED",
    "OHT_MOVED",
    "TRANSFER_COMPLETED",
    "TRANSFER_DELAYED",
    "TRANSFER_FAILED",
    "TRANSFER_CANCELED",
    "OHT_ERROR_OCCURRED",
    "OHT_RECOVERED",
    "EDGE_BLOCKED",
    "EDGE_UNBLOCKED",
    "ROUTE_NOT_FOUND"
)
Assert-SetEquals "Monitoring SSE subscription contract" $expectedMonitoringEvents (Read-MonitoringSubscriptions $apiRaw)

$expectedApiPaths = @(
    "/analytics/bottlenecks",
    "/analytics/summary",
    "/demo-monitoring/status",
    "/demo-monitoring/start",
    "/demo-monitoring/stop",
    "/demo-monitoring/tick",
    "/dispatch/auto/start",
    "/dispatch/auto/status",
    "/dispatch/auto/stop",
    "/dispatch/auto/tick",
    "/fab-edges/",
    "/fab-map",
    "/ohts",
    "/operations/action-logs",
    "/operations/overview",
    "/simulation/start",
    "/simulation/status",
    "/simulation/stop",
    "/transfer-requests"
)
foreach ($path in $expectedApiPaths) {
    if (-not $apiRaw.Contains($path)) {
        Add-Failure "Frontend API client is missing expected path fragment: $path"
    }
}

$trackedMarkdown = git ls-files "*.md" 2>$null | Where-Object { $_ -ne "README.md" }
if ($trackedMarkdown) {
    Add-Failure "Markdown files other than README.md are tracked by Git: $($trackedMarkdown -join ', ')"
}

if ($failures.Count -gt 0) {
    Write-Host "[harness] FAILED"
    foreach ($failure in $failures) {
        Write-Host " - $failure"
    }
    exit 1
}

Write-Host "[harness] PASSED: frontend constraints and API/SSE contracts are valid"
