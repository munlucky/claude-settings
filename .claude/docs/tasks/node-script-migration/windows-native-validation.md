# Windows Native Validation Runbook

Last-Reviewed: 2026-04-08

## Goal

Run the Node-first `.claude/scripts` path on a real Windows PowerShell or CMD host and capture what still fails without WSL or Git Bash.

## Preconditions

- Windows machine with this repository checked out
- `node` on `PATH`
- `git` on `PATH`
- `codex` and/or `claude` installed if runtime-specific checks are needed
- PowerShell 5+ or PowerShell 7+

## Primary Command

From the repository root in PowerShell:

```powershell
.claude\scripts\windows-native-validation.ps1
```

Direct Node invocation also works:

```powershell
node .claude/scripts/windows-native-validation.mjs
```

## What It Checks

1. `runtime-cli.mjs active-workspace-contract`
2. `install-browser-runtime.mjs --help`
3. `install-browser-runtime.mjs --bin-dir <temp> --force`
4. `moonshot-phase-dispatch.mjs` dry-run
5. `agent-loop.mjs` dry-run
6. `verify-phase-runtime-parity.mjs --render-only`

## Expected Current Posture

- Items 1 through 5 should pass on Windows native if `node` is available.
- Item 6 may be skipped or fail if `bash` is not installed, because `verify-phase-runtime-parity.mjs` still delegates to `verify-phase-runtime-parity-shell-core.sh`.

## Report Artifact

- JSON report: `.claude/logs/windows-native-validation/latest.json`

## Manual Follow-up Checks

After the scripted run, check these manually:

```powershell
node .claude/scripts/install-browser-runtime.mjs --bin-dir "$env:TEMP\\browserctl-bin" --force
Get-ChildItem "$env:TEMP\\browserctl-bin"
```

If you add that bin directory to `PATH`, verify launcher resolution:

```powershell
browserctl --help
```

## Pass Criteria

- No failures for items 1 through 5
- Item 6 is either:
  - `PASS` when `bash` is installed on Windows
  - `SKIP` with the recorded bash prerequisite note

## If Validation Fails

- Save `.claude/logs/windows-native-validation/latest.json`
- Record the exact failing command and first error line
- Update the migration task docs before changing implementation
