param(
    [switch]$DryRun,
    [switch]$NoBackup,
    [switch]$IncludeProject
)

$ErrorActionPreference = "Stop"

$PackageBuilder = Join-Path $PSScriptRoot "package/build-package.mjs"
$MaterializedClaudeProfile = "claude/profile/.claude"
$MaterializedCodexProfile = "codex/profile/.codex"
$GeneratedStateExclusions = @(
    ".claude/logs/**",
    ".claude/cache/**",
    ".claude/traces/**",
    ".claude/browser-artifacts/**",
    ".claude/browser-runtime/**",
    ".claude/tools/**/node_modules/**",
    ".claude/tmp/**",
    ".claude/runtime-state.sqlite*",
    ".claude/memory.json",
    ".claude/memorygraph/**",
    ".claude/*verdict*.json",
    ".claude/knowledge-repo-audit-*.json",
    ".code-review-graph/**",
    "package/**/.local/**"
)

function Write-Info($Message) {
    Write-Host "[INFO] $Message"
}

function Get-RelativePayloadPath($BasePath, $ChildPath) {
    $baseFull = [System.IO.Path]::GetFullPath($BasePath)
    $childFull = [System.IO.Path]::GetFullPath($ChildPath)
    if (-not $baseFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
        $baseFull = $baseFull + [System.IO.Path]::DirectorySeparatorChar
    }
    if (-not $childFull.StartsWith($baseFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Payload file is outside source root: $ChildPath"
    }
    return $childFull.Substring($baseFull.Length)
}

function Get-PayloadTargets($SourceRoot, $TargetRoot) {
    if (-not (Test-Path -LiteralPath $SourceRoot -PathType Container)) {
        Write-Host "    missing payload: $SourceRoot"
        return
    }

    Get-ChildItem -LiteralPath $SourceRoot -Recurse -File |
        Sort-Object FullName |
        ForEach-Object {
            $relative = Get-RelativePayloadPath $SourceRoot $_.FullName
            "    $TargetRoot/$($relative -replace '\\','/')"
        }
}

function Copy-PayloadDirectory($SourceRoot, $TargetRoot) {
    if (-not (Test-Path -LiteralPath $SourceRoot -PathType Container)) {
        throw "Payload source not found: $SourceRoot"
    }

    New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
    Get-ChildItem -LiteralPath $SourceRoot -Force | ForEach-Object {
        $target = Join-Path $TargetRoot $_.Name
        Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force
    }
}

function New-MaterializedPayloads($OutputRoot) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js is required. Package payloads are materialized from canonical source by package/build-package.mjs."
    }
    if (-not (Test-Path -LiteralPath $PackageBuilder -PathType Leaf)) {
        throw "Package materializer not found: $PackageBuilder"
    }

    New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
    & node $PackageBuilder --runtime all --out $OutputRoot --clean | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Package materialization failed."
    }
}

$payloadRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("moonshot-relay-package-" + [System.Guid]::NewGuid().ToString())
New-MaterializedPayloads $payloadRoot
$ClaudePayload = Join-Path $payloadRoot $MaterializedClaudeProfile
$CodexPayload = Join-Path $payloadRoot $MaterializedCodexProfile

if ($DryRun) {
    Write-Info "[DRY-RUN] package/build-package.mjs will materialize Claude/Codex payloads from canonical source."
    Write-Info "[DRY-RUN] materialized Claude payload will install .claude/"
    Write-Info "[DRY-RUN] materialized Codex payload will install .codex/"
    Write-Host ""
    Write-Info "Target .claude payload files:"
    Get-PayloadTargets $ClaudePayload ".claude"
    Write-Host ""
    Write-Info "Target .codex payload files:"
    Get-PayloadTargets $CodexPayload ".codex"
    Write-Host ""
    Write-Info "Excluded generated-state paths:"
    foreach ($pattern in $GeneratedStateExclusions) {
        Write-Host "    $pattern"
    }
    if (-not $IncludeProject) {
        Write-Host "    .claude/PROJECT.md (protected unless -IncludeProject is set)"
    }
    Remove-Item -LiteralPath $payloadRoot -Recurse -Force
    exit 0
}

if (-not (Test-Path -LiteralPath $ClaudePayload -PathType Container)) {
    throw "Claude package payload not found: $ClaudePayload"
}

if (-not $NoBackup) {
    $suffix = ".backup-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    foreach ($path in @(".claude", ".codex", "AGENTS.md")) {
        if (Test-Path -LiteralPath $path) {
            Copy-Item -LiteralPath $path -Destination "$path$suffix" -Recurse -Force
            Write-Info "Backed up $path to $path$suffix"
        }
    }
}

$projectStash = $null
if (-not $IncludeProject -and (Test-Path -LiteralPath ".claude/PROJECT.md" -PathType Leaf)) {
    $projectStash = Join-Path ([System.IO.Path]::GetTempPath()) ("moonshot-relay-project-" + [System.Guid]::NewGuid().ToString() + ".md")
    Copy-Item -LiteralPath ".claude/PROJECT.md" -Destination $projectStash -Force
}

Copy-PayloadDirectory $ClaudePayload ".claude"
if (-not $IncludeProject) {
    if ($projectStash -and (Test-Path -LiteralPath $projectStash -PathType Leaf)) {
        Copy-Item -LiteralPath $projectStash -Destination ".claude/PROJECT.md" -Force
        Remove-Item -LiteralPath $projectStash -Force
        Write-Info "Restored existing PROJECT.md; pass -IncludeProject to replace it from the package."
    } elseif (Test-Path -LiteralPath ".claude/PROJECT.md" -PathType Leaf) {
        Remove-Item -LiteralPath ".claude/PROJECT.md" -Force
        Write-Info "Protected PROJECT.md by excluding package copy; pass -IncludeProject to include it."
    }
}

if (Test-Path -LiteralPath $CodexPayload -PathType Container) {
    Copy-PayloadDirectory $CodexPayload ".codex"
}

if (Test-Path -LiteralPath "AGENTS.md") {
    Remove-Item -LiteralPath "AGENTS.md" -Force
}
New-Item -ItemType SymbolicLink -Path "AGENTS.md" -Target ".claude/CLAUDE.md" | Out-Null

Write-Info "Install completed from package payloads."
Remove-Item -LiteralPath $payloadRoot -Recurse -Force
