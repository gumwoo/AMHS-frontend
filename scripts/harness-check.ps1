$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure {
    param([string] $Message)
    $failures.Add($Message) | Out-Null
}

Write-Host "[하네스] 프론트엔드 아키텍처 제약 검사 시작"

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
            Add-Failure "금지 의존성 '$name' 감지"
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
        Add-Failure "문서화되지 않은 상태값 '$status' 감지: $($match.Path):$($match.LineNumber)"
    }
}

$trackedMarkdown = git ls-files "*.md" 2>$null | Where-Object { $_ -ne "README.md" }
if ($trackedMarkdown) {
    Add-Failure "README.md 외 Markdown 파일이 Git에 추적 중입니다: $($trackedMarkdown -join ', ')"
}

if ($failures.Count -gt 0) {
    Write-Host "[하네스] 실패"
    foreach ($failure in $failures) {
        Write-Host " - $failure"
    }
    exit 1
}

Write-Host "[하네스] 통과: 금지 의존성, 미정의 상태값, 문서 커밋 여부 이상 없음"
