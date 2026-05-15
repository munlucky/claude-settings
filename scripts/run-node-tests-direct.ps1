param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Patterns
)

$ErrorActionPreference = "Stop"
$env:AGENT_LOOP_CONTINUE_ON_BLOCKED = $null

if (-not $Patterns -or $Patterns.Count -eq 0) {
  Write-Error "Usage: pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 <test-file-or-glob> [...]"
  exit 64
}

$files = New-Object System.Collections.Generic.List[string]
foreach ($pattern in $Patterns) {
  if ([string]::IsNullOrWhiteSpace($pattern)) {
    continue
  }
  if ($pattern.Contains("*")) {
    $matches = Get-ChildItem -Path $pattern -File | Sort-Object FullName
    foreach ($match in $matches) {
      $files.Add($match.FullName)
    }
  } else {
    $resolved = Resolve-Path -LiteralPath $pattern -ErrorAction SilentlyContinue
    if (-not $resolved) {
      Write-Error "Missing test file: $pattern"
      exit 66
    }
    $files.Add($resolved.Path)
  }
}

$uniqueFiles = $files | Sort-Object -Unique
if (-not $uniqueFiles -or $uniqueFiles.Count -eq 0) {
  Write-Error "No test files matched: $($Patterns -join ', ')"
  exit 66
}

foreach ($file in $uniqueFiles) {
  & node $file
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
