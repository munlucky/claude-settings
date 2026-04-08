# Node Script Migration Patch Design

Last-Reviewed: 2026-04-08

## Scope

This document describes the concrete patch plan for moving `.claude/scripts` runtime logic into Node modules while keeping current shell entrypoints stable during the transition.

## Patch Set 1: Introduce shared Node runtime libraries

New files:

- `.claude/scripts/lib/runtime-platform.mjs`
- `.claude/scripts/lib/process-utils.mjs`
- `.claude/scripts/lib/fs-utils.mjs`
- `.claude/scripts/lib/git-utils.mjs`
- `.claude/scripts/lib/yaml-lite.mjs`
- `.claude/scripts/lib/logging.mjs`

### Responsibilities

`runtime-platform.mjs`

- detect `darwin`, `linux`, `win32`
- detect WSL
- resolve active workspace contract
- handle WSL auth-copy or symlink fallback logic without shell-specific helpers

`process-utils.mjs`

- `runCommand()`
- `runCommandStreaming()`
- `runWithTimeout()`
- `findPidsByPattern()`
- `terminateProcessTree()`

`fs-utils.mjs`

- `makeTempDir()`
- `sha1File()`
- `walkFiles()`
- `readText()`
- `writeText()`
- `ensureSymlinkOrCopy()`

`yaml-lite.mjs`

- parse the limited `phase-status.yaml` structures already used by the harness
- support deterministic targeted updates rather than generic document reserialization

## Patch Set 2: Replace `runtime-cli.sh` logic with `runtime-cli.mjs`

Current file:

- `.claude/scripts/runtime-cli.sh`

New file:

- `.claude/scripts/runtime-cli.mjs`

### Current behaviors to preserve

- WSL detection
- Windows Codex auth discovery for WSL copies
- active workspace contract lookup
- pid search by pattern
- Codex base-argument assembly

### Compatibility approach

- keep `runtime-cli.sh` as a wrapper or source-compatible shim only as long as shell consumers require it
- any shell file that currently `source`s `runtime-cli.sh` should be migrated to import the Node implementation once the caller itself becomes Node-based

## Patch Set 3: Migrate runtime entrypoints

Target files:

- `.claude/scripts/moonshot-phase-dispatch.sh`
- `.claude/scripts/agent-loop.sh`
- `.claude/scripts/agent-loop-phase-runtime.sh`
- `.claude/scripts/agent-loop-phase-plan.sh`
- `.claude/scripts/agent-loop-phase-artifacts.sh`
- `.claude/scripts/agent-loop-phase-state.sh`

### Proposed restructuring

Create:

- `.claude/scripts/moonshot-phase-dispatch.mjs`
- `.claude/scripts/agent-loop.mjs`
- `.claude/scripts/lib/phase-runtime.mjs`
- `.claude/scripts/lib/phase-plan.mjs`
- `.claude/scripts/lib/phase-artifacts.mjs`
- `.claude/scripts/lib/phase-state.mjs`

### Notes

- do not preserve the shell `source` topology in Node
- instead, convert each sourced shell segment into an imported Node module with explicit function exports
- remove embedded Python blocks by moving those responsibilities into local JS helpers where practical

Implementation status:

- complete for `runtime-cli.mjs` and `moonshot-phase-dispatch.mjs`
- public `agent-loop` entry is migrated
- helper modules for plan/runtime/state/artifacts exist as `.mjs`
- `agent-loop-phase-plan-lib.mjs` and `agent-loop-phase-runner.mjs` now cover the primary single-phase execution path

Current runtime split:

- `agent-loop.mjs`: loop orchestration, stale guard, summary/reporting, explicit phase selection
- `agent-loop-phase-plan-lib.mjs`: artifact path calculation, artifact seeding, and phase prompt rendering
- `agent-loop-phase-attempt.mjs`: retry/advance/stop decisioning and remediation prompt generation
- `agent-loop-phase-runner.mjs`: primary single-phase worker execution, watchdog/retry flow, and completion aftermath
- `agent-loop-shell-core.sh`: legacy compatibility bridge only

Next patch inside this set:

- review whether the legacy shell core can be retained as a compatibility-only bridge without further migration work
- focus follow-up work on install-layer posture and Windows-native execution validation

## Patch Set 4: Migrate verification core

Target files:

- `.claude/scripts/verify-phase-runtime-parity.sh`
- `.claude/scripts/workflow-enforcement.sh`

New files:

- `.claude/scripts/verify-phase-runtime-parity.mjs`
- `.claude/scripts/workflow-enforcement.mjs`

### Specific replacements

Replace shell patterns:

- `mktemp -d` -> `fs.mkdtemp`
- `shasum` -> `crypto.createHash`
- `find ... -newer` -> `fs.stat` + filtered directory walk
- `tar | tar` workspace copies -> `fs.cp` or explicit recursive copy
- `grep` assertions -> JS string/file assertions
- `python3` here-doc JSON checks -> in-process JS validation

### Runtime parity specifics

Preserve:

- target runtime selection
- stale worker cleanup
- render matrix output
- smoke fixture creation
- allowed git change assertions

Status:

- `workflow-enforcement.mjs` implemented
- `workflow-enforcement.sh` reduced to a Node wrapper
- `verify-phase-runtime-parity.mjs` implemented as the public Node entry with shell-core split
- `verify-phase-runtime-parity.sh` reduced to a Node wrapper
- record-dispatch, record-bounded, verify, and parity render-only smoke paths checked through the Node entry

## Patch Set 5: Migrate audit and policy tooling

Target files:

- `.claude/scripts/knowledge-repo-audit.sh`

New file:

- `.claude/scripts/knowledge-repo-audit.mjs`

### Specific replacements

- `find` loops -> recursive directory walk
- `grep`/`sed`/`awk` parsing -> JS regex and line iterators
- temp file processing -> in-memory collections unless a temp file is required
- JSON report writing remains identical in path and schema

Status:

- `knowledge-repo-audit.mjs` implemented
- `knowledge-repo-audit.sh` reduced to a Node wrapper
- current verdict parity confirmed for the known always-loaded token-budget failure

## Patch Set 6: Wrapper simplification

After the primary Node modules exist:

- reduce `.sh` files to minimal wrappers
- update docs and skills to reference Node-first commands
- keep wrapper scripts only for compatibility with existing automation or downstream repos

Example wrapper pattern:

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/agent-loop.mjs" "$@"
```

Install-layer status:

- `install-browser-runtime.mjs` now owns browserctl installer behavior
- `install-browser-runtime.sh` is reduced to a Node wrapper
- POSIX keeps best-effort PATH helper/profile sourcing
- Windows native uses generated `.cmd` / `.ps1` launchers and avoids automatic profile or registry mutation
- `windows-native-validation.mjs` now provides a cross-platform smoke harness for Windows-host verification
- `windows-native-validation.ps1` is the primary PowerShell entrypoint for a real Windows validation pass

## Compatibility Risks

### YAML mutation drift

Risk:

- shell and Python code currently mutate status files in very targeted ways

Mitigation:

- snapshot fixture files before each migration patch
- compare resulting artifacts for format and semantic parity

### Process tree control on Windows

Risk:

- signal and child-process behavior differs from POSIX

Mitigation:

- centralize termination logic in `process-utils.mjs`
- validate with a Windows-native smoke path before deprecating shell implementations

### Wrapper/document skew

Risk:

- docs may continue advertising shell-first usage after Node becomes primary

Mitigation:

- update task, skill, and guideline docs in the same phase that introduces the Node entrypoints
