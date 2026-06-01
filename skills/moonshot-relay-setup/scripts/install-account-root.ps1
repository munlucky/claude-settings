param(
    [switch]$DryRun,
    [switch]$NoBackup,
    [string]$Runtime = "all",
    [string]$Ref = "main"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required for Moonshot Relay account-root installation."
}

$repo = "https://github.com/munlucky/moonshot-relay"
$zipUrl = "$repo/archive/refs/heads/$Ref.zip"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("moonshot-relay-install-" + [System.Guid]::NewGuid().ToString())
$zipPath = Join-Path $tempRoot "moonshot-relay.zip"

New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

try {
    Write-Host "[INFO] Downloading $zipUrl"
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath
    Expand-Archive -LiteralPath $zipPath -DestinationPath $tempRoot -Force

    $sourceRoot = Get-ChildItem -LiteralPath $tempRoot -Directory |
        Where-Object { $_.Name -like "moonshot-relay-*" } |
        Select-Object -First 1

    if (-not $sourceRoot) {
        throw "Downloaded Moonshot Relay archive did not contain the expected source root."
    }

    $installer = Join-Path $sourceRoot.FullName "scripts/install-account-root-harness.mjs"
    if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
        throw "Account-root installer not found: $installer"
    }

    $args = @($installer, "--runtime", $Runtime, "--source-root", $sourceRoot.FullName, "--remove-legacy-harness-core")
    if ($DryRun) {
        $args += "--dry-run"
    }
    if ($NoBackup) {
        $args += "--no-backup"
    }

    & node @args
    if ($LASTEXITCODE -ne 0) {
        throw "Moonshot Relay account-root installer failed with exit code $LASTEXITCODE."
    }
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
