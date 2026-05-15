$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Root = Split-Path -Parent $Root
Set-Location $Root
node .claude/scripts/windows-native-validation.mjs @args
