param(
    [ValidateSet("all", "claude", "codex")]
    [string]$Runtime = "all",
    [string]$MoonshotHome = "",
    [string]$ClaudeHome = "",
    [string]$CodexHome = "",
    [switch]$DryRun,
    [switch]$NoBackup,
    [switch]$RemoveLegacyHarnessCore,
    [switch]$Project
)

$ErrorActionPreference = "Stop"

function Write-Info($Message) {
    Write-Host "[INFO] $Message"
}

if ($Project) {
    throw "Project-local install is a legacy compatibility mode. Use Git Bash/WSL with: bash install-claude.sh --project"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required. Run this installer from a shell where node is on PATH."
}

$Installer = Join-Path $PSScriptRoot "scripts/install-account-root-harness.mjs"
if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) {
    throw "Account-root installer not found: $Installer"
}

$argsList = @(
    $Installer,
    "--runtime", $Runtime,
    "--source-root", $PSScriptRoot
)

if ($DryRun) {
    $argsList += "--dry-run"
}
if ($NoBackup) {
    $argsList += "--no-backup"
}
if ($RemoveLegacyHarnessCore) {
    $argsList += "--remove-legacy-harness-core"
}
if ($MoonshotHome) {
    $argsList += @("--moonshot-home", $MoonshotHome)
}
if ($ClaudeHome) {
    $argsList += @("--claude-home", $ClaudeHome)
}
if ($CodexHome) {
    $argsList += @("--codex-home", $CodexHome)
}

Write-Info "Installing Moonshot Relay account-root runtime payloads."
Write-Info "Shared runtime home defaults to `$env:MOONSHOT_RELAY_HOME or ~/.moonshot-relay."
& node @argsList
if ($LASTEXITCODE -ne 0) {
    throw "Moonshot Relay account-root install failed with exit code $LASTEXITCODE."
}
