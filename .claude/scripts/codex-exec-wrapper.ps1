$codexArgs = New-Object System.Collections.Generic.List[string]
$promptFile = $null

for ($index = 0; $index -lt $args.Count; $index++) {
  if ($args[$index] -eq '--codex-prompt-file') {
    $index++
    if ($index -lt $args.Count) {
      $promptFile = $args[$index]
    }
    continue
  }
  [void]$codexArgs.Add($args[$index])
}

if ($promptFile) {
  $prompt = Get-Content -LiteralPath $promptFile -Raw
  $argArray = $codexArgs.ToArray()
  & codex @argArray $prompt
} else {
  $argArray = $codexArgs.ToArray()
  & codex @argArray
}
exit $LASTEXITCODE
